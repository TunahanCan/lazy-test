package core

import (
	"encoding/json"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
)

func responseOperation(schema *openapi3.Schema) *openapi3.Operation {
	response := openapi3.NewResponse().WithDescription("OK")
	if schema != nil {
		response = response.WithJSONSchema(schema)
	}
	return &openapi3.Operation{
		Responses: openapi3.NewResponses(
			openapi3.WithStatus(200, &openapi3.ResponseRef{Value: response}),
		),
	}
}

func responseOperationForMediaType(mediaType string, schema *openapi3.Schema) *openapi3.Operation {
	response := openapi3.NewResponse().WithDescription("Response")
	response.Content = openapi3.Content{
		mediaType: openapi3.NewMediaType().WithSchema(schema),
	}
	return &openapi3.Operation{
		Responses: openapi3.NewResponses(
			openapi3.WithStatus(200, &openapi3.ResponseRef{Value: response}),
		),
	}
}

func responseOperationForContent(content openapi3.Content) *openapi3.Operation {
	response := openapi3.NewResponse().WithDescription("Response")
	response.Content = content
	return &openapi3.Operation{
		Responses: openapi3.NewResponses(
			openapi3.WithStatus(200, &openapi3.ResponseRef{Value: response}),
		),
	}
}

func TestRunDriftReportsWhetherAJSONSchemaWasCompared(t *testing.T) {
	result := RunDrift([]byte(`{"id":42}`), responseOperation(nil), 200)
	if result.Compared {
		t.Fatal("Compared = true without an application/json schema")
	}

	schema := openapi3.NewObjectSchema().
		WithProperty("id", openapi3.NewIntegerSchema()).
		WithRequired([]string{"id"})
	result = RunDrift([]byte(`{}`), responseOperation(schema), 200)
	if !result.Compared {
		t.Fatal("Compared = false with an application/json schema")
	}
	if result.OK || len(result.Findings) != 1 || result.Findings[0].Type != DriftMissing {
		t.Fatalf("unexpected drift result: %#v", result)
	}
}

func TestRunDriftHandlesAnOperationWithoutResponses(t *testing.T) {
	result := RunDrift([]byte(`{"ok":true}`), &openapi3.Operation{}, 200)
	if result.Compared || !result.OK || len(result.Findings) != 0 {
		t.Fatalf("unexpected empty response result: %#v", result)
	}
}

func TestRunDriftChecksIntegerShapeAndNonStringEnums(t *testing.T) {
	schema := openapi3.NewObjectSchema().
		WithProperty("priority", openapi3.NewIntegerSchema().WithEnum(1, 2)).
		WithRequired([]string{"priority"})
	result := RunDrift(
		[]byte(`{"priority":1.5}`),
		responseOperation(schema),
		200,
	)
	if result.OK {
		t.Fatal("OK = true for a fractional integer outside the enum")
	}
	var foundType, foundEnum bool
	for _, finding := range result.Findings {
		foundType = foundType || finding.Type == DriftTypeMismatch
		foundEnum = foundEnum || finding.Type == DriftEnumViolation
	}
	if !foundType || !foundEnum {
		t.Fatalf("findings = %#v, want type mismatch and enum violation", result.Findings)
	}

	result = RunDrift([]byte(`{"priority":2}`), responseOperation(schema), 200)
	if !result.OK || len(result.Findings) != 0 {
		t.Fatalf("valid numeric enum result = %#v", result)
	}
}

func TestRunDriftComparesLargeJSONIntegersExactly(t *testing.T) {
	const allowed = int64(9_007_199_254_740_993)
	schema := openapi3.NewIntegerSchema().WithEnum(allowed)

	result := RunDrift([]byte(`9007199254740992`), responseOperation(schema), 200)
	if result.OK || len(result.Findings) != 1 ||
		result.Findings[0].Type != DriftEnumViolation {
		t.Fatalf("adjacent large integer result = %#v", result)
	}

	result = RunDrift([]byte(`9007199254740993`), responseOperation(schema), 200)
	if !result.OK || len(result.Findings) != 0 {
		t.Fatalf("exact large integer result = %#v", result)
	}
}

func TestRunDriftHonorsAdditionalProperties(t *testing.T) {
	openObject := openapi3.NewObjectSchema().
		WithProperty("id", openapi3.NewIntegerSchema()).
		WithRequired([]string{"id"})
	result := RunDrift(
		[]byte(`{"id":42,"extension":"allowed by default"}`),
		responseOperation(openObject),
		200,
	)
	if !result.OK || len(result.Findings) != 0 {
		t.Fatalf("default additionalProperties result = %#v", result)
	}

	closedObject := openapi3.NewObjectSchema().
		WithProperty("id", openapi3.NewIntegerSchema()).
		WithRequired([]string{"id"}).
		WithoutAdditionalProperties()
	result = RunDrift(
		[]byte(`{"id":42,"extension":"not allowed"}`),
		responseOperation(closedObject),
		200,
	)
	if result.OK || len(result.Findings) != 1 || result.Findings[0].Type != DriftExtra {
		t.Fatalf("closed additionalProperties result = %#v", result)
	}
}

func TestRunDriftSupportsComposedAndImplicitObjectSchemas(t *testing.T) {
	identifier := openapi3.NewObjectSchema().
		WithProperty("id", openapi3.NewIntegerSchema()).
		WithRequired([]string{"id"})
	identifier.Type = nil
	status := openapi3.NewObjectSchema().
		WithProperty("status", openapi3.NewStringSchema().WithEnum("OPEN", "CLOSED")).
		WithRequired([]string{"status"})
	composed := &openapi3.Schema{
		AllOf: openapi3.SchemaRefs{
			{Value: identifier},
			{Value: status},
		},
	}

	result := RunDrift(
		[]byte(`{"id":7,"status":"OPEN"}`),
		responseOperation(composed),
		200,
	)
	if !result.OK || len(result.Findings) != 0 {
		t.Fatalf("valid allOf result = %#v", result)
	}

	result = RunDrift(
		[]byte(`{"id":"wrong","status":"UNKNOWN"}`),
		responseOperation(composed),
		200,
	)
	if result.OK || len(result.Findings) < 2 {
		t.Fatalf("invalid allOf result = %#v", result)
	}
}

func TestRunDriftSupportsScalarJSONRoots(t *testing.T) {
	result := RunDrift([]byte(`"ready"`), responseOperation(openapi3.NewStringSchema()), 200)
	if !result.Compared || !result.OK || len(result.Findings) != 0 {
		t.Fatalf("valid scalar result = %#v", result)
	}

	result = RunDrift([]byte(`42`), responseOperation(openapi3.NewStringSchema()), 200)
	if result.OK || len(result.Findings) != 1 || result.Findings[0].Path != "$" {
		t.Fatalf("invalid scalar result = %#v", result)
	}
}

func TestRunDriftRejectsNullUnlessTheSchemaAllowsIt(t *testing.T) {
	result := RunDrift([]byte(`null`), responseOperation(openapi3.NewStringSchema()), 200)
	if result.OK || len(result.Findings) != 1 || result.Findings[0].Actual != "null" {
		t.Fatalf("non-nullable result = %#v", result)
	}

	result = RunDrift([]byte(`null`), responseOperation(openapi3.NewStringSchema().WithNullable()), 200)
	if !result.OK || len(result.Findings) != 0 {
		t.Fatalf("nullable result = %#v", result)
	}

	types := openapi3.Types{"string", "null"}
	union := openapi3.NewSchema()
	union.Type = &types
	for _, body := range [][]byte{[]byte(`"ok"`), []byte(`null`)} {
		result = RunDrift(body, responseOperation(union), 200)
		if !result.OK || len(result.Findings) != 0 {
			t.Fatalf("OpenAPI 3.1 union body %s result = %#v", body, result)
		}
	}
	result = RunDrift([]byte(`false`), responseOperation(union), 200)
	if result.OK || len(result.Findings) != 1 || result.Findings[0].Schema != "string | null" {
		t.Fatalf("invalid OpenAPI 3.1 union result = %#v", result)
	}
}

func TestRunDriftFindsJSONStructuredSyntaxMediaTypes(t *testing.T) {
	for _, mediaType := range []string{
		"application/problem+json",
		"application/vnd.validex.order+json",
		"application/vnd.validex.order+json; version=2",
	} {
		t.Run(mediaType, func(t *testing.T) {
			result := RunDrift(
				[]byte(`{"title":42}`),
				responseOperationForMediaType(
					mediaType,
					openapi3.NewObjectSchema().WithProperty("title", openapi3.NewStringSchema()),
				),
				200,
			)
			if !result.Compared || result.OK || len(result.Findings) != 1 {
				t.Fatalf("structured JSON media result = %#v", result)
			}
		})
	}
}

func TestRunDriftUsesTheActualResponseContentType(t *testing.T) {
	operation := responseOperationForContent(openapi3.Content{
		"application/json": openapi3.NewMediaType().WithSchema(
			openapi3.NewObjectSchema().WithProperty("data", openapi3.NewStringSchema()).WithRequired([]string{"data"}),
		),
		"application/problem+json": openapi3.NewMediaType().WithSchema(
			openapi3.NewObjectSchema().WithProperty("title", openapi3.NewStringSchema()).WithRequired([]string{"title"}),
		),
	})
	result := RunDriftWithContentType(
		[]byte(`{"title":"Not Found"}`),
		operation,
		200,
		"application/problem+json; charset=utf-8",
	)
	if !result.Compared || !result.OK || len(result.Findings) != 0 {
		t.Fatalf("actual problem+json selection result = %#v", result)
	}
}

func TestRunDriftSupportsStructuredJSONMediaRanges(t *testing.T) {
	operation := responseOperationForMediaType(
		"application/*+json",
		openapi3.NewObjectSchema().WithProperty("id", openapi3.NewIntegerSchema()).WithRequired([]string{"id"}),
	)
	result := RunDriftWithContentType(
		[]byte(`{"id":7}`),
		operation,
		200,
		"application/vnd.validex.order+json",
	)
	if !result.Compared || !result.OK || len(result.Findings) != 0 {
		t.Fatalf("structured JSON wildcard result = %#v", result)
	}
}

func TestRunDriftDoesNotTreatPlainTextAsJSON(t *testing.T) {
	operation := responseOperationForMediaType(
		"text/plain",
		openapi3.NewStringSchema(),
	)
	result := RunDriftWithContentType(
		[]byte("healthy"),
		operation,
		200,
		"text/plain; charset=utf-8",
	)
	if result.Compared || !result.OK || len(result.Findings) != 0 {
		t.Fatalf("plain text result = %#v, want JSON contract unavailable", result)
	}
}

func TestRunDriftBoundsFindingsAndSignalsTruncation(t *testing.T) {
	values := make([]any, maxDriftFindings+1)
	for index := range values {
		values[index] = index
	}
	body, err := json.Marshal(values)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	result := RunDrift(
		body,
		responseOperation(openapi3.NewArraySchema().WithItems(openapi3.NewStringSchema())),
		200,
	)
	if result.OK || !result.Truncated || len(result.Findings) != maxDriftFindings {
		t.Fatalf("bounded drift result = %#v", result)
	}
	if result.Findings[0].Path != "$[0]" ||
		result.Findings[len(result.Findings)-1].Path != "$[999]" {
		t.Fatalf("unexpected bounded finding paths: first=%q last=%q", result.Findings[0].Path, result.Findings[len(result.Findings)-1].Path)
	}
}

func TestRunDriftChecksNumericStringArrayAndFormatConstraints(t *testing.T) {
	schema := openapi3.NewObjectSchema().
		WithProperty("score", openapi3.NewFloat64Schema().WithMin(1).WithMax(10)).
		WithProperty("code", openapi3.NewStringSchema().WithMinLength(3).WithMaxLength(5).WithPattern(`^[A-Z]`)).
		WithProperty("createdAt", openapi3.NewDateTimeSchema()).
		WithProperty("tags", openapi3.NewArraySchema().
			WithItems(openapi3.NewStringSchema()).
			WithMinItems(2).
			WithMaxItems(3).
			WithUniqueItems(true)).
		WithRequired([]string{"score", "code", "createdAt", "tags"})

	result := RunDrift(
		[]byte(`{"score":11,"code":"a","createdAt":"not-a-date","tags":["same","same"]}`),
		responseOperation(schema),
		200,
	)
	if result.OK {
		t.Fatal("constraint violations were accepted")
	}
	wantPaths := map[string]int{
		"$.score":     1,
		"$.code":      2,
		"$.createdAt": 1,
		"$.tags":      1,
	}
	for _, finding := range result.Findings {
		if finding.Type != DriftTypeMismatch {
			t.Fatalf("constraint finding type = %q, want existing type_mismatch", finding.Type)
		}
		wantPaths[finding.Path]--
	}
	for path, remaining := range wantPaths {
		if remaining != 0 {
			t.Fatalf("findings for %s remaining = %d; all findings = %#v", path, remaining, result.Findings)
		}
	}

	result = RunDrift(
		[]byte(`{"score":5.5,"code":"ABC","createdAt":"2026-07-27T12:00:00Z","tags":["one","two"]}`),
		responseOperation(schema),
		200,
	)
	if !result.OK || len(result.Findings) != 0 {
		t.Fatalf("valid constrained result = %#v", result)
	}
}

func TestRunDriftChecksObjectAndMultipleOfConstraints(t *testing.T) {
	multiple := 0.25
	schema := openapi3.NewObjectSchema().WithMaxProperties(1)
	additionalSchema := openapi3.NewFloat64Schema()
	additionalSchema.MultipleOf = &multiple
	schema.AdditionalProperties = openapi3.AdditionalProperties{
		Schema: &openapi3.SchemaRef{Value: additionalSchema},
	}
	result := RunDrift(
		[]byte(`{"first":0.3,"second":0.5}`),
		responseOperation(schema),
		200,
	)
	if result.OK || len(result.Findings) != 2 {
		t.Fatalf("object/multipleOf constraint result = %#v", result)
	}
}
