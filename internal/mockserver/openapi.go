package mockserver

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"

	"validex/internal/core"
)

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
		if status, err := strconv.Atoi(key); err == nil && status >= 100 && status <= 599 {
			priority := 1
			if status >= 200 && status <= 299 {
				priority = 0
			}
			candidates = append(candidates, candidate{key: key, status: status, priority: priority})
			continue
		}
		if len(normalized) == 3 && normalized[1:] == "XX" &&
			normalized[0] >= '1' && normalized[0] <= '5' {
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
	if status == 204 || status == 304 {
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

const maxGeneratedArrayItems = 1000

func sampleFromSchema(
	ref *openapi3.SchemaRef,
	seen map[*openapi3.Schema]bool,
	depth int,
) (any, error) {
	if ref == nil || ref.Value == nil || depth > 20 {
		return nil, nil
	}
	schema := ref.Value
	if seen[schema] {
		return nil, nil
	}
	seen[schema] = true
	defer delete(seen, schema)

	if schema.Example != nil {
		return schema.Example, nil
	}
	if schema.Default != nil {
		return schema.Default, nil
	}
	if len(schema.Enum) > 0 {
		return schema.Enum[0], nil
	}
	if len(schema.AllOf) > 0 {
		merged := make(map[string]any)
		var fallback any
		for _, child := range schema.AllOf {
			value, err := sampleFromSchema(child, seen, depth+1)
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
		return sampleFromSchema(schema.OneOf[0], seen, depth+1)
	}
	if len(schema.AnyOf) > 0 {
		return sampleFromSchema(schema.AnyOf[0], seen, depth+1)
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
		for _, name := range names {
			value, err := sampleFromSchema(schema.Properties[name], seen, depth+1)
			if err != nil {
				return nil, fmt.Errorf("property %q: %w", name, err)
			}
			object[name] = value
		}
		return object, nil
	case "array":
		count := 1
		if schema.MinItems > 1 {
			count = int(schema.MinItems)
		}
		if schema.MaxItems != nil && *schema.MaxItems == 0 {
			count = 0
		}
		if count > maxGeneratedArrayItems {
			return nil, fmt.Errorf(
				"minItems %d exceeds the safe generated-example limit %d",
				schema.MinItems,
				maxGeneratedArrayItems,
			)
		}
		array := make([]any, count)
		for index := range array {
			value, err := sampleFromSchema(schema.Items, seen, depth+1)
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
		return value, nil
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
		return value, nil
	case "boolean":
		return true, nil
	case "string":
		switch schema.Format {
		case "date":
			return "2024-01-01", nil
		case "date-time":
			return "2024-01-01T00:00:00Z", nil
		case "email":
			return "user@example.com", nil
		case "uuid":
			return "00000000-0000-4000-8000-000000000000", nil
		case "uri", "url":
			return "https://example.com", nil
		case "ipv4":
			return "127.0.0.1", nil
		default:
			return "string", nil
		}
	case "null":
		return nil, nil
	default:
		return map[string]any{}, nil
	}
}
