//go:build desktop

package desktop

import "lazytest/internal/desktop/ui"

// RunNewUI starts the new modular Fyne UI.
func RunNewUI(app *App) error {
	agg := NewRunEventAggregator(120, 400)
	mainWindow := ui.NewMainWindow(app, agg)
	mainWindow.Show()
	return nil
}
