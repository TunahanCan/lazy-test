package runner

import (
	"encoding/json"
	"strings"
	"testing"

	"validex/internal/assertions"
)

func TestParseCollectionDecodesStableJSONModelAndPreservesNumbers(t *testing.T) {
	t.Parallel()
	data := []byte(`{
		"version": 1,
		"name": "smoke",
		"variables": {"baseUrl": "https://example.test"},
		"requests": [{
			"id": "health",
			"name": "Health",
			"method": "GET",
			"url": "{{baseUrl}}/health",
			"headers": {
				"X-Trace": "enabled",
				"Accept": "application/json"
			},
			"timeoutMs": 2500,
			"assertions": [{
				"target": "status",
				"operator": "equals",
				"expected": 9007199254740993
			}]
		}]
	}`)

	collection, err := ParseCollection(data, Limits{})
	if err != nil {
		t.Fatalf("ParseCollection() error = %v", err)
	}
	if collection.Version != 1 || collection.Name != "smoke" || len(collection.Requests) != 1 {
		t.Fatalf("collection = %#v", collection)
	}
	headers := collection.Requests[0].Headers
	if len(headers) != 2 || !headers[0].Enabled ||
		headers[0].Key != "Accept" ||
		headers[0].Value != "application/json" ||
		headers[1].Key != "X-Trace" {
		t.Fatalf("legacy headers = %#v", headers)
	}
	expected, ok := collection.Requests[0].Assertions[0].Expected.(json.Number)
	if !ok || expected.String() != "9007199254740993" {
		t.Fatalf("expected value = %#v, want precise json.Number", collection.Requests[0].Assertions[0].Expected)
	}
}

func TestParseCollectionV2PreservesOrderedHeadersAndLiteralValues(t *testing.T) {
	t.Parallel()
	data := []byte(`{
		"version": 2,
		"name": "saved collection",
		"requests": [{
			"id": "create",
			"method": "POST",
			"url": "https://example.test/items?template={{name}}",
			"literalValues": true,
			"headers": [
				{"enabled": true, "key": "X-Repeated", "value": "{{first}}"},
				{"enabled": false, "key": "", "value": ""},
				{"enabled": true, "key": "x-repeated", "value": "{{second}}"}
			],
			"body": "{\"value\":\"{{body}}\"}"
		}]
	}`)

	collection, err := ParseCollection(data, Limits{})
	if err != nil {
		t.Fatalf("ParseCollection() error = %v", err)
	}
	request := collection.Requests[0]
	if !request.LiteralValues || len(request.Headers) != 3 {
		t.Fatalf("request = %#v", request)
	}
	prepared, err := prepareRequest(
		request,
		map[string]string{
			"name": "changed", "first": "changed",
			"second": "changed", "body": "changed",
		},
		DefaultLimits(),
	)
	if err != nil {
		t.Fatalf("prepareRequest() error = %v", err)
	}
	if prepared.URL != request.URL ||
		string(prepared.Body) != request.Body ||
		len(prepared.Headers) != 2 ||
		prepared.Headers[0].Name != "X-Repeated" ||
		prepared.Headers[0].Value != "{{first}}" ||
		prepared.Headers[1].Name != "x-repeated" ||
		prepared.Headers[1].Value != "{{second}}" {
		t.Fatalf("prepared request = %#v, body %q", prepared, prepared.Body)
	}
}

func TestParseCollectionRejectsMalformedUnknownTrailingAndUnsafeInput(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		data   string
		limits Limits
		want   string
	}{
		{
			name: "unknown field",
			data: `{"requests":[],"unexpected":true}`,
			want: "unknown field",
		},
		{
			name: "unsupported version",
			data: `{"version":3,"requests":[]}`,
			want: "version 3 is not supported",
		},
		{
			name: "v1 ordered headers",
			data: `{"version":1,"requests":[{
				"method":"GET","url":"https://example.test","headers":[]
			}]}`,
			want: "require collection version 2",
		},
		{
			name: "v2 legacy headers",
			data: `{"version":2,"requests":[{
				"method":"GET","url":"https://example.test","headers":{}
			}]}`,
			want: "version 2 requires an ordered header array",
		},
		{
			name: "unknown ordered header field",
			data: `{"version":2,"requests":[{
				"method":"GET","url":"https://example.test",
				"headers":[{"key":"X-Test","value":"yes","unexpected":true}]
			}]}`,
			want: "unknown field",
		},
		{
			name: "trailing value",
			data: `{"requests":[]} {"requests":[]}`,
			want: "multiple JSON values",
		},
		{
			name:   "collection bytes",
			data:   `{"requests":[]}`,
			limits: Limits{MaxCollectionBytes: 4},
			want:   "collection exceeds 4 bytes",
		},
		{
			name: "duplicate ids",
			data: `{"requests":[
				{"id":"same","method":"GET","url":"https://example.test/a"},
				{"id":"same","method":"GET","url":"https://example.test/b"}
			]}`,
			want: "duplicate id",
		},
		{
			name: "invalid assertion",
			data: `{"requests":[{
				"method":"GET","url":"https://example.test",
				"assertions":[{"target":"body","operator":"matches","expected":"("}]
			}]}`,
			want: "invalid regular expression",
		},
		{
			name: "invalid variable",
			data: `{"variables":{"bad name":"x"},"requests":[]}`,
			want: "variable name",
		},
		{
			name: "too many requests",
			data: `{"requests":[
				{"method":"GET","url":"https://example.test/a"},
				{"method":"GET","url":"https://example.test/b"}
			]}`,
			limits: Limits{MaxRequests: 1},
			want:   "maximum is 1",
		},
		{
			name:   "body limit",
			data:   `{"requests":[{"method":"POST","url":"https://example.test","body":"12345"}]}`,
			limits: Limits{MaxRequestBodyBytes: 4},
			want:   "body exceeds 4 bytes",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := ParseCollection([]byte(test.data), test.limits)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("ParseCollection() error = %v, want containing %q", err, test.want)
			}
		})
	}

	assertionJSON := `{"target":"status","operator":"equals","expected":200}`
	data := `{"requests":[{"method":"GET","url":"https://example.test","assertions":[` +
		strings.TrimSuffix(
			strings.Repeat(assertionJSON+",", maxAssertionsPerRequest+1),
			",",
		) +
		`]}]}`
	if _, err := ParseCollection([]byte(data), Limits{}); err == nil ||
		!strings.Contains(err.Error(), "assertions; maximum is") {
		t.Fatalf("assertion-limit error = %v", err)
	}

	collection := Collection{
		Requests: make([]Request, maxAssertionsPerCollection/maxAssertionsPerRequest+1),
	}
	remaining := maxAssertionsPerCollection + 1
	for index := range collection.Requests {
		count := min(remaining, maxAssertionsPerRequest)
		remaining -= count
		collection.Requests[index] = Request{
			Method: "GET",
			URL:    "https://example.test",
			Assertions: make(
				[]assertions.Assertion,
				count,
			),
		}
		for assertionIndex := range collection.Requests[index].Assertions {
			collection.Requests[index].Assertions[assertionIndex] = assertions.Assertion{
				Target:   assertions.TargetStatus,
				Operator: assertions.OperatorEquals,
				Expected: 200,
			}
		}
	}
	if err := validateCollection(collection, DefaultLimits()); err == nil ||
		!strings.Contains(err.Error(), "collection has") {
		t.Fatalf("collection assertion-limit error = %v", err)
	}
}

func TestDefaultLimitsAndLimitValidation(t *testing.T) {
	t.Parallel()
	defaults := DefaultLimits()
	if defaults.MaxRequests != DefaultMaxRequests ||
		defaults.MaxCollectionBytes != DefaultMaxCollectionBytes ||
		defaults.MaxRequestBodyBytes != DefaultMaxRequestBodyBytes ||
		defaults.MaxResponseBodyBytes != DefaultMaxResponseBodyBytes ||
		defaults.MaxResponseHeaderBytes != DefaultMaxResponseHeaderBytes ||
		defaults.MaxReportBodyBytes != DefaultMaxReportBodyBytes ||
		defaults.MaxReportHeaderBytes != DefaultMaxReportHeaderBytes ||
		defaults.DefaultTimeoutMS != DefaultRequestTimeoutMS ||
		defaults.MaxTimeoutMS != DefaultMaxTimeoutMS {
		t.Fatalf("DefaultLimits() = %#v", defaults)
	}
	tests := []Limits{
		{MaxRequests: -1},
		{MaxCollectionBytes: hardMaxCollectionBytes + 1},
		{MaxRequestBodyBytes: hardMaxRequestBodyBytes + 1},
		{MaxResponseBodyBytes: hardMaxResponseBodyBytes + 1},
		{MaxResponseHeaderBytes: hardMaxResponseHeaderBytes + 1},
		{MaxReportBodyBytes: hardMaxReportBodyBytes + 1},
		{MaxReportHeaderBytes: hardMaxReportHeaderBytes + 1},
		{MaxTimeoutMS: hardMaxTimeoutMS + 1},
		{DefaultTimeoutMS: 10, MaxTimeoutMS: 5},
	}
	for _, limits := range tests {
		if _, err := normalizeLimits(limits); err == nil {
			t.Fatalf("normalizeLimits(%#v) error = nil", limits)
		}
	}
}

func TestCollectionAssertionConstantsRoundTrip(t *testing.T) {
	t.Parallel()
	collection := Collection{Requests: []Request{{
		Method: "GET",
		URL:    "https://example.test",
		Assertions: []assertions.Assertion{{
			Target: assertions.TargetDurationMS, Operator: assertions.OperatorLessThan, Expected: 500,
		}},
	}}}
	encoded, err := json.Marshal(collection)
	if err != nil {
		t.Fatalf("json.Marshal(Collection) error = %v", err)
	}
	if !strings.Contains(string(encoded), `"target":"duration_ms"`) ||
		!strings.Contains(string(encoded), `"operator":"less_than"`) {
		t.Fatalf("collection JSON = %s", encoded)
	}
}
