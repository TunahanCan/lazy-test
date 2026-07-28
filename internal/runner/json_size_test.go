package runner

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
	"testing"

	"validex/internal/assertions"
)

func TestBoundedJSONSizeMatchesEncodingJSON(t *testing.T) {
	t.Parallel()
	invalidUTF8 := string([]byte{0xff, 'x'})
	tests := []struct {
		name  string
		value any
	}{
		{name: "nil", value: nil},
		{name: "booleans", value: []bool{true, false}},
		{name: "integers", value: []any{int8(-8), uint16(16), int64(-64)}},
		{name: "floats", value: []any{float32(1.25), float64(1e100)}},
		{name: "json number", value: json.Number("9007199254740993")},
		{
			name:  "escaped string",
			value: "<>&\x00\b\f\n\r\t\"\\\u2028\u2029" + invalidUTF8,
		},
		{name: "byte slice", value: []byte{0x00, 0xff, 0x10}},
		{name: "empty byte slice", value: []byte{}},
		{
			name: "nested JSON native values",
			value: map[string]any{
				"array": []any{nil, true, "value", json.Number("42")},
				"map":   map[string]string{"<key>": invalidUTF8},
			},
		},
		{
			name: "canonical collection",
			value: canonicalCollectionWire{
				Version: 2,
				Name:    "escaped <collection>",
				Variables: map[string]string{
					"value": "\x00" + invalidUTF8,
				},
				Requests: []Request{{
					Method: "POST",
					URL:    "https://example.test",
					Headers: []Header{{
						Enabled: true,
						Key:     "X-Test",
						Value:   "<value>",
					}},
					Body: "\u2028",
					Assertions: []assertions.Assertion{{
						Target:   assertions.TargetJSONPath,
						Path:     "$.value",
						Operator: assertions.OperatorEquals,
						Expected: []any{
							int(1),
							int8(2),
							uint64(3),
							float32(4.5),
							float64(6.25),
							json.Number("9007199254740993"),
						},
					}},
				}},
			},
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			encoded, err := json.Marshal(test.value)
			if err != nil {
				t.Fatalf("json.Marshal() error = %v", err)
			}
			size, err := boundedJSONSize(test.value, int64(len(encoded)))
			if err != nil {
				t.Fatalf("boundedJSONSize() error = %v", err)
			}
			if size != int64(len(encoded)) {
				t.Fatalf("boundedJSONSize() = %d, want %d", size, len(encoded))
			}
			if len(encoded) > 0 {
				_, err = boundedJSONSize(test.value, int64(len(encoded)-1))
				if !errors.Is(err, errJSONSizeLimit) {
					t.Fatalf("boundedJSONSize(short limit) error = %v", err)
				}
			}
		})
	}
}

func TestBoundedJSONSizeRejectsUnsafeValueGraphs(t *testing.T) {
	t.Parallel()
	cyclicMap := map[string]any{}
	cyclicMap["self"] = cyclicMap

	deep := any("leaf")
	for index := 0; index <= maxCollectionJSONDepth; index++ {
		deep = []any{deep}
	}

	tests := []struct {
		name  string
		value any
		want  string
	}{
		{name: "non-string map key", value: map[int]string{1: "one"}, want: "non-string JSON map key"},
		{name: "NaN", value: math.NaN(), want: "non-finite JSON number"},
		{name: "positive infinity", value: math.Inf(1), want: "non-finite JSON number"},
		{name: "cycle", value: cyclicMap, want: "cyclic JSON value"},
		{name: "depth", value: deep, want: "nesting exceeds"},
		{name: "custom marshaler", value: observingJSONMarshaler{}, want: "custom JSON marshaler"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := boundedJSONSize(test.value, 1<<20)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("boundedJSONSize() error = %v, want containing %q", err, test.want)
			}
		})
	}
}
