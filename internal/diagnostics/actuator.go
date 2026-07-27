package diagnostics

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	defaultMaxMetrics = 32
	maxAllowedMetrics = 128
)

// ActuatorClientOptions configures bounded, read-only Actuator requests.
type ActuatorClientOptions struct {
	HTTPClient       *http.Client
	Headers          http.Header
	Timeout          time.Duration
	MaxResponseBytes int64
	MaxMetrics       int
}

// ActuatorClient reads JSON from a Spring Boot Actuator base URL.
type ActuatorClient struct {
	baseURL          *url.URL
	httpClient       *http.Client
	headers          http.Header
	timeout          time.Duration
	maxResponseBytes int64
	maxMetrics       int
}

// NewActuatorClient creates a client for a base URL such as
// http://localhost:8080/actuator.
func NewActuatorClient(baseURL string, options ActuatorClientOptions) (*ActuatorClient, error) {
	parsed, err := parseHTTPBaseURL(baseURL)
	if err != nil {
		return nil, err
	}
	timeout, err := boundedTimeout(options.Timeout)
	if err != nil {
		return nil, err
	}
	responseLimit, err := boundedResponseLimit(options.MaxResponseBytes)
	if err != nil {
		return nil, err
	}
	maxMetrics := options.MaxMetrics
	if maxMetrics == 0 {
		maxMetrics = defaultMaxMetrics
	}
	if maxMetrics < 1 || maxMetrics > maxAllowedMetrics {
		return nil, invalidInput("The metric selection limit is outside the supported range.", "Choose a limit from 1 through 128 metrics.")
	}

	headers := options.Headers.Clone()
	if headers == nil {
		headers = make(http.Header)
	}
	return &ActuatorClient{
		baseURL:          parsed,
		httpClient:       cloneHTTPClient(options.HTTPClient, timeout),
		headers:          headers,
		timeout:          timeout,
		maxResponseBytes: responseLimit,
		maxMetrics:       maxMetrics,
	}, nil
}

// HealthSnapshot contains the standard Actuator health fields while retaining
// any application-specific fields in Data.
type HealthSnapshot struct {
	Status     string         `json:"status"`
	Components map[string]any `json:"components,omitempty"`
	Groups     []string       `json:"groups,omitempty"`
	Data       map[string]any `json:"data"`
}

// FetchHealth reads GET /health.
func (c *ActuatorClient) FetchHealth(ctx context.Context) (HealthSnapshot, error) {
	var payload map[string]any
	if err := c.fetchJSON(ctx, "health", &payload); err != nil {
		return HealthSnapshot{}, err
	}
	result := HealthSnapshot{Data: payload}
	if status, ok := payload["status"].(string); ok {
		result.Status = status
	}
	if components, ok := payload["components"].(map[string]any); ok {
		result.Components = components
	}
	if rawGroups, ok := payload["groups"].([]any); ok {
		for _, rawGroup := range rawGroups {
			if group, ok := rawGroup.(string); ok {
				result.Groups = append(result.Groups, group)
			}
		}
	}
	return result, nil
}

// MappingsSnapshot retains the complete Actuator mappings document. Spring
// versions and web stacks expose different nested shapes, so the payload stays
// schema-neutral.
type MappingsSnapshot struct {
	Contexts map[string]any `json:"contexts,omitempty"`
	Data     map[string]any `json:"data"`
}

// FetchMappings reads GET /mappings.
func (c *ActuatorClient) FetchMappings(ctx context.Context) (MappingsSnapshot, error) {
	var payload map[string]any
	if err := c.fetchJSON(ctx, "mappings", &payload); err != nil {
		return MappingsSnapshot{}, err
	}
	result := MappingsSnapshot{Data: payload}
	if contexts, ok := payload["contexts"].(map[string]any); ok {
		result.Contexts = contexts
	}
	return result, nil
}

// MetricTag describes one Actuator tag and its currently available values.
type MetricTag struct {
	Tag    string   `json:"tag"`
	Values []string `json:"values"`
}

// MetricSample is one response from /metrics/{name}.
type MetricSample struct {
	Name          string             `json:"name"`
	Description   string             `json:"description,omitempty"`
	BaseUnit      string             `json:"baseUnit,omitempty"`
	Measurements  map[string]float64 `json:"measurements"`
	AvailableTags []MetricTag        `json:"availableTags,omitempty"`
}

// MetricSnapshot groups metrics captured at approximately the same time.
// Failures contains safe messages for metrics that were unavailable while
// successful metrics remain usable.
type MetricSnapshot struct {
	CapturedAt time.Time               `json:"capturedAt"`
	Metrics    map[string]MetricSample `json:"metrics"`
	Failures   map[string]string       `json:"failures,omitempty"`
}

type actuatorMetricPayload struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	BaseUnit     string `json:"baseUnit"`
	Measurements []struct {
		Statistic string  `json:"statistic"`
		Value     float64 `json:"value"`
	} `json:"measurements"`
	AvailableTags []MetricTag `json:"availableTags"`
}

// FetchMetrics reads the selected metric names. It returns partial results when
// an individual metric is unavailable.
func (c *ActuatorClient) FetchMetrics(ctx context.Context, names []string) (MetricSnapshot, error) {
	uniqueNames := make([]string, 0, len(names))
	seen := make(map[string]struct{}, len(names))
	for _, rawName := range names {
		name := strings.TrimSpace(rawName)
		if !validMetricName(name) {
			return MetricSnapshot{}, invalidInput("A metric name is invalid.", "Use an Actuator metric name such as jvm.memory.used.")
		}
		if _, exists := seen[name]; exists {
			continue
		}
		seen[name] = struct{}{}
		uniqueNames = append(uniqueNames, name)
	}
	if len(uniqueNames) == 0 {
		return MetricSnapshot{}, invalidInput("No metrics were selected.", "Select at least one Actuator metric.")
	}
	if len(uniqueNames) > c.maxMetrics {
		return MetricSnapshot{}, limitExceeded("Too many metrics were selected.", fmt.Sprintf("Select at most %d metrics per snapshot.", c.maxMetrics))
	}
	sort.Strings(uniqueNames)

	snapshotContext, cancel := contextWithTimeout(ctx, c.timeout)
	defer cancel()

	snapshot := MetricSnapshot{
		CapturedAt: time.Now().UTC(),
		Metrics:    make(map[string]MetricSample, len(uniqueNames)),
		Failures:   make(map[string]string),
	}
	for _, name := range uniqueNames {
		if err := snapshotContext.Err(); err != nil {
			return snapshot, requestFailed(err)
		}
		var payload actuatorMetricPayload
		if err := c.fetchJSON(snapshotContext, "metrics/"+url.PathEscape(name), &payload); err != nil {
			if contextErr := snapshotContext.Err(); contextErr != nil {
				return snapshot, requestFailed(contextErr)
			}
			snapshot.Failures[name] = err.Error()
			continue
		}
		if payload.Name == "" {
			payload.Name = name
		}
		sample := MetricSample{
			Name:          payload.Name,
			Description:   payload.Description,
			BaseUnit:      payload.BaseUnit,
			Measurements:  make(map[string]float64, len(payload.Measurements)),
			AvailableTags: payload.AvailableTags,
		}
		for _, measurement := range payload.Measurements {
			if measurement.Statistic == "" {
				continue
			}
			sample.Measurements[measurement.Statistic] = measurement.Value
		}
		snapshot.Metrics[name] = sample
	}
	if len(snapshot.Failures) == 0 {
		snapshot.Failures = nil
	}
	return snapshot, nil
}

func (c *ActuatorClient) fetchJSON(ctx context.Context, endpoint string, target any) error {
	requestURL := *c.baseURL
	requestURL.Path = strings.TrimRight(c.baseURL.Path, "/") + "/" + strings.TrimLeft(endpoint, "/")
	requestURL.RawQuery = ""

	requestContext, cancel := contextWithTimeout(ctx, c.timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestContext, http.MethodGet, requestURL.String(), nil)
	if err != nil {
		return invalidInput("The Actuator request URL could not be created.", "Check the configured Actuator base URL.")
	}
	request.Header = c.headers.Clone()
	request.Header.Set("Accept", "application/json")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return requestFailed(err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return newDiagnosticError(
			CodeRequestFailed,
			fmt.Sprintf("Actuator returned HTTP %d.", response.StatusCode),
			"Check endpoint exposure and Actuator authentication.",
			nil,
		)
	}
	body, tooLarge, err := readLimitedBody(response.Body, c.maxResponseBytes)
	if err != nil {
		return requestFailed(err)
	}
	if tooLarge {
		return responseTooLarge(c.maxResponseBytes)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return invalidResponse(err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			err = fmt.Errorf("multiple JSON values")
		}
		return invalidResponse(err)
	}
	return nil
}

func validMetricName(name string) bool {
	if name == "" || name == "." || name == ".." {
		return false
	}
	for _, character := range name {
		if (character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			character == '.' || character == '_' || character == '-' {
			continue
		}
		return false
	}
	return true
}

// MetricDelta describes a before/after change for one measurement.
type MetricDelta struct {
	Metric        string   `json:"metric"`
	Statistic     string   `json:"statistic"`
	Before        *float64 `json:"before,omitempty"`
	After         *float64 `json:"after,omitempty"`
	Delta         *float64 `json:"delta,omitempty"`
	PercentChange *float64 `json:"percentChange,omitempty"`
}

// DiffMetricSnapshots compares all measurements present in either snapshot.
func DiffMetricSnapshots(before, after MetricSnapshot) []MetricDelta {
	type key struct {
		metric    string
		statistic string
	}
	keys := make(map[key]struct{})
	for metric, sample := range before.Metrics {
		for statistic := range sample.Measurements {
			keys[key{metric: metric, statistic: statistic}] = struct{}{}
		}
	}
	for metric, sample := range after.Metrics {
		for statistic := range sample.Measurements {
			keys[key{metric: metric, statistic: statistic}] = struct{}{}
		}
	}
	ordered := make([]key, 0, len(keys))
	for item := range keys {
		ordered = append(ordered, item)
	}
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].metric == ordered[j].metric {
			return ordered[i].statistic < ordered[j].statistic
		}
		return ordered[i].metric < ordered[j].metric
	})

	result := make([]MetricDelta, 0, len(ordered))
	for _, item := range ordered {
		delta := MetricDelta{Metric: item.metric, Statistic: item.statistic}
		beforeValue, beforeOK := before.Metrics[item.metric].Measurements[item.statistic]
		afterValue, afterOK := after.Metrics[item.metric].Measurements[item.statistic]
		if beforeOK {
			value := beforeValue
			delta.Before = &value
		}
		if afterOK {
			value := afterValue
			delta.After = &value
		}
		if beforeOK && afterOK {
			change := afterValue - beforeValue
			delta.Delta = &change
			if beforeValue != 0 {
				percent := change / beforeValue * 100
				delta.PercentChange = &percent
			}
		}
		result = append(result, delta)
	}
	return result
}
