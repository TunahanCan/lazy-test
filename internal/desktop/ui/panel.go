//go:build desktop

package ui

import "fyne.io/fyne/v2"

// Panel is the shared contract for all desktop panels.
type Panel interface {
	Container() fyne.CanvasObject
	OnShow()
	OnHide()
	Dispose()
}
