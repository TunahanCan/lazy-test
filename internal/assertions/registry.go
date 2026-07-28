package assertions

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// expectedValueKind describes the assertion wire value required by one
// target/operator combination. It is intentionally internal: JSON callers keep
// using Assertion while this registry owns the compatibility rules.
type expectedValueKind uint8

const (
	expectedValueAny expectedValueKind = iota
	expectedValueString
	expectedValueNumber
)

type assertionTargetDefinition struct {
	read             func(*assertionEvaluator, Assertion) (any, bool, error)
	validatePath     func(string) error
	expectedValueFor map[Operator]expectedValueKind
}

type assertionOperatorDefinition struct {
	compare          func(actual any, exists bool, expected any) (bool, error)
	validateExpected func(any) error
}

// assertionTargets and assertionOperators are the two compile-time extension
// points for this package. A new target declares how to read a value and which
// operators it accepts; a new operator declares only its comparison behavior.
// Keeping the axes separate prevents validation and execution switches from
// drifting apart.
var assertionTargets = map[Target]assertionTargetDefinition{
	TargetStatus: {
		read: readStatus,
		expectedValueFor: map[Operator]expectedValueKind{
			OperatorEquals:      expectedValueNumber,
			OperatorNotEquals:   expectedValueNumber,
			OperatorLessThan:    expectedValueNumber,
			OperatorGreaterThan: expectedValueNumber,
		},
	},
	TargetHeader: {
		read:         readHeader,
		validatePath: validateHeaderName,
		expectedValueFor: map[Operator]expectedValueKind{
			OperatorEquals:    expectedValueString,
			OperatorNotEquals: expectedValueString,
			OperatorContains:  expectedValueString,
			OperatorExists:    expectedValueAny,
			OperatorNotExists: expectedValueAny,
			OperatorMatches:   expectedValueString,
		},
	},
	TargetBody: {
		read: readBody,
		expectedValueFor: map[Operator]expectedValueKind{
			OperatorEquals:    expectedValueString,
			OperatorNotEquals: expectedValueString,
			OperatorContains:  expectedValueString,
			OperatorExists:    expectedValueAny,
			OperatorNotExists: expectedValueAny,
			OperatorMatches:   expectedValueString,
		},
	},
	TargetJSONPath: {
		read:         readJSONPath,
		validatePath: validateJSONPath,
		expectedValueFor: map[Operator]expectedValueKind{
			OperatorEquals:      expectedValueAny,
			OperatorNotEquals:   expectedValueAny,
			OperatorContains:    expectedValueAny,
			OperatorExists:      expectedValueAny,
			OperatorNotExists:   expectedValueAny,
			OperatorLessThan:    expectedValueNumber,
			OperatorGreaterThan: expectedValueNumber,
			OperatorMatches:     expectedValueString,
		},
	},
	TargetDurationMS: {
		read: readDurationMilliseconds,
		expectedValueFor: map[Operator]expectedValueKind{
			OperatorEquals:      expectedValueNumber,
			OperatorNotEquals:   expectedValueNumber,
			OperatorLessThan:    expectedValueNumber,
			OperatorGreaterThan: expectedValueNumber,
		},
	},
}

var assertionOperators = map[Operator]assertionOperatorDefinition{
	OperatorEquals: {
		compare: func(actual any, _ bool, expected any) (bool, error) {
			return valuesEqual(actual, expected), nil
		},
	},
	OperatorNotEquals: {
		compare: func(actual any, _ bool, expected any) (bool, error) {
			return !valuesEqual(actual, expected), nil
		},
	},
	OperatorContains: {
		compare: func(actual any, _ bool, expected any) (bool, error) {
			return contains(actual, expected)
		},
	},
	OperatorExists: {
		compare: func(_ any, exists bool, _ any) (bool, error) {
			return exists, nil
		},
	},
	OperatorNotExists: {
		compare: func(_ any, exists bool, _ any) (bool, error) {
			return !exists, nil
		},
	},
	OperatorLessThan: {
		compare: numericComparator(-1),
	},
	OperatorGreaterThan: {
		compare: numericComparator(1),
	},
	OperatorMatches: {
		compare:          matchRegularExpression,
		validateExpected: validateRegularExpression,
	},
}

var _ = mustValidateAssertionDefinitions(
	assertionTargets,
	assertionOperators,
)

func mustValidateAssertionDefinitions(
	targets map[Target]assertionTargetDefinition,
	operators map[Operator]assertionOperatorDefinition,
) struct{} {
	if err := validateAssertionDefinitions(targets, operators); err != nil {
		panic("invalid assertion strategy registry: " + err.Error())
	}
	return struct{}{}
}

func validateAssertionDefinitions(
	targets map[Target]assertionTargetDefinition,
	operators map[Operator]assertionOperatorDefinition,
) error {
	if len(targets) == 0 {
		return fmt.Errorf("no assertion targets are registered")
	}
	if len(operators) == 0 {
		return fmt.Errorf("no assertion operators are registered")
	}
	for operator, definition := range operators {
		name := string(operator)
		if strings.TrimSpace(name) == "" || name != strings.TrimSpace(name) {
			return fmt.Errorf("assertion operator %q has an invalid name", operator)
		}
		if definition.compare == nil {
			return fmt.Errorf("assertion operator %q has no comparator", operator)
		}
	}
	for target, definition := range targets {
		name := string(target)
		if strings.TrimSpace(name) == "" || name != strings.TrimSpace(name) {
			return fmt.Errorf("assertion target %q has an invalid name", target)
		}
		if definition.read == nil {
			return fmt.Errorf("assertion target %q has no reader", target)
		}
		if len(definition.expectedValueFor) == 0 {
			return fmt.Errorf("assertion target %q accepts no operators", target)
		}
		for operator, expectedKind := range definition.expectedValueFor {
			if _, ok := operators[operator]; !ok {
				return fmt.Errorf(
					"assertion target %q references unknown operator %q",
					target,
					operator,
				)
			}
			switch expectedKind {
			case expectedValueAny,
				expectedValueString,
				expectedValueNumber:
			default:
				return fmt.Errorf(
					"assertion target %q has an invalid expected-value policy for operator %q",
					target,
					operator,
				)
			}
		}
	}
	return nil
}

func validateExpectedValue(
	assertion Assertion,
	kind expectedValueKind,
) error {
	switch kind {
	case expectedValueAny:
		return nil
	case expectedValueString:
		if _, ok := assertion.Expected.(string); !ok {
			return fmt.Errorf(
				"operator %q on target %q requires a string expected value",
				assertion.Operator,
				assertion.Target,
			)
		}
		return nil
	case expectedValueNumber:
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
			"operator %q has an invalid expected-value policy",
			assertion.Operator,
		)
	}
}

func validateJSONPath(path string) error {
	_, err := parseJSONPath(path)
	return err
}

func readStatus(
	evaluator *assertionEvaluator,
	_ Assertion,
) (any, bool, error) {
	return evaluator.input.StatusCode, true, nil
}

func readHeader(
	evaluator *assertionEvaluator,
	assertion Assertion,
) (any, bool, error) {
	values := caseInsensitiveHeaderValues(
		evaluator.input.Headers,
		assertion.Path,
	)
	if len(values) == 0 {
		return nil, false, nil
	}
	return strings.Join(values, ", "), true, nil
}

func readBody(
	evaluator *assertionEvaluator,
	_ Assertion,
) (any, bool, error) {
	if !evaluator.bodyLoaded {
		evaluator.bodyLoaded = true
		evaluator.bodyValue = string(evaluator.input.Body)
	}
	return evaluator.bodyValue, len(evaluator.input.Body) > 0, nil
}

func readDurationMilliseconds(
	evaluator *assertionEvaluator,
	_ Assertion,
) (any, bool, error) {
	return float64(evaluator.input.Duration) / float64(time.Millisecond), true, nil
}

func readJSONPath(
	evaluator *assertionEvaluator,
	assertion Assertion,
) (any, bool, error) {
	if !evaluator.jsonLoaded {
		evaluator.jsonLoaded = true
		evaluator.jsonValue, evaluator.jsonErr = decodeJSON(evaluator.input.Body)
	}
	if evaluator.jsonErr != nil {
		return nil, false, evaluator.jsonErr
	}
	tokens, err := parseJSONPath(assertion.Path)
	if err != nil {
		return nil, false, err
	}
	value, exists := lookupJSONPath(evaluator.jsonValue, tokens)
	return value, exists, nil
}

func numericComparator(
	direction int,
) func(any, bool, any) (bool, error) {
	return func(actual any, _ bool, expected any) (bool, error) {
		comparison, err := compareNumeric(actual, expected)
		if err != nil {
			return false, err
		}
		if direction < 0 {
			return comparison < 0, nil
		}
		return comparison > 0, nil
	}
}

func validateRegularExpression(expected any) error {
	pattern, ok := expected.(string)
	if !ok {
		return fmt.Errorf("regular expression requires a string expected value")
	}
	if len(pattern) > maxRegexPatternBytes {
		return fmt.Errorf(
			"regular expression exceeds %d bytes",
			maxRegexPatternBytes,
		)
	}
	if _, err := regexp.Compile(pattern); err != nil {
		return fmt.Errorf("invalid regular expression: %w", err)
	}
	return nil
}

func matchRegularExpression(
	actual any,
	_ bool,
	expected any,
) (bool, error) {
	actualText, ok := actual.(string)
	if !ok {
		return false, fmt.Errorf(
			"operator %q requires an actual string value",
			OperatorMatches,
		)
	}
	if !utf8.ValidString(actualText) {
		return false, fmt.Errorf("regular expression input is not valid UTF-8")
	}
	if len(actualText) > maxRegexInputBytes {
		return false, fmt.Errorf(
			"regular expression input exceeds %d bytes",
			maxRegexInputBytes,
		)
	}
	pattern, _ := expected.(string)
	compiled, err := regexp.Compile(pattern)
	if err != nil {
		return false, fmt.Errorf("invalid regular expression: %w", err)
	}
	return compiled.MatchString(actualText), nil
}
