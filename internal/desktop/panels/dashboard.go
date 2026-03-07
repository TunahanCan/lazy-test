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

// DashboardPanel displays the main dashboard.
type DashboardPanel struct {
	state SharedState

	specCard      *widgets.MetricCard
	endpointsCard *widgets.MetricCard
	testsCard     *widgets.MetricCard
	coverageCard  *widgets.MetricCard

	container *fyne.Container
}

func NewDashboardPanel(state SharedState) *DashboardPanel {
	p := &DashboardPanel{state: state}
	p.buildUI()

	state.OnSpecLoad(func(_ *appsvc.SpecSummary) { p.updateSummaryCards() })
	state.OnWorkspaceChange(func(_ appsvc.Workspace) { p.updateSummaryCards() })
	state.OnRunChange(func(_ appsvc.RunSnapshot) { p.updateSummaryCards() })
	return p
}

func (p *DashboardPanel) buildUI() {
	header := widget.NewLabel("Dashboard")
	header.TextStyle = fyne.TextStyle{Bold: true}

	p.specCard = widgets.NewMetricCard("OpenAPI Spec", "Not Loaded", "Load a spec to get started", widgets.ColorBlue)
	p.endpointsCard = widgets.NewMetricCard("Endpoints", "0", "Total discovered", widgets.ColorGreen)
	p.testsCard = widgets.NewMetricCard("Active Run", "none", "No active execution", widgets.ColorOrange)
	p.coverageCard = widgets.NewMetricCard("Error Rate", "0.00%", "From latest metrics", widgets.ColorPurple)

	summaryCards := widgets.CreateMetricCardGrid(p.specCard, p.endpointsCard, p.testsCard, p.coverageCard)

	quick := container.NewGridWithColumns(3,
		widget.NewCard("Workspace", "Configure files and env", widget.NewLabel("Use Workspace panel")),
		widget.NewCard("Explorer", "Inspect and invoke endpoints", widget.NewLabel("Use Explorer panel")),
		widget.NewCard("Runs", "Smoke, Drift, Compare, Load", widget.NewLabel("Use run panels")),
	)

	content := container.NewVBox(
		header,
		widget.NewLabel("LazyTest desktop orchestration dashboard"),
		widget.NewSeparator(),
		summaryCards,
		widget.NewSeparator(),
		quick,
	)
	p.container = container.NewMax(container.NewScroll(content))
	p.updateSummaryCards()
}

func (p *DashboardPanel) updateSummaryCards() {
	if summary := p.state.GetSpecSummary(); summary != nil {
		p.specCard.SetValue(summary.Title)
		if summary.Version != "" {
			p.specCard.SetSubtitle("Version: " + summary.Version)
		}
		count := summary.EndpointsCount
		if count == 0 {
			count = summary.EndpointCount
		}
		p.endpointsCard.SetValue(fmt.Sprintf("%d", count))
	} else {
		p.specCard.SetValue("Not Loaded")
		p.endpointsCard.SetValue("0")
	}

	s := p.state.GetRunSnapshot()
	if s.RunID != "" {
		p.testsCard.SetValue(s.RunType)
		p.testsCard.SetSubtitle(fmt.Sprintf("%s (%s)", s.RunID, s.Status))
	}
	if len(s.Metrics) > 0 {
		m := s.Metrics[len(s.Metrics)-1]
		p.coverageCard.SetValue(fmt.Sprintf("%.2f%%", m.ErrorRate))
		p.coverageCard.SetSubtitle(fmt.Sprintf("RPS %.1f / p95 %dms", m.RPS, m.P95))
	}
}

func (p *DashboardPanel) Container() fyne.CanvasObject { return p.container }
func (p *DashboardPanel) OnShow()                      {}
func (p *DashboardPanel) OnHide()                      {}
func (p *DashboardPanel) Dispose()                     {}
