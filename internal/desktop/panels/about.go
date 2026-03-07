//go:build desktop

package panels

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

type AboutPanel struct {
	container fyne.CanvasObject
}

func NewAboutPanel() *AboutPanel {
	content := container.NewVBox(
		widget.NewLabelWithStyle("About LazyTest", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		widget.NewSeparator(),
		widget.NewLabel("LazyTest Desktop"),
		widget.NewLabel("OpenAPI smoke, drift, compare and load testing"),
		widget.NewLabel("Navigation üzerinden tüm yeteneklere erişebilirsiniz."),
	)
	return &AboutPanel{container: container.NewPadded(content)}
}

func (p *AboutPanel) Container() fyne.CanvasObject { return p.container }
func (p *AboutPanel) OnShow()                      {}
func (p *AboutPanel) OnHide()                      {}
func (p *AboutPanel) Dispose()                     {}
