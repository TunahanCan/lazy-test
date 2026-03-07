//go:build desktop

package ui

import (
	"fyne.io/fyne/v2"
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
}

func NewNavigation(onNavigate func(string)) *Navigation {
	n := &Navigation{onNavigate: onNavigate, selected: "Dashboard", rows: buildNavItems()}
	n.buildList()
	n.container = container.NewBorder(
		widget.NewLabelWithStyle("NAVIGATION", fyne.TextAlignLeading, fyne.TextStyle{Bold: true, Monospace: true}),
		nil,
		nil,
		nil,
		n.list,
	)
	return n
}

func (n *Navigation) buildList() {
	n.list = widget.NewList(
		func() int { return len(n.rows) },
		func() fyne.CanvasObject {
			return container.NewHBox(widget.NewLabel(" "), widget.NewLabel("item"))
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			row := obj.(*fyne.Container)
			mark := row.Objects[0].(*widget.Label)
			label := row.Objects[1].(*widget.Label)
			item := n.rows[id]

			if !item.Selectable {
				mark.SetText(" ")
				label.SetText(item.Label)
				label.TextStyle = fyne.TextStyle{Bold: true, Monospace: true}
				return
			}
			if n.selected == item.ID {
				mark.SetText(">")
			} else {
				mark.SetText(" ")
			}
			label.SetText(item.Label)
			label.TextStyle = fyne.TextStyle{Monospace: true}
		},
	)

	n.list.OnSelected = func(id widget.ListItemID) {
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
		if n.onNavigate != nil {
			n.onNavigate(item.ID)
		}
	}

	n.SelectItem("Dashboard")
}

func (n *Navigation) Container() *fyne.Container { return n.container }

func (n *Navigation) SelectItem(name string) {
	for i, item := range n.rows {
		if item.ID == name {
			n.selected = name
			n.list.Select(i)
			n.list.Refresh()
			return
		}
	}
}

func (n *Navigation) GetSelected() string { return n.selected }
