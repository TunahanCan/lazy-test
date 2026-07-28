//go:build windows

package canbridge

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"strings"
)

const chooseFilePowerShell = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = $env:CANBRIDGE_DIALOG_TITLE
$dialog.Filter = $env:CANBRIDGE_DIALOG_FILTER
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
	[Console]::Out.Write($dialog.FileName)
}
`

func openSystemFile(ctx context.Context, options fileDialogOptions) (string, error) {
	patterns := make([]string, 0, len(options.Extensions))
	for _, extension := range options.Extensions {
		patterns = append(patterns, "*."+strings.TrimPrefix(extension, "."))
	}
	filter := "All files (*.*)|*.*"
	if len(patterns) > 0 {
		filter = "Supported files (" + strings.Join(patterns, ", ") + ")|" +
			strings.Join(patterns, ";")
	}

	command := exec.CommandContext(
		ctx,
		"powershell.exe",
		"-NoProfile",
		"-NonInteractive",
		"-STA",
		"-Command",
		chooseFilePowerShell,
	)
	command.Env = append(
		os.Environ(),
		"CANBRIDGE_DIALOG_TITLE="+options.Title,
		"CANBRIDGE_DIALOG_FILTER="+filter,
	)
	path, err := runFileDialogCommand(ctx, command)
	if err != nil {
		if errors.Is(ctx.Err(), context.Canceled) {
			return "", ctx.Err()
		}
		return "", err
	}
	if path == "" {
		return "", errFileDialogCanceled
	}
	return path, nil
}
