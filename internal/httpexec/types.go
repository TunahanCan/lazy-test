// Package httpexec provides the bounded, policy-driven HTTP transport shared
// by the interactive desktop request flow and the collection runner.
//
// Callers remain responsible for their own variable resolution, reporting and
// user-facing errors. This package owns wire-level request construction,
// special header handling, response limits and content decoding.
package httpexec

import (
	"crypto/tls"
	"net/http"
	"time"
)

const (
	DefaultMaxRequestBodyBytes    = int64(4 << 20)
	DefaultMaxResponseBodyBytes   = int64(16 << 20)
	DefaultMaxResponseHeaderBytes = int64(1 << 20)
	DefaultMaxContentEncoding     = 4
)

// HeaderField is one active request header. Slice order preserves repeated
// values for the same canonical name. net/http does not guarantee global
// wire-order across different header names.
type HeaderField struct {
	Name  string
	Value string
}

// Request is a fully resolved HTTP request.
type Request struct {
	Method  string
	URL     string
	Headers []HeaderField
	Body    []byte
}

// RedirectPolicy makes redirect behavior explicit at each adapter boundary.
type RedirectPolicy uint8

const (
	// FollowRedirects retains the supplied http.Client policy. A client with no
	// CheckRedirect callback uses net/http's bounded default.
	FollowRedirects RedirectPolicy = iota
	// StopAtFirstResponse returns the first 3xx response to the caller.
	StopAtFirstResponse
)

// Options defines one execution profile. Non-positive limits use package
// defaults. DisableContentDecoding returns the encoded response body.
type Options struct {
	RequestBodyLimit       int64
	ResponseBodyLimit      int64
	ResponseHeaderLimit    int64
	MaxContentEncodings    int
	RedirectPolicy         RedirectPolicy
	SuppressDefaultAgent   bool
	DisableContentDecoding bool
}

// ExecutorConfig controls resources owned by an Executor. An injected client
// remains caller-owned and is never mutated or closed.
type ExecutorConfig struct {
	Client                 *http.Client
	MaxResponseHeaderBytes int64
}

// Response is the bounded transport result. Headers describe the wire
// response even when Body was content-decoded.
type Response struct {
	StatusCode int
	Status     string
	Protocol   string
	Headers    http.Header
	Cookies    []*http.Cookie
	Body       []byte
	Duration   time.Duration
	TLS        *tls.ConnectionState
}
