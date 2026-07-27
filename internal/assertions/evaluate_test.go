package assertions

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestEvaluateSupportsEveryTargetAndOperatorDeterministically(t *testing.T) {
	t.Parallel()
	input := Input{
		StatusCode: http.StatusCreated,
		Headers: http.Header{
			"Content-Type": {"application/json; charset=utf-8"},
			"X-Trace-ID":   {"trace-42"},
		},
		Body: []byte(`{
			"items":[{"name":"alpha","score":7},{"name":"beta","score":12}],
			"tags":["fast","stable"],
			"meta":{"ready":true}
		}`),
		Duration: 120*time.Millisecond + 500*time.Microsecond,
	}
	checks := []Assertion{
		{ID: "status-equals", Target: TargetStatus, Operator: OperatorEquals, Expected: 201},
		{ID: "status-not-equals", Target: TargetStatus, Operator: OperatorNotEquals, Expected: 200},
		{ID: "status-greater", Target: TargetStatus, Operator: OperatorGreaterThan, Expected: 200},
		{ID: "header-contains", Target: TargetHeader, Path: "content-type", Operator: OperatorContains, Expected: "json"},
		{ID: "header-exists", Target: TargetHeader, Path: "X-Trace-Id", Operator: OperatorExists},
		{ID: "header-missing", Target: TargetHeader, Path: "X-Missing", Operator: OperatorNotExists},
		{ID: "body-contains", Target: TargetBody, Operator: OperatorContains, Expected: `"items"`},
		{ID: "body-matches", Target: TargetBody, Operator: OperatorMatches, Expected: `"name"\s*:\s*"beta"`},
		{ID: "json-equals", Target: TargetJSONPath, Path: "$.items[1].name", Operator: OperatorEquals, Expected: "beta"},
		{ID: "json-dot-index", Target: TargetJSONPath, Path: "items.0.score", Operator: OperatorLessThan, Expected: 10},
		{ID: "json-array-contains", Target: TargetJSONPath, Path: "$.tags", Operator: OperatorContains, Expected: "fast"},
		{ID: "json-object-contains", Target: TargetJSONPath, Path: "$.meta", Operator: OperatorContains, Expected: "ready"},
		{ID: "json-not-exists", Target: TargetJSONPath, Path: "$.items[9]", Operator: OperatorNotExists},
		{ID: "duration-less", Target: TargetDurationMS, Operator: OperatorLessThan, Expected: 121},
		{ID: "duration-greater", Target: TargetDurationMS, Operator: OperatorGreaterThan, Expected: 120},
	}

	results := Evaluate(input, checks)
	if len(results) != len(checks) {
		t.Fatalf("len(Evaluate()) = %d, want %d", len(results), len(checks))
	}
	for index, result := range results {
		if result.Assertion.ID != checks[index].ID {
			t.Fatalf("result %d ID = %q, want %q", index, result.Assertion.ID, checks[index].ID)
		}
		if !result.Passed || result.Error != "" || result.Message != "" {
			t.Fatalf("result %q = %#v, want pass", result.Assertion.ID, result)
		}
	}
}

func TestEvaluateReturnsStableFailureAndMissingValueMessages(t *testing.T) {
	t.Parallel()
	checks := []Assertion{
		{Target: TargetStatus, Operator: OperatorEquals, Expected: 204},
		{Target: TargetHeader, Path: "X-Missing", Operator: OperatorEquals, Expected: "value"},
	}
	first := Evaluate(Input{StatusCode: 200}, checks)
	second := Evaluate(Input{StatusCode: 200}, checks)

	firstJSON, err := json.Marshal(first)
	if err != nil {
		t.Fatalf("json.Marshal(first) error = %v", err)
	}
	secondJSON, err := json.Marshal(second)
	if err != nil {
		t.Fatalf("json.Marshal(second) error = %v", err)
	}
	if string(firstJSON) != string(secondJSON) {
		t.Fatalf("results are not deterministic:\n%s\n%s", firstJSON, secondJSON)
	}
	if first[0].Passed || first[0].Message != "expected status equals 204, got 200" {
		t.Fatalf("status failure = %#v", first[0])
	}
	if first[1].Passed || first[1].Message != `header "X-Missing" does not exist` {
		t.Fatalf("missing-header failure = %#v", first[1])
	}
}

func TestEvaluatePreservesJSONNumberPrecisionAndCompositeEquality(t *testing.T) {
	t.Parallel()
	input := Input{Body: []byte(`{
		"id":9007199254740993,
		"payload":{"count":2,"flags":[true,false]}
	}`)}
	checks := []Assertion{
		{
			Target: TargetJSONPath, Path: "$.id", Operator: OperatorEquals,
			Expected: json.Number("9007199254740993"),
		},
		{
			Target: TargetJSONPath, Path: "$.payload", Operator: OperatorEquals,
			Expected: map[string]any{
				"count": float64(2),
				"flags": []any{true, false},
			},
		},
	}
	results := Evaluate(input, checks)
	for _, result := range results {
		if !result.Passed || result.Error != "" {
			t.Fatalf("precision/composite result = %#v", result)
		}
	}
	if results[0].Actual != "9007199254740993" {
		t.Fatalf("large integer actual = %#v, want precision-safe string", results[0].Actual)
	}
	if results[0].Assertion.Expected != "9007199254740993" {
		t.Fatalf(
			"large integer expected = %#v, want precision-safe string",
			results[0].Assertion.Expected,
		)
	}
}

func TestEvaluateReportsInvalidConfigurationAndJSON(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name      string
		assertion Assertion
		input     Input
		want      string
	}{
		{
			name:      "target",
			assertion: Assertion{Target: "cookie", Operator: OperatorExists},
			want:      `unsupported assertion target "cookie"`,
		},
		{
			name:      "operator",
			assertion: Assertion{Target: TargetBody, Operator: "starts_with"},
			want:      `unsupported assertion operator "starts_with"`,
		},
		{
			name:      "header injection",
			assertion: Assertion{Target: TargetHeader, Path: "X-Test\r\nInjected", Operator: OperatorExists},
			want:      "invalid header assertion path",
		},
		{
			name:      "path",
			assertion: Assertion{Target: TargetJSONPath, Path: "$.items[-1]", Operator: OperatorExists},
			want:      "must be a non-negative integer",
		},
		{
			name:      "regex syntax",
			assertion: Assertion{Target: TargetBody, Operator: OperatorMatches, Expected: `(`},
			want:      "invalid regular expression",
		},
		{
			name:      "regex type",
			assertion: Assertion{Target: TargetBody, Operator: OperatorMatches, Expected: 42},
			want:      "requires a string expected value",
		},
		{
			name:      "json",
			assertion: Assertion{Target: TargetJSONPath, Path: "$.id", Operator: OperatorExists},
			input:     Input{Body: []byte(`{"id":`)},
			want:      "decode assertion JSON",
		},
		{
			name:      "numeric type",
			assertion: Assertion{Target: TargetStatus, Operator: OperatorGreaterThan, Expected: "199"},
			input:     Input{StatusCode: 200},
			want:      "requires a numeric expected value",
		},
		{
			name:      "contains numeric target",
			assertion: Assertion{Target: TargetStatus, Operator: OperatorContains, Expected: "2"},
			input:     Input{StatusCode: 200},
			want:      "not supported",
		},
		{
			name:      "numeric operator text target",
			assertion: Assertion{Target: TargetBody, Operator: OperatorLessThan, Expected: 10},
			input:     Input{Body: []byte("9")},
			want:      "not supported",
		},
		{
			name:      "non-string header expected",
			assertion: Assertion{Target: TargetHeader, Path: "X-Value", Operator: OperatorEquals, Expected: 1},
			input:     Input{Headers: http.Header{"X-Value": {"1"}}},
			want:      "requires a string expected value",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			result := Evaluate(test.input, []Assertion{test.assertion})[0]
			if result.Passed || !strings.Contains(result.Error, test.want) {
				t.Fatalf("Evaluate() = %#v, want error containing %q", result, test.want)
			}
		})
	}
}

func TestEvaluateBoundsRegexPatternAndInput(t *testing.T) {
	t.Parallel()
	tooLongPattern := Assertion{
		Target: TargetBody, Operator: OperatorMatches,
		Expected: strings.Repeat("a", maxRegexPatternBytes+1),
	}
	if result := Evaluate(Input{}, []Assertion{tooLongPattern})[0]; !strings.Contains(result.Error, "regular expression exceeds") {
		t.Fatalf("long-pattern result = %#v", result)
	}

	input := Input{Body: []byte(strings.Repeat("a", maxRegexInputBytes+1))}
	result := Evaluate(input, []Assertion{{
		Target: TargetBody, Operator: OperatorMatches, Expected: `a+`,
	}})[0]
	if !strings.Contains(result.Error, "regular expression input exceeds") {
		t.Fatalf("long-input result = %#v", result)
	}
}

func TestEvaluateBoundsReportedActualValuesAndFailureMessages(t *testing.T) {
	t.Parallel()
	body := strings.Repeat("x", maxReportedValueBytes*2)
	results := Evaluate(Input{Body: []byte(body)}, []Assertion{
		{Target: TargetBody, Operator: OperatorEquals, Expected: "different"},
		{Target: TargetBody, Operator: OperatorExists},
	})

	actual, ok := results[0].Actual.(string)
	if !ok || len(actual) > maxReportedValueBytes ||
		!strings.Contains(actual, "<truncated>") {
		t.Fatalf("bounded body actual = %#v", results[0].Actual)
	}
	if len(results[0].Message) > maxReportedValueBytes+256 ||
		strings.Contains(results[0].Message, body) {
		t.Fatalf("bounded failure message length = %d", len(results[0].Message))
	}
	if results[1].Actual != true {
		t.Fatalf("exists actual = %#v, want true", results[1].Actual)
	}

	jsonResult := Evaluate(
		Input{Body: []byte(`{"items":[1,2,3]}`)},
		[]Assertion{{
			Target:   TargetJSONPath,
			Path:     "$",
			Operator: OperatorEquals,
			Expected: map[string]any{},
		}},
	)[0]
	if jsonResult.Actual != "<object: 1 keys>" {
		t.Fatalf("composite actual = %#v", jsonResult.Actual)
	}

	hugeNumber := strings.Repeat("9", maxNumericValueBytes+1)
	numericResult := Evaluate(
		Input{Body: []byte(`{"value":` + hugeNumber + `}`)},
		[]Assertion{{
			Target:   TargetJSONPath,
			Path:     "$.value",
			Operator: OperatorGreaterThan,
			Expected: 0,
		}},
	)[0]
	if !strings.Contains(numericResult.Error, "numeric comparison requires") {
		t.Fatalf("oversized numeric result = %#v", numericResult)
	}

	exponentResult := Evaluate(
		Input{Body: []byte(`{"value":1e99999999}`)},
		[]Assertion{{
			Target:   TargetJSONPath,
			Path:     "$.value",
			Operator: OperatorGreaterThan,
			Expected: 0,
		}},
	)[0]
	if !strings.Contains(exponentResult.Error, "numeric comparison requires") {
		t.Fatalf("oversized exponent result = %#v", exponentResult)
	}
}
