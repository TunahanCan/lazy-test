package canbridge

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/http/httptrace"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestResolveVariablesReportsMissingKeys(t *testing.T) {
	got, missing := resolveVariables("{{baseUrl}}/users/{{id}}", map[string]string{"baseUrl": "https://example.test"})
	if got != "https://example.test/users/{{id}}" {
		t.Fatalf("unexpected resolved value: %s", got)
	}
	if len(missing) != 1 || missing[0] != "id" {
		t.Fatalf("unexpected missing keys: %#v", missing)
	}
}

func TestResolveVariablesTreatsMaskedValuesAsMissing(t *testing.T) {
	_, missing := resolveVariables("Bearer {{token}}", map[string]string{
		"token": "••••••••••••",
	})
	if len(missing) != 1 || missing[0] != "token" {
		t.Fatalf("expected masked token to be missing, got %#v", missing)
	}
}

func TestBootstrapLocalEnvironmentDoesNotSeedToken(t *testing.T) {
	bootstrap := NewBridge().Bootstrap()
	for _, environment := range bootstrap.Environments {
		if environment.ID != "local" {
			continue
		}
		if _, exists := environment.Variables["token"]; exists {
			t.Fatal("local environment must not seed an implicit token variable")
		}
		if environment.Variables["baseUrl"] != "http://localhost:8080" {
			t.Fatalf("unexpected local baseUrl: %q", environment.Variables["baseUrl"])
		}
		return
	}
	t.Fatal("local environment not found")
}

func TestSendRequestAcceptsResolvedExplicitHTTPURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID: "explicit-url", Method: http.MethodGet, URL: "{{baseUrl}}/health",
		Variables: map[string]string{"baseUrl": server.URL}, TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
	if result.Response == nil || result.Response.StatusCode != http.StatusNoContent {
		t.Fatalf("unexpected response: %#v", result.Response)
	}
}

func TestSendRequestRejectsURLsThatHTTPWouldSilentlyChange(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	tests := map[string]struct {
		requestURL string
		variables  map[string]string
	}{
		"schemeless": {
			requestURL: "{{baseUrl}}/health",
			variables:  map[string]string{"baseUrl": strings.TrimPrefix(server.URL, "http://")},
		},
		"network path":      {requestURL: strings.TrimPrefix(server.URL, "http:") + "/health"},
		"unsupported":       {requestURL: strings.Replace(server.URL, "http://", "ftp://", 1) + "/health"},
		"userinfo":          {requestURL: strings.Replace(server.URL, "http://", "http://user:secret@", 1) + "/health"},
		"fragment":          {requestURL: server.URL + "/health#response"},
		"empty fragment":    {requestURL: server.URL + "/health#"},
		"surrounding space": {requestURL: " " + server.URL + "/health"},
	}
	for name, testCase := range tests {
		t.Run(name, func(t *testing.T) {
			result := NewBridge().SendRequest(RequestInput{
				ID:        "invalid-" + strings.ReplaceAll(name, " ", "-"),
				Method:    http.MethodGet,
				URL:       testCase.requestURL,
				Variables: testCase.variables,
				TimeoutMS: 250,
			})
			if result.Error == nil || result.Error.Code != "invalid_request" {
				t.Fatalf("expected invalid_request, got %#v", result.Error)
			}
		})
	}
	if got := requests.Load(); got != 0 {
		t.Fatalf("invalid URLs reached the server %d times", got)
	}
}

func TestSendRequestPreservesRawQueryExactly(t *testing.T) {
	requestURI := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		requestURI <- request.RequestURI
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	const suffix = "/search?b=2&a=first&a=two%20words&slash=%2F%2f&empty="
	result := NewBridge().SendRequest(RequestInput{
		ID:        "raw-query",
		Method:    http.MethodGet,
		URL:       server.URL + suffix,
		TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
	if got := <-requestURI; got != suffix {
		t.Fatalf("RequestURI = %q, want exact %q", got, suffix)
	}
	if result.Response == nil || result.Response.ResolvedURL != server.URL+suffix {
		t.Fatalf("resolved URL was changed: %#v", result.Response)
	}
}

func TestSendRequestDoesNotAddOptionalHeaders(t *testing.T) {
	observed := make(chan http.Header, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		observed <- request.Header.Clone()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID:        "no-implicit-headers",
		Method:    http.MethodGet,
		URL:       server.URL,
		TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
	headers := <-observed
	for _, name := range []string{"User-Agent", "Accept-Encoding", "Authorization"} {
		if got := headers.Get(name); got != "" {
			t.Errorf("%s was added implicitly: %q", name, got)
		}
	}
}

func TestSendRequestPreservesExplicitEnabledHeaders(t *testing.T) {
	observed := make(chan http.Header, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		observed <- request.Header.Clone()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID:     "explicit-headers",
		Method: http.MethodGet,
		URL:    server.URL,
		Headers: []KeyValue{
			{Enabled: true, Key: "User-Agent", Value: "Validex-Test/1.0"},
			{Enabled: true, Key: "Accept-Encoding", Value: "br"},
			{Enabled: true, Key: "Authorization", Value: "Bearer explicit"},
			{Enabled: true, Key: "X-Enabled", Value: "yes"},
			{Enabled: false, Key: "X-Disabled", Value: "no"},
		},
		TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
	headers := <-observed
	for name, want := range map[string]string{
		"User-Agent":      "Validex-Test/1.0",
		"Accept-Encoding": "br",
		"Authorization":   "Bearer explicit",
		"X-Enabled":       "yes",
	} {
		if got := headers.Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
	if got := headers.Get("X-Disabled"); got != "" {
		t.Errorf("disabled header was sent: %q", got)
	}
}

func TestSendRequestReturnsRichResponse(t *testing.T) {
	bridge := NewBridge()
	httpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Values("X-Debug"); len(got) != 2 {
			t.Fatalf("expected repeated header, got %#v", got)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Trace-ID", "trace-test")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer httpServer.Close()

	result := bridge.SendRequest(RequestInput{
		ID: "request-1", Method: http.MethodGet, URL: "{{baseUrl}}/users",
		Variables: map[string]string{"baseUrl": httpServer.URL},
		Headers: []KeyValue{
			{Enabled: true, Key: "X-Debug", Value: "one"},
			{Enabled: true, Key: "X-Debug", Value: "two"},
		},
		TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
	if result.Response == nil || result.Response.StatusCode != http.StatusCreated {
		t.Fatalf("unexpected response: %#v", result.Response)
	}
	if result.Response.TraceID != "trace-test" {
		t.Fatalf("unexpected trace id: %s", result.Response.TraceID)
	}
	if len(result.Response.Timeline) == 0 {
		t.Fatal("expected timeline")
	}
}

func TestSendRequestExtractsValidTraceparentTraceIDAndFallsBack(t *testing.T) {
	t.Parallel()

	const validTraceID = "4bf92f3577b34da6a3ce929d0e0e4736"
	tests := map[string]struct {
		traceparent string
		fallback    string
		want        string
	}{
		"valid traceparent": {
			traceparent: "00-" + validTraceID + "-00f067aa0ba902b7-01",
			fallback:    "fallback-ignored",
			want:        validTraceID,
		},
		"invalid traceparent": {
			traceparent: "00-not-a-trace-id-00f067aa0ba902b7-01",
			fallback:    "fallback-trace",
			want:        "fallback-trace",
		},
	}
	for name, testCase := range tests {
		testCase := testCase
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
				response.Header().Set("traceparent", testCase.traceparent)
				response.Header().Set("X-Trace-ID", testCase.fallback)
				response.WriteHeader(http.StatusNoContent)
			}))
			t.Cleanup(server.Close)

			result := NewBridge().SendRequest(RequestInput{
				ID:        "trace-" + strings.ReplaceAll(name, " ", "-"),
				Method:    http.MethodGet,
				URL:       server.URL,
				TimeoutMS: 2_000,
			})
			if result.Error != nil || result.Response == nil {
				t.Fatalf("SendRequest() = %#v", result)
			}
			if result.Response.TraceID != testCase.want {
				t.Fatalf("TraceID = %q, want %q", result.Response.TraceID, testCase.want)
			}
		})
	}
}

func TestTraceIDFromTraceparentValidation(t *testing.T) {
	t.Parallel()

	const traceID = "4bf92f3577b34da6a3ce929d0e0e4736"
	tests := map[string]struct {
		value string
		want  string
	}{
		"valid": {
			value: "00-" + traceID + "-00f067aa0ba902b7-01",
			want:  traceID,
		},
		"trimmed": {
			value: " 00-" + traceID + "-00f067aa0ba902b7-01 ",
			want:  traceID,
		},
		"zero trace ID": {
			value: "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
		},
		"zero parent ID": {
			value: "00-" + traceID + "-0000000000000000-01",
		},
		"forbidden version": {
			value: "ff-" + traceID + "-00f067aa0ba902b7-01",
		},
		"uppercase": {
			value: "00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01",
		},
		"extra field": {
			value: "00-" + traceID + "-00f067aa0ba902b7-01-extra",
		},
		"whole header is not a trace ID": {
			value: "not-a-traceparent",
		},
	}
	for name, testCase := range tests {
		if got := traceIDFromTraceparent(testCase.value); got != testCase.want {
			t.Errorf("%s: traceIDFromTraceparent() = %q, want %q", name, got, testCase.want)
		}
	}
}

func TestRequestTraceUsesLockedSnapshotDuringConcurrentCallbacks(t *testing.T) {
	t.Parallel()

	clientConnection, serverConnection := net.Pipe()
	defer clientConnection.Close()
	defer serverConnection.Close()
	trace := &requestTrace{start: time.Now()}
	callbacks := trace.clientTrace()
	const iterations = 250

	var waitGroup sync.WaitGroup
	waitGroup.Add(4)
	go func() {
		defer waitGroup.Done()
		for range iterations {
			callbacks.DNSStart(httptrace.DNSStartInfo{})
			callbacks.DNSDone(httptrace.DNSDoneInfo{})
		}
	}()
	go func() {
		defer waitGroup.Done()
		for range iterations {
			callbacks.ConnectStart("tcp", "localhost:8080")
			callbacks.ConnectDone("tcp", "localhost:8080", nil)
		}
	}()
	go func() {
		defer waitGroup.Done()
		for range iterations {
			callbacks.GotConn(httptrace.GotConnInfo{Conn: clientConnection})
			callbacks.WroteRequest(httptrace.WroteRequestInfo{})
			callbacks.GotFirstResponseByte()
		}
	}()
	go func() {
		defer waitGroup.Done()
		for range iterations {
			snapshot := trace.snapshot()
			_ = snapshot.timeline(time.Now())
			_ = snapshot.remoteAddr
		}
	}()
	waitGroup.Wait()

	snapshot := trace.snapshot()
	if snapshot.remoteAddr == "" {
		t.Fatal("snapshot did not capture the remote address")
	}
	if len(snapshot.timeline(time.Now())) == 0 {
		t.Fatal("snapshot did not produce a timeline")
	}
}

func TestSendRequestRejectsDeclaredOversizedResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Length", strconv.FormatInt(maxHTTPResponseBodyBytes+1, 10))
		response.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID: "oversized", Method: http.MethodGet, URL: server.URL, TimeoutMS: 2_000,
	})
	if result.Response != nil {
		t.Fatalf("oversized request returned a response: %#v", result.Response)
	}
	if result.Error == nil || result.Error.Code != "response_too_large" {
		t.Fatalf("expected response_too_large, got %#v", result.Error)
	}
	if !strings.Contains(result.Error.Message, "16 MiB") || result.Error.Technical != "" {
		t.Fatalf("unexpected oversized response error: %#v", result.Error)
	}
}

func TestReadHTTPResponseBodyDetectsUndeclaredOverflow(t *testing.T) {
	raw, tooLarge, err := readHTTPResponseBody(strings.NewReader("12345"), 4)
	if err != nil {
		t.Fatalf("readHTTPResponseBody() error = %v", err)
	}
	if raw != nil || !tooLarge {
		t.Fatalf("readHTTPResponseBody() = %q, %v; want nil, true", raw, tooLarge)
	}
}

func TestSendRequestIncludesDeleteBody(t *testing.T) {
	var received string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Fatal(err)
		}
		received = string(body)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID: "delete-body", Method: http.MethodDelete, URL: server.URL,
		Body: `{"force":true}`, TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
	if received != `{"force":true}` {
		t.Fatalf("unexpected delete body: %q", received)
	}
}

func TestCancelUnknownRequest(t *testing.T) {
	bridge := NewBridge()
	if bridge.CancelRequest("missing") {
		t.Fatal("unknown request should not be canceled")
	}
	Startup(bridge)(context.Background())
	Shutdown(bridge)(context.Background())
}

func TestConcurrentDuplicateRequestIDCannotReplaceOriginalCancel(t *testing.T) {
	var hits atomic.Int32
	started := make(chan struct{})
	var startedOnce sync.Once
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		hits.Add(1)
		if request.URL.Query().Get("fast") == "1" {
			response.WriteHeader(http.StatusNoContent)
			return
		}
		startedOnce.Do(func() { close(started) })
		<-request.Context().Done()
	}))
	defer server.Close()

	bridge := NewBridge()
	defer Shutdown(bridge)(context.Background())
	firstResult := make(chan SendResult, 1)
	go func() {
		firstResult <- bridge.SendRequest(RequestInput{
			ID:        "shared-request-id",
			Method:    http.MethodGet,
			URL:       server.URL,
			TimeoutMS: 10_000,
		})
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("first request did not reach server")
	}

	duplicate := bridge.SendRequest(RequestInput{
		ID:        "shared-request-id",
		Method:    http.MethodGet,
		URL:       server.URL + "?fast=1",
		TimeoutMS: 2_000,
	})
	if duplicate.Error == nil || duplicate.Error.Code != "request_already_running" {
		t.Fatalf("duplicate result = %#v, want request_already_running", duplicate)
	}
	if hits.Load() != 1 {
		t.Fatalf("server hits = %d, duplicate request reached the network", hits.Load())
	}
	if !bridge.CancelRequest("shared-request-id") {
		t.Fatal("duplicate request replaced or removed the original cancel entry")
	}
	select {
	case result := <-firstResult:
		if result.Error == nil || result.Error.Code != "request_canceled" {
			t.Fatalf("first request result = %#v, want request_canceled", result)
		}
	case <-time.After(time.Second):
		t.Fatal("original request did not stop")
	}
	if bridge.CancelRequest("shared-request-id") {
		t.Fatal("completed request remained registered")
	}

	reused := bridge.SendRequest(RequestInput{
		ID:        "shared-request-id",
		Method:    http.MethodGet,
		URL:       server.URL + "?fast=1",
		TimeoutMS: 2_000,
	})
	if reused.Error != nil || reused.Response == nil ||
		reused.Response.StatusCode != http.StatusNoContent {
		t.Fatalf("completed request ID could not be reused: %#v", reused)
	}
}

func TestSendRequestTimeoutIsUserFriendly(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID: "slow", Method: http.MethodGet, URL: server.URL, TimeoutMS: 5,
	})
	if result.Error == nil || result.Error.Code != "request_timeout" {
		t.Fatalf("expected timeout error, got %#v", result.Error)
	}
}

func TestShutdownCancelsInFlightSendRequest(t *testing.T) {
	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		close(started)
		<-request.Context().Done()
	}))
	defer server.Close()

	bridge := NewBridge()
	resultChannel := make(chan SendResult, 1)
	go func() {
		resultChannel <- bridge.SendRequest(RequestInput{
			ID: "shutdown-cancel", Method: http.MethodGet, URL: server.URL, TimeoutMS: 10_000,
		})
	}()

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("request did not reach server")
	}
	Shutdown(bridge)(context.Background())

	select {
	case result := <-resultChannel:
		if result.Error == nil || result.Error.Code != "request_canceled" {
			t.Fatalf("expected request_canceled, got %#v", result.Error)
		}
	case <-time.After(time.Second):
		t.Fatal("SendRequest did not stop after bridge shutdown")
	}
}
