package canbridge

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestRunCollectionExecutesAssertionsThroughSharedRunner(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(
		response http.ResponseWriter,
		_ *http.Request,
	) {
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"status":"UP"}`))
	}))
	defer server.Close()

	definition := fmt.Sprintf(`{
		"name":"smoke",
		"requests":[{
			"id":"health",
			"name":"Health",
			"method":"GET",
			"url":%q,
			"assertions":[
				{"target":"status","operator":"equals","expected":200},
				{"target":"json_path","path":"$.status","operator":"equals","expected":"UP"}
			]
		}]
	}`, server.URL)
	result := NewBridge().RunCollection(CollectionRunInput{
		OperationID: "collection-test",
		Definition:  definition,
	})
	if result.Error != nil {
		t.Fatalf("unexpected collection error: %#v", result.Error)
	}
	if result.Report == nil || result.Report.Passed != 1 ||
		result.Report.Failed != 0 || len(result.Report.Results) != 1 {
		t.Fatalf("unexpected report: %#v", result.Report)
	}
	if !result.Report.Results[0].Passed ||
		len(result.Report.Results[0].Assertions) != 2 {
		t.Fatalf("unexpected request result: %#v", result.Report.Results[0])
	}
}

func TestRunCollectionKeepsAssertionFailuresInReport(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(
		response http.ResponseWriter,
		_ *http.Request,
	) {
		response.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	definition := fmt.Sprintf(`{
		"name":"failure",
		"requests":[{
			"method":"GET",
			"url":%q,
			"assertions":[
				{"target":"status","operator":"equals","expected":200}
			]
		}]
	}`, server.URL)
	result := NewBridge().RunCollection(CollectionRunInput{
		OperationID: "collection-failure",
		Definition:  definition,
	})
	if result.Error != nil {
		t.Fatalf("assertion failure became bridge error: %#v", result.Error)
	}
	if result.Report == nil || result.Report.Failed != 1 ||
		result.Report.Results[0].Assertions[0].Passed {
		t.Fatalf("unexpected failure report: %#v", result.Report)
	}
}

func TestRunCollectionReturnsJSONSafeEmptyReportForInvalidRuntimeVariables(
	t *testing.T,
) {
	result := NewBridge().RunCollection(CollectionRunInput{
		OperationID: "collection-invalid-variables",
		Definition: `{
			"requests":[{
				"method":"GET",
				"url":"https://example.test"
			}]
		}`,
		Variables: map[string]string{"bad key": "value"},
	})
	if result.Error == nil || result.Report == nil ||
		result.Report.Results == nil || len(result.Report.Results) != 0 {
		t.Fatalf("unexpected invalid-variable result: %#v", result)
	}
}

func TestAnalyzeNetworkReturnsDNSAndRedirectChain(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(
		response http.ResponseWriter,
		request *http.Request,
	) {
		if request.URL.Path == "/start" {
			http.Redirect(response, request, "/final", http.StatusFound)
			return
		}
		response.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	result := NewBridge().AnalyzeNetwork(NetworkInspectInput{
		OperationID:  "network-test",
		URL:          server.URL + "/start",
		TimeoutMS:    5_000,
		MaxRedirects: 4,
	})
	if result.Error != nil {
		t.Fatalf("unexpected network error: %#v", result.Error)
	}
	if result.Report == nil || result.Report.FinalStatusCode != http.StatusNoContent {
		t.Fatalf("unexpected network report: %#v", result.Report)
	}
	if len(result.Report.DNSLookups) != 1 || len(result.Report.Hops) != 2 {
		t.Fatalf("unexpected DNS/hop counts: %#v", result.Report)
	}
}

func TestLintOpenAPIReturnsStructuredReportFromFilePicker(t *testing.T) {
	documentPath := filepath.Join(t.TempDir(), "openapi.yaml")
	document := `openapi: 3.0.3
info:
  title: Example
  version: 1.0.0
paths:
  /users:
    get:
      responses:
        "200":
          description: OK
`
	if err := os.WriteFile(documentPath, []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}

	bridge := NewBridge()
	bridge.filePicker = fixedAutomationFilePicker{path: documentPath}
	Startup(bridge)(context.Background())
	defer Shutdown(bridge)(context.Background())

	result := bridge.LintOpenAPI()
	if result.Error != nil || result.Canceled {
		t.Fatalf("unexpected lint result: %#v", result)
	}
	if result.Report == nil || result.Report.Summary.Operations != 1 ||
		result.Report.Summary.Warnings == 0 {
		t.Fatalf("unexpected lint report: %#v", result.Report)
	}
}

type fixedAutomationFilePicker struct {
	path string
	err  error
}

func (picker fixedAutomationFilePicker) Open(
	context.Context,
	fileDialogOptions,
) (string, error) {
	return picker.path, picker.err
}
