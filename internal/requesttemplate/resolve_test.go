package requesttemplate

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestResolveUsesPresentValuesAndSortsMissingNames(t *testing.T) {
	t.Parallel()

	resolved, missing, err := Resolve(
		"{{baseUrl}}/{{z}}/{{empty}}/{{z}}/{{a}}",
		map[string]string{
			"baseUrl": "https://example.test",
			"empty":   "",
		},
		Options{MaxBytes: 1_024},
	)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if resolved != "https://example.test/{{z}}//{{z}}/{{a}}" {
		t.Fatalf("Resolve() value = %q", resolved)
	}
	if !reflect.DeepEqual(missing, []string{"a", "z"}) {
		t.Fatalf("Resolve() missing = %#v", missing)
	}
}

func TestResolveAppliesAvailabilityPolicy(t *testing.T) {
	t.Parallel()

	resolved, missing, err := Resolve(
		"Bearer {{token}} / {{empty}}",
		map[string]string{"token": "masked", "empty": ""},
		Options{
			MaxBytes: 1_024,
			IsAvailable: func(_ string, value string, exists bool) bool {
				return exists && value != "" && value != "masked"
			},
		},
	)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if resolved != "Bearer {{token}} / {{empty}}" {
		t.Fatalf("Resolve() value = %q", resolved)
	}
	if !reflect.DeepEqual(missing, []string{"empty", "token"}) {
		t.Fatalf("Resolve() missing = %#v", missing)
	}
}

func TestResolveRejectsExpansionBeforeBuildingOversizedOutput(t *testing.T) {
	t.Parallel()

	resolved, missing, err := Resolve(
		"prefix-{{large}}",
		map[string]string{"large": strings.Repeat("x", 20)},
		Options{MaxBytes: 16},
	)
	if resolved != "" || missing != nil {
		t.Fatalf("Resolve() = (%q, %#v), want empty result", resolved, missing)
	}
	var limitError *LimitError
	if !errors.As(err, &limitError) {
		t.Fatalf("Resolve() error = %T %v, want *LimitError", err, err)
	}
	if limitError.MaxBytes != 16 || !limitError.AfterInterpolation {
		t.Fatalf("Resolve() limit error = %#v", limitError)
	}
	if err.Error() != "exceeds 16 bytes after variable interpolation" {
		t.Fatalf("Resolve() error = %q", err)
	}
}

func TestResolveRejectsAggregateGrowthFromSmallReplacements(t *testing.T) {
	t.Parallel()

	resolved, missing, err := Resolve(
		"{{a}}{{b}}{{c}}{{d}}{{e}}",
		map[string]string{
			"a": "1234",
			"b": "1234",
			"c": "1234",
			"d": "1234",
			"e": "1234",
		},
		Options{MaxBytes: 19},
	)
	if resolved != "" || missing != nil {
		t.Fatalf("Resolve() = (%q, %#v), want empty result", resolved, missing)
	}
	var limitError *LimitError
	if !errors.As(err, &limitError) || !limitError.AfterInterpolation {
		t.Fatalf("Resolve() error = %#v, want interpolation LimitError", err)
	}
}

func TestResolveRawAndExactByteLimits(t *testing.T) {
	t.Parallel()

	resolved, missing, err := Resolve(
		"{{value}}",
		map[string]string{"value": "1234"},
		Options{MaxBytes: 4},
	)
	if err != nil || resolved != "1234" || len(missing) != 0 {
		t.Fatalf("exact Resolve() = (%q, %#v, %v)", resolved, missing, err)
	}

	_, _, err = Resolve("12345", nil, Options{MaxBytes: 4})
	var limitError *LimitError
	if !errors.As(err, &limitError) || limitError.AfterInterpolation {
		t.Fatalf("raw Resolve() error = %#v", err)
	}
}

func TestResolveCanShrinkTemplateThatStartsAboveLimit(t *testing.T) {
	t.Parallel()

	resolved, missing, err := Resolve(
		"{{a}}{{b}}",
		map[string]string{"a": "1", "b": "2"},
		Options{MaxBytes: 2},
	)
	if err != nil || resolved != "12" || len(missing) != 0 {
		t.Fatalf("Resolve() = (%q, %#v, %v)", resolved, missing, err)
	}
}

func TestResolveRejectsNegativeLimit(t *testing.T) {
	t.Parallel()

	_, _, err := Resolve("value", nil, Options{MaxBytes: -1})
	if !errors.Is(err, ErrInvalidLimit) {
		t.Fatalf("Resolve() error = %v, want ErrInvalidLimit", err)
	}
}
