package diagnostics

import "testing"

func TestAnalyzeEndpointCoverageMatchesTemplatesAndAggregatesUnknownCalls(t *testing.T) {
	t.Parallel()
	report, err := AnalyzeEndpointCoverage(
		[]KnownEndpoint{
			{Method: "GET", Path: "/orders/{id}"},
			{Method: "GET", Path: "/orders/special"},
			{Method: "POST", Path: "/orders"},
			{Method: "GET", Path: "/assets/**"},
			{Method: "GET", Path: "/orders/{id}"}, // duplicate is ignored
		},
		[]ObservedCall{
			{Method: "get", Path: "/orders/42?view=full", Count: 2},
			{Method: "GET", Path: "/orders/special"},
			{Method: "GET", Path: "/assets/css/app.css"},
			{Method: "DELETE", Path: "/orders/42"},
			{Method: "DELETE", Path: "/orders/42", Count: 3},
		},
	)
	if err != nil {
		t.Fatalf("AnalyzeEndpointCoverage() error = %v", err)
	}
	if report.TotalKnown != 4 || report.Covered != 3 || report.CoveragePercent != 75 {
		t.Fatalf("unexpected coverage summary: %#v", report)
	}
	var template, literal EndpointCoverage
	for _, endpoint := range report.Endpoints {
		switch endpoint.Path {
		case "/orders/{id}":
			template = endpoint
		case "/orders/special":
			literal = endpoint
		}
	}
	if template.HitCount != 2 || literal.HitCount != 1 {
		t.Fatalf("specific route matching failed: template=%#v literal=%#v", template, literal)
	}
	if len(report.UnknownObserved) != 1 || report.UnknownObserved[0].Count != 4 {
		t.Fatalf("unknown calls were not aggregated: %#v", report.UnknownObserved)
	}
}

func TestAnalyzeEndpointCoverageSupportsSpringCatchAllAndRoot(t *testing.T) {
	t.Parallel()
	report, err := AnalyzeEndpointCoverage(
		[]KnownEndpoint{
			{Method: "GET", Path: "/"},
			{Method: "GET", Path: "/files/{*path}"},
		},
		[]ObservedCall{
			{Method: "GET", Path: "https://example.test/"},
			{Method: "GET", Path: "/files/a/b/c.txt"},
		},
	)
	if err != nil {
		t.Fatalf("AnalyzeEndpointCoverage() error = %v", err)
	}
	if report.Covered != 2 {
		t.Fatalf("Covered = %d, want 2: %#v", report.Covered, report)
	}
}

func TestAnalyzeEndpointCoverageRejectsNegativeCount(t *testing.T) {
	t.Parallel()
	_, err := AnalyzeEndpointCoverage(
		[]KnownEndpoint{{Method: "GET", Path: "/health"}},
		[]ObservedCall{{Method: "GET", Path: "/health", Count: -1}},
	)
	if ErrorCode(err) != CodeInvalidInput {
		t.Fatalf("error code = %q, want %q", ErrorCode(err), CodeInvalidInput)
	}
}

func TestAnalyzeEndpointCoverageRejectsUnsafeComparisonWork(t *testing.T) {
	t.Parallel()
	known := make([]KnownEndpoint, 1_001)
	observed := make([]ObservedCall, 5_000)
	_, err := AnalyzeEndpointCoverage(known, observed)
	if ErrorCode(err) != CodeLimitExceeded {
		t.Fatalf("error code = %q, want %q (error: %v)", ErrorCode(err), CodeLimitExceeded, err)
	}
}
