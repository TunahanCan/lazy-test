// Package core provides OpenAPI schema loading and response contract drift.
package core

import (
	"context"
	"fmt"
	"io"
	"os"
	"sort"
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
	Operation   *openapi3.Operation
}

// LoadOpenAPI reads openapi.yaml/json and returns all path+method combinations.
func LoadOpenAPI(path string) ([]Endpoint, *openapi3.T, error) {
	return LoadOpenAPIContext(context.Background(), path)
}

// LoadOpenAPIContext is LoadOpenAPI with cooperative cancellation around file
// reads, model parsing, validation, and endpoint traversal.
func LoadOpenAPIContext(
	ctx context.Context,
	path string,
) ([]Endpoint, *openapi3.T, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("read file: %w", err)
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(
		&contextReader{ctx: ctx, reader: file},
		MaxOpenAPIFileBytes+1,
	))
	if err != nil {
		return nil, nil, fmt.Errorf("read file: %w", err)
	}
	if int64(len(data)) > MaxOpenAPIFileBytes {
		return nil, nil, fmt.Errorf("OpenAPI file exceeds the %d byte limit", MaxOpenAPIFileBytes)
	}
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	loader := openapi3.NewLoader()
	doc, err := loader.LoadFromData(data)
	if err != nil {
		return nil, nil, fmt.Errorf("parse openapi: %w", err)
	}
	if err := doc.Validate(loader.Context); err != nil {
		return nil, nil, fmt.Errorf("validate openapi: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	endpoints, err := collectEndpointsContext(ctx, doc)
	if err != nil {
		return nil, nil, err
	}
	return endpoints, doc, nil
}

func collectEndpoints(doc *openapi3.T) ([]Endpoint, error) {
	return collectEndpointsContext(context.Background(), doc)
}

func collectEndpointsContext(
	ctx context.Context,
	doc *openapi3.T,
) ([]Endpoint, error) {
	if doc == nil || doc.Paths == nil {
		return []Endpoint{}, nil
	}
	paths := doc.Paths.Map()
	pathNames := make([]string, 0, len(paths))
	for path := range paths {
		pathNames = append(pathNames, path)
	}
	sort.Strings(pathNames)

	endpoints := make([]Endpoint, 0)
	for _, path := range pathNames {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		pathItem := paths[path]
		if pathItem == nil {
			continue
		}
		operations := pathItem.Operations()
		methods := make([]string, 0, len(operations))
		for method := range operations {
			methods = append(methods, method)
		}
		sort.Strings(methods)
		for _, method := range methods {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			op := operations[method]
			if op == nil {
				continue
			}
			if len(endpoints) >= MaxOpenAPIEndpoints {
				return nil, fmt.Errorf("OpenAPI document exceeds the %d endpoint limit", MaxOpenAPIEndpoints)
			}
			ep := Endpoint{
				Path:        path,
				Method:      strings.ToUpper(method),
				OperationID: op.OperationID,
				Summary:     op.Summary,
				Tags:        append([]string{}, op.Tags...),
				Operation:   op,
			}
			if ep.Summary == "" {
				ep.Summary = ep.OperationID
			}
			endpoints = append(endpoints, ep)
		}
	}
	return endpoints, nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (reader *contextReader) Read(buffer []byte) (int, error) {
	if err := reader.ctx.Err(); err != nil {
		return 0, err
	}
	return reader.reader.Read(buffer)
}
