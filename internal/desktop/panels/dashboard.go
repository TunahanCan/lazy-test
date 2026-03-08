//go:build desktop

package panels

import (
	"fmt"
	"image/color"
	"sort"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"lazytest/internal/appsvc"
	"lazytest/internal/desktop/widgets"
)

const (
	dashboardErrorGatePct = 2.0
	dashboardP95GateMS    = 500
)

type methodCount struct {
	Method string
	Count  int
}

// DashboardPanel displays a richer command-center style dashboard.
type DashboardPanel struct {
	state    SharedState
	navigate func(string)

	specCard      *widgets.MetricCard
	endpointsCard *widgets.MetricCard
	runCard       *widgets.MetricCard
	successCard   *widgets.MetricCard
	qualityCard   *widgets.MetricCard

	selectedInfo  *widget.Label
	workspaceInfo *widget.Label
	runInfo       *widget.Label
	progress      *widget.ProgressBar
	progressMeta  *widget.Label
	qualityGate   *canvas.Text

	methodRows []methodCount
	methodList *widget.List
	rpsChart   *widgets.LineChart
	errChart   *widgets.LineChart
	logViewer  *widgets.LogViewer

	container fyne.CanvasObject
}

func NewDashboardPanel(state SharedState, navigate func(string)) *DashboardPanel {
	p := &DashboardPanel{state: state, navigate: navigate}
	p.buildUI()

	state.OnSpecLoad(func(_ *appsvc.SpecSummary) { p.refresh() })
	state.OnWorkspaceChange(func(_ appsvc.Workspace) { p.refresh() })
	state.OnRunChange(func(_ appsvc.RunSnapshot) { p.refresh() })
	state.OnEndpointsChange(func(_ []appsvc.EndpointDTO) { p.refresh() })
	state.OnSelectedEndpointChange(func(_ *appsvc.EndpointDTO) { p.refresh() })
	p.refresh()
	return p
}

func (p *DashboardPanel) buildUI() {
	title := canvas.NewText("COMMAND CENTER", color.RGBA{R: 0xA4, G: 0xCC, B: 0xFF, A: 0xFF})
	title.TextStyle = fyne.TextStyle{Bold: true, Monospace: true}
	title.TextSize = 22

	subtitle := canvas.NewText("Live API test control, health, and telemetry snapshot", color.RGBA{R: 0x97, G: 0xA7, B: 0xBD, A: 0xFF})
	subtitle.TextStyle = fyne.TextStyle{Monospace: true}
	subtitle.TextSize = 12

	p.selectedInfo = widget.NewLabel("Selected endpoint: none")
	p.selectedInfo.TextStyle = fyne.TextStyle{Monospace: true}

	p.specCard = widgets.NewMetricCard("Spec", "Not loaded", "Load from Workspace", color.RGBA{R: 0x26, G: 0x49, B: 0x72, A: 0xFF})
	p.endpointsCard = widgets.NewMetricCard("Endpoints", "0", "No endpoint inventory", color.RGBA{R: 0x1C, G: 0x5B, B: 0x49, A: 0xFF})
	p.runCard = widgets.NewMetricCard("Run", "IDLE", "No active run", color.RGBA{R: 0x6C, G: 0x4A, B: 0x1E, A: 0xFF})
	p.successCard = widgets.NewMetricCard("Success Ratio", "n/a", "No assertions yet", color.RGBA{R: 0x1E, G: 0x3D, B: 0x67, A: 0xFF})
	p.qualityCard = widgets.NewMetricCard("Error / p95", "n/a", "Awaiting metrics", color.RGBA{R: 0x4A, G: 0x2A, B: 0x66, A: 0xFF})
	metrics := widgets.CreateMetricCardGrid(
		p.specCard,
		p.endpointsCard,
		p.runCard,
		p.successCard,
		p.qualityCard,
	)

	p.workspaceInfo = widget.NewLabel("Workspace metadata unavailable")
	p.workspaceInfo.Wrapping = fyne.TextWrapWord
	p.workspaceInfo.TextStyle = fyne.TextStyle{Monospace: true}

	p.runInfo = widget.NewLabel("No active run")
	p.runInfo.Wrapping = fyne.TextWrapWord
	p.runInfo.TextStyle = fyne.TextStyle{Monospace: true}

	p.progress = widget.NewProgressBar()
	p.progressMeta = widget.NewLabel("0 / 0")
	p.progressMeta.TextStyle = fyne.TextStyle{Monospace: true}

	p.qualityGate = canvas.NewText("Quality Gate: waiting metrics", color.RGBA{R: 0x9A, G: 0xA9, B: 0xBD, A: 0xFF})
	p.qualityGate.TextStyle = fyne.TextStyle{Bold: true, Monospace: true}
	p.qualityGate.TextSize = 11

	p.methodList = p.newMethodList()
	p.rpsChart = widgets.NewLineChart(80)
	p.errChart = widgets.NewLineChart(80)
	p.logViewer = widgets.NewLogViewer(80)

	quickActions := container.NewGridWithColumns(3,
		p.navButton("Workspace", "Workspace"),
		p.navButton("Explorer", "Explorer"),
		p.navButton("Smoke", "Smoke"),
		p.navButton("Drift", "Drift"),
		p.navButton("Compare", "Compare"),
		p.navButton("Load", "LoadTests"),
		p.navButton("Metrics", "LiveMetrics"),
		p.navButton("Reports", "Reports"),
		p.navButton("Logs", "Logs"),
	)

	methodMin := canvas.NewRectangle(color.Transparent)
	methodMin.SetMinSize(fyne.NewSize(260, 180))
	methodBox := container.NewStack(methodMin, p.methodList)

	chartMin := canvas.NewRectangle(color.Transparent)
	chartMin.SetMinSize(fyne.NewSize(240, 140))
	telemetry := container.NewGridWithColumns(2,
		widget.NewCard("RPS", "", container.NewStack(chartMin, p.rpsChart)),
		widget.NewCard("Error Rate %", "", container.NewStack(chartMin, p.errChart)),
	)

	logMin := canvas.NewRectangle(color.Transparent)
	logMin.SetMinSize(fyne.NewSize(260, 190))
	logBox := container.NewStack(logMin, p.logViewer.Container())

	leftCol := container.NewVBox(
		p.panelCard("Quick Actions", quickActions),
		p.panelCard("Workspace Context", p.workspaceInfo),
		p.panelCard("Endpoint Method Mix", methodBox),
	)
	rightCol := container.NewVBox(
		p.panelCard("Run Telemetry", container.NewVBox(p.runInfo, p.progress, p.progressMeta, telemetry, p.qualityGate)),
		p.panelCard("Recent Activity", logBox),
	)

	mainArea := container.NewGridWithColumns(2, leftCol, rightCol)
	content := container.NewVBox(
		container.NewVBox(title, subtitle, p.selectedInfo),
		widget.NewSeparator(),
		metrics,
		widget.NewSeparator(),
		mainArea,
	)
	p.container = container.NewMax(container.NewPadded(container.NewScroll(content)))
}

func (p *DashboardPanel) newMethodList() *widget.List {
	list := widget.NewList(
		func() int { return len(p.methodRows) },
		func() fyne.CanvasObject {
			method := widget.NewLabelWithStyle("GET", fyne.TextAlignLeading, fyne.TextStyle{Bold: true, Monospace: true})
			count := widget.NewLabelWithStyle("0", fyne.TextAlignTrailing, fyne.TextStyle{Monospace: true})
			return container.NewHBox(method, widget.NewLabel("  "), count)
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			if id < 0 || id >= len(p.methodRows) {
				return
			}
			row := obj.(*fyne.Container)
			method := row.Objects[0].(*widget.Label)
			count := row.Objects[2].(*widget.Label)
			item := p.methodRows[id]
			method.SetText(item.Method)
			count.SetText(fmt.Sprintf("%d", item.Count))
		},
	)
	list.HideSeparators = true
	return list
}

func (p *DashboardPanel) navButton(label, target string) fyne.CanvasObject {
	btn := widget.NewButton(label, func() {
		if p.navigate != nil {
			p.navigate(target)
		}
	})
	btn.Importance = widget.LowImportance
	if p.navigate == nil {
		btn.Disable()
	}
	return btn
}

func (p *DashboardPanel) panelCard(title string, body fyne.CanvasObject) fyne.CanvasObject {
	bg := canvas.NewRectangle(color.RGBA{R: 0x11, G: 0x1B, B: 0x29, A: 0xFF})
	bg.CornerRadius = 8
	header := canvas.NewText(strings.ToUpper(title), color.RGBA{R: 0x95, G: 0xBF, B: 0xF7, A: 0xFF})
	header.TextStyle = fyne.TextStyle{Bold: true, Monospace: true}
	header.TextSize = 11
	sep := canvas.NewLine(color.RGBA{R: 0x2B, G: 0x39, B: 0x4D, A: 0xFF})
	sep.StrokeWidth = 1
	return container.NewStack(bg, container.NewPadded(container.NewVBox(header, sep, body)))
}

func (p *DashboardPanel) refresh() {
	ws := p.state.GetWorkspace()
	p.workspaceInfo.SetText(fmt.Sprintf(
		"spec: %s\nenv: %s\nauth: %s\nbaseURL: %s",
		orDash(ws.SpecPath),
		orDash(ws.EnvName),
		orDash(ws.AuthProfile),
		orDash(ws.BaseURL),
	))

	endpoints := p.state.GetEndpoints()
	summary := p.state.GetSpecSummary()
	if summary != nil {
		specTitle := strings.TrimSpace(summary.Title)
		if specTitle == "" {
			specTitle = "Untitled Spec"
		}
		p.specCard.SetValue(specTitle)
		if summary.Version != "" {
			p.specCard.SetSubtitle("v" + summary.Version)
		} else {
			p.specCard.SetSubtitle("Version unknown")
		}
	} else {
		p.specCard.SetValue("Not loaded")
		p.specCard.SetSubtitle("Load from Workspace")
	}

	totalEndpoints := len(endpoints)
	if totalEndpoints == 0 && summary != nil {
		if summary.EndpointsCount > 0 {
			totalEndpoints = summary.EndpointsCount
		} else if summary.EndpointCount > 0 {
			totalEndpoints = summary.EndpointCount
		}
	}
	p.endpointsCard.SetValue(fmt.Sprintf("%d", totalEndpoints))
	if summary != nil && summary.TagCount > 0 {
		p.endpointsCard.SetSubtitle(fmt.Sprintf("tags %d", summary.TagCount))
	} else {
		p.endpointsCard.SetSubtitle("tag inventory pending")
	}

	if ep := p.state.GetSelectedEndpoint(); ep != nil {
		p.selectedInfo.SetText(fmt.Sprintf("Selected endpoint: %s %s", strings.ToUpper(ep.Method), ep.Path))
	} else {
		p.selectedInfo.SetText("Selected endpoint: none")
	}

	p.methodRows = buildMethodCounts(endpoints)
	p.methodList.Refresh()

	s := p.state.GetRunSnapshot()
	p.updateRunCards(s)
	p.updateRunTelemetry(s)
}

func (p *DashboardPanel) updateRunCards(s appsvc.RunSnapshot) {
	if s.RunID == "" {
		p.runCard.SetValue("IDLE")
		p.runCard.SetSubtitle("No active run")
		p.successCard.SetValue("n/a")
		p.successCard.SetSubtitle("No assertions yet")
		p.qualityCard.SetValue("n/a")
		p.qualityCard.SetSubtitle("Awaiting metrics")
		return
	}

	runType := strings.ToUpper(strings.TrimSpace(s.RunType))
	if runType == "" {
		runType = "RUN"
	}
	status := strings.ToUpper(strings.TrimSpace(s.Status))
	if status == "" {
		status = "RUNNING"
	}
	p.runCard.SetValue(runType)
	p.runCard.SetSubtitle(fmt.Sprintf("%s • %s", s.RunID, status))

	executed := s.Progress.OKCount + s.Progress.ErrCount
	if executed > 0 {
		ratio := 100 * float64(s.Progress.OKCount) / float64(executed)
		p.successCard.SetValue(fmt.Sprintf("%.1f%%", ratio))
		p.successCard.SetSubtitle(fmt.Sprintf("ok %d / err %d", s.Progress.OKCount, s.Progress.ErrCount))
	} else {
		p.successCard.SetValue("n/a")
		p.successCard.SetSubtitle("Waiting assertions")
	}

	if len(s.Metrics) == 0 {
		p.qualityCard.SetValue("n/a")
		p.qualityCard.SetSubtitle("Awaiting metrics")
		return
	}
	last := s.Metrics[len(s.Metrics)-1]
	p.qualityCard.SetValue(fmt.Sprintf("%.2f%%", last.ErrorRate))
	p.qualityCard.SetSubtitle(fmt.Sprintf("p95 %dms | rps %.1f", last.P95, last.RPS))
}

func (p *DashboardPanel) updateRunTelemetry(s appsvc.RunSnapshot) {
	if s.RunID == "" {
		p.runInfo.SetText("No active run")
		p.progress.SetValue(0)
		p.progressMeta.SetText("0 / 0")
		p.qualityGate.Text = "Quality Gate: waiting metrics"
		p.qualityGate.Color = color.RGBA{R: 0x9A, G: 0xA9, B: 0xBD, A: 0xFF}
		p.qualityGate.Refresh()
		p.rpsChart.SetPoints(nil)
		p.errChart.SetPoints(nil)
		p.logViewer.SetLines([]string{"[idle] no activity"})
		return
	}

	p.runInfo.SetText(fmt.Sprintf(
		"run=%s\nstatus=%s\nphase=%s\nitem=%s",
		s.RunID,
		orDash(s.Status),
		orDash(s.Progress.Phase),
		orDash(s.Progress.CurrentItem),
	))

	if s.Progress.Total > 0 {
		v := float64(s.Progress.Done) / float64(s.Progress.Total)
		if v < 0 {
			v = 0
		}
		if v > 1 {
			v = 1
		}
		p.progress.SetValue(v)
		p.progressMeta.SetText(fmt.Sprintf("%d / %d  | ok=%d err=%d", s.Progress.Done, s.Progress.Total, s.Progress.OKCount, s.Progress.ErrCount))
	} else {
		p.progress.SetValue(0)
		p.progressMeta.SetText(fmt.Sprintf("ok=%d err=%d", s.Progress.OKCount, s.Progress.ErrCount))
	}

	if len(s.Metrics) > 0 {
		rps := make([]widgets.DataPoint, 0, len(s.Metrics))
		err := make([]widgets.DataPoint, 0, len(s.Metrics))
		for i, m := range s.Metrics {
			x := float64(i)
			rps = append(rps, widgets.DataPoint{X: x, Y: m.RPS})
			err = append(err, widgets.DataPoint{X: x, Y: m.ErrorRate})
		}
		p.rpsChart.SetPoints(rps)
		p.errChart.SetPoints(err)

		last := s.Metrics[len(s.Metrics)-1]
		passed := last.ErrorRate <= dashboardErrorGatePct && last.P95 <= dashboardP95GateMS
		if passed {
			p.qualityGate.Text = fmt.Sprintf("Quality Gate: PASS (err %.2f%% <= %.2f%%, p95 %dms <= %dms)", last.ErrorRate, dashboardErrorGatePct, last.P95, dashboardP95GateMS)
			p.qualityGate.Color = color.RGBA{R: 0x67, G: 0xD1, B: 0x95, A: 0xFF}
		} else {
			p.qualityGate.Text = fmt.Sprintf("Quality Gate: FAIL (err %.2f%%, p95 %dms)", last.ErrorRate, last.P95)
			p.qualityGate.Color = color.RGBA{R: 0xEA, G: 0x8C, B: 0x8C, A: 0xFF}
		}
		p.qualityGate.Refresh()
	} else {
		p.rpsChart.SetPoints(nil)
		p.errChart.SetPoints(nil)
		p.qualityGate.Text = "Quality Gate: waiting metrics"
		p.qualityGate.Color = color.RGBA{R: 0x9A, G: 0xA9, B: 0xBD, A: 0xFF}
		p.qualityGate.Refresh()
	}

	if len(s.Logs) == 0 {
		p.logViewer.SetLines([]string{"[live] waiting for activity"})
		return
	}
	p.logViewer.SetLines(s.Logs)
}

func buildMethodCounts(endpoints []appsvc.EndpointDTO) []methodCount {
	if len(endpoints) == 0 {
		return []methodCount{{Method: "NO DATA", Count: 0}}
	}

	m := map[string]int{}
	for _, ep := range endpoints {
		method := strings.ToUpper(strings.TrimSpace(ep.Method))
		if method == "" {
			method = "UNKNOWN"
		}
		m[method]++
	}
	out := make([]methodCount, 0, len(m))
	for method, count := range m {
		out = append(out, methodCount{Method: method, Count: count})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count == out[j].Count {
			return out[i].Method < out[j].Method
		}
		return out[i].Count > out[j].Count
	})
	return out
}

func orDash(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return "-"
	}
	return v
}

func (p *DashboardPanel) Container() fyne.CanvasObject { return p.container }
func (p *DashboardPanel) OnShow()                      { p.refresh() }
func (p *DashboardPanel) OnHide()                      {}
func (p *DashboardPanel) Dispose()                     {}
