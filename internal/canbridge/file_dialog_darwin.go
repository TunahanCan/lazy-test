//go:build darwin

package canbridge

import (
	"context"
	"errors"
	"os/exec"
)

const chooseFileAppleScript = `
on run argv
	set promptText to item 1 of argv
	try
		set selectedFile to choose file with prompt promptText
		return POSIX path of selectedFile
	on error number -128
		return ""
	end try
end run
`

const saveFileAppleScript = `
on run argv
	set promptText to item 1 of argv
	set defaultFilename to item 2 of argv
	try
		set selectedFile to choose file name with prompt promptText default name defaultFilename
		return POSIX path of selectedFile
	on error number -128
		return ""
	end try
end run
`

func openSystemFile(ctx context.Context, options fileDialogOptions) (string, error) {
	path, err := runFileDialogCommand(ctx, exec.CommandContext(
		ctx,
		"osascript",
		"-e",
		chooseFileAppleScript,
		options.Title,
	))
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
	path, err := runFileDialogCommand(ctx, exec.CommandContext(
		ctx,
		"osascript",
		"-e",
		saveFileAppleScript,
		options.Title,
		options.DefaultFilename,
	))
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
