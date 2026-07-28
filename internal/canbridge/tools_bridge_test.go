package canbridge

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"validex/internal/core"
	"validex/internal/protocols"

	"github.com/getkin/kin-openapi/openapi3"
)

func TestMockServerBridgeLifecycleAndHitSnapshot(t *testing.T) {
	t.Parallel()

	bridge := NewBridge()
	t.Cleanup(func() {
		Shutdown(bridge)(context.Background())
	})

	updated := bridge.UpdateMockRoutes([]MockRoute{{
		ID:      "get-order",
		Method:  http.MethodGet,
		Path:    "/orders/{id}",
		Status:  http.StatusCreated,
		Headers: map[string]string{"Content-Type": "application/json", "X-Validex-Mock": "true"},
		Body:    `{"source":"mock"}`,
		Enabled: true,
	}})
	if updated.Error != nil {
		t.Fatalf("UpdateMockRoutes() error = %#v", updated.Error)
	}
	if updated.State.RouteCount != 1 || updated.State.EnabledCount != 1 || len(updated.Routes) != 1 {
		t.Fatalf("unexpected route snapshot: %#v", updated)
	}

	started := bridge.StartMockServer(MockStartInput{Port: 0, EnableCORS: true})
	if started.Error != nil {
		t.Fatalf("StartMockServer() error = %#v", started.Error)
	}
	if !started.State.Running || started.State.Port == 0 || started.State.Host != "127.0.0.1" ||
		!strings.HasPrefix(started.State.BaseURL, "http://127.0.0.1:") {
		t.Fatalf("unexpected running state: %#v", started.State)
	}

	request, err := http.NewRequest(http.MethodGet, started.State.BaseURL+"/orders/42?expand=true", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}
	request.Header.Set("Origin", "http://validex.local")
	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("mock HTTP request error = %v", err)
	}
	body, readErr := io.ReadAll(response.Body)
	closeErr := response.Body.Close()
	if readErr != nil {
		t.Fatalf("reading mock response error = %v", readErr)
	}
	if closeErr != nil {
		t.Fatalf("closing mock response error = %v", closeErr)
	}
	if response.StatusCode != http.StatusCreated || string(body) != `{"source":"mock"}` {
		t.Fatalf("unexpected mock response: status=%d body=%q", response.StatusCode, body)
	}
	if response.Header.Get("X-Validex-Mock") != "true" ||
		response.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("unexpected mock headers: %#v", response.Header)
	}

	snapshot := bridge.GetMockServer()
	if snapshot.Error != nil {
		t.Fatalf("GetMockServer() error = %#v", snapshot.Error)
	}
	if snapshot.State.HitCount != 1 || snapshot.State.TotalHits != 1 || len(snapshot.Hits) != 1 {
		t.Fatalf("unexpected hit counters: %#v", snapshot)
	}
	hit := snapshot.Hits[0]
	if !hit.Matched || hit.RouteID != "get-order" || hit.Method != http.MethodGet ||
		hit.Path != "/orders/42" || hit.RawQuery != "expand=true" ||
		hit.PathParams["id"] != "42" || hit.Status != http.StatusCreated ||
		hit.Timestamp == "" {
		t.Fatalf("unexpected mapped hit: %#v", hit)
	}

	stopped := bridge.StopMockServer()
	if stopped.Error != nil {
		t.Fatalf("StopMockServer() error = %#v", stopped.Error)
	}
	if stopped.State.Running || stopped.State.BaseURL != "" || stopped.State.RouteCount != 1 {
		t.Fatalf("unexpected stopped state: %#v", stopped.State)
	}
}

func TestMockServerBridgeSerializesConcurrentStateCommands(t *testing.T) {
	t.Parallel()

	bridge := NewBridge()
	const commandCount = 24
	results := make(chan MockServerSnapshot, commandCount)
	for index := 0; index < commandCount; index++ {
		index := index
		go func() {
			switch index % 3 {
			case 0:
				results <- bridge.UpdateMockRoutes([]MockRoute{{
					ID:      fmt.Sprintf("route-%d", index),
					Method:  http.MethodGet,
					Path:    fmt.Sprintf("/route-%d", index),
					Status:  http.StatusOK,
					Enabled: true,
				}})
			case 1:
				results <- bridge.ClearMockHits()
			default:
				results <- bridge.GetMockServer()
			}
		}()
	}

	for index := 0; index < commandCount; index++ {
		if result := <-results; result.Error != nil {
			t.Fatalf("concurrent mock command failed: %#v", result.Error)
		}
	}
	final := bridge.GetMockServer()
	if final.State.RouteCount > 1 || len(final.Routes) > 1 {
		t.Fatalf("mock command facade returned an invalid snapshot: %#v", final)
	}
}

func TestRunSSEMapsHandshakeAndEvents(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("X-Validex-Client") != "bridge-test" {
			http.Error(response, "missing client header", http.StatusUnauthorized)
			return
		}
		response.Header().Set("Content-Type", "text/event-stream")
		response.Header().Set("X-Stream", "orders")
		response.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(response, "id: event-1\n")
		_, _ = io.WriteString(response, "event: order-updated\n")
		_, _ = io.WriteString(response, "retry: 1500\n")
		_, _ = io.WriteString(response, "data: first line\n")
		_, _ = io.WriteString(response, "data: second line\n\n")
		_, _ = io.WriteString(response, "data: complete\n\n")
	}))
	t.Cleanup(server.Close)

	result := NewBridge().RunSSE(SSEInput{
		OperationID: "sse-map-events",
		URL:         server.URL,
		Headers:     map[string]string{"X-Validex-Client": "bridge-test"},
		TimeoutMS:   2_000,
		MaxEvents:   2,
	})
	if result.Error != nil {
		t.Fatalf("RunSSE() error = %#v", result.Error)
	}
	if result.StatusCode != http.StatusOK || len(result.Headers["X-Stream"]) != 1 ||
		result.Headers["X-Stream"][0] != "orders" ||
		len(result.Events) != 2 {
		t.Fatalf("unexpected SSE result: %#v", result)
	}
	first := result.Events[0]
	if first.ID != "event-1" || first.Event != "order-updated" ||
		first.Data != "first line\nsecond line" || !first.HasRetry || first.RetryMillis != 1500 {
		t.Fatalf("unexpected first SSE event: %#v", first)
	}
	if second := result.Events[1]; second.Event != "message" || second.ID != "event-1" ||
		second.Data != "complete" || !second.HasRetry || second.RetryMillis != 1500 {
		t.Fatalf("unexpected second SSE event: %#v", second)
	}
	if result.DurationMS < 0 {
		t.Fatalf("DurationMS = %d, want non-negative", result.DurationMS)
	}
}

func TestShutdownCancelsInFlightSSEBridgeOperation(t *testing.T) {
	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "text/event-stream")
		response.WriteHeader(http.StatusOK)
		if flusher, ok := response.(http.Flusher); ok {
			flusher.Flush()
		}
		close(started)
		<-request.Context().Done()
	}))
	defer server.Close()

	bridge := NewBridge()
	resultChannel := make(chan SSEResult, 1)
	go func() {
		resultChannel <- bridge.RunSSE(SSEInput{
			OperationID: "sse-shutdown",
			URL:         server.URL,
			TimeoutMS:   10_000,
			MaxEvents:   1,
		})
	}()

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("SSE request did not reach server")
	}
	Shutdown(bridge)(context.Background())

	select {
	case result := <-resultChannel:
		if result.Error == nil || result.Error.Code != "tool_canceled" {
			t.Fatalf("expected tool_canceled, got %#v", result.Error)
		}
	case <-time.After(time.Second):
		t.Fatal("RunSSE did not stop after bridge shutdown")
	}
}

func TestCancelToolOperationDoesNotCancelHTTPRequestWithSameID(t *testing.T) {
	sseStarted := make(chan struct{})
	requestStarted := make(chan struct{})
	releaseRequest := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/events":
			response.Header().Set("Content-Type", "text/event-stream")
			response.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(response, "id: partial-1\ndata: received-before-cancel\n\n")
			if flusher, ok := response.(http.Flusher); ok {
				flusher.Flush()
			}
			close(sseStarted)
			<-request.Context().Done()
		case "/request":
			close(requestStarted)
			<-releaseRequest
			response.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(response, `{"ok":true}`)
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()
	defer func() {
		select {
		case <-releaseRequest:
		default:
			close(releaseRequest)
		}
	}()

	bridge := NewBridge()
	defer Shutdown(bridge)(context.Background())

	sseResultChannel := make(chan SSEResult, 1)
	go func() {
		sseResultChannel <- bridge.RunSSE(SSEInput{
			OperationID: "shared-operation-id",
			URL:         server.URL + "/events",
			TimeoutMS:   10_000,
			MaxEvents:   2,
		})
	}()
	requestResultChannel := make(chan SendResult, 1)
	go func() {
		requestResultChannel <- bridge.SendRequest(RequestInput{
			ID:        "shared-operation-id",
			Method:    http.MethodGet,
			URL:       server.URL + "/request",
			TimeoutMS: 10_000,
		})
	}()

	for name, started := range map[string]<-chan struct{}{
		"SSE":     sseStarted,
		"request": requestStarted,
	} {
		select {
		case <-started:
		case <-time.After(time.Second):
			t.Fatalf("%s operation did not reach server", name)
		}
	}
	if !bridge.CancelToolOperation("shared-operation-id") {
		t.Fatal("CancelToolOperation() = false, want true")
	}
	select {
	case result := <-sseResultChannel:
		if result.Error == nil || result.Error.Code != "tool_canceled" {
			t.Fatalf("expected tool_canceled, got %#v", result.Error)
		}
	case <-time.After(time.Second):
		t.Fatal("SSE operation did not stop after targeted cancellation")
	}

	select {
	case result := <-requestResultChannel:
		t.Fatalf("HTTP request was canceled by tool cancellation: %#v", result)
	case <-time.After(50 * time.Millisecond):
	}

	close(releaseRequest)
	select {
	case result := <-requestResultChannel:
		if result.Error != nil || result.Response == nil ||
			result.Response.StatusCode != http.StatusOK {
			t.Fatalf("HTTP request did not complete normally: %#v", result)
		}
	case <-time.After(time.Second):
		t.Fatal("HTTP request did not finish after release")
	}
}

func TestMapSSEResultPreservesParsedEventsOnCancellation(t *testing.T) {
	t.Parallel()

	result := mapSSEResult(protocols.SSEResult{
		StatusCode: http.StatusOK,
		Headers:    http.Header{"Content-Type": []string{"text/event-stream"}},
		Events: []protocols.SSEEvent{{
			Event: "order.updated",
			ID:    "partial-1",
			Data:  "received-before-cancel",
		}},
		Duration: 25 * time.Millisecond,
	}, context.Canceled)
	if result.Error == nil || result.Error.Code != "tool_canceled" {
		t.Fatalf("error = %#v, want tool_canceled", result.Error)
	}
	if len(result.Events) != 1 || result.Events[0].ID != "partial-1" ||
		result.Events[0].Data != "received-before-cancel" {
		t.Fatalf("partial SSE events were not preserved: %#v", result.Events)
	}
}

func TestDuplicateToolOperationIDDoesNotReplaceRunningOperation(t *testing.T) {
	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "text/event-stream")
		response.WriteHeader(http.StatusOK)
		if flusher, ok := response.(http.Flusher); ok {
			flusher.Flush()
		}
		close(started)
		<-request.Context().Done()
	}))
	defer server.Close()

	bridge := NewBridge()
	defer Shutdown(bridge)(context.Background())
	firstResult := make(chan SSEResult, 1)
	go func() {
		firstResult <- bridge.RunSSE(SSEInput{
			OperationID: "duplicate-id",
			URL:         server.URL,
			TimeoutMS:   10_000,
			MaxEvents:   1,
		})
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("first SSE operation did not reach server")
	}

	duplicate := bridge.RunSSE(SSEInput{
		OperationID: "duplicate-id",
		URL:         server.URL,
		TimeoutMS:   1_000,
		MaxEvents:   1,
	})
	if duplicate.Error == nil || duplicate.Error.Code != "invalid_input" {
		t.Fatalf(
			"duplicate operation error = %#v, want invalid_input",
			duplicate.Error,
		)
	}
	if strings.Contains(duplicate.Error.Message, errInvalidToolOperation.Error()) {
		t.Fatalf(
			"duplicate operation exposed internal sentinel: %#v",
			duplicate.Error,
		)
	}
	if !bridge.CancelToolOperation("duplicate-id") {
		t.Fatal("original operation was no longer registered")
	}
	select {
	case result := <-firstResult:
		if result.Error == nil || result.Error.Code != "tool_canceled" {
			t.Fatalf("original operation error = %#v, want tool_canceled", result.Error)
		}
	case <-time.After(time.Second):
		t.Fatal("original operation did not stop")
	}
	if bridge.CancelToolOperation("duplicate-id") {
		t.Fatal("completed operation remained registered")
	}
}

func TestInspectActuatorMapsHealthMappingsMetricsAndBaselineDelta(t *testing.T) {
	t.Parallel()

	var liveThreads atomic.Int64
	liveThreads.Store(10)
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer actuator-test" {
			http.Error(response, "missing authorization", http.StatusUnauthorized)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/actuator/health":
			_, _ = io.WriteString(response, `{
				"status":"UP",
				"groups":["readiness"],
				"components":{
					"db":{"status":"UP","details":{"active":2}},
					"redis":{"status":"UP"}
				}
			}`)
		case "/actuator/mappings":
			_, _ = io.WriteString(response, `{"contexts":{"application":{"mappings":{"dispatcherServlets":{}}}}}`)
		case "/actuator/metrics/jvm.threads.live":
			_ = json.NewEncoder(response).Encode(map[string]any{
				"name":        "jvm.threads.live",
				"description": "The current number of live threads",
				"baseUnit":    "threads",
				"measurements": []map[string]any{{
					"statistic": "VALUE",
					"value":     liveThreads.Load(),
				}},
				"availableTags": []map[string]any{{"tag": "state", "values": []string{"live"}}},
			})
		default:
			http.NotFound(response, request)
		}
	}))
	t.Cleanup(server.Close)

	bridge := NewBridge()
	before := bridge.InspectActuator(ActuatorInspectInput{
		BaseURL:         server.URL + "/actuator",
		Headers:         map[string]string{"Authorization": "Bearer actuator-test"},
		TimeoutMS:       2_000,
		MetricNames:     []string{"jvm.threads.live"},
		IncludeMappings: true,
	})
	if before.Error != nil {
		t.Fatalf("first InspectActuator() error = %#v", before.Error)
	}
	if before.Health == nil || before.Health.Status != "UP" ||
		len(before.Health.Components) != 2 || len(before.Health.Groups) != 1 {
		t.Fatalf("unexpected health mapping: %#v", before.Health)
	}
	if before.Mappings == nil || len(before.Mappings.Contexts) != 1 {
		t.Fatalf("unexpected mappings result: %#v", before.Mappings)
	}
	metric := before.Metrics.Metrics["jvm.threads.live"]
	if metric.Name != "jvm.threads.live" || metric.BaseUnit != "threads" ||
		metric.Measurements["VALUE"] != 10 || len(metric.AvailableTags) != 1 ||
		before.Metrics.CapturedAt == "" {
		t.Fatalf("unexpected metric snapshot: %#v", before.Metrics)
	}

	liveThreads.Store(15)
	after := bridge.InspectActuator(ActuatorInspectInput{
		BaseURL:     server.URL + "/actuator",
		Headers:     map[string]string{"Authorization": "Bearer actuator-test"},
		TimeoutMS:   2_000,
		MetricNames: []string{"jvm.threads.live"},
		Before:      &before.Metrics,
	})
	if after.Error != nil {
		t.Fatalf("second InspectActuator() error = %#v", after.Error)
	}
	if len(after.Deltas) != 1 {
		t.Fatalf("metric deltas = %#v, want one", after.Deltas)
	}
	delta := after.Deltas[0]
	if delta.Metric != "jvm.threads.live" || delta.Statistic != "VALUE" ||
		delta.Before == nil || *delta.Before != 10 ||
		delta.After == nil || *delta.After != 15 ||
		delta.Delta == nil || *delta.Delta != 5 ||
		delta.PercentChange == nil || *delta.PercentChange != 50 {
		t.Fatalf("unexpected bridge metric delta: %#v", delta)
	}
}

func TestBridgeErrorResultsKeepRequiredCollectionsNonNull(t *testing.T) {
	t.Parallel()

	bridge := NewBridge()
	tests := []struct {
		name      string
		result    any
		fragments []string
	}{
		{
			name:   "OpenAPI import",
			result: bridge.ImportOpenAPI(),
			fragments: []string{
				`"endpoints":[]`,
			},
		},
		{
			name:   "contract validation",
			result: bridge.ValidateOpenAPIResponse(ContractCheckInput{}),
			fragments: []string{
				`"findings":[]`,
			},
		},
		{
			name: "Actuator inspection",
			result: bridge.InspectActuator(ActuatorInspectInput{
				BaseURL:   "not-an-http-url",
				TimeoutMS: 1_000,
			}),
			fragments: []string{
				`"metrics":{"capturedAt":"","metrics":{}}`,
				`"deltas":[]`,
			},
		},
		{
			name:   "thread dump",
			result: bridge.AnalyzeThreadDump(ThreadDumpInput{}),
			fragments: []string{
				`"stateCounts":{}`,
			},
		},
		{
			name:   "coverage",
			result: bridge.AnalyzeEndpointCoverage(CoverageInput{}),
			fragments: []string{
				`"endpoints":[]`,
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload, err := json.Marshal(test.result)
			if err != nil {
				t.Fatalf("json.Marshal() error = %v", err)
			}
			for _, fragment := range test.fragments {
				if !bytes.Contains(payload, []byte(fragment)) {
					t.Fatalf("JSON = %s, want fragment %s", payload, fragment)
				}
			}
		})
	}
}

func TestCompareEnvironmentsMapsLocalTestAndStagingDifferences(t *testing.T) {
	t.Parallel()

	newEnvironment := func(release string, status int) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			if request.URL.Path != "/api/orders" || request.URL.Query().Get("limit") != "1" {
				http.NotFound(response, request)
				return
			}
			response.Header().Set("Content-Type", "application/json")
			response.Header().Set("X-Release", release)
			response.WriteHeader(status)
			_, _ = fmt.Fprintf(response, `{"release":%q,"orders":[1]}`, release)
		}))
	}
	local := newEnvironment("local", http.StatusOK)
	testServer := newEnvironment("test", http.StatusOK)
	staging := newEnvironment("staging", http.StatusAccepted)
	t.Cleanup(local.Close)
	t.Cleanup(testServer.Close)
	t.Cleanup(staging.Close)

	result := NewBridge().CompareEnvironments(EnvironmentCompareInput{
		Method: http.MethodGet,
		Path:   "/api/orders?limit=1",
		Targets: []EnvironmentTarget{
			{Name: "local", BaseURL: local.URL},
			{Name: "test", BaseURL: testServer.URL},
			{Name: "staging", BaseURL: staging.URL},
		},
		TimeoutMS: 2_000,
	})
	if result.Error != nil {
		t.Fatalf("CompareEnvironments() error = %#v", result.Error)
	}
	if result.Method != http.MethodGet || result.Path != "/api/orders?limit=1" ||
		len(result.Responses) != 3 || len(result.Comparisons) != 2 {
		t.Fatalf("unexpected comparison result: %#v", result)
	}
	for index, name := range []string{"local", "test", "staging"} {
		if result.Responses[index].Name != name || result.Responses[index].URL == "" ||
			result.Responses[index].ContentType != "application/json" ||
			result.Responses[index].DurationMS < 0 || result.Responses[index].Error != "" {
			t.Fatalf("unexpected response[%d]: %#v", index, result.Responses[index])
		}
	}
	testDiff := result.Comparisons[0]
	if testDiff.Baseline != "local" || testDiff.Candidate != "test" ||
		!testDiff.StatusMatch || testDiff.BodyEqual || testDiff.BodyMode != "json" ||
		len(testDiff.JSONDifferences) != 1 || testDiff.JSONDifferences[0].Path != "$.release" {
		t.Fatalf("unexpected local/test diff: %#v", testDiff)
	}
	stagingDiff := result.Comparisons[1]
	if stagingDiff.Baseline != "local" || stagingDiff.Candidate != "staging" ||
		stagingDiff.StatusMatch || stagingDiff.BaselineStatus != http.StatusOK ||
		stagingDiff.CandidateStatus != http.StatusAccepted ||
		stagingDiff.BodyEqual || stagingDiff.BodyMode != "json" ||
		len(stagingDiff.JSONDifferences) != 1 ||
		len(stagingDiff.HeaderDifferences) != 1 || stagingDiff.HeaderDifferences[0] != "x-release" {
		t.Fatalf("unexpected local/staging diff: %#v", stagingDiff)
	}
}

func TestTextDiagnosticsAndCoverageBridgeMappings(t *testing.T) {
	t.Parallel()

	bridge := NewBridge()
	threadDump := `"worker-1" #1
   java.lang.Thread.State: BLOCKED (on object monitor)
        at com.example.Worker.run(Worker.java:10)
        - waiting to lock <0x1> (a java.lang.Object)

"worker-2" #2
   java.lang.Thread.State: WAITING (parking)
        at com.example.Worker.run(Worker.java:20)
        - parking to wait for <0x2>

Found one Java-level deadlock:
"worker-1":
  which is held by "worker-2"
`
	threads := bridge.AnalyzeThreadDump(ThreadDumpInput{Text: threadDump})
	if threads.Error != nil {
		t.Fatalf("AnalyzeThreadDump() error = %#v", threads.Error)
	}
	if threads.ThreadCount != 2 || threads.StateCounts["BLOCKED"] != 1 ||
		threads.StateCounts["WAITING"] != 1 || !threads.DeadlockDetected ||
		len(threads.DeadlockClues) == 0 || len(threads.BlockedThreads) != 2 ||
		len(threads.RepeatedStacks) != 1 || threads.RepeatedStacks[0].Count != 2 {
		t.Fatalf("unexpected thread dump mapping: %#v", threads)
	}

	logs := bridge.SearchTraceLog(LogSearchInput{
		Text: "INFO request started traceId=TRACE-42\n" +
			"INFO unrelated\n" +
			"ERROR request failed correlationId=trace-42",
		Query: "trace-42",
	})
	if logs.Error != nil {
		t.Fatalf("SearchTraceLog() error = %#v", logs.Error)
	}
	if logs.Query != "trace-42" || logs.ScannedLines != 3 || logs.Truncated ||
		len(logs.Matches) != 2 || logs.Matches[0].LineNumber != 1 ||
		logs.Matches[1].LineNumber != 3 {
		t.Fatalf("unexpected log search mapping: %#v", logs)
	}

	coverage := bridge.AnalyzeEndpointCoverage(CoverageInput{
		Known: []KnownEndpoint{
			{Method: http.MethodGet, Path: "/orders/{id}"},
			{Method: http.MethodPost, Path: "/orders"},
		},
		Observed: []ObservedCall{
			{Method: http.MethodGet, Path: "/orders/42?expand=true", Count: 2},
			{Method: http.MethodDelete, Path: "/orders/42", Count: 1},
		},
	})
	if coverage.Error != nil {
		t.Fatalf("AnalyzeEndpointCoverage() error = %#v", coverage.Error)
	}
	if coverage.TotalKnown != 2 || coverage.Covered != 1 || coverage.CoveragePercent != 50 ||
		len(coverage.Endpoints) != 2 || len(coverage.UnknownObserved) != 1 ||
		coverage.UnknownObserved[0].Method != http.MethodDelete ||
		coverage.UnknownObserved[0].Count != 1 {
		t.Fatalf("unexpected coverage mapping: %#v", coverage)
	}
	var template EndpointCoverage
	for _, endpoint := range coverage.Endpoints {
		if endpoint.Path == "/orders/{id}" {
			template = endpoint
		}
	}
	if template.HitCount != 2 || len(template.ObservedPaths) != 1 ||
		template.ObservedPaths[0] != "/orders/42" {
		t.Fatalf("unexpected template coverage: %#v", template)
	}
}

func TestCoverageUsesImportedSpecsAndSuccessfulRequestsFromCurrentSession(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/orders/42" {
			http.NotFound(response, request)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(response, `{"id":42}`)
	}))
	t.Cleanup(server.Close)

	bridge := NewBridge()
	bridge.specs["orders"] = []core.Endpoint{
		{Method: http.MethodGet, Path: "/orders/{id}"},
		{Method: http.MethodPost, Path: "/orders"},
	}
	sent := bridge.SendRequest(RequestInput{
		ID: "coverage-request", Method: http.MethodGet,
		URL: server.URL + "/orders/42", TimeoutMS: 2_000,
	})
	if sent.Error != nil {
		t.Fatalf("SendRequest() error = %#v", sent.Error)
	}

	coverage := bridge.AnalyzeEndpointCoverage(CoverageInput{})
	if coverage.Error != nil {
		t.Fatalf("AnalyzeEndpointCoverage() error = %#v", coverage.Error)
	}
	if coverage.TotalKnown != 2 || coverage.Covered != 1 ||
		coverage.CoveragePercent != 50 {
		t.Fatalf("unexpected recorded coverage: %#v", coverage)
	}
}

func TestOpenAPISpecCacheEvictsOldestAndCoverageUsesLatestSpec(t *testing.T) {
	bridge := NewBridge()
	for index := 0; index <= maxCachedOpenAPISpecs; index++ {
		specID := fmt.Sprintf("spec-%02d", index)
		bridge.cacheOpenAPISpec(specID, []core.Endpoint{{
			Method: http.MethodGet,
			Path:   fmt.Sprintf("/spec/%d", index),
		}})
	}
	if len(bridge.specs) != maxCachedOpenAPISpecs {
		t.Fatalf("cached specs = %d, want %d", len(bridge.specs), maxCachedOpenAPISpecs)
	}
	if _, exists := bridge.specs["spec-00"]; exists {
		t.Fatal("oldest cached spec was not evicted")
	}
	if got := bridge.specOrder[0]; got != "spec-01" {
		t.Fatalf("oldest retained spec = %q, want spec-01", got)
	}
	known, _ := bridge.recordedCoverageInput()
	if len(known) != 1 || known[0].Path != fmt.Sprintf("/spec/%d", maxCachedOpenAPISpecs) {
		t.Fatalf("recorded coverage known endpoints = %#v, want latest spec only", known)
	}
}

func TestObservedCoverageUsesBoundedRingAndCanBeReset(t *testing.T) {
	bridge := NewBridge()
	for index := 0; index <= maxObservedCoverageEntries; index++ {
		bridge.recordObservedCall(http.MethodGet, fmt.Sprintf("/orders/%d", index))
	}
	if len(bridge.observed) != maxObservedCoverageEntries ||
		len(bridge.observedOrder) != maxObservedCoverageEntries {
		t.Fatalf(
			"observed coverage sizes = map:%d order:%d, want %d",
			len(bridge.observed),
			len(bridge.observedOrder),
			maxObservedCoverageEntries,
		)
	}
	if _, exists := bridge.observed[http.MethodGet+"\x00/orders/0"]; exists {
		t.Fatal("oldest observed coverage entry was not evicted")
	}
	newestKey := fmt.Sprintf("%s\x00/orders/%d", http.MethodGet, maxObservedCoverageEntries)
	if bridge.observed[newestKey] != 1 {
		t.Fatal("newest observed coverage entry is missing")
	}
	bridge.ResetEndpointCoverage()
	if len(bridge.observed) != 0 || len(bridge.observedOrder) != 0 || bridge.observedNext != 0 {
		t.Fatalf("coverage reset did not clear state: %#v", bridge.observed)
	}
}

func TestValidateOpenAPIResponseExplainsMissingJSONSchema(t *testing.T) {
	bridge := NewBridge()
	bridge.specs["schema-less"] = []core.Endpoint{{
		Path:   "/health",
		Method: http.MethodGet,
		Operation: &openapi3.Operation{
			Responses: openapi3.NewResponses(
				openapi3.WithStatus(http.StatusOK, &openapi3.ResponseRef{
					Value: openapi3.NewResponse().WithDescription("OK"),
				}),
			),
		},
	}}

	result := bridge.ValidateOpenAPIResponse(ContractCheckInput{
		SpecID:      "schema-less",
		Method:      http.MethodGet,
		Path:        "/health",
		StatusCode:  http.StatusOK,
		ContentType: "application/problem+json; charset=utf-8",
		Body:        `{"status":"UP"}`,
	})

	if result.Available || result.OK {
		t.Fatalf("result = %#v, want unavailable contract", result)
	}
	if result.Error == nil || result.Error.Code != "response_schema_unavailable" {
		t.Fatalf("error = %#v", result.Error)
	}
	if !strings.Contains(result.Error.Message, "application/problem+json; charset=utf-8") ||
		!strings.Contains(result.Error.Message, "JSON media schema") {
		t.Fatalf("missing schema message does not explain the media type: %#v", result.Error)
	}
}

func TestValidateOpenAPIResponseDecodesPresentedBase64Body(t *testing.T) {
	t.Parallel()
	bridge := NewBridge()
	bridge.specs["encoded"] = []core.Endpoint{{
		Path:   "/value",
		Method: http.MethodGet,
		Operation: &openapi3.Operation{
			Responses: openapi3.NewResponses(
				openapi3.WithStatus(http.StatusOK, &openapi3.ResponseRef{
					Value: openapi3.NewResponse().
						WithDescription("OK").
						WithJSONSchema(openapi3.NewIntegerSchema()),
				}),
			),
		},
	}}

	result := bridge.ValidateOpenAPIResponse(ContractCheckInput{
		SpecID:       "encoded",
		Method:       http.MethodGet,
		Path:         "/value",
		StatusCode:   http.StatusOK,
		ContentType:  "application/json",
		Body:         base64.StdEncoding.EncodeToString([]byte("42")),
		BodyEncoding: ResponseBodyBase64,
	})
	if !result.Available || !result.OK || len(result.Findings) != 0 {
		t.Fatalf("base64 contract result = %#v", result)
	}

	invalid := bridge.ValidateOpenAPIResponse(ContractCheckInput{
		SpecID:       "encoded",
		Method:       http.MethodGet,
		Path:         "/value",
		StatusCode:   http.StatusOK,
		ContentType:  "application/json",
		Body:         "not-base64!",
		BodyEncoding: ResponseBodyBase64,
	})
	if invalid.Error == nil ||
		invalid.Error.Code != UserErrorBodyEncodingInvalid {
		t.Fatalf("invalid base64 contract result = %#v", invalid)
	}
}

func TestValidateOpenAPIResponseMapsFindingTruncation(t *testing.T) {
	bridge := NewBridge()
	bridge.specs["bounded-contract"] = []core.Endpoint{{
		Path:   "/values",
		Method: http.MethodGet,
		Operation: &openapi3.Operation{
			Responses: openapi3.NewResponses(
				openapi3.WithStatus(http.StatusOK, &openapi3.ResponseRef{
					Value: openapi3.NewResponse().
						WithDescription("OK").
						WithJSONSchema(
							openapi3.NewArraySchema().
								WithItems(openapi3.NewStringSchema()),
						),
				}),
			),
		},
	}}
	values := make([]int, 1001)
	for index := range values {
		values[index] = index
	}
	body, err := json.Marshal(values)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	result := bridge.ValidateOpenAPIResponse(ContractCheckInput{
		SpecID:      "bounded-contract",
		Method:      http.MethodGet,
		Path:        "/values",
		StatusCode:  http.StatusOK,
		ContentType: "application/json",
		Body:        string(body),
	})

	if !result.Available || result.OK || !result.Truncated ||
		len(result.Findings) != 1000 {
		t.Fatalf("bounded contract result = %#v", result)
	}
}
