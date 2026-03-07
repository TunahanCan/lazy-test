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

type ComparePanel struct {
	app     DesktopApp
	state   SharedState
	status  func(string)
	onStart func(string, string)

	endpoint  *widget.SelectEntry
	envA      *widget.Entry
	envB      *widget.Entry
	onlyDiff  *widget.Check
	timeout   *widget.Entry
	progress  *widgets.ProgressCard
	result    *widgets.DiffViewer
	container fyne.CanvasObject
}

func NewComparePanel(app DesktopApp, state SharedState, status func(string), onStart func(string, string)) *ComparePanel {
	p := &ComparePanel{app: app, state: state, status: status, onStart: onStart}
	p.build()
	state.OnRunChange(func(s appsvc.RunSnapshot) {
		if s.RunType != "compare" {
			return
		}
		p.progress.Set(s.Status, s.Progress.Done, s.Progress.Total)
		if s.Summary != "" {
			p.result.SetText(s.Summary)
		}
	})
	return p
}

func (p *ComparePanel) build() {
	p.endpoint = widget.NewSelectEntry(nil)
	p.envA = widget.NewEntry()
	p.envA.SetText("dev")
	p.envB = widget.NewEntry()
	p.envB.SetText("test")
	p.onlyDiff = widget.NewCheck("Only differences", nil)
	p.onlyDiff.SetChecked(true)
	p.timeout = widget.NewEntry()
	p.timeout.SetText("10000")
	p.progress = widgets.NewProgressCard("Compare Progress")
	p.result = widgets.NewDiffViewer(15000)

	startBtn := widget.NewButton("Run Compare", func() {
		timeout := 10000
		fmt.Sscanf(strings.TrimSpace(p.timeout.Text), "%d", &timeout)
		cfg := appsvc.CompareStartConfig{
			EndpointID: strings.TrimSpace(p.endpoint.Text),
			EnvA:       strings.TrimSpace(p.envA.Text),
			EnvB:       strings.TrimSpace(p.envB.Text),
			OnlyDiff:   p.onlyDiff.Checked,
			TimeoutMS:  timeout,
		}
		if cfg.EndpointID == "" {
			p.status("compare: endpoint is required")
			return
		}
		runID, err := p.app.StartCompare(cfg)
		if err != nil {
			p.status("compare start failed: " + err.Error())
			return
		}
		p.onStart(runID, "compare")
		p.status("compare started: " + runID)
	})

	p.container = container.NewScroll(container.NewVBox(
		widget.NewLabelWithStyle("A/B Compare", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		widget.NewForm(
			widget.NewFormItem("Endpoint", p.endpoint),
			widget.NewFormItem("Env A", p.envA),
			widget.NewFormItem("Env B", p.envB),
			widget.NewFormItem("Only Diff", p.onlyDiff),
			widget.NewFormItem("Timeout(ms)", p.timeout),
		),
		startBtn,
		p.progress.Container(),
		widget.NewCard("Result", "", p.result.Container()),
	))
	p.refreshEndpoints()
}

func (p *ComparePanel) refreshEndpoints() {
	eps := p.state.GetEndpoints()
	ids := make([]string, 0, len(eps))
	for _, ep := range eps {
		ids = append(ids, ep.ID)
	}
	sort.Strings(ids)
	p.endpoint.SetOptions(ids)
}

func (p *ComparePanel) Container() fyne.CanvasObject { return p.container }
func (p *ComparePanel) OnShow()                      { p.refreshEndpoints() }
func (p *ComparePanel) OnHide()                      {}
func (p *ComparePanel) Dispose()                     {}
