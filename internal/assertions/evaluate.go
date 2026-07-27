package assertions

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/big"
	"net/http"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	maxRegexPatternBytes  = 4 << 10
	maxRegexInputBytes    = 4 << 20
	maxJSONBodyBytes      = 16 << 20
	maxNumericValueBytes  = 4 << 10
	maxNumericExponent    = 4 << 10
	maxReportedValueBytes = 8 << 10
)

// Validate checks target, operator, path, and regular-expression syntax.
func Validate(assertion Assertion) error {
	switch assertion.Target {
	case TargetStatus, TargetHeader, TargetBody, TargetJSONPath, TargetDurationMS:
	default:
		return fmt.Errorf("unsupported assertion target %q", assertion.Target)
	}
	switch assertion.Operator {
	case OperatorEquals, OperatorNotEquals, OperatorContains, OperatorExists,
		OperatorNotExists, OperatorLessThan, OperatorGreaterThan, OperatorMatches:
	default:
		return fmt.Errorf("unsupported assertion operator %q", assertion.Operator)
	}

	switch assertion.Target {
	case TargetHeader:
		if err := validateHeaderName(assertion.Path); err != nil {
			return err
		}
	case TargetJSONPath:
		if _, err := parseJSONPath(assertion.Path); err != nil {
			return err
		}
	}

	if err := validateOperatorTarget(assertion); err != nil {
		return err
	}
	if assertion.Operator == OperatorMatches {
		pattern := assertion.Expected.(string)
		if len(pattern) > maxRegexPatternBytes {
			return fmt.Errorf("regular expression exceeds %d bytes", maxRegexPatternBytes)
		}
		if _, err := regexp.Compile(pattern); err != nil {
			return fmt.Errorf("invalid regular expression: %w", err)
		}
	}
	return nil
}

func validateOperatorTarget(assertion Assertion) error {
	switch assertion.Target {
	case TargetStatus, TargetDurationMS:
		switch assertion.Operator {
		case OperatorEquals, OperatorNotEquals, OperatorLessThan, OperatorGreaterThan:
			if _, ok := numericRat(assertion.Expected); !ok {
				return fmt.Errorf(
					"operator %q on target %q requires a numeric expected value",
					assertion.Operator,
					assertion.Target,
				)
			}
			return nil
		default:
			return fmt.Errorf(
				"operator %q is not supported for target %q",
				assertion.Operator,
				assertion.Target,
			)
		}
	case TargetHeader, TargetBody:
		switch assertion.Operator {
		case OperatorExists, OperatorNotExists:
			return nil
		case OperatorEquals, OperatorNotEquals, OperatorContains, OperatorMatches:
			if _, ok := assertion.Expected.(string); !ok {
				return fmt.Errorf(
					"operator %q on target %q requires a string expected value",
					assertion.Operator,
					assertion.Target,
				)
			}
			return nil
		default:
			return fmt.Errorf(
				"operator %q is not supported for target %q",
				assertion.Operator,
				assertion.Target,
			)
		}
	case TargetJSONPath:
		switch assertion.Operator {
		case OperatorLessThan, OperatorGreaterThan:
			if _, ok := numericRat(assertion.Expected); !ok {
				return fmt.Errorf(
					"operator %q on target %q requires a numeric expected value",
					assertion.Operator,
					assertion.Target,
				)
			}
		case OperatorMatches:
			if _, ok := assertion.Expected.(string); !ok {
				return fmt.Errorf(
					"operator %q on target %q requires a string expected value",
					assertion.Operator,
					assertion.Target,
				)
			}
		}
		return nil
	default:
		return fmt.Errorf("unsupported assertion target %q", assertion.Target)
	}
}

// Evaluate evaluates assertions in input order and always returns results in
// that same order.
func Evaluate(input Input, checks []Assertion) []Result {
	evaluator := assertionEvaluator{input: input}
	results := make([]Result, len(checks))
	for index, check := range checks {
		results[index] = evaluator.evaluate(check)
	}
	return results
}

type assertionEvaluator struct {
	input      Input
	bodyLoaded bool
	bodyValue  string
	jsonLoaded bool
	jsonValue  any
	jsonErr    error
}

func (e *assertionEvaluator) evaluate(assertion Assertion) Result {
	result := Result{Assertion: reportedAssertion(assertion)}
	if err := Validate(assertion); err != nil {
		result.Error = err.Error()
		return result
	}

	actual, exists, err := e.actual(assertion)
	if assertion.Operator == OperatorExists || assertion.Operator == OperatorNotExists {
		result.Actual = exists
	} else {
		result.Actual = reportedValue(actual)
	}
	if err != nil {
		result.Error = err.Error()
		return result
	}
	passed, err := compare(assertion.Operator, actual, exists, assertion.Expected)
	if err != nil {
		result.Error = err.Error()
		return result
	}
	result.Passed = passed
	if !passed {
		result.Message = comparisonMessage(assertion, actual, exists)
	}
	return result
}

func reportedAssertion(assertion Assertion) Assertion {
	assertion.Expected = reportedValue(assertion.Expected)
	return assertion
}

func (e *assertionEvaluator) actual(assertion Assertion) (any, bool, error) {
	switch assertion.Target {
	case TargetStatus:
		return e.input.StatusCode, true, nil
	case TargetHeader:
		values := caseInsensitiveHeaderValues(e.input.Headers, assertion.Path)
		if len(values) == 0 {
			return nil, false, nil
		}
		return strings.Join(values, ", "), true, nil
	case TargetBody:
		if !e.bodyLoaded {
			e.bodyLoaded = true
			e.bodyValue = string(e.input.Body)
		}
		return e.bodyValue, len(e.input.Body) > 0, nil
	case TargetDurationMS:
		return float64(e.input.Duration) / float64(timeMillisecond), true, nil
	case TargetJSONPath:
		if !e.jsonLoaded {
			e.jsonLoaded = true
			e.jsonValue, e.jsonErr = decodeJSON(e.input.Body)
		}
		if e.jsonErr != nil {
			return nil, false, e.jsonErr
		}
		tokens, err := parseJSONPath(assertion.Path)
		if err != nil {
			return nil, false, err
		}
		value, exists := lookupJSONPath(e.jsonValue, tokens)
		return value, exists, nil
	default:
		return nil, false, fmt.Errorf("unsupported assertion target %q", assertion.Target)
	}
}

const timeMillisecond = 1_000_000

func decodeJSON(body []byte) (any, error) {
	if len(body) > maxJSONBodyBytes {
		return nil, fmt.Errorf("JSON assertion body exceeds %d bytes", maxJSONBodyBytes)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, fmt.Errorf("decode assertion JSON: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("decode assertion JSON: multiple JSON values")
		}
		return nil, fmt.Errorf("decode assertion JSON: %w", err)
	}
	return value, nil
}

func compare(operator Operator, actual any, exists bool, expected any) (bool, error) {
	switch operator {
	case OperatorExists:
		return exists, nil
	case OperatorNotExists:
		return !exists, nil
	}
	if !exists {
		return false, nil
	}

	switch operator {
	case OperatorEquals:
		return valuesEqual(actual, expected), nil
	case OperatorNotEquals:
		return !valuesEqual(actual, expected), nil
	case OperatorContains:
		return contains(actual, expected)
	case OperatorLessThan, OperatorGreaterThan:
		comparison, err := compareNumeric(actual, expected)
		if err != nil {
			return false, err
		}
		if operator == OperatorLessThan {
			return comparison < 0, nil
		}
		return comparison > 0, nil
	case OperatorMatches:
		actualText, ok := actual.(string)
		if !ok {
			return false, fmt.Errorf("operator %q requires an actual string value", operator)
		}
		if !utf8.ValidString(actualText) {
			return false, fmt.Errorf("regular expression input is not valid UTF-8")
		}
		if len(actualText) > maxRegexInputBytes {
			return false, fmt.Errorf("regular expression input exceeds %d bytes", maxRegexInputBytes)
		}
		pattern, _ := expected.(string)
		compiled, err := regexp.Compile(pattern)
		if err != nil {
			return false, fmt.Errorf("invalid regular expression: %w", err)
		}
		return compiled.MatchString(actualText), nil
	default:
		return false, fmt.Errorf("unsupported assertion operator %q", operator)
	}
}

func contains(actual, expected any) (bool, error) {
	switch value := actual.(type) {
	case string:
		expectedText, ok := expected.(string)
		if !ok {
			return false, fmt.Errorf("contains on a string requires a string expected value")
		}
		return strings.Contains(value, expectedText), nil
	case []any:
		for _, item := range value {
			if valuesEqual(item, expected) {
				return true, nil
			}
		}
		return false, nil
	case map[string]any:
		key, ok := expected.(string)
		if !ok {
			return false, fmt.Errorf("contains on an object requires a string key")
		}
		_, exists := value[key]
		return exists, nil
	default:
		return false, fmt.Errorf("operator %q requires a string, array, or object value", OperatorContains)
	}
}

func valuesEqual(left, right any) bool {
	if comparison, err := compareNumeric(left, right); err == nil {
		return comparison == 0
	}
	switch leftValue := left.(type) {
	case []any:
		rightValue, ok := right.([]any)
		if !ok || len(leftValue) != len(rightValue) {
			return false
		}
		for index := range leftValue {
			if !valuesEqual(leftValue[index], rightValue[index]) {
				return false
			}
		}
		return true
	case map[string]any:
		rightValue, ok := right.(map[string]any)
		if !ok || len(leftValue) != len(rightValue) {
			return false
		}
		for key, value := range leftValue {
			other, exists := rightValue[key]
			if !exists || !valuesEqual(value, other) {
				return false
			}
		}
		return true
	default:
		return reflect.DeepEqual(left, right)
	}
}

func compareNumeric(left, right any) (int, error) {
	leftNumber, leftOK := numericRat(left)
	rightNumber, rightOK := numericRat(right)
	if !leftOK || !rightOK {
		return 0, fmt.Errorf("numeric comparison requires numeric actual and expected values")
	}
	return leftNumber.Cmp(rightNumber), nil
}

func numericRat(value any) (*big.Rat, bool) {
	var encoded string
	switch number := value.(type) {
	case json.Number:
		encoded = number.String()
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
	default:
		return nil, false
	}
	if len(encoded) > maxNumericValueBytes || !numericExponentAllowed(encoded) {
		return nil, false
	}
	result := new(big.Rat)
	if _, ok := result.SetString(encoded); !ok {
		return nil, false
	}
	return result, true
}

func numericExponentAllowed(value string) bool {
	index := strings.LastIndexAny(value, "eE")
	if index < 0 {
		return true
	}
	exponent, err := strconv.ParseInt(value[index+1:], 10, 32)
	if err != nil {
		return false
	}
	return exponent >= -maxNumericExponent && exponent <= maxNumericExponent
}

func caseInsensitiveHeaderValues(headers http.Header, name string) []string {
	keys := make([]string, 0, len(headers))
	for key := range headers {
		if strings.EqualFold(key, name) {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	var values []string
	for _, key := range keys {
		values = append(values, headers[key]...)
	}
	return values
}

func validateHeaderName(name string) error {
	if name == "" {
		return fmt.Errorf("header assertion path is required")
	}
	for _, character := range name {
		if !isHTTPTokenRune(character) {
			return fmt.Errorf("invalid header assertion path %q", name)
		}
	}
	return nil
}

func isHTTPTokenRune(character rune) bool {
	if character >= 'a' && character <= 'z' ||
		character >= 'A' && character <= 'Z' ||
		character >= '0' && character <= '9' {
		return true
	}
	return strings.ContainsRune("!#$%&'*+-.^_`|~", character)
}

func comparisonMessage(assertion Assertion, actual any, exists bool) string {
	if !exists {
		return fmt.Sprintf("%s %q does not exist", assertion.Target, assertion.Path)
	}
	return fmt.Sprintf(
		"expected %s %s %s, got %s",
		assertion.Target,
		assertion.Operator,
		formatValue(assertion.Expected),
		formatValue(actual),
	)
}

func formatValue(value any) string {
	switch typed := reportedValue(value).(type) {
	case string:
		encoded, err := json.Marshal(typed)
		if err == nil {
			return string(encoded)
		}
		return typed
	case nil:
		return "null"
	default:
		value = typed
	}
	encoded, err := json.Marshal(value)
	if err == nil {
		return string(encoded)
	}
	return fmt.Sprintf("%v", value)
}

func reportedValue(value any) any {
	switch typed := value.(type) {
	case string:
		return truncateReportedText(typed)
	case json.Number:
		return truncateReportedText(typed.String())
	case []any:
		return fmt.Sprintf("<array: %d items>", len(typed))
	case map[string]any:
		return fmt.Sprintf("<object: %d keys>", len(typed))
	default:
		return value
	}
}

func truncateReportedText(value string) string {
	if len(value) <= maxReportedValueBytes {
		return value
	}
	const suffix = "… <truncated>"
	limit := maxReportedValueBytes - len(suffix)
	for limit > 0 && !utf8.RuneStart(value[limit]) {
		limit--
	}
	return value[:limit] + suffix
}
