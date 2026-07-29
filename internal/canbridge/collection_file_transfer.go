package canbridge

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

const defaultCollectionExportFilename = "validex-collections.json"

var (
	errCollectionFileTooLarge = errors.New("collection file exceeds size limit")
	errCollectionFileInvalid  = errors.New("collection file is invalid")
)

// ImportCollectionFile lets the frontend import a user-selected portable
// collection document without granting browser code arbitrary filesystem
// access. The frontend owns the versioned transfer schema; native code owns
// picker, bounded-read and UTF-8 safety boundaries.
func (b *Bridge) ImportCollectionFile() CollectionFileImportResult {
	result := CollectionFileImportResult{}
	ctx := b.runtimeContext()
	if ctx == nil {
		result.Error = collectionFileRuntimeUnavailableError()
		return result
	}
	if b.filePicker == nil {
		result.Error = collectionFileDialogError(errors.New("file picker is unavailable"))
		return result
	}
	path, err := b.filePicker.Open(ctx, fileDialogOptions{
		Title:      "Koleksiyon dosyası seç",
		Extensions: []string{"json"},
	})
	if err != nil {
		result.Error = collectionFileDialogError(err)
		return result
	}
	if path == "" {
		result.Canceled = true
		return result
	}

	result.Path = path
	data, err := readCollectionTransferFile(ctx, path)
	if err != nil {
		switch {
		case errors.Is(err, errCollectionFileTooLarge),
			errors.Is(err, errCollectionFileInvalid):
			result.Error = collectionFileInvalidError(err)
		default:
			result.Error = collectionFileReadError(err)
		}
		return result
	}
	result.Data = data
	return result
}

// ExportCollectionFile validates a portable JSON document before asking the
// user where it should be written. The target is published with an atomic
// replacement so a failed write cannot leave a truncated export behind.
func (b *Bridge) ExportCollectionFile(
	input CollectionFileExportInput,
) CollectionFileExportResult {
	result := CollectionFileExportResult{}
	ctx := b.runtimeContext()
	if ctx == nil {
		result.Error = collectionFileRuntimeUnavailableError()
		return result
	}
	if err := validateCollectionTransferData(input.Data); err != nil {
		result.Error = collectionFileInvalidError(err)
		return result
	}
	if b.fileSaver == nil {
		result.Error = collectionFileDialogError(errors.New("file saver is unavailable"))
		return result
	}

	defaultFilename := strings.TrimSpace(input.SuggestedName)
	if defaultFilename == "" {
		defaultFilename = defaultCollectionExportFilename
	}
	path, err := b.fileSaver.Save(ctx, fileSaveDialogOptions{
		Title:           "Koleksiyonları dışa aktar",
		Extensions:      []string{"json"},
		DefaultFilename: defaultFilename,
	})
	if err != nil {
		result.Error = collectionFileDialogError(err)
		return result
	}
	if path == "" {
		result.Canceled = true
		return result
	}

	result.Path = path
	published, err := writeCollectionTransferFile(
		ctx,
		path,
		[]byte(input.Data),
	)
	result.Exported = published
	if err != nil {
		result.Error = collectionFileWriteError(err)
	}
	return result
}

func readCollectionTransferFile(
	ctx context.Context,
	path string,
) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	information, err := os.Lstat(path)
	if err != nil {
		return "", fmt.Errorf("inspect collection import: %w", err)
	}
	if !information.Mode().IsRegular() {
		return "", fmt.Errorf("%w: selected path is not a regular file", errCollectionFileInvalid)
	}
	if information.Size() > maxCollectionLibraryDocumentBytes {
		return "", errCollectionFileTooLarge
	}

	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open collection import: %w", err)
	}
	data, readErr := io.ReadAll(
		io.LimitReader(file, maxCollectionLibraryDocumentBytes+1),
	)
	closeErr := file.Close()
	if readErr != nil {
		return "", fmt.Errorf("read collection import: %w", readErr)
	}
	if closeErr != nil {
		return "", fmt.Errorf("close collection import: %w", closeErr)
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if len(data) > maxCollectionLibraryDocumentBytes {
		return "", errCollectionFileTooLarge
	}
	if !utf8.Valid(data) {
		return "", fmt.Errorf("%w: document is not valid UTF-8", errCollectionFileInvalid)
	}
	return string(data), nil
}

func validateCollectionTransferData(data string) error {
	payload := []byte(data)
	if len(payload) > maxCollectionLibraryDocumentBytes {
		return errCollectionFileTooLarge
	}
	if !utf8.ValidString(data) {
		return fmt.Errorf("%w: document is not valid UTF-8", errCollectionFileInvalid)
	}
	if len(bytes.TrimSpace(payload)) == 0 || !json.Valid(payload) {
		return fmt.Errorf("%w: document is not valid JSON", errCollectionFileInvalid)
	}
	return nil
}

func writeCollectionTransferFile(
	ctx context.Context,
	path string,
	payload []byte,
) (published bool, err error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	path = filepath.Clean(path)
	if path == "." || !filepath.IsAbs(path) {
		return false, errors.New("collection export path must be absolute")
	}
	if information, inspectErr := os.Lstat(path); inspectErr == nil {
		if !information.Mode().IsRegular() {
			return false, errors.New("collection export path is not a regular file")
		}
	} else if !errors.Is(inspectErr, os.ErrNotExist) {
		return false, fmt.Errorf("inspect collection export: %w", inspectErr)
	}

	directory := filepath.Dir(path)
	directoryInformation, err := os.Stat(directory)
	if err != nil {
		return false, fmt.Errorf("inspect collection export directory: %w", err)
	}
	if !directoryInformation.IsDir() {
		return false, errors.New("collection export parent is not a directory")
	}

	temporary, err := os.CreateTemp(directory, ".validex-collection-export-*.tmp")
	if err != nil {
		return false, fmt.Errorf("create collection export temporary file: %w", err)
	}
	temporaryPath := temporary.Name()
	removeTemporary := true
	defer func() {
		if removeTemporary {
			_ = os.Remove(temporaryPath)
		}
	}()

	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return false, fmt.Errorf("secure collection export temporary file: %w", err)
	}
	if err := ctx.Err(); err != nil {
		_ = temporary.Close()
		return false, err
	}
	if _, err := temporary.Write(payload); err != nil {
		_ = temporary.Close()
		return false, fmt.Errorf("write collection export: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return false, fmt.Errorf("sync collection export: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return false, fmt.Errorf("close collection export: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return false, err
	}
	if err := replaceCollectionLibraryFile(temporaryPath, path); err != nil {
		return false, fmt.Errorf("publish collection export: %w", err)
	}
	removeTemporary = false
	if err := syncCollectionLibraryDirectory(directory); err != nil {
		return true, fmt.Errorf("sync collection export directory: %w", err)
	}
	return true, nil
}

func collectionFileRuntimeUnavailableError() *UserError {
	return &UserError{
		Code:    UserErrorRuntimeUnavailable,
		Title:   "Koleksiyon dosyası açılamadı",
		Message: "Desktop runtime henüz hazır değil.",
	}
}

func collectionFileDialogError(err error) *UserError {
	return &UserError{
		Code:      UserErrorFileDialogFailed,
		Title:     "Koleksiyon dosyası seçilemedi",
		Message:   "Sistem dosya seçicisi tamamlanamadı.",
		Technical: err.Error(),
	}
}

func collectionFileInvalidError(err error) *UserError {
	return &UserError{
		Code:      UserErrorCollectionFileInvalid,
		Title:     "Koleksiyon dosyası geçersiz",
		Message:   "Koleksiyon aktarımı geçerli, boyut sınırları içindeki bir UTF-8 JSON dosyası olmalıdır.",
		Hint:      "Dosyanın JSON biçimini ve boyutunu kontrol edin.",
		Technical: err.Error(),
	}
}

func collectionFileReadError(err error) *UserError {
	return &UserError{
		Code:      UserErrorCollectionFileReadFailed,
		Title:     "Koleksiyon dosyası okunamadı",
		Message:   "Seçilen koleksiyon dosyasının içeriği okunamadı.",
		Hint:      "Dosya izinlerini ve dosyanın hâlâ erişilebilir olduğunu kontrol edin.",
		Technical: err.Error(),
	}
}

func collectionFileWriteError(err error) *UserError {
	return &UserError{
		Code:      UserErrorCollectionFileWriteFailed,
		Title:     "Koleksiyon dosyası yazılamadı",
		Message:   "Koleksiyonlar seçilen konuma kaydedilemedi.",
		Hint:      "Klasör izinlerini ve kullanılabilir disk alanını kontrol edin.",
		Technical: err.Error(),
	}
}
