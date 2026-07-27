package diagnostics

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestActuatorClientFetchesHealthMappingsAndPartialMetrics(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer test-token" {
			http.Error(response, "missing auth", http.StatusUnauthorized)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/actuator/health":
			_, _ = response.Write([]byte(`{"status":"UP","groups":["readiness"],"components":{"db":{"status":"UP"}}}`))
		case "/actuator/mappings":
			_, _ = response.Write([]byte(`{"contexts":{"application":{"mappings":{"dispatcherServlets":{}}}}}`))
		case "/actuator/metrics/jvm.memory.used":
			_, _ = response.Write([]byte(`{
				"name":"jvm.memory.used",
				"description":"Memory used",
				"baseUnit":"bytes",
				"measurements":[{"statistic":"VALUE","value":42}],
				"availableTags":[{"tag":"area","values":["heap"]}]
			}`))
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()

	client, err := NewActuatorClient(server.URL+"/actuator", ActuatorClientOptions{
		Headers: http.Header{"Authorization": []string{"Bearer test-token"}},
	})
	if err != nil {
		t.Fatalf("NewActuatorClient() error = %v", err)
	}
	health, err := client.FetchHealth(context.Background())
	if err != nil {
		t.Fatalf("FetchHealth() error = %v", err)
	}
	if health.Status != "UP" || len(health.Components) != 1 || len(health.Groups) != 1 {
		t.Fatalf("unexpected health snapshot: %#v", health)
	}
	mappings, err := client.FetchMappings(context.Background())
	if err != nil {
		t.Fatalf("FetchMappings() error = %v", err)
	}
	if len(mappings.Contexts) != 1 {
		t.Fatalf("unexpected mappings snapshot: %#v", mappings)
	}
	metrics, err := client.FetchMetrics(context.Background(), []string{"missing.metric", "jvm.memory.used", "jvm.memory.used"})
	if err != nil {
		t.Fatalf("FetchMetrics() error = %v", err)
	}
	if got := metrics.Metrics["jvm.memory.used"].Measurements["VALUE"]; got != 42 {
		t.Fatalf("metric VALUE = %v, want 42", got)
	}
	if metrics.Failures["missing.metric"] != "Actuator returned HTTP 404." {
		t.Fatalf("unexpected safe metric failure: %#v", metrics.Failures)
	}
}

func TestActuatorClientEnforcesResponseLimitAndTimeout(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Query().Get("slow") == "true" {
			time.Sleep(80 * time.Millisecond)
		}
		_, _ = response.Write([]byte(`{"status":"UP","padding":"` + strings.Repeat("x", 200) + `"}`))
	}))
	defer server.Close()

	limited, err := NewActuatorClient(server.URL, ActuatorClientOptions{MaxResponseBytes: 32})
	if err != nil {
		t.Fatalf("NewActuatorClient() error = %v", err)
	}
	_, err = limited.FetchHealth(context.Background())
	if ErrorCode(err) != CodeResponseTooLarge {
		t.Fatalf("FetchHealth() error code = %q, want %q (error: %v)", ErrorCode(err), CodeResponseTooLarge, err)
	}

	slowServer := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		time.Sleep(80 * time.Millisecond)
		_, _ = response.Write([]byte(`{"status":"UP"}`))
	}))
	defer slowServer.Close()
	timed, err := NewActuatorClient(slowServer.URL, ActuatorClientOptions{Timeout: 10 * time.Millisecond})
	if err != nil {
		t.Fatalf("NewActuatorClient() error = %v", err)
	}
	_, err = timed.FetchHealth(context.Background())
	if ErrorCode(err) != CodeRequestFailed {
		t.Fatalf("FetchHealth() timeout code = %q, want %q", ErrorCode(err), CodeRequestFailed)
	}
	if err != nil && strings.Contains(err.Error(), slowServer.URL) {
		t.Fatalf("user-facing error leaked URL: %v", err)
	}
}

func TestActuatorClientUsesOneOverallMetricDeadline(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		select {
		case <-time.After(100 * time.Millisecond):
		case <-request.Context().Done():
			return
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{
			"name":"` + strings.TrimPrefix(request.URL.Path, "/metrics/") + `",
			"measurements":[{"statistic":"VALUE","value":1}]
		}`))
	}))
	defer server.Close()

	client, err := NewActuatorClient(server.URL, ActuatorClientOptions{Timeout: 150 * time.Millisecond})
	if err != nil {
		t.Fatalf("NewActuatorClient() error = %v", err)
	}
	started := time.Now()
	_, err = client.FetchMetrics(context.Background(), []string{"metric.one", "metric.two"})
	elapsed := time.Since(started)
	if ErrorCode(err) != CodeRequestFailed {
		t.Fatalf("FetchMetrics() error code = %q, want %q (error: %v)", ErrorCode(err), CodeRequestFailed, err)
	}
	if elapsed >= 250*time.Millisecond {
		t.Fatalf("FetchMetrics() took %s; metric timeouts appear to be multiplying", elapsed)
	}
}

func TestActuatorClientRefusesCrossOriginRedirect(t *testing.T) {
	t.Parallel()
	var receivedAuthorization string
	target := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		receivedAuthorization = request.Header.Get("Authorization")
		_, _ = response.Write([]byte(`{"status":"UP"}`))
	}))
	defer target.Close()
	source := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		http.Redirect(response, request, target.URL+"/health", http.StatusTemporaryRedirect)
	}))
	defer source.Close()

	client, err := NewActuatorClient(source.URL, ActuatorClientOptions{
		Headers: http.Header{"Authorization": []string{"Bearer secret"}},
	})
	if err != nil {
		t.Fatalf("NewActuatorClient() error = %v", err)
	}
	_, err = client.FetchHealth(context.Background())
	if ErrorCode(err) != CodeRequestFailed {
		t.Fatalf("FetchHealth() error code = %q, want %q", ErrorCode(err), CodeRequestFailed)
	}
	if receivedAuthorization != "" {
		t.Fatalf("authorization header leaked across redirect: %q", receivedAuthorization)
	}
}

func TestDiffMetricSnapshots(t *testing.T) {
	t.Parallel()
	before := MetricSnapshot{Metrics: map[string]MetricSample{
		"jvm.threads.live": {Measurements: map[string]float64{"VALUE": 10}},
		"only.before":      {Measurements: map[string]float64{"COUNT": 3}},
	}}
	after := MetricSnapshot{Metrics: map[string]MetricSample{
		"jvm.threads.live": {Measurements: map[string]float64{"VALUE": 15}},
		"only.after":       {Measurements: map[string]float64{"COUNT": 7}},
	}}
	deltas := DiffMetricSnapshots(before, after)
	if len(deltas) != 3 {
		t.Fatalf("len(DiffMetricSnapshots()) = %d, want 3", len(deltas))
	}
	var live MetricDelta
	for _, delta := range deltas {
		if delta.Metric == "jvm.threads.live" {
			live = delta
		}
	}
	if live.Delta == nil || *live.Delta != 5 || live.PercentChange == nil || *live.PercentChange != 50 {
		t.Fatalf("unexpected live metric delta: %#v", live)
	}
}

func TestDiagnosticErrorKeepsCauseOutOfUserMessage(t *testing.T) {
	t.Parallel()
	cause := errors.New("dial tcp 10.20.30.40: hidden detail")
	err := requestFailed(cause)
	if strings.Contains(err.Error(), "10.20.30.40") {
		t.Fatalf("safe error contains wrapped cause: %v", err)
	}
	if !errors.Is(err, cause) {
		t.Fatal("DiagnosticError does not unwrap its cause")
	}
}
