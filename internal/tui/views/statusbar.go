package views

import (
	"fmt"
	"strings"

	"github.com/jroimartin/gocui"
	"github.com/mattn/go-runewidth"
	"lazytest/internal/styles"
)

const statusBarViewName = "statusBar"

// Help text for the status bar.
const statusHelp = "⌨ q quit  •  ↹ tab focus  •  enter open/run  •  r smoke  •  o drift  •  c compare  •  s save  •  e env  •  p auth"

// RenderStatusBar draws the bottom status bar.
func RenderStatusBar(g *gocui.Gui, x0, y0, x1, y1 int) error {
	if v, err := g.SetView(statusBarViewName, x0, y0, x1, y1); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Frame = false
		v.FgColor = styles.FrameFg
		v.BgColor = styles.ViewBg
		fmt.Fprint(v, fitStatus(statusHelp, x1-x0))
	} else {
		v.Clear()
		fmt.Fprint(v, fitStatus(statusHelp, x1-x0))
	}
	return nil
}

func fitStatus(s string, width int) string {
	if width <= 1 {
		return ""
	}
	msg := " " + s
	if runewidth.StringWidth(msg) <= width {
		return msg + strings.Repeat(" ", max(0, width-runewidth.StringWidth(msg)))
	}
	return " " + runewidth.Truncate(s, max(1, width-1), "…")
}
