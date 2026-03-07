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

type DriftPanel struct {
	app     DesktopApp
	state   SharedState
	status  func(string)
	onStart func(string, string)

	endpoint  *widget.SelectEntry
	timeout   *widget.Entry
	export    *widget.Entry
	progress  *widgets.ProgressCard
	result    *widgets.DiffViewer
	container fyne.CanvasObject
}

func NewDriftPanel(app DesktopApp, state SharedState, status func(string), onStart func(string, string)) *DriftPanel {
	p := &DriftPanel{app: app, state: state, status: status, onStart: onStart}
	p.build()
	state.OnRunChange(func(s appsvc.RunSnapshot) {
		if s.RunType != "drift" {
			return
		}
		p.progress.Set(s.Status, s.Progress.Done, s.Progress.Total)
		if s.Summary != "" {
			p.result.SetText(s.Summary)
		}
	})
	return p
}

func (p *DriftPanel) build() {
	p.endpoint = widget.NewSelectEntry(nil)
	p.timeout = widget.NewEntry()
	p.timeout.SetText("10000")
	p.export = widget.NewEntry()
	p.export.SetText("./out")
	p.progress = widgets.NewProgressCard("Drift Progress")
	p.result = widgets.NewDiffViewer(15000)

	startBtn := widget.NewButton("Run Drift", func() {
		endpoint := strings.TrimSpace(p.endpoint.Text)
		if endpoint == "" {
			p.status("drift: endpoint is required")
			return
		}
		timeout := 10000
		fmt.Sscanf(strings.TrimSpace(p.timeout.Text), "%d", &timeout)
		runID, err := p.app.StartDrift(appsvc.DriftStartConfig{EndpointID: endpoint, TimeoutMS: timeout, ExportDir: strings.TrimSpace(p.export.Text)})
		if err != nil {
			p.status("drift start failed: " + err.Error())
			return
		}
		p.onStart(runID, "drift")
		p.status("drift started: " + runID)
	})

	p.container = container.NewScroll(container.NewVBox(
		widget.NewLabelWithStyle("Drift Analysis", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		widget.NewForm(
			widget.NewFormItem("Endpoint", p.endpoint),
			widget.NewFormItem("Timeout(ms)", p.timeout),
			widget.NewFormItem("Export Dir", p.export),
		),
		startBtn,
		p.progress.Container(),
		widget.NewCard("Result", "", p.result.Container()),
	))
	p.refreshEndpoints()
}

func (p *DriftPanel) refreshEndpoints() {
	eps := p.state.GetEndpoints()
	ids := make([]string, 0, len(eps))
	for _, ep := range eps {
		ids = append(ids, ep.ID)
	}
	sort.Strings(ids)
	p.endpoint.SetOptions(ids)
}

func (p *DriftPanel) Container() fyne.CanvasObject { return p.container }
func (p *DriftPanel) OnShow()                      { p.refreshEndpoints() }
func (p *DriftPanel) OnHide()                      {}
func (p *DriftPanel) Dispose()                     {}
