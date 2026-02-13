package views

import (
	"fmt"
	"strings"

	"github.com/jroimartin/gocui"
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
	lines := strings.TrimSpace(logoText)
	fmt.Fprintln(v, lines)
	fmt.Fprint(v, "\n Keyboard-first API Quality Console  •  Tab/Enter ile hızlı gezinme")
	return nil
}
