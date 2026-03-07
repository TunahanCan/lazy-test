//go:build desktop

package ui

import (
	"image/color"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
)

// StatusBar displays status information at the bottom of the window.
type StatusBar struct {
	statusText *canvas.Text
	timeText   *canvas.Text
	infoText   *canvas.Text
	container  *fyne.Container

	ticker *time.Ticker
	stop   chan bool
}

// NewStatusBar creates a terminal-modern status bar.
func NewStatusBar() *StatusBar {
	fg := color.RGBA{R: 0xD8, G: 0xE1, B: 0xEE, A: 0xFF}
	muted := color.RGBA{R: 0x9E, G: 0xAD, B: 0xC2, A: 0xFF}

	sb := &StatusBar{
		statusText: canvas.NewText("Ready", fg),
		timeText:   canvas.NewText("", muted),
		infoText:   canvas.NewText("", muted),
		stop:       make(chan bool),
	}
	sb.statusText.TextStyle = fyne.TextStyle{Bold: true, Monospace: true}
	sb.statusText.TextSize = 11
	sb.infoText.TextStyle = fyne.TextStyle{Monospace: true}
	sb.infoText.Alignment = fyne.TextAlignTrailing
	sb.infoText.TextSize = 11
	sb.timeText.TextStyle = fyne.TextStyle{Monospace: true}
	sb.timeText.TextSize = 11

	bg := canvas.NewRectangle(color.RGBA{R: 0x12, G: 0x1B, B: 0x28, A: 0xFF})
	sep := canvas.NewLine(color.RGBA{R: 0x2A, G: 0x37, B: 0x49, A: 0xFF})
	sep.StrokeWidth = 1

	content := container.NewBorder(
		nil,
		nil,
		sb.statusText,
		container.NewHBox(sb.infoText, canvas.NewText(" | ", muted), sb.timeText),
		nil,
	)
	sb.container = container.NewStack(bg, container.NewVBox(sep, container.NewPadded(content)))

	sb.startTimeTicker()
	return sb
}

func (sb *StatusBar) startTimeTicker() {
	sb.ticker = time.NewTicker(1 * time.Second)
	go func() {
		for {
			select {
			case <-sb.ticker.C:
				sb.timeText.Text = time.Now().Format("15:04:05")
				sb.timeText.Refresh()
			case <-sb.stop:
				sb.ticker.Stop()
				return
			}
		}
	}()
}

func (sb *StatusBar) SetStatus(status string) {
	sb.statusText.Text = status
	sb.statusText.Refresh()
}

func (sb *StatusBar) SetInfo(info string) {
	sb.infoText.Text = info
	sb.infoText.Refresh()
}

func (sb *StatusBar) Container() *fyne.Container {
	return sb.container
}

func (sb *StatusBar) Stop() {
	sb.stop <- true
}
