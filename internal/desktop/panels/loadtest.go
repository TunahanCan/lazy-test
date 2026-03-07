//go:build desktop

package panels

import (
	"fmt"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"lazytest/internal/appsvc"
	"lazytest/internal/desktop/widgets"
)

type LoadTestPanel struct {
	app     DesktopApp
	state   SharedState
	win     fyne.Window
	status  func(string)
	onStart func(string, string)

	planPath  *widget.Entry
	maxError  *widget.Entry
	maxP95    *widget.Entry
	progress  *widgets.ProgressCard
	summary   *widgets.DiffViewer
	container fyne.CanvasObject
}

func NewLoadTestPanel(app DesktopApp, state SharedState, win fyne.Window, status func(string), onStart func(string, string)) *LoadTestPanel {
	p := &LoadTestPanel{app: app, state: state, win: win, status: status, onStart: onStart}
	p.build()
	state.OnRunChange(func(s appsvc.RunSnapshot) {
		if s.RunType != "lt" {
			return
		}
		p.progress.Set(s.Status, s.Progress.Done, s.Progress.Total)
		if s.Summary != "" {
			p.summary.SetText(s.Summary)
		}
	})
	return p
}

func (p *LoadTestPanel) build() {
	p.planPath = widget.NewEntry()
	p.planPath.SetPlaceHolder("plans/*.yaml")
	p.maxError = widget.NewEntry()
	p.maxError.SetText("1.0")
	p.maxP95 = widget.NewEntry()
	p.maxP95.SetText("1000")
	p.progress = widgets.NewProgressCard("Load Test Progress")
	p.summary = widgets.NewDiffViewer(10000)

	browseBtn := widget.NewButton("Browse Plan", func() {
		d := dialog.NewFileOpen(func(r fyne.URIReadCloser, err error) {
			if err != nil {
				p.status("open plan error: " + err.Error())
				return
			}
			if r == nil {
				return
			}
			p.planPath.SetText(r.URI().Path())
			_ = r.Close()
		}, p.win)
		d.Show()
	})

	startBtn := widget.NewButton("Start Load Test", func() {
		planPath := strings.TrimSpace(p.planPath.Text)
		if planPath == "" {
			p.status("load test: plan path required")
			return
		}
		maxErr := 1.0
		fmt.Sscanf(strings.TrimSpace(p.maxError.Text), "%f", &maxErr)
		maxP95 := int64(1000)
		fmt.Sscanf(strings.TrimSpace(p.maxP95.Text), "%d", &maxP95)
		runID, err := p.app.StartLT(planPath, appsvc.LTStartConfig{MaxErrorPct: maxErr, MaxP95Ms: maxP95})
		if err != nil {
			p.status("load test start failed: " + err.Error())
			return
		}
		p.onStart(runID, "lt")
		p.status("load test started: " + runID)
	})

	cancelBtn := widget.NewButton("Cancel Active", func() {
		if p.app.CancelActiveRun() {
			p.status("active run canceled")
		}
	})

	p.container = container.NewScroll(container.NewVBox(
		widget.NewLabelWithStyle("Load Tests", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		widget.NewForm(
			widget.NewFormItem("Plan File", container.NewBorder(nil, nil, nil, browseBtn, p.planPath)),
			widget.NewFormItem("Max Error %", p.maxError),
			widget.NewFormItem("Max p95(ms)", p.maxP95),
		),
		container.NewHBox(startBtn, cancelBtn),
		p.progress.Container(),
		widget.NewCard("Summary", "", p.summary.Container()),
	))
}

func (p *LoadTestPanel) Container() fyne.CanvasObject { return p.container }
func (p *LoadTestPanel) OnShow()                      {}
func (p *LoadTestPanel) OnHide()                      {}
func (p *LoadTestPanel) Dispose()                     {}
