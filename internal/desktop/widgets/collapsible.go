//go:build desktop

package widgets

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

// Collapsible is a small wrapper around accordion with a single item.
type Collapsible struct {
	item      *widget.AccordionItem
	accordion *widget.Accordion
}

func NewCollapsible(title string, content fyne.CanvasObject, open bool) *Collapsible {
	item := widget.NewAccordionItem(title, content)
	acc := widget.NewAccordion(item)
	if open {
		acc.Open(0)
	}
	return &Collapsible{item: item, accordion: acc}
}

func (c *Collapsible) Container() *fyne.Container {
	return container.NewMax(c.accordion)
}

func (c *Collapsible) SetTitle(title string) {
	c.item.Title = title
	c.accordion.Refresh()
}
