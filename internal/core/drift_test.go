package core

import (
	"encoding/json"
	"strconv"
	"strings"
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

func TestRunEndpointDriftPreservesRouteIdentity(t *testing.T) {
	t.Parallel()

	endpoint := Endpoint{
		Path:      "/orders/{id}",
		Method:    "GET",
		Operation: responseOperation(openapi3.NewStringSchema()),
	}
	result := RunEndpointDrift([]byte(`42`), endpoint, 200)
	if result.Path != endpoint.Path || result.Method != endpoint.Method {
		t.Fatalf(
			"route identity = %q %q, want %q %q",
			result.Method,
			result.Path,
			endpoint.Method,
			endpoint.Path,
		)
	}
	if result.OK || len(result.Findings) != 1 {
		t.Fatalf("unexpected endpoint drift result: %#v", result)
	}

	operationOnly := RunDrift([]byte(`42`), endpoint.Operation, 200)
	if operationOnly.Path != "" || operationOnly.Method != "" {
		t.Fatalf(
			"operation-only result invented route identity: %#v",
			operationOnly,
		)
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

func TestRunDriftBoundsBodyAndNumericParsing(t *testing.T) {
	t.Parallel()
	schema := responseOperation(openapi3.NewFloat64Schema())

	oversizedBody := make([]byte, MaxDriftBodyBytes+1)
	result := RunDrift(oversizedBody, schema, 200)
	if !result.Compared || result.OK || !result.Truncated ||
		len(result.Findings) != 1 ||
		result.Findings[0].Type != DriftTypeMismatch {
		t.Fatalf("oversized body result = %#v", result)
	}

	for _, body := range [][]byte{
		[]byte(strings.Repeat("9", maxDriftNumericBytes+1)),
		[]byte("1e" + strconv.Itoa(maxDriftNumericExponent+1)),
	} {
		result = RunDrift(body, schema, 200)
		if !result.Compared || result.OK || len(result.Findings) == 0 ||
			result.Findings[0].Type != DriftTypeMismatch {
			t.Fatalf("bounded numeric result = %#v", result)
		}
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

func TestRunDriftEscapesAmbiguousJSONPropertyPaths(t *testing.T) {
	t.Parallel()

	nested := openapi3.NewObjectSchema().
		WithProperty(`quote"key`, openapi3.NewIntegerSchema()).
		WithRequired([]string{`quote"key`})
	schema := openapi3.NewObjectSchema().
		WithProperty("simple", openapi3.NewStringSchema()).
		WithProperty("a.b", nested).
		WithRequired([]string{"simple", "a.b"}).
		WithoutAdditionalProperties()

	result := RunDrift(
		[]byte(`{"simple":1,"a.b":{"quote\"key":false},"slash/key":[]}`),
		responseOperation(schema),
		200,
	)
	if result.OK || len(result.Findings) != 3 {
		t.Fatalf("unexpected escaped-path result: %#v", result)
	}
	actualTypesByPath := make(map[string]string, len(result.Findings))
	for _, finding := range result.Findings {
		actualTypesByPath[finding.Path] = finding.Actual
	}
	want := map[string]string{
		`$.simple`:               "number",
		`$["a.b"]["quote\"key"]`: "boolean",
		`$["slash/key"]`:         "array",
	}
	for path, actualType := range want {
		if got := actualTypesByPath[path]; got != actualType {
			t.Errorf("finding %s actual type = %q, want %q", path, got, actualType)
		}
	}
}

func TestAppendJSONPropertyPathIsUnambiguous(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		"property":    "$.property",
		"_private2":   "$._private2",
		"":            `$[""]`,
		"a.b":         `$["a.b"]`,
		"1st":         `$["1st"]`,
		`quote"key`:   `$["quote\"key"]`,
		"line\nbreak": `$["line\nbreak"]`,
		"müşteri":     `$["müşteri"]`,
	}
	for property, want := range tests {
		if got := appendJSONPropertyPath("$", property); got != want {
			t.Errorf(
				"appendJSONPropertyPath(%q) = %q, want %q",
				property,
				got,
				want,
			)
		}
	}
}

func TestTypeOfUsesJSONVocabulary(t *testing.T) {
	t.Parallel()

	tests := []struct {
		value any
		want  string
	}{
		{value: nil, want: "null"},
		{value: false, want: "boolean"},
		{value: "ready", want: "string"},
		{value: json.Number("1.25"), want: "number"},
		{value: int64(7), want: "number"},
		{value: []interface{}{}, want: "array"},
		{value: map[string]interface{}{}, want: "object"},
	}
	for _, test := range tests {
		if got := typeOf(test.value); got != test.want {
			t.Errorf("typeOf(%#v) = %q, want %q", test.value, got, test.want)
		}
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

func TestRunDriftBoundsCircularSchemaCompositions(t *testing.T) {
	selfReferential := openapi3.NewSchema()
	selfReferential.AllOf = openapi3.SchemaRefs{{Value: selfReferential}}

	first := openapi3.NewSchema()
	second := openapi3.NewSchema()
	first.OneOf = openapi3.SchemaRefs{{Value: second}}
	second.AnyOf = openapi3.SchemaRefs{{Value: first}}

	for name, schema := range map[string]*openapi3.Schema{
		"direct allOf cycle":       selfReferential,
		"mutual alternative cycle": first,
	} {
		t.Run(name, func(t *testing.T) {
			result := RunDrift([]byte(`{}`), responseOperation(schema), 200)
			if !result.Compared || result.OK || !result.Truncated {
				t.Fatalf("circular schema result = %#v, want a truncated comparison", result)
			}
		})
	}
}

func TestRunDriftDoesNotResolveOneOfWithACircularCandidate(t *testing.T) {
	circular := openapi3.NewSchema()
	circular.AllOf = openapi3.SchemaRefs{{Value: circular}}
	schema := &openapi3.Schema{
		OneOf: openapi3.SchemaRefs{
			{Value: circular},
			{Value: openapi3.NewStringSchema()},
		},
	}

	result := RunDrift([]byte(`"matched"`), responseOperation(schema), 200)
	if !result.Compared || result.OK || !result.Truncated {
		t.Fatalf("oneOf with unresolved candidate result = %#v, want a truncated comparison", result)
	}
}

func TestRunDriftCanResolveAnyOfWithACircularCandidate(t *testing.T) {
	circular := openapi3.NewSchema()
	circular.AllOf = openapi3.SchemaRefs{{Value: circular}}
	schema := &openapi3.Schema{
		AnyOf: openapi3.SchemaRefs{
			{Value: circular},
			{Value: openapi3.NewStringSchema()},
		},
	}

	result := RunDrift([]byte(`"matched"`), responseOperation(schema), 200)
	if !result.Compared || !result.OK || result.Truncated || len(result.Findings) != 0 {
		t.Fatalf("anyOf with one proven match result = %#v", result)
	}
}

func TestRunDriftAllowsFiniteValuesForRecursivePropertySchemas(t *testing.T) {
	node := openapi3.NewObjectSchema().
		WithProperty("value", openapi3.NewIntegerSchema()).
		WithRequired([]string{"value"})
	node.Properties["next"] = &openapi3.SchemaRef{Value: node}

	result := RunDrift(
		[]byte(`{"value":1,"next":{"value":2,"next":{"value":3}}}`),
		responseOperation(node),
		200,
	)
	if !result.Compared || !result.OK || result.Truncated || len(result.Findings) != 0 {
		t.Fatalf("finite recursive value result = %#v", result)
	}
}

func TestRunDriftBoundsSchemaTraversalDepth(t *testing.T) {
	root := openapi3.NewSchema()
	current := root
	for range maxDriftTraversalDepth {
		next := openapi3.NewSchema()
		current.AllOf = openapi3.SchemaRefs{{Value: next}}
		current = next
	}

	result := RunDrift([]byte(`null`), responseOperation(root), 200)
	if !result.Compared || result.OK || !result.Truncated {
		t.Fatalf("deep schema result = %#v, want a truncated comparison", result)
	}
}

func TestRunDriftBoundsSchemaTraversalNodes(t *testing.T) {
	values := make([]string, maxDriftTraversalNodes)
	for index := range values {
		values[index] = "ok"
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
	if !result.Compared || result.OK || !result.Truncated || len(result.Findings) != 0 {
		t.Fatalf("wide schema result = %#v, want a finding-free truncated comparison", result)
	}
}

func TestRunDriftBoundsFindingValueAndEnumPreviews(t *testing.T) {
	t.Parallel()

	schema := openapi3.NewStringSchema()
	for range maxDriftEnumValues + 10 {
		schema.Enum = append(
			schema.Enum,
			strings.Repeat("allowed", maxDriftFindingText),
		)
	}
	actual := strings.Repeat("actual", maxDriftFindingText)
	body, err := json.Marshal(actual)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	result := RunDrift(body, responseOperation(schema), 200)
	if len(result.Findings) != 1 {
		t.Fatalf("findings = %#v, want one enum violation", result.Findings)
	}
	finding := result.Findings[0]
	if len(finding.Actual) > maxDriftFindingText ||
		len(finding.Enum) != maxDriftEnumValues+1 ||
		finding.Enum[len(finding.Enum)-1] != "…" {
		t.Fatalf("unbounded finding preview = %#v", finding)
	}
	for _, value := range finding.Enum {
		if len(value) > maxDriftFindingText {
			t.Fatalf("enum preview length = %d, want <= %d", len(value), maxDriftFindingText)
		}
	}
}

func TestAddDriftFindingBoundsAggregateTextBytes(t *testing.T) {
	t.Parallel()

	value := strings.Repeat("x", maxDriftFindingText)
	enum := make([]string, maxDriftEnumValues)
	for index := range enum {
		enum[index] = value
	}
	result := DriftResult{OK: true}
	for range maxDriftFindings {
		if !addDriftFinding(&result, DriftFinding{
			Path:   value,
			Type:   DriftEnumViolation,
			Schema: value,
			Actual: value,
			Enum:   append([]string{}, enum...),
		}) {
			break
		}
	}
	if !result.Truncated || result.OK {
		t.Fatalf("aggregate finding budget result = %#v", result)
	}
	if result.findingBytes > maxDriftFindingBytes ||
		len(result.Findings) >= maxDriftFindings {
		t.Fatalf(
			"finding budget = %d bytes across %d findings",
			result.findingBytes,
			len(result.Findings),
		)
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
