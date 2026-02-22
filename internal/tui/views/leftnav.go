package views

import (
	"fmt"
	"strings"

	"github.com/jroimartin/gocui"
	"github.com/mattn/go-runewidth"
	"lazytest/internal/styles"
)

const leftNavViewName = "leftNav"
const leftNavWidth = 28

func LeftNavName() string    { return leftNavViewName }
func LeftNavItems() []string { return leftNavItems }

var leftNavItems = []string{
	"◈ Endpoint Explorer",
	"⚙ Test Suites",
	"≈ TCP Plans",
	"◉ Live Metrics",
	"∆ Contract Drift",
	"☰ Environments & Settings",
}

func RenderLeftNav(g *gocui.Gui, x0, y0, x1, y1 int, selectedIdx int) error {
	if v, err := g.SetView(leftNavViewName, x0, y0, x1, y1); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Frame = true
		v.FgColor = styles.FrameFg
		v.BgColor = styles.ViewBg
		v.Highlight = true
		v.SelBgColor = styles.SelBg
		v.SelFgColor = styles.SelFg
	}
	v, _ := g.View(leftNavViewName)
	v.Clear()
	v.Title = " ◈ Control Deck "
	w := x1 - x0 - 4
	if w < 2 {
		w = 2
	}
	fmt.Fprintln(v, "  ↑/↓ move   Enter open   Tab switch")
	fmt.Fprintln(v, "  "+strings.Repeat("─", max(2, w-2)))
	for i, item := range leftNavItems {
		prefix := "  "
		if i == selectedIdx {
			prefix = "▸ "
		}
		line := prefix + runewidth.Truncate(item, w, "…")
		fmt.Fprintln(v, line)
	}
	fmt.Fprintln(v, "")
	fmt.Fprintln(v, "  Quick")
	fmt.Fprintln(v, "  r smoke  |  o drift")
	fmt.Fprintln(v, "  c compare|  s save")
	return nil
}

func LeftNavSelectedIndex(g *gocui.Gui) int {
	v, err := g.View(leftNavViewName)
	if err != nil {
		return 0
	}
	_, oy := v.Origin()
	_, cy := v.Cursor()
	idx := oy + cy - 2
	if idx < 0 || idx >= len(leftNavItems) {
		return 0
	}
	return idx
}

func SetLeftNavCursor(g *gocui.Gui, idx int) {
	v, err := g.View(leftNavViewName)
	if err != nil {
		return
	}
	v.SetOrigin(0, 0)
	if idx < 0 {
		idx = 0
	}
	if idx >= len(leftNavItems) {
		idx = len(leftNavItems) - 1
	}
	v.SetCursor(0, idx+2)
}
