//go:build darwin

package canbridge

import (
	"context"
	"errors"
	"os/exec"
	"strings"
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

func openSystemFile(ctx context.Context, options fileDialogOptions) (string, error) {
	output, err := exec.CommandContext(
		ctx,
		"osascript",
		"-e",
		chooseFileAppleScript,
		options.Title,
	).Output()
	if err != nil {
		if errors.Is(ctx.Err(), context.Canceled) {
			return "", ctx.Err()
		}
		return "", err
	}
	path := strings.TrimSpace(string(output))
	if path == "" {
		return "", errFileDialogCanceled
	}
	return path, nil
}
