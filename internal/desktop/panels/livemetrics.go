//go:build desktop

package panels

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"lazytest/internal/appsvc"

	"lazytest/internal/desktop/widgets"
)

type LiveMetricsPanel struct {
	state  SharedState
	status func(string)

	p95Chart   *widgets.LineChart
	rpsChart   *widgets.LineChart
	errChart   *widgets.LineChart
	statusBars *widgets.BarChart
	summary    *widget.Label
	container  fyne.CanvasObject
}

func NewLiveMetricsPanel(state SharedState, status func(string)) *LiveMetricsPanel {
	p := &LiveMetricsPanel{state: state, status: status}
	p.build()
	state.OnRunChange(p.render)
	return p
}

func (p *LiveMetricsPanel) build() {
	p.p95Chart = widgets.NewLineChart(120)
	p.rpsChart = widgets.NewLineChart(120)
	p.errChart = widgets.NewLineChart(120)
	p.statusBars = widgets.NewBarChart(8)
	p.summary = widget.NewLabel("No metrics yet")

	grid := container.NewGridWithColumns(2,
		widget.NewCard("p95 (ms)", "", p.p95Chart),
		widget.NewCard("RPS", "", p.rpsChart),
		widget.NewCard("Error Rate (%)", "", p.errChart),
		widget.NewCard("Status Distribution", "", p.statusBars),
	)
	p.container = container.NewScroll(container.NewVBox(
		widget.NewLabelWithStyle("Live Metrics", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		p.summary,
		grid,
	))
}

func (p *LiveMetricsPanel) render(s appsvc.RunSnapshot) {
	if len(s.Metrics) == 0 {
		return
	}
	p95 := make([]widgets.DataPoint, 0, len(s.Metrics))
	rps := make([]widgets.DataPoint, 0, len(s.Metrics))
	err := make([]widgets.DataPoint, 0, len(s.Metrics))
	for i, m := range s.Metrics {
		x := float64(i)
		p95 = append(p95, widgets.DataPoint{X: x, Y: float64(m.P95)})
		rps = append(rps, widgets.DataPoint{X: x, Y: m.RPS})
		err = append(err, widgets.DataPoint{X: x, Y: m.ErrorRate})
	}
	p.p95Chart.SetPoints(p95)
	p.rpsChart.SetPoints(rps)
	p.errChart.SetPoints(err)
	p.statusBars.SetStatuses(s.Statuses)
	last := s.Metrics[len(s.Metrics)-1]
	p.summary.SetText(fmt.Sprintf("run=%s (%s) p95=%dms rps=%.2f err=%.2f%%", s.RunID, s.Status, last.P95, last.RPS, last.ErrorRate))
}

func (p *LiveMetricsPanel) Container() fyne.CanvasObject { return p.container }
func (p *LiveMetricsPanel) OnShow()                      {}
func (p *LiveMetricsPanel) OnHide()                      {}
func (p *LiveMetricsPanel) Dispose()                     {}
