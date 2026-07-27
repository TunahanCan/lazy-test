package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"validex/internal/openapilint"
	"validex/internal/runner"
)

type invocation struct {
	code   int
	stdout string
	stderr string
}

func invoke(
	t *testing.T,
	ctx context.Context,
	args []string,
	stdin string,
) invocation {
	t.Helper()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := execute(
		ctx,
		args,
		strings.NewReader(stdin),
		&stdout,
		&stderr,
	)
	return invocation{
		code:   code,
		stdout: stdout.String(),
		stderr: stderr.String(),
	}
}

func writeTestFile(t *testing.T, name string, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestExecuteDispatchAndUsage(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		args       []string
		wantCode   int
		wantStdout string
		wantStderr string
	}{
		{
			name:       "root help",
			args:       []string{"--help"},
			wantCode:   exitSuccess,
			wantStdout: "validex-cli run",
		},
		{
			name:       "help command",
			args:       []string{"help"},
			wantCode:   exitSuccess,
			wantStdout: "Use --file -",
		},
		{
			name:       "missing command",
			wantCode:   exitUsage,
			wantStderr: "Usage:",
		},
		{
			name:       "unknown command",
			args:       []string{"unknown"},
			wantCode:   exitUsage,
			wantStderr: `unknown command "unknown"`,
		},
		{
			name:       "subcommand help",
			args:       []string{"run", "--help"},
			wantCode:   exitSuccess,
			wantStdout: "--variables PATH",
		},
		{
			name:       "unknown flag",
			args:       []string{"lint", "--wat"},
			wantCode:   exitUsage,
			wantStderr: "flag provided but not defined",
		},
		{
			name:       "unexpected argument",
			args:       []string{"inspect", "--url", "https://example.test", "extra"},
			wantCode:   exitUsage,
			wantStderr: "unexpected arguments: extra",
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got := invoke(t, context.Background(), test.args, "")
			if got.code != test.wantCode {
				t.Fatalf("code = %d, want %d\nstdout:\n%s\nstderr:\n%s",
					got.code, test.wantCode, got.stdout, got.stderr)
			}
			if !strings.Contains(got.stdout, test.wantStdout) {
				t.Fatalf("stdout = %q, want containing %q", got.stdout, test.wantStdout)
			}
			if !strings.Contains(got.stderr, test.wantStderr) {
				t.Fatalf("stderr = %q, want containing %q", got.stderr, test.wantStderr)
			}
		})
	}
}

func TestRunHumanReportWithVariableOverrides(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(
		responseWriter http.ResponseWriter,
		request *http.Request,
	) {
		if request.URL.Path != "/health" {
			http.NotFound(responseWriter, request)
			return
		}
		if request.Header.Get("X-Test-Token") != "secret" {
			http.Error(responseWriter, "missing token", http.StatusUnauthorized)
			return
		}
		responseWriter.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(responseWriter, `{"ready":true}`)
	}))
	defer server.Close()

	collectionPath := writeTestFile(t, "collection.json", `{
		"name": "smoke",
		"variables": {"baseUrl": "http://collection.invalid", "token": "old"},
		"requests": [{
			"id": "health",
			"name": "Health",
			"method": "GET",
			"url": "{{baseUrl}}/health",
			"headers": {"X-Test-Token": "{{token}}"},
			"assertions": [
				{"target": "status", "operator": "equals", "expected": 200},
				{"target": "json_path", "path": "$.ready", "operator": "equals", "expected": true}
			]
		}]
	}`)
	variablesPath := writeTestFile(
		t,
		"variables.json",
		`{"baseUrl":`+mustJSONQuote(t, server.URL)+`,"token":"secret"}`,
	)

	got := invoke(
		t,
		context.Background(),
		[]string{
			"run",
			"--file", collectionPath,
			"--variables", variablesPath,
		},
		"",
	)
	if got.code != exitSuccess {
		t.Fatalf("code = %d\nstdout:\n%s\nstderr:\n%s", got.code, got.stdout, got.stderr)
	}
	for _, want := range []string{
		"Collection: smoke\n",
		"Summary: 1 passed, 0 failed, 1 total,",
		"PASS  GET  REDACTED/health  HTTP 200",
		"Health\n",
	} {
		if !strings.Contains(got.stdout, want) {
			t.Errorf("stdout = %q, want containing %q", got.stdout, want)
		}
	}
	if got.stderr != "" {
		t.Fatalf("stderr = %q, want empty", got.stderr)
	}
}

func TestRunJSONFromStandardInputReturnsFailureForAssertion(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(
		responseWriter http.ResponseWriter,
		_ *http.Request,
	) {
		responseWriter.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	collection := `{
		"name": "failure",
		"requests": [{
			"method": "GET",
			"url": ` + mustJSONQuote(t, server.URL) + `,
			"assertions": [
				{"target": "status", "operator": "equals", "expected": 200}
			]
		}]
	}`
	got := invoke(
		t,
		context.Background(),
		[]string{"run", "--file", "-", "--json"},
		collection,
	)
	if got.code != exitFailure {
		t.Fatalf("code = %d, want %d\nstdout:\n%s\nstderr:\n%s",
			got.code, exitFailure, got.stdout, got.stderr)
	}
	var report runner.Report
	if err := json.Unmarshal([]byte(got.stdout), &report); err != nil {
		t.Fatalf("JSON output: %v\n%s", err, got.stdout)
	}
	if report.Name != "failure" ||
		report.Passed != 0 ||
		report.Failed != 1 ||
		len(report.Results) != 1 ||
		report.Results[0].Passed ||
		len(report.Results[0].Assertions) != 1 ||
		report.Results[0].Assertions[0].Passed {
		t.Fatalf("report = %#v", report)
	}
	if got.stderr != "" {
		t.Fatalf("stderr = %q, want empty", got.stderr)
	}
}

func TestRunInputAndRequestFailures(t *testing.T) {
	t.Parallel()

	closedServer := httptest.NewServer(http.HandlerFunc(func(
		http.ResponseWriter,
		*http.Request,
	) {
	}))
	closedURL := closedServer.URL
	closedServer.Close()

	networkCollection := writeTestFile(t, "network.json", `{
		"requests": [{"method": "GET", "url": `+mustJSONQuote(t, closedURL)+`}]
	}`)
	badVariables := writeTestFile(t, "variables.json", `{"token":"one"} {}`)

	tests := []struct {
		name       string
		args       []string
		stdin      string
		wantCode   int
		wantStdout string
		wantStderr string
	}{
		{
			name:       "missing file flag",
			args:       []string{"run"},
			wantCode:   exitUsage,
			wantStderr: "--file is required",
		},
		{
			name:       "both inputs use stdin",
			args:       []string{"run", "--file", "-", "--variables", "-"},
			wantCode:   exitUsage,
			wantStderr: "cannot both read standard input",
		},
		{
			name:       "malformed collection",
			args:       []string{"run", "--file", "-"},
			stdin:      `{"requests":`,
			wantCode:   exitFailure,
			wantStderr: "decode",
		},
		{
			name: "trailing variables",
			args: []string{
				"run",
				"--file", networkCollection,
				"--variables", badVariables,
			},
			wantCode:   exitFailure,
			wantStderr: "multiple JSON values",
		},
		{
			name:       "request failure",
			args:       []string{"run", "--file", networkCollection},
			wantCode:   exitFailure,
			wantStdout: "FAIL  GET",
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got := invoke(t, context.Background(), test.args, test.stdin)
			if got.code != test.wantCode {
				t.Fatalf("code = %d, want %d\nstdout:\n%s\nstderr:\n%s",
					got.code, test.wantCode, got.stdout, got.stderr)
			}
			if !strings.Contains(got.stdout, test.wantStdout) {
				t.Fatalf("stdout = %q, want containing %q", got.stdout, test.wantStdout)
			}
			if !strings.Contains(got.stderr, test.wantStderr) {
				t.Fatalf("stderr = %q, want containing %q", got.stderr, test.wantStderr)
			}
		})
	}
}

func TestInspectHumanReportFollowsRedirects(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(
		responseWriter http.ResponseWriter,
		request *http.Request,
	) {
		switch request.URL.Path {
		case "/start":
			responseWriter.Header().Set("Location", "/final")
			responseWriter.WriteHeader(http.StatusFound)
		case "/final":
			responseWriter.WriteHeader(http.StatusNoContent)
		default:
			http.NotFound(responseWriter, request)
		}
	}))
	defer server.Close()

	got := invoke(
		t,
		context.Background(),
		[]string{"inspect", "--url", server.URL + "/start"},
		"",
	)
	if got.code != exitSuccess {
		t.Fatalf("code = %d\nstdout:\n%s\nstderr:\n%s", got.code, got.stdout, got.stderr)
	}
	for _, want := range []string{
		"Inspect: " + server.URL + "/start",
		"DNS  127.0.0.1",
		"HOP 1  HEAD  " + server.URL + "/start  HTTP 302",
		"-> /final",
		"HOP 2  HEAD  " + server.URL + "/final  HTTP 204",
		"Final: " + server.URL + "/final  HTTP 204",
	} {
		if !strings.Contains(got.stdout, want) {
			t.Errorf("stdout = %q, want containing %q", got.stdout, want)
		}
	}
	if got.stderr != "" {
		t.Fatalf("stderr = %q, want empty", got.stderr)
	}
}

func TestInspectJSONSupportsExplicitInsecureTLS(t *testing.T) {
	t.Parallel()

	server := httptest.NewTLSServer(http.HandlerFunc(func(
		responseWriter http.ResponseWriter,
		_ *http.Request,
	) {
		responseWriter.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	server.Config.ErrorLog = log.New(io.Discard, "", 0)

	failed := invoke(
		t,
		context.Background(),
		[]string{"inspect", "--url", server.URL, "--json"},
		"",
	)
	if failed.code != exitFailure {
		t.Fatalf("default TLS code = %d, want %d\nstdout:\n%s\nstderr:\n%s",
			failed.code, exitFailure, failed.stdout, failed.stderr)
	}
	var failedReport inspectJSONReport
	if err := json.Unmarshal([]byte(failed.stdout), &failedReport); err != nil {
		t.Fatalf("failed JSON output: %v\n%s", err, failed.stdout)
	}
	if failedReport.Error == "" {
		t.Fatalf("failed JSON report = %#v, want error", failedReport)
	}

	got := invoke(
		t,
		context.Background(),
		[]string{"inspect", "--url", server.URL, "--insecure", "--json"},
		"",
	)
	if got.code != exitSuccess {
		t.Fatalf("insecure TLS code = %d\nstdout:\n%s\nstderr:\n%s",
			got.code, got.stdout, got.stderr)
	}
	var report inspectJSONReport
	if err := json.Unmarshal([]byte(got.stdout), &report); err != nil {
		t.Fatalf("JSON output: %v\n%s", err, got.stdout)
	}
	if report.FinalURL != server.URL+"/" ||
		report.FinalStatusCode != http.StatusNoContent ||
		report.Error != "" {
		t.Fatalf("report = %#v", report)
	}
	if got.stderr != "" {
		t.Fatalf("stderr = %q, want empty", got.stderr)
	}
}

func TestInspectUsageAndNetworkErrors(t *testing.T) {
	t.Parallel()

	closedServer := httptest.NewServer(http.HandlerFunc(func(
		http.ResponseWriter,
		*http.Request,
	) {
	}))
	closedURL := closedServer.URL
	closedServer.Close()

	tests := []struct {
		name       string
		args       []string
		wantCode   int
		wantStderr string
	}{
		{
			name:       "missing URL",
			args:       []string{"inspect"},
			wantCode:   exitUsage,
			wantStderr: "--url is required",
		},
		{
			name:       "zero timeout",
			args:       []string{"inspect", "--url", "https://example.test", "--timeout", "0s"},
			wantCode:   exitUsage,
			wantStderr: "--timeout must be positive",
		},
		{
			name:       "timeout above maximum",
			args:       []string{"inspect", "--url", "https://example.test", "--timeout", "6m"},
			wantCode:   exitUsage,
			wantStderr: "--timeout must not exceed",
		},
		{
			name:       "zero redirects",
			args:       []string{"inspect", "--url", "https://example.test", "--max-redirects", "0"},
			wantCode:   exitUsage,
			wantStderr: "--max-redirects must be positive",
		},
		{
			name:       "invalid URL",
			args:       []string{"inspect", "--url", "mailto:test@example.com"},
			wantCode:   exitUsage,
			wantStderr: "URL",
		},
		{
			name:       "network failure",
			args:       []string{"inspect", "--url", closedURL},
			wantCode:   exitFailure,
			wantStderr: "inspect",
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got := invoke(t, context.Background(), test.args, "")
			if got.code != test.wantCode {
				t.Fatalf("code = %d, want %d\nstdout:\n%s\nstderr:\n%s",
					got.code, test.wantCode, got.stdout, got.stderr)
			}
			if !strings.Contains(got.stderr, test.wantStderr) {
				t.Fatalf("stderr = %q, want containing %q", got.stderr, test.wantStderr)
			}
		})
	}
}

const warningOnlyOpenAPI = `openapi: 3.0.3
info:
  title: CLI test
  version: 1.0.0
paths:
  /health:
    get:
      responses:
        "204":
          description: healthy
`

func TestLintStandardInputHumanAndStrictModes(t *testing.T) {
	t.Parallel()

	got := invoke(
		t,
		context.Background(),
		[]string{"lint", "--file", "-"},
		warningOnlyOpenAPI,
	)
	if got.code != exitSuccess {
		t.Fatalf("code = %d\nstdout:\n%s\nstderr:\n%s", got.code, got.stdout, got.stderr)
	}
	for _, want := range []string{
		"OpenAPI: 1 paths, 1 operations",
		"Issues: 3 total, 0 errors, 3 warnings, 0 info",
		"WARNING  [operation.operation_id.missing]",
		"Result: PASS",
	} {
		if !strings.Contains(got.stdout, want) {
			t.Errorf("stdout = %q, want containing %q", got.stdout, want)
		}
	}
	if got.stderr != "" {
		t.Fatalf("stderr = %q, want empty", got.stderr)
	}

	strict := invoke(
		t,
		context.Background(),
		[]string{"lint", "--file", "-", "--strict"},
		warningOnlyOpenAPI,
	)
	if strict.code != exitFailure {
		t.Fatalf("strict code = %d, want %d\nstdout:\n%s\nstderr:\n%s",
			strict.code, exitFailure, strict.stdout, strict.stderr)
	}
	if !strings.Contains(strict.stdout, "Result: FAIL") {
		t.Fatalf("strict stdout = %q", strict.stdout)
	}
	if strict.stderr != "" {
		t.Fatalf("strict stderr = %q, want empty", strict.stderr)
	}
}

func TestLintFileJSONAndDocumentError(t *testing.T) {
	t.Parallel()

	documentPath := writeTestFile(t, "openapi.yaml", warningOnlyOpenAPI)
	got := invoke(
		t,
		context.Background(),
		[]string{"lint", "--file", documentPath, "--json"},
		"",
	)
	if got.code != exitSuccess {
		t.Fatalf("code = %d\nstdout:\n%s\nstderr:\n%s", got.code, got.stdout, got.stderr)
	}
	var report openapilint.Report
	if err := json.Unmarshal([]byte(got.stdout), &report); err != nil {
		t.Fatalf("JSON output: %v\n%s", err, got.stdout)
	}
	if report.Summary.Paths != 1 ||
		report.Summary.Operations != 1 ||
		report.Summary.Errors != 0 ||
		report.Summary.Warnings != 3 {
		t.Fatalf("report = %#v", report)
	}
	if got.stderr != "" {
		t.Fatalf("stderr = %q, want empty", got.stderr)
	}

	invalid := invoke(
		t,
		context.Background(),
		[]string{"lint", "--file", "-", "--json"},
		"openapi: [",
	)
	if invalid.code != exitFailure {
		t.Fatalf("invalid code = %d, want %d\nstdout:\n%s\nstderr:\n%s",
			invalid.code, exitFailure, invalid.stdout, invalid.stderr)
	}
	var invalidReport openapilint.Report
	if err := json.Unmarshal([]byte(invalid.stdout), &invalidReport); err != nil {
		t.Fatalf("invalid JSON output: %v\n%s", err, invalid.stdout)
	}
	if invalidReport.Summary.Errors == 0 ||
		len(invalidReport.Issues) == 0 ||
		invalidReport.Issues[0].Code != openapilint.CodeDocumentParse {
		t.Fatalf("invalid report = %#v", invalidReport)
	}
	if invalid.stderr != "" {
		t.Fatalf("invalid stderr = %q, want empty", invalid.stderr)
	}
}

func TestLintUsageReadAndOutputFailures(t *testing.T) {
	t.Parallel()

	missing := invoke(t, context.Background(), []string{"lint"}, "")
	if missing.code != exitUsage || !strings.Contains(missing.stderr, "--file is required") {
		t.Fatalf("missing invocation = %#v", missing)
	}

	notFound := invoke(
		t,
		context.Background(),
		[]string{"lint", "--file", filepath.Join(t.TempDir(), "missing.yaml")},
		"",
	)
	if notFound.code != exitFailure ||
		!strings.Contains(notFound.stderr, "read OpenAPI document") {
		t.Fatalf("not-found invocation = %#v", notFound)
	}

	var stderr bytes.Buffer
	code := execute(
		context.Background(),
		[]string{"lint", "--file", "-"},
		strings.NewReader(warningOnlyOpenAPI),
		errorWriter{},
		&stderr,
	)
	if code != exitFailure || !strings.Contains(stderr.String(), "write output") {
		t.Fatalf("output failure code = %d, stderr = %q", code, stderr.String())
	}
}

func TestExecuteAcceptsNilContextAndWriters(t *testing.T) {
	t.Parallel()
	if code := execute(nil, []string{"--help"}, nil, nil, nil); code != exitSuccess {
		t.Fatalf("code = %d, want %d", code, exitSuccess)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if code := Execute(
		context.Background(),
		[]string{"--help"},
		&stdout,
		&stderr,
	); code != exitSuccess {
		t.Fatalf("Execute() code = %d, want %d", code, exitSuccess)
	}
	if !strings.Contains(stdout.String(), "Usage:") || stderr.Len() != 0 {
		t.Fatalf("stdout = %q, stderr = %q", stdout.String(), stderr.String())
	}
}

func TestCanceledContextStopsRun(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	collection := `{
		"name": "canceled",
		"requests": [{"method": "GET", "url": "https://example.test"}]
	}`
	got := invoke(
		t,
		ctx,
		[]string{"run", "--file", "-", "--json"},
		collection,
	)
	if got.code != exitFailure {
		t.Fatalf("code = %d, want %d\nstdout:\n%s\nstderr:\n%s",
			got.code, exitFailure, got.stdout, got.stderr)
	}
	if !strings.Contains(got.stderr, context.Canceled.Error()) {
		t.Fatalf("stderr = %q, want context cancellation", got.stderr)
	}
	if got.stdout != "" {
		t.Fatalf("stdout = %q, want no report before collection was read", got.stdout)
	}
}

func TestReadAllContextUnblocksCancelableInput(t *testing.T) {
	t.Parallel()
	pipeReader, pipeWriter := io.Pipe()
	defer pipeWriter.Close()
	reader := &notifyingReadCloser{
		reader:  pipeReader,
		started: make(chan struct{}),
	}
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		_, err := readAllContext(ctx, reader, 1024)
		result <- err
	}()
	<-reader.started
	cancel()

	select {
	case err := <-result:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("readAllContext() error = %v, want context.Canceled", err)
		}
	case <-time.After(time.Second):
		t.Fatal("readAllContext() did not unblock after cancellation")
	}
}

func TestInspectJSONErrorContract(t *testing.T) {
	t.Parallel()

	got := invoke(
		t,
		context.Background(),
		[]string{"inspect", "--url", "http://127.0.0.1:1", "--json"},
		"",
	)
	if got.code != exitFailure {
		t.Fatalf("code = %d, want %d\nstdout:\n%s\nstderr:\n%s",
			got.code, exitFailure, got.stdout, got.stderr)
	}
	var report inspectJSONReport
	if err := json.Unmarshal([]byte(got.stdout), &report); err != nil {
		t.Fatalf("JSON output: %v\n%s", err, got.stdout)
	}
	if report.Error == "" || !strings.Contains(got.stderr, "inspect") {
		t.Fatalf("report = %#v, stderr = %q", report, got.stderr)
	}
}

type errorWriter struct{}

func (errorWriter) Write([]byte) (int, error) {
	return 0, errors.New("writer unavailable")
}

type notifyingReadCloser struct {
	reader  io.ReadCloser
	started chan struct{}
	once    sync.Once
}

func (reader *notifyingReadCloser) Read(buffer []byte) (int, error) {
	reader.once.Do(func() { close(reader.started) })
	return reader.reader.Read(buffer)
}

func (reader *notifyingReadCloser) Close() error {
	return reader.reader.Close()
}

func mustJSONQuote(t *testing.T, value string) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(encoded)
}
