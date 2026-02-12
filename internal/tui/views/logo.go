package views

import (
	"fmt"
	"strings"

	"github.com/jroimartin/gocui"
	"lazytest/internal/styles"
)

const logoViewName = "logoView"

// ASCII art for "lazytest" (compact).
const logoText = `
 _                    _            
| |    __ _ _   _  ___| |_ ___  ___ 
| |   / _` + "`" + ` | | | |/ _ \\ __/ __|
| |__| (_| | |_| |  __/ |_\\__ \\
|_____\\__,_|\\__, |\\___|\\__|___/
            |___/                  
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
		v.Title = " lazytest "
		lines := strings.TrimSpace(logoText)
		fmt.Fprint(v, lines)
	}
	return nil
}
