//go:build desktop

package widgets

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/widget"
)

// SafeDiffText guards against huge payload rendering in UI.
func SafeDiffText(text string, maxRunes int) string {
	if maxRunes <= 0 {
		return text
	}
	r := []rune(text)
	if len(r) <= maxRunes {
		return text
	}
	return string(r[:maxRunes]) + "\n... (truncated)"
}

// DiffViewer is a bounded multiline view for diffs.
type DiffViewer struct {
	entry    *widget.Entry
	maxRunes int
}

func NewDiffViewer(maxRunes int) *DiffViewer {
	if maxRunes <= 0 {
		maxRunes = 20000
	}
	e := widget.NewMultiLineEntry()
	e.Disable()
	e.Wrapping = fyne.TextWrapBreak
	return &DiffViewer{entry: e, maxRunes: maxRunes}
}

func (v *DiffViewer) SetText(text string) {
	v.entry.SetText(SafeDiffText(text, v.maxRunes))
}

func (v *DiffViewer) Container() fyne.CanvasObject { return v.entry }
