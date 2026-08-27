package e2e

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"
)

func TestNativeBridgeFixtureImplementsFrontendContract(t *testing.T) {
	root, err := repositoryRoot()
	if err != nil {
		t.Fatal(err)
	}
	frontendSource, err := os.ReadFile(filepath.Join(
		root,
		"cmd",
		"validex",
		"frontend",
		"src",
		"lib",
		"backend.ts",
	))
	if err != nil {
		t.Fatalf("read frontend bridge contract: %v", err)
	}
	fixtureSource, err := os.ReadFile(filepath.Join(
		root,
		"tests",
		"e2e",
		"fixtures",
		"native_bridge.js",
	))
	if err != nil {
		t.Fatalf("read browser bridge fixture: %v", err)
	}

	frontendMethods := contractMethods(
		t,
		string(frontendSource),
		"interface CanbridgeAPI {",
		"\n}",
		regexp.MustCompile(`(?m)^\s{2}([A-Z][A-Za-z0-9_]*)\(`),
	)
	desktopMethods := contractMethods(
		t,
		string(frontendSource),
		"interface DesktopAPI extends CanbridgeAPI {",
		"\n}",
		regexp.MustCompile(`(?m)^\s{2}([A-Z][A-Za-z0-9_]*)\(`),
	)
	frontendMethods = append(frontendMethods, desktopMethods...)
	slices.Sort(frontendMethods)
	fixtureMethods := contractMethods(
		t,
		string(fixtureSource),
		"const bridge = {",
		"\n  };",
		regexp.MustCompile(`(?m)^\s{4}([A-Z][A-Za-z0-9_]*):`),
	)
	if !slices.Equal(frontendMethods, fixtureMethods) {
		t.Fatalf(
			"frontend desktop API methods = %q; browser fixture methods = %q",
			frontendMethods,
			fixtureMethods,
		)
	}

	frontendArities := contractArities(
		t,
		string(frontendSource),
		"interface CanbridgeAPI {",
		"\n}",
		regexp.MustCompile(
			`(?ms)^\s{2}([A-Z][A-Za-z0-9_]*)\((.*?)\):\s*Promise<`,
		),
	)
	for method, arity := range contractArities(
		t,
		string(frontendSource),
		"interface DesktopAPI extends CanbridgeAPI {",
		"\n}",
		regexp.MustCompile(
			`(?ms)^\s{2}([A-Z][A-Za-z0-9_]*)\((.*?)\):\s*Promise<`,
		),
	) {
		if _, duplicate := frontendArities[method]; duplicate {
			t.Fatalf("frontend bridge contract repeats method %q", method)
		}
		frontendArities[method] = arity
	}
	fixtureArities := contractArities(
		t,
		string(fixtureSource),
		"const bridge = {",
		"\n  };",
		regexp.MustCompile(
			`(?m)^\s{4}([A-Z][A-Za-z0-9_]*):\s*(?:async\s+)?\(([^)]*)\)\s*=>`,
		),
	)
	for _, method := range frontendMethods {
		if frontendArities[method] != fixtureArities[method] {
			t.Fatalf(
				"frontend desktop API.%s arity = %d; browser fixture arity = %d",
				method,
				frontendArities[method],
				fixtureArities[method],
			)
		}
	}
}

func contractArities(
	t *testing.T,
	source string,
	startMarker string,
	endMarker string,
	pattern *regexp.Regexp,
) map[string]int {
	t.Helper()
	start := strings.Index(source, startMarker)
	if start < 0 {
		t.Fatalf("contract start marker %q was not found", startMarker)
	}
	bodyStart := start + len(startMarker)
	endOffset := strings.Index(source[bodyStart:], endMarker)
	if endOffset < 0 {
		t.Fatalf("contract end marker %q was not found", endMarker)
	}
	matches := pattern.FindAllStringSubmatch(
		source[bodyStart:bodyStart+endOffset],
		-1,
	)
	arities := make(map[string]int, len(matches))
	for _, match := range matches {
		parameters := strings.TrimSpace(match[2])
		arity := 0
		if parameters != "" {
			// The native bridge intentionally accepts one DTO per operation.
			// Counting non-empty parameter lists catches zero/one signature
			// drift without attempting to parse TypeScript object types.
			arity = 1
		}
		arities[match[1]] = arity
	}
	return arities
}

func contractMethods(
	t *testing.T,
	source string,
	startMarker string,
	endMarker string,
	pattern *regexp.Regexp,
) []string {
	t.Helper()
	start := strings.Index(source, startMarker)
	if start < 0 {
		t.Fatalf("contract start marker %q was not found", startMarker)
	}
	bodyStart := start + len(startMarker)
	endOffset := strings.Index(source[bodyStart:], endMarker)
	if endOffset < 0 {
		t.Fatalf("contract end marker %q was not found", endMarker)
	}
	matches := pattern.FindAllStringSubmatch(
		source[bodyStart:bodyStart+endOffset],
		-1,
	)
	methods := make([]string, 0, len(matches))
	seen := make(map[string]struct{}, len(matches))
	for _, match := range matches {
		method := match[1]
		if _, duplicate := seen[method]; duplicate {
			t.Fatalf("contract repeats method %q", method)
		}
		seen[method] = struct{}{}
		methods = append(methods, method)
	}
	if len(methods) == 0 {
		t.Fatalf("contract did not expose any methods after %q", startMarker)
	}
	slices.Sort(methods)
	return methods
}
