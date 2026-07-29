package canbridge

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type collectionTestFilePickerFunc func(
	context.Context,
	fileDialogOptions,
) (string, error)

func (picker collectionTestFilePickerFunc) Open(
	ctx context.Context,
	options fileDialogOptions,
) (string, error) {
	return picker(ctx, options)
}

type testFileSaverFunc func(
	context.Context,
	fileSaveDialogOptions,
) (string, error)

func (saver testFileSaverFunc) Save(
	ctx context.Context,
	options fileSaveDialogOptions,
) (string, error) {
	return saver(ctx, options)
}

func startCollectionTransferBridge(t *testing.T) *Bridge {
	t.Helper()
	bridge := NewBridge()
	Startup(bridge)(context.Background())
	t.Cleanup(func() {
		Shutdown(bridge)(context.Background())
	})
	return bridge
}

func writeCollectionTransferFixture(
	t *testing.T,
	name string,
	data []byte,
) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestImportCollectionFileReturnsBoundedUTF8Data(t *testing.T) {
	document := `{"format":"validex.collection","version":1,"collections":[]}`
	path := writeCollectionTransferFixture(
		t,
		"collections.json",
		[]byte(document),
	)
	bridge := startCollectionTransferBridge(t)
	bridge.filePicker = collectionTestFilePickerFunc(func(
		_ context.Context,
		options fileDialogOptions,
	) (string, error) {
		if options.Title != "Koleksiyon dosyası seç" {
			t.Fatalf("picker title = %q", options.Title)
		}
		if strings.Join(options.Extensions, ",") != "json" {
			t.Fatalf("picker extensions = %#v", options.Extensions)
		}
		return path, nil
	})

	result := bridge.ImportCollectionFile()
	if result.Error != nil || result.Canceled {
		t.Fatalf("ImportCollectionFile() = %#v", result)
	}
	if result.Path != path || result.Data != document {
		t.Fatalf("import result = %#v", result)
	}
}

func TestImportCollectionFileCoversPickerAndReadFailures(t *testing.T) {
	invalidUTF8 := writeCollectionTransferFixture(
		t,
		"invalid.json",
		[]byte{0xff, 0xfe},
	)
	oversized := filepath.Join(t.TempDir(), "oversized.json")
	file, err := os.Create(oversized)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(maxCollectionLibraryDocumentBytes + 1); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()

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
			name:      "picker failure",
			pickerErr: errors.New("picker unavailable"),
			wantCode:  UserErrorFileDialogFailed,
		},
		{
			name:     "invalid UTF-8",
			path:     invalidUTF8,
			wantCode: UserErrorCollectionFileInvalid,
		},
		{
			name:     "oversized",
			path:     oversized,
			wantCode: UserErrorCollectionFileInvalid,
		},
		{
			name:     "non-regular file",
			path:     directory,
			wantCode: UserErrorCollectionFileInvalid,
		},
		{
			name:     "missing file",
			path:     filepath.Join(t.TempDir(), "missing.json"),
			wantCode: UserErrorCollectionFileReadFailed,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			bridge := startCollectionTransferBridge(t)
			bridge.filePicker = collectionTestFilePickerFunc(func(
				context.Context,
				fileDialogOptions,
			) (string, error) {
				return test.path, test.pickerErr
			})

			result := bridge.ImportCollectionFile()
			if result.Canceled != test.canceled {
				t.Fatalf(
					"ImportCollectionFile().Canceled = %t, want %t",
					result.Canceled,
					test.canceled,
				)
			}
			if test.wantCode == "" {
				if result.Error != nil {
					t.Fatalf("ImportCollectionFile() error = %#v", result.Error)
				}
			} else if result.Error == nil || result.Error.Code != test.wantCode {
				t.Fatalf(
					"ImportCollectionFile() error = %#v, want %q",
					result.Error,
					test.wantCode,
				)
			}
			if result.Data != "" {
				t.Fatalf("failed import returned data: %q", result.Data)
			}
		})
	}
}

func TestImportCollectionFileRequiresRunningRuntime(t *testing.T) {
	result := NewBridge().ImportCollectionFile()
	if result.Error == nil ||
		result.Error.Code != UserErrorRuntimeUnavailable ||
		result.Canceled ||
		result.Data != "" ||
		result.Path != "" {
		t.Fatalf("ImportCollectionFile() before startup = %#v", result)
	}
}

func TestExportCollectionFileValidatesAndAtomicallyWritesJSON(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "orders.json")
	if err := os.WriteFile(path, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	document := `{"format":"validex.collection","version":1,"collections":[]}`
	bridge := startCollectionTransferBridge(t)
	bridge.fileSaver = testFileSaverFunc(func(
		_ context.Context,
		options fileSaveDialogOptions,
	) (string, error) {
		if options.Title != "Koleksiyonları dışa aktar" {
			t.Fatalf("saver title = %q", options.Title)
		}
		if strings.Join(options.Extensions, ",") != "json" {
			t.Fatalf("saver extensions = %#v", options.Extensions)
		}
		if options.DefaultFilename != "Orders collection" {
			t.Fatalf("default filename = %q", options.DefaultFilename)
		}
		return path, nil
	})

	result := bridge.ExportCollectionFile(CollectionFileExportInput{
		Data:          document,
		SuggestedName: "Orders collection",
	})
	if result.Error != nil || result.Canceled || !result.Exported {
		t.Fatalf("ExportCollectionFile() = %#v", result)
	}
	if result.Path != path {
		t.Fatalf("export path = %q, want %q", result.Path, path)
	}
	persisted, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(persisted) != document {
		t.Fatalf("exported document = %q", persisted)
	}
	if information, err := os.Stat(path); err != nil {
		t.Fatal(err)
	} else if permissions := information.Mode().Perm(); permissions != 0o600 {
		t.Fatalf("export permissions = %o, want 600", permissions)
	}
	matches, err := filepath.Glob(
		filepath.Join(directory, ".validex-collection-export-*.tmp"),
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 0 {
		t.Fatalf("temporary export files remain: %#v", matches)
	}
}

func TestExportCollectionFileCoversValidationDialogAndWriteOutcomes(
	t *testing.T,
) {
	valid := `{"version":1,"collections":[]}`
	oversized := `"` + strings.Repeat(
		"x",
		maxCollectionLibraryDocumentBytes,
	) + `"`
	tests := []struct {
		name          string
		input         CollectionFileExportInput
		path          string
		saverErr      error
		wantCode      UserErrorCode
		canceled      bool
		saverExpected bool
	}{
		{
			name:     "invalid JSON",
			input:    CollectionFileExportInput{Data: "{"},
			wantCode: UserErrorCollectionFileInvalid,
		},
		{
			name:     "oversized JSON",
			input:    CollectionFileExportInput{Data: oversized},
			wantCode: UserErrorCollectionFileInvalid,
		},
		{
			name:          "cancel",
			input:         CollectionFileExportInput{Data: valid},
			canceled:      true,
			saverExpected: true,
		},
		{
			name:          "dialog failure",
			input:         CollectionFileExportInput{Data: valid},
			saverErr:      errors.New("save picker unavailable"),
			wantCode:      UserErrorFileDialogFailed,
			saverExpected: true,
		},
		{
			name:          "invalid target",
			input:         CollectionFileExportInput{Data: valid},
			path:          t.TempDir(),
			wantCode:      UserErrorCollectionFileWriteFailed,
			saverExpected: true,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			bridge := startCollectionTransferBridge(t)
			saverCalled := false
			bridge.fileSaver = testFileSaverFunc(func(
				context.Context,
				fileSaveDialogOptions,
			) (string, error) {
				saverCalled = true
				return test.path, test.saverErr
			})

			result := bridge.ExportCollectionFile(test.input)
			if saverCalled != test.saverExpected {
				t.Fatalf(
					"file saver called = %t, want %t",
					saverCalled,
					test.saverExpected,
				)
			}
			if result.Canceled != test.canceled {
				t.Fatalf(
					"ExportCollectionFile().Canceled = %t, want %t",
					result.Canceled,
					test.canceled,
				)
			}
			if result.Exported {
				t.Fatalf("failed export reported success: %#v", result)
			}
			if test.wantCode == "" {
				if result.Error != nil {
					t.Fatalf("ExportCollectionFile() error = %#v", result.Error)
				}
			} else if result.Error == nil || result.Error.Code != test.wantCode {
				t.Fatalf(
					"ExportCollectionFile() error = %#v, want %q",
					result.Error,
					test.wantCode,
				)
			}
		})
	}
}

func TestExportCollectionFileUsesDefaultSuggestedFilename(t *testing.T) {
	bridge := startCollectionTransferBridge(t)
	bridge.fileSaver = testFileSaverFunc(func(
		_ context.Context,
		options fileSaveDialogOptions,
	) (string, error) {
		if options.DefaultFilename != defaultCollectionExportFilename {
			t.Fatalf("default filename = %q", options.DefaultFilename)
		}
		return "", nil
	})

	result := bridge.ExportCollectionFile(CollectionFileExportInput{
		Data: `{"version":1}`,
	})
	if !result.Canceled || result.Error != nil || result.Exported {
		t.Fatalf("ExportCollectionFile() = %#v", result)
	}
}

func TestCollectionFileMethodsInvokeThroughTypedRegistry(t *testing.T) {
	importPath := writeCollectionTransferFixture(
		t,
		"invoke.json",
		[]byte(`{"version":1}`),
	)
	exportPath := filepath.Join(t.TempDir(), "invoke-export.json")
	bridge := startCollectionTransferBridge(t)
	bridge.filePicker = collectionTestFilePickerFunc(func(
		context.Context,
		fileDialogOptions,
	) (string, error) {
		return importPath, nil
	})
	bridge.fileSaver = testFileSaverFunc(func(
		context.Context,
		fileSaveDialogOptions,
	) (string, error) {
		return exportPath, nil
	})

	rawImport, err := bridge.Invoke(bridgeMethodImportCollectionFile, "[]")
	if err != nil {
		t.Fatal(err)
	}
	imported, ok := rawImport.(CollectionFileImportResult)
	if !ok || imported.Error != nil || imported.Data != `{"version":1}` {
		t.Fatalf("typed import result = %#v", rawImport)
	}

	arguments, err := json.Marshal([]any{CollectionFileExportInput{
		Data:          `{"version":1}`,
		SuggestedName: "invoke-export.json",
	}})
	if err != nil {
		t.Fatal(err)
	}
	rawExport, err := bridge.Invoke(
		bridgeMethodExportCollectionFile,
		string(arguments),
	)
	if err != nil {
		t.Fatal(err)
	}
	exported, ok := rawExport.(CollectionFileExportResult)
	if !ok || exported.Error != nil || !exported.Exported {
		t.Fatalf("typed export result = %#v", rawExport)
	}

	if _, err := bridge.Invoke(
		bridgeMethodImportCollectionFile,
		`[{"unexpected":true}]`,
	); err == nil {
		t.Fatal("ImportCollectionFile accepted an argument")
	}
	if _, err := bridge.Invoke(
		bridgeMethodExportCollectionFile,
		`[]`,
	); err == nil {
		t.Fatal("ExportCollectionFile accepted a missing argument")
	}
}
