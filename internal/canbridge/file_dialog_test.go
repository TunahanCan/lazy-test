package canbridge

import (
	"context"
	"errors"
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
