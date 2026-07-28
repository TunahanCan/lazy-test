package canbridge

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

var (
	errFileDialogCanceled = errors.New("file dialog canceled")
	systemFileDialogGate  = newFileDialogGate()
)

const maxFileDialogOutputBytes = 64 << 10

type fileDialogOptions struct {
	Title      string
	Extensions []string
}

type filePicker interface {
	Open(context.Context, fileDialogOptions) (string, error)
}

type systemFilePicker struct{}

func (systemFilePicker) Open(ctx context.Context, options fileDialogOptions) (string, error) {
	release, err := systemFileDialogGate.acquire(ctx)
	if err != nil {
		return "", err
	}
	defer release()

	path, err := openSystemFile(ctx, options)
	if errors.Is(err, errFileDialogCanceled) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	path = strings.TrimSpace(path)
	if path == "" {
		return "", nil
	}
	if len(options.Extensions) == 0 {
		return path, nil
	}

	selectedExtension := strings.TrimPrefix(strings.ToLower(filepath.Ext(path)), ".")
	for _, extension := range options.Extensions {
		if selectedExtension == strings.TrimPrefix(strings.ToLower(extension), ".") {
			return path, nil
		}
	}
	return "", fmt.Errorf(
		"selected file extension %q is not supported; expected one of: %s",
		selectedExtension,
		strings.Join(options.Extensions, ", "),
	)
}

// fileDialogGate serializes the process-global native dialog resource while
// still allowing a queued caller to leave immediately when its session ends.
type fileDialogGate struct {
	slot chan struct{}
}

func newFileDialogGate() *fileDialogGate {
	return &fileDialogGate{slot: make(chan struct{}, 1)}
}

func (gate *fileDialogGate) acquire(
	ctx context.Context,
) (func(), error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	select {
	case gate.slot <- struct{}{}:
		if err := ctx.Err(); err != nil {
			<-gate.slot
			return nil, err
		}
		return func() { <-gate.slot }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

type boundedFileDialogOutput struct {
	bytes    []byte
	exceeded bool
}

func (output *boundedFileDialogOutput) Write(data []byte) (int, error) {
	remaining := maxFileDialogOutputBytes - len(output.bytes)
	if remaining > 0 {
		retained := len(data)
		if retained > remaining {
			retained = remaining
		}
		output.bytes = append(output.bytes, data[:retained]...)
	}
	if len(data) > remaining {
		output.exceeded = true
	}
	return len(data), nil
}

func runFileDialogCommand(
	ctx context.Context,
	command *exec.Cmd,
) (string, error) {
	if command == nil {
		return "", fmt.Errorf("file dialog command is required")
	}
	var output boundedFileDialogOutput
	command.Stdout = &output
	err := command.Run()
	if ctx != nil && ctx.Err() != nil {
		return "", ctx.Err()
	}
	if output.exceeded {
		return "", fmt.Errorf(
			"file dialog output exceeds %d bytes",
			maxFileDialogOutputBytes,
		)
	}
	return strings.TrimSpace(string(output.bytes)), err
}
