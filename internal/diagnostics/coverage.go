package diagnostics

import (
	"fmt"
	"net/url"
	"sort"
	"strings"
)

const (
	maxKnownEndpoints           = 10_000
	maxObservedCalls            = 100_000
	maxCoverageMatchEvaluations = 5_000_000
	maxObservedPathsPerEndpoint = 100
)

// KnownEndpoint is an endpoint from OpenAPI or Actuator mappings.
type KnownEndpoint struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

// ObservedCall is an endpoint call captured by the caller. Count defaults to
// one and allows pre-aggregated input.
type ObservedCall struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	Count  int    `json:"count"`
}

// EndpointCoverage contains hit information for one known endpoint.
type EndpointCoverage struct {
	Method                 string   `json:"method"`
	Path                   string   `json:"path"`
	HitCount               int      `json:"hitCount"`
	ObservedPaths          []string `json:"observedPaths,omitempty"`
	ObservedPathsTruncated bool     `json:"observedPathsTruncated"`
}

// CoverageReport compares the known route list with captured calls.
type CoverageReport struct {
	TotalKnown      int                `json:"totalKnown"`
	Covered         int                `json:"covered"`
	CoveragePercent float64            `json:"coveragePercent"`
	Endpoints       []EndpointCoverage `json:"endpoints"`
	UnknownObserved []ObservedCall     `json:"unknownObserved,omitempty"`
}

type coverageRoute struct {
	EndpointCoverage
	segments    []string
	specificity int
	index       int
}

// AnalyzeEndpointCoverage matches observed concrete paths against Spring-style
// templates such as /orders/{id}, /files/{*path}, and /assets/**.
func AnalyzeEndpointCoverage(known []KnownEndpoint, observed []ObservedCall) (CoverageReport, error) {
	if len(known) > maxKnownEndpoints {
		return CoverageReport{}, limitExceeded("The known endpoint list is too large.", "Inspect at most 10000 known endpoints at once.")
	}
	if len(observed) > maxObservedCalls {
		return CoverageReport{}, limitExceeded("The observed call list is too large.", "Aggregate calls or inspect at most 100000 entries at once.")
	}
	if len(known) > 0 && len(observed) > maxCoverageMatchEvaluations/len(known) {
		return CoverageReport{}, limitExceeded(
			"The endpoint coverage comparison is too large.",
			"Reduce or aggregate the known and observed lists before comparing them.",
		)
	}

	routes := make([]coverageRoute, 0, len(known))
	seenKnown := make(map[string]struct{}, len(known))
	routesByMethod := make(map[string][]int)
	for _, endpoint := range known {
		method, err := normalizeHTTPMethod(endpoint.Method)
		if err != nil {
			return CoverageReport{}, err
		}
		path, err := normalizeEndpointPath(endpoint.Path)
		if err != nil {
			return CoverageReport{}, err
		}
		key := method + " " + path
		if _, exists := seenKnown[key]; exists {
			continue
		}
		seenKnown[key] = struct{}{}
		segments := splitPath(path)
		routes = append(routes, coverageRoute{
			EndpointCoverage: EndpointCoverage{Method: method, Path: path},
			segments:         segments,
			specificity:      routeSpecificity(segments),
			index:            len(routes),
		})
		routesByMethod[method] = append(routesByMethod[method], len(routes)-1)
	}

	type unknownKey struct {
		method string
		path   string
	}
	unknown := make(map[unknownKey]int)
	observedPathSets := make([]map[string]struct{}, len(routes))
	observedPathsTruncated := make([]bool, len(routes))
	for _, call := range observed {
		method, err := normalizeHTTPMethod(call.Method)
		if err != nil {
			return CoverageReport{}, err
		}
		path, err := normalizeObservedPath(call.Path)
		if err != nil {
			return CoverageReport{}, err
		}
		count := call.Count
		if count == 0 {
			count = 1
		}
		if count < 0 {
			return CoverageReport{}, invalidInput("An observed call count is negative.", "Use zero for one call or a positive aggregated count.")
		}

		bestRoute := -1
		actualSegments := splitPath(path)
		for _, index := range routesByMethod[method] {
			if !routeMatches(routes[index].segments, actualSegments) {
				continue
			}
			if bestRoute < 0 ||
				preferredCoverageRoute(routes[index], routes[bestRoute]) {
				bestRoute = index
			}
		}
		if bestRoute < 0 {
			key := unknownKey{method: method, path: path}
			total, ok := checkedCoverageCount(unknown[key], count)
			if !ok {
				return CoverageReport{}, limitExceeded(
					"The aggregated observed call count is too large.",
					"Reduce pre-aggregated call counts before comparing coverage.",
				)
			}
			unknown[key] = total
			continue
		}
		total, ok := checkedCoverageCount(
			routes[bestRoute].HitCount,
			count,
		)
		if !ok {
			return CoverageReport{}, limitExceeded(
				"The endpoint hit count is too large.",
				"Reduce pre-aggregated call counts before comparing coverage.",
			)
		}
		routes[bestRoute].HitCount = total
		if observedPathSets[bestRoute] == nil {
			observedPathSets[bestRoute] = make(map[string]struct{})
		}
		if _, exists := observedPathSets[bestRoute][path]; exists {
			continue
		}
		if len(observedPathSets[bestRoute]) <
			maxObservedPathsPerEndpoint {
			observedPathSets[bestRoute][path] = struct{}{}
		} else {
			observedPathsTruncated[bestRoute] = true
		}
	}

	report := CoverageReport{TotalKnown: len(routes)}
	sort.SliceStable(routes, func(i, j int) bool {
		if routes[i].Method == routes[j].Method {
			return routes[i].Path < routes[j].Path
		}
		return routes[i].Method < routes[j].Method
	})
	report.Endpoints = make([]EndpointCoverage, 0, len(routes))
	for _, route := range routes {
		paths := make([]string, 0)
		for path := range observedPathSets[route.index] {
			paths = append(paths, path)
		}
		sort.Strings(paths)
		route.ObservedPaths = paths
		route.ObservedPathsTruncated =
			observedPathsTruncated[route.index]
		if route.HitCount > 0 {
			report.Covered++
		}
		report.Endpoints = append(report.Endpoints, route.EndpointCoverage)
	}
	if report.TotalKnown > 0 {
		report.CoveragePercent = float64(report.Covered) / float64(report.TotalKnown) * 100
	}
	for key, count := range unknown {
		report.UnknownObserved = append(report.UnknownObserved, ObservedCall{Method: key.method, Path: key.path, Count: count})
	}
	sort.Slice(report.UnknownObserved, func(i, j int) bool {
		if report.UnknownObserved[i].Method == report.UnknownObserved[j].Method {
			return report.UnknownObserved[i].Path < report.UnknownObserved[j].Path
		}
		return report.UnknownObserved[i].Method < report.UnknownObserved[j].Method
	})
	return report, nil
}

func preferredCoverageRoute(
	candidate coverageRoute,
	current coverageRoute,
) bool {
	if candidate.specificity != current.specificity {
		return candidate.specificity > current.specificity
	}
	if candidate.Path != current.Path {
		return candidate.Path < current.Path
	}
	return candidate.index < current.index
}

func checkedCoverageCount(current, addition int) (int, bool) {
	const maxInt = int(^uint(0) >> 1)
	if addition < 0 || current > maxInt-addition {
		return 0, false
	}
	return current + addition, true
}

func normalizeHTTPMethod(raw string) (string, error) {
	method := strings.ToUpper(strings.TrimSpace(raw))
	if method == "" {
		return "", invalidInput("An endpoint HTTP method is empty.", "Provide the method for every known endpoint and observed call.")
	}
	for _, character := range method {
		if (character < 'A' || character > 'Z') && character != '-' {
			return "", invalidInput("An endpoint HTTP method is invalid.", "Use a standard method such as GET or POST.")
		}
	}
	return method, nil
}

func normalizeEndpointPath(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", invalidInput("An endpoint path is empty.", "Provide a path such as /api/orders/{id}.")
	}
	if separator := strings.IndexAny(value, "?#"); separator >= 0 {
		value = value[:separator]
	}
	if value == "" {
		return "", invalidInput("An endpoint path is empty.", "Provide a path such as /api/orders/{id}.")
	}
	return normalizePathSlashes(value)
}

func normalizeObservedPath(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", invalidInput("An observed endpoint path is empty.", "Provide a path such as /api/orders/42.")
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return "", invalidInput("An observed endpoint path is invalid.", "Provide a URL or path without invalid escaping.")
	}
	path := parsed.Path
	if path == "" {
		path = "/"
	}
	return normalizePathSlashes(path)
}

func normalizePathSlashes(path string) (string, error) {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	for strings.Contains(path, "//") {
		path = strings.ReplaceAll(path, "//", "/")
	}
	if len(path) > 1 {
		path = strings.TrimRight(path, "/")
	}
	if len(path) > 4096 {
		return "", invalidInput("An endpoint path is too long.", "Use paths no longer than 4096 characters.")
	}
	return path, nil
}

func splitPath(path string) []string {
	path = strings.Trim(path, "/")
	if path == "" {
		return nil
	}
	return strings.Split(path, "/")
}

func routeSpecificity(segments []string) int {
	score := len(segments)
	for _, segment := range segments {
		switch {
		case segment == "**" || strings.HasPrefix(segment, "{*"):
			score += 1
		case segment == "*" || strings.HasPrefix(segment, "{") || strings.HasPrefix(segment, ":"):
			score += 10
		default:
			score += 100
		}
	}
	return score
}

func routeMatches(template, actual []string) bool {
	templateIndex := 0
	actualIndex := 0
	for templateIndex < len(template) {
		segment := template[templateIndex]
		if segment == "**" || strings.HasPrefix(segment, "{*") {
			return templateIndex == len(template)-1
		}
		if actualIndex >= len(actual) {
			return false
		}
		if !pathSegmentMatches(segment, actual[actualIndex]) {
			return false
		}
		templateIndex++
		actualIndex++
	}
	return actualIndex == len(actual)
}

func pathSegmentMatches(template, actual string) bool {
	if template == "*" || strings.HasPrefix(template, ":") {
		return actual != ""
	}
	if strings.HasPrefix(template, "{") && strings.HasSuffix(template, "}") {
		return actual != ""
	}
	return template == actual
}

func (r CoverageReport) String() string {
	return fmt.Sprintf("%d/%d endpoints covered (%.1f%%)", r.Covered, r.TotalKnown, r.CoveragePercent)
}
