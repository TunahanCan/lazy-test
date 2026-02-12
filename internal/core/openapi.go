// Package core provides OpenAPI schema loading, smoke tests, drift and A/B compare.
package core

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
)

// Endpoint represents one path+method from OpenAPI.
type Endpoint struct {
	Path        string
	Method      string
	OperationID string
	Summary     string
	Tags        []string // from operation.tags
	Schema      *openapi3.Operation
}

// LoadOpenAPI reads openapi.yaml/json and returns all path+method combinations.
func LoadOpenAPI(path string) ([]Endpoint, *openapi3.T, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, fmt.Errorf("read file: %w", err)
	}
	loader := openapi3.NewLoader()
	doc, err := loader.LoadFromData(data)
	if err != nil {
		return nil, nil, fmt.Errorf("parse openapi: %w", err)
	}
	if err := doc.Validate(loader.Context); err != nil {
		return nil, nil, fmt.Errorf("validate openapi: %w", err)
	}
	var endpoints []Endpoint
	for path, pathItem := range doc.Paths.Map() {
		for method, op := range pathItem.Operations() {
			ep := Endpoint{
				Path:        path,
				Method:      strings.ToUpper(method),
				OperationID: op.OperationID,
				Summary:     op.Summary,
				Tags:        op.Tags,
				Schema:      op,
			}
			if ep.Summary == "" {
				ep.Summary = ep.OperationID
			}
			endpoints = append(endpoints, ep)
		}
	}
	return endpoints, doc, nil
}

// ExampleBody generates request body from OpenAPI request body schema.
// Uses schema.example if present; otherwise simple faker: string->"example", number->1, bool->true, array->[elem], object->fields.
func ExampleBody(op *openapi3.Operation) ([]byte, error) {
	if op.RequestBody == nil || op.RequestBody.Value == nil {
		return nil, nil
	}
	content := op.RequestBody.Value.Content.Get("application/json")
	if content == nil {
		return nil, nil
	}
	if content.Schema == nil || content.Schema.Value == nil {
		return nil, nil
	}
	// Prefer example from schema
	if content.Example != nil {
		return json.Marshal(content.Example)
	}
	v := exampleFromSchema(content.Schema.Value)
	return json.Marshal(v)
}

func exampleFromSchema(s *openapi3.Schema) interface{} {
	if s.Example != nil {
		return s.Example
	}
	t := ""
	if s.Type != nil && len(s.Type.Slice()) > 0 {
		t = s.Type.Slice()[0]
	}
	switch t {
	case "string":
		if len(s.Enum) > 0 {
			return s.Enum[0]
		}
		return "example"
	case "number", "integer":
		return 1
	case "boolean":
		return true
	case "array":
		var elem interface{} = "item"
		if s.Items != nil && s.Items.Value != nil {
			elem = exampleFromSchema(s.Items.Value)
		}
		return []interface{}{elem}
	case "object":
		m := make(map[string]interface{})
		for name, prop := range s.Properties {
			if prop != nil && prop.Value != nil {
				m[name] = exampleFromSchema(prop.Value)
			} else {
				m[name] = "example"
			}
		}
		return m
	default:
		return "example"
	}
}

// BuildURL concatenates baseURL and path, resolving path params if needed.
func BuildURL(baseURL, path string, pathParams map[string]string) (string, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return "", err
	}
	for k, v := range pathParams {
		path = strings.ReplaceAll(path, "{"+k+"}", url.PathEscape(v))
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + path
	return u.String(), nil
}
