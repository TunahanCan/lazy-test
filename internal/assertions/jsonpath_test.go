package assertions

import (
	"strings"
	"testing"
)

func TestJSONPathSupportsRootDotArrayAndQuotedKeys(t *testing.T) {
	t.Parallel()
	document := map[string]any{
		"users": []any{
			map[string]any{
				"profile.name": map[string]any{"display": "Ada"},
			},
		},
	}
	tests := []struct {
		path string
		want any
	}{
		{path: "$", want: document},
		{path: `$.users[0]["profile.name"].display`, want: "Ada"},
		{path: "users.0", want: document["users"].([]any)[0]},
		{path: `[0]`, want: "first"},
	}
	for _, test := range tests {
		root := any(document)
		if test.path == "[0]" {
			root = []any{"first"}
		}
		tokens, err := parseJSONPath(test.path)
		if err != nil {
			t.Fatalf("parseJSONPath(%q) error = %v", test.path, err)
		}
		got, exists := lookupJSONPath(root, tokens)
		if !exists || !valuesEqual(got, test.want) {
			t.Fatalf("lookupJSONPath(%q) = (%#v, %t), want (%#v, true)", test.path, got, exists, test.want)
		}
	}
}

func TestJSONPathRejectsMalformedOrUnboundedPaths(t *testing.T) {
	t.Parallel()
	paths := []string{
		"",
		"$.",
		"$.users..name",
		"$.users[]",
		"$.users[-1]",
		"$.users[1",
		`$.users["name]`,
		"$.users[1000000001]",
		strings.Repeat(".segment", maxJSONPathSegments+1),
		strings.Repeat("x", maxJSONPathBytes+1),
	}
	for _, path := range paths {
		if _, err := parseJSONPath(path); err == nil {
			t.Fatalf("parseJSONPath(%q) error = nil", path)
		}
	}
}
