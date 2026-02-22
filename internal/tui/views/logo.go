package views

import (
	"fmt"
	"strings"

	"github.com/jroimartin/gocui"
	"github.com/mattn/go-runewidth"
	"lazytest/internal/styles"
)

const logoViewName = "logoView"

const logoText = `
██╗      █████╗ ███████╗██╗   ██╗    ████████╗███████╗███████╗████████╗
██║     ██╔══██╗╚══███╔╝╚██╗ ██╔╝    ╚══██╔══╝██╔════╝██╔════╝╚══██╔══╝
██║     ███████║  ███╔╝  ╚████╔╝        ██║   █████╗  ███████╗   ██║
██║     ██╔══██║ ███╔╝    ╚██╔╝         ██║   ██╔══╝  ╚════██║   ██║
███████╗██║  ██║███████╗   ██║          ██║   ███████╗███████║   ██║
╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝          ╚═╝   ╚══════╝╚══════╝   ╚═╝
`

// RenderLogo draws the ASCII logo in the bottom area.
func RenderLogo(g *gocui.Gui, x0, y0, x1, y1 int) error {
	if v, err := g.SetView(logoViewName, x0, y0, x1, y1); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Frame = true
		v.FgColor = styles.FrameFg
		v.BgColor = styles.ViewBg
		v.Title = " lazy-test "
	}
	v, _ := g.View(logoViewName)
	v.Clear()
	lines := strings.Split(strings.TrimSpace(logoText), "\n")
	contentW := x1 - x0 - 2
	if contentW < 10 {
		contentW = 10
	}
	for _, line := range lines {
		if runewidth.StringWidth(line) > contentW {
			fmt.Fprintln(v, runewidth.Truncate(line, contentW, "…"))
			continue
		}
		pad := (contentW - runewidth.StringWidth(line)) / 2
		fmt.Fprintln(v, strings.Repeat(" ", pad)+line)
	}
	fmt.Fprintln(v)
	tagline := "API Quality Console  •  keyboard-first workflow"
	if runewidth.StringWidth(tagline) > contentW {
		tagline = runewidth.Truncate(tagline, contentW, "…")
	}
	pad := (contentW - runewidth.StringWidth(tagline)) / 2
	fmt.Fprint(v, strings.Repeat(" ", max(0, pad))+tagline)
	return nil
}
