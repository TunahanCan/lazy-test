package protocols

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestReadSSEParsesEventsAndHeaders(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if got := request.Header.Get("X-Validex-Test"); got != "enabled" {
			http.Error(writer, "missing test header", http.StatusBadRequest)
			return
		}
		writer.Header().Set("Content-Type", "text/event-stream")
		writer.Header().Set("X-Stream", "ready")
		_, _ = fmt.Fprint(
			writer,
			"\uFEFF: connected\n"+
				"id: event-42\n"+
				"event: inventory\n"+
				"retry: 1500\n"+
				"data: first line\n"+
				"data: second line\n\n"+
				"id:\n"+
				"data: done\n\n",
		)
	}))
	t.Cleanup(server.Close)

	result, err := ReadSSE(context.Background(), SSERequest{
		URL:       server.URL,
		Headers:   map[string]string{"X-Validex-Test": "enabled"},
		Timeout:   time.Second,
		MaxEvents: 5,
	})
	if err != nil {
		t.Fatalf("ReadSSE returned an error: %v", err)
	}
	if result.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", result.StatusCode, http.StatusOK)
	}
	if got := result.Headers.Get("X-Stream"); got != "ready" {
		t.Fatalf("response header = %q, want ready", got)
	}
	if len(result.Events) != 2 {
		t.Fatalf("events = %d, want 2", len(result.Events))
	}
	first := result.Events[0]
	if first.Event != "inventory" || first.ID != "event-42" {
		t.Fatalf("first event metadata = %#v", first)
	}
	if first.Data != "first line\nsecond line" {
		t.Fatalf("first data = %q", first.Data)
	}
	if !first.HasRetry || first.RetryMillis != 1500 {
		t.Fatalf("first retry = (%v, %d), want (true, 1500)", first.HasRetry, first.RetryMillis)
	}
	second := result.Events[1]
	if second.Event != "message" || second.ID != "" || second.Data != "done" {
		t.Fatalf("second event = %#v", second)
	}
}

func TestReadSSEStopsAtMaxEvents(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(writer, "data: one\n\ndata: two\n\ndata: three\n\n")
	}))
	t.Cleanup(server.Close)

	result, err := ReadSSE(context.Background(), SSERequest{
		URL:       server.URL,
		MaxEvents: 2,
		Timeout:   time.Second,
	})
	if err != nil {
		t.Fatalf("ReadSSE returned an error: %v", err)
	}
	if len(result.Events) != 2 {
		t.Fatalf("events = %d, want 2", len(result.Events))
	}
}

func TestReadSSEOverTLS(t *testing.T) {
	t.Parallel()

	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(writer, "data: secure\n\n")
	}))
	t.Cleanup(server.Close)

	result, err := ReadSSE(context.Background(), SSERequest{
		URL:                server.URL,
		Timeout:            time.Second,
		MaxEvents:          1,
		InsecureSkipVerify: true,
	})
	if err != nil {
		t.Fatalf("ReadSSE returned an error: %v", err)
	}
	if len(result.Events) != 1 || result.Events[0].Data != "secure" {
		t.Fatalf("events = %#v, want one secure event", result.Events)
	}
}

func TestReadSSERejectsOversizedEvent(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(writer, "data: this-is-too-large\n\n")
	}))
	t.Cleanup(server.Close)

	_, err := ReadSSE(context.Background(), SSERequest{
		URL:              server.URL,
		Timeout:          time.Second,
		MaxResponseBytes: 128,
		MaxEventBytes:    8,
	})
	if !errors.Is(err, ErrLimitExceeded) {
		t.Fatalf("error = %v, want ErrLimitExceeded", err)
	}
}

func TestReadSSEReportsHTTPStatus(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		http.Error(writer, "not available", http.StatusServiceUnavailable)
	}))
	t.Cleanup(server.Close)

	_, err := ReadSSE(context.Background(), SSERequest{
		URL:     server.URL,
		Timeout: time.Second,
	})
	var statusError *HTTPStatusError
	if !errors.As(err, &statusError) {
		t.Fatalf("error = %v, want *HTTPStatusError", err)
	}
	if statusError.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status code = %d, want %d", statusError.StatusCode, http.StatusServiceUnavailable)
	}
	if statusError.Body != "not available" {
		t.Fatalf("body = %q, want not available", statusError.Body)
	}
}

func TestReadSSEHonorsContextCancellation(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "text/event-stream")
		writer.WriteHeader(http.StatusOK)
		if flusher, ok := writer.(http.Flusher); ok {
			flusher.Flush()
		}
		<-request.Context().Done()
	}))
	t.Cleanup(server.Close)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := ReadSSE(ctx, SSERequest{
		URL:     server.URL,
		Timeout: time.Second,
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
}

func TestReadSSEAllowsSameOriginRedirect(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/redirect" {
			http.Redirect(writer, request, "/events", http.StatusTemporaryRedirect)
			return
		}
		writer.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(writer, "data: redirected\n\n")
	}))
	t.Cleanup(server.Close)

	result, err := ReadSSE(context.Background(), SSERequest{
		URL:       server.URL + "/redirect",
		Timeout:   time.Second,
		MaxEvents: 1,
	})
	if err != nil {
		t.Fatalf("ReadSSE returned an error: %v", err)
	}
	if len(result.Events) != 1 || result.Events[0].Data != "redirected" {
		t.Fatalf("events = %#v, want redirected event", result.Events)
	}
}

func TestReadSSEBlocksCrossOriginRedirect(t *testing.T) {
	t.Parallel()

	var targetReached atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		targetReached.Store(true)
		writer.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(writer, "data: should-not-be-read\n\n")
	}))
	t.Cleanup(target.Close)
	redirector := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		http.Redirect(writer, request, target.URL, http.StatusTemporaryRedirect)
	}))
	t.Cleanup(redirector.Close)

	_, err := ReadSSE(context.Background(), SSERequest{
		URL:     redirector.URL,
		Timeout: time.Second,
	})
	if err == nil || !strings.Contains(err.Error(), "same scheme and host") {
		t.Fatalf("error = %v, want same-origin redirect rejection", err)
	}
	if targetReached.Load() {
		t.Fatal("cross-origin SSE redirect reached its target")
	}
}

func TestReadSSEStopsAtRedirectLimit(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		step := 0
		_, _ = fmt.Sscanf(request.URL.Path, "/%d", &step)
		http.Redirect(
			writer,
			request,
			fmt.Sprintf("/%d", step+1),
			http.StatusTemporaryRedirect,
		)
	}))
	t.Cleanup(server.Close)

	_, err := ReadSSE(context.Background(), SSERequest{
		URL:     server.URL + "/0",
		Timeout: time.Second,
	})
	if err == nil || !strings.Contains(err.Error(), "redirect limit exceeded") {
		t.Fatalf("error = %v, want redirect limit rejection", err)
	}
}

func TestReadSSEValidatesInput(t *testing.T) {
	t.Parallel()

	for name, input := range map[string]SSERequest{
		"missing URL":        {},
		"unsupported scheme": {URL: "ftp://example.test/events"},
		"header injection": {
			URL:     "https://example.test/events",
			Headers: map[string]string{"X-Test": "valid\r\nInjected: yes"},
		},
		"invalid event limit": {
			URL:       "https://example.test/events",
			MaxEvents: -1,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := ReadSSE(context.Background(), input); !errors.Is(
				err,
				ErrInvalidRequest,
			) {
				t.Fatalf(
					"ReadSSE error = %v, want ErrInvalidRequest",
					err,
				)
			}
		})
	}
}
