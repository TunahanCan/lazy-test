package core

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/big"
	"mime"
	"net"
	"net/mail"
	"net/url"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/getkin/kin-openapi/openapi3"
)

// DriftType is the kind of contract drift.
type DriftType string

const (
	DriftMissing       DriftType = "missing"
	DriftExtra         DriftType = "extra"
	DriftTypeMismatch  DriftType = "type_mismatch"
	DriftEnumViolation DriftType = "enum_violation"

	maxDriftFindings = 1000
	// Schema graphs may be cyclic, and valid response bodies may be much wider
	// or deeper than a useful interactive drift report. Keep both dimensions
	// bounded independently from the finding limit.
	maxDriftTraversalDepth = 256
	maxDriftTraversalNodes = 10_000
	maxDriftFindingBytes   = 4 << 20
	maxDriftFindingText    = 1 << 10
	maxDriftEnumValues     = 32
)

// DriftFinding is one contract drift finding.
type DriftFinding struct {
	Path   string // JSON path e.g. "body.items[0].name"
	Type   DriftType
	Schema string   // expected (from OpenAPI)
	Actual string   // actual value or type
	Enum   []string // for enum_violation
}

// DriftResult holds all drift findings for one endpoint.
type DriftResult struct {
	Path      string
	Method    string
	Findings  []DriftFinding
	Compared  bool
	Truncated bool
	OK        bool

	findingBytes int
}

// RunDrift compares a JSON response body against its OpenAPI response schema.
func RunDrift(respBody []byte, op *openapi3.Operation, statusCode int) DriftResult {
	return RunDriftWithContentType(respBody, op, statusCode, "application/json")
}

// RunDriftWithContentType compares a JSON response body against the response
// schema selected for its actual media type. Parameters such as charset are
// ignored while selecting the OpenAPI content entry.
func RunDriftWithContentType(respBody []byte, op *openapi3.Operation, statusCode int, contentType string) DriftResult {
	res := DriftResult{OK: true}
	if op == nil || op.Responses == nil {
		return res
	}
	resp := op.Responses.Status(statusCode)
	if resp == nil || resp.Value == nil {
		resp = op.Responses.Value("default")
	}
	if resp == nil || resp.Value == nil {
		return res
	}
	content := jsonResponseContent(resp.Value.Content, contentType)
	if content == nil || content.Schema == nil || content.Schema.Value == nil {
		return res
	}
	res.Compared = true
	var body any
	if err := decodeDriftJSON(respBody, &body); err != nil {
		addDriftFinding(&res, DriftFinding{Path: "$", Type: DriftTypeMismatch, Schema: "valid JSON", Actual: "invalid JSON"})
		return res
	}
	traversal := newDriftTraversal()
	traversal.compareSchemaToValue(content.Schema.Value, "", body, rootDriftValueID, 0, &res)
	res.OK = len(res.Findings) == 0 && !res.Truncated
	return res
}

func decodeDriftJSON(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return fmt.Errorf("multiple JSON values")
		}
		return err
	}
	return nil
}

func jsonResponseContent(content openapi3.Content, actualContentType string) *openapi3.MediaType {
	type candidate struct {
		key      string
		baseType string
		priority int
	}
	actualBaseType := normalizedMediaType(actualContentType)
	if actualBaseType == "" {
		actualBaseType = "application/json"
	}
	if !isJSONMediaType(actualBaseType) {
		return nil
	}
	candidates := make([]candidate, 0, len(content))
	for key, mediaType := range content {
		if mediaType == nil || mediaType.Schema == nil || mediaType.Schema.Value == nil {
			continue
		}
		baseType := normalizedMediaType(key)
		switch {
		case baseType == actualBaseType:
			candidates = append(candidates, candidate{key: key, baseType: baseType})
		case mediaRangeMatches(baseType, actualBaseType):
			candidates = append(candidates, candidate{key: key, baseType: baseType, priority: 1})
		case isJSONMediaType(actualBaseType) && baseType == "application/json":
			candidates = append(candidates, candidate{key: key, baseType: baseType, priority: 2})
		case isJSONMediaType(actualBaseType) && isJSONMediaType(baseType):
			candidates = append(candidates, candidate{key: key, baseType: baseType, priority: 3})
		}
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].priority != candidates[j].priority {
			return candidates[i].priority < candidates[j].priority
		}
		if candidates[i].baseType != candidates[j].baseType {
			return candidates[i].baseType < candidates[j].baseType
		}
		return candidates[i].key < candidates[j].key
	})
	if len(candidates) == 0 {
		return nil
	}
	return content[candidates[0].key]
}

func normalizedMediaType(value string) string {
	baseType, _, err := mime.ParseMediaType(strings.TrimSpace(value))
	if err != nil {
		baseType = strings.TrimSpace(strings.SplitN(value, ";", 2)[0])
	}
	return strings.ToLower(baseType)
}

func isJSONMediaType(value string) bool {
	parts := strings.SplitN(value, "/", 2)
	if len(parts) != 2 {
		return false
	}
	return value == "application/json" || strings.HasSuffix(parts[1], "+json")
}

func mediaRangeMatches(mediaRange, actual string) bool {
	rangeParts := strings.SplitN(mediaRange, "/", 2)
	actualParts := strings.SplitN(actual, "/", 2)
	if len(rangeParts) != 2 || len(actualParts) != 2 {
		return false
	}
	if rangeParts[0] != "*" && rangeParts[0] != actualParts[0] {
		return false
	}
	switch {
	case rangeParts[1] == "*":
		return true
	case strings.HasPrefix(rangeParts[1], "*+"):
		return strings.HasSuffix(actualParts[1], rangeParts[1][1:])
	default:
		return false
	}
}

func schemaTypeStr(s *openapi3.Schema) string {
	types := schemaTypes(s)
	if len(types) == 0 {
		return ""
	}
	return strings.Join(types, " | ")
}

func schemaTypes(s *openapi3.Schema) []string {
	if s == nil {
		return nil
	}
	types := append([]string(nil), s.Type.Slice()...)
	if len(types) == 0 && (len(s.Properties) > 0 || len(s.Required) > 0) {
		types = []string{"object"}
	}
	if len(types) == 0 && s.Items != nil {
		types = []string{"array"}
	}
	return types
}

type driftValueID uint64

const rootDriftValueID driftValueID = 1

// driftValueID identifies a location in the decoded JSON tree. Composed schemas
// retain the ID because they inspect the same value; properties and array items
// receive new IDs. This distinguishes a schema-graph cycle from an ordinary
// recursive schema advancing through a finite response body.
type driftVisit struct {
	schema  *openapi3.Schema
	valueID driftValueID
}

type driftTraversal struct {
	active      map[driftVisit]struct{}
	nodes       int
	nextValueID driftValueID
	exhausted   bool
}

func newDriftTraversal() *driftTraversal {
	return &driftTraversal{
		active:      make(map[driftVisit]struct{}),
		nextValueID: rootDriftValueID,
	}
}

func (t *driftTraversal) compareSchemaToValue(
	s *openapi3.Schema,
	path string,
	value interface{},
	valueID driftValueID,
	depth int,
	res *DriftResult,
) {
	if s == nil || res.Truncated {
		return
	}
	if path == "" {
		path = "$"
	}
	visit := driftVisit{schema: s, valueID: valueID}
	if !t.enter(visit, depth, res) {
		return
	}
	defer delete(t.active, visit)

	for _, schemaRef := range s.AllOf {
		if schemaRef != nil && schemaRef.Value != nil {
			t.compareSchemaToValue(schemaRef.Value, path, value, valueID, depth+1, res)
			if res.Truncated {
				return
			}
		}
	}
	t.compareSchemaAlternatives("oneOf", s.OneOf, path, value, valueID, depth+1, res)
	if res.Truncated {
		return
	}
	t.compareSchemaAlternatives("anyOf", s.AnyOf, path, value, valueID, depth+1, res)
	if res.Truncated {
		return
	}

	if len(s.Enum) > 0 && !enumContains(s.Enum, value) {
		allowed := make([]string, 0, len(s.Enum))
		for index, enumValue := range s.Enum {
			if index >= maxDriftEnumValues {
				allowed = append(allowed, "…")
				break
			}
			allowed = append(allowed, stringify(enumValue))
		}
		addDriftFinding(res, DriftFinding{
			Path: path, Type: DriftEnumViolation,
			Actual: stringify(value), Enum: allowed,
		})
		if res.Truncated {
			return
		}
	}

	types := schemaTypes(s)
	if value == nil {
		if s.Nullable || sliceContains(types, "null") || len(types) == 0 {
			return
		}
		addDriftFinding(res, DriftFinding{
			Path: path, Type: DriftTypeMismatch,
			Schema: strings.Join(types, " | "), Actual: "null",
		})
		return
	}

	matchedType := ""
	for _, candidate := range types {
		if schemaTypeMatchesValue(candidate, value) {
			matchedType = candidate
			break
		}
	}
	if len(types) > 0 && matchedType == "" {
		addDriftFinding(res, DriftFinding{
			Path: path, Type: DriftTypeMismatch,
			Schema: strings.Join(types, " | "), Actual: typeOf(value),
		})
		return
	}
	compareValueConstraints(s, path, value, res)
	if res.Truncated {
		return
	}

	switch matchedType {
	case "object":
		obj, ok := value.(map[string]interface{})
		if !ok {
			return
		}
		propertyNames := make([]string, 0, len(s.Properties))
		for name := range s.Properties {
			propertyNames = append(propertyNames, name)
		}
		sort.Strings(propertyNames)
		for _, name := range propertyNames {
			prop := s.Properties[name]
			subPath := path + "." + name
			if prop == nil || prop.Value == nil {
				continue
			}
			actual, exists := obj[name]
			if !exists {
				if !sliceContains(s.Required, name) {
					continue
				}
				addDriftFinding(res, DriftFinding{Path: subPath, Type: DriftMissing, Schema: schemaTypeStr(prop.Value), Actual: ""})
				if res.Truncated {
					return
				}
				continue
			}
			t.compareSchemaToValue(prop.Value, subPath, actual, t.newValueID(), depth+1, res)
			if res.Truncated {
				return
			}
		}
		objectNames := make([]string, 0, len(obj))
		for name := range obj {
			objectNames = append(objectNames, name)
		}
		sort.Strings(objectNames)
		for _, name := range objectNames {
			actual := obj[name]
			if s.Properties[name] != nil {
				continue
			}
			if additional := s.AdditionalProperties.Schema; additional != nil && additional.Value != nil {
				t.compareSchemaToValue(additional.Value, path+"."+name, actual, t.newValueID(), depth+1, res)
				if res.Truncated {
					return
				}
				continue
			}
			if allowed := s.AdditionalProperties.Has; allowed != nil && !*allowed {
				addDriftFinding(res, DriftFinding{Path: path + "." + name, Type: DriftExtra, Actual: typeOf(obj[name])})
				if res.Truncated {
					return
				}
			}
		}
	case "array":
		arr, ok := value.([]interface{})
		if !ok {
			return
		}
		itemSchema := s.Items
		if itemSchema != nil && itemSchema.Value != nil {
			for i, item := range arr {
				t.compareSchemaToValue(itemSchema.Value, path+"["+strconv.Itoa(i)+"]", item, t.newValueID(), depth+1, res)
				if res.Truncated {
					return
				}
			}
		}
	}
}

func (t *driftTraversal) enter(visit driftVisit, depth int, res *DriftResult) bool {
	if depth >= maxDriftTraversalDepth {
		markDriftTruncated(res)
		return false
	}
	if t.exhausted || t.nodes >= maxDriftTraversalNodes {
		t.exhausted = true
		markDriftTruncated(res)
		return false
	}
	if _, exists := t.active[visit]; exists {
		markDriftTruncated(res)
		return false
	}
	t.nodes++
	t.active[visit] = struct{}{}
	return true
}

func (t *driftTraversal) newValueID() driftValueID {
	t.nextValueID++
	return t.nextValueID
}

func markDriftTruncated(res *DriftResult) {
	res.OK = false
	res.Truncated = true
}

func compareValueConstraints(s *openapi3.Schema, path string, value any, res *DriftResult) {
	if actual, ok := numberAsRat(value); ok {
		compareNumericConstraints(s, path, value, actual, res)
	}
	switch actual := value.(type) {
	case string:
		length := uint64(utf8.RuneCountInString(actual))
		if length < s.MinLength {
			addConstraintFinding(res, path, fmt.Sprintf("minLength %d", s.MinLength), strconv.FormatUint(length, 10))
		}
		if s.MaxLength != nil && length > *s.MaxLength {
			addConstraintFinding(res, path, fmt.Sprintf("maxLength %d", *s.MaxLength), strconv.FormatUint(length, 10))
		}
		if s.Pattern != "" {
			if pattern, err := regexp.Compile(s.Pattern); err == nil && !pattern.MatchString(actual) {
				addConstraintFinding(res, path, "pattern "+s.Pattern, actual)
			}
		}
		if valid, supported := matchesStringFormat(s.Format, actual); supported && !valid {
			addConstraintFinding(res, path, "format "+s.Format, actual)
		}
	case []interface{}:
		length := uint64(len(actual))
		if length < s.MinItems {
			addConstraintFinding(res, path, fmt.Sprintf("minItems %d", s.MinItems), strconv.FormatUint(length, 10))
		}
		if s.MaxItems != nil && length > *s.MaxItems {
			addConstraintFinding(res, path, fmt.Sprintf("maxItems %d", *s.MaxItems), strconv.FormatUint(length, 10))
		}
		if s.UniqueItems {
			seen := make(map[string]struct{}, len(actual))
			for _, item := range actual {
				key := canonicalJSONValue(item)
				if _, exists := seen[key]; exists {
					addConstraintFinding(res, path, "uniqueItems true", "duplicate array item")
					break
				}
				seen[key] = struct{}{}
			}
		}
	case map[string]interface{}:
		count := uint64(len(actual))
		if count < s.MinProps {
			addConstraintFinding(res, path, fmt.Sprintf("minProperties %d", s.MinProps), strconv.FormatUint(count, 10))
		}
		if s.MaxProps != nil && count > *s.MaxProps {
			addConstraintFinding(res, path, fmt.Sprintf("maxProperties %d", *s.MaxProps), strconv.FormatUint(count, 10))
		}
	}
}

func compareNumericConstraints(s *openapi3.Schema, path string, value any, actual *big.Rat, res *DriftResult) {
	if s.Min != nil {
		minimum, ok := numberAsRat(*s.Min)
		if ok {
			comparison := actual.Cmp(minimum)
			if comparison < 0 || (comparison == 0 && s.ExclusiveMin) {
				operator := ">="
				if s.ExclusiveMin {
					operator = ">"
				}
				addConstraintFinding(res, path, "number "+operator+" "+stringify(*s.Min), stringify(value))
			}
		}
	}
	if s.Max != nil {
		maximum, ok := numberAsRat(*s.Max)
		if ok {
			comparison := actual.Cmp(maximum)
			if comparison > 0 || (comparison == 0 && s.ExclusiveMax) {
				operator := "<="
				if s.ExclusiveMax {
					operator = "<"
				}
				addConstraintFinding(res, path, "number "+operator+" "+stringify(*s.Max), stringify(value))
			}
		}
	}
	if s.MultipleOf != nil {
		multiple, ok := numberAsRat(*s.MultipleOf)
		if ok && multiple.Sign() != 0 {
			quotient := new(big.Rat).Quo(actual, multiple)
			if !quotient.IsInt() {
				addConstraintFinding(res, path, "multipleOf "+stringify(*s.MultipleOf), stringify(value))
			}
		}
	}
}

func addConstraintFinding(res *DriftResult, path, expected, actual string) {
	addDriftFinding(res, DriftFinding{
		Path: path, Type: DriftTypeMismatch,
		Schema: expected, Actual: actual,
	})
}

var uuidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func matchesStringFormat(format, value string) (bool, bool) {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "":
		return true, false
	case "date":
		_, err := time.Parse("2006-01-02", value)
		return err == nil, true
	case "date-time":
		_, err := time.Parse(time.RFC3339, value)
		return err == nil, true
	case "uuid":
		return uuidPattern.MatchString(value), true
	case "email":
		address, err := mail.ParseAddress(value)
		return err == nil && address.Name == "" && address.Address == value, true
	case "ipv4":
		ip := net.ParseIP(value)
		return ip != nil && strings.Contains(value, ".") && ip.To4() != nil, true
	case "ipv6":
		ip := net.ParseIP(value)
		return ip != nil && strings.Contains(value, ":") && ip.To4() == nil, true
	case "uri":
		parsed, err := url.ParseRequestURI(value)
		return err == nil && parsed.IsAbs(), true
	case "uri-reference":
		_, err := url.Parse(value)
		return err == nil, true
	case "byte":
		_, err := base64.StdEncoding.DecodeString(value)
		return err == nil, true
	default:
		return true, false
	}
}

func canonicalJSONValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return "null"
	case bool:
		return "bool:" + strconv.FormatBool(typed)
	case string:
		return "string:" + strconv.Quote(typed)
	case json.Number:
		if number, ok := numberAsRat(typed); ok {
			return "number:" + number.RatString()
		}
		return "number:" + typed.String()
	case []interface{}:
		var builder strings.Builder
		builder.WriteString("array:[")
		for _, item := range typed {
			value := canonicalJSONValue(item)
			builder.WriteString(strconv.Itoa(len(value)))
			builder.WriteByte(':')
			builder.WriteString(value)
		}
		builder.WriteByte(']')
		return builder.String()
	case map[string]interface{}:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		var builder strings.Builder
		builder.WriteString("object:{")
		for _, key := range keys {
			value := canonicalJSONValue(typed[key])
			builder.WriteString(strconv.Quote(key))
			builder.WriteByte(':')
			builder.WriteString(strconv.Itoa(len(value)))
			builder.WriteByte(':')
			builder.WriteString(value)
		}
		builder.WriteByte('}')
		return builder.String()
	default:
		return typeOf(value) + ":" + stringify(value)
	}
}

func schemaTypeMatchesValue(schemaType string, value interface{}) bool {
	switch schemaType {
	case "object":
		_, ok := value.(map[string]interface{})
		return ok
	case "array":
		_, ok := value.([]interface{})
		return ok
	case "string":
		_, ok := value.(string)
		return ok
	case "number":
		return isNumber(value)
	case "integer":
		return isIntegerNumber(value)
	case "boolean":
		_, ok := value.(bool)
		return ok
	case "null":
		return value == nil
	default:
		return false
	}
}

func addDriftFinding(res *DriftResult, finding DriftFinding) bool {
	res.OK = false
	if len(res.Findings) >= maxDriftFindings {
		res.Truncated = true
		return false
	}
	finding.Path = truncateDriftText(finding.Path)
	finding.Schema = truncateDriftText(finding.Schema)
	finding.Actual = truncateDriftText(finding.Actual)
	if len(finding.Enum) > maxDriftEnumValues+1 {
		finding.Enum = append(
			append([]string{}, finding.Enum[:maxDriftEnumValues]...),
			"…",
		)
	}
	findingBytes := len(finding.Path) + len(finding.Schema) + len(finding.Actual)
	for index := range finding.Enum {
		finding.Enum[index] = truncateDriftText(finding.Enum[index])
		findingBytes += len(finding.Enum[index])
	}
	if res.findingBytes+findingBytes > maxDriftFindingBytes {
		res.Truncated = true
		return false
	}
	res.findingBytes += findingBytes
	res.Findings = append(res.Findings, finding)
	return true
}

func (t *driftTraversal) compareSchemaAlternatives(
	kind string,
	alternatives openapi3.SchemaRefs,
	path string,
	value interface{},
	valueID driftValueID,
	depth int,
	res *DriftResult,
) {
	if len(alternatives) == 0 {
		return
	}
	matches := 0
	unresolved := false
	var best *DriftResult
	for _, schemaRef := range alternatives {
		if schemaRef == nil || schemaRef.Value == nil {
			continue
		}
		candidate := DriftResult{OK: true}
		t.compareSchemaToValue(schemaRef.Value, path, value, valueID, depth, &candidate)
		if candidate.Truncated {
			unresolved = true
			if len(candidate.Findings) > 0 &&
				(best == nil || len(candidate.Findings) < len(best.Findings)) {
				copy := candidate
				best = &copy
			}
			if t.exhausted {
				appendDriftFindings(res, best)
				markDriftTruncated(res)
				return
			}
			continue
		}
		if candidate.OK {
			matches++
			if kind == "anyOf" {
				return
			}
			continue
		}
		if best == nil || len(candidate.Findings) < len(best.Findings) {
			copy := candidate
			best = &copy
		}
	}
	if kind == "anyOf" && matches > 0 {
		return
	}
	if kind == "oneOf" && matches > 1 {
		addDriftFinding(res, DriftFinding{
			Path: path, Type: DriftTypeMismatch,
			Schema: "exactly one oneOf schema",
			Actual: strconv.Itoa(matches) + " schemas matched",
		})
		return
	}
	if unresolved {
		appendDriftFindings(res, best)
		markDriftTruncated(res)
		return
	}
	if kind == "oneOf" && matches == 1 {
		return
	}
	if best != nil {
		appendDriftFindings(res, best)
		if best.Truncated {
			res.Truncated = true
			res.OK = false
		}
		return
	}
	addDriftFinding(res, DriftFinding{
		Path: path, Type: DriftTypeMismatch,
		Schema: "a valid " + kind + " schema",
		Actual: typeOf(value),
	})
}

func appendDriftFindings(res *DriftResult, candidate *DriftResult) {
	if candidate == nil {
		return
	}
	for _, finding := range candidate.Findings {
		if !addDriftFinding(res, finding) {
			return
		}
	}
}

func typeOf(v interface{}) string {
	if v == nil {
		return "null"
	}
	if _, ok := v.(json.Number); ok {
		return "number"
	}
	return reflect.TypeOf(v).Kind().String()
}

func stringify(v interface{}) string {
	if s, ok := v.(string); ok {
		return truncateDriftText(s)
	}
	encoded, err := json.Marshal(v)
	if err != nil {
		return typeOf(v)
	}
	return truncateDriftText(string(encoded))
}

func truncateDriftText(value string) string {
	if len(value) <= maxDriftFindingText {
		return value
	}
	const suffix = "…"
	limit := maxDriftFindingText - len(suffix)
	for limit > 0 && !utf8.RuneStart(value[limit]) {
		limit--
	}
	return value[:limit] + suffix
}

func isNumber(v interface{}) bool {
	_, ok := numberAsRat(v)
	return ok
}

func isIntegerNumber(v interface{}) bool {
	number, ok := numberAsRat(v)
	if !ok {
		return false
	}
	return number.IsInt()
}

func enumContains(allowed []interface{}, actual interface{}) bool {
	for _, expected := range allowed {
		if reflect.DeepEqual(expected, actual) {
			return true
		}
		if isNumber(expected) && isNumber(actual) {
			expectedNumber, expectedOK := numberAsRat(expected)
			actualNumber, actualOK := numberAsRat(actual)
			if expectedOK && actualOK && expectedNumber.Cmp(actualNumber) == 0 {
				return true
			}
		}
	}
	return false
}

func numberAsRat(value interface{}) (*big.Rat, bool) {
	var encoded string
	switch number := value.(type) {
	case json.Number:
		encoded = number.String()
	case float32:
		if math.IsNaN(float64(number)) || math.IsInf(float64(number), 0) {
			return nil, false
		}
		encoded = strconv.FormatFloat(float64(number), 'g', -1, 32)
	case float64:
		if math.IsNaN(number) || math.IsInf(number, 0) {
			return nil, false
		}
		encoded = strconv.FormatFloat(number, 'g', -1, 64)
	case int:
		encoded = strconv.FormatInt(int64(number), 10)
	case int8:
		encoded = strconv.FormatInt(int64(number), 10)
	case int16:
		encoded = strconv.FormatInt(int64(number), 10)
	case int32:
		encoded = strconv.FormatInt(int64(number), 10)
	case int64:
		encoded = strconv.FormatInt(number, 10)
	case uint:
		encoded = strconv.FormatUint(uint64(number), 10)
	case uint8:
		encoded = strconv.FormatUint(uint64(number), 10)
	case uint16:
		encoded = strconv.FormatUint(uint64(number), 10)
	case uint32:
		encoded = strconv.FormatUint(uint64(number), 10)
	case uint64:
		encoded = strconv.FormatUint(number, 10)
	default:
		return nil, false
	}
	result, ok := new(big.Rat).SetString(encoded)
	return result, ok
}

func sliceContains(s []string, x string) bool {
	for _, v := range s {
		if v == x {
			return true
		}
	}
	return false
}
