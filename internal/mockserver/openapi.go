package mockserver

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"

	"validex/internal/core"
)

const (
	// MaxOpenAPIImportRoutes bounds the number of mock routes materialized from
	// one OpenAPI document.
	MaxOpenAPIImportRoutes int64 = 2_000
	// MaxOpenAPIImportBodyBytes bounds the aggregate encoded response-body
	// bytes retained across every route in one OpenAPI import.
	MaxOpenAPIImportBodyBytes int64 = 32 << 20
)

// OpenAPIImportErrorCode identifies a structured OpenAPI mock-import failure.
type OpenAPIImportErrorCode string

const (
	// CodeOpenAPIImportLimitExceeded identifies a document-wide mock-import
	// budget exhaustion.
	CodeOpenAPIImportLimitExceeded OpenAPIImportErrorCode = "openapi_import_limit_exceeded"
)

// OpenAPIImportBudget identifies the document-wide resource that was
// exhausted during an OpenAPI mock import.
type OpenAPIImportBudget string

const (
	// OpenAPIImportBudgetRoutes is the number of routes materialized from the
	// document.
	OpenAPIImportBudgetRoutes OpenAPIImportBudget = "routes"
	// OpenAPIImportBudgetBodyBytes is the aggregate encoded response-body size.
	OpenAPIImportBudgetBodyBytes OpenAPIImportBudget = "body_bytes"
)

// OpenAPIImportLimitError is safe to surface to an end user and exposes stable
// fields for callers that want to branch on the exhausted import-wide budget.
type OpenAPIImportLimitError struct {
	Code      OpenAPIImportErrorCode `json:"code"`
	Budget    OpenAPIImportBudget    `json:"budget"`
	Limit     int64                  `json:"limit"`
	Attempted int64                  `json:"attempted"`
	Message   string                 `json:"message"`
	Hint      string                 `json:"hint,omitempty"`
}

func (e *OpenAPIImportLimitError) Error() string {
	if e == nil {
		return ""
	}
	if e.Hint == "" {
		return e.Message
	}
	return e.Message + " " + e.Hint
}

type openAPIImportLimits struct {
	routeCount int64
	bodyBytes  int64
}

type openAPIImportBudget struct {
	limits        openAPIImportLimits
	routesUsed    int64
	bodyBytesUsed int64
}

func defaultOpenAPIImportLimits() openAPIImportLimits {
	return openAPIImportLimits{
		routeCount: MaxOpenAPIImportRoutes,
		bodyBytes:  MaxOpenAPIImportBodyBytes,
	}
}

func (b *openAPIImportBudget) consumeRoutes(count int64) error {
	attempted := b.routesUsed + count
	if attempted > b.limits.routeCount {
		return &OpenAPIImportLimitError{
			Code:      CodeOpenAPIImportLimitExceeded,
			Budget:    OpenAPIImportBudgetRoutes,
			Limit:     b.limits.routeCount,
			Attempted: attempted,
			Message: fmt.Sprintf(
				"The OpenAPI document would create %d mock routes, exceeding the safe import limit of %d.",
				attempted,
				b.limits.routeCount,
			),
			Hint: "Split the document or remove operations that do not need mock routes.",
		}
	}
	b.routesUsed = attempted
	return nil
}

func (b *openAPIImportBudget) consumeBodyBytes(count int64) error {
	attempted := b.bodyBytesUsed + count
	if attempted > b.limits.bodyBytes {
		return &OpenAPIImportLimitError{
			Code:      CodeOpenAPIImportLimitExceeded,
			Budget:    OpenAPIImportBudgetBodyBytes,
			Limit:     b.limits.bodyBytes,
			Attempted: attempted,
			Message: fmt.Sprintf(
				"The OpenAPI mock response bodies exceed the safe aggregate import limit of %d bytes.",
				b.limits.bodyBytes,
			),
			Hint: "Reduce response examples, generated collection sizes, or the number of mocked operations.",
		}
	}
	b.bodyBytesUsed = attempted
	return nil
}

// ImportOpenAPI converts every OpenAPI operation into one enabled mock route.
// It prefers an explicit 2xx response, then a patterned 2xx response, any
// explicit response, another patterned response, and finally the default
// response. Explicit response examples are used before deterministic
// schema-derived JSON samples.
func ImportOpenAPI(path string) ([]Route, error) {
	endpoints, _, err := core.LoadOpenAPI(path)
	if err != nil {
		return nil, err
	}
	return importOpenAPIEndpoints(endpoints, defaultOpenAPIImportLimits())
}

func importOpenAPIEndpoints(
	endpoints []core.Endpoint,
	limits openAPIImportLimits,
) ([]Route, error) {
	budget := openAPIImportBudget{limits: limits}
	if err := budget.consumeRoutes(int64(len(endpoints))); err != nil {
		return nil, err
	}
	sort.Slice(endpoints, func(i, j int) bool {
		if endpoints[i].Path == endpoints[j].Path {
			return endpoints[i].Method < endpoints[j].Method
		}
		return endpoints[i].Path < endpoints[j].Path
	})

	routes := make([]Route, 0, len(endpoints))
	for _, endpoint := range endpoints {
		status, response := selectResponse(endpoint.Schema.Responses)
		body, err := responseBody(response, status)
		if err != nil {
			return nil, fmt.Errorf("%s %s response: %w", endpoint.Method, endpoint.Path, err)
		}
		if err := budget.consumeBodyBytes(int64(len(body))); err != nil {
			return nil, fmt.Errorf("%s %s response body: %w", endpoint.Method, endpoint.Path, err)
		}
		routes = append(routes, Route{
			ID:      endpoint.Method + " " + endpoint.Path,
			Method:  endpoint.Method,
			Path:    endpoint.Path,
			Status:  status,
			Headers: map[string]string{"Content-Type": "application/json; charset=utf-8"},
			Body:    body,
			Enabled: true,
		})
	}
	if err := ValidateRoutes(routes); err != nil {
		return nil, fmt.Errorf("build mock routes: %w", err)
	}
	return routes, nil
}

func selectResponse(responses *openapi3.Responses) (int, *openapi3.Response) {
	if responses == nil || responses.Len() == 0 {
		return 200, nil
	}

	type candidate struct {
		key      string
		status   int
		priority int
	}
	candidates := make([]candidate, 0, responses.Len())
	for key := range responses.Map() {
		normalized := strings.ToUpper(key)
		if status, err := strconv.Atoi(key); err == nil && status >= 200 && status <= 599 {
			priority := 2
			if status >= 200 && status <= 299 {
				priority = 0
			}
			candidates = append(candidates, candidate{key: key, status: status, priority: priority})
			continue
		}
		if len(normalized) == 3 && normalized[1:] == "XX" &&
			normalized[0] >= '2' && normalized[0] <= '5' {
			status := int(normalized[0]-'0') * 100
			priority := 3
			if status == 200 {
				priority = 1
			}
			candidates = append(candidates, candidate{key: key, status: status, priority: priority})
			continue
		}
		if normalized == "DEFAULT" {
			candidates = append(candidates, candidate{key: key, status: 200, priority: 4})
		}
	}
	if len(candidates) == 0 {
		return 200, nil
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].priority == candidates[j].priority {
			if candidates[i].status == candidates[j].status {
				return candidates[i].key < candidates[j].key
			}
			return candidates[i].status < candidates[j].status
		}
		return candidates[i].priority < candidates[j].priority
	})

	selected := candidates[0]
	ref := responses.Value(selected.key)
	if ref == nil {
		return selected.status, nil
	}
	return selected.status, ref.Value
}

func responseBody(response *openapi3.Response, status int) (string, error) {
	if status == http.StatusNoContent ||
		status == http.StatusResetContent ||
		status == http.StatusNotModified {
		return "", nil
	}
	if response == nil || len(response.Content) == 0 {
		return "{}", nil
	}

	mediaType := preferredMediaType(response.Content)
	if mediaType == nil {
		return "{}", nil
	}

	var sample any
	switch {
	case mediaType.Example != nil:
		sample = mediaType.Example
	default:
		exampleNames := make([]string, 0, len(mediaType.Examples))
		for name := range mediaType.Examples {
			exampleNames = append(exampleNames, name)
		}
		sort.Strings(exampleNames)
		for _, name := range exampleNames {
			ref := mediaType.Examples[name]
			if ref != nil && ref.Value != nil && ref.Value.Value != nil {
				sample = ref.Value.Value
				break
			}
		}
		if sample == nil && mediaType.Schema != nil {
			generated, err := sampleFromSchema(mediaType.Schema, make(map[*openapi3.Schema]bool), 0)
			if err != nil {
				return "", fmt.Errorf("derive schema example: %w", err)
			}
			if mediaType.Schema.Value != nil && generated != nil {
				if err := mediaType.Schema.Value.VisitJSON(generated); err != nil {
					return "", fmt.Errorf("generated example does not satisfy response schema: %w", err)
				}
			}
			sample = generated
		}
	}
	if sample == nil {
		sample = map[string]any{}
	}
	encoded, err := json.Marshal(sample)
	if err != nil {
		return "", fmt.Errorf("marshal example: %w", err)
	}
	return string(encoded), nil
}

func preferredMediaType(content openapi3.Content) *openapi3.MediaType {
	if mediaType := content["application/json"]; mediaType != nil {
		return mediaType
	}
	keys := make([]string, 0, len(content))
	for key := range content {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if strings.Contains(strings.ToLower(key), "json") && content[key] != nil {
			return content[key]
		}
	}
	for _, key := range keys {
		if content[key] != nil {
			return content[key]
		}
	}
	return nil
}

const (
	maxGeneratedArrayItems           = 1000
	maxGeneratedSchemaDepth          = 20
	maxGeneratedSampleNodes          = int64(10_000)
	maxGeneratedSampleEstimatedBytes = int64(1 << 20)

	// CodeSampleGenerationLimitExceeded identifies safe mock-example generation
	// limits without requiring callers to parse an error string.
	CodeSampleGenerationLimitExceeded = "sample_generation_limit_exceeded"

	sampleBudgetNodes          = "nodes"
	sampleBudgetEstimatedBytes = "estimated_bytes"
)

// SampleGenerationLimitError is safe to surface to an end user and exposes
// stable fields for callers that want to branch on the exhausted budget.
type SampleGenerationLimitError struct {
	Code      string `json:"code"`
	Budget    string `json:"budget"`
	Limit     int64  `json:"limit"`
	Attempted int64  `json:"attempted"`
	Message   string `json:"message"`
	Hint      string `json:"hint,omitempty"`
}

func (e *SampleGenerationLimitError) Error() string {
	if e == nil {
		return ""
	}
	if e.Hint == "" {
		return e.Message
	}
	return e.Message + " " + e.Hint
}

type sampleGenerationBudget struct {
	nodeLimit      int64
	byteLimit      int64
	nodesUsed      int64
	estimatedBytes int64
}

func (b *sampleGenerationBudget) consumeNode() error {
	attempted := b.nodesUsed + 1
	if attempted > b.nodeLimit {
		return &SampleGenerationLimitError{
			Code:      CodeSampleGenerationLimitExceeded,
			Budget:    sampleBudgetNodes,
			Limit:     b.nodeLimit,
			Attempted: attempted,
			Message:   fmt.Sprintf("The OpenAPI response schema exceeds the safe mock-example node limit of %d.", b.nodeLimit),
			Hint:      "Reduce nested properties, array minItems, or repeated schema references.",
		}
	}
	b.nodesUsed = attempted
	return nil
}

func (b *sampleGenerationBudget) consumeBytes(count int64) error {
	attempted := b.estimatedBytes + count
	if attempted > b.byteLimit {
		return &SampleGenerationLimitError{
			Code:      CodeSampleGenerationLimitExceeded,
			Budget:    sampleBudgetEstimatedBytes,
			Limit:     b.byteLimit,
			Attempted: attempted,
			Message:   fmt.Sprintf("The generated OpenAPI mock example exceeds the safe estimated size limit of %d bytes.", b.byteLimit),
			Hint:      "Reduce property names, examples, defaults, or generated collection sizes.",
		}
	}
	b.estimatedBytes = attempted
	return nil
}

type schemaSampleVisitor struct {
	activeSchemas map[*openapi3.Schema]bool
	budget        sampleGenerationBudget
}

func newSchemaSampleVisitor(nodeLimit, byteLimit int64) *schemaSampleVisitor {
	return &schemaSampleVisitor{
		activeSchemas: make(map[*openapi3.Schema]bool),
		budget: sampleGenerationBudget{
			nodeLimit: nodeLimit,
			byteLimit: byteLimit,
		},
	}
}

func sampleFromSchema(
	ref *openapi3.SchemaRef,
	activeSchemas map[*openapi3.Schema]bool,
	depth int,
) (any, error) {
	visitor := newSchemaSampleVisitor(maxGeneratedSampleNodes, maxGeneratedSampleEstimatedBytes)
	if activeSchemas != nil {
		visitor.activeSchemas = activeSchemas
	}
	return visitor.visit(ref, depth)
}

func (v *schemaSampleVisitor) visit(ref *openapi3.SchemaRef, depth int) (any, error) {
	if ref == nil || ref.Value == nil || depth > maxGeneratedSchemaDepth {
		return v.literal(nil)
	}
	if err := v.budget.consumeNode(); err != nil {
		return nil, err
	}
	schema := ref.Value
	if v.activeSchemas[schema] {
		return v.literal(nil)
	}
	v.activeSchemas[schema] = true
	defer delete(v.activeSchemas, schema)

	if schema.Example != nil {
		return v.literal(schema.Example)
	}
	if schema.Default != nil {
		return v.literal(schema.Default)
	}
	if len(schema.Enum) > 0 {
		return v.literal(schema.Enum[0])
	}
	if len(schema.AllOf) > 0 {
		merged := make(map[string]any)
		var fallback any
		for _, child := range schema.AllOf {
			value, err := v.visit(child, depth+1)
			if err != nil {
				return nil, err
			}
			if object, ok := value.(map[string]any); ok {
				for key, childValue := range object {
					merged[key] = childValue
				}
			} else if fallback == nil {
				fallback = value
			}
		}
		if len(merged) > 0 {
			return merged, nil
		}
		return fallback, nil
	}
	if len(schema.OneOf) > 0 {
		return v.visit(schema.OneOf[0], depth+1)
	}
	if len(schema.AnyOf) > 0 {
		return v.visit(schema.AnyOf[0], depth+1)
	}

	schemaType := ""
	if schema.Type != nil {
		for _, candidate := range schema.Type.Slice() {
			if candidate != "null" {
				schemaType = candidate
				break
			}
		}
	}
	if schemaType == "" {
		switch {
		case len(schema.Properties) > 0:
			schemaType = "object"
		case schema.Items != nil:
			schemaType = "array"
		}
	}

	switch schemaType {
	case "object":
		object := make(map[string]any, len(schema.Properties))
		names := make([]string, 0, len(schema.Properties))
		for name := range schema.Properties {
			names = append(names, name)
		}
		sort.Strings(names)
		if err := v.budget.consumeBytes(2); err != nil {
			return nil, err
		}
		for index, name := range names {
			encodedName, err := json.Marshal(name)
			if err != nil {
				return nil, fmt.Errorf("encode property name %q: %w", name, err)
			}
			propertyBytes := int64(len(encodedName) + 1)
			if index > 0 {
				propertyBytes++
			}
			if err := v.budget.consumeBytes(propertyBytes); err != nil {
				return nil, fmt.Errorf("property %q: %w", name, err)
			}
			value, err := v.visit(schema.Properties[name], depth+1)
			if err != nil {
				return nil, fmt.Errorf("property %q: %w", name, err)
			}
			object[name] = value
		}
		return object, nil
	case "array":
		count := 1
		if schema.MaxItems != nil && *schema.MaxItems == 0 {
			count = 0
		} else if schema.MinItems > maxGeneratedArrayItems {
			return nil, fmt.Errorf(
				"minItems %d exceeds the safe generated-example limit %d",
				schema.MinItems,
				maxGeneratedArrayItems,
			)
		} else if schema.MinItems > 1 {
			count = int(schema.MinItems)
		}
		arrayBytes := int64(2)
		if count > 1 {
			arrayBytes += int64(count - 1)
		}
		if err := v.budget.consumeBytes(arrayBytes); err != nil {
			return nil, err
		}
		array := make([]any, count)
		for index := range array {
			value, err := v.visit(schema.Items, depth+1)
			if err != nil {
				return nil, fmt.Errorf("array item: %w", err)
			}
			array[index] = value
		}
		return array, nil
	case "integer":
		value := int64(1)
		if schema.Min != nil {
			value = int64(math.Ceil(*schema.Min))
			if schema.ExclusiveMin && float64(value) <= *schema.Min {
				value++
			}
		} else if schema.Max != nil {
			value = int64(math.Floor(*schema.Max))
			if schema.ExclusiveMax && float64(value) >= *schema.Max {
				value--
			}
		}
		return v.literal(value)
	case "number":
		value := 1.0
		if schema.Min != nil {
			value = *schema.Min
			if schema.ExclusiveMin {
				value = math.Nextafter(value, math.Inf(1))
			}
		} else if schema.Max != nil {
			value = *schema.Max
			if schema.ExclusiveMax {
				value = math.Nextafter(value, math.Inf(-1))
			}
		}
		return v.literal(value)
	case "boolean":
		return v.literal(true)
	case "string":
		switch schema.Format {
		case "date":
			return v.literal("2024-01-01")
		case "date-time":
			return v.literal("2024-01-01T00:00:00Z")
		case "email":
			return v.literal("user@example.com")
		case "uuid":
			return v.literal("00000000-0000-4000-8000-000000000000")
		case "uri", "url":
			return v.literal("https://example.com")
		case "ipv4":
			return v.literal("127.0.0.1")
		default:
			return v.literal("string")
		}
	case "null":
		return v.literal(nil)
	default:
		return v.literal(map[string]any{})
	}
}

func (v *schemaSampleVisitor) literal(value any) (any, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("estimate generated value: %w", err)
	}
	if err := v.budget.consumeBytes(int64(len(encoded))); err != nil {
		return nil, err
	}
	return value, nil
}
