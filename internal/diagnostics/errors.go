// Package diagnostics contains read-only helpers for inspecting running Java
// services. It deliberately does not write to a project or mutate a service.
package diagnostics

import (
	"errors"
	"fmt"
)

const (
	CodeInvalidInput     = "invalid_input"
	CodeUnsafeMethod     = "unsafe_method"
	CodeRequestFailed    = "request_failed"
	CodeResponseTooLarge = "response_too_large"
	CodeInvalidResponse  = "invalid_response"
	CodeLimitExceeded    = "limit_exceeded"
)

// DiagnosticError is safe to show to an end user. The wrapped cause is kept
// for logs and errors.Is/errors.As, but is never included in Error().
type DiagnosticError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Hint    string `json:"hint,omitempty"`
	cause   error
}

func (e *DiagnosticError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *DiagnosticError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.cause
}

func newDiagnosticError(code, message, hint string, cause error) *DiagnosticError {
	return &DiagnosticError{
		Code:    code,
		Message: message,
		Hint:    hint,
		cause:   cause,
	}
}

// ErrorCode extracts a stable error code for UI branching.
func ErrorCode(err error) string {
	var diagnosticErr *DiagnosticError
	if errors.As(err, &diagnosticErr) {
		return diagnosticErr.Code
	}
	return ""
}

func invalidInput(message, hint string) error {
	return newDiagnosticError(CodeInvalidInput, message, hint, nil)
}

func limitExceeded(message, hint string) error {
	return newDiagnosticError(CodeLimitExceeded, message, hint, nil)
}

func requestFailed(cause error) error {
	return newDiagnosticError(
		CodeRequestFailed,
		"The service could not be reached.",
		"Check the URL, network access, and service status.",
		cause,
	)
}

func invalidResponse(cause error) error {
	return newDiagnosticError(
		CodeInvalidResponse,
		"The service returned an unreadable response.",
		"Confirm that the selected endpoint exposes Spring Boot Actuator JSON.",
		cause,
	)
}

func responseTooLarge(limit int64) error {
	return newDiagnosticError(
		CodeResponseTooLarge,
		"The response is too large to inspect safely.",
		fmt.Sprintf("Reduce the response size or keep it below %d bytes.", limit),
		nil,
	)
}
