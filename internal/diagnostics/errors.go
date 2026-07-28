// Package diagnostics contains read-only helpers for inspecting running Java
// services. It deliberately does not write to a project or mutate a service.
package diagnostics

import (
	"errors"
	"fmt"
)

// DiagnosticErrorCode is a stable machine-readable error category. Its JSON
// representation remains a string.
type DiagnosticErrorCode string

const (
	CodeInvalidInput     DiagnosticErrorCode = "invalid_input"
	CodeUnsafeMethod     DiagnosticErrorCode = "unsafe_method"
	CodeRequestFailed    DiagnosticErrorCode = "request_failed"
	CodeResponseTooLarge DiagnosticErrorCode = "response_too_large"
	CodeInvalidResponse  DiagnosticErrorCode = "invalid_response"
	CodeLimitExceeded    DiagnosticErrorCode = "limit_exceeded"
)

// DiagnosticError is safe to show to an end user. The wrapped cause is kept
// for logs and errors.Is/errors.As, but is never included in Error().
type DiagnosticError struct {
	Code    DiagnosticErrorCode `json:"code"`
	Message string              `json:"message"`
	Hint    string              `json:"hint,omitempty"`
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

func newDiagnosticError(
	code DiagnosticErrorCode,
	message string,
	hint string,
	cause error,
) *DiagnosticError {
	return &DiagnosticError{
		Code:    code,
		Message: message,
		Hint:    hint,
		cause:   cause,
	}
}

// ErrorCode extracts a stable error code for UI branching.
func ErrorCode(err error) DiagnosticErrorCode {
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
