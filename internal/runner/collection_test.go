package runner

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
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
	if collection.Version != CollectionVersionV1 ||
		collection.Name != "smoke" ||
		len(collection.Requests) != 1 {
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
			name: "unknown request field",
			data: `{"requests":[{
				"method":"GET","url":"https://example.test","unexpected":true
			}]}`,
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

func TestLegacyCollectionSerializationAlwaysProducesCanonicalV2(t *testing.T) {
	t.Parallel()
	legacy := []byte(`{
		"version": 1,
		"name": "legacy",
		"variables": {"large": "9007199254740993"},
		"requests": [{
			"id": "request-1",
			"method": "POST",
			"url": "https://example.test/items",
			"headers": {
				"X-Zeta": "last",
				"Accept": "application/json"
			},
			"body": "{}",
			"assertions": [{
				"target": "json_path",
				"operator": "equals",
				"path": "$.id",
				"expected": 9007199254740993
			}]
		}]
	}`)
	collection, err := ParseCollection(legacy, Limits{})
	if err != nil {
		t.Fatalf("ParseCollection() error = %v", err)
	}
	if collection.Version != CollectionVersionV1 {
		t.Fatalf("source version = %q, want %q", collection.Version, CollectionVersionV1)
	}

	encoded, err := json.Marshal(collection)
	if err != nil {
		t.Fatalf("json.Marshal(Collection) error = %v", err)
	}
	var wire struct {
		Version  int `json:"version"`
		Requests []struct {
			Headers []Header `json:"headers"`
		} `json:"requests"`
	}
	if err := json.Unmarshal(encoded, &wire); err != nil {
		t.Fatalf("decode canonical JSON: %v", err)
	}
	if wire.Version != 2 {
		t.Fatalf("encoded version = %d, want 2; JSON = %s", wire.Version, encoded)
	}
	if got := wire.Requests[0].Headers; len(got) != 2 ||
		got[0] != (Header{Enabled: true, Key: "Accept", Value: "application/json"}) ||
		got[1] != (Header{Enabled: true, Key: "X-Zeta", Value: "last"}) {
		t.Fatalf("canonical headers = %#v", got)
	}

	roundTripped, err := ParseCollection(encoded, Limits{})
	if err != nil {
		t.Fatalf("ParseCollection(canonical JSON) error = %v; JSON = %s", err, encoded)
	}
	if roundTripped.Version != CollectionVersionV2 {
		t.Fatalf("round-trip version = %q, want %q", roundTripped.Version, CollectionVersionV2)
	}
	expected, ok := roundTripped.Requests[0].Assertions[0].Expected.(json.Number)
	if !ok || expected.String() != "9007199254740993" {
		t.Fatalf("round-trip expected = %#v", roundTripped.Requests[0].Assertions[0].Expected)
	}
	// Serialization is a boundary operation and must not rewrite the caller's
	// source-version metadata.
	if collection.Version != CollectionVersionV1 {
		t.Fatalf("source collection mutated to version %q", collection.Version)
	}
}

func TestEncodeCollectionWritesValidatedCanonicalV2(t *testing.T) {
	t.Parallel()
	collection := Collection{
		Version: CollectionVersionV2,
		Name:    "ordered",
		Requests: []Request{{
			ID:            "one",
			Method:        "GET",
			URL:           "https://example.test",
			LiteralValues: true,
			Headers: []Header{
				{Enabled: true, Key: "X-Repeated", Value: "first"},
				{Enabled: false, Key: "", Value: ""},
				{Enabled: true, Key: "x-repeated", Value: "second"},
			},
		}},
	}
	var output bytes.Buffer
	if err := EncodeCollection(&output, collection, Limits{}); err != nil {
		t.Fatalf("EncodeCollection() error = %v", err)
	}
	decoded, err := ParseCollection(output.Bytes(), Limits{})
	if err != nil {
		t.Fatalf("ParseCollection(encoded) error = %v", err)
	}
	request := decoded.Requests[0]
	if decoded.Version != CurrentCollectionVersion ||
		!request.LiteralValues ||
		len(request.Headers) != 3 ||
		request.Headers[1].Enabled ||
		request.Headers[2].Key != "x-repeated" {
		t.Fatalf("decoded canonical collection = %#v", decoded)
	}
}

func TestEncodeCollectionIgnoresDecodedWireProvenance(t *testing.T) {
	t.Parallel()
	collection, err := ParseCollection([]byte(`{
		"version": 1,
		"requests": [{
			"method": "GET",
			"url": "https://example.test",
			"headers": {"X-Legacy": "preserved"}
		}]
	}`), Limits{})
	if err != nil {
		t.Fatalf("ParseCollection() error = %v", err)
	}

	// Version is editable domain state. The source object's wire representation
	// must not make an otherwise canonical v2 encode fail.
	collection.Version = CollectionVersionV2
	var output bytes.Buffer
	if err := EncodeCollection(&output, collection, Limits{}); err != nil {
		t.Fatalf("EncodeCollection() error = %v", err)
	}
	roundTripped, err := ParseCollection(output.Bytes(), Limits{})
	if err != nil {
		t.Fatalf("ParseCollection(encoded) error = %v", err)
	}
	if roundTripped.Version != CollectionVersionV2 ||
		len(roundTripped.Requests[0].Headers) != 1 ||
		roundTripped.Requests[0].Headers[0].Key != "X-Legacy" {
		t.Fatalf("round-tripped collection = %#v", roundTripped)
	}
}

func TestEncodeCollectionRejectsInvalidInputAndBoundsOutput(t *testing.T) {
	t.Parallel()
	valid := Collection{Requests: []Request{{
		Method: "GET",
		URL:    "https://example.test",
	}}}
	tests := []struct {
		name       string
		writer     io.Writer
		collection Collection
		limits     Limits
		want       string
	}{
		{
			name:       "nil writer",
			collection: valid,
			want:       "writer is required",
		},
		{
			name:   "invalid collection",
			writer: io.Discard,
			collection: Collection{Requests: []Request{{
				Method: "",
				URL:    "https://example.test",
			}}},
			want: "method is required",
		},
		{
			name:       "encoded bytes",
			writer:     io.Discard,
			collection: valid,
			limits:     Limits{MaxCollectionBytes: 16},
			want:       "encoded collection exceeds 16 bytes",
		},
		{
			name:       "write failure",
			writer:     failingWriter{},
			collection: valid,
			want:       "write collection: expected write failure",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			err := EncodeCollection(
				test.writer,
				test.collection,
				test.limits,
			)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("EncodeCollection() error = %v, want containing %q", err, test.want)
			}
		})
	}
}

func TestEncodeCollectionPreflightsLimitWithoutPartialOutput(t *testing.T) {
	t.Parallel()
	called := false
	collection := Collection{
		Name: strings.Repeat("x", 1024),
		Requests: []Request{{
			Method: "GET",
			URL:    "https://example.test",
			Assertions: []assertions.Assertion{{
				Target:   assertions.TargetJSONPath,
				Path:     "$.value",
				Operator: assertions.OperatorEquals,
				Expected: observingJSONMarshaler{called: &called},
			}},
		}},
	}
	var output bytes.Buffer
	err := EncodeCollection(
		&output,
		collection,
		Limits{MaxCollectionBytes: 128},
	)
	if err == nil || !strings.Contains(err.Error(), "encoded collection exceeds 128 bytes") {
		t.Fatalf("EncodeCollection() error = %v", err)
	}
	if output.Len() != 0 {
		t.Fatalf("oversized encode wrote %d bytes", output.Len())
	}
	if called {
		t.Fatal("oversized encode invoked a later custom JSON marshaler")
	}
}

func TestEncodeCollectionHonorsExactEncodedBoundary(t *testing.T) {
	t.Parallel()
	collection := Collection{
		Name: "<collection>\x00\u2028" + string([]byte{0xff}),
		Variables: map[string]string{
			"escaped": "<>&",
		},
		Requests: []Request{{
			Method: "POST",
			URL:    "https://example.test",
			Body:   "{\"value\":\"line\\n\"}",
			Assertions: []assertions.Assertion{{
				Target:   assertions.TargetJSONPath,
				Path:     "$.value",
				Operator: assertions.OperatorEquals,
				Expected: []any{
					int8(-1),
					uint64(2),
					float32(3.5),
					json.Number("9007199254740993"),
				},
			}},
		}},
	}
	expected, err := json.Marshal(collection)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	var exact bytes.Buffer
	if err := EncodeCollection(
		&exact,
		collection,
		Limits{MaxCollectionBytes: int64(len(expected))},
	); err != nil {
		t.Fatalf("EncodeCollection(exact limit) error = %v", err)
	}
	if !bytes.Equal(exact.Bytes(), expected) {
		t.Fatalf("encoded collection = %s, want %s", exact.Bytes(), expected)
	}

	var rejected bytes.Buffer
	err = EncodeCollection(
		&rejected,
		collection,
		Limits{MaxCollectionBytes: int64(len(expected) - 1)},
	)
	if err == nil || !strings.Contains(err.Error(), "encoded collection exceeds") {
		t.Fatalf("EncodeCollection(short limit) error = %v", err)
	}
	if rejected.Len() != 0 {
		t.Fatalf("short-limit encode wrote %d bytes", rejected.Len())
	}
}

func TestCollectionVersionAndFailureCodeKeepStableWireValues(t *testing.T) {
	t.Parallel()
	for _, legacy := range []string{
		`{"requests":[]}`,
		`{"version":null,"requests":[]}`,
		`{"version":0,"requests":[]}`,
	} {
		collection, err := ParseCollection([]byte(legacy), Limits{})
		if err != nil {
			t.Fatalf("ParseCollection(%s) error = %v", legacy, err)
		}
		if collection.Version != CollectionVersionUnspecified {
			t.Fatalf("ParseCollection(%s) version = %q", legacy, collection.Version)
		}
	}
	for _, invalid := range []string{
		`{"version":"2","requests":[]}`,
		`{"version":2.5,"requests":[]}`,
		`{"version":3,"requests":[]}`,
	} {
		if _, err := ParseCollection([]byte(invalid), Limits{}); err == nil {
			t.Fatalf("ParseCollection(%s) error = nil", invalid)
		}
	}
	if _, err := json.Marshal(Collection{
		Version: CollectionVersion("3"),
		Requests: []Request{{
			Method: "GET",
			URL:    "https://example.test",
		}},
	}); err == nil || !strings.Contains(err.Error(), "version 3") {
		t.Fatalf("json.Marshal(invalid version) error = %v", err)
	}

	report := Report{Results: []RequestResult{{
		Failure: &Failure{
			Code:    FailureRequestCanceled,
			Message: "canceled",
		},
	}}}
	encoded, err := json.Marshal(report)
	if err != nil {
		t.Fatalf("json.Marshal(Report) error = %v", err)
	}
	if !bytes.Contains(encoded, []byte(`"code":"request_canceled"`)) {
		t.Fatalf("report JSON = %s", encoded)
	}
}

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) {
	return 0, errors.New("expected write failure")
}

type observingJSONMarshaler struct {
	called *bool
}

func (value observingJSONMarshaler) MarshalJSON() ([]byte, error) {
	*value.called = true
	return []byte(`"unexpected"`), nil
}
