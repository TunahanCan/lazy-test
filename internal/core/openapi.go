// Package core provides OpenAPI schema loading and response contract drift.
package core

import (
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
)

const (
	// MaxOpenAPIFileBytes bounds desktop imports before YAML/JSON parsing.
	MaxOpenAPIFileBytes = int64(16 << 20)
	// MaxOpenAPIEndpoints bounds the operation list retained for one document.
	MaxOpenAPIEndpoints = 10_000
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
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("read file: %w", err)
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, MaxOpenAPIFileBytes+1))
	if err != nil {
		return nil, nil, fmt.Errorf("read file: %w", err)
	}
	if int64(len(data)) > MaxOpenAPIFileBytes {
		return nil, nil, fmt.Errorf("OpenAPI file exceeds the %d byte limit", MaxOpenAPIFileBytes)
	}
	loader := openapi3.NewLoader()
	doc, err := loader.LoadFromData(data)
	if err != nil {
		return nil, nil, fmt.Errorf("parse openapi: %w", err)
	}
	if err := doc.Validate(loader.Context); err != nil {
		return nil, nil, fmt.Errorf("validate openapi: %w", err)
	}
	endpoints, err := collectEndpoints(doc)
	if err != nil {
		return nil, nil, err
	}
	return endpoints, doc, nil
}

func collectEndpoints(doc *openapi3.T) ([]Endpoint, error) {
	if doc == nil || doc.Paths == nil {
		return []Endpoint{}, nil
	}
	var endpoints []Endpoint
	for path, pathItem := range doc.Paths.Map() {
		for method, op := range pathItem.Operations() {
			if len(endpoints) >= MaxOpenAPIEndpoints {
				return nil, fmt.Errorf("OpenAPI document exceeds the %d endpoint limit", MaxOpenAPIEndpoints)
			}
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
	return endpoints, nil
}
