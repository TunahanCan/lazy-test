// Package protocols provides bounded, cancellable clients for non-HTTP API
// protocols used by Validex.
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

// ErrLimitExceeded is returned when a configured response or message limit is
// reached before the remote payload can be consumed safely.
var ErrLimitExceeded = errors.New("protocol payload limit exceeded")

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

func boundedContext(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc, error) {
	if parent == nil {
		parent = context.Background()
	}
	if timeout < 0 {
		return nil, nil, errors.New("timeout cannot be negative")
	}
	if timeout == 0 {
		timeout = defaultTimeout
	}
	if timeout > maxTimeout {
		return nil, nil, fmt.Errorf("timeout cannot exceed %s", maxTimeout)
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	return ctx, cancel, nil
}

func validatedHeaders(input map[string]string) (http.Header, error) {
	headers := make(http.Header, len(input))
	for rawName, value := range input {
		name := textproto.TrimString(rawName)
		if name == "" {
			return nil, errors.New("header name cannot be empty")
		}
		if strings.ContainsAny(name, "\r\n:") {
			return nil, fmt.Errorf("invalid header name %q", rawName)
		}
		for _, r := range name {
			if !isHTTPTokenRune(r) {
				return nil, fmt.Errorf("invalid header name %q", rawName)
			}
		}
		if strings.ContainsAny(value, "\r\n") {
			return nil, fmt.Errorf("header %q contains a line break", rawName)
		}
		headers.Set(textproto.CanonicalMIMEHeaderKey(name), value)
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
