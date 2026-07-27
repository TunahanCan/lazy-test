package assertions

import (
	"fmt"
	"strconv"
	"strings"
)

const (
	maxJSONPathBytes    = 4 << 10
	maxJSONPathSegments = 128
	maxJSONPathIndex    = 1_000_000_000
)

type jsonPathToken struct {
	key     string
	index   int
	isIndex bool
}

func parseJSONPath(raw string) ([]jsonPathToken, error) {
	path := strings.TrimSpace(raw)
	if path == "" {
		return nil, fmt.Errorf("JSON path is required")
	}
	if len(path) > maxJSONPathBytes {
		return nil, fmt.Errorf("JSON path exceeds %d bytes", maxJSONPathBytes)
	}

	index := 0
	if path[0] == '$' {
		index++
		if index == len(path) {
			return []jsonPathToken{}, nil
		}
	}

	tokens := make([]jsonPathToken, 0, 8)
	appendToken := func(token jsonPathToken) error {
		if len(tokens) >= maxJSONPathSegments {
			return fmt.Errorf("JSON path exceeds %d segments", maxJSONPathSegments)
		}
		tokens = append(tokens, token)
		return nil
	}

	for index < len(path) {
		switch path[index] {
		case '.':
			index++
			if index == len(path) {
				return nil, fmt.Errorf("JSON path cannot end with a dot")
			}
			start := index
			for index < len(path) && path[index] != '.' && path[index] != '[' {
				if path[index] == ']' {
					return nil, fmt.Errorf("unexpected closing bracket at byte %d", index)
				}
				index++
			}
			if start == index {
				return nil, fmt.Errorf("empty JSON path segment at byte %d", start)
			}
			if err := appendToken(jsonPathToken{key: path[start:index]}); err != nil {
				return nil, err
			}
		case '[':
			token, next, err := parseBracketToken(path, index)
			if err != nil {
				return nil, err
			}
			if err := appendToken(token); err != nil {
				return nil, err
			}
			index = next
		default:
			if index != 0 {
				return nil, fmt.Errorf("expected dot or bracket at byte %d", index)
			}
			start := index
			for index < len(path) && path[index] != '.' && path[index] != '[' {
				if path[index] == ']' {
					return nil, fmt.Errorf("unexpected closing bracket at byte %d", index)
				}
				index++
			}
			if start == index {
				return nil, fmt.Errorf("empty JSON path segment at byte %d", start)
			}
			if err := appendToken(jsonPathToken{key: path[start:index]}); err != nil {
				return nil, err
			}
		}
	}
	return tokens, nil
}

func parseBracketToken(path string, start int) (jsonPathToken, int, error) {
	index := start + 1
	if index >= len(path) {
		return jsonPathToken{}, 0, fmt.Errorf("unclosed bracket at byte %d", start)
	}
	if path[index] == '"' {
		quoteStart := index
		index++
		escaped := false
		for index < len(path) {
			switch {
			case escaped:
				escaped = false
			case path[index] == '\\':
				escaped = true
			case path[index] == '"':
				encoded := path[quoteStart : index+1]
				key, err := strconv.Unquote(encoded)
				if err != nil {
					return jsonPathToken{}, 0, fmt.Errorf("invalid quoted JSON path key at byte %d: %w", quoteStart, err)
				}
				index++
				if index >= len(path) || path[index] != ']' {
					return jsonPathToken{}, 0, fmt.Errorf("quoted JSON path key must end with ]")
				}
				return jsonPathToken{key: key}, index + 1, nil
			}
			index++
		}
		return jsonPathToken{}, 0, fmt.Errorf("unclosed quoted JSON path key at byte %d", quoteStart)
	}

	valueStart := index
	for index < len(path) && path[index] != ']' {
		if path[index] < '0' || path[index] > '9' {
			return jsonPathToken{}, 0, fmt.Errorf("array index at byte %d must be a non-negative integer", valueStart)
		}
		index++
	}
	if index >= len(path) {
		return jsonPathToken{}, 0, fmt.Errorf("unclosed bracket at byte %d", start)
	}
	if valueStart == index {
		return jsonPathToken{}, 0, fmt.Errorf("empty bracket at byte %d", start)
	}
	parsed, err := strconv.ParseUint(path[valueStart:index], 10, 31)
	if err != nil || parsed > maxJSONPathIndex {
		return jsonPathToken{}, 0, fmt.Errorf("array index at byte %d exceeds %d", valueStart, maxJSONPathIndex)
	}
	return jsonPathToken{index: int(parsed), isIndex: true}, index + 1, nil
}

func lookupJSONPath(root any, tokens []jsonPathToken) (any, bool) {
	current := root
	for _, token := range tokens {
		if token.isIndex {
			values, ok := current.([]any)
			if !ok || token.index < 0 || token.index >= len(values) {
				return nil, false
			}
			current = values[token.index]
			continue
		}
		switch value := current.(type) {
		case map[string]any:
			next, ok := value[token.key]
			if !ok {
				return nil, false
			}
			current = next
		case []any:
			index, err := strconv.Atoi(token.key)
			if err != nil || index < 0 || index >= len(value) {
				return nil, false
			}
			current = value[index]
		default:
			return nil, false
		}
	}
	return current, true
}
