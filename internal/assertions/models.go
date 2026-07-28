// Package assertions evaluates deterministic assertions against one HTTP
// response without requiring a testing framework.
package assertions

import (
	"net/http"
	"time"
)

// Target identifies the response value inspected by an assertion.
type Target string

const (
	TargetStatus     Target = "status"
	TargetHeader     Target = "header"
	TargetBody       Target = "body"
	TargetJSONPath   Target = "json_path"
	TargetDurationMS Target = "duration_ms"
)

// Operator identifies the comparison performed by an assertion.
type Operator string

const (
	OperatorEquals      Operator = "equals"
	OperatorNotEquals   Operator = "not_equals"
	OperatorContains    Operator = "contains"
	OperatorExists      Operator = "exists"
	OperatorNotExists   Operator = "not_exists"
	OperatorLessThan    Operator = "less_than"
	OperatorGreaterThan Operator = "greater_than"
	OperatorMatches     Operator = "matches"
)

// Assertion is one serializable response expectation. Path names a header for
// TargetHeader and a restricted JSON path for TargetJSONPath.
type Assertion struct {
	ID       string   `json:"id,omitempty"`
	Name     string   `json:"name,omitempty"`
	Target   Target   `json:"target"`
	Path     string   `json:"path,omitempty"`
	Operator Operator `json:"operator"`
	Expected any      `json:"expected,omitempty"`
}

// Input contains the response values available to assertions.
type Input struct {
	StatusCode int
	Headers    http.Header
	Body       []byte
	Duration   time.Duration
}

// Result is one assertion outcome. Error describes an invalid assertion or
// unreadable input; Message describes an ordinary comparison failure.
type Result struct {
	Assertion Assertion `json:"assertion"`
	Passed    bool      `json:"passed"`
	// Exists distinguishes a present JSON null from a missing path. It is true
	// for targets such as status/body that always have an addressable value.
	Exists  bool   `json:"exists"`
	Actual  any    `json:"actual,omitempty"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}
