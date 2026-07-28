package core

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
)

func TestLoadOpenAPIRejectsOversizedFileBeforeParsing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "oversized.yaml")
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("os.Create() error = %v", err)
	}
	if err := file.Truncate(MaxOpenAPIFileBytes + 1); err != nil {
		_ = file.Close()
		t.Fatalf("Truncate() error = %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	_, _, err = LoadOpenAPI(path)
	if err == nil || !strings.Contains(err.Error(), "byte limit") {
		t.Fatalf("LoadOpenAPI() error = %v, want file size limit", err)
	}
}

func TestCollectEndpointsRejectsOversizedOperationList(t *testing.T) {
	paths := openapi3.NewPaths()
	operation := &openapi3.Operation{}
	for index := 0; index <= MaxOpenAPIEndpoints; index++ {
		paths.Set("/endpoint-"+strconv.Itoa(index), &openapi3.PathItem{Get: operation})
	}
	_, err := collectEndpoints(&openapi3.T{Paths: paths})
	if err == nil || !strings.Contains(err.Error(), "endpoint limit") {
		t.Fatalf("collectEndpoints() error = %v, want endpoint limit", err)
	}
}

func TestCollectEndpointsReturnsDeterministicPathAndMethodOrder(t *testing.T) {
	t.Parallel()
	paths := openapi3.NewPaths()
	paths.Set("/z-last", &openapi3.PathItem{
		Post: &openapi3.Operation{OperationID: "z-post"},
		Get:  &openapi3.Operation{OperationID: "z-get"},
	})
	paths.Set("/a-first", &openapi3.PathItem{
		Delete: &openapi3.Operation{OperationID: "a-delete"},
	})

	endpoints, err := collectEndpoints(&openapi3.T{Paths: paths})
	if err != nil {
		t.Fatal(err)
	}
	got := make([]string, 0, len(endpoints))
	for _, endpoint := range endpoints {
		if endpoint.Operation == nil {
			t.Fatalf("endpoint has no operation: %#v", endpoint)
		}
		got = append(got, endpoint.Method+" "+endpoint.Path)
	}
	want := []string{
		"DELETE /a-first",
		"GET /z-last",
		"POST /z-last",
	}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("endpoint order = %v, want %v", got, want)
	}
}
