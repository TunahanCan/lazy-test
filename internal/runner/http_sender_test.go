package runner

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"validex/internal/assertions"
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
		Method:            http.MethodPost,
		URL:               server.URL + "/items",
		Headers:           http.Header{"X-Token": {"secret"}},
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
	if injected.closeIdleConnections != nil {
		t.Fatal("sender must not take ownership of an injected client")
	}
	injected.CloseIdleConnections()
	(*HTTPSender)(nil).CloseIdleConnections()
}
