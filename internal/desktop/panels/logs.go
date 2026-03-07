//go:build desktop

package panels

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"lazytest/internal/appsvc"
	"lazytest/internal/desktop/widgets"
)

type LogsPanel struct {
	state     SharedState
	status    func(string)
	meta      *widget.Label
	viewer    *widgets.LogViewer
	container fyne.CanvasObject
}

func NewLogsPanel(state SharedState, status func(string)) *LogsPanel {
	p := &LogsPanel{state: state, status: status}
	p.meta = widget.NewLabel("No active run")
	p.viewer = widgets.NewLogViewer(500)

	clearBtn := widget.NewButton("Clear", func() {
		p.viewer.SetLines(nil)
		p.status("Logs cleared")
	})

	p.container = container.NewBorder(
		container.NewHBox(widget.NewLabelWithStyle("Run Logs", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}), clearBtn),
		nil,
		nil,
		nil,
		container.NewVBox(p.meta, widget.NewSeparator(), p.viewer.Container()),
	)

	state.OnRunChange(p.render)
	p.render(state.GetRunSnapshot())
	return p
}

func (p *LogsPanel) render(s appsvc.RunSnapshot) {
	if s.RunID == "" {
		p.meta.SetText("No active run")
	} else {
		p.meta.SetText(fmt.Sprintf("run=%s type=%s status=%s", s.RunID, s.RunType, s.Status))
	}
	p.viewer.SetLines(s.Logs)
}

func (p *LogsPanel) Container() fyne.CanvasObject { return p.container }
func (p *LogsPanel) OnShow()                      { p.render(p.state.GetRunSnapshot()) }
func (p *LogsPanel) OnHide()                      {}
func (p *LogsPanel) Dispose()                     {}
