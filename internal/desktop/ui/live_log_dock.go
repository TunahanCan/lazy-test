//go:build desktop

package ui

import (
	"fmt"
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"lazytest/internal/appsvc"
)

// LiveLogDock is a fixed right-bottom live log area visible across all panels.
type LiveLogDock struct {
	state     *UIState
	status    func(string)
	meta      *canvas.Text
	list      *widget.List
	lines     []string
	container fyne.CanvasObject
}

func NewLiveLogDock(state *UIState, status func(string)) *LiveLogDock {
	d := &LiveLogDock{state: state, status: status, lines: []string{"[idle] no log events yet"}}
	meta := canvas.NewText("No active run", color.RGBA{R: 0x95, G: 0xA4, B: 0xB8, A: 0xFF})
	meta.TextStyle = fyne.TextStyle{Monospace: true}
	meta.TextSize = 11
	d.meta = meta

	d.list = widget.NewList(
		func() int { return len(d.lines) },
		func() fyne.CanvasObject {
			t := canvas.NewText("", color.RGBA{R: 0xE6, G: 0xEC, B: 0xF5, A: 0xFF})
			t.TextStyle = fyne.TextStyle{Monospace: true}
			t.TextSize = 11
			return t
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			t := obj.(*canvas.Text)
			if id < 0 || id >= len(d.lines) {
				t.Text = ""
				t.Refresh()
				return
			}
			t.Text = d.lines[id]
			t.Refresh()
		},
	)
	d.list.HideSeparators = true

	title := canvas.NewText("LIVE LOG", color.RGBA{R: 0x7E, G: 0xB6, B: 0xFF, A: 0xFF})
	title.TextStyle = fyne.TextStyle{Bold: true, Monospace: true}
	title.TextSize = 12

	clearBtn := widget.NewButton("Clear", func() {
		d.lines = []string{"[idle] log view cleared"}
		d.list.Refresh()
		d.status("Live log dock cleared")
	})
	clearBtn.Importance = widget.LowImportance

	header := container.NewBorder(nil, nil, title, clearBtn, nil)
	sep := canvas.NewLine(color.RGBA{R: 0x2D, G: 0x3B, B: 0x4E, A: 0xFF})
	sep.StrokeWidth = 1

	innerBg := canvas.NewRectangle(color.RGBA{R: 0x0E, G: 0x15, B: 0x20, A: 0xFF})
	innerBg.CornerRadius = 8
	outerBg := canvas.NewRectangle(color.RGBA{R: 0x13, G: 0x1D, B: 0x2B, A: 0xFF})
	outerBg.CornerRadius = 10

	listWrap := container.NewStack(innerBg, container.NewPadded(d.list))
	content := container.NewVBox(header, d.meta, sep, listWrap)
	panel := container.NewStack(outerBg, container.NewPadded(content))
	panel.Resize(fyne.NewSize(420, 230))
	d.container = panel

	state.OnRunChange(d.render)
	d.render(state.GetRunSnapshot())
	return d
}

func (d *LiveLogDock) render(s appsvc.RunSnapshot) {
	if s.RunID == "" {
		d.meta.Text = "No active run"
		d.meta.Color = color.RGBA{R: 0x95, G: 0xA4, B: 0xB8, A: 0xFF}
		d.meta.Refresh()
		d.lines = []string{"[idle] no log events yet"}
		d.list.Refresh()
		return
	}

	d.meta.Text = fmt.Sprintf("run=%s type=%s status=%s", s.RunID, s.RunType, s.Status)
	d.meta.Color = color.RGBA{R: 0x9C, G: 0xD6, B: 0xFF, A: 0xFF}
	d.meta.Refresh()

	if len(s.Logs) == 0 {
		d.lines = []string{"[live] waiting events..."}
	} else {
		d.lines = append([]string(nil), s.Logs...)
	}
	d.list.Refresh()
	d.list.ScrollToBottom()
}

func (d *LiveLogDock) Container() fyne.CanvasObject { return d.container }
