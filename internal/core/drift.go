package core

import (
	"encoding/json"
	"reflect"
	"strconv"

	"github.com/getkin/kin-openapi/openapi3"
)

// DriftType is the kind of contract drift.
type DriftType string

const (
	DriftMissing       DriftType = "missing"
	DriftExtra         DriftType = "extra"
	DriftTypeMismatch  DriftType = "type_mismatch"
	DriftEnumViolation DriftType = "enum_violation"
)

// DriftFinding is one contract drift finding.
type DriftFinding struct {
	Path   string   // JSON path e.g. "body.items[0].name"
	Type   DriftType
	Schema string   // expected (from OpenAPI)
	Actual string   // actual value or type
	Enum   []string // for enum_violation
}

// DriftResult holds all drift findings for one endpoint.
type DriftResult struct {
	Path     string
	Method   string
	Findings []DriftFinding
	OK       bool
}

// RunDrift compares response body (as map[string]any) against OpenAPI response schema.
func RunDrift(respBody []byte, op *openapi3.Operation, statusCode int) DriftResult {
	res := DriftResult{OK: true}
	if op == nil {
		return res
	}
	resp := op.Responses.Status(statusCode)
	if resp == nil || resp.Value == nil {
		resp = op.Responses.Value("default")
	}
	if resp == nil || resp.Value == nil {
		return res
	}
	content := resp.Value.Content.Get("application/json")
	if content == nil || content.Schema == nil || content.Schema.Value == nil {
		return res
	}
	var body map[string]any
	if err := json.Unmarshal(respBody, &body); err != nil {
		// Try array root
		var arr []any
		if err2 := json.Unmarshal(respBody, &arr); err2 != nil {
			res.Findings = append(res.Findings, DriftFinding{Path: "$", Type: DriftTypeMismatch, Actual: "invalid JSON"})
			res.OK = false
			return res
		}
		compareSchemaToValue(content.Schema.Value, "", arr, &res)
		res.OK = len(res.Findings) == 0
		return res
	}
	compareSchemaToValue(content.Schema.Value, "", body, &res)
	res.OK = len(res.Findings) == 0
	return res
}

func schemaTypeStr(s *openapi3.Schema) string {
	if s.Type == nil || len(s.Type.Slice()) == 0 {
		return ""
	}
	return s.Type.Slice()[0]
}

func compareSchemaToValue(s *openapi3.Schema, path string, value interface{}, res *DriftResult) {
	if path == "" {
		path = "$"
	}
	t := schemaTypeStr(s)
	switch t {
	case "object":
		obj, ok := value.(map[string]interface{})
		if !ok {
			res.Findings = append(res.Findings, DriftFinding{Path: path, Type: DriftTypeMismatch, Schema: "object", Actual: typeOf(value)})
			res.OK = false
			return
		}
		for name, prop := range s.Properties {
			subPath := path + "." + name
			if prop == nil || prop.Value == nil {
				continue
			}
			actual, exists := obj[name]
			if !exists {
				if !sliceContains(s.Required, name) {
					continue
				}
				res.Findings = append(res.Findings, DriftFinding{Path: subPath, Type: DriftMissing, Schema: schemaTypeStr(prop.Value), Actual: ""})
				res.OK = false
				continue
			}
			compareSchemaToValue(prop.Value, subPath, actual, res)
		}
		for name := range obj {
			if s.Properties[name] == nil {
				res.Findings = append(res.Findings, DriftFinding{Path: path + "." + name, Type: DriftExtra, Actual: typeOf(obj[name])})
				res.OK = false
			}
		}
	case "array":
		arr, ok := value.([]interface{})
		if !ok {
			res.Findings = append(res.Findings, DriftFinding{Path: path, Type: DriftTypeMismatch, Schema: "array", Actual: typeOf(value)})
			res.OK = false
			return
		}
		itemSchema := s.Items
		if itemSchema != nil && itemSchema.Value != nil {
			for i, item := range arr {
				compareSchemaToValue(itemSchema.Value, path+"["+strconv.Itoa(i)+"]", item, res)
			}
		}
	case "string":
		if _, ok := value.(string); !ok && value != nil {
			res.Findings = append(res.Findings, DriftFinding{Path: path, Type: DriftTypeMismatch, Schema: "string", Actual: typeOf(value)})
			res.OK = false
		}
		if len(s.Enum) > 0 {
			str, _ := value.(string)
			var allowed []string
			for _, e := range s.Enum {
				allowed = append(allowed, stringify(e))
			}
			if str != "" && !sliceContainsString(allowed, str) {
				res.Findings = append(res.Findings, DriftFinding{Path: path, Type: DriftEnumViolation, Actual: str, Enum: allowed})
				res.OK = false
			}
		}
	case "number", "integer":
		if value != nil && !isNumber(value) {
			res.Findings = append(res.Findings, DriftFinding{Path: path, Type: DriftTypeMismatch, Schema: t, Actual: typeOf(value)})
			res.OK = false
		}
	case "boolean":
		if value != nil && reflect.TypeOf(value).Kind() != reflect.Bool {
			res.Findings = append(res.Findings, DriftFinding{Path: path, Type: DriftTypeMismatch, Schema: "boolean", Actual: typeOf(value)})
			res.OK = false
		}
	default:
		// any type or unknown
	}
}

func typeOf(v interface{}) string {
	if v == nil {
		return "null"
	}
	return reflect.TypeOf(v).Kind().String()
}

func stringify(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func isNumber(v interface{}) bool {
	switch v.(type) {
	case float64, int, int64, int32:
		return true
	}
	k := reflect.TypeOf(v).Kind()
	return k == reflect.Float32 || k == reflect.Float64 || k == reflect.Int || k == reflect.Int8 || k == reflect.Int16 || k == reflect.Int32 || k == reflect.Int64
}

func sliceContains(s []string, x string) bool {
	for _, v := range s {
		if v == x {
			return true
		}
	}
	return false
}

func sliceContainsString(s []string, x string) bool {
	for _, v := range s {
		if v == x {
			return true
		}
	}
	return false
}
