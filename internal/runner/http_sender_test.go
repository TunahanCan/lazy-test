package runner

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"validex/internal/assertions"
	"validex/internal/httpexec"
)

func TestHTTPSenderSendsRequestAndCapturesBoundedResponse(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		body, err := io.ReadAll(request.Body)
		if err != nil {
			http.Error(response, err.Error(), http.StatusInternalServerError)
			return
		}
		if request.Method != http.MethodPost ||
			request.URL.Path != "/items" ||
			request.Header.Get("X-Token") != "secret" ||
			string(body) != `{"name":"Ada"}` {
			http.Error(response, "unexpected request", http.StatusBadRequest)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		response.WriteHeader(http.StatusCreated)
		_, _ = response.Write([]byte(`{"id":42}`))
	}))
	defer server.Close()

	result, err := NewHTTPSender(nil).Send(context.Background(), PreparedRequest{
		Method: http.MethodPost,
		URL:    server.URL + "/items",
		Headers: []httpexec.HeaderField{
			{Name: "X-Token", Value: "secret"},
		},
		Body:              []byte(`{"name":"Ada"}`),
		RequestBodyLimit:  1024,
		ResponseBodyLimit: 1024,
	})
	if err != nil {
		t.Fatalf("Send() error = %v", err)
	}
	if result.StatusCode != http.StatusCreated ||
		result.Headers.Get("Content-Type") != "application/json" ||
		string(result.Body) != `{"id":42}` ||
		result.DurationMS < 0 {
		t.Fatalf("Send() response = %#v", result)
	}
}

func TestHTTPSenderUsesBoundedManualContentDecoding(t *testing.T) {
	t.Parallel()
	var encoded bytes.Buffer
	writer := gzip.NewWriter(&encoded)
	if _, err := writer.Write([]byte("decoded response")); err != nil {
		t.Fatalf("write gzip payload: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close gzip payload: %v", err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(
		response http.ResponseWriter,
		request *http.Request,
	) {
		if request.Header.Get("Accept-Encoding") != "" {
			t.Errorf(
				"implicit Accept-Encoding = %q",
				request.Header.Get("Accept-Encoding"),
			)
		}
		response.Header().Set("Content-Encoding", "gzip")
		_, _ = response.Write(encoded.Bytes())
	}))
	defer server.Close()

	sender := NewHTTPSender(nil)
	defer sender.CloseIdleConnections()
	result, err := sender.Send(context.Background(), PreparedRequest{
		Method:            http.MethodGet,
		URL:               server.URL,
		ResponseBodyLimit: 128,
	})
	if err != nil {
		t.Fatalf("Send() error = %v", err)
	}
	if string(result.Body) != "decoded response" ||
		result.Headers.Get("Content-Encoding") != "gzip" {
		t.Fatalf("response = %#v", result)
	}
}

func TestHTTPSenderEnforcesRequestAndDeclaredOrStreamingResponseLimits(t *testing.T) {
	t.Parallel()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		calls.Add(1)
		if request.URL.Path == "/stream" {
			response.(http.Flusher).Flush()
		}
		_, _ = response.Write([]byte("12345"))
	}))
	defer server.Close()
	sender := NewHTTPSender(nil)

	_, err := sender.Send(context.Background(), PreparedRequest{
		Method: http.MethodPost, URL: server.URL, Body: []byte("12345"),
		RequestBodyLimit: 4, ResponseBodyLimit: 4,
	})
	if !errors.Is(err, ErrRequestBodyTooLarge) || calls.Load() != 0 {
		t.Fatalf("request limit error/calls = %v/%d", err, calls.Load())
	}

	for _, path := range []string{"/declared", "/stream"} {
		_, err := sender.Send(context.Background(), PreparedRequest{
			Method: http.MethodGet, URL: server.URL + path, ResponseBodyLimit: 4,
		})
		if !errors.Is(err, ErrResponseBodyTooLarge) {
			t.Fatalf("Send(%s) error = %v, want ErrResponseBodyTooLarge", path, err)
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("server calls = %d, want 2", calls.Load())
	}
}

func TestHTTPSenderEnforcesResponseHeaderLimit(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(
		response http.ResponseWriter,
		_ *http.Request,
	) {
		response.Header().Set("X-Large", strings.Repeat("x", 128))
		response.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	_, err := NewHTTPSender(nil).Send(
		context.Background(),
		PreparedRequest{
			Method:              http.MethodGet,
			URL:                 server.URL,
			ResponseHeaderLimit: 32,
		},
	)
	if !errors.Is(err, ErrResponseHeadersTooLarge) {
		t.Fatalf("Send() error = %v, want ErrResponseHeadersTooLarge", err)
	}
}

func TestRunWithHTTPSenderEndToEnd(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("X-Mode", "test")
		_, _ = response.Write([]byte(`{"ready":true}`))
	}))
	defer server.Close()
	collection := Collection{
		Variables: map[string]string{"baseUrl": server.URL},
		Requests: []Request{{
			ID: "health", Method: "GET", URL: "{{baseUrl}}/health",
			Assertions: []assertions.Assertion{
				{Target: assertions.TargetStatus, Operator: assertions.OperatorEquals, Expected: 200},
				{Target: assertions.TargetHeader, Path: "X-Mode", Operator: assertions.OperatorEquals, Expected: "test"},
				{Target: assertions.TargetJSONPath, Path: "$.ready", Operator: assertions.OperatorEquals, Expected: true},
			},
		}},
	}

	report, err := Run(context.Background(), collection, NewHTTPSender(server.Client()), Options{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if report.Passed != 1 || report.Failed != 0 || !report.Results[0].Passed {
		t.Fatalf("report = %#v", report)
	}
}

func TestHTTPSenderFollowsRedirectsExplicitly(t *testing.T) {
	t.Parallel()
	var targetCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(
		response http.ResponseWriter,
		request *http.Request,
	) {
		if request.URL.Path == "/target" {
			targetCalls.Add(1)
			response.WriteHeader(http.StatusNoContent)
			return
		}
		http.Redirect(response, request, "/target", http.StatusFound)
	}))
	defer server.Close()

	sender := NewHTTPSender(nil)
	defer sender.CloseIdleConnections()
	result, err := sender.Send(context.Background(), PreparedRequest{
		Method: http.MethodGet,
		URL:    server.URL + "/start",
	})
	if err != nil {
		t.Fatalf("Send() error = %v", err)
	}
	if result.StatusCode != http.StatusNoContent || targetCalls.Load() != 1 {
		t.Fatalf(
			"result/target calls = %#v/%d",
			result,
			targetCalls.Load(),
		)
	}
}

func TestRunPreservesOrderedDuplicateAndSpecialHeaders(t *testing.T) {
	t.Parallel()
	type observedRequest struct {
		host     string
		repeated []string
		agent    string
		encoding string
	}
	observed := make(chan observedRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(
		response http.ResponseWriter,
		request *http.Request,
	) {
		observed <- observedRequest{
			host:     request.Host,
			repeated: request.Header.Values("X-Repeated"),
			agent:    request.Header.Get("User-Agent"),
			encoding: request.Header.Get("Accept-Encoding"),
		}
		response.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	sender := NewHTTPSender(nil)
	defer sender.CloseIdleConnections()
	report, err := Run(context.Background(), Collection{
		Version: 2,
		Requests: []Request{{
			Method: http.MethodGet,
			URL:    server.URL,
			Headers: []Header{
				{Enabled: true, Key: "X-Repeated", Value: "first"},
				{Enabled: false, Key: "X-Repeated", Value: "disabled"},
				{Enabled: true, Key: "x-repeated", Value: "second"},
				{Enabled: true, Key: "Host", Value: "api.example.test"},
			},
		}},
	}, sender, Options{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if report.Passed != 1 || report.Failed != 0 {
		t.Fatalf("report = %#v", report)
	}
	request := <-observed
	if request.host != "api.example.test" ||
		len(request.repeated) != 2 ||
		request.repeated[0] != "first" ||
		request.repeated[1] != "second" ||
		request.agent != "" ||
		request.encoding != "" {
		t.Fatalf("observed request = %#v", request)
	}
}

func TestHTTPSenderReturnsContextErrorsForRunnerClassification(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		<-request.Context().Done()
	}))
	defer server.Close()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := NewHTTPSender(server.Client()).Send(ctx, PreparedRequest{
		Method: http.MethodGet, URL: server.URL,
	})
	if err == nil || !strings.Contains(err.Error(), "context canceled") {
		t.Fatalf("Send() error = %v", err)
	}
}

func TestHTTPSenderOwnsOnlyItsDefaultTransport(t *testing.T) {
	t.Parallel()

	owned := NewHTTPSender(nil)
	if owned.closeIdleConnections == nil {
		t.Fatal("default sender must own a close-idle-connections hook")
	}
	owned.CloseIdleConnections()

	injectedClient := &http.Client{}
	injected := NewHTTPSender(injectedClient)
	if injected.client != injectedClient {
		t.Fatal("injected client identity was not preserved")
	}
	if injected.closeIdleConnections == nil {
		t.Fatal("sender must clean up transport clones derived from an injected client")
	}
	injected.CloseIdleConnections()
	(*HTTPSender)(nil).CloseIdleConnections()
}
