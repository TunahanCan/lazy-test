package views

import (
	"fmt"
	"strings"

	"github.com/jroimartin/gocui"
	"github.com/mattn/go-runewidth"
	"lazytest/internal/core"
	"lazytest/internal/styles"
)

const mainTableViewName = "mainTable"

// MainTableName returns the view name for the main table.
func MainTableName() string { return mainTableViewName }

// Row represents one endpoint table row (for Endpoint Explorer / backward compat).
type Row struct {
	Endpoint core.Endpoint
	Status   string
	P95      int64
}

// GenericTable renders headers + rows with context-based columns. statusColIndex is the column
// that holds status (OK/Fail/Drift/InProgress) for coloring; -1 to disable.
func GenericTable(g *gocui.Gui, x0, y0, x1, y1 int, headers []string, rows [][]string, selectedIdx int, statusColIndex int) error {
	if v, err := g.SetView(mainTableViewName, x0, y0, x1, y1); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Frame = true
		v.Title = " ✧ Signal Board "
		v.FgColor = styles.ViewFg
		v.BgColor = styles.ViewBg
		v.Highlight = true
		v.SelBgColor = styles.SelBg
		v.SelFgColor = styles.SelFg
	}
	v, _ := g.View(mainTableViewName)
	v.Clear()
	w := x1 - x0 - 2
	if w < 10 {
		w = 10
	}
	n := len(headers)
	if n == 0 {
		n = 1
	}
	colW := w / n
	if colW < 6 {
		colW = 6
	}
	widths := make([]int, len(headers))
	for i := range headers {
		widths[i] = colW
	}
	// first column often path/longer
	if len(widths) > 0 {
		widths[0] = colW * 2
		if widths[0] > 36 {
			widths[0] = 36
		}
	}
	var headerLine string
	for i, h := range headers {
		headerLine += pad(h, widths[i])
	}
	fmt.Fprintln(v, " "+headerLine)
	fmt.Fprintln(v, strings.Repeat("─", w))
	for _, row := range rows {
		var line string
		for j, cell := range row {
			ww := colW
			if j < len(widths) {
				ww = widths[j]
			}
			line += pad(runewidth.Truncate(cell, ww, "…"), ww)
		}
		// Pad if row has fewer cells than headers
		for j := len(row); j < len(headers); j++ {
			ww := colW
			if j < len(widths) {
				ww = widths[j]
			}
			line += pad("", ww)
		}
		fmt.Fprintln(v, line)
	}
	if statusColIndex >= 0 {
		_ = statusColIndex
		// Colouring would require per-cell attributes; gocui highlights whole line. Keep status text as-is.
	}
	if selectedIdx >= 0 && selectedIdx < len(rows) {
		v.SetCursor(0, selectedIdx+2)
	}
	return nil
}

// RenderTable draws the main table (endpoint rows) for backward compat.
func RenderTable(g *gocui.Gui, x0, y0, x1, y1 int, rows []Row, selectedIdx int) error {
	headers := []string{"PATH", "METHOD", "EXPECTED", "TAG", "LAST STATUS", "P95(ms)"}
	data := make([][]string, len(rows))
	for i, r := range rows {
		tag := ""
		if len(r.Endpoint.Tags) > 0 {
			tag = r.Endpoint.Tags[0]
		}
		status := r.Status
		if status == "" {
			status = "-"
		}
		data[i] = []string{
			r.Endpoint.Path,
			r.Endpoint.Method,
			"2xx/4xx",
			tag,
			status,
			fmt.Sprintf("%d", r.P95),
		}
	}
	return GenericTable(g, x0, y0, x1, y1, headers, data, selectedIdx, 4)
}

func pad(s string, w int) string {
	return runewidth.FillRight(runewidth.Truncate(s, w, "…"), w)
}

// TableSelectedIndex returns the selected row index (0-based).
func TableSelectedIndex(g *gocui.Gui) int {
	v, err := g.View(mainTableViewName)
	if err != nil {
		return 0
	}
	_, oy := v.Origin()
	_, cy := v.Cursor()
	idx := oy + cy - 2
	if idx < 0 {
		return 0
	}
	return idx
}

// SetTableCursor sets the cursor to the given row index.
func SetTableCursor(g *gocui.Gui, idx int) {
	v, err := g.View(mainTableViewName)
	if err != nil {
		return
	}
	v.SetOrigin(0, 0)
	v.SetCursor(0, idx+2)
}
