package httpmedia

import "testing"

func TestBaseTypeAndJSONPolicy(t *testing.T) {
	t.Parallel()
	tests := []struct {
		value string
		base  string
		json  bool
	}{
		{value: " Application/JSON ; charset=utf-8 ", base: "application/json", json: true},
		{value: "application/problem+json", base: "application/problem+json", json: true},
		{value: "application/problem+json; broken", base: "application/problem+json", json: true},
		{value: "application/notjson", base: "application/notjson", json: false},
		{value: "text/json-example", base: "text/json-example", json: false},
		{value: "", base: "", json: false},
	}
	for _, test := range tests {
		test := test
		t.Run(test.value, func(t *testing.T) {
			t.Parallel()
			if got := BaseType(test.value); got != test.base {
				t.Fatalf("BaseType(%q) = %q, want %q", test.value, got, test.base)
			}
			if got := IsJSON(test.value); got != test.json {
				t.Fatalf("IsJSON(%q) = %t, want %t", test.value, got, test.json)
			}
		})
	}
}

func TestXMLPolicy(t *testing.T) {
	t.Parallel()
	tests := map[string]bool{
		"application/xml":                    true,
		"text/xml; charset=utf-8":            true,
		"application/soap+xml":               true,
		"application/problem+xml; version=1": true,
		"image/svg+xml":                      true,
		"application/notxml":                 false,
		"text/xml-example":                   false,
		"":                                   false,
	}
	for mediaType, expected := range tests {
		if actual := IsXML(mediaType); actual != expected {
			t.Errorf(
				"IsXML(%q) = %t, want %t",
				mediaType,
				actual,
				expected,
			)
		}
	}
}

func TestMatchesMediaRanges(t *testing.T) {
	t.Parallel()
	tests := []struct {
		mediaRange string
		actual     string
		want       bool
	}{
		{"application/json", "application/json; charset=utf-8", true},
		{"application/*", "application/problem+json", true},
		{"application/*+json", "application/problem+json", true},
		{"*/*", "text/event-stream", true},
		{"text/*", "application/json", false},
		{"application/*+json", "application/json", false},
		{"invalid", "application/json", false},
	}
	for _, test := range tests {
		if got := Matches(test.mediaRange, test.actual); got != test.want {
			t.Fatalf(
				"Matches(%q, %q) = %t, want %t",
				test.mediaRange,
				test.actual,
				got,
				test.want,
			)
		}
	}
}

func TestTextualMediaPolicy(t *testing.T) {
	t.Parallel()
	tests := map[string]bool{
		"text/plain; charset=utf-8":         true,
		"application/problem+json":          true,
		"application/soap+xml":              true,
		"application/yaml":                  true,
		"image/svg+xml":                     true,
		"application/x-www-form-urlencoded": true,
		"application/octet-stream":          false,
		"image/png":                         false,
		"":                                  false,
		"invalid":                           false,
	}
	for mediaType, expected := range tests {
		if actual := IsTextual(mediaType); actual != expected {
			t.Errorf(
				"IsTextual(%q) = %t, want %t",
				mediaType,
				actual,
				expected,
			)
		}
	}
}
