//go:build desktop

package dialogs

import (
	"os"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/dialog"
)

// ShowExportDialog opens save dialog and writes the provided content.
func ShowExportDialog(win fyne.Window, defaultName string, content []byte, onDone func(error)) {
	save := dialog.NewFileSave(func(w fyne.URIWriteCloser, err error) {
		if err != nil {
			if onDone != nil {
				onDone(err)
			}
			return
		}
		if w == nil {
			return
		}
		_, writeErr := w.Write(content)
		closeErr := w.Close()
		if writeErr == nil {
			writeErr = closeErr
		}
		if onDone != nil {
			onDone(writeErr)
		}
	}, win)
	save.SetFileName(defaultName)
	save.Show()
}

// ExportBytesToPath writes bytes to path.
func ExportBytesToPath(path string, content []byte) error {
	return os.WriteFile(path, content, 0o600)
}
