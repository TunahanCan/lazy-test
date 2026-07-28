// Package jsonnumber provides bounded, exact numeric conversion for decoded
// JSON values and Go numeric primitives.
package jsonnumber

import (
	"encoding/json"
	"math"
	"math/big"
	"strconv"
	"strings"
)

const (
	DefaultMaxBytes       = 4 << 10
	DefaultMaxAbsExponent = int64(4 << 10)
)

// Limits bounds the work performed by big.Rat parsing. Zero and negative
// values use conservative defaults.
type Limits struct {
	MaxBytes       int
	MaxAbsExponent int64
}

// Rat converts a supported number into an exact rational value within limits.
func Rat(value any, limits Limits) (*big.Rat, bool) {
	limits = normalizeLimits(limits)
	encoded, ok := encode(value)
	if !ok || len(encoded) > limits.MaxBytes ||
		!exponentAllowed(encoded, limits.MaxAbsExponent) {
		return nil, false
	}
	result := new(big.Rat)
	if _, ok := result.SetString(encoded); !ok {
		return nil, false
	}
	return result, true
}

// Equal compares two numeric values exactly. Unsupported or out-of-budget
// values are not equal.
func Equal(left, right any, limits Limits) bool {
	leftNumber, leftOK := Rat(left, limits)
	rightNumber, rightOK := Rat(right, limits)
	return leftOK && rightOK && leftNumber.Cmp(rightNumber) == 0
}

func normalizeLimits(limits Limits) Limits {
	if limits.MaxBytes <= 0 {
		limits.MaxBytes = DefaultMaxBytes
	}
	if limits.MaxAbsExponent <= 0 {
		limits.MaxAbsExponent = DefaultMaxAbsExponent
	}
	return limits
}

func encode(value any) (string, bool) {
	switch number := value.(type) {
	case json.Number:
		return number.String(), true
	case int:
		return strconv.FormatInt(int64(number), 10), true
	case int8:
		return strconv.FormatInt(int64(number), 10), true
	case int16:
		return strconv.FormatInt(int64(number), 10), true
	case int32:
		return strconv.FormatInt(int64(number), 10), true
	case int64:
		return strconv.FormatInt(number, 10), true
	case uint:
		return strconv.FormatUint(uint64(number), 10), true
	case uint8:
		return strconv.FormatUint(uint64(number), 10), true
	case uint16:
		return strconv.FormatUint(uint64(number), 10), true
	case uint32:
		return strconv.FormatUint(uint64(number), 10), true
	case uint64:
		return strconv.FormatUint(number, 10), true
	case float32:
		if math.IsNaN(float64(number)) || math.IsInf(float64(number), 0) {
			return "", false
		}
		return strconv.FormatFloat(float64(number), 'g', -1, 32), true
	case float64:
		if math.IsNaN(number) || math.IsInf(number, 0) {
			return "", false
		}
		return strconv.FormatFloat(number, 'g', -1, 64), true
	default:
		return "", false
	}
}

func exponentAllowed(value string, maximum int64) bool {
	index := strings.LastIndexAny(value, "eE")
	if index < 0 {
		return true
	}
	exponent, err := strconv.ParseInt(value[index+1:], 10, 32)
	if err != nil {
		return false
	}
	return exponent >= -maximum && exponent <= maximum
}
