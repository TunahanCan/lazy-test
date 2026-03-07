//go:build desktop

package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
)

// Navigation manages the left sidebar navigation.
type Navigation struct {
	tree       *widget.Tree
	container  *fyne.Container
	onNavigate func(string)
	selected   string
}

var navStructure = map[string][]string{
	"root":   {"View", "System"},
	"View":   {"Dashboard", "Workspace", "Explorer", "Smoke", "Drift", "Compare", "LoadTests", "LiveMetrics", "Logs", "Reports"},
	"System": {"LoadSpec", "About", "Quit"},
}

func NewNavigation(onNavigate func(string)) *Navigation {
	n := &Navigation{onNavigate: onNavigate, selected: "Dashboard"}
	n.buildTree()
	brand := canvas.NewText("lazytest", color.RGBA{R: 0x0B, G: 0x72, B: 0xD9, A: 0xFF})
	brand.TextSize = 10
	header := container.NewVBox(
		widget.NewLabelWithStyle("Navigation", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		brand,
	)
	n.container = container.NewBorder(header, nil, nil, nil, n.tree)
	return n
}

func (n *Navigation) buildTree() {
	n.tree = widget.NewTree(
		func(uid string) []string {
			if c, ok := navStructure[uid]; ok {
				return c
			}
			return nil
		},
		func(uid string) bool {
			_, ok := navStructure[uid]
			return ok
		},
		func(bool) fyne.CanvasObject {
			return container.NewHBox(widget.NewIcon(theme.DocumentIcon()), widget.NewLabel(""))
		},
		func(uid string, branch bool, obj fyne.CanvasObject) {
			c := obj.(*fyne.Container)
			icon := c.Objects[0].(*widget.Icon)
			label := c.Objects[1].(*widget.Label)
			label.SetText(uid)
			icon.SetResource(iconFor(uid, branch))
		},
	)
	n.tree.OpenBranch("root")
	n.tree.OpenBranch("View")
	n.tree.OpenBranch("System")
	n.tree.OnSelected = func(uid string) {
		if _, isBranch := navStructure[uid]; isBranch {
			return
		}
		n.selected = uid
		if n.onNavigate != nil {
			n.onNavigate(uid)
		}
	}
	n.tree.Select("Dashboard")
}

func iconFor(uid string, branch bool) fyne.Resource {
	if branch {
		return theme.FolderIcon()
	}
	switch uid {
	case "Dashboard":
		return theme.HomeIcon()
	case "Workspace":
		return theme.SettingsIcon()
	case "Explorer":
		return theme.SearchIcon()
	case "Smoke":
		return theme.VisibilityIcon()
	case "Drift":
		return theme.WarningIcon()
	case "Compare":
		return theme.ContentCopyIcon()
	case "LoadTests":
		return theme.MediaPlayIcon()
	case "LiveMetrics":
		return theme.InfoIcon()
	case "Reports":
		return theme.FileTextIcon()
	case "Logs":
		return theme.FileTextIcon()
	case "LoadSpec":
		return theme.FolderOpenIcon()
	case "About":
		return theme.InfoIcon()
	case "Quit":
		return theme.CancelIcon()
	default:
		return theme.DocumentIcon()
	}
}

func (n *Navigation) Container() *fyne.Container { return n.container }
func (n *Navigation) SelectItem(name string)     { n.tree.Select(name) }
func (n *Navigation) GetSelected() string        { return n.selected }
