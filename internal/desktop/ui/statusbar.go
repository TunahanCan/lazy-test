//go:build desktop

package ui

import (
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

// StatusBar displays status information at the bottom of the window
type StatusBar struct {
	statusLabel *widget.Label
	timeLabel   *widget.Label
	infoLabel   *widget.Label
	container   *fyne.Container

	ticker *time.Ticker
	stop   chan bool
}

// NewStatusBar creates a new status bar
func NewStatusBar() *StatusBar {
	sb := &StatusBar{
		statusLabel: widget.NewLabel("Ready"),
		timeLabel:   widget.NewLabel(""),
		infoLabel:   widget.NewLabel(""),
		stop:        make(chan bool),
	}

	sb.statusLabel.TextStyle = fyne.TextStyle{Bold: true}
	sb.infoLabel.Alignment = fyne.TextAlignTrailing

	sb.container = container.NewBorder(
		nil,
		nil,
		sb.statusLabel,
		container.NewHBox(
			sb.infoLabel,
			widget.NewSeparator(),
			sb.timeLabel,
		),
		nil, // center is empty, labels expand
	)

	// Start time ticker
	sb.startTimeTicker()

	return sb
}

func (sb *StatusBar) startTimeTicker() {
	sb.ticker = time.NewTicker(1 * time.Second)

	go func() {
		for {
			select {
			case <-sb.ticker.C:
				sb.timeLabel.SetText(time.Now().Format("15:04:05"))
			case <-sb.stop:
				sb.ticker.Stop()
				return
			}
		}
	}()
}

// SetStatus sets the main status text
func (sb *StatusBar) SetStatus(status string) {
	sb.statusLabel.SetText(status)
}

// SetInfo sets the info text (right side)
func (sb *StatusBar) SetInfo(info string) {
	sb.infoLabel.SetText(info)
}

// Container returns the status bar container
func (sb *StatusBar) Container() *fyne.Container {
	return sb.container
}

// Stop stops the time ticker
func (sb *StatusBar) Stop() {
	sb.stop <- true
}

