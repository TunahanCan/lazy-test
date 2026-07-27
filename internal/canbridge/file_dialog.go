package canbridge

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
)

var (
	errFileDialogCanceled = errors.New("file dialog canceled")
	fileDialogMu          sync.Mutex
)

type fileDialogOptions struct {
	Title      string
	Extensions []string
}

type filePicker interface {
	Open(context.Context, fileDialogOptions) (string, error)
}

type systemFilePicker struct{}

func (systemFilePicker) Open(ctx context.Context, options fileDialogOptions) (string, error) {
	fileDialogMu.Lock()
	defer fileDialogMu.Unlock()

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
