//go:build !darwin && !linux && !windows

package canbridge

import (
	"context"
	"fmt"
	"runtime"
)

func openSystemFile(context.Context, fileDialogOptions) (string, error) {
	return "", fmt.Errorf("native file picker is not supported on %s", runtime.GOOS)
}

func saveSystemFile(context.Context, fileSaveDialogOptions) (string, error) {
	return "", fmt.Errorf("native file saver is not supported on %s", runtime.GOOS)
}
