package jsonnumber

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
)

func TestRatAndEqualApplyExactBoundedPolicy(t *testing.T) {
	t.Parallel()
	limits := Limits{MaxBytes: 16, MaxAbsExponent: 8}
	tests := []struct {
		value any
		ok    bool
	}{
		{value: json.Number("1.25"), ok: true},
		{value: int64(42), ok: true},
		{value: math.Inf(1), ok: false},
		{value: json.Number("1e9"), ok: false},
		{value: json.Number(strings.Repeat("9", 17)), ok: false},
		{value: "1", ok: false},
	}
	for _, test := range tests {
		if _, ok := Rat(test.value, limits); ok != test.ok {
			t.Fatalf("Rat(%v) ok = %t, want %t", test.value, ok, test.ok)
		}
	}
	if !Equal(json.Number("1.0"), json.Number("1"), limits) {
		t.Fatal("equivalent JSON numbers were not equal")
	}
	if Equal(json.Number("1"), json.Number("2"), limits) {
		t.Fatal("different JSON numbers were equal")
	}
}
