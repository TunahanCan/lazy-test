package views

import (
	"fmt"

	"github.com/jroimartin/gocui"
	"lazytest/internal/styles"
)

const statusBarViewName = "statusBar"

// Help text for the status bar.
const statusHelp = "⌨ q quit | ↹ tab focus | enter open/run | r smoke | A suite | L load | o drift | C compare | e env | p auth | s save"

// RenderStatusBar draws the bottom status bar.
func RenderStatusBar(g *gocui.Gui, x0, y0, x1, y1 int) error {
	if v, err := g.SetView(statusBarViewName, x0, y0, x1, y1); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Frame = false
		v.FgColor = styles.FrameFg
		v.BgColor = styles.ViewBg
		fmt.Fprint(v, statusHelp)
	} else {
		v.Clear()
		fmt.Fprint(v, statusHelp)
	}
	return nil
}
