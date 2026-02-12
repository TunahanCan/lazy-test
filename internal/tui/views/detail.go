package views

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jroimartin/gocui"
	"github.com/mattn/go-runewidth"
	"lazytest/internal/core"
	"lazytest/internal/styles"
)

const detailViewName = "detailView"

// DetailContent holds what to show in the detail panel (summary text + optional JSON).
type DetailContent struct {
	Title    string // red if error
	IsError  bool
	Summary  string
	JSON     string
	Findings []core.DriftFinding
	ABDiff   *core.ABCompareResult
}

// RenderDetail draws the detail panel (right bottom).
func RenderDetail(g *gocui.Gui, x0, y0, x1, y1 int, content *DetailContent) error {
	if v, err := g.SetView(detailViewName, x0, y0, x1, y1); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Frame = true
		v.FgColor = styles.ViewFg
		v.BgColor = styles.ViewBg
		v.Wrap = true
		v.Title = " ✦ Insight Panel "
	}
	v, _ := g.View(detailViewName)
	v.Clear()
	if content == nil {
		fmt.Fprint(v, "Select a row to inspect rich details. Use Enter for contextual actions.")
		return nil
	}
	if content.Title != "" {
		if content.IsError {
			// Error title in red - gocui doesn't support per-line color easily, we use marker
			fmt.Fprintf(v, "[ERROR] %s\n", content.Title)
		} else {
			fmt.Fprintf(v, "%s\n", content.Title)
		}
	}
	if content.Summary != "" {
		for _, line := range strings.Split(content.Summary, "\n") {
			fmt.Fprintln(v, runewidth.Truncate(line, x1-x0-2, "…"))
		}
	}
	if len(content.Findings) > 0 {
		fmt.Fprintln(v, "\n--- Contract drift ---")
		for _, f := range content.Findings {
			switch f.Type {
			case core.DriftMissing:
				fmt.Fprintf(v, "  missing: %s\n", f.Path)
			case core.DriftExtra:
				fmt.Fprintf(v, "  extra: %s\n", f.Path)
			case core.DriftTypeMismatch:
				fmt.Fprintf(v, "  type_mismatch: %s expected %s, got %s\n", f.Path, f.Schema, f.Actual)
			case core.DriftEnumViolation:
				fmt.Fprintf(v, "  enum_violation: %s actual=%s\n", f.Path, f.Actual)
			default:
				fmt.Fprintf(v, "  %s %s: schema=%s actual=%s\n", f.Type, f.Path, f.Schema, f.Actual)
			}
		}
	}
	if content.ABDiff != nil {
		fmt.Fprintln(v, "\n--- A/B Compare ---")
		fmt.Fprintf(v, "  Status A: %d  B: %d  Match: %v\n", content.ABDiff.StatusA, content.ABDiff.StatusB, content.ABDiff.StatusMatch)
		for _, d := range content.ABDiff.HeadersDiff {
			fmt.Fprintln(v, "  "+d)
		}
		for _, d := range content.ABDiff.BodyStructureDiff {
			fmt.Fprintln(v, "  [struct] "+d)
		}
	}
	if content.JSON != "" {
		fmt.Fprintln(v, "\n--- JSON ---")
		var compact map[string]interface{}
		if json.Unmarshal([]byte(content.JSON), &compact) == nil {
			b, _ := json.MarshalIndent(compact, "  ", "  ")
			fmt.Fprintln(v, string(b))
		} else {
			fmt.Fprint(v, content.JSON)
		}
	}
	return nil
}
