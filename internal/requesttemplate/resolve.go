// Package requesttemplate resolves request variables without allowing
// substitutions to grow an output beyond its caller-owned byte limit.
package requesttemplate

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

var variablePattern = regexp.MustCompile(`\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}`)

// ErrInvalidLimit reports a programming error in a resolver configuration.
var ErrInvalidLimit = errors.New("request template size limit is invalid")

// AvailabilityPolicy decides whether a variable value may be substituted.
// Callers can use this strategy to retain domain-specific handling for empty
// or masked values. A nil policy treats every present map entry as available.
type AvailabilityPolicy func(name, value string, exists bool) bool

// Options configures one bounded resolution operation.
type Options struct {
	MaxBytes    int64
	IsAvailable AvailabilityPolicy
}

// LimitError reports that a resolved value would exceed the configured limit.
// AfterInterpolation distinguishes a raw oversized value from substitution
// growth so callers can retain precise user-facing failures.
type LimitError struct {
	MaxBytes           int64
	AfterInterpolation bool
}

func (e *LimitError) Error() string {
	if e.AfterInterpolation {
		return fmt.Sprintf("exceeds %d bytes after variable interpolation", e.MaxBytes)
	}
	return fmt.Sprintf("exceeds %d bytes", e.MaxBytes)
}

// Resolve substitutes {{name}} placeholders and returns unresolved variable
// names in stable order. It checks each write before appending, so rejected
// expansions never allocate the oversized output.
func Resolve(
	value string,
	variables map[string]string,
	options Options,
) (string, []string, error) {
	if options.MaxBytes < 0 {
		return "", nil, ErrInvalidLimit
	}

	match := variablePattern.FindStringSubmatchIndex(value)
	if match == nil {
		if int64(len(value)) > options.MaxBytes {
			return "", nil, &LimitError{MaxBytes: options.MaxBytes}
		}
		return value, nil, nil
	}

	var builder strings.Builder
	if int64(len(value)) <= options.MaxBytes {
		builder.Grow(len(value))
	}
	missingSet := make(map[string]struct{})
	cursor := 0
	for match != nil {
		matchStart := cursor + match[0]
		matchEnd := cursor + match[1]
		nameStart := cursor + match[2]
		nameEnd := cursor + match[3]
		name := value[nameStart:nameEnd]
		replacement, exists := variables[name]
		available := exists
		if options.IsAvailable != nil {
			available = options.IsAvailable(name, replacement, exists)
		}
		if !available {
			missingSet[name] = struct{}{}
			replacement = value[matchStart:matchEnd]
		}

		if writeExceedsLimit(builder.Len(), matchStart-cursor, options.MaxBytes) {
			return "", nil, &LimitError{
				MaxBytes:           options.MaxBytes,
				AfterInterpolation: true,
			}
		}
		builder.WriteString(value[cursor:matchStart])
		if writeExceedsLimit(builder.Len(), len(replacement), options.MaxBytes) {
			return "", nil, &LimitError{
				MaxBytes:           options.MaxBytes,
				AfterInterpolation: true,
			}
		}
		builder.WriteString(replacement)
		cursor = matchEnd
		match = variablePattern.FindStringSubmatchIndex(value[cursor:])
	}

	if writeExceedsLimit(builder.Len(), len(value)-cursor, options.MaxBytes) {
		return "", nil, &LimitError{
			MaxBytes:           options.MaxBytes,
			AfterInterpolation: true,
		}
	}
	builder.WriteString(value[cursor:])

	missing := make([]string, 0, len(missingSet))
	for name := range missingSet {
		missing = append(missing, name)
	}
	sort.Strings(missing)
	return builder.String(), missing, nil
}

func writeExceedsLimit(current, additional int, maxBytes int64) bool {
	currentBytes := int64(current)
	additionalBytes := int64(additional)
	return currentBytes > maxBytes || additionalBytes > maxBytes-currentBytes
}
