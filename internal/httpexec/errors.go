package httpexec

import (
	"errors"
	"fmt"
)

var (
	ErrInvalidRequest             = errors.New("HTTP request is invalid")
	ErrRequestBodyTooLarge        = errors.New("HTTP request body limit exceeded")
	ErrResponseBodyTooLarge       = errors.New("HTTP response body limit exceeded")
	ErrResponseHeadersTooLarge    = errors.New("HTTP response header limit exceeded")
	ErrUnsupportedContentEncoding = errors.New("HTTP response content encoding is unsupported")
	ErrTooManyContentEncodings    = errors.New("HTTP response has too many content encodings")
	ErrResponseDecodeFailed       = errors.New("HTTP response content decoding failed")
)

// HeaderErrorReason is a stable machine-readable request validation result.
type HeaderErrorReason string

const (
	HeaderNameInvalid              HeaderErrorReason = "name_invalid"
	HeaderValueInvalid             HeaderErrorReason = "value_invalid"
	HeaderHostDuplicate            HeaderErrorReason = "host_duplicate"
	HeaderHostInvalid              HeaderErrorReason = "host_invalid"
	HeaderContentLengthDuplicate   HeaderErrorReason = "content_length_duplicate"
	HeaderContentLengthInvalid     HeaderErrorReason = "content_length_invalid"
	HeaderContentLengthMismatch    HeaderErrorReason = "content_length_mismatch"
	HeaderContentLengthUnsupported HeaderErrorReason = "content_length_unsupported"
	HeaderFramingConflict          HeaderErrorReason = "framing_conflict"
	HeaderTransferDuplicate        HeaderErrorReason = "transfer_encoding_duplicate"
	HeaderTransferInvalid          HeaderErrorReason = "transfer_encoding_invalid"
	HeaderTransferBodyUnsupported  HeaderErrorReason = "transfer_encoding_body_unsupported"
	HeaderTrailerUnsupported       HeaderErrorReason = "trailer_unsupported"
)

// HeaderError describes a rejected wire header without requiring callers to
// parse error text.
type HeaderError struct {
	Name           string
	Reason         HeaderErrorReason
	DeclaredLength int64
	BodyLength     int64
}

func (e *HeaderError) Error() string {
	if e == nil {
		return ErrInvalidRequest.Error()
	}
	switch e.Reason {
	case HeaderNameInvalid:
		return fmt.Sprintf("header name %q is invalid", e.Name)
	case HeaderValueInvalid:
		return fmt.Sprintf("header %q contains an unsafe value", e.Name)
	case HeaderHostDuplicate:
		return "request contains more than one Host header"
	case HeaderHostInvalid:
		return "Host header is invalid"
	case HeaderContentLengthDuplicate:
		return "request contains more than one Content-Length header"
	case HeaderContentLengthInvalid:
		return "Content-Length must be a non-negative integer"
	case HeaderContentLengthMismatch:
		return fmt.Sprintf(
			"Content-Length is %d but the request body is %d bytes",
			e.DeclaredLength,
			e.BodyLength,
		)
	case HeaderContentLengthUnsupported:
		return "an explicit zero Content-Length cannot be preserved for this method"
	case HeaderFramingConflict:
		return "Content-Length and Transfer-Encoding cannot be combined"
	case HeaderTransferDuplicate:
		return "request contains more than one Transfer-Encoding header"
	case HeaderTransferInvalid:
		return "only chunked Transfer-Encoding is supported"
	case HeaderTransferBodyUnsupported:
		return "this method cannot use chunked Transfer-Encoding"
	case HeaderTrailerUnsupported:
		return "Trailer fields cannot be represented by a flat header list"
	default:
		return ErrInvalidRequest.Error()
	}
}

func (e *HeaderError) Unwrap() error {
	return ErrInvalidRequest
}

// ContentEncodingError retains the failing encoding while exposing a stable
// sentinel through errors.Is.
type ContentEncodingError struct {
	Encoding string
	Kind     error
	Err      error
}

func (e *ContentEncodingError) Error() string {
	if e == nil {
		return ErrResponseDecodeFailed.Error()
	}
	kind := e.Kind
	if kind == nil {
		kind = ErrResponseDecodeFailed
	}
	if e.Err != nil {
		return fmt.Sprintf("%s %q: %v", kind, e.Encoding, e.Err)
	}
	if e.Encoding != "" {
		return fmt.Sprintf("%s: %q", kind, e.Encoding)
	}
	return kind.Error()
}

func (e *ContentEncodingError) Unwrap() []error {
	if e == nil {
		return []error{ErrResponseDecodeFailed}
	}
	kind := e.Kind
	if kind == nil {
		kind = ErrResponseDecodeFailed
	}
	if e.Err == nil {
		return []error{kind}
	}
	return []error{kind, e.Err}
}
