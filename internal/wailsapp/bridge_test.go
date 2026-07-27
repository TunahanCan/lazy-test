//go:build wails

package wailsapp

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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

func TestNormalizeHTTPURL(t *testing.T) {
	t.Parallel()
	tests := map[string]string{
		"localhost:8080/health":  "http://localhost:8080/health",
		"10.20.30.40:8081/api":   "http://10.20.30.40:8081/api",
		"api.example.com/users":  "https://api.example.com/users",
		"https://example.test/x": "https://example.test/x",
	}
	for input, want := range tests {
		if got := normalizeHTTPURL(input); got != want {
			t.Errorf("normalizeHTTPURL(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestSendRequestNormalizesResolvedLocalURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	baseURL := strings.TrimPrefix(server.URL, "http://")
	result := NewBridge().SendRequest(RequestInput{
		ID: "schemeless", Method: http.MethodGet, URL: "{{baseUrl}}/health",
		Variables: map[string]string{"baseUrl": baseURL}, TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
	if result.Response == nil || result.Response.StatusCode != http.StatusNoContent {
		t.Fatalf("unexpected response: %#v", result.Response)
	}
}

func TestSendRequestRejectsNonHTTPURL(t *testing.T) {
	result := NewBridge().SendRequest(RequestInput{
		ID: "invalid-scheme", Method: http.MethodGet, URL: "ftp://example.test/file",
	})
	if result.Error == nil || result.Error.Code != "invalid_request" {
		t.Fatalf("expected invalid_request, got %#v", result.Error)
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

func TestSafeRelativePathRejectsTraversalAndAbsolutePaths(t *testing.T) {
	t.Parallel()
	for _, value := range []string{"", ".", "..", "../secret", filepath.Join("..", "secret"), string(filepath.Separator) + "tmp"} {
		if path, ok := safeRelativePath(value); ok {
			t.Errorf("expected %q to be rejected, got %q", value, path)
		}
	}
	for _, value := range []string{"GeneratedTest.java", filepath.Join("src", "test", "GeneratedTest.java")} {
		if path, ok := safeRelativePath(value); !ok || path == "" {
			t.Errorf("expected %q to be accepted, got %q", value, path)
		}
	}
}

func TestCreateAvailableDirectoryNeverOverwritesExistingExport(t *testing.T) {
	t.Parallel()
	parent := t.TempDir()
	base := filepath.Join(parent, "generated")
	if err := os.Mkdir(base, 0o755); err != nil {
		t.Fatal(err)
	}

	got, err := createAvailableDirectory(base)
	if err != nil {
		t.Fatal(err)
	}
	want := base + "-2"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestValidateGeneratedFilesRejectsDuplicatesBeforeWriting(t *testing.T) {
	t.Parallel()
	_, err := validateGeneratedFiles([]GeneratedFile{
		{Name: "One", RelativePath: "src/Generated.java", Content: "one"},
		{Name: "Two", RelativePath: filepath.Join("src", ".", "Generated.java"), Content: "two"},
	})
	if err == nil {
		t.Fatal("expected duplicate generated path to be rejected")
	}
}

func TestWriteFileAtomically(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "Generated.java")
	if err := writeFileAtomically(path, []byte("class Generated {}")); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "class Generated {}" {
		t.Fatalf("unexpected file content: %q", got)
	}
}

func TestSafeDirectoryName(t *testing.T) {
	t.Parallel()
	if got := safeDirectoryName("../../My API Test"); got != "My-API-Test" {
		t.Fatalf("unexpected safe directory name: %q", got)
	}
	if got := safeDirectoryName("..."); got != "validex-generated" {
		t.Fatalf("expected fallback directory name, got %q", got)
	}
}
