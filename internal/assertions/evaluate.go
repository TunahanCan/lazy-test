package assertions

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"reflect"
	"sort"
	"strings"
	"unicode/utf8"

	"validex/internal/jsonnumber"
)

const (
	maxRegexPatternBytes  = 4 << 10
	maxRegexInputBytes    = 4 << 20
	maxJSONBodyBytes      = 16 << 20
	maxNumericValueBytes  = 4 << 10
	maxNumericExponent    = 4 << 10
	maxReportedValueBytes = 8 << 10
	maxEqualityDepth      = 256
	maxEqualityNodes      = 10_000
)

// Validate checks target, operator, path, and regular-expression syntax.
func Validate(assertion Assertion) error {
	target, targetSupported := assertionTargets[assertion.Target]
	if !targetSupported {
		return fmt.Errorf("unsupported assertion target %q", assertion.Target)
	}
	operator, operatorSupported := assertionOperators[assertion.Operator]
	if !operatorSupported {
		return fmt.Errorf("unsupported assertion operator %q", assertion.Operator)
	}
	if target.validatePath != nil {
		if err := target.validatePath(assertion.Path); err != nil {
			return err
		}
	}
	expectedKind, supportedCombination :=
		target.expectedValueFor[assertion.Operator]
	if !supportedCombination {
		return fmt.Errorf(
			"operator %q is not supported for target %q",
			assertion.Operator,
			assertion.Target,
		)
	}
	if err := validateExpectedValue(assertion, expectedKind); err != nil {
		return err
	}
	if operator.validateExpected != nil {
		return operator.validateExpected(assertion.Expected)
	}
	return nil
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
	result.Exists = exists
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
	target, ok := assertionTargets[assertion.Target]
	if !ok || target.read == nil {
		return nil, false, fmt.Errorf("unsupported assertion target %q", assertion.Target)
	}
	return target.read(e, assertion)
}

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
	definition, ok := assertionOperators[operator]
	if !ok || definition.compare == nil {
		return false, fmt.Errorf("unsupported assertion operator %q", operator)
	}
	if !exists &&
		operator != OperatorExists &&
		operator != OperatorNotExists {
		return false, nil
	}
	return definition.compare(actual, exists, expected)
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
	return valuesEqualWithBudget(
		left,
		right,
		0,
		&equalityBudget{},
	)
}

type equalityBudget struct {
	nodes int
}

func valuesEqualWithBudget(
	left, right any,
	depth int,
	budget *equalityBudget,
) bool {
	if budget == nil || depth > maxEqualityDepth ||
		budget.nodes >= maxEqualityNodes {
		return false
	}
	budget.nodes++
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
			if !valuesEqualWithBudget(
				leftValue[index],
				rightValue[index],
				depth+1,
				budget,
			) {
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
			if !exists || !valuesEqualWithBudget(
				value,
				other,
				depth+1,
				budget,
			) {
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
	return jsonnumber.Rat(value, jsonnumber.Limits{
		MaxBytes:       maxNumericValueBytes,
		MaxAbsExponent: maxNumericExponent,
	})
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
