//go:build linux

package canbridge

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

func openSystemFile(ctx context.Context, options fileDialogOptions) (string, error) {
	if binary, err := exec.LookPath("zenity"); err == nil {
		arguments := []string{"--file-selection", "--title=" + options.Title}
		if len(options.Extensions) > 0 {
			patterns := make([]string, 0, len(options.Extensions))
			for _, extension := range options.Extensions {
				patterns = append(patterns, "*."+strings.TrimPrefix(extension, "."))
			}
			arguments = append(arguments, "--file-filter=Supported files | "+strings.Join(patterns, " "))
		}
		return runLinuxFilePicker(ctx, binary, arguments...)
	}
	if binary, err := exec.LookPath("kdialog"); err == nil {
		patterns := make([]string, 0, len(options.Extensions))
		for _, extension := range options.Extensions {
			patterns = append(patterns, "*."+strings.TrimPrefix(extension, "."))
		}
		filter := strings.Join(patterns, " ")
		return runLinuxFilePicker(ctx, binary, "--getopenfilename", "", filter, "--title", options.Title)
	}
	return "", fmt.Errorf("no supported native file picker found; install zenity or kdialog")
}

func runLinuxFilePicker(ctx context.Context, binary string, arguments ...string) (string, error) {
	path, err := runFileDialogCommand(
		ctx,
		exec.CommandContext(ctx, binary, arguments...),
	)
	if err != nil {
		if errors.Is(ctx.Err(), context.Canceled) {
			return "", ctx.Err()
		}
		var exitError *exec.ExitError
		if errors.As(err, &exitError) && exitError.ExitCode() == 1 {
			return "", errFileDialogCanceled
		}
		return "", err
	}
	if path == "" {
		return "", errFileDialogCanceled
	}
	return path, nil
}
