package diagnostics

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"validex/internal/jsonnumber"
)

const (
	defaultMaxEnvironments         = 8
	defaultRequestLimit            = int64(2 << 20)
	maxRequestLimit                = int64(16 << 20)
	maxEnvironmentDifferences      = 1000
	maxEnvironmentJSONPathBytes    = 4 << 10
	maxEnvironmentJSONPathSegments = 128
	maxEnvironmentJSONPathIndex    = 1_000_000_000
	maxEnvironmentJSONDiffDepth    = 256
	maxEnvironmentJSONDiffNodes    = 10_000
	maxEnvironmentJSONValueBytes   = 4 << 10
)

// EnvironmentTarget identifies one deployment of the same service.
type EnvironmentTarget struct {
	Name    string `json:"name"`
	BaseURL string `json:"baseUrl"`
}

// EnvironmentRequest is replayed against each target. Unsafe HTTP methods are
// refused unless AllowUnsafe is explicitly enabled.
type EnvironmentRequest struct {
	Method          string              `json:"method"`
	Path            string              `json:"path"`
	Headers         map[string][]string `json:"headers,omitempty"`
	Body            []byte              `json:"body,omitempty"`
	Targets         []EnvironmentTarget `json:"targets"`
	IgnoreJSONPaths []string            `json:"ignoreJsonPaths,omitempty"`
	IgnoreHeaders   []string            `json:"ignoreHeaders,omitempty"`
	AllowUnsafe     bool                `json:"allowUnsafe"`
}

// EnvironmentCompareOptions controls bounded network activity.
type EnvironmentCompareOptions struct {
	// HTTPClient supplies transport and redirect behavior. Its CookieJar is not
	// reused: comparison targets must not exchange ambient cookie state.
	HTTPClient       *http.Client
	Timeout          time.Duration
	MaxResponseBytes int64
	MaxRequestBytes  int64
	MaxEnvironments  int
}

// EnvironmentResponse is the bounded response captured from one target.
type EnvironmentResponse struct {
	Name        string              `json:"name"`
	URL         string              `json:"url"`
	StatusCode  int                 `json:"statusCode"`
	Duration    time.Duration       `json:"duration"`
	Headers     map[string][]string `json:"headers,omitempty"`
	Body        string              `json:"body,omitempty"`
	ContentType string              `json:"contentType,omitempty"`
	Truncated   bool                `json:"truncated"`
	Error       string              `json:"error,omitempty"`
}

// JSONDifferenceKind is the closed set of structural comparison outcomes.
type JSONDifferenceKind string

const (
	JSONDifferenceValueMismatch      JSONDifferenceKind = "value_mismatch"
	JSONDifferenceTypeMismatch       JSONDifferenceKind = "type_mismatch"
	JSONDifferenceExtraInCandidate   JSONDifferenceKind = "extra_in_candidate"
	JSONDifferenceMissingInCandidate JSONDifferenceKind = "missing_in_candidate"
)

// JSONDifference is one structural or value difference. Candidate refers to
// the compared environment and baseline refers to the first environment.
type JSONDifference struct {
	Path      string             `json:"path"`
	Kind      JSONDifferenceKind `json:"kind"`
	Baseline  any                `json:"baseline,omitempty"`
	Candidate any                `json:"candidate,omitempty"`
}

// EnvironmentBodyMode explains how two response bodies were compared.
type EnvironmentBodyMode string

const (
	EnvironmentBodyUnavailable EnvironmentBodyMode = "unavailable"
	EnvironmentBodyJSON        EnvironmentBodyMode = "json"
	EnvironmentBodyText        EnvironmentBodyMode = "text"
)

// EnvironmentDiff compares one target with the first target.
type EnvironmentDiff struct {
	Baseline                   string              `json:"baseline"`
	Candidate                  string              `json:"candidate"`
	StatusMatch                bool                `json:"statusMatch"`
	BaselineStatus             int                 `json:"baselineStatus"`
	CandidateStatus            int                 `json:"candidateStatus"`
	HeaderDifferences          []string            `json:"headerDifferences,omitempty"`
	HeaderDifferencesTruncated bool                `json:"headerDifferencesTruncated"`
	BodyEqual                  bool                `json:"bodyEqual"`
	BodyMode                   EnvironmentBodyMode `json:"bodyMode"`
	JSONDifferences            []JSONDifference    `json:"jsonDifferences,omitempty"`
	JSONDifferencesTruncated   bool                `json:"jsonDifferencesTruncated"`
	Error                      string              `json:"error,omitempty"`
}

// EnvironmentComparison contains responses in target order and comparisons
// against the first target.
type EnvironmentComparison struct {
	Method      string                `json:"method"`
	Path        string                `json:"path"`
	Responses   []EnvironmentResponse `json:"responses"`
	Comparisons []EnvironmentDiff     `json:"comparisons"`
}

// CompareEnvironments sends one bounded request to each environment and
// compares each result to the first environment.
func CompareEnvironments(ctx context.Context, input EnvironmentRequest, options EnvironmentCompareOptions) (EnvironmentComparison, error) {
	method := strings.ToUpper(strings.TrimSpace(input.Method))
	if method == "" {
		method = http.MethodGet
	}
	if !supportedCompareMethod(method) {
		return EnvironmentComparison{}, invalidInput("The HTTP method is not supported for environment comparison.", "Use GET, HEAD, OPTIONS, POST, PUT, PATCH, or DELETE.")
	}
	if !safeHTTPMethod(method) && !input.AllowUnsafe {
		return EnvironmentComparison{}, newDiagnosticError(
			CodeUnsafeMethod,
			fmt.Sprintf("%s is blocked for environment comparison by default.", method),
			"Enable unsafe requests explicitly after confirming every target.",
			nil,
		)
	}
	if len(input.Targets) < 2 {
		return EnvironmentComparison{}, invalidInput("At least two environments are required.", "Select a baseline and one or more environments to compare.")
	}
	maxEnvironments := options.MaxEnvironments
	if maxEnvironments == 0 {
		maxEnvironments = defaultMaxEnvironments
	}
	if maxEnvironments < 2 || maxEnvironments > 20 {
		return EnvironmentComparison{}, invalidInput("The environment limit is outside the supported range.", "Use a limit from 2 through 20 environments.")
	}
	if len(input.Targets) > maxEnvironments {
		return EnvironmentComparison{}, limitExceeded("Too many environments were selected.", fmt.Sprintf("Select at most %d environments.", maxEnvironments))
	}
	requestLimit := options.MaxRequestBytes
	if requestLimit == 0 {
		requestLimit = defaultRequestLimit
	}
	if requestLimit < 1 || requestLimit > maxRequestLimit {
		return EnvironmentComparison{}, invalidInput("The request size limit is outside the supported range.", "Use a limit from 1 byte through 16 MiB.")
	}
	if int64(len(input.Body)) > requestLimit {
		return EnvironmentComparison{}, limitExceeded("The request body is too large to replay safely.", fmt.Sprintf("Keep the request body below %d bytes.", requestLimit))
	}
	timeout, err := boundedTimeout(options.Timeout)
	if err != nil {
		return EnvironmentComparison{}, err
	}
	responseLimit, err := boundedResponseLimit(options.MaxResponseBytes)
	if err != nil {
		return EnvironmentComparison{}, err
	}
	ignorePaths, err := compileJSONPaths(input.IgnoreJSONPaths)
	if err != nil {
		return EnvironmentComparison{}, err
	}
	targetURLs := make([]string, len(input.Targets))
	seenNames := make(map[string]struct{}, len(input.Targets))
	for i, target := range input.Targets {
		name := strings.TrimSpace(target.Name)
		if name == "" {
			return EnvironmentComparison{}, invalidInput("An environment name is empty.", "Give every environment a unique display name.")
		}
		if _, exists := seenNames[name]; exists {
			return EnvironmentComparison{}, invalidInput("Environment names must be unique.", "Rename duplicate environments before comparing them.")
		}
		seenNames[name] = struct{}{}
		targetURL, resolveErr := resolveEnvironmentURL(target.BaseURL, input.Path)
		if resolveErr != nil {
			return EnvironmentComparison{}, resolveErr
		}
		targetURLs[i] = targetURL
	}

	responses := make([]EnvironmentResponse, len(input.Targets))
	var waitGroup sync.WaitGroup
	for i := range input.Targets {
		waitGroup.Add(1)
		go func(index int) {
			defer waitGroup.Done()
			client := cloneHTTPClient(options.HTTPClient, timeout)
			client.Jar = nil
			responses[index] = fetchEnvironment(
				ctx,
				client,
				timeout,
				responseLimit,
				method,
				targetURLs[index],
				input.Targets[index].Name,
				input.Headers,
				input.Body,
			)
		}(i)
	}
	waitGroup.Wait()

	result := EnvironmentComparison{
		Method:    method,
		Path:      input.Path,
		Responses: responses,
	}
	ignoredHeaders := normalizedIgnoredHeaders(input.IgnoreHeaders)
	preparedBaseline := prepareEnvironmentResponse(responses[0])
	for i := 1; i < len(responses); i++ {
		result.Comparisons = append(
			result.Comparisons,
			comparePreparedEnvironmentResponses(
				preparedBaseline,
				prepareEnvironmentResponse(responses[i]),
				ignoredHeaders,
				ignorePaths,
			),
		)
	}
	return result, nil
}

func supportedCompareMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func safeHTTPMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions
}

func resolveEnvironmentURL(baseURL, requestPath string) (string, error) {
	base, err := parseHTTPBaseURL(baseURL)
	if err != nil {
		return "", err
	}
	relative, err := url.Parse(strings.TrimSpace(requestPath))
	if err != nil || relative.IsAbs() || relative.Host != "" || relative.User != nil || relative.Fragment != "" {
		return "", invalidInput("The comparison path is not a valid relative URL.", "Use a path such as /api/orders?limit=10.")
	}
	base.Path = strings.TrimRight(base.Path, "/") + "/" + strings.TrimLeft(relative.Path, "/")
	if relative.Path == "" {
		base.Path = strings.TrimRight(base.Path, "/")
	}
	base.RawQuery = relative.RawQuery
	return base.String(), nil
}

func fetchEnvironment(
	ctx context.Context,
	client *http.Client,
	timeout time.Duration,
	responseLimit int64,
	method, requestURL, name string,
	headers map[string][]string,
	body []byte,
) EnvironmentResponse {
	result := EnvironmentResponse{Name: name, URL: requestURL}
	requestContext, cancel := contextWithTimeout(ctx, timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestContext, method, requestURL, bytes.NewReader(body))
	if err != nil {
		result.Error = "The request could not be created."
		return result
	}
	for key, values := range headers {
		if strings.EqualFold(key, "Host") || strings.EqualFold(key, "Content-Length") {
			continue
		}
		for _, value := range values {
			request.Header.Add(key, value)
		}
	}
	startedAt := time.Now()
	response, err := client.Do(request)
	result.Duration = time.Since(startedAt)
	if err != nil {
		result.Error = requestFailed(err).Error()
		return result
	}
	defer response.Body.Close()
	result.StatusCode = response.StatusCode
	result.ContentType = response.Header.Get("Content-Type")
	result.Headers = sanitizeResponseHeaders(response.Header)
	data, tooLarge, err := readLimitedBody(response.Body, responseLimit)
	if err != nil {
		result.Error = "The response body could not be read."
		return result
	}
	result.Body = string(data)
	if tooLarge {
		result.Truncated = true
		result.Error = responseTooLarge(responseLimit).Error()
	}
	return result
}

func sanitizeResponseHeaders(headers http.Header) map[string][]string {
	sanitized := make(map[string][]string, len(headers))
	for key, values := range headers {
		canonical := http.CanonicalHeaderKey(key)
		if strings.EqualFold(canonical, "Set-Cookie") || strings.EqualFold(canonical, "Authorization") {
			sanitized[canonical] = []string{"[redacted]"}
			continue
		}
		sanitized[canonical] = append([]string(nil), values...)
	}
	return sanitized
}

func normalizedIgnoredHeaders(extra []string) map[string]struct{} {
	ignored := map[string]struct{}{
		"connection":        {},
		"content-length":    {},
		"date":              {},
		"keep-alive":        {},
		"transfer-encoding": {},
	}
	for _, header := range extra {
		header = strings.ToLower(strings.TrimSpace(header))
		if header != "" {
			ignored[header] = struct{}{}
		}
	}
	return ignored
}

func compareEnvironmentResponses(
	baseline, candidate EnvironmentResponse,
	ignoredHeaders map[string]struct{},
	ignorePaths []jsonPath,
) EnvironmentDiff {
	return comparePreparedEnvironmentResponses(
		prepareEnvironmentResponse(baseline),
		prepareEnvironmentResponse(candidate),
		ignoredHeaders,
		ignorePaths,
	)
}

type preparedEnvironmentResponse struct {
	response         EnvironmentResponse
	canonicalHeaders map[string][]string
	jsonValue        any
	jsonErr          error
}

func prepareEnvironmentResponse(
	response EnvironmentResponse,
) preparedEnvironmentResponse {
	prepared := preparedEnvironmentResponse{
		response:         response,
		canonicalHeaders: canonicalHeaderValues(response.Headers),
	}
	if response.Error == "" {
		prepared.jsonErr = decodeJSON(
			[]byte(response.Body),
			&prepared.jsonValue,
		)
	}
	return prepared
}

func comparePreparedEnvironmentResponses(
	baseline, candidate preparedEnvironmentResponse,
	ignoredHeaders map[string]struct{},
	ignorePaths []jsonPath,
) EnvironmentDiff {
	result := EnvironmentDiff{
		Baseline:        baseline.response.Name,
		Candidate:       candidate.response.Name,
		BaselineStatus:  baseline.response.StatusCode,
		CandidateStatus: candidate.response.StatusCode,
		StatusMatch: baseline.response.StatusCode ==
			candidate.response.StatusCode,
	}
	if baseline.response.Error != "" || candidate.response.Error != "" {
		result.Error = "One or both environment responses could not be compared."
		result.BodyMode = EnvironmentBodyUnavailable
		return result
	}
	result.HeaderDifferences, result.HeaderDifferencesTruncated =
		diffCanonicalHeaders(
			baseline.canonicalHeaders,
			candidate.canonicalHeaders,
			ignoredHeaders,
		)

	if baseline.jsonErr == nil && candidate.jsonErr == nil {
		result.BodyMode = EnvironmentBodyJSON
		diffJSONValues(
			baseline.jsonValue,
			candidate.jsonValue,
			nil,
			ignorePaths,
			&result.JSONDifferences,
			&result.JSONDifferencesTruncated,
			0,
			&jsonDiffBudget{},
		)
		result.BodyEqual = len(result.JSONDifferences) == 0 && !result.JSONDifferencesTruncated
		return result
	}
	result.BodyMode = EnvironmentBodyText
	result.BodyEqual = baseline.response.Body == candidate.response.Body
	return result
}

func decodeJSON(data []byte, target any) error {
	if len(bytes.TrimSpace(data)) == 0 {
		return fmt.Errorf("empty body")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return fmt.Errorf("multiple JSON values")
		}
		return err
	}
	return nil
}

func diffHeaders(baseline, candidate map[string][]string, ignored map[string]struct{}) ([]string, bool) {
	baselineValues := canonicalHeaderValues(baseline)
	candidateValues := canonicalHeaderValues(candidate)
	return diffCanonicalHeaders(
		baselineValues,
		candidateValues,
		ignored,
	)
}

func diffCanonicalHeaders(
	baselineValues, candidateValues map[string][]string,
	ignored map[string]struct{},
) ([]string, bool) {
	allKeys := make(
		map[string]struct{},
		len(baselineValues)+len(candidateValues),
	)
	for key := range baselineValues {
		allKeys[key] = struct{}{}
	}
	for key := range candidateValues {
		allKeys[key] = struct{}{}
	}
	keys := make([]string, 0, len(allKeys))
	for key := range allKeys {
		if _, skip := ignored[key]; !skip {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	var differences []string
	for _, key := range keys {
		if !reflect.DeepEqual(baselineValues[key], candidateValues[key]) {
			if len(differences) >= maxEnvironmentDifferences {
				return differences, true
			}
			differences = append(differences, key)
		}
	}
	return differences, false
}

func canonicalHeaderValues(headers map[string][]string) map[string][]string {
	result := make(map[string][]string, len(headers))
	for key, values := range headers {
		normalized := strings.ToLower(key)
		copied := append([]string(nil), values...)
		sort.Strings(copied)
		result[normalized] = copied
	}
	return result
}

type jsonPathToken struct {
	key      string
	index    int
	isIndex  bool
	wildcard bool
}

type jsonPath []jsonPathToken

func compileJSONPaths(paths []string) ([]jsonPath, error) {
	result := make([]jsonPath, 0, len(paths))
	if len(paths) > 100 {
		return nil, limitExceeded("Too many JSON ignore paths were provided.", "Use at most 100 JSON paths.")
	}
	for _, rawPath := range paths {
		path, err := parseJSONPath(rawPath)
		if err != nil {
			return nil, err
		}
		result = append(result, path)
	}
	return result, nil
}

func parseJSONPath(raw string) (jsonPath, error) {
	value := strings.TrimSpace(raw)
	if value == "" || value[0] != '$' {
		return nil, invalidInput("A JSON ignore path is invalid.", "Use paths such as $.traceId or $.items[*].updatedAt.")
	}
	if !utf8.ValidString(value) {
		return nil, invalidInput(
			"A JSON ignore path is not valid UTF-8.",
			"Use a valid Unicode JSON path.",
		)
	}
	if len(value) > maxEnvironmentJSONPathBytes {
		return nil, limitExceeded(
			"A JSON ignore path is too long.",
			fmt.Sprintf(
				"Use paths no longer than %d bytes.",
				maxEnvironmentJSONPathBytes,
			),
		)
	}
	if value == "$" {
		return jsonPath{}, nil
	}
	var tokens jsonPath
	appendToken := func(token jsonPathToken) error {
		if len(tokens) >= maxEnvironmentJSONPathSegments {
			return limitExceeded(
				"A JSON ignore path has too many segments.",
				fmt.Sprintf(
					"Use at most %d path segments.",
					maxEnvironmentJSONPathSegments,
				),
			)
		}
		tokens = append(tokens, token)
		return nil
	}
	for index := 1; index < len(value); {
		switch value[index] {
		case '.':
			index++
			start := index
			for index < len(value) && value[index] != '.' && value[index] != '[' {
				index++
			}
			if start == index {
				return nil, invalidInput("A JSON ignore path is invalid.", "Use paths such as $.traceId or $.items[*].updatedAt.")
			}
			key := value[start:index]
			if err := appendToken(jsonPathToken{
				key:      key,
				wildcard: key == "*",
			}); err != nil {
				return nil, err
			}
		case '[':
			if index+1 < len(value) && value[index+1] == '"' {
				key, next, err := parseQuotedJSONPathKey(value, index)
				if err != nil {
					return nil, err
				}
				if err := appendToken(jsonPathToken{key: key}); err != nil {
					return nil, err
				}
				index = next
				continue
			}
			end := strings.IndexByte(value[index:], ']')
			if end < 0 {
				return nil, invalidInput("A JSON ignore path is invalid.", "Close every array selector with ].")
			}
			end += index
			selector := strings.TrimSpace(value[index+1 : end])
			if selector == "*" {
				if err := appendToken(jsonPathToken{
					isIndex:  true,
					wildcard: true,
				}); err != nil {
					return nil, err
				}
			} else {
				arrayIndex, err := strconv.ParseUint(selector, 10, 31)
				if err != nil ||
					arrayIndex > maxEnvironmentJSONPathIndex {
					return nil, invalidInput("A JSON array ignore path is invalid.", "Use a numeric index or [*].")
				}
				if err := appendToken(jsonPathToken{
					index:   int(arrayIndex),
					isIndex: true,
				}); err != nil {
					return nil, err
				}
			}
			index = end + 1
		default:
			return nil, invalidInput("A JSON ignore path is invalid.", "Separate object fields with a dot.")
		}
	}
	return tokens, nil
}

func parseQuotedJSONPathKey(
	value string,
	start int,
) (string, int, error) {
	quoteStart := start + 1
	index := quoteStart + 1
	escaped := false
	for index < len(value) {
		switch {
		case escaped:
			escaped = false
		case value[index] == '\\':
			escaped = true
		case value[index] == '"':
			encoded := value[quoteStart : index+1]
			var key string
			err := json.Unmarshal([]byte(encoded), &key)
			if err != nil {
				return "", 0, invalidInput(
					"A quoted JSON ignore key is invalid.",
					"Use JSON string escaping inside brackets.",
				)
			}
			index++
			if index >= len(value) || value[index] != ']' {
				return "", 0, invalidInput(
					"A quoted JSON ignore key is invalid.",
					"Close quoted keys with ].",
				)
			}
			return key, index + 1, nil
		}
		index++
	}
	return "", 0, invalidInput(
		"A quoted JSON ignore key is invalid.",
		"Close every quoted key and bracket.",
	)
}

func ignoredJSONPath(actual jsonPath, ignored []jsonPath) bool {
	for _, pattern := range ignored {
		if len(pattern) != len(actual) {
			continue
		}
		matches := true
		for i := range pattern {
			if pattern[i].wildcard {
				if pattern[i].isIndex != actual[i].isIndex {
					matches = false
					break
				}
				continue
			}
			if pattern[i].isIndex != actual[i].isIndex ||
				(pattern[i].isIndex && pattern[i].index != actual[i].index) ||
				(!pattern[i].isIndex && pattern[i].key != actual[i].key) {
				matches = false
				break
			}
		}
		if matches {
			return true
		}
	}
	return false
}

func diffJSONValues(
	baseline, candidate any,
	path jsonPath,
	ignored []jsonPath,
	differences *[]JSONDifference,
	truncated *bool,
	depth int,
	budget *jsonDiffBudget,
) {
	if *truncated || ignoredJSONPath(path, ignored) {
		return
	}
	if !budget.consume(depth) {
		*truncated = true
		return
	}
	displayPath := formatJSONPath(path)
	if baseline == nil || candidate == nil {
		if baseline != candidate {
			addJSONDifference(
				differences,
				truncated,
				JSONDifference{
					Path:      displayPath,
					Kind:      JSONDifferenceValueMismatch,
					Baseline:  reportedJSONDifferenceValue(baseline),
					Candidate: reportedJSONDifferenceValue(candidate),
				},
			)
		}
		return
	}
	if jsonType(baseline) != jsonType(candidate) {
		addJSONDifference(
			differences,
			truncated,
			JSONDifference{Path: displayPath, Kind: JSONDifferenceTypeMismatch, Baseline: jsonType(baseline), Candidate: jsonType(candidate)},
		)
		return
	}
	switch baselineValue := baseline.(type) {
	case map[string]any:
		candidateValue := candidate.(map[string]any)
		keys := make(map[string]struct{}, len(baselineValue)+len(candidateValue))
		for key := range baselineValue {
			keys[key] = struct{}{}
		}
		for key := range candidateValue {
			keys[key] = struct{}{}
		}
		ordered := make([]string, 0, len(keys))
		for key := range keys {
			ordered = append(ordered, key)
		}
		sort.Strings(ordered)
		for _, key := range ordered {
			childPath := appendJSONPath(path, jsonPathToken{key: key})
			if ignoredJSONPath(childPath, ignored) {
				continue
			}
			baselineChild, baselineOK := baselineValue[key]
			candidateChild, candidateOK := candidateValue[key]
			if !baselineOK {
				addJSONDifference(
					differences,
					truncated,
					JSONDifference{
						Path: formatJSONPath(childPath),
						Kind: JSONDifferenceExtraInCandidate,
						Candidate: reportedJSONDifferenceValue(
							candidateChild,
						),
					},
				)
			} else if !candidateOK {
				addJSONDifference(
					differences,
					truncated,
					JSONDifference{
						Path: formatJSONPath(childPath),
						Kind: JSONDifferenceMissingInCandidate,
						Baseline: reportedJSONDifferenceValue(
							baselineChild,
						),
					},
				)
			} else {
				diffJSONValues(
					baselineChild,
					candidateChild,
					childPath,
					ignored,
					differences,
					truncated,
					depth+1,
					budget,
				)
			}
			if *truncated {
				return
			}
		}
	case []any:
		candidateValue := candidate.([]any)
		maxLength := len(baselineValue)
		if len(candidateValue) > maxLength {
			maxLength = len(candidateValue)
		}
		for index := 0; index < maxLength; index++ {
			childPath := appendJSONPath(path, jsonPathToken{index: index, isIndex: true})
			if ignoredJSONPath(childPath, ignored) {
				continue
			}
			if index >= len(baselineValue) {
				addJSONDifference(
					differences,
					truncated,
					JSONDifference{
						Path: formatJSONPath(childPath),
						Kind: JSONDifferenceExtraInCandidate,
						Candidate: reportedJSONDifferenceValue(
							candidateValue[index],
						),
					},
				)
			} else if index >= len(candidateValue) {
				addJSONDifference(
					differences,
					truncated,
					JSONDifference{
						Path: formatJSONPath(childPath),
						Kind: JSONDifferenceMissingInCandidate,
						Baseline: reportedJSONDifferenceValue(
							baselineValue[index],
						),
					},
				)
			} else {
				diffJSONValues(
					baselineValue[index],
					candidateValue[index],
					childPath,
					ignored,
					differences,
					truncated,
					depth+1,
					budget,
				)
			}
			if *truncated {
				return
			}
		}
	default:
		if baselineNumber, ok := baseline.(json.Number); ok {
			candidateNumber := candidate.(json.Number)
			if jsonnumber.Equal(
				baselineNumber,
				candidateNumber,
				jsonnumber.Limits{},
			) {
				return
			}
		}
		if !reflect.DeepEqual(baseline, candidate) {
			addJSONDifference(
				differences,
				truncated,
				JSONDifference{
					Path:      displayPath,
					Kind:      JSONDifferenceValueMismatch,
					Baseline:  reportedJSONDifferenceValue(baseline),
					Candidate: reportedJSONDifferenceValue(candidate),
				},
			)
		}
	}
}

type jsonDiffBudget struct {
	nodes int
}

func (budget *jsonDiffBudget) consume(depth int) bool {
	if budget == nil ||
		depth > maxEnvironmentJSONDiffDepth ||
		budget.nodes >= maxEnvironmentJSONDiffNodes {
		return false
	}
	budget.nodes++
	return true
}

func reportedJSONDifferenceValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return fmt.Sprintf("<object: %d keys>", len(typed))
	case []any:
		return fmt.Sprintf("<array: %d items>", len(typed))
	case string:
		return truncateUTF8(typed, maxEnvironmentJSONValueBytes)
	case json.Number:
		encoded := typed.String()
		if len(encoded) > maxEnvironmentJSONValueBytes {
			return truncateUTF8(encoded, maxEnvironmentJSONValueBytes)
		}
		return typed
	default:
		return value
	}
}

func addJSONDifference(differences *[]JSONDifference, truncated *bool, difference JSONDifference) {
	if len(*differences) >= maxEnvironmentDifferences {
		*truncated = true
		return
	}
	*differences = append(*differences, difference)
}

func appendJSONPath(path jsonPath, token jsonPathToken) jsonPath {
	result := make(jsonPath, len(path), len(path)+1)
	copy(result, path)
	return append(result, token)
}

func formatJSONPath(path jsonPath) string {
	var builder strings.Builder
	builder.WriteByte('$')
	for _, token := range path {
		if token.isIndex {
			builder.WriteByte('[')
			builder.WriteString(strconv.Itoa(token.index))
			builder.WriteByte(']')
		} else {
			if validDotJSONPathKey(token.key) {
				builder.WriteByte('.')
				builder.WriteString(token.key)
			} else {
				builder.WriteByte('[')
				builder.WriteString(strconv.Quote(token.key))
				builder.WriteByte(']')
			}
		}
	}
	return builder.String()
}

func validDotJSONPathKey(key string) bool {
	if key == "" {
		return false
	}
	for index, character := range key {
		if character >= 'a' && character <= 'z' ||
			character >= 'A' && character <= 'Z' ||
			character == '_' {
			continue
		}
		if index > 0 && character >= '0' && character <= '9' {
			continue
		}
		return false
	}
	return true
}

func jsonType(value any) string {
	switch value.(type) {
	case map[string]any:
		return "object"
	case []any:
		return "array"
	case json.Number:
		return "number"
	case string:
		return "string"
	case bool:
		return "boolean"
	case nil:
		return "null"
	default:
		return fmt.Sprintf("%T", value)
	}
}
