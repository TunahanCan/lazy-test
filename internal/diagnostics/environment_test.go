package diagnostics

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
)

func TestCompareEnvironmentsIgnoresDynamicJSONPathsAndVolatileHeaders(t *testing.T) {
	t.Parallel()
	first := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Date", "Mon, 01 Jan 2024 00:00:00 GMT")
		response.Header().Set("X-Release", "same")
		response.Header().Add("Set-Cookie", "session=secret")
		response.Header().Set("Content-Type", "application/json")
		response.WriteHeader(http.StatusOK)
		_, _ = response.Write([]byte(`{"id":1,"items":[{"value":"ok","traceId":"a"}]}`))
	}))
	defer first.Close()
	second := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Date", "Tue, 02 Jan 2024 00:00:00 GMT")
		response.Header().Set("X-Release", "same")
		response.Header().Add("Set-Cookie", "session=other-secret")
		response.Header().Set("Content-Type", "application/json")
		response.WriteHeader(http.StatusOK)
		_, _ = response.Write([]byte(`{"id":1,"items":[{"value":"ok","traceId":"b"}]}`))
	}))
	defer second.Close()

	result, err := CompareEnvironments(context.Background(), EnvironmentRequest{
		Method: http.MethodGet,
		Path:   "/orders?limit=1",
		Targets: []EnvironmentTarget{
			{Name: "local", BaseURL: first.URL},
			{Name: "test", BaseURL: second.URL},
		},
		IgnoreJSONPaths: []string{"$.items[*].traceId"},
	}, EnvironmentCompareOptions{})
	if err != nil {
		t.Fatalf("CompareEnvironments() error = %v", err)
	}
	if len(result.Comparisons) != 1 || !result.Comparisons[0].BodyEqual || !result.Comparisons[0].StatusMatch {
		t.Fatalf("unexpected comparison: %#v", result.Comparisons)
	}
	if len(result.Comparisons[0].HeaderDifferences) != 0 {
		t.Fatalf("unexpected header differences: %#v", result.Comparisons[0].HeaderDifferences)
	}
	if got := result.Responses[0].Headers["Set-Cookie"]; len(got) != 1 || got[0] != "[redacted]" {
		t.Fatalf("Set-Cookie was not redacted: %#v", got)
	}
}

func TestCompareEnvironmentsBlocksUnsafeMethodUntilExplicitlyAllowed(t *testing.T) {
	t.Parallel()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		calls.Add(1)
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()
	input := EnvironmentRequest{
		Method: http.MethodPost,
		Path:   "/orders",
		Targets: []EnvironmentTarget{
			{Name: "local", BaseURL: server.URL},
			{Name: "test", BaseURL: server.URL},
		},
		Body: []byte(`{"name":"new"}`),
	}
	_, err := CompareEnvironments(context.Background(), input, EnvironmentCompareOptions{})
	if ErrorCode(err) != CodeUnsafeMethod {
		t.Fatalf("unsafe compare error code = %q, want %q", ErrorCode(err), CodeUnsafeMethod)
	}
	if calls.Load() != 0 {
		t.Fatalf("unsafe request reached server %d times", calls.Load())
	}

	input.AllowUnsafe = true
	result, err := CompareEnvironments(context.Background(), input, EnvironmentCompareOptions{})
	if err != nil {
		t.Fatalf("explicit unsafe CompareEnvironments() error = %v", err)
	}
	if calls.Load() != 2 || !result.Comparisons[0].BodyEqual {
		t.Fatalf("explicit unsafe comparison failed: calls=%d result=%#v", calls.Load(), result)
	}
}

func TestCompareEnvironmentsReportsDeterministicJSONDifferences(t *testing.T) {
	t.Parallel()
	serverWithBody := func(body string, status int) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			response.Header().Set("Content-Type", "application/json")
			response.WriteHeader(status)
			_, _ = response.Write([]byte(body))
		}))
	}
	first := serverWithBody(`{"count":1,"name":"orders","removed":true}`, http.StatusOK)
	defer first.Close()
	second := serverWithBody(`{"count":"1","extra":7,"name":"changed"}`, http.StatusCreated)
	defer second.Close()

	result, err := CompareEnvironments(context.Background(), EnvironmentRequest{
		Method: http.MethodGet,
		Path:   "/summary",
		Targets: []EnvironmentTarget{
			{Name: "local", BaseURL: first.URL},
			{Name: "staging", BaseURL: second.URL},
		},
	}, EnvironmentCompareOptions{})
	if err != nil {
		t.Fatalf("CompareEnvironments() error = %v", err)
	}
	diff := result.Comparisons[0]
	if diff.StatusMatch || diff.BodyEqual || diff.BodyMode != "json" {
		t.Fatalf("unexpected comparison summary: %#v", diff)
	}
	wantPaths := []string{"$.count", "$.extra", "$.name", "$.removed"}
	if len(diff.JSONDifferences) != len(wantPaths) {
		t.Fatalf("JSON differences = %#v, want paths %#v", diff.JSONDifferences, wantPaths)
	}
	for index, want := range wantPaths {
		if diff.JSONDifferences[index].Path != want {
			t.Fatalf("difference[%d].Path = %q, want %q", index, diff.JSONDifferences[index].Path, want)
		}
	}
}

func TestCompareEnvironmentsRejectsInvalidIgnorePathBeforeNetworkCall(t *testing.T) {
	t.Parallel()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		calls.Add(1)
	}))
	defer server.Close()
	_, err := CompareEnvironments(context.Background(), EnvironmentRequest{
		Targets: []EnvironmentTarget{
			{Name: "a", BaseURL: server.URL},
			{Name: "b", BaseURL: server.URL},
		},
		IgnoreJSONPaths: []string{"items[0]"},
	}, EnvironmentCompareOptions{})
	if ErrorCode(err) != CodeInvalidInput {
		t.Fatalf("invalid JSONPath error code = %q, want %q", ErrorCode(err), CodeInvalidInput)
	}
	if calls.Load() != 0 {
		t.Fatalf("network was called %d times before validation completed", calls.Load())
	}
}

func TestCompareEnvironmentsBoundsResponseBody(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		_, _ = response.Write([]byte(strings.Repeat("x", 128)))
	}))
	defer server.Close()
	result, err := CompareEnvironments(context.Background(), EnvironmentRequest{
		Targets: []EnvironmentTarget{
			{Name: "a", BaseURL: server.URL},
			{Name: "b", BaseURL: server.URL},
		},
	}, EnvironmentCompareOptions{MaxResponseBytes: 32})
	if err != nil {
		t.Fatalf("CompareEnvironments() error = %v", err)
	}
	if !result.Responses[0].Truncated || len(result.Responses[0].Body) != 32 {
		t.Fatalf("response was not bounded: %#v", result.Responses[0])
	}
	if result.Comparisons[0].Error == "" {
		t.Fatal("truncated responses were compared as complete")
	}
}

func TestEnvironmentComparisonSupportsScalarJSONRoots(t *testing.T) {
	t.Parallel()
	diff := compareEnvironmentResponses(
		EnvironmentResponse{Name: "local", StatusCode: http.StatusOK, Body: `1`},
		EnvironmentResponse{Name: "test", StatusCode: http.StatusOK, Body: `2`},
		normalizedIgnoredHeaders(nil),
		nil,
	)
	if diff.BodyMode != "json" || diff.BodyEqual ||
		len(diff.JSONDifferences) != 1 || diff.JSONDifferences[0].Path != "$" {
		t.Fatalf("scalar JSON comparison = %#v", diff)
	}

	equalNumber := compareEnvironmentResponses(
		EnvironmentResponse{Name: "local", StatusCode: http.StatusOK, Body: `1`},
		EnvironmentResponse{Name: "test", StatusCode: http.StatusOK, Body: `1.0`},
		normalizedIgnoredHeaders(nil),
		nil,
	)
	if !equalNumber.BodyEqual || len(equalNumber.JSONDifferences) != 0 {
		t.Fatalf("equivalent JSON numbers = %#v", equalNumber)
	}
}

func TestEnvironmentComparisonBoundsJSONDifferencesAndSignalsTruncation(t *testing.T) {
	t.Parallel()
	baselineValues := make([]int, maxEnvironmentDifferences+1)
	candidateValues := make([]int, maxEnvironmentDifferences+1)
	for index := range candidateValues {
		candidateValues[index] = index + 1
	}
	baselineBody, err := json.Marshal(baselineValues)
	if err != nil {
		t.Fatalf("json.Marshal(baseline) error = %v", err)
	}
	candidateBody, err := json.Marshal(candidateValues)
	if err != nil {
		t.Fatalf("json.Marshal(candidate) error = %v", err)
	}
	diff := compareEnvironmentResponses(
		EnvironmentResponse{Name: "local", StatusCode: http.StatusOK, Body: string(baselineBody)},
		EnvironmentResponse{Name: "test", StatusCode: http.StatusOK, Body: string(candidateBody)},
		normalizedIgnoredHeaders(nil),
		nil,
	)
	if diff.BodyEqual || !diff.JSONDifferencesTruncated ||
		len(diff.JSONDifferences) != maxEnvironmentDifferences {
		t.Fatalf("bounded JSON comparison = %#v", diff)
	}
	if diff.JSONDifferences[0].Path != "$[0]" ||
		diff.JSONDifferences[len(diff.JSONDifferences)-1].Path != "$[999]" {
		t.Fatalf(
			"unexpected bounded JSON paths: first=%q last=%q",
			diff.JSONDifferences[0].Path,
			diff.JSONDifferences[len(diff.JSONDifferences)-1].Path,
		)
	}
}

func TestEnvironmentComparisonBoundsHeaderDifferencesAndSignalsTruncation(t *testing.T) {
	t.Parallel()
	baselineHeaders := make(map[string][]string, maxEnvironmentDifferences+1)
	candidateHeaders := make(map[string][]string, maxEnvironmentDifferences+1)
	for index := 0; index <= maxEnvironmentDifferences; index++ {
		key := "X-Difference-" + strconv.Itoa(index)
		baselineHeaders[key] = []string{"baseline"}
		candidateHeaders[key] = []string{"candidate"}
	}
	diff := compareEnvironmentResponses(
		EnvironmentResponse{Name: "local", StatusCode: http.StatusOK, Headers: baselineHeaders, Body: `{}`},
		EnvironmentResponse{Name: "test", StatusCode: http.StatusOK, Headers: candidateHeaders, Body: `{}`},
		normalizedIgnoredHeaders(nil),
		nil,
	)
	if !diff.HeaderDifferencesTruncated ||
		len(diff.HeaderDifferences) != maxEnvironmentDifferences {
		t.Fatalf("bounded header comparison = %#v", diff)
	}
}

func TestEnvironmentComparisonQuotesAmbiguousJSONPathKeys(t *testing.T) {
	t.Parallel()
	diff := compareEnvironmentResponses(
		EnvironmentResponse{
			Name:       "local",
			StatusCode: http.StatusOK,
			Body:       `{"a.b":1,"*":1}`,
		},
		EnvironmentResponse{
			Name:       "test",
			StatusCode: http.StatusOK,
			Body:       `{"a.b":2,"*":2}`,
		},
		normalizedIgnoredHeaders(nil),
		nil,
	)
	if len(diff.JSONDifferences) != 2 ||
		diff.JSONDifferences[0].Path != `$["*"]` ||
		diff.JSONDifferences[1].Path != `$["a.b"]` {
		t.Fatalf("escaped JSON paths = %#v", diff.JSONDifferences)
	}

	ignored, err := compileJSONPaths([]string{`$["a.b"]`})
	if err != nil {
		t.Fatal(err)
	}
	diff = compareEnvironmentResponses(
		EnvironmentResponse{Name: "local", StatusCode: http.StatusOK, Body: `{"a.b":1,"*":1}`},
		EnvironmentResponse{Name: "test", StatusCode: http.StatusOK, Body: `{"a.b":2,"*":2}`},
		normalizedIgnoredHeaders(nil),
		ignored,
	)
	if len(diff.JSONDifferences) != 1 ||
		diff.JSONDifferences[0].Path != `$["*"]` {
		t.Fatalf("quoted ignore path result = %#v", diff.JSONDifferences)
	}
}

func TestEnvironmentComparisonBoundsJSONPathAndTraversal(t *testing.T) {
	t.Parallel()
	if _, err := compileJSONPaths([]string{
		"$." + strings.Repeat("x", maxEnvironmentJSONPathBytes),
	}); ErrorCode(err) != CodeLimitExceeded {
		t.Fatalf("oversized JSON path error = %v", err)
	}

	body := strings.Repeat(`{"child":`, maxEnvironmentJSONDiffDepth+2) +
		`0` +
		strings.Repeat(`}`, maxEnvironmentJSONDiffDepth+2)
	diff := compareEnvironmentResponses(
		EnvironmentResponse{Name: "local", StatusCode: http.StatusOK, Body: body},
		EnvironmentResponse{Name: "test", StatusCode: http.StatusOK, Body: body},
		normalizedIgnoredHeaders(nil),
		nil,
	)
	if diff.BodyEqual || !diff.JSONDifferencesTruncated {
		t.Fatalf("deep JSON comparison = %#v", diff)
	}
}

func TestEnvironmentComparisonSummarizesCompositeDifferenceValues(t *testing.T) {
	t.Parallel()
	diff := compareEnvironmentResponses(
		EnvironmentResponse{Name: "local", StatusCode: http.StatusOK, Body: `{"items":[1,2,3]}`},
		EnvironmentResponse{Name: "test", StatusCode: http.StatusOK, Body: `{}`},
		normalizedIgnoredHeaders(nil),
		nil,
	)
	if len(diff.JSONDifferences) != 1 ||
		diff.JSONDifferences[0].Baseline != "<array: 3 items>" {
		t.Fatalf("composite difference preview = %#v", diff.JSONDifferences)
	}
}
