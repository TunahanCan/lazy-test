package canbridge

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
)

func TestFileDialogGateAllowsCanceledWaitersToLeave(t *testing.T) {
	t.Parallel()
	gate := newFileDialogGate()
	release, err := gate.acquire(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	waiting, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := gate.acquire(waiting); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled acquire error = %v", err)
	}

	release()
	nextRelease, err := gate.acquire(context.Background())
	if err != nil {
		t.Fatalf("acquire after release error = %v", err)
	}
	nextRelease()
}

func TestFileDialogOutputRetainsOnlyBoundedBytes(t *testing.T) {
	t.Parallel()
	var output boundedFileDialogOutput
	input := make([]byte, maxFileDialogOutputBytes+1)
	written, err := output.Write(input)
	if err != nil || written != len(input) {
		t.Fatalf("Write() = (%d, %v), want (%d, nil)", written, err, len(input))
	}
	if !output.exceeded || len(output.bytes) != maxFileDialogOutputBytes {
		t.Fatalf(
			"bounded output = %d bytes, exceeded=%t",
			len(output.bytes),
			output.exceeded,
		)
	}
}

func TestFileDialogCommandOutputRemovesOnlyItsLineEnding(t *testing.T) {
	t.Parallel()

	if output := normalizedFileDialogCommandOutput(
		" /tmp/collections.json \r\n",
	); output != " /tmp/collections.json " {
		t.Fatalf("normalized output = %q", output)
	}
	if output := normalizedFileDialogCommandOutput(
		"/tmp/collections.json\n\n",
	); output != "/tmp/collections.json\n" {
		t.Fatalf("path newline was removed: %q", output)
	}
}

func TestPrepareFileSaveDialogOptionsNormalizesFilenameAndExtensions(
	t *testing.T,
) {
	t.Parallel()

	prepared, err := prepareFileSaveDialogOptions(fileSaveDialogOptions{
		Title:           "Export",
		Extensions:      []string{".JSON", "json", "", ".bru"},
		DefaultFilename: "../nested/Orders:\nbackup?.txt",
	})
	if err != nil {
		t.Fatal(err)
	}
	if prepared.Title != "Export" {
		t.Fatalf("prepared title = %q", prepared.Title)
	}
	if !reflect.DeepEqual(prepared.Extensions, []string{"json", "bru"}) {
		t.Fatalf("prepared extensions = %#v", prepared.Extensions)
	}
	if prepared.DefaultFilename != "Orders_backup_.txt.json" {
		t.Fatalf(
			"prepared default filename = %q",
			prepared.DefaultFilename,
		)
	}
}

func TestPrepareFileSaveDialogOptionsUsesSafeFallback(t *testing.T) {
	t.Parallel()

	prepared, err := prepareFileSaveDialogOptions(fileSaveDialogOptions{
		Extensions:      []string{"json"},
		DefaultFilename: "..",
	})
	if err != nil {
		t.Fatal(err)
	}
	if prepared.DefaultFilename != "export.json" {
		t.Fatalf(
			"prepared default filename = %q, want export.json",
			prepared.DefaultFilename,
		)
	}
}

func TestNormalizedSavedFilePathEnforcesExtension(t *testing.T) {
	t.Parallel()

	directory := t.TempDir()
	withoutExtension := filepath.Join(directory, "collections")
	if _, err := normalizedSavedFilePath(
		withoutExtension,
		[]string{"json"},
	); err == nil {
		t.Fatal("extensionless save path was accepted")
	}

	upperCase := filepath.Join(directory, "collections.JSON")
	normalized, err := normalizedSavedFilePath(
		upperCase,
		[]string{".json"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if normalized != upperCase {
		t.Fatalf("uppercase extension path changed to %q", normalized)
	}

	if _, err := normalizedSavedFilePath(
		filepath.Join(directory, "collections.txt"),
		[]string{"json"},
	); err == nil {
		t.Fatal("unsupported save extension was accepted")
	}

	trailingSpace := filepath.Join(directory, "collections.json ")
	normalized, err = normalizedSavedFilePath(
		trailingSpace,
		[]string{"json"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if normalized != trailingSpace {
		t.Fatalf("valid path whitespace changed to %q", normalized)
	}
}
