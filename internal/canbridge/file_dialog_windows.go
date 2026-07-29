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

const saveFilePowerShell = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Title = $env:CANBRIDGE_DIALOG_TITLE
$dialog.Filter = $env:CANBRIDGE_DIALOG_FILTER
$dialog.FileName = $env:CANBRIDGE_DIALOG_DEFAULT_FILENAME
$dialog.DefaultExt = $env:CANBRIDGE_DIALOG_DEFAULT_EXTENSION
$dialog.AddExtension = $true
$dialog.OverwritePrompt = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
	[Console]::Out.Write($dialog.FileName)
}
`

func openSystemFile(ctx context.Context, options fileDialogOptions) (string, error) {
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
		"CANBRIDGE_DIALOG_FILTER="+windowsFileDialogFilter(options.Extensions),
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

func saveSystemFile(
	ctx context.Context,
	options fileSaveDialogOptions,
) (string, error) {
	defaultExtension := ""
	if len(options.Extensions) > 0 {
		defaultExtension = strings.TrimPrefix(options.Extensions[0], ".")
	}
	command := exec.CommandContext(
		ctx,
		"powershell.exe",
		"-NoProfile",
		"-NonInteractive",
		"-STA",
		"-Command",
		saveFilePowerShell,
	)
	command.Env = append(
		os.Environ(),
		"CANBRIDGE_DIALOG_TITLE="+options.Title,
		"CANBRIDGE_DIALOG_FILTER="+windowsFileDialogFilter(options.Extensions),
		"CANBRIDGE_DIALOG_DEFAULT_FILENAME="+options.DefaultFilename,
		"CANBRIDGE_DIALOG_DEFAULT_EXTENSION="+defaultExtension,
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

func windowsFileDialogFilter(extensions []string) string {
	patterns := make([]string, 0, len(extensions))
	for _, extension := range extensions {
		patterns = append(patterns, "*."+strings.TrimPrefix(extension, "."))
	}
	if len(patterns) == 0 {
		return "All files (*.*)|*.*"
	}
	return "Supported files (" + strings.Join(patterns, ", ") + ")|" +
		strings.Join(patterns, ";")
}
