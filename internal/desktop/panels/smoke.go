//go:build desktop

package panels

import (
	"fmt"
	"sort"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"lazytest/internal/appsvc"
	"lazytest/internal/desktop/widgets"
)

type SmokePanel struct {
	app      DesktopApp
	state    SharedState
	status   func(string)
	onStart  func(runID, kind string)
	runAll   *widget.Check
	workers  *widget.Entry
	timeout  *widget.Entry
	export   *widget.Entry
	progress *widgets.ProgressCard
	logs     *widgets.LogViewer
	result   *widgets.DiffViewer

	endpointSelect *widget.SelectEntry
	container      fyne.CanvasObject
}

func NewSmokePanel(app DesktopApp, state SharedState, status func(string), onStart func(string, string)) *SmokePanel {
	p := &SmokePanel{app: app, state: state, status: status, onStart: onStart}
	p.build()
	state.OnRunChange(func(s appsvc.RunSnapshot) {
		if s.RunType != "smoke" {
			return
		}
		p.progress.Set(s.Status, s.Progress.Done, s.Progress.Total)
		if s.Summary != "" {
			p.result.SetText(s.Summary)
		}
	})
	return p
}

func (p *SmokePanel) build() {
	p.runAll = widget.NewCheck("Run all endpoints", nil)
	p.runAll.SetChecked(true)
	p.workers = widget.NewEntry()
	p.workers.SetText("4")
	p.timeout = widget.NewEntry()
	p.timeout.SetText("10000")
	p.export = widget.NewEntry()
	p.export.SetText("./out")
	p.endpointSelect = widget.NewSelectEntry([]string{})
	p.endpointSelect.SetPlaceHolder("single endpoint id")
	p.progress = widgets.NewProgressCard("Smoke Progress")
	p.logs = widgets.NewLogViewer(200)
	p.result = widgets.NewDiffViewer(12000)

	startBtn := widget.NewButton("Start Smoke", func() {
		workers := 4
		fmt.Sscanf(strings.TrimSpace(p.workers.Text), "%d", &workers)
		timeout := 10000
		fmt.Sscanf(strings.TrimSpace(p.timeout.Text), "%d", &timeout)
		cfg := appsvc.SmokeStartConfig{RunAll: p.runAll.Checked, Workers: workers, TimeoutMS: timeout, ExportDir: strings.TrimSpace(p.export.Text)}
		if !p.runAll.Checked && strings.TrimSpace(p.endpointSelect.Text) != "" {
			cfg.EndpointIDs = []string{strings.TrimSpace(p.endpointSelect.Text)}
		}
		runID, err := p.app.StartSmoke(cfg)
		if err != nil {
			p.status("smoke start failed: " + err.Error())
			return
		}
		p.onStart(runID, "smoke")
		p.status("smoke started: " + runID)
	})

	cancelBtn := widget.NewButton("Cancel Active", func() {
		if p.app.CancelActiveRun() {
			p.status("active run canceled")
		}
	})

	form := widget.NewForm(
		widget.NewFormItem("Run Mode", p.runAll),
		widget.NewFormItem("Endpoint", p.endpointSelect),
		widget.NewFormItem("Workers", p.workers),
		widget.NewFormItem("Timeout(ms)", p.timeout),
		widget.NewFormItem("Export Dir", p.export),
	)

	p.container = container.NewScroll(container.NewVBox(
		widget.NewLabelWithStyle("Smoke Tests", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		form,
		container.NewHBox(startBtn, cancelBtn),
		p.progress.Container(),
		widget.NewCard("Live Logs", "", p.logs.Container()),
		widget.NewCard("Result", "", p.result.Container()),
	))
	p.refreshEndpoints()
}

func (p *SmokePanel) refreshEndpoints() {
	eps := p.state.GetEndpoints()
	ids := make([]string, 0, len(eps))
	for _, ep := range eps {
		ids = append(ids, ep.ID)
	}
	sort.Strings(ids)
	p.endpointSelect.SetOptions(ids)
}

func (p *SmokePanel) Container() fyne.CanvasObject { return p.container }
func (p *SmokePanel) OnShow()                      { p.refreshEndpoints() }
func (p *SmokePanel) OnHide()                      {}
func (p *SmokePanel) Dispose()                     {}
