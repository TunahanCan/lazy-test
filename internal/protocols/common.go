// Package protocols provides the bounded, cancellable SSE stream client used
// by Validex.
package protocols

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/textproto"
	"strings"
	"time"
)

const (
	defaultTimeout = 30 * time.Second
	maxTimeout     = 10 * time.Minute
)

var (
	// ErrInvalidRequest classifies invalid SSE configuration without requiring
	// adapters to parse a localized or implementation-specific error message.
	ErrInvalidRequest = errors.New("invalid SSE request")
	// ErrLimitExceeded is returned when a configured response or event limit is
	// reached before the remote payload can be consumed safely.
	ErrLimitExceeded = errors.New("protocol payload limit exceeded")
	// ErrUnexpectedContentType classifies a successful HTTP response that cannot
	// be interpreted as an SSE stream.
	ErrUnexpectedContentType = errors.New("unexpected SSE content type")
)

// HTTPStatusError reports a non-successful HTTP response from an SSE endpoint.
// Body contains only a small, bounded diagnostic excerpt.
type HTTPStatusError struct {
	StatusCode int
	Status     string
	Body       string
}

func (e *HTTPStatusError) Error() string {
	if e.Body == "" {
		return fmt.Sprintf("unexpected HTTP status: %s", e.Status)
	}
	return fmt.Sprintf("unexpected HTTP status: %s: %s", e.Status, e.Body)
}

// ContentTypeError retains the received media type while exposing a stable
// sentinel through errors.Is.
type ContentTypeError struct {
	ContentType string
}

func (e *ContentTypeError) Error() string {
	if e == nil || e.ContentType == "" {
		return ErrUnexpectedContentType.Error() + ": response must use text/event-stream"
	}
	return fmt.Sprintf(
		"%s %q: response must use text/event-stream",
		ErrUnexpectedContentType,
		e.ContentType,
	)
}

func (e *ContentTypeError) Unwrap() error {
	return ErrUnexpectedContentType
}

func boundedContext(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc, error) {
	if parent == nil {
		parent = context.Background()
	}
	if timeout < 0 {
		return nil, nil, fmt.Errorf("%w: timeout cannot be negative", ErrInvalidRequest)
	}
	if timeout == 0 {
		timeout = defaultTimeout
	}
	if timeout > maxTimeout {
		return nil, nil, fmt.Errorf(
			"%w: timeout cannot exceed %s",
			ErrInvalidRequest,
			maxTimeout,
		)
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	return ctx, cancel, nil
}

func validatedHeaders(input map[string]string) (http.Header, error) {
	headers := make(http.Header, len(input))
	for rawName, value := range input {
		name := textproto.TrimString(rawName)
		if name == "" {
			return nil, fmt.Errorf("%w: header name cannot be empty", ErrInvalidRequest)
		}
		if name != rawName {
			return nil, fmt.Errorf(
				"%w: header name %q contains surrounding whitespace",
				ErrInvalidRequest,
				rawName,
			)
		}
		if strings.ContainsAny(name, "\r\n:") {
			return nil, fmt.Errorf(
				"%w: invalid header name %q",
				ErrInvalidRequest,
				rawName,
			)
		}
		for _, r := range name {
			if !isHTTPTokenRune(r) {
				return nil, fmt.Errorf(
					"%w: invalid header name %q",
					ErrInvalidRequest,
					rawName,
				)
			}
		}
		canonicalName := textproto.CanonicalMIMEHeaderKey(name)
		if _, exists := headers[canonicalName]; exists {
			return nil, fmt.Errorf(
				"%w: duplicate header name %q",
				ErrInvalidRequest,
				rawName,
			)
		}
		if strings.ContainsAny(value, "\r\n") {
			return nil, fmt.Errorf(
				"%w: header %q contains a line break",
				ErrInvalidRequest,
				rawName,
			)
		}
		headers.Set(canonicalName, value)
	}
	return headers, nil
}

func isHTTPTokenRune(r rune) bool {
	if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' {
		return true
	}
	switch r {
	case '!', '#', '$', '%', '&', '\'', '*', '+', '-', '.', '^', '_', '`', '|', '~':
		return true
	default:
		return false
	}
}

func cloneHeader(header http.Header) http.Header {
	if header == nil {
		return nil
	}
	return header.Clone()
}
