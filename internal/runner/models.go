// Package runner decodes and executes bounded JSON HTTP collections.
package runner

import (
	"context"
	"net/http"

	"validex/internal/assertions"
	"validex/internal/httpexec"
)

const (
	DefaultMaxCollectionBytes     = int64(8 << 20)
	DefaultMaxRequests            = 100
	DefaultMaxRequestBodyBytes    = int64(4 << 20)
	DefaultMaxResponseBodyBytes   = int64(16 << 20)
	DefaultMaxResponseHeaderBytes = int64(1 << 20)
	DefaultMaxReportBodyBytes     = int64(32 << 20)
	DefaultMaxReportHeaderBytes   = int64(4 << 20)
	DefaultRequestTimeoutMS       = 30_000
	DefaultMaxTimeoutMS           = 300_000

	hardMaxCollectionBytes     = int64(32 << 20)
	hardMaxRequests            = 10_000
	hardMaxRequestBodyBytes    = int64(16 << 20)
	hardMaxResponseBodyBytes   = int64(64 << 20)
	hardMaxResponseHeaderBytes = int64(8 << 20)
	hardMaxReportBodyBytes     = int64(128 << 20)
	hardMaxReportHeaderBytes   = int64(32 << 20)
	hardMaxTimeoutMS           = 300_000
	maxVariables               = 10_000
	maxHeaders                 = 512
	maxAssertionsPerRequest    = 256
	maxAssertionsPerCollection = 2_000
	maxMethodBytes             = 32
	maxURLBytes                = 16 << 10
	maxHeaderValueBytes        = 64 << 10
)

// CollectionVersion is a closed domain value. It is string-backed so callers
// cannot accidentally apply numeric ordering to format compatibility, while
// its JSON representation remains the historical integer.
type CollectionVersion string

const (
	// CollectionVersionUnspecified is the historical wire default. Missing,
	// null, and zero version fields use the v1 compatibility rules.
	CollectionVersionUnspecified CollectionVersion = ""
	CollectionVersionV1          CollectionVersion = "1"
	CollectionVersionV2          CollectionVersion = "2"
	CurrentCollectionVersion     CollectionVersion = CollectionVersionV2
)

// FailureCode is a stable machine-readable report failure category.
type FailureCode string

const (
	FailureInvalidRequest          FailureCode = "invalid_request"
	FailureMissingVariables        FailureCode = "missing_variables"
	FailureRequestBodyTooLarge     FailureCode = "request_body_too_large"
	FailureResponseBodyTooLarge    FailureCode = "response_body_too_large"
	FailureResponseHeadersTooLarge FailureCode = "response_headers_too_large"
	FailureUnsupportedEncoding     FailureCode = "unsupported_content_encoding"
	FailureTooManyEncodings        FailureCode = "too_many_content_encodings"
	FailureResponseDecodeFailed    FailureCode = "response_decode_failed"
	FailureRequestTimeout          FailureCode = "request_timeout"
	FailureRequestCanceled         FailureCode = "request_canceled"
	FailureSendFailed              FailureCode = "send_failed"
)

// Limits bounds collection decoding and request execution. Zero values use
// DefaultLimits.
type Limits struct {
	MaxCollectionBytes     int64 `json:"maxCollectionBytes,omitempty"`
	MaxRequests            int   `json:"maxRequests,omitempty"`
	MaxRequestBodyBytes    int64 `json:"maxRequestBodyBytes,omitempty"`
	MaxResponseBodyBytes   int64 `json:"maxResponseBodyBytes,omitempty"`
	MaxResponseHeaderBytes int64 `json:"maxResponseHeaderBytes,omitempty"`
	// Report body/header budgets count their encoded JSON values, including
	// string escaping and delimiters, so desktop IPC size remains predictable.
	MaxReportBodyBytes   int64 `json:"maxReportBodyBytes,omitempty"`
	MaxReportHeaderBytes int64 `json:"maxReportHeaderBytes,omitempty"`
	DefaultTimeoutMS     int   `json:"defaultTimeoutMs,omitempty"`
	MaxTimeoutMS         int   `json:"maxTimeoutMs,omitempty"`
}

// DefaultLimits returns conservative limits suitable for desktop and CLI use.
func DefaultLimits() Limits {
	return Limits{
		MaxCollectionBytes:     DefaultMaxCollectionBytes,
		MaxRequests:            DefaultMaxRequests,
		MaxRequestBodyBytes:    DefaultMaxRequestBodyBytes,
		MaxResponseBodyBytes:   DefaultMaxResponseBodyBytes,
		MaxResponseHeaderBytes: DefaultMaxResponseHeaderBytes,
		MaxReportBodyBytes:     DefaultMaxReportBodyBytes,
		MaxReportHeaderBytes:   DefaultMaxReportHeaderBytes,
		DefaultTimeoutMS:       DefaultRequestTimeoutMS,
		MaxTimeoutMS:           DefaultMaxTimeoutMS,
	}
}

// Options configures one run. Variables override collection-level variables;
// request-local variables remain the highest-precedence scope.
type Options struct {
	Limits    Limits
	Variables map[string]string
}

// Collection is the JSON-serializable sequential request model.
type Collection struct {
	Version   CollectionVersion `json:"version,omitempty"`
	Name      string            `json:"name,omitempty"`
	Variables map[string]string `json:"variables,omitempty"`
	Requests  []Request         `json:"requests"`
}

// Header is one collection header row. Version 2 collections use an ordered
// array so repeated names and disabled editor rows survive persistence.
type Header struct {
	Enabled bool   `json:"enabled"`
	Key     string `json:"key"`
	Value   string `json:"value"`
}

// Request is one collection entry.
type Request struct {
	ID            string                 `json:"id,omitempty"`
	Name          string                 `json:"name,omitempty"`
	Method        string                 `json:"method"`
	URL           string                 `json:"url"`
	Headers       []Header               `json:"headers,omitempty"`
	Body          string                 `json:"body,omitempty"`
	Variables     map[string]string      `json:"variables,omitempty"`
	LiteralValues bool                   `json:"literalValues,omitempty"`
	TimeoutMS     int                    `json:"timeoutMs,omitempty"`
	Assertions    []assertions.Assertion `json:"assertions,omitempty"`

	headerFormat collectionHeaderFormat
}

// PreparedRequest is the fully interpolated request passed to a Sender.
type PreparedRequest struct {
	ID                  string
	Name                string
	Method              string
	URL                 string
	ReportURL           string
	Headers             []httpexec.HeaderField
	Body                []byte
	RequestBodyLimit    int64
	ResponseBodyLimit   int64
	ResponseHeaderLimit int64
}

// Response is returned by a Sender. DurationMS is an integer specifically so
// bridge and CLI JSON never expose time.Duration nanoseconds.
type Response struct {
	StatusCode int
	Headers    http.Header
	Body       []byte
	DurationMS int64
}

// Sender abstracts transport for tests, alternate runtimes, and stdlib HTTP.
type Sender interface {
	Send(context.Context, PreparedRequest) (Response, error)
}

// Failure is a stable, user-readable execution failure.
type Failure struct {
	Code    FailureCode `json:"code"`
	Message string      `json:"message"`
	Hint    string      `json:"hint,omitempty"`
}

// RequestResult is one execution result.
type RequestResult struct {
	ID               string              `json:"id,omitempty"`
	Name             string              `json:"name,omitempty"`
	Method           string              `json:"method"`
	URL              string              `json:"url"`
	StatusCode       int                 `json:"statusCode,omitempty"`
	Headers          http.Header         `json:"headers,omitempty"`
	HeadersTruncated bool                `json:"headersTruncated,omitempty"`
	Body             string              `json:"body,omitempty"`
	BodyTruncated    bool                `json:"bodyTruncated,omitempty"`
	DurationMS       int64               `json:"durationMs"`
	Assertions       []assertions.Result `json:"assertions"`
	Passed           bool                `json:"passed"`
	Failure          *Failure            `json:"failure,omitempty"`
}

// Report is one collection run. StartedAt is UTC RFC3339Nano text and every
// duration field is integer milliseconds for a stable JSON contract.
type Report struct {
	Name       string          `json:"name,omitempty"`
	StartedAt  string          `json:"startedAt"`
	DurationMS int64           `json:"durationMs"`
	Results    []RequestResult `json:"results"`
	Passed     int             `json:"passed"`
	Failed     int             `json:"failed"`
}
