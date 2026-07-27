package mockserver

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"

	"validex/internal/core"
)

func TestImportOpenAPIUsesExamplesAndSchemaSamples(t *testing.T) {
	spec := `openapi: 3.0.3
info:
  title: Mock import
  version: 1.0.0
paths:
  /pets:
    post:
      operationId: createPet
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema:
                type: object
                required: [id, active]
                properties:
                  id:
                    type: integer
                  active:
                    type: boolean
                  ownerEmail:
                    type: string
                    format: email
  /users/{id}:
    get:
      operationId: getUser
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: User
          content:
            application/json:
              example:
                id: "42"
                name: Ada
`
	path := filepath.Join(t.TempDir(), "openapi.yaml")
	if err := os.WriteFile(path, []byte(spec), 0o600); err != nil {
		t.Fatalf("write spec: %v", err)
	}

	routes, err := ImportOpenAPI(path)
	if err != nil {
		t.Fatalf("ImportOpenAPI() error = %v", err)
	}
	if len(routes) != 2 {
		t.Fatalf("len(routes) = %d", len(routes))
	}
	if routes[0].ID != "POST /pets" || routes[0].Status != 201 || !routes[0].Enabled {
		t.Fatalf("schema route = %#v", routes[0])
	}
	var pet map[string]any
	if err := json.Unmarshal([]byte(routes[0].Body), &pet); err != nil {
		t.Fatalf("schema sample body = %q: %v", routes[0].Body, err)
	}
	if pet["id"] != float64(1) || pet["active"] != true ||
		pet["ownerEmail"] != "user@example.com" {
		t.Fatalf("schema sample = %#v", pet)
	}

	if routes[1].ID != "GET /users/{id}" || routes[1].Status != 200 {
		t.Fatalf("example route = %#v", routes[1])
	}
	var user map[string]any
	if err := json.Unmarshal([]byte(routes[1].Body), &user); err != nil {
		t.Fatalf("example body = %q: %v", routes[1].Body, err)
	}
	if user["id"] != "42" || user["name"] != "Ada" {
		t.Fatalf("explicit example = %#v", user)
	}
}

func TestSelectResponseUsesDocumentedDeterministicPriority(t *testing.T) {
	t.Parallel()

	response := func(description string) *openapi3.ResponseRef {
		return &openapi3.ResponseRef{
			Value: openapi3.NewResponse().WithDescription(description),
		}
	}
	responses := openapi3.NewResponsesWithCapacity(4)
	responses.Set("100", response("informational"))
	responses.Set("404", response("exact error"))
	responses.Set("2XX", response("patterned success"))
	responses.Set("DEFAULT", response("default"))

	status, selected := selectResponse(responses)
	if status != http.StatusOK ||
		selected == nil ||
		selected.Description == nil ||
		*selected.Description != "patterned success" {
		t.Fatalf("selectResponse() = (%d, %#v), want patterned 2xx", status, selected)
	}
}

func TestResponseBodyIsEmptyForBodylessFinalStatuses(t *testing.T) {
	t.Parallel()

	response := openapi3.NewResponse().WithDescription("bodyless")
	response.Content = openapi3.NewContentWithJSONSchema(
		openapi3.NewObjectSchema(),
	)
	for _, status := range []int{
		http.StatusNoContent,
		http.StatusResetContent,
		http.StatusNotModified,
	} {
		body, err := responseBody(response, status)
		if err != nil {
			t.Fatalf("responseBody(status=%d) error = %v", status, err)
		}
		if body != "" {
			t.Fatalf("responseBody(status=%d) = %q, want empty", status, body)
		}
	}
}

func TestImportOpenAPIGeneratedSamplesRespectArrayAndNumericBounds(t *testing.T) {
	spec := `openapi: 3.0.3
info:
  title: Bounded samples
  version: 1.0.0
paths:
  /measurements:
    get:
      responses:
        "200":
          description: Measurements
          content:
            application/json:
              schema:
                type: object
                required: [scores, sequence]
                properties:
                  scores:
                    type: array
                    minItems: 5
                    items:
                      type: number
                      minimum: 1.5
                      exclusiveMinimum: true
                  sequence:
                    type: integer
                    minimum: 2.2
                    exclusiveMinimum: true
`
	path := filepath.Join(t.TempDir(), "bounded.yaml")
	if err := os.WriteFile(path, []byte(spec), 0o600); err != nil {
		t.Fatalf("write spec: %v", err)
	}

	routes, err := ImportOpenAPI(path)
	if err != nil {
		t.Fatalf("ImportOpenAPI() error = %v", err)
	}
	var body struct {
		Scores   []float64 `json:"scores"`
		Sequence int64     `json:"sequence"`
	}
	if err := json.Unmarshal([]byte(routes[0].Body), &body); err != nil {
		t.Fatalf("decode body %q: %v", routes[0].Body, err)
	}
	if len(body.Scores) != 5 {
		t.Fatalf("len(scores) = %d, want 5", len(body.Scores))
	}
	for _, score := range body.Scores {
		if score <= 1.5 {
			t.Fatalf("score = %v, want > 1.5", score)
		}
	}
	if body.Sequence != 3 {
		t.Fatalf("sequence = %d, want 3", body.Sequence)
	}
}

func TestImportOpenAPINormalReferencedSchemaSampleIsUnchanged(t *testing.T) {
	spec := `openapi: 3.0.3
info:
  title: Referenced samples
  version: 1.0.0
components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
        active:
          type: boolean
paths:
  /pets:
    get:
      responses:
        "200":
          description: Pets
          content:
            application/json:
              schema:
                type: array
                minItems: 2
                items:
                  $ref: "#/components/schemas/Pet"
`
	path := filepath.Join(t.TempDir(), "referenced.yaml")
	if err := os.WriteFile(path, []byte(spec), 0o600); err != nil {
		t.Fatalf("write spec: %v", err)
	}

	routes, err := ImportOpenAPI(path)
	if err != nil {
		t.Fatalf("ImportOpenAPI() error = %v", err)
	}
	const want = `[{"active":true,"name":"string"},{"active":true,"name":"string"}]`
	if len(routes) != 1 || routes[0].Body != want {
		t.Fatalf("generated referenced sample = %#v, want body %s", routes, want)
	}
}

func TestImportOpenAPIRejectsDocumentWideRouteCountWithStructuredError(t *testing.T) {
	endpoints := make([]core.Endpoint, int(MaxOpenAPIImportRoutes+1))

	_, err := importOpenAPIEndpoints(endpoints, defaultOpenAPIImportLimits())
	var limitErr *OpenAPIImportLimitError
	if !errors.As(err, &limitErr) {
		t.Fatalf("importOpenAPIEndpoints() error = %v, want *OpenAPIImportLimitError", err)
	}
	if limitErr.Code != CodeOpenAPIImportLimitExceeded ||
		limitErr.Budget != OpenAPIImportBudgetRoutes ||
		limitErr.Limit != MaxOpenAPIImportRoutes ||
		limitErr.Attempted != MaxOpenAPIImportRoutes+1 {
		t.Fatalf("route-count budget error = %#v", limitErr)
	}
	if !strings.Contains(err.Error(), "Split the document") {
		t.Fatalf("route-count budget error is not user actionable: %v", err)
	}
	if _, err := json.Marshal(limitErr); err != nil {
		t.Fatalf("json.Marshal(limit error) = %v", err)
	}
}

func TestImportOpenAPIAggregatesExplicitAndGeneratedBodyBytes(t *testing.T) {
	spec := `openapi: 3.0.3
info:
  title: Aggregate body budget
  version: 1.0.0
paths:
  /a-explicit:
    get:
      responses:
        "200":
          description: Explicit example
          content:
            application/json:
              example: abc
  /b-generated:
    get:
      responses:
        "200":
          description: Generated example
          content:
            application/json:
              schema:
                type: object
                properties:
                  value:
                    type: string
`
	path := filepath.Join(t.TempDir(), "aggregate-body.yaml")
	if err := os.WriteFile(path, []byte(spec), 0o600); err != nil {
		t.Fatalf("write spec: %v", err)
	}
	endpoints, _, err := core.LoadOpenAPI(path)
	if err != nil {
		t.Fatalf("LoadOpenAPI() error = %v", err)
	}

	const explicitBody = `"abc"`
	const generatedBody = `{"value":"string"}`
	totalBodyBytes := int64(len(explicitBody) + len(generatedBody))
	limits := openAPIImportLimits{
		routeCount: int64(len(endpoints)),
		bodyBytes:  totalBodyBytes - 1,
	}

	_, err = importOpenAPIEndpoints(endpoints, limits)
	var limitErr *OpenAPIImportLimitError
	if !errors.As(err, &limitErr) {
		t.Fatalf("importOpenAPIEndpoints() error = %v, want *OpenAPIImportLimitError", err)
	}
	if limitErr.Code != CodeOpenAPIImportLimitExceeded ||
		limitErr.Budget != OpenAPIImportBudgetBodyBytes ||
		limitErr.Limit != totalBodyBytes-1 ||
		limitErr.Attempted != totalBodyBytes {
		t.Fatalf("body-byte budget error = %#v", limitErr)
	}
	if !strings.Contains(err.Error(), "GET /b-generated response body") ||
		!strings.Contains(err.Error(), "Reduce response examples") {
		t.Fatalf("body-byte budget error lacks route context or guidance: %v", err)
	}

	limits.bodyBytes = totalBodyBytes
	routes, err := importOpenAPIEndpoints(endpoints, limits)
	if err != nil {
		t.Fatalf("importOpenAPIEndpoints() at exact budget error = %v", err)
	}
	if len(routes) != 2 ||
		routes[0].Body != explicitBody ||
		routes[1].Body != generatedBody {
		t.Fatalf("routes at exact body budget = %#v", routes)
	}
}

func TestImportOpenAPIUsesOneNodeBudgetAcrossRepeatedReferences(t *testing.T) {
	spec := `openapi: 3.0.3
info:
  title: Shared sample budget
  version: 1.0.0
components:
  schemas:
    WideItem:
      type: object
      properties:
        p01: {type: string}
        p02: {type: string}
        p03: {type: string}
        p04: {type: string}
        p05: {type: string}
        p06: {type: string}
        p07: {type: string}
        p08: {type: string}
        p09: {type: string}
        p10: {type: string}
paths:
  /items:
    get:
      responses:
        "200":
          description: Items
          content:
            application/json:
              schema:
                type: array
                minItems: 1000
                items:
                  $ref: "#/components/schemas/WideItem"
`
	path := filepath.Join(t.TempDir(), "wide-reference.yaml")
	if err := os.WriteFile(path, []byte(spec), 0o600); err != nil {
		t.Fatalf("write spec: %v", err)
	}

	_, err := ImportOpenAPI(path)
	var limitErr *SampleGenerationLimitError
	if !errors.As(err, &limitErr) {
		t.Fatalf("ImportOpenAPI() error = %v, want *SampleGenerationLimitError", err)
	}
	var importLimitErr *OpenAPIImportLimitError
	if errors.As(err, &importLimitErr) {
		t.Fatalf("per-sample limit was replaced by import-wide error %#v", importLimitErr)
	}
	if limitErr.Code != CodeSampleGenerationLimitExceeded ||
		limitErr.Budget != sampleBudgetNodes ||
		limitErr.Limit != maxGeneratedSampleNodes ||
		limitErr.Attempted != maxGeneratedSampleNodes+1 {
		t.Fatalf("node budget error = %#v", limitErr)
	}
	if !strings.Contains(err.Error(), "Reduce nested properties") {
		t.Fatalf("node budget error is not user actionable: %v", err)
	}
}

func TestSchemaSampleVisitorReturnsStructuredEstimatedByteLimitError(t *testing.T) {
	schema := openapi3.NewStringSchema().
		WithDefault(strings.Repeat("x", int(maxGeneratedSampleEstimatedBytes)))

	_, err := sampleFromSchema(schema.NewRef(), nil, 0)
	var limitErr *SampleGenerationLimitError
	if !errors.As(err, &limitErr) {
		t.Fatalf("sampleFromSchema() error = %v, want *SampleGenerationLimitError", err)
	}
	if limitErr.Code != CodeSampleGenerationLimitExceeded ||
		limitErr.Budget != sampleBudgetEstimatedBytes ||
		limitErr.Limit != maxGeneratedSampleEstimatedBytes ||
		limitErr.Attempted != maxGeneratedSampleEstimatedBytes+2 {
		t.Fatalf("estimated-byte budget error = %#v", limitErr)
	}
	if _, err := json.Marshal(limitErr); err != nil {
		t.Fatalf("json.Marshal(limit error) = %v", err)
	}
}

func TestSchemaSampleVisitorBoundsDeepSchemas(t *testing.T) {
	ref := openapi3.NewStringSchema().NewRef()
	for range maxGeneratedSchemaDepth + 5 {
		schema := openapi3.NewObjectSchema()
		schema.Properties["child"] = ref
		ref = schema.NewRef()
	}

	sample, err := sampleFromSchema(ref, nil, 0)
	if err != nil {
		t.Fatalf("sampleFromSchema() error = %v", err)
	}
	cursor := sample
	objectCount := 0
	for cursor != nil {
		object, ok := cursor.(map[string]any)
		if !ok {
			t.Fatalf("deep sample level %d = %#v, want object or nil", objectCount, cursor)
		}
		objectCount++
		cursor = object["child"]
	}
	if objectCount != maxGeneratedSchemaDepth+1 {
		t.Fatalf("deep sample object count = %d, want %d", objectCount, maxGeneratedSchemaDepth+1)
	}
}

func TestSchemaSampleVisitorCutsReferenceCycles(t *testing.T) {
	schema := openapi3.NewObjectSchema()
	ref := schema.NewRef()
	schema.Properties["self"] = ref
	schema.Properties["value"] = openapi3.NewStringSchema().NewRef()

	sample, err := sampleFromSchema(ref, nil, 0)
	if err != nil {
		t.Fatalf("sampleFromSchema() error = %v", err)
	}
	object, ok := sample.(map[string]any)
	if !ok {
		t.Fatalf("cyclic sample = %#v, want object", sample)
	}
	if object["self"] != nil || object["value"] != "string" {
		t.Fatalf("cyclic sample = %#v", object)
	}
}

func TestImportOpenAPIRejectsUnsafeGeneratedArraySize(t *testing.T) {
	spec := `openapi: 3.0.3
info:
  title: Unsafe sample
  version: 1.0.0
paths:
  /items:
    get:
      responses:
        "200":
          description: Items
          content:
            application/json:
              schema:
                type: array
                minItems: 1001
                items:
                  type: string
`
	path := filepath.Join(t.TempDir(), "unsafe.yaml")
	if err := os.WriteFile(path, []byte(spec), 0o600); err != nil {
		t.Fatalf("write spec: %v", err)
	}

	if _, err := ImportOpenAPI(path); err == nil {
		t.Fatal("ImportOpenAPI() error = nil, want safe generation limit error")
	}
}
