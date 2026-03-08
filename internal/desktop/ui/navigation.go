//go:build desktop

package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

type navItem struct {
	ID         string
	Label      string
	Selectable bool
}

func buildNavItems() []navItem {
	rows := []navItem{{Label: "[ VIEW ]", Selectable: false}}
	for _, v := range ViewNavOptions() {
		rows = append(rows, navItem{ID: v.ID, Label: v.Label, Selectable: true})
	}
	rows = append(rows, navItem{Label: "", Selectable: false}, navItem{Label: "[ SYSTEM ]", Selectable: false})
	for _, v := range SystemNavOptions() {
		rows = append(rows, navItem{ID: v.ID, Label: v.Label, Selectable: true})
	}
	return rows
}

// Navigation manages the left sidebar navigation.
type Navigation struct {
	list       *widget.List
	container  *fyne.Container
	onNavigate func(string)
	selected   string
	rows       []navItem
	suppress   bool
}

func NewNavigation(onNavigate func(string)) *Navigation {
	n := &Navigation{onNavigate: onNavigate, selected: "Dashboard", rows: buildNavItems()}
	n.buildList()

	title := canvas.NewText("NAVIGATION", color.RGBA{R: 0x8F, G: 0xB7, B: 0xF4, A: 0xFF})
	title.TextStyle = fyne.TextStyle{Bold: true, Monospace: true}
	title.TextSize = 12

	bg := canvas.NewRectangle(color.RGBA{R: 0x0F, G: 0x17, B: 0x24, A: 0xFF})
	bg.CornerRadius = 0
	sep := canvas.NewLine(color.RGBA{R: 0x28, G: 0x36, B: 0x49, A: 0xFF})
	sep.StrokeWidth = 1
	rightBorder := canvas.NewRectangle(color.RGBA{R: 0x2A, G: 0x38, B: 0x4D, A: 0xFF})
	rightBorder.SetMinSize(fyne.NewSize(1, 1))

	header := container.NewVBox(title, sep)
	content := container.NewBorder(header, nil, nil, nil, n.list)

	min := canvas.NewRectangle(color.Transparent)
	min.SetMinSize(fyne.NewSize(290, 560))
	main := container.NewStack(min, bg, container.NewPadded(content))
	n.container = container.NewBorder(nil, nil, nil, rightBorder, main)
	return n
}

func (n *Navigation) buildList() {
	n.list = widget.NewList(
		func() int { return len(n.rows) },
		func() fyne.CanvasObject {
			mark := canvas.NewText(" ", color.RGBA{R: 0x73, G: 0x9E, B: 0xD8, A: 0xFF})
			mark.TextStyle = fyne.TextStyle{Bold: true, Monospace: true}
			mark.TextSize = 12
			label := canvas.NewText("item", color.RGBA{R: 0xD9, G: 0xE3, B: 0xF2, A: 0xFF})
			label.TextStyle = fyne.TextStyle{Monospace: true}
			label.TextSize = 12
			return container.NewHBox(mark, label)
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			row := obj.(*fyne.Container)
			mark := row.Objects[0].(*canvas.Text)
			label := row.Objects[1].(*canvas.Text)
			item := n.rows[id]

			if !item.Selectable {
				mark.Text = " "
				mark.Refresh()
				label.Text = item.Label
				label.Color = color.RGBA{R: 0x89, G: 0x99, B: 0xAE, A: 0xFF}
				label.TextStyle = fyne.TextStyle{Bold: true, Monospace: true}
				label.Refresh()
				return
			}

			if n.selected == item.ID {
				mark.Text = ">"
				label.Color = color.RGBA{R: 0x8F, G: 0xD1, B: 0xFF, A: 0xFF}
				label.TextStyle = fyne.TextStyle{Bold: true, Monospace: true}
			} else {
				mark.Text = " "
				label.Color = color.RGBA{R: 0xD9, G: 0xE3, B: 0xF2, A: 0xFF}
				label.TextStyle = fyne.TextStyle{Monospace: true}
			}
			mark.Refresh()
			label.Text = item.Label
			label.Refresh()
		},
	)
	// terminal-style list: no separators
	n.list.HideSeparators = true

	n.list.OnSelected = n.handleSelection

	n.SetSelected("Dashboard")
}

func (n *Navigation) Container() *fyne.Container { return n.container }

func (n *Navigation) SelectItem(name string) {
	n.selectItem(name, true)
}

// SetSelected updates selected row without triggering navigation callback.
func (n *Navigation) SetSelected(name string) {
	n.selectItem(name, false)
}

func (n *Navigation) selectItem(name string, notify bool) {
	for i, item := range n.rows {
		if item.ID == name {
			n.selected = name
			n.suppress = !notify
			n.list.Select(i)
			n.suppress = false
			n.list.Refresh()
			return
		}
	}
}

func (n *Navigation) handleSelection(id widget.ListItemID) {
	if id < 0 || id >= len(n.rows) {
		return
	}
	item := n.rows[id]
	if !item.Selectable {
		n.list.Unselect(id)
		return
	}
	n.selected = item.ID
	n.list.Refresh()
	if !n.suppress {
		n.triggerNavigate(item.ID)
	}
}

func (n *Navigation) triggerNavigate(id string) {
	if n.onNavigate != nil {
		n.onNavigate(id)
	}
}

func (n *Navigation) GetSelected() string { return n.selected }
