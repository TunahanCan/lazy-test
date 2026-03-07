//go:build desktop

package widgets

import (
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/widget"
)

// ClipLines keeps only the newest maxLines lines.
func ClipLines(lines []string, maxLines int) []string {
	if maxLines <= 0 || len(lines) <= maxLines {
		return lines
	}
	return append([]string(nil), lines[len(lines)-maxLines:]...)
}

// LogViewer renders bounded log lines.
type LogViewer struct {
	entry    *widget.Entry
	maxLines int
	lines    []string
}

func NewLogViewer(maxLines int) *LogViewer {
	if maxLines <= 0 {
		maxLines = 300
	}
	e := widget.NewMultiLineEntry()
	e.Disable()
	e.Wrapping = fyne.TextWrapBreak
	return &LogViewer{entry: e, maxLines: maxLines, lines: make([]string, 0, maxLines)}
}

func (v *LogViewer) Append(line string) {
	line = strings.TrimSpace(line)
	if line == "" {
		return
	}
	v.lines = append(v.lines, line)
	v.lines = ClipLines(v.lines, v.maxLines)
	v.entry.SetText(strings.Join(v.lines, "\n"))
}

func (v *LogViewer) SetLines(lines []string) {
	v.lines = ClipLines(append([]string(nil), lines...), v.maxLines)
	v.entry.SetText(strings.Join(v.lines, "\n"))
}

func (v *LogViewer) Container() fyne.CanvasObject { return v.entry }
