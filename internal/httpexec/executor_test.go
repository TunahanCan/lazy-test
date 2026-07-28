package httpexec

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
)

func TestExecutorPreservesRepeatedHeadersAndSpecialHost(t *testing.T) {
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

	executor := NewExecutor(ExecutorConfig{})
	defer executor.CloseIdleConnections()
	result, err := executor.Execute(context.Background(), Request{
		Method: http.MethodGet,
		URL:    server.URL,
		Headers: []HeaderField{
			{Name: "X-Repeated", Value: "first"},
			{Name: "x-repeated", Value: "second"},
			{Name: "Host", Value: "api.example.test"},
		},
	}, Options{
		RedirectPolicy:       StopAtFirstResponse,
		SuppressDefaultAgent: true,
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if result.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d", result.StatusCode)
	}
	request := <-observed
	if request.host != "api.example.test" {
		t.Fatalf("Host = %q", request.host)
	}
	if len(request.repeated) != 2 ||
		request.repeated[0] != "first" ||
		request.repeated[1] != "second" {
		t.Fatalf("X-Repeated = %#v", request.repeated)
	}
	if request.agent != "" || request.encoding != "" {
		t.Fatalf(
			"implicit headers = User-Agent %q, Accept-Encoding %q",
			request.agent,
			request.encoding,
		)
	}
}

func TestExecutorAppliesExplicitRedirectPolicies(t *testing.T) {
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

	executor := NewExecutor(ExecutorConfig{})
	defer executor.CloseIdleConnections()
	stopped, err := executor.Execute(context.Background(), Request{
		Method: http.MethodGet,
		URL:    server.URL + "/start",
	}, Options{RedirectPolicy: StopAtFirstResponse})
	if err != nil {
		t.Fatalf("stop Execute() error = %v", err)
	}
	if stopped.StatusCode != http.StatusFound || targetCalls.Load() != 0 {
		t.Fatalf(
			"stop result/calls = %d/%d",
			stopped.StatusCode,
			targetCalls.Load(),
		)
	}

	followed, err := executor.Execute(context.Background(), Request{
		Method: http.MethodGet,
		URL:    server.URL + "/start",
	}, Options{RedirectPolicy: FollowRedirects})
	if err != nil {
		t.Fatalf("follow Execute() error = %v", err)
	}
	if followed.StatusCode != http.StatusNoContent || targetCalls.Load() != 1 {
		t.Fatalf(
			"follow result/calls = %d/%d",
			followed.StatusCode,
			targetCalls.Load(),
		)
	}
}

func TestExecutorDecodesResponsesAndClassifiesEncodingFailures(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		status     int
		encoding   string
		body       []byte
		limit      int64
		wantBody   string
		wantError  error
		wantFailed string
	}{
		{
			name:     "gzip",
			status:   http.StatusOK,
			encoding: "gzip",
			body:     gzipPayload(t, []byte("decoded")),
			limit:    128,
			wantBody: "decoded",
		},
		{
			name:       "unsupported",
			status:     http.StatusOK,
			encoding:   "br",
			body:       []byte("encoded"),
			limit:      128,
			wantError:  ErrUnsupportedContentEncoding,
			wantFailed: "br",
		},
		{
			name:       "malformed",
			status:     http.StatusOK,
			encoding:   "gzip",
			body:       []byte("not-gzip"),
			limit:      128,
			wantError:  ErrResponseDecodeFailed,
			wantFailed: "gzip",
		},
		{
			name:      "decoded limit",
			status:    http.StatusOK,
			encoding:  "gzip",
			body:      gzipPayload(t, bytes.Repeat([]byte("x"), 128)),
			limit:     32,
			wantError: ErrResponseBodyTooLarge,
		},
		{
			name:     "bodyless ignores encoding",
			status:   http.StatusNoContent,
			encoding: "br",
			body:     nil,
			limit:    32,
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			server := httptest.NewServer(http.HandlerFunc(func(
				response http.ResponseWriter,
				_ *http.Request,
			) {
				response.Header().Set("Content-Encoding", test.encoding)
				response.WriteHeader(test.status)
				_, _ = response.Write(test.body)
			}))
			defer server.Close()
			executor := NewExecutor(ExecutorConfig{})
			defer executor.CloseIdleConnections()
			result, err := executor.Execute(context.Background(), Request{
				Method: http.MethodGet,
				URL:    server.URL,
			}, Options{ResponseBodyLimit: test.limit})
			if !errors.Is(err, test.wantError) {
				t.Fatalf("Execute() error = %v, want %v", err, test.wantError)
			}
			if test.wantError == nil && string(result.Body) != test.wantBody {
				t.Fatalf("body = %q, want %q", result.Body, test.wantBody)
			}
			if test.wantFailed != "" {
				var encodingError *ContentEncodingError
				if !errors.As(err, &encodingError) ||
					encodingError.Encoding != test.wantFailed {
					t.Fatalf("encoding error = %#v", encodingError)
				}
			}
		})
	}
}

func TestExecutorRejectsInvalidFramingBeforeNetwork(t *testing.T) {
	t.Parallel()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(
		response http.ResponseWriter,
		_ *http.Request,
	) {
		calls.Add(1)
		response.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	executor := NewExecutor(ExecutorConfig{})
	defer executor.CloseIdleConnections()

	_, err := executor.Execute(context.Background(), Request{
		Method: http.MethodPost,
		URL:    server.URL,
		Body:   []byte("body"),
		Headers: []HeaderField{
			{Name: "Content-Length", Value: "3"},
		},
	}, Options{})
	var headerError *HeaderError
	if !errors.Is(err, ErrInvalidRequest) ||
		!errors.As(err, &headerError) ||
		headerError.Reason != HeaderContentLengthMismatch {
		t.Fatalf("framing error = %v / %#v", err, headerError)
	}
	_, err = executor.Execute(context.Background(), Request{
		Method: http.MethodGet,
		URL:    server.URL,
		Headers: []HeaderField{
			{Name: "X-Control", Value: "unsafe\x00value"},
		},
	}, Options{})
	headerError = nil
	if !errors.Is(err, ErrInvalidRequest) ||
		!errors.As(err, &headerError) ||
		headerError.Reason != HeaderValueInvalid {
		t.Fatalf("header value error = %v / %#v", err, headerError)
	}
	if calls.Load() != 0 {
		t.Fatalf("invalid request reached server %d times", calls.Load())
	}
}

func TestExecutorBoundsStreamingBodyAndHonorsCancellation(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(
		response http.ResponseWriter,
		request *http.Request,
	) {
		if request.URL.Path == "/wait" {
			<-request.Context().Done()
			return
		}
		response.(http.Flusher).Flush()
		_, _ = io.WriteString(response, "12345")
	}))
	defer server.Close()
	executor := NewExecutor(ExecutorConfig{})
	defer executor.CloseIdleConnections()

	_, err := executor.Execute(context.Background(), Request{
		Method: http.MethodGet,
		URL:    server.URL + "/stream",
	}, Options{ResponseBodyLimit: 4})
	if !errors.Is(err, ErrResponseBodyTooLarge) {
		t.Fatalf("streaming limit error = %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = executor.Execute(ctx, Request{
		Method: http.MethodGet,
		URL:    server.URL + "/wait",
	}, Options{})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation error = %v", err)
	}
}

func TestDecodeContentEncodingHonorsContextCancellation(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := decodeContentEncodedBody(
		ctx,
		gzipPayload(t, []byte("response")),
		[]string{"gzip"},
		128,
	)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("decode error = %v", err)
	}
	wrapped := &ContentEncodingError{
		Encoding: "gzip",
		Kind:     ErrResponseDecodeFailed,
		Err:      context.Canceled,
	}
	if !errors.Is(wrapped, ErrResponseDecodeFailed) ||
		!errors.Is(wrapped, context.Canceled) {
		t.Fatalf("encoding error did not retain kind and cause: %v", wrapped)
	}
}

func TestValidHostHeaderValueAcceptsCommonAuthorities(t *testing.T) {
	t.Parallel()
	for _, host := range []string{
		"api.example.test",
		"api.example.test:8443",
		"127.0.0.1:8080",
		"[::1]",
		"[2001:db8::1]:443",
		"[fe80::1%en0]:8080",
	} {
		if !ValidHostHeaderValue(host) {
			t.Errorf("ValidHostHeaderValue(%q) = false", host)
		}
	}
	for _, host := range []string{
		"",
		" api.example.test",
		"api.example.test/path",
		"api.example.test\r\nX-Test: yes",
	} {
		if ValidHostHeaderValue(host) {
			t.Errorf("ValidHostHeaderValue(%q) = true", host)
		}
	}
}

func gzipPayload(t *testing.T, body []byte) []byte {
	t.Helper()
	var encoded bytes.Buffer
	writer := gzip.NewWriter(&encoded)
	if _, err := writer.Write(body); err != nil {
		t.Fatalf("write gzip payload: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close gzip payload: %v", err)
	}
	return encoded.Bytes()
}

type trackingRoundTripper struct {
	closed atomic.Bool
}

func (transport *trackingRoundTripper) RoundTrip(
	_ *http.Request,
) (*http.Response, error) {
	return nil, errors.New("not implemented")
}

func (transport *trackingRoundTripper) CloseIdleConnections() {
	transport.closed.Store(true)
}

func TestExecutorNeverClosesCallerOwnedCustomTransport(t *testing.T) {
	t.Parallel()
	transport := &trackingRoundTripper{}
	executor := NewExecutor(ExecutorConfig{
		Client: &http.Client{Transport: transport},
	})
	executor.CloseIdleConnections()
	executor.CloseIdleConnections()
	if transport.closed.Load() {
		t.Fatal("caller-owned transport was closed")
	}
}

func TestResponseHeadersExceedUsesBoundedAccounting(t *testing.T) {
	t.Parallel()
	header := http.Header{"X-Test": {strings.Repeat("x", 8)}}
	if ResponseHeadersExceed(header, 64) {
		t.Fatal("small header exceeded generous budget")
	}
	if !ResponseHeadersExceed(header, 4) {
		t.Fatal("header did not exceed small budget")
	}
}
