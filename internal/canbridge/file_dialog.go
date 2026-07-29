package canbridge

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	pathpkg "path"
	"path/filepath"
	"strings"
	"unicode"
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

type fileSaveDialogOptions struct {
	Title           string
	Extensions      []string
	DefaultFilename string
}

type filePicker interface {
	Open(context.Context, fileDialogOptions) (string, error)
}

type fileSaver interface {
	Save(context.Context, fileSaveDialogOptions) (string, error)
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
	if path == "" {
		return "", nil
	}
	if err := validateFileDialogExtension(path, options.Extensions); err != nil {
		return "", err
	}
	return path, nil
}

type systemFileSaver struct{}

func (systemFileSaver) Save(
	ctx context.Context,
	options fileSaveDialogOptions,
) (string, error) {
	prepared, err := prepareFileSaveDialogOptions(options)
	if err != nil {
		return "", err
	}
	release, err := systemFileDialogGate.acquire(ctx)
	if err != nil {
		return "", err
	}
	defer release()

	path, err := saveSystemFile(ctx, prepared)
	if errors.Is(err, errFileDialogCanceled) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil
	}
	return normalizedSavedFilePath(path, prepared.Extensions)
}

func prepareFileSaveDialogOptions(
	options fileSaveDialogOptions,
) (fileSaveDialogOptions, error) {
	prepared := options
	prepared.Extensions = normalizedFileDialogExtensions(options.Extensions)
	filename := strings.TrimSpace(
		pathpkg.Base(strings.ReplaceAll(options.DefaultFilename, `\`, "/")),
	)
	filename = strings.Map(func(character rune) rune {
		if unicode.IsControl(character) {
			return -1
		}
		if strings.ContainsRune(`<>:"|?*`, character) {
			return '_'
		}
		return character
	}, filename)
	if filename == "" || filename == "." || filename == ".." {
		filename = "export"
	}
	if len(prepared.Extensions) > 0 {
		extension := normalizedFileDialogExtension(filepath.Ext(filename))
		if extension == "" || !fileDialogExtensionAllowed(
			extension,
			prepared.Extensions,
		) {
			filename += "." + prepared.Extensions[0]
		}
	}
	prepared.DefaultFilename = filename
	return prepared, nil
}

func normalizedFileDialogExtensions(extensions []string) []string {
	normalized := make([]string, 0, len(extensions))
	seen := make(map[string]struct{}, len(extensions))
	for _, extension := range extensions {
		extension = normalizedFileDialogExtension(extension)
		if extension == "" {
			continue
		}
		if _, duplicate := seen[extension]; duplicate {
			continue
		}
		seen[extension] = struct{}{}
		normalized = append(normalized, extension)
	}
	return normalized
}

func normalizedFileDialogExtension(extension string) string {
	return strings.TrimPrefix(strings.ToLower(strings.TrimSpace(extension)), ".")
}

func fileDialogExtensionAllowed(
	extension string,
	allowed []string,
) bool {
	extension = normalizedFileDialogExtension(extension)
	for _, candidate := range allowed {
		if extension == normalizedFileDialogExtension(candidate) {
			return true
		}
	}
	return false
}

func validateFileDialogExtension(path string, extensions []string) error {
	if len(extensions) == 0 {
		return nil
	}
	selectedExtension := normalizedFileDialogExtension(filepath.Ext(path))
	if fileDialogExtensionAllowed(selectedExtension, extensions) {
		return nil
	}
	return fmt.Errorf(
		"selected file extension %q is not supported; expected one of: %s",
		selectedExtension,
		strings.Join(normalizedFileDialogExtensions(extensions), ", "),
	)
}

func normalizedSavedFilePath(
	path string,
	extensions []string,
) (string, error) {
	if path == "" {
		return "", nil
	}
	if err := validateFileDialogExtension(path, extensions); err != nil {
		return "", err
	}
	return path, nil
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
	return normalizedFileDialogCommandOutput(string(output.bytes)), err
}

func normalizedFileDialogCommandOutput(path string) string {
	if strings.HasSuffix(path, "\r\n") {
		path = strings.TrimSuffix(path, "\r\n")
	} else {
		path = strings.TrimSuffix(path, "\n")
	}
	return path
}
