package views

import (
	"fmt"
	"strings"

	"github.com/jroimartin/gocui"
	"lazytest/internal/styles"
)

const logoViewName = "logoView"

const logoText = `
██╗      █████╗ ███████╗██╗   ██╗████████╗███████╗███████╗████████╗
██║     ██╔══██╗╚══███╔╝╚██╗ ██╔╝╚══██╔══╝██╔════╝██╔════╝╚══██╔══╝
██║     ███████║  ███╔╝  ╚████╔╝    ██║   █████╗  ███████╗   ██║
██║     ██╔══██║ ███╔╝    ╚██╔╝     ██║   ██╔══╝  ╚════██║   ██║
███████╗██║  ██║███████╗   ██║      ██║   ███████╗███████║   ██║
╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚══════╝   ╚═╝
`

// RenderLogo draws the ASCII logo in the bottom-left area.
func RenderLogo(g *gocui.Gui, x0, y0, x1, y1 int) error {
	if v, err := g.SetView(logoViewName, x0, y0, x1, y1); err != nil {
		if err != gocui.ErrUnknownView {
			return err
		}
		v.Frame = true
		v.FgColor = styles.FrameFg
		v.BgColor = styles.ViewBg
		v.Title = " lazytest • crafted UI "
		lines := strings.TrimSpace(logoText)
		fmt.Fprintln(v, lines)
		fmt.Fprint(v, "\n  Precision API Quality Console")
	}
	return nil
}
