//go:build desktop

package widgets

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

// ProgressCard is a common status/progress display component.
type ProgressCard struct {
	title    *widget.Label
	status   *widget.Label
	progress *widget.ProgressBar
	meta     *widget.Label
	card     *widget.Card
}

func NewProgressCard(title string) *ProgressCard {
	p := &ProgressCard{
		title:    widget.NewLabel(title),
		status:   widget.NewLabel("Idle"),
		progress: widget.NewProgressBar(),
		meta:     widget.NewLabel("0/0"),
	}
	p.title.TextStyle = fyne.TextStyle{Bold: true}
	p.card = widget.NewCard("", "", container.NewVBox(p.title, p.status, p.progress, p.meta))
	return p
}

func (p *ProgressCard) Set(status string, done, total int) {
	p.status.SetText(status)
	if total <= 0 {
		p.progress.SetValue(0)
		p.meta.SetText("0/0")
		return
	}
	v := float64(done) / float64(total)
	if v < 0 {
		v = 0
	}
	if v > 1 {
		v = 1
	}
	p.progress.SetValue(v)
	p.meta.SetText(fmt.Sprintf("%d/%d", done, total))
}

func (p *ProgressCard) Container() fyne.CanvasObject { return p.card }
