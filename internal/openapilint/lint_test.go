package openapilint

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestLintBytesAcceptsCompleteJSONDocument(t *testing.T) {
	t.Parallel()
	report := LintBytes([]byte(`{
	  "openapi": "3.0.3",
	  "info": {"title": "Pets", "version": "1.0.0"},
	  "paths": {
	    "/pets": {
	      "get": {
	        "operationId": "listPets",
	        "summary": "List pets",
	        "tags": ["pets"],
	        "responses": {
	          "200": {
	            "description": "OK",
	            "content": {
	              "application/json": {
	                "schema": {
	                  "type": "array",
	                  "items": {"type": "string"},
	                  "example": ["cat"]
	                }
	              }
	            }
	          }
	        }
	      }
	    }
	  }
	}`), Options{})

	if len(report.Issues) != 0 {
		t.Fatalf("expected no issues, got %#v", report.Issues)
	}
	if report.Summary.Paths != 1 || report.Summary.Operations != 1 {
		t.Fatalf("unexpected document summary: %#v", report.Summary)
	}
}

func TestLintBytesProducesDeterministicYAMLRuleIssues(t *testing.T) {
	t.Parallel()
	report := LintBytes([]byte(`
openapi: 3.0.3
info:
  title: Example
  version: 1.0.0
paths:
  /pets:
    get:
      operationId: sharedOperation
      responses:
        "400":
          description: Bad request
          content:
            application/problem+json: {}
  /users:
    post:
      operationId: sharedOperation
      summary: Create user
      tags: [users]
      responses:
        "201":
          description: Created
`), Options{MaxIssues: 50})

	assertIssue(t, report, CodeOperationSummaryMissing, SeverityWarning,
		"#/paths/~1pets/get/summary")
	assertIssue(t, report, CodeOperationTagsMissing, SeverityWarning,
		"#/paths/~1pets/get/tags")
	assertIssue(t, report, CodeOperationSuccessMissing, SeverityWarning,
		"#/paths/~1pets/get/responses")
	assertIssue(t, report, CodeJSONResponseSchemaMissing, SeverityWarning,
		"#/paths/~1pets/get/responses/400/content/application~1problem+json/schema")
	assertIssue(t, report, CodeJSONResponseExampleMissing, SeverityInfo,
		"#/paths/~1pets/get/responses/400/content/application~1problem+json/example")
	duplicate := assertIssue(t, report, CodeOperationIDDuplicate, SeverityError,
		"#/paths/~1users/post/operationId")
	if !strings.Contains(duplicate.Hint, "#/paths/~1pets/get/operationId") {
		t.Fatalf("duplicate hint does not identify deterministic first use: %#v", duplicate)
	}
	if report.Summary.Paths != 2 || report.Summary.Operations != 2 {
		t.Fatalf("unexpected document summary: %#v", report.Summary)
	}
}

func TestLintBytesReportsMissingOperationMetadataAndResponses(t *testing.T) {
	t.Parallel()
	report := LintBytes([]byte(`
openapi: 3.0.3
info:
  title: Example
  version: 1.0.0
paths:
  /health:
    get:
      responses: {}
`), Options{})

	assertIssue(t, report, CodeOperationIDMissing, SeverityWarning,
		"#/paths/~1health/get/operationId")
	assertIssue(t, report, CodeOperationSummaryMissing, SeverityWarning,
		"#/paths/~1health/get/summary")
	assertIssue(t, report, CodeOperationTagsMissing, SeverityWarning,
		"#/paths/~1health/get/tags")
	assertIssue(t, report, CodeOperationResponsesMissing, SeverityError,
		"#/paths/~1health/get/responses")
}

func TestLintBytesReturnsStructuredParseAndValidationIssues(t *testing.T) {
	t.Parallel()
	parseReport := LintBytes([]byte("openapi: ["), Options{})
	assertIssue(t, parseReport, CodeDocumentParse, SeverityError, "#")
	if parseReport.Summary.Operations != 0 {
		t.Fatalf("parse failure should not report operations: %#v", parseReport.Summary)
	}

	validationReport := LintBytes([]byte(`
openapi: 3.0.3
info:
  title: Missing version
paths: {}
`), Options{})
	assertIssue(t, validationReport, CodeDocumentInvalid, SeverityError, "#")
}

func TestLintBytesIsDeterministic(t *testing.T) {
	t.Parallel()
	document := []byte(`
openapi: 3.0.3
info:
  title: Deterministic
  version: 1.0.0
paths:
  /z-last:
    post:
      responses:
        "204":
          description: OK
  /a-first:
    get:
      responses:
        "204":
          description: OK
`)
	expected := LintBytes(document, Options{MaxIssues: 50})
	for iteration := 0; iteration < 20; iteration++ {
		actual := LintBytes(document, Options{MaxIssues: 50})
		if !reflect.DeepEqual(actual, expected) {
			t.Fatalf(
				"iteration %d produced a different report:\nexpected %#v\nactual %#v",
				iteration,
				expected,
				actual,
			)
		}
	}
	if got := expected.Issues[0].Path; got != "#/paths/~1a-first/get/operationId" {
		t.Fatalf("first sorted issue path = %q", got)
	}
}

func TestLintBytesEnforcesDocumentAndIssueLimits(t *testing.T) {
	t.Parallel()
	tooLarge := make([]byte, MaxDocumentBytes+1)
	report := LintBytes(tooLarge, Options{})
	if len(report.Issues) != 1 {
		t.Fatalf("expected one size issue, got %d", len(report.Issues))
	}
	assertIssue(t, report, CodeDocumentTooLarge, SeverityError, "#")

	var document strings.Builder
	document.WriteString(`{"openapi":"3.0.3","info":{"title":"Large","version":"1"},"paths":{`)
	for index := 0; index < 334; index++ {
		if index > 0 {
			document.WriteByte(',')
		}
		fmt.Fprintf(
			&document,
			`"/path-%03d":{"get":{"responses":{"204":{"description":"OK"}}}}`,
			index,
		)
	}
	document.WriteString(`}}`)

	limited := LintBytes(
		[]byte(document.String()),
		Options{MaxIssues: MaxIssueLimit + 500},
	)
	if len(limited.Issues) != MaxIssueLimit {
		t.Fatalf("expected %d retained issues, got %d", MaxIssueLimit, len(limited.Issues))
	}
	if limited.Summary.Total != 1_002 {
		t.Fatalf("expected all issues in summary, got %#v", limited.Summary)
	}
	if !limited.Truncated {
		t.Fatal("expected truncated report")
	}
}

func TestLintFileReadsYAMLAndReservesErrorsForIO(t *testing.T) {
	t.Parallel()
	directory := t.TempDir()
	path := filepath.Join(directory, "openapi.yaml")
	if err := os.WriteFile(path, []byte(`
openapi: 3.0.3
info:
  title: File API
  version: 1.0.0
paths: {}
`), 0o600); err != nil {
		t.Fatal(err)
	}

	report, err := LintFile(path, Options{})
	if err != nil {
		t.Fatalf("LintFile returned an operational error: %v", err)
	}
	if report.Summary.Total != 0 {
		t.Fatalf("expected valid file report, got %#v", report)
	}

	if _, err := LintFile(filepath.Join(directory, "missing.yaml"), Options{}); err == nil {
		t.Fatal("expected missing file error")
	}
}

func assertIssue(
	t *testing.T,
	report Report,
	code string,
	severity Severity,
	path string,
) Issue {
	t.Helper()
	for _, issue := range report.Issues {
		if issue.Code != code || issue.Path != path {
			continue
		}
		if issue.Severity != severity {
			t.Fatalf(
				"issue %s severity = %s, want %s",
				code,
				issue.Severity,
				severity,
			)
		}
		if issue.Message == "" || issue.Hint == "" {
			t.Fatalf("issue should include message and hint: %#v", issue)
		}
		return issue
	}
	t.Fatalf("issue %s at %s not found in %#v", code, path, report.Issues)
	return Issue{}
}
