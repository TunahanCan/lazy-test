package canbridge

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type testFilePickerFunc func(
	context.Context,
	fileDialogOptions,
) (string, error)

func (picker testFilePickerFunc) Open(
	ctx context.Context,
	options fileDialogOptions,
) (string, error) {
	return picker(ctx, options)
}

func writeOpenAPIBridgeFixture(
	t *testing.T,
	name string,
	document string,
) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func validOpenAPIBridgeDocument() string {
	return `openapi: 3.0.3
info:
  title: Orders API
  version: 2.1.0
servers:
  - url: https://api.example.test/v2
paths:
  /orders/{id}:
    get:
      operationId: getOrder
      summary: Get one order
      tags:
        - Orders
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Order found
          content:
            application/json:
              schema:
                type: object
                required:
                  - id
                properties:
                  id:
                    type: string
                    example: order-42
`
}

func TestImportOpenAPICoversFilePickerAndDocumentOutcomes(t *testing.T) {
	validPath := writeOpenAPIBridgeFixture(
		t,
		"orders.yaml",
		validOpenAPIBridgeDocument(),
	)
	invalidPath := writeOpenAPIBridgeFixture(
		t,
		"invalid.yaml",
		"openapi: [",
	)

	t.Run("success caches the imported contract and maps metadata", func(t *testing.T) {
		bridge := NewBridge()
		bridge.filePicker = testFilePickerFunc(func(
			_ context.Context,
			options fileDialogOptions,
		) (string, error) {
			if options.Title != "OpenAPI dosyası seç" {
				t.Fatalf("file picker title = %q", options.Title)
			}
			if strings.Join(options.Extensions, ",") != "yaml,yml,json" {
				t.Fatalf("file picker extensions = %#v", options.Extensions)
			}
			return validPath, nil
		})
		Startup(bridge)(context.Background())
		t.Cleanup(func() { Shutdown(bridge)(context.Background()) })

		result := bridge.ImportOpenAPI()
		if result.Error != nil || result.Canceled {
			t.Fatalf("ImportOpenAPI() = %#v", result)
		}
		if result.Path != validPath || result.SpecID == "" ||
			result.Title != "Orders API" || result.Version != "2.1.0" ||
			result.BaseURL != "https://api.example.test/v2" {
			t.Fatalf("unexpected imported metadata: %#v", result)
		}
		if len(result.Endpoints) != 1 {
			t.Fatalf("imported endpoints = %#v", result.Endpoints)
		}
		endpoint := result.Endpoints[0]
		if endpoint.ID != "getOrder" || endpoint.Method != "GET" ||
			endpoint.Path != "/orders/{id}" ||
			endpoint.Summary != "Get one order" ||
			len(endpoint.Tags) != 1 || endpoint.Tags[0] != "Orders" {
			t.Fatalf("unexpected imported endpoint: %#v", endpoint)
		}
		cached := bridge.specs[result.SpecID]
		if len(cached) != 1 || cached[0].OperationID != "getOrder" {
			t.Fatalf("cached OpenAPI endpoints = %#v", cached)
		}
	})

	tests := []struct {
		name      string
		path      string
		pickerErr error
		wantCode  UserErrorCode
		canceled  bool
	}{
		{
			name:     "cancel",
			canceled: true,
		},
		{
			name:      "picker error",
			pickerErr: errors.New("picker unavailable"),
			wantCode:  UserErrorFileDialogFailed,
		},
		{
			name:     "invalid document",
			path:     invalidPath,
			wantCode: UserErrorInvalidOpenAPI,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			bridge := NewBridge()
			bridge.filePicker = testFilePickerFunc(func(
				context.Context,
				fileDialogOptions,
			) (string, error) {
				return test.path, test.pickerErr
			})
			Startup(bridge)(context.Background())
			t.Cleanup(func() { Shutdown(bridge)(context.Background()) })

			result := bridge.ImportOpenAPI()
			if result.Canceled != test.canceled {
				t.Fatalf(
					"ImportOpenAPI().Canceled = %t, want %t",
					result.Canceled,
					test.canceled,
				)
			}
			if test.wantCode == "" {
				if result.Error != nil {
					t.Fatalf("ImportOpenAPI() error = %#v", result.Error)
				}
			} else if result.Error == nil ||
				result.Error.Code != test.wantCode {
				t.Fatalf(
					"ImportOpenAPI() error = %#v, want %q",
					result.Error,
					test.wantCode,
				)
			}
			if result.Endpoints == nil || len(result.Endpoints) != 0 {
				t.Fatalf(
					"failed import endpoints = %#v, want non-nil empty",
					result.Endpoints,
				)
			}
			if len(bridge.specs) != 0 {
				t.Fatalf("failed import changed spec cache: %#v", bridge.specs)
			}
		})
	}
}

func TestImportMockOpenAPICoversFilePickerAndDocumentOutcomes(t *testing.T) {
	validPath := writeOpenAPIBridgeFixture(
		t,
		"mock-orders.yaml",
		validOpenAPIBridgeDocument(),
	)
	invalidPath := writeOpenAPIBridgeFixture(
		t,
		"invalid-mock.yaml",
		"openapi: [",
	)

	t.Run("success replaces routes and reports the imported path", func(t *testing.T) {
		bridge := NewBridge()
		bridge.filePicker = testFilePickerFunc(func(
			_ context.Context,
			options fileDialogOptions,
		) (string, error) {
			if options.Title != "Mock route üretilecek OpenAPI dosyasını seç" {
				t.Fatalf("file picker title = %q", options.Title)
			}
			return validPath, nil
		})
		Startup(bridge)(context.Background())
		t.Cleanup(func() { Shutdown(bridge)(context.Background()) })

		result := bridge.ImportMockOpenAPI()
		if result.Error != nil || result.Canceled {
			t.Fatalf("ImportMockOpenAPI() = %#v", result)
		}
		if result.ImportedPath != validPath || len(result.Routes) != 1 {
			t.Fatalf("unexpected mock import snapshot: %#v", result)
		}
		route := result.Routes[0]
		if route.Method != "GET" || route.Path != "/orders/{id}" ||
			route.Status != 200 || !route.Enabled ||
			!strings.Contains(route.Body, "order-42") {
			t.Fatalf("unexpected imported mock route: %#v", route)
		}
		if result.State.RouteCount != 1 ||
			result.State.EnabledCount != 1 {
			t.Fatalf("unexpected imported mock state: %#v", result.State)
		}
	})

	tests := []struct {
		name      string
		path      string
		pickerErr error
		wantCode  UserErrorCode
		canceled  bool
	}{
		{
			name:     "cancel",
			canceled: true,
		},
		{
			name:      "picker error",
			pickerErr: errors.New("picker unavailable"),
			wantCode:  UserErrorFileDialogFailed,
		},
		{
			name:     "invalid document",
			path:     invalidPath,
			wantCode: UserErrorInvalidOpenAPI,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			bridge := NewBridge()
			bridge.filePicker = testFilePickerFunc(func(
				context.Context,
				fileDialogOptions,
			) (string, error) {
				return test.path, test.pickerErr
			})
			Startup(bridge)(context.Background())
			t.Cleanup(func() { Shutdown(bridge)(context.Background()) })

			result := bridge.ImportMockOpenAPI()
			if result.Canceled != test.canceled {
				t.Fatalf(
					"ImportMockOpenAPI().Canceled = %t, want %t",
					result.Canceled,
					test.canceled,
				)
			}
			if test.wantCode == "" {
				if result.Error != nil {
					t.Fatalf("ImportMockOpenAPI() error = %#v", result.Error)
				}
			} else if result.Error == nil ||
				result.Error.Code != test.wantCode {
				t.Fatalf(
					"ImportMockOpenAPI() error = %#v, want %q",
					result.Error,
					test.wantCode,
				)
			}
			if result.Routes == nil || result.Hits == nil {
				t.Fatalf(
					"mock error snapshot contains nil collections: %#v",
					result,
				)
			}
			if len(result.Routes) != 0 ||
				result.State.RouteCount != 0 {
				t.Fatalf(
					"failed mock import changed routes: %#v",
					result,
				)
			}
		})
	}
}

func TestLintOpenAPICoversFilePickerAndInvalidDocumentOutcomes(t *testing.T) {
	invalidPath := writeOpenAPIBridgeFixture(
		t,
		"lint-invalid.yaml",
		"openapi: [",
	)
	missingPath := filepath.Join(t.TempDir(), "missing.yaml")

	tests := []struct {
		name       string
		path       string
		pickerErr  error
		wantCode   UserErrorCode
		wantIssue  string
		canceled   bool
		wantReport bool
	}{
		{
			name:     "cancel",
			canceled: true,
		},
		{
			name:      "picker error",
			pickerErr: errors.New("picker unavailable"),
			wantCode:  UserErrorFileDialogFailed,
		},
		{
			name:       "invalid document is a structured lint report",
			path:       invalidPath,
			wantIssue:  "document.parse",
			wantReport: true,
		},
		{
			name:     "unreadable document is an operation error",
			path:     missingPath,
			wantCode: UserErrorOpenAPILintFailed,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			bridge := NewBridge()
			bridge.filePicker = testFilePickerFunc(func(
				context.Context,
				fileDialogOptions,
			) (string, error) {
				return test.path, test.pickerErr
			})
			Startup(bridge)(context.Background())
			t.Cleanup(func() { Shutdown(bridge)(context.Background()) })

			result := bridge.LintOpenAPI()
			if result.Canceled != test.canceled {
				t.Fatalf(
					"LintOpenAPI().Canceled = %t, want %t",
					result.Canceled,
					test.canceled,
				)
			}
			if test.wantCode == "" {
				if result.Error != nil {
					t.Fatalf("LintOpenAPI() error = %#v", result.Error)
				}
			} else if result.Error == nil ||
				result.Error.Code != test.wantCode {
				t.Fatalf(
					"LintOpenAPI() error = %#v, want %q",
					result.Error,
					test.wantCode,
				)
			}
			if (result.Report != nil) != test.wantReport {
				t.Fatalf(
					"LintOpenAPI() report = %#v, wantReport=%t",
					result.Report,
					test.wantReport,
				)
			}
			if test.wantIssue != "" {
				if len(result.Report.Issues) == 0 ||
					string(result.Report.Issues[0].Code) != test.wantIssue ||
					result.Report.Summary.Errors == 0 {
					t.Fatalf(
						"LintOpenAPI() structured issues = %#v",
						result.Report,
					)
				}
			}
		})
	}
}

func TestOpenAPIFileOperationsRejectAfterShutdownWithoutOpeningPicker(
	t *testing.T,
) {
	pickerCalls := 0
	bridge := NewBridge()
	bridge.filePicker = testFilePickerFunc(func(
		context.Context,
		fileDialogOptions,
	) (string, error) {
		pickerCalls++
		return "", errors.New("picker must not open")
	})
	Startup(bridge)(context.Background())
	Shutdown(bridge)(context.Background())

	imported := bridge.ImportOpenAPI()
	if imported.Error == nil ||
		imported.Error.Code != UserErrorRuntimeUnavailable {
		t.Fatalf("ImportOpenAPI() after shutdown = %#v", imported)
	}
	mocked := bridge.ImportMockOpenAPI()
	if mocked.Error == nil ||
		mocked.Error.Code != UserErrorRuntimeUnavailable {
		t.Fatalf("ImportMockOpenAPI() after shutdown = %#v", mocked)
	}
	linted := bridge.LintOpenAPI()
	if linted.Error == nil ||
		linted.Error.Code != UserErrorRuntimeUnavailable {
		t.Fatalf("LintOpenAPI() after shutdown = %#v", linted)
	}
	if pickerCalls != 0 {
		t.Fatalf("file picker opened %d times after shutdown", pickerCalls)
	}
}

func TestOpenAPIFileOperationsFinishWhenShutdownCancelsPicker(t *testing.T) {
	tests := []struct {
		name string
		run  func(*Bridge) *UserError
	}{
		{
			name: "contract import",
			run: func(bridge *Bridge) *UserError {
				return bridge.ImportOpenAPI().Error
			},
		},
		{
			name: "mock import",
			run: func(bridge *Bridge) *UserError {
				return bridge.ImportMockOpenAPI().Error
			},
		},
		{
			name: "lint",
			run: func(bridge *Bridge) *UserError {
				return bridge.LintOpenAPI().Error
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			started := make(chan struct{})
			bridge := NewBridge()
			bridge.filePicker = testFilePickerFunc(func(
				ctx context.Context,
				_ fileDialogOptions,
			) (string, error) {
				close(started)
				<-ctx.Done()
				return "", ctx.Err()
			})
			Startup(bridge)(context.Background())

			result := make(chan *UserError, 1)
			go func() {
				result <- test.run(bridge)
			}()
			select {
			case <-started:
			case <-time.After(time.Second):
				t.Fatal("file picker did not start")
			}

			Shutdown(bridge)(context.Background())
			select {
			case userError := <-result:
				if userError == nil ||
					userError.Code != UserErrorFileDialogFailed {
					t.Fatalf(
						"operation error after shutdown = %#v",
						userError,
					)
				}
			case <-time.After(time.Second):
				t.Fatal("file operation remained blocked after shutdown")
			}
		})
	}
}

func TestOpenAPIFileOperationSessionGuardsRejectStaleRuntime(t *testing.T) {
	bridge := NewBridge()
	Startup(bridge)(context.Background())
	staleContext := bridge.runtimeContext()
	if staleContext == nil {
		t.Fatal("first runtime did not expose a lifecycle context")
	}

	Startup(bridge)(context.Background())
	t.Cleanup(func() { Shutdown(bridge)(context.Background()) })

	if bridge.runtimeContextIsCurrent(staleContext) {
		t.Fatal("restarted bridge accepted the previous runtime context")
	}
	if bridge.cacheOpenAPISpecForContext(
		staleContext,
		"stale-spec",
		nil,
	) {
		t.Fatal("stale OpenAPI import committed into the restarted session")
	}
	if _, exists := bridge.specs["stale-spec"]; exists {
		t.Fatal("stale OpenAPI spec was added to the bridge cache")
	}
}
