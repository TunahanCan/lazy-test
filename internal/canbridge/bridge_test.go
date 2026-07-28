package canbridge

import (
	"bufio"
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"context"
	"errors"
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

func TestSendRequestLiteralModePreservesImportedTemplateText(t *testing.T) {
	type observedRequest struct {
		query  string
		header string
		body   string
	}
	observed := make(chan observedRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		observed <- observedRequest{
			query:  request.URL.Query().Get("template"),
			header: request.Header.Get("X-Template"),
			body:   string(body),
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID: "literal-template-text", Method: http.MethodPost,
		URL:           server.URL + "?template={{name}}",
		Body:          `{"template":"{{name}}"}`,
		LiteralValues: true,
		Variables:     map[string]string{"name": "must-not-replace"},
		Headers: []KeyValue{
			{Enabled: true, Key: "X-Template", Value: "{{name}}"},
		},
		TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
	request := <-observed
	if request.query != "{{name}}" ||
		request.header != "{{name}}" ||
		request.body != `{"template":"{{name}}"}` {
		t.Fatalf("literal imported values changed: %#v", request)
	}
}

func TestSendRequestPreservesExtensionMethodCase(t *testing.T) {
	received := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		received <- request.Method
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID: "extension-method-case", Method: "m-search", URL: server.URL,
		TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
	if method := <-received; method != "m-search" {
		t.Fatalf("extension method = %q, want m-search", method)
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

func TestRequestTimeoutDurationAcceptsFrontendBoundaries(t *testing.T) {
	t.Parallel()
	tests := []struct {
		timeoutMS int
		want      time.Duration
	}{
		{timeoutMS: minHTTPRequestTimeoutMS, want: time.Millisecond},
		{timeoutMS: maxHTTPRequestTimeoutMS, want: 5 * time.Minute},
	}
	for _, test := range tests {
		got, valid := requestTimeoutDuration(test.timeoutMS)
		if !valid || got != test.want {
			t.Fatalf("requestTimeoutDuration(%d) = (%s, %t), want (%s, true)", test.timeoutMS, got, valid, test.want)
		}
	}
}

func TestSendRequestRejectsInvalidTimeoutBeforeNetwork(t *testing.T) {
	t.Parallel()
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	for _, timeoutMS := range []int{-1, 0, maxHTTPRequestTimeoutMS + 1} {
		result := NewBridge().SendRequest(RequestInput{
			ID:        "invalid-timeout-" + strconv.Itoa(timeoutMS),
			Method:    http.MethodGet,
			URL:       server.URL,
			TimeoutMS: timeoutMS,
		})
		if result.Response != nil {
			t.Fatalf("SendRequest(timeoutMs=%d) response = %#v, want nil", timeoutMS, result.Response)
		}
		if result.Error == nil {
			t.Fatalf("SendRequest(timeoutMs=%d) error = nil", timeoutMS)
		}
		if result.Error.Code != "invalid_request" ||
			result.Error.Title != "Timeout geçerli değil" ||
			!strings.Contains(result.Error.Hint, "1 ile 300000 ms") ||
			result.Error.Technical != "" {
			t.Fatalf("SendRequest(timeoutMs=%d) error = %#v", timeoutMS, result.Error)
		}
	}
	if got := requests.Load(); got != 0 {
		t.Fatalf("invalid timeouts reached the network %d times", got)
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

func TestSendRequestPreservesBrowserSessionHeadersAndHost(t *testing.T) {
	type observedRequest struct {
		host    string
		headers http.Header
	}
	observed := make(chan observedRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		observed <- observedRequest{
			host:    request.Host,
			headers: request.Header.Clone(),
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID:     "browser-session-headers",
		Method: http.MethodPost,
		URL:    server.URL + "/session",
		Headers: []KeyValue{
			{Enabled: true, Key: "Cookie", Value: "session=abc123; theme=dark"},
			{Enabled: true, Key: "Authorization", Value: "Bearer browser-token"},
			{Enabled: true, Key: "Origin", Value: "https://app.example.test"},
			{Enabled: true, Key: "Referer", Value: "https://app.example.test/dashboard"},
			{Enabled: true, Key: "User-Agent", Value: "Browser UA/1.0"},
			{Enabled: true, Key: "X-CSRF-Token", Value: "csrf-value"},
			{Enabled: true, Key: "X-Repeated", Value: "first"},
			{Enabled: true, Key: "X-Repeated", Value: "second"},
			{Enabled: true, Key: "Host", Value: "api.example.test"},
		},
		Body:      "request body",
		TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("unexpected error: %#v", result.Error)
	}

	request := <-observed
	if request.host != "api.example.test" {
		t.Fatalf("Host = %q, want api.example.test", request.host)
	}
	if got := request.headers.Get("Host"); got != "" {
		t.Fatalf("Host leaked into ordinary header map: %q", got)
	}
	for name, want := range map[string]string{
		"Cookie":        "session=abc123; theme=dark",
		"Authorization": "Bearer browser-token",
		"Origin":        "https://app.example.test",
		"Referer":       "https://app.example.test/dashboard",
		"User-Agent":    "Browser UA/1.0",
		"X-CSRF-Token":  "csrf-value",
	} {
		if got := request.headers.Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
	repeated := request.headers.Values("X-Repeated")
	if len(repeated) != 2 || repeated[0] != "first" || repeated[1] != "second" {
		t.Fatalf("X-Repeated = %#v, want [first second]", repeated)
	}
}

func TestSendRequestRejectsUnsafeHostHeaderBeforeNetwork(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	tests := map[string]string{
		"empty":            "",
		"colon only":       ":",
		"empty brackets":   "[]",
		"unclosed ipv6":    "[::1",
		"invalid port":     "api.example.test:notaport",
		"multiple hosts":   "good.test,bad.test",
		"leading space":    " api.example.test",
		"embedded space":   "api .example.test",
		"tab":              "api.example.test\t443",
		"slash":            "api.example.test/path",
		"header injection": "api.example.test\r\nX-Injected: yes",
		"control byte":     "api.example.test\x00",
	}
	for name, host := range tests {
		t.Run(name, func(t *testing.T) {
			result := NewBridge().SendRequest(RequestInput{
				ID: "unsafe-host-" + name, Method: http.MethodGet, URL: server.URL,
				Headers: []KeyValue{
					{Enabled: true, Key: "Host", Value: host},
				},
				TimeoutMS: 2_000,
			})
			if result.Response != nil {
				t.Fatalf("unsafe Host returned response: %#v", result.Response)
			}
			if result.Error == nil || result.Error.Code != "invalid_request" {
				t.Fatalf("expected invalid_request, got %#v", result.Error)
			}
		})
	}
	if got := requests.Load(); got != 0 {
		t.Fatalf("unsafe Host values reached server %d times", got)
	}
}

func TestSendRequestValidatesMatchingContentLength(t *testing.T) {
	type observedRequest struct {
		contentLength int64
		body          string
	}
	observed := make(chan observedRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		observed <- observedRequest{
			contentLength: request.ContentLength,
			body:          string(body),
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID: "explicit-content-length", Method: http.MethodPost, URL: server.URL,
		Headers: []KeyValue{
			{Enabled: true, Key: "Content-Length", Value: "7"},
		},
		Body: "payload", TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
	request := <-observed
	if request.contentLength != 7 || request.body != "payload" {
		t.Fatalf("received ContentLength/body = %d/%q, want 7/payload", request.contentLength, request.body)
	}
}

func TestSendRequestPreservesExplicitZeroContentLengthOnWire(t *testing.T) {
	for _, method := range []string{http.MethodDelete, http.MethodOptions, "PROPFIND"} {
		t.Run(method, func(t *testing.T) {
			listener, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatalf("listen: %v", err)
			}
			defer listener.Close()

			rawRequest := make(chan string, 1)
			serverErr := make(chan error, 1)
			go func() {
				connection, acceptErr := listener.Accept()
				if acceptErr != nil {
					serverErr <- acceptErr
					return
				}
				defer connection.Close()
				if deadlineErr := connection.SetDeadline(time.Now().Add(2 * time.Second)); deadlineErr != nil {
					serverErr <- deadlineErr
					return
				}

				reader := bufio.NewReader(connection)
				var raw strings.Builder
				for {
					line, readErr := reader.ReadString('\n')
					if readErr != nil {
						serverErr <- readErr
						return
					}
					raw.WriteString(line)
					if line == "\r\n" {
						break
					}
				}
				rawRequest <- raw.String()
				_, writeErr := io.WriteString(
					connection,
					"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
				)
				if writeErr != nil {
					serverErr <- writeErr
				}
			}()

			result := NewBridge().SendRequest(RequestInput{
				ID: "explicit-zero-content-length-" + method, Method: method,
				URL: "http://" + listener.Addr().String(),
				Headers: []KeyValue{
					{Enabled: true, Key: "Content-Length", Value: "0"},
				},
				TimeoutMS: 2_000,
			})
			if result.Error != nil {
				t.Fatalf("unexpected error: %#v", result.Error)
			}

			select {
			case raw := <-rawRequest:
				if !strings.Contains(raw, "\r\nContent-Length: 0\r\n") {
					t.Fatalf("explicit Content-Length was not preserved on wire:\n%s", raw)
				}
			case err := <-serverErr:
				t.Fatalf("raw HTTP server: %v", err)
			case <-time.After(3 * time.Second):
				t.Fatal("timed out waiting for raw request")
			}
		})
	}
}

func TestSendRequestUsesChunkedTransferEncoding(t *testing.T) {
	type observedRequest struct {
		contentLength    int64
		transferEncoding []string
		body             string
	}
	observed := make(chan observedRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		observed <- observedRequest{
			contentLength:    request.ContentLength,
			transferEncoding: append([]string(nil), request.TransferEncoding...),
			body:             string(body),
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID: "chunked-request", Method: http.MethodPost, URL: server.URL,
		Headers: []KeyValue{
			{Enabled: true, Key: "Transfer-Encoding", Value: "chunked"},
		},
		Body: "chunked body", TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
	request := <-observed
	if request.contentLength != -1 ||
		len(request.transferEncoding) != 1 ||
		request.transferEncoding[0] != "chunked" ||
		request.body != "chunked body" {
		t.Fatalf("unexpected chunked request: %#v", request)
	}
}

func TestSendRequestRejectsAmbiguousFramingHeadersBeforeNetwork(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	tests := map[string][]KeyValue{
		"mismatched content length": {
			{Enabled: true, Key: "Content-Length", Value: "8"},
		},
		"signed content length": {
			{Enabled: true, Key: "Content-Length", Value: "+7"},
		},
		"content length injection": {
			{Enabled: true, Key: "Content-Length", Value: "7\r\nX-Injected: yes"},
		},
		"duplicate content length": {
			{Enabled: true, Key: "Content-Length", Value: "7"},
			{Enabled: true, Key: "Content-Length", Value: "7"},
		},
		"content length and transfer encoding": {
			{Enabled: true, Key: "Content-Length", Value: "7"},
			{Enabled: true, Key: "Transfer-Encoding", Value: "chunked"},
		},
		"unsupported transfer encoding": {
			{Enabled: true, Key: "Transfer-Encoding", Value: "gzip"},
		},
		"transfer encoding injection": {
			{Enabled: true, Key: "Transfer-Encoding", Value: "chunked\r\nX-Injected: yes"},
		},
		"duplicate transfer encoding": {
			{Enabled: true, Key: "Transfer-Encoding", Value: "chunked"},
			{Enabled: true, Key: "Transfer-Encoding", Value: "chunked"},
		},
		"unsupported trailer": {
			{Enabled: true, Key: "Trailer", Value: "X-Checksum"},
		},
	}
	for name, headers := range tests {
		t.Run(name, func(t *testing.T) {
			result := NewBridge().SendRequest(RequestInput{
				ID: "invalid-framing-" + name, Method: http.MethodPost, URL: server.URL,
				Headers: headers, Body: "payload", TimeoutMS: 2_000,
			})
			if result.Response != nil {
				t.Fatalf("invalid framing returned response: %#v", result.Response)
			}
			if result.Error == nil || result.Error.Code != "invalid_request" {
				t.Fatalf("expected invalid_request, got %#v", result.Error)
			}
		})
	}
	if got := requests.Load(); got != 0 {
		t.Fatalf("invalid framing headers reached server %d times", got)
	}
}

func TestSendRequestIncludesBodyForMethodsExceptHeadAndTrace(t *testing.T) {
	for _, method := range []string{
		http.MethodGet,
		http.MethodPost,
		http.MethodPut,
		http.MethodPatch,
		http.MethodDelete,
		http.MethodOptions,
		"PROPFIND",
	} {
		t.Run(method, func(t *testing.T) {
			received := make(chan string, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
				body, _ := io.ReadAll(request.Body)
				received <- string(body)
				w.WriteHeader(http.StatusNoContent)
			}))
			defer server.Close()

			result := NewBridge().SendRequest(RequestInput{
				ID: "body-" + method, Method: method, URL: server.URL,
				Body: "method body", TimeoutMS: 2_000,
			})
			if result.Error != nil {
				t.Fatalf("unexpected error: %#v", result.Error)
			}
			if got := <-received; got != "method body" {
				t.Fatalf("received body = %q, want method body", got)
			}
		})
	}
}

func TestSendRequestOmitsBodyForHeadAndTrace(t *testing.T) {
	for _, method := range []string{http.MethodHead, http.MethodTrace} {
		t.Run(method, func(t *testing.T) {
			received := make(chan string, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
				body, _ := io.ReadAll(request.Body)
				received <- string(body)
				w.WriteHeader(http.StatusNoContent)
			}))
			defer server.Close()

			result := NewBridge().SendRequest(RequestInput{
				ID: "bodyless-" + method, Method: method, URL: server.URL,
				Body: "must not be sent", TimeoutMS: 2_000,
			})
			if result.Error != nil {
				t.Fatalf("unexpected error: %#v", result.Error)
			}
			if got := <-received; got != "" {
				t.Fatalf("received body = %q, want empty", got)
			}
		})
	}
}

func TestSendRequestDecodesSupportedContentEncodings(t *testing.T) {
	const body = "Validex compressed response"
	deflated := zlibDeflateTestPayload(t, []byte(body))
	tests := map[string]struct {
		contentEncoding string
		payload         []byte
	}{
		"gzip": {
			contentEncoding: "gzip",
			payload:         gzipTestPayload(t, []byte(body)),
		},
		"zlib wrapped deflate": {
			contentEncoding: "deflate",
			payload:         deflated,
		},
		"raw deflate": {
			contentEncoding: "deflate",
			payload:         rawDeflateTestPayload(t, []byte(body)),
		},
		"stacked encodings": {
			contentEncoding: "deflate, gzip",
			payload:         gzipTestPayload(t, deflated),
		},
	}

	for name, testCase := range tests {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Encoding", testCase.contentEncoding)
				_, _ = w.Write(testCase.payload)
			}))
			defer server.Close()

			result := NewBridge().SendRequest(RequestInput{
				ID: "compressed-" + name, Method: http.MethodGet, URL: server.URL,
				Headers: []KeyValue{
					{Enabled: true, Key: "Accept-Encoding", Value: "gzip, deflate"},
				},
				TimeoutMS: 2_000,
			})
			if result.Error != nil {
				t.Fatalf("unexpected error: %#v", result.Error)
			}
			if result.Response == nil {
				t.Fatal("response is nil")
			}
			if result.Response.RawBody != body || result.Response.Body != body {
				t.Fatalf(
					"decoded body = %q / %q, want %q",
					result.Response.RawBody,
					result.Response.Body,
					body,
				)
			}
			if result.Response.SizeBytes != int64(len(body)) {
				t.Fatalf("SizeBytes = %d, want %d", result.Response.SizeBytes, len(body))
			}
		})
	}
}

func TestSendRequestRejectsUnsupportedContentEncoding(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Encoding", "br")
		_, _ = w.Write([]byte("brotli bytes"))
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID: "unsupported-encoding", Method: http.MethodGet, URL: server.URL,
		Headers: []KeyValue{
			{Enabled: true, Key: "Accept-Encoding", Value: "gzip, deflate, br"},
		},
		TimeoutMS: 2_000,
	})
	if result.Response != nil {
		t.Fatalf("unsupported encoding returned a response: %#v", result.Response)
	}
	if result.Error == nil || result.Error.Code != "unsupported_content_encoding" {
		t.Fatalf("expected unsupported_content_encoding, got %#v", result.Error)
	}
	if !strings.Contains(result.Error.Message, `"br"`) || result.Error.Technical != "" {
		t.Fatalf("unexpected unsupported encoding error: %#v", result.Error)
	}
}

func TestSendRequestRejectsExcessiveContentEncodingLayers(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Encoding", "gzip, gzip, gzip, gzip, gzip")
		_, _ = w.Write([]byte("nested payload"))
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID: "too-many-content-encodings", Method: http.MethodGet, URL: server.URL,
		TimeoutMS: 2_000,
	})
	if result.Response != nil {
		t.Fatalf("excessive encodings returned a response: %#v", result.Response)
	}
	if result.Error == nil || result.Error.Code != "too_many_content_encodings" {
		t.Fatalf("expected too_many_content_encodings, got %#v", result.Error)
	}
}

func TestSendRequestReportsMalformedCompressedResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		_, _ = w.Write([]byte("not a gzip stream"))
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID: "malformed-gzip", Method: http.MethodGet, URL: server.URL,
		TimeoutMS: 2_000,
	})
	if result.Response != nil {
		t.Fatalf("malformed encoding returned a response: %#v", result.Response)
	}
	if result.Error == nil || result.Error.Code != "response_decode_failed" {
		t.Fatalf("expected response_decode_failed, got %#v", result.Error)
	}
	if result.Error.Technical == "" {
		t.Fatalf("decode failure omitted technical detail: %#v", result.Error)
	}
}

func TestDecodeContentEncodedBodyEnforcesDecodedLimit(t *testing.T) {
	payload := gzipTestPayload(t, bytes.Repeat([]byte("a"), 1_024))
	decoded, tooLarge, failedEncoding, err := decodeContentEncodedBody(
		context.Background(),
		payload,
		[]string{"gzip"},
		32,
	)
	if err != nil {
		t.Fatalf("decodeContentEncodedBody() error = %v", err)
	}
	if decoded != nil || !tooLarge || failedEncoding != "gzip" {
		t.Fatalf(
			"decodeContentEncodedBody() = %q, %v, %q; want nil, true, gzip",
			decoded,
			tooLarge,
			failedEncoding,
		)
	}
}

func TestDecodeContentEncodedBodyHonorsContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	payload := gzipTestPayload(t, []byte("response"))

	decoded, tooLarge, failedEncoding, err := decodeContentEncodedBody(
		ctx,
		payload,
		[]string{"gzip"},
		maxHTTPResponseBodyBytes,
	)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("decode error = %v, want context.Canceled", err)
	}
	if decoded != nil || tooLarge || failedEncoding != "gzip" {
		t.Fatalf(
			"decode result = %q, %v, %q; want nil, false, gzip",
			decoded,
			tooLarge,
			failedEncoding,
		)
	}
}

func TestValidHostHeaderValueAcceptsCommonAuthorities(t *testing.T) {
	for _, host := range []string{
		"api.example.test",
		"api.example.test:8443",
		"127.0.0.1:8080",
		"[::1]",
		"[2001:db8::1]:443",
		"[fe80::1%en0]:8080",
	} {
		if !validHostHeaderValue(host) {
			t.Errorf("validHostHeaderValue(%q) = false", host)
		}
	}
}

func gzipTestPayload(t *testing.T, body []byte) []byte {
	t.Helper()
	var encoded bytes.Buffer
	writer := gzip.NewWriter(&encoded)
	if _, err := writer.Write(body); err != nil {
		t.Fatalf("write gzip test payload: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close gzip test payload: %v", err)
	}
	return encoded.Bytes()
}

func zlibDeflateTestPayload(t *testing.T, body []byte) []byte {
	t.Helper()
	var encoded bytes.Buffer
	writer := zlib.NewWriter(&encoded)
	if _, err := writer.Write(body); err != nil {
		t.Fatalf("write zlib test payload: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close zlib test payload: %v", err)
	}
	return encoded.Bytes()
}

func rawDeflateTestPayload(t *testing.T, body []byte) []byte {
	t.Helper()
	var encoded bytes.Buffer
	writer, err := flate.NewWriter(&encoded, flate.DefaultCompression)
	if err != nil {
		t.Fatalf("create raw deflate test payload: %v", err)
	}
	if _, err := writer.Write(body); err != nil {
		t.Fatalf("write raw deflate test payload: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close raw deflate test payload: %v", err)
	}
	return encoded.Bytes()
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

func TestPrettyBodyPreservesJSONLexemesDuplicateKeysAndOrder(t *testing.T) {
	t.Parallel()

	raw := []byte(`{"z":9007199254740993,"id":1,"id":2,"decimal":1.2300e+10,"tiny":0.000000000000000000123400}`)
	want := "{\n" +
		"  \"z\": 9007199254740993,\n" +
		"  \"id\": 1,\n" +
		"  \"id\": 2,\n" +
		"  \"decimal\": 1.2300e+10,\n" +
		"  \"tiny\": 0.000000000000000000123400\n" +
		"}"

	if got := prettyBody(raw, "application/json; charset=utf-8"); got != want {
		t.Fatalf("prettyBody() changed JSON tokens:\n got: %s\nwant: %s", got, want)
	}
}

func TestPrettyBodyLeavesInvalidJSONAndPlainTextUntouched(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		raw         string
		contentType string
	}{
		{name: "invalid JSON response", raw: `{"id":`, contentType: "application/json"},
		{name: "plain text", raw: "9007199254740993 is an identifier", contentType: "text/plain"},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			if got := prettyBody([]byte(testCase.raw), testCase.contentType); got != testCase.raw {
				t.Fatalf("prettyBody() = %q, want unchanged %q", got, testCase.raw)
			}
		})
	}
}

func TestPrettyBodySkipsUnsafeJSONIndentExpansion(t *testing.T) {
	t.Parallel()

	tooDeep := strings.Repeat("[", maxPrettyJSONNestingDepth+1) +
		"0" +
		strings.Repeat("]", maxPrettyJSONNestingDepth+1)
	if got := prettyBody([]byte(tooDeep), "application/json"); got != tooDeep {
		t.Fatal("prettyBody() formatted JSON beyond the nesting budget")
	}

	const values = 150_000
	wideAtDepth := strings.Repeat("[", maxPrettyJSONNestingDepth) +
		strings.Repeat("0,", values) +
		"0" +
		strings.Repeat("]", maxPrettyJSONNestingDepth)
	if prettyJSONWithinBudget([]byte(wideAtDepth)) {
		t.Fatal("prettyJSONWithinBudget() accepted output above the byte budget")
	}
	if got := prettyBody([]byte(wideAtDepth), "application/json"); got != wideAtDepth {
		t.Fatal("prettyBody() formatted JSON beyond the output byte budget")
	}
}

func TestRequestTraceTimelineUsesMeasuredNonOverlappingPhases(t *testing.T) {
	t.Parallel()

	started := time.Unix(1_700_000_000, 0)
	end := started.Add(100 * time.Millisecond)
	snapshot := requestTraceSnapshot{
		started:      started,
		requestReady: started.Add(10 * time.Millisecond),
		dnsStart:     started.Add(10 * time.Millisecond),
		dnsDone:      started.Add(20 * time.Millisecond),
		connectStart: started.Add(20 * time.Millisecond),
		connectDone:  started.Add(40 * time.Millisecond),
		tlsStart:     started.Add(40 * time.Millisecond),
		tlsDone:      started.Add(50 * time.Millisecond),
		gotConn:      started.Add(50 * time.Millisecond),
		wroteRequest: started.Add(55 * time.Millisecond),
		firstByte:    started.Add(80 * time.Millisecond),
	}

	timeline := snapshot.timeline(end)
	want := []struct {
		id         string
		durationMS float64
	}{
		{id: "preparation", durationMS: 10},
		{id: "dns", durationMS: 10},
		{id: "tcp", durationMS: 20},
		{id: "tls", durationMS: 10},
		{id: "request", durationMS: 5},
		{id: "server", durationMS: 25},
		{id: "download", durationMS: 20},
	}
	if len(timeline) != len(want) {
		t.Fatalf("timeline phase count = %d, want %d: %#v", len(timeline), len(want), timeline)
	}
	for index, expected := range want {
		if timeline[index].ID != expected.id || timeline[index].DurationMS != expected.durationMS {
			t.Errorf(
				"timeline[%d] = %s %.3fms, want %s %.3fms",
				index,
				timeline[index].ID,
				timeline[index].DurationMS,
				expected.id,
				expected.durationMS,
			)
		}
	}
	assertTimelineInvariants(t, timeline, end.Sub(started))
}

func TestRequestTraceTimelineClipsOverlappingAndOutOfOrderCallbacks(t *testing.T) {
	t.Parallel()

	started := time.Unix(1_700_000_100, 0)
	end := started.Add(100 * time.Millisecond)
	timeline := (requestTraceSnapshot{
		started:      started,
		requestReady: started.Add(20 * time.Millisecond),
		dnsStart:     started.Add(10 * time.Millisecond),
		dnsDone:      started.Add(40 * time.Millisecond),
		connectStart: started.Add(30 * time.Millisecond),
		connectDone:  started.Add(60 * time.Millisecond),
		tlsStart:     started.Add(50 * time.Millisecond),
		tlsDone:      started.Add(80 * time.Millisecond),
		gotConn:      started.Add(70 * time.Millisecond),
		wroteRequest: started.Add(90 * time.Millisecond),
		firstByte:    started.Add(85 * time.Millisecond),
	}).timeline(end)

	assertTimelineInvariants(t, timeline, end.Sub(started))
	if got := timeline[5].DurationMS; got != 0 {
		t.Fatalf("out-of-order server callbacks produced %.3fms, want 0", got)
	}
}

func TestRequestTraceTimelineHandlesReusedConnection(t *testing.T) {
	t.Parallel()

	started := time.Unix(1_700_000_200, 0)
	end := started.Add(70 * time.Millisecond)
	timeline := (requestTraceSnapshot{
		started:          started,
		requestReady:     started.Add(10 * time.Millisecond),
		gotConn:          started.Add(25 * time.Millisecond),
		wroteRequest:     started.Add(30 * time.Millisecond),
		firstByte:        started.Add(60 * time.Millisecond),
		connectionReused: true,
	}).timeline(end)

	for _, index := range []int{1, 2, 3} {
		if timeline[index].DurationMS != 0 {
			t.Errorf("reused connection phase %q = %.3fms, want 0", timeline[index].ID, timeline[index].DurationMS)
		}
	}
	if got := timeline[4].DurationMS; got != 20 {
		t.Fatalf("reused connection request phase = %.3fms, want 20ms", got)
	}
	if !strings.Contains(timeline[4].Description, "yeniden kullanıldı") {
		t.Fatalf("reused connection description = %q", timeline[4].Description)
	}
	assertTimelineInvariants(t, timeline, end.Sub(started))
}

func TestRequestTraceUsesLockedSnapshotDuringConcurrentCallbacks(t *testing.T) {
	t.Parallel()

	clientConnection, serverConnection := net.Pipe()
	defer clientConnection.Close()
	defer serverConnection.Close()
	trace := &requestTrace{started: time.Now()}
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
			callbacks.GotConn(httptrace.GotConnInfo{Conn: clientConnection, Reused: true})
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
	if snapshot.gotConn.IsZero() || !snapshot.connectionReused {
		t.Fatalf(
			"snapshot did not capture reused connection metadata: gotConn=%s reused=%t",
			snapshot.gotConn,
			snapshot.connectionReused,
		)
	}
	if len(snapshot.timeline(time.Now())) == 0 {
		t.Fatal("snapshot did not produce a timeline")
	}
}

func assertTimelineInvariants(t *testing.T, timeline []TimelinePhase, total time.Duration) {
	t.Helper()

	totalMS := float64(total) / float64(time.Millisecond)
	sumMS := 0.0
	for _, phase := range timeline {
		if phase.ID == "variables" || phase.ID == "contract" {
			t.Errorf("timeline contains synthetic phase %q", phase.ID)
		}
		if phase.DurationMS < 0 || phase.DurationMS > totalMS {
			t.Errorf(
				"phase %q duration %.6fms is outside [0, %.6f]",
				phase.ID,
				phase.DurationMS,
				totalMS,
			)
		}
		if phase.Percent < 0 || phase.Percent > 100 {
			t.Errorf("phase %q percent %.6f is outside [0, 100]", phase.ID, phase.Percent)
		}
		wantPercent := 0.0
		if totalMS > 0 {
			wantPercent = phase.DurationMS / totalMS * 100
		}
		if difference := phase.Percent - wantPercent; difference < -0.000001 || difference > 0.000001 {
			t.Errorf(
				"phase %q percent %.6f, want %.6f",
				phase.ID,
				phase.Percent,
				wantPercent,
			)
		}
		sumMS += phase.DurationMS
	}
	if sumMS > totalMS+0.000001 {
		t.Errorf("timeline phases total %.6fms exceeds request total %.6fms", sumMS, totalMS)
	}
}

func TestSendRequestReportsOversizedResponseHeaders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set(
			"X-Oversized",
			strings.Repeat("x", int(maxHTTPResponseHeaderBytes)+1_024),
		)
		response.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	result := NewBridge().SendRequest(RequestInput{
		ID: "oversized-response-headers", Method: http.MethodGet,
		URL: server.URL, TimeoutMS: 2_000,
	})
	if result.Response != nil {
		t.Fatalf("oversized response headers returned a response: %#v", result.Response)
	}
	if result.Error == nil || result.Error.Code != "response_headers_too_large" {
		t.Fatalf("expected response_headers_too_large, got %#v", result.Error)
	}
	if !strings.Contains(result.Error.Message, "1 MiB") ||
		result.Error.Technical == "" {
		t.Fatalf("unexpected oversized response header error: %#v", result.Error)
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
