//go:build desktop

package panels

import (
	"encoding/json"
	"fmt"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	dialogsvc "lazytest/internal/desktop/dialogs"
)

type ReportsPanel struct {
	app    DesktopApp
	win    fyne.Window
	status func(string)

	filterType   *widget.SelectEntry
	filterStatus *widget.SelectEntry
	list         *widget.List
	detail       *widget.Entry
	reports      []reportRow
	selectedID   int
	container    fyne.CanvasObject
}

type reportRow struct {
	RunID  string
	Type   string
	Status string
	Text   string
}

func NewReportsPanel(app DesktopApp, win fyne.Window, status func(string)) *ReportsPanel {
	p := &ReportsPanel{app: app, win: win, status: status, selectedID: -1}
	p.build()
	p.refresh()
	return p
}

func (p *ReportsPanel) build() {
	p.filterType = widget.NewSelectEntry([]string{"", "smoke", "drift", "compare", "lt", "tcp"})
	p.filterStatus = widget.NewSelectEntry([]string{"", "running", "completed", "failed", "canceled"})
	p.filterType.OnChanged = func(string) { p.refresh() }
	p.filterStatus.OnChanged = func(string) { p.refresh() }

	p.detail = widget.NewMultiLineEntry()
	p.detail.Disable()

	p.list = widget.NewList(
		func() int { return len(p.reports) },
		func() fyne.CanvasObject { return widget.NewLabel("row") },
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			if id < 0 || id >= len(p.reports) {
				obj.(*widget.Label).SetText("")
				return
			}
			r := p.reports[id]
			obj.(*widget.Label).SetText(fmt.Sprintf("%s | %s | %s", r.RunID, r.Type, r.Status))
		},
	)
	p.list.OnSelected = func(id widget.ListItemID) {
		if id < 0 || id >= len(p.reports) {
			return
		}
		p.selectedID = id
		p.detail.SetText(p.reports[id].Text)
	}

	refreshBtn := widget.NewButton("Refresh", p.refresh)
	exportJSONBtn := widget.NewButton("Export JSON", p.exportSelected("report.json"))
	exportTextBtn := widget.NewButton("Export Summary", p.exportSelected("report.txt"))

	p.container = container.NewHSplit(
		container.NewBorder(container.NewGridWithColumns(5, p.filterType, p.filterStatus, refreshBtn, exportJSONBtn, exportTextBtn), nil, nil, nil, p.list),
		container.NewScroll(p.detail),
	)
}

func (p *ReportsPanel) exportSelected(defaultName string) func() {
	return func() {
		if p.selectedID < 0 || p.selectedID >= len(p.reports) {
			dialog.ShowInformation("Export", "Select a report first", p.win)
			return
		}
		content := []byte(p.reports[p.selectedID].Text)
		dialogsvc.ShowExportDialog(p.win, defaultName, content, func(err error) {
			if err != nil {
				dialog.ShowError(err, p.win)
				return
			}
			p.status("report exported")
		})
	}
}

func (p *ReportsPanel) refresh() {
	typeF := strings.TrimSpace(p.filterType.Text)
	statusF := strings.TrimSpace(p.filterStatus.Text)
	rows := make([]reportRow, 0)
	for _, r := range p.app.ListReports() {
		if typeF != "" && r.Type != typeF {
			continue
		}
		if statusF != "" && r.Status != statusF {
			continue
		}
		b, _ := json.MarshalIndent(r, "", "  ")
		rows = append(rows, reportRow{RunID: r.RunID, Type: r.Type, Status: r.Status, Text: string(b)})
	}
	p.reports = rows
	p.selectedID = -1
	p.detail.SetText("")
	p.list.Refresh()
	p.status(fmt.Sprintf("reports loaded: %d", len(rows)))
}

func (p *ReportsPanel) Container() fyne.CanvasObject { return p.container }
func (p *ReportsPanel) OnShow()                      { p.refresh() }
func (p *ReportsPanel) OnHide()                      {}
func (p *ReportsPanel) Dispose()                     {}
