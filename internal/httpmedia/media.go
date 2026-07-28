// Package httpmedia owns the media-type normalization policy shared by HTTP,
// OpenAPI, and mock adapters.
package httpmedia

import (
	"mime"
	"strings"
)

// BaseType returns a lower-case media type without parameters. Malformed
// parameters do not hide an otherwise usable type token.
func BaseType(value string) string {
	trimmed := strings.TrimSpace(value)
	baseType, _, err := mime.ParseMediaType(trimmed)
	if err != nil {
		baseType = strings.TrimSpace(strings.SplitN(trimmed, ";", 2)[0])
	}
	return strings.ToLower(baseType)
}

// IsJSON reports whether value is application/json or uses a structured +json
// suffix. A token that merely contains the text "json" is not JSON.
func IsJSON(value string) bool {
	mediaType := BaseType(value)
	parts := strings.SplitN(mediaType, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return false
	}
	return mediaType == "application/json" ||
		strings.HasSuffix(parts[1], "+json")
}

// IsXML reports whether value is one of the standard XML media types or uses
// a structured +xml suffix. SVG is XML even though its top-level type is
// image.
func IsXML(value string) bool {
	mediaType := BaseType(value)
	parts := strings.SplitN(mediaType, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return false
	}
	return mediaType == "application/xml" ||
		mediaType == "text/xml" ||
		mediaType == "image/svg+xml" ||
		strings.HasSuffix(parts[1], "+xml")
}

// IsTextual reports whether a declared media type has a text representation
// that is safe to expose directly to an editor. An empty or unknown type is
// deliberately false; callers may layer content inspection on top when a
// response omitted Content-Type.
func IsTextual(value string) bool {
	mediaType := BaseType(value)
	parts := strings.SplitN(mediaType, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return false
	}
	if parts[0] == "text" {
		return true
	}
	subtype := parts[1]
	if strings.HasSuffix(subtype, "+json") ||
		strings.HasSuffix(subtype, "+xml") ||
		strings.HasSuffix(subtype, "+yaml") {
		return true
	}
	switch mediaType {
	case "application/json",
		"application/xml",
		"application/yaml",
		"application/x-yaml",
		"application/javascript",
		"application/ecmascript",
		"application/graphql",
		"application/sql",
		"application/x-www-form-urlencoded",
		"image/svg+xml":
		return true
	default:
		return false
	}
}

// Matches reports whether a normalized HTTP media range accepts an actual
// media type. It supports exact types, */*, type/*, and structured suffix
// ranges such as application/*+json.
func Matches(mediaRange, actual string) bool {
	rangeType := BaseType(mediaRange)
	actualType := BaseType(actual)
	rangeParts := strings.SplitN(rangeType, "/", 2)
	actualParts := strings.SplitN(actualType, "/", 2)
	if len(rangeParts) != 2 || len(actualParts) != 2 ||
		rangeParts[0] == "" || rangeParts[1] == "" ||
		actualParts[0] == "" || actualParts[1] == "" {
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
		return rangeParts[1] == actualParts[1]
	}
}
