# 🎨 LazyTest Fyne Desktop - Complete Implementation Plan

> **Go TUI → Fyne Desktop GUI**  
> Modern, görsel ve tam özellikli API test platformu

---

## 📋 Executive Summary

Mevcut Go/TUI tabanlı `lazytest` uygulamasını **Fyne v2** framework'ü ile tam özellikli desktop uygulamasına dönüştürme planı. Mevcut `internal/desktop/` altyapısı geliştirilecek ve zenginleştirilecek.

### 🎯 Ana Hedefler

1. **Görsel Zenginlik** - Modern Material Design, custom widgets, animations
2. **Live Metrics** - Real-time charts, grafik görselleştirme
3. **Load Test UI** - Taurus plan editörü, canlı metrik dashboard
4. **Enhanced UX** - Keyboard shortcuts, drag-drop, context menus
5. **Responsive** - Goroutine-based async operations, cancel support

---

## 🏗️ Mevcut Durum (v1.0 - Basic)

### Var Olan Özellikler ✅
```
internal/desktop/fyne_ui.go (1257 satır)
├── Navigation panel (8 items)
├── Workspace management
├── Endpoint explorer + filtering
├── Manual request builder
├── Smoke test (progress tracking)
├── Drift analysis (findings viewer)
├── A/B comparison
└── Basic error handling
```

### Eksikler ⚠️
- ❌ Load test UI yok
- ❌ Live metrics dashboard yok
- ❌ Charting/visualization yok
- ❌ Custom theme desteği sınırlı
- ❌ Keyboard shortcuts eksik
- ❌ Progress indicators basic
- ❌ Log viewer yetersiz
- ❌ Export options sınırlı

---

## 🚀 Implementation Plan - 5 Fazlı Yaklaşım

### **FAZ 1: UI Refactoring & Foundation (1 hafta)**

**Hedef:** Mevcut monolitik `fyne_ui.go` dosyasını modüler yapıya dönüştür

#### 1.1 Dosya Organizasyonu

```bash
internal/desktop/
├── app.go                     # (mevcut - değişmez)
├── runmanager.go             # (mevcut - değişmez)
├── ui/
│   ├── main_window.go        # Ana pencere orchestrator
│   ├── theme.go              # Custom Fyne theme
│   ├── navigation.go         # Sol navigation bar
│   ├── statusbar.go          # Alt status bar
│   └── state.go              # UI state management
├── panels/                    # Her panel kendi dosyasında
│   ├── dashboard.go
│   ├── workspace.go
│   ├── explorer.go
│   ├── smoke.go
│   ├── drift.go
│   ├── abcompare.go
│   ├── loadtest.go           # YENİ
│   └── livemetrics.go        # YENİ
├── components/               # Reusable UI components
│   ├── endpoint_table.go
│   ├── metric_card.go
│   ├── chart.go
│   ├── log_viewer.go
│   ├── progress.go
│   └── diff_viewer.go
├── dialogs/                  # Modal dialogs
│   ├── file_picker.go
│   ├── env_editor.go
│   ├── test_config.go
│   └── export.go
└── widgets/                  # Custom Fyne widgets
    ├── clickable_card.go
    ├── collapsible.go
    ├── syntax_entry.go
    └── metric_gauge.go
```

#### 1.2 Ana Pencere Refactor

**internal/desktop/ui/main_window.go**
```go
package ui

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"lazytest/internal/appsvc"
	"lazytest/internal/desktop"
)

type MainWindow struct {
	app       *desktop.App
	fyneApp   fyne.App
	window    fyne.Window
	state     *UIState
	
	// Panels
	dashboard    *DashboardPanel
	workspace    *WorkspacePanel
	explorer     *ExplorerPanel
	smoke        *SmokePanel
	drift        *DriftPanel
	compare      *ComparePanel
	loadTest     *LoadTestPanel
	liveMetrics  *LiveMetricsPanel
	
	// UI Components
	nav          *Navigation
	statusBar    *StatusBar
	content      *fyne.Container
}

func NewMainWindow(desktopApp *desktop.App) *MainWindow {
	mw := &MainWindow{
		app:     desktopApp,
		fyneApp: app.NewWithID("com.lazytest.desktop"),
		state:   NewUIState(),
	}
	
	mw.window = mw.fyneApp.NewWindow("LazyTest - API Testing Suite")
	mw.window.Resize(fyne.NewSize(1400, 900))
	mw.window.SetMaster()
	
	mw.setupUI()
	mw.setupShortcuts()
	
	return mw
}

func (mw *MainWindow) setupUI() {
	// Initialize all panels
	mw.dashboard = NewDashboardPanel(mw.app, mw.state)
	mw.workspace = NewWorkspacePanel(mw.app, mw.state)
	mw.explorer = NewExplorerPanel(mw.app, mw.state)
	mw.smoke = NewSmokePanel(mw.app, mw.state)
	mw.drift = NewDriftPanel(mw.app, mw.state)
	mw.compare = NewComparePanel(mw.app, mw.state)
	mw.loadTest = NewLoadTestPanel(mw.app, mw.state)
	mw.liveMetrics = NewLiveMetricsPanel(mw.app, mw.state)
	
	// Navigation
	mw.nav = NewNavigation(mw.onNavigate)
	
	// Status bar
	mw.statusBar = NewStatusBar()
	
	// Content area (will switch based on navigation)
	mw.content = container.NewStack(mw.dashboard.Container())
	
	// Main layout: Navigation | Content
	//              Status Bar
	split := container.NewHSplit(
		mw.nav.Container(),
		mw.content,
	)
	split.SetOffset(0.15) // 15% for navigation
	
	main := container.NewBorder(
		nil,                   // top
		mw.statusBar.Container(), // bottom
		nil,                   // left
		nil,                   // right
		split,                // center
	)
	
	mw.window.SetContent(main)
}

func (mw *MainWindow) setupShortcuts() {
	// Global shortcuts
	mw.window.Canvas().AddShortcut(&desktop.Shortcut{
		KeyName:  fyne.KeyO,
		Modifier: fyne.KeyModifierControl,
		Handler:  func() { mw.workspace.OpenSpecFile() },
	}, func(shortcut fyne.Shortcut) {
		shortcut.(*desktop.Shortcut).Handler()
	})
	
	mw.window.Canvas().AddShortcut(&desktop.Shortcut{
		KeyName:  fyne.KeyR,
		Modifier: fyne.KeyModifierControl,
		Handler:  func() { mw.runSelectedTest() },
	}, func(shortcut fyne.Shortcut) {
		shortcut.(*desktop.Shortcut).Handler()
	})
	
	// ... more shortcuts
}

func (mw *MainWindow) onNavigate(panelName string) {
	var newContent fyne.CanvasObject
	
	switch panelName {
	case "Dashboard":
		newContent = mw.dashboard.Container()
	case "Workspace":
		newContent = mw.workspace.Container()
	case "Explorer":
		newContent = mw.explorer.Container()
	case "Smoke":
		newContent = mw.smoke.Container()
	case "Drift":
		newContent = mw.drift.Container()
	case "Compare":
		newContent = mw.compare.Container()
	case "LoadTests":
		newContent = mw.loadTest.Container()
	case "LiveMetrics":
		newContent = mw.liveMetrics.Container()
	}
	
	if newContent != nil {
		mw.content.Objects = []fyne.CanvasObject{newContent}
		mw.content.Refresh()
	}
}

func (mw *MainWindow) Show() {
	mw.window.ShowAndRun()
}
```

#### 1.3 UI State Management

**internal/desktop/ui/state.go**
```go
package ui

import (
	"sync"
	"lazytest/internal/appsvc"
)

type UIState struct {
	mu sync.RWMutex
	
	// Global state
	Workspace       appsvc.Workspace
	SpecSummary     *appsvc.SpecSummary
	Endpoints       []appsvc.EndpointDTO
	SelectedEndpoint *appsvc.EndpointDTO
	
	// Active runs
	ActiveRunID     string
	ActiveRunType   string // "smoke", "drift", "compare", "load"
	
	// Metrics
	LiveMetrics     *MetricsSnapshot
	
	// Callbacks for UI updates
	onWorkspaceChange []func(appsvc.Workspace)
	onSpecLoad        []func(*appsvc.SpecSummary)
	onEndpointsChange []func([]appsvc.EndpointDTO)
	onMetricsUpdate   []func(*MetricsSnapshot)
}

func NewUIState() *UIState {
	return &UIState{
		onWorkspaceChange: make([]func(appsvc.Workspace), 0),
		onSpecLoad:        make([]func(*appsvc.SpecSummary), 0),
		onEndpointsChange: make([]func([]appsvc.EndpointDTO), 0),
		onMetricsUpdate:   make([]func(*MetricsSnapshot), 0),
	}
}

func (s *UIState) SetWorkspace(ws appsvc.Workspace) {
	s.mu.Lock()
	s.Workspace = ws
	callbacks := s.onWorkspaceChange
	s.mu.Unlock()
	
	for _, cb := range callbacks {
		cb(ws)
	}
}

func (s *UIState) OnWorkspaceChange(cb func(appsvc.Workspace)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onWorkspaceChange = append(s.onWorkspaceChange, cb)
}

// ... similar methods for other state changes
```

---

### **FAZ 2: Custom Theme & Visual Enhancement (1 hafta)**

**Hedef:** Modern, görsel olarak çekici tema ve custom widgets

#### 2.1 Custom Theme

**internal/desktop/ui/theme.go**
```go
package ui

import (
	"image/color"
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
)

type LazyTestTheme struct {
	variant fyne.ThemeVariant
}

func NewLazyTestTheme(variant fyne.ThemeVariant) *LazyTestTheme {
	return &LazyTestTheme{variant: variant}
}

func (t *LazyTestTheme) Color(name fyne.ThemeColorName, variant fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNamePrimary:
		return color.RGBA{R: 0x1E, G: 0x88, B: 0xE5, A: 0xFF} // Blue
	case theme.ColorNameSuccess:
		return color.RGBA{R: 0x4C, G: 0xAF, B: 0x50, A: 0xFF} // Green
	case theme.ColorNameWarning:
		return color.RGBA{R: 0xFF, G: 0x98, B: 0x00, A: 0xFF} // Orange
	case theme.ColorNameError:
		return color.RGBA{R: 0xF4, G: 0x43, B: 0x36, A: 0xFF} // Red
	case theme.ColorNameBackground:
		if variant == theme.VariantDark {
			return color.RGBA{R: 0x1E, G: 0x1E, B: 0x1E, A: 0xFF}
		}
		return color.RGBA{R: 0xFA, G: 0xFA, B: 0xFA, A: 0xFF}
	}
	return theme.DefaultTheme().Color(name, variant)
}

func (t *LazyTestTheme) Font(style fyne.TextStyle) fyne.Resource {
	if style.Monospace {
		return theme.DefaultTheme().Font(style)
	}
	// Use custom font if available
	return theme.DefaultTheme().Font(style)
}

func (t *LazyTestTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	// Custom icons
	switch name {
	case "smoke":
		return resourceSmokeIconPng
	case "drift":
		return resourceDriftIconPng
	// ... more custom icons
	}
	return theme.DefaultTheme().Icon(name)
}

func (t *LazyTestTheme) Size(name fyne.ThemeSizeName) float32 {
	switch name {
	case theme.SizeNamePadding:
		return 8
	case theme.SizeNameText:
		return 14
	}
	return theme.DefaultTheme().Size(name)
}
```

#### 2.2 Custom Widgets - Metric Card

**internal/desktop/widgets/metric_card.go**
```go
package widgets

import (
	"fmt"
	"image/color"
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

type MetricCard struct {
	widget.BaseWidget
	
	title    string
	value    string
	subtitle string
	icon     fyne.Resource
	bgColor  color.Color
	
	titleLabel    *canvas.Text
	valueLabel    *canvas.Text
	subtitleLabel *canvas.Text
	iconObj       *canvas.Image
	background    *canvas.Rectangle
}

func NewMetricCard(title, value, subtitle string, icon fyne.Resource, bgColor color.Color) *MetricCard {
	mc := &MetricCard{
		title:    title,
		value:    value,
		subtitle: subtitle,
		icon:     icon,
		bgColor:  bgColor,
	}
	mc.ExtendBaseWidget(mc)
	return mc
}

func (mc *MetricCard) CreateRenderer() fyne.WidgetRenderer {
	mc.background = canvas.NewRectangle(mc.bgColor)
	mc.background.CornerRadius = 8
	
	mc.titleLabel = canvas.NewText(mc.title, color.White)
	mc.titleLabel.TextSize = 12
	mc.titleLabel.TextStyle = fyne.TextStyle{Bold: true}
	
	mc.valueLabel = canvas.NewText(mc.value, color.White)
	mc.valueLabel.TextSize = 24
	mc.valueLabel.TextStyle = fyne.TextStyle{Bold: true}
	
	mc.subtitleLabel = canvas.NewText(mc.subtitle, color.White)
	mc.subtitleLabel.TextSize = 10
	
	if mc.icon != nil {
		mc.iconObj = canvas.NewImageFromResource(mc.icon)
		mc.iconObj.FillMode = canvas.ImageFillContain
	}
	
	objects := []fyne.CanvasObject{
		mc.background,
		mc.titleLabel,
		mc.valueLabel,
		mc.subtitleLabel,
	}
	
	if mc.iconObj != nil {
		objects = append(objects, mc.iconObj)
	}
	
	return &metricCardRenderer{
		card:    mc,
		objects: objects,
	}
}

func (mc *MetricCard) SetValue(value string) {
	mc.value = value
	if mc.valueLabel != nil {
		mc.valueLabel.Text = value
		mc.valueLabel.Refresh()
	}
}

type metricCardRenderer struct {
	card    *MetricCard
	objects []fyne.CanvasObject
}

func (r *metricCardRenderer) Layout(size fyne.Size) {
	r.card.background.Resize(size)
	
	padding := float32(12)
	
	// Title at top-left
	r.card.titleLabel.Move(fyne.NewPos(padding, padding))
	
	// Icon at top-right
	if r.card.iconObj != nil {
		iconSize := float32(40)
		r.card.iconObj.Resize(fyne.NewSize(iconSize, iconSize))
		r.card.iconObj.Move(fyne.NewPos(size.Width-iconSize-padding, padding))
	}
	
	// Value in middle
	r.card.valueLabel.Move(fyne.NewPos(padding, size.Height/2-12))
	
	// Subtitle at bottom
	r.card.subtitleLabel.Move(fyne.NewPos(padding, size.Height-20-padding))
}

func (r *metricCardRenderer) MinSize() fyne.Size {
	return fyne.NewSize(150, 100)
}

func (r *metricCardRenderer) Refresh() {
	canvas.Refresh(r.card)
}

func (r *metricCardRenderer) Objects() []fyne.CanvasObject {
	return r.objects
}

func (r *metricCardRenderer) Destroy() {}
```

#### 2.3 Custom Widgets - Collapsible Section

**internal/desktop/widgets/collapsible.go**
```go
package widgets

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

type Collapsible struct {
	widget.BaseWidget
	
	title     string
	content   fyne.CanvasObject
	expanded  bool
	
	titleBtn  *widget.Button
	container *fyne.Container
}

func NewCollapsible(title string, content fyne.CanvasObject) *Collapsible {
	c := &Collapsible{
		title:    title,
		content:  content,
		expanded: true,
	}
	c.ExtendBaseWidget(c)
	
	c.titleBtn = widget.NewButton("▼ "+title, func() {
		c.Toggle()
	})
	c.titleBtn.Importance = widget.LowImportance
	
	c.updateContainer()
	
	return c
}

func (c *Collapsible) Toggle() {
	c.expanded = !c.expanded
	c.updateContainer()
	c.Refresh()
}

func (c *Collapsible) updateContainer() {
	icon := "▼"
	if !c.expanded {
		icon = "▶"
	}
	c.titleBtn.SetText(icon + " " + c.title)
	
	if c.expanded {
		c.container = container.NewVBox(c.titleBtn, c.content)
	} else {
		c.container = container.NewVBox(c.titleBtn)
	}
}

func (c *Collapsible) CreateRenderer() fyne.WidgetRenderer {
	return widget.NewSimpleRenderer(c.container)
}
```

---

### **FAZ 3: Load Test UI & Live Metrics (2 hafta)**

**Hedef:** Taurus load test UI ve real-time metrics dashboard

#### 3.1 Load Test Panel

**internal/desktop/panels/loadtest.go**
```go
package panels

import (
	"context"
	"fmt"
	"time"
	
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
	"lazytest/internal/appsvc"
	"lazytest/internal/desktop"
	"lazytest/internal/desktop/ui"
	"lazytest/internal/desktop/widgets"
)

type LoadTestPanel struct {
	app   *desktop.App
	state *ui.UIState
	
	// UI Components
	planSelector   *widget.Select
	envEntry       *widget.Entry
	durationEntry  *widget.Entry
	rpsEntry       *widget.Entry
	threadsEntry   *widget.Entry
	
	startBtn       *widget.Button
	stopBtn        *widget.Button
	
	progressBar    *widget.ProgressBar
	statusLabel    *widget.Label
	
	// Live metrics cards
	rpsCard        *widgets.MetricCard
	latencyP50Card *widgets.MetricCard
	latencyP95Card *widgets.MetricCard
	latencyP99Card *widgets.MetricCard
	errorsCard     *widgets.MetricCard
	
	// Chart
	metricsChart   *widgets.LineChart
	
	// Log viewer
	logViewer      *widget.Entry
	
	container      *fyne.Container
	
	// Runtime
	cancelFunc     context.CancelFunc
}

func NewLoadTestPanel(app *desktop.App, state *ui.UIState) *LoadTestPanel {
	p := &LoadTestPanel{
		app:   app,
		state: state,
	}
	p.buildUI()
	return p
}

func (p *LoadTestPanel) buildUI() {
	// Top: Configuration
	p.planSelector = widget.NewSelect([]string{"plans/tcp.yaml", "plans/http.yaml"}, nil)
	p.planSelector.PlaceHolder = "Select LT Plan..."
	
	p.envEntry = widget.NewEntry()
	p.envEntry.SetPlaceHolder("Environment (e.g., dev)")
	
	p.durationEntry = widget.NewEntry()
	p.durationEntry.SetText("60s")
	
	p.rpsEntry = widget.NewEntry()
	p.rpsEntry.SetText("10")
	
	p.threadsEntry = widget.NewEntry()
	p.threadsEntry.SetText("5")
	
	configForm := container.NewGridWithColumns(5,
		widget.NewLabel("Plan:"), p.planSelector,
		widget.NewLabel("Env:"), p.envEntry,
		widget.NewLabel("Duration:"), p.durationEntry,
		widget.NewLabel("RPS:"), p.rpsEntry,
		widget.NewLabel("Threads:"), p.threadsEntry,
	)
	
	// Buttons
	p.startBtn = widget.NewButton("Start Load Test", p.onStart)
	p.startBtn.Importance = widget.HighImportance
	
	p.stopBtn = widget.NewButton("Stop", p.onStop)
	p.stopBtn.Disable()
	
	buttons := container.NewHBox(p.startBtn, p.stopBtn)
	
	// Progress
	p.progressBar = widget.NewProgressBar()
	p.statusLabel = widget.NewLabel("Ready")
	
	progress := container.NewVBox(p.progressBar, p.statusLabel)
	
	// Metrics Cards
	p.rpsCard = widgets.NewMetricCard("RPS", "0", "Requests/sec", nil, color.RGBA{0x1E, 0x88, 0xE5, 0xFF})
	p.latencyP50Card = widgets.NewMetricCard("p50", "0ms", "50th percentile", nil, color.RGBA{0x4C, 0xAF, 0x50, 0xFF})
	p.latencyP95Card = widgets.NewMetricCard("p95", "0ms", "95th percentile", nil, color.RGBA{0xFF, 0x98, 0x00, 0xFF})
	p.latencyP99Card = widgets.NewMetricCard("p99", "0ms", "99th percentile", nil, color.RGBA{0xF4, 0x43, 0x36, 0xFF})
	p.errorsCard = widgets.NewMetricCard("Errors", "0%", "Error rate", nil, color.RGBA{0x9C, 0x27, 0xB0, 0xFF})
	
	metricsCards := container.NewGridWithColumns(5,
		p.rpsCard,
		p.latencyP50Card,
		p.latencyP95Card,
		p.latencyP99Card,
		p.errorsCard,
	)
	
	// Chart
	p.metricsChart = widgets.NewLineChart("Response Time Distribution")
	
	// Log viewer
	p.logViewer = widget.NewMultiLineEntry()
	p.logViewer.SetPlaceHolder("Load test logs will appear here...")
	p.logViewer.Disable()
	
	logScroll := container.NewScroll(p.logViewer)
	logScroll.SetMinSize(fyne.NewSize(0, 150))
	
	// Layout
	p.container = container.NewBorder(
		container.NewVBox(configForm, buttons, progress),
		logScroll,
		nil,
		nil,
		container.NewVBox(
			metricsCards,
			p.metricsChart.Container(),
		),
	)
}

func (p *LoadTestPanel) onStart() {
	planPath := p.planSelector.Selected
	if planPath == "" {
		p.showError("Please select a load test plan")
		return
	}
	
	// Disable start, enable stop
	p.startBtn.Disable()
	p.stopBtn.Enable()
	
	p.statusLabel.SetText("Starting load test...")
	p.logViewer.SetText("")
	
	// Create context with cancel
	ctx, cancel := context.WithCancel(context.Background())
	p.cancelFunc = cancel
	
	// Start load test in goroutine
	go p.runLoadTest(ctx, planPath)
}

func (p *LoadTestPanel) onStop() {
	if p.cancelFunc != nil {
		p.cancelFunc()
		p.cancelFunc = nil
	}
	p.stopBtn.Disable()
	p.startBtn.Enable()
	p.statusLabel.SetText("Stopped by user")
}

func (p *LoadTestPanel) runLoadTest(ctx context.Context, planPath string) {
	// TODO: Integrate with internal/lt/runner.go
	
	// Simulate load test for now
	startTime := time.Now()
	duration := 60 * time.Second
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			p.appendLog("Load test cancelled")
			return
			
		case <-ticker.C:
			elapsed := time.Since(startTime)
			if elapsed > duration {
				p.appendLog("Load test completed")
				p.stopBtn.Disable()
				p.startBtn.Enable()
				return
			}
			
			// Update progress
			progress := float64(elapsed) / float64(duration)
			p.progressBar.SetValue(progress)
			
			// Simulate metrics
			p.updateMetrics(elapsed)
		}
	}
}

func (p *LoadTestPanel) updateMetrics(elapsed time.Duration) {
	// Mock metrics - replace with real data from lt/metrics.go
	rps := fmt.Sprintf("%.1f", 10.0 + float64(elapsed.Seconds())*0.5)
	p50 := fmt.Sprintf("%dms", 20+int(elapsed.Seconds())%10)
	p95 := fmt.Sprintf("%dms", 50+int(elapsed.Seconds())%20)
	p99 := fmt.Sprintf("%dms", 100+int(elapsed.Seconds())%30)
	errors := "0.5%"
	
	p.rpsCard.SetValue(rps)
	p.latencyP50Card.SetValue(p50)
	p.latencyP95Card.SetValue(p95)
	p.latencyP99Card.SetValue(p99)
	p.errorsCard.SetValue(errors)
	
	// Update chart
	p.metricsChart.AddDataPoint(elapsed.Seconds(), 20+float64(int(elapsed.Seconds())%10))
}

func (p *LoadTestPanel) appendLog(msg string) {
	timestamp := time.Now().Format("15:04:05")
	p.logViewer.SetText(p.logViewer.Text + fmt.Sprintf("[%s] %s\n", timestamp, msg))
}

func (p *LoadTestPanel) showError(msg string) {
	// TODO: Show dialog
	p.statusLabel.SetText("Error: " + msg)
}

func (p *LoadTestPanel) Container() fyne.CanvasObject {
	return p.container
}
```

#### 3.2 Line Chart Widget

**internal/desktop/widgets/chart.go**
```go
package widgets

import (
	"image/color"
	"math"
	
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

type LineChart struct {
	widget.BaseWidget
	
	title      string
	dataPoints []DataPoint
	maxPoints  int
	
	titleLabel *canvas.Text
	chart      *canvas.Line
	background *canvas.Rectangle
	container  *fyne.Container
}

type DataPoint struct {
	X float64
	Y float64
}

func NewLineChart(title string) *LineChart {
	lc := &LineChart{
		title:      title,
		dataPoints: make([]DataPoint, 0),
		maxPoints:  100, // Keep last 100 points
	}
	lc.ExtendBaseWidget(lc)
	
	lc.titleLabel = canvas.NewText(title, color.Black)
	lc.titleLabel.TextSize = 16
	lc.titleLabel.TextStyle = fyne.TextStyle{Bold: true}
	
	lc.background = canvas.NewRectangle(color.White)
	
	lc.container = container.NewStack(
		lc.background,
		lc.titleLabel,
		// Chart lines will be added dynamically
	)
	
	return lc
}

func (lc *LineChart) AddDataPoint(x, y float64) {
	lc.dataPoints = append(lc.dataPoints, DataPoint{X: x, Y: y})
	
	// Keep only last maxPoints
	if len(lc.dataPoints) > lc.maxPoints {
		lc.dataPoints = lc.dataPoints[1:]
	}
	
	lc.Refresh()
}

func (lc *LineChart) CreateRenderer() fyne.WidgetRenderer {
	return &lineChartRenderer{
		chart:      lc,
		background: lc.background,
		titleLabel: lc.titleLabel,
	}
}

func (lc *LineChart) Container() fyne.CanvasObject {
	return lc.container
}

type lineChartRenderer struct {
	chart      *LineChart
	background *canvas.Rectangle
	titleLabel *canvas.Text
	lines      []*canvas.Line
}

func (r *lineChartRenderer) Layout(size fyne.Size) {
	r.background.Resize(size)
	r.titleLabel.Move(fyne.NewPos(10, 10))
	
	// Clear old lines
	r.lines = make([]*canvas.Line, 0)
	
	if len(r.chart.dataPoints) < 2 {
		return
	}
	
	// Calculate chart area (leave margins)
	chartTop := float32(40)
	chartBottom := size.Height - 20
	chartLeft := float32(40)
	chartRight := size.Width - 20
	chartWidth := chartRight - chartLeft
	chartHeight := chartBottom - chartTop
	
	// Find min/max for scaling
	minX, maxX := r.chart.dataPoints[0].X, r.chart.dataPoints[0].X
	minY, maxY := r.chart.dataPoints[0].Y, r.chart.dataPoints[0].Y
	
	for _, dp := range r.chart.dataPoints {
		if dp.X < minX {
			minX = dp.X
		}
		if dp.X > maxX {
			maxX = dp.X
		}
		if dp.Y < minY {
			minY = dp.Y
		}
		if dp.Y > maxY {
			maxY = dp.Y
		}
	}
	
	// Draw lines between points
	for i := 1; i < len(r.chart.dataPoints); i++ {
		p1 := r.chart.dataPoints[i-1]
		p2 := r.chart.dataPoints[i]
		
		// Scale to chart area
		x1 := chartLeft + float32((p1.X-minX)/(maxX-minX))*chartWidth
		y1 := chartBottom - float32((p1.Y-minY)/(maxY-minY))*chartHeight
		x2 := chartLeft + float32((p2.X-minX)/(maxX-minX))*chartWidth
		y2 := chartBottom - float32((p2.Y-minY)/(maxY-minY))*chartHeight
		
		line := canvas.NewLine(color.RGBA{R: 0x1E, G: 0x88, B: 0xE5, A: 0xFF})
		line.Position1 = fyne.NewPos(x1, y1)
		line.Position2 = fyne.NewPos(x2, y2)
		line.StrokeWidth = 2
		
		r.lines = append(r.lines, line)
	}
}

func (r *lineChartRenderer) MinSize() fyne.Size {
	return fyne.NewSize(400, 300)
}

func (r *lineChartRenderer) Refresh() {
	r.background.Refresh()
	r.titleLabel.Refresh()
	canvas.Refresh(r.chart)
}

func (r *lineChartRenderer) Objects() []fyne.CanvasObject {
	objects := []fyne.CanvasObject{r.background, r.titleLabel}
	for _, line := range r.lines {
		objects = append(objects, line)
	}
	return objects
}

func (r *lineChartRenderer) Destroy() {}
```

---

### **FAZ 4: Enhanced Panels & Components (1 hafta)**

**Hedef:** Mevcut panelleri zenginleştir, custom componentler ekle

#### 4.1 Dashboard Panel (Geliştirilmiş)

**internal/desktop/panels/dashboard.go**
```go
package panels

import (
	"fmt"
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
	"lazytest/internal/desktop"
	"lazytest/internal/desktop/ui"
	"lazytest/internal/desktop/widgets"
)

type DashboardPanel struct {
	app   *desktop.App
	state *ui.UIState
	
	// Summary cards
	specCard      *widgets.MetricCard
	endpointsCard *widgets.MetricCard
	testsCard     *widgets.MetricCard
	coverageCard  *widgets.MetricCard
	
	// Recent activity
	activityList  *widget.List
	
	// Quick actions
	quickActions  *fyne.Container
	
	container     *fyne.Container
}

func NewDashboardPanel(app *desktop.App, state *ui.UIState) *DashboardPanel {
	p := &DashboardPanel{
		app:   app,
		state: state,
	}
	p.buildUI()
	
	// Subscribe to state changes
	state.OnSpecLoad(func(summary *appsvc.SpecSummary) {
		p.updateSummaryCards()
	})
	
	return p
}

func (p *DashboardPanel) buildUI() {
	// Welcome header
	header := widget.NewLabel("Welcome to LazyTest")
	header.TextStyle = fyne.TextStyle{Bold: true}
	header.Alignment = fyne.TextAlignCenter
	
	// Summary cards
	p.specCard = widgets.NewMetricCard(
		"OpenAPI Spec",
		"Not Loaded",
		"Load a spec to get started",
		nil,
		color.RGBA{0x1E, 0x88, 0xE5, 0xFF},
	)
	
	p.endpointsCard = widgets.NewMetricCard(
		"Endpoints",
		"0",
		"Total discovered",
		nil,
		color.RGBA{0x4C, 0xAF, 0x50, 0xFF},
	)
	
	p.testsCard = widgets.NewMetricCard(
		"Tests Run",
		"0",
		"Today",
		nil,
		color.RGBA{0xFF, 0x98, 0x00, 0xFF},
	)
	
	p.coverageCard = widgets.NewMetricCard(
		"Coverage",
		"0%",
		"Endpoints tested",
		nil,
		color.RGBA{0x9C, 0x27, 0xB0, 0xFF},
	)
	
	summaryCards := container.NewGridWithColumns(4,
		p.specCard,
		p.endpointsCard,
		p.testsCard,
		p.coverageCard,
	)
	
	// Quick actions
	p.quickActions = container.NewGridWithColumns(3,
		widget.NewButton("Load OpenAPI Spec", p.onLoadSpec),
		widget.NewButton("Run Smoke Test", p.onRunSmoke),
		widget.NewButton("View Reports", p.onViewReports),
	)
	
	// Recent activity
	p.activityList = widget.NewList(
		func() int { return 10 }, // Mock data
		func() fyne.CanvasObject {
			return widget.NewLabel("Activity item")
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			obj.(*widget.Label).SetText(fmt.Sprintf("Activity #%d - Test completed", id+1))
		},
	)
	
	activitySection := widgets.NewCollapsible("Recent Activity", p.activityList)
	
	// Layout
	p.container = container.NewVBox(
		header,
		widget.NewSeparator(),
		summaryCards,
		widget.NewLabel("Quick Actions"),
		p.quickActions,
		widget.NewSeparator(),
		activitySection,
	)
}

func (p *DashboardPanel) updateSummaryCards() {
	if p.state.SpecSummary != nil {
		sum := p.state.SpecSummary
		p.specCard.SetValue(sum.Title)
		p.endpointsCard.SetValue(fmt.Sprintf("%d", sum.TotalEndpoints))
		// ... update other cards
	}
}

func (p *DashboardPanel) onLoadSpec() {
	// Navigate to workspace panel
	// TODO: Trigger navigation
}

func (p *DashboardPanel) onRunSmoke() {
	// Navigate to smoke panel
}

func (p *DashboardPanel) onViewReports() {
	// Navigate to reports panel
}

func (p *DashboardPanel) Container() fyne.CanvasObject {
	return p.container
}
```

#### 4.2 Endpoint Table Component

**internal/desktop/components/endpoint_table.go**
```go
package components

import (
	"fmt"
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
	"lazytest/internal/appsvc"
)

type EndpointTable struct {
	endpoints       []appsvc.EndpointDTO
	filteredIndices []int
	
	table           *widget.Table
	onSelect        func(*appsvc.EndpointDTO)
	onDoubleClick   func(*appsvc.EndpointDTO)
	
	container       *fyne.Container
}

func NewEndpointTable(onSelect, onDoubleClick func(*appsvc.EndpointDTO)) *EndpointTable {
	et := &EndpointTable{
		endpoints:       make([]appsvc.EndpointDTO, 0),
		filteredIndices: make([]int, 0),
		onSelect:        onSelect,
		onDoubleClick:   onDoubleClick,
	}
	
	et.table = widget.NewTable(
		func() (int, int) { return len(et.filteredIndices), 5 }, // rows, cols
		func() fyne.CanvasObject {
			return widget.NewLabel("Cell")
		},
		func(id widget.TableCellID, cell fyne.CanvasObject) {
			label := cell.(*widget.Label)
			
			if id.Row < 0 || id.Row >= len(et.filteredIndices) {
				label.SetText("")
				return
			}
			
			ep := et.endpoints[et.filteredIndices[id.Row]]
			
			switch id.Col {
			case 0:
				label.SetText(ep.Method)
			case 1:
				label.SetText(ep.Path)
			case 2:
				label.SetText(ep.Summary)
			case 3:
				label.SetText(fmt.Sprintf("%v", ep.Tags))
			case 4:
				label.SetText(ep.OperationID)
			}
		},
	)
	
	// Column headers
	et.table.SetColumnWidth(0, 80)  // Method
	et.table.SetColumnWidth(1, 300) // Path
	et.table.SetColumnWidth(2, 300) // Summary
	et.table.SetColumnWidth(3, 150) // Tags
	et.table.SetColumnWidth(4, 200) // OperationID
	
	// Selection handling
	et.table.OnSelected = func(id widget.TableCellID) {
		if id.Row >= 0 && id.Row < len(et.filteredIndices) && et.onSelect != nil {
			ep := et.endpoints[et.filteredIndices[id.Row]]
			et.onSelect(&ep)
		}
	}
	
	et.container = container.NewStack(et.table)
	
	return et
}

func (et *EndpointTable) SetEndpoints(endpoints []appsvc.EndpointDTO) {
	et.endpoints = endpoints
	et.filteredIndices = make([]int, len(endpoints))
	for i := range endpoints {
		et.filteredIndices[i] = i
	}
	et.table.Refresh()
}

func (et *EndpointTable) Filter(filterText string) {
	if filterText == "" {
		et.filteredIndices = make([]int, len(et.endpoints))
		for i := range et.endpoints {
			et.filteredIndices[i] = i
		}
	} else {
		et.filteredIndices = make([]int, 0)
		for i, ep := range et.endpoints {
			if contains(ep.Path, filterText) || contains(ep.Summary, filterText) {
				et.filteredIndices = append(et.filteredIndices, i)
			}
		}
	}
	et.table.Refresh()
}

func (et *EndpointTable) Container() fyne.CanvasObject {
	return et.container
}

func contains(s, substr string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(substr))
}
```

---

### **FAZ 5: Polish & Integration (1 hafta)**

**Hedef:** Final touches, bug fixes, integration testing

#### 5.1 Run Function Integration

**internal/desktop/run.go** (güncelle)
```go
//go:build desktop

package desktop

import (
	"os"
	"path/filepath"
	"lazytest/internal/desktop/ui"
)

func Run() error {
	// Determine workspace path
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	workspacePath := filepath.Join(homeDir, ".lazytest", "workspace.yaml")
	
	// Create desktop app (backend)
	app := NewApp(workspacePath)
	
	// Create UI (frontend)
	mainWindow := ui.NewMainWindow(app)
	
	// Apply custom theme
	fyneApp := mainWindow.GetFyneApp()
	fyneApp.Settings().SetTheme(ui.NewLazyTestTheme(fyne.ThemeVariantLight))
	
	// Show window
	mainWindow.Show()
	
	return nil
}
```

#### 5.2 Build & Package Scripts

**scripts/build-desktop.sh**
```bash
#!/bin/bash

set -e

echo "Building LazyTest Desktop..."

# Build tags
BUILD_TAGS="desktop"

# Output binary
OUTPUT="bin/lazytest-desktop"

# Platform-specific builds
case "$1" in
  windows)
    GOOS=windows GOARCH=amd64 go build -tags $BUILD_TAGS -o ${OUTPUT}.exe cmd/lazytest-desktop/main.go
    echo "Built: ${OUTPUT}.exe"
    ;;
  macos)
    GOOS=darwin GOARCH=amd64 go build -tags $BUILD_TAGS -o ${OUTPUT}-amd64 cmd/lazytest-desktop/main.go
    GOOS=darwin GOARCH=arm64 go build -tags $BUILD_TAGS -o ${OUTPUT}-arm64 cmd/lazytest-desktop/main.go
    lipo -create ${OUTPUT}-amd64 ${OUTPUT}-arm64 -output ${OUTPUT}
    rm ${OUTPUT}-amd64 ${OUTPUT}-arm64
    echo "Built universal binary: ${OUTPUT}"
    ;;
  linux)
    GOOS=linux GOARCH=amd64 go build -tags $BUILD_TAGS -o ${OUTPUT} cmd/lazytest-desktop/main.go
    echo "Built: ${OUTPUT}"
    ;;
  *)
    go build -tags $BUILD_TAGS -o ${OUTPUT} cmd/lazytest-desktop/main.go
    echo "Built: ${OUTPUT}"
    ;;
esac

echo "Done!"
```

**scripts/package-desktop.sh**
```bash
#!/bin/bash

set -e

echo "Packaging LazyTest Desktop with Fyne..."

# Install fyne CLI if not present
if ! command -v fyne &> /dev/null; then
    echo "Installing fyne CLI..."
    go install fyne.io/fyne/v2/cmd/fyne@latest
fi

APP_NAME="LazyTest"
APP_ID="com.lazytest.desktop"
ICON="resources/icon.png"

case "$1" in
  windows)
    fyne package -os windows -name "$APP_NAME" -appID "$APP_ID" -icon "$ICON" -src cmd/lazytest-desktop
    echo "Created: ${APP_NAME}.exe"
    ;;
  macos)
    fyne package -os darwin -name "$APP_NAME" -appID "$APP_ID" -icon "$ICON" -src cmd/lazytest-desktop
    echo "Created: ${APP_NAME}.app"
    ;;
  linux)
    fyne package -os linux -name "$APP_NAME" -appID "$APP_ID" -icon "$ICON" -src cmd/lazytest-desktop
    echo "Created: ${APP_NAME}.tar.xz"
    ;;
  *)
    fyne package -name "$APP_NAME" -appID "$APP_ID" -icon "$ICON" -src cmd/lazytest-desktop
    echo "Created package for current OS"
    ;;
esac

echo "Done!"
```

---

## 🧪 Testing Strategy

### Unit Tests
```go
// internal/desktop/ui/state_test.go
func TestUIState_SetWorkspace(t *testing.T) {
	state := NewUIState()
	called := false
	
	state.OnWorkspaceChange(func(ws appsvc.Workspace) {
		called = true
	})
	
	ws := appsvc.Workspace{EnvName: "test"}
	state.SetWorkspace(ws)
	
	if !called {
		t.Error("Callback not invoked")
	}
}
```

### Integration Tests
```go
// internal/desktop/panels/smoke_test.go
func TestSmokePanel_RunSmoke(t *testing.T) {
	app := desktop.NewApp("test-workspace.yaml")
	state := ui.NewUIState()
	panel := NewSmokePanel(app, state)
	
	// Mock endpoints
	endpoints := []appsvc.EndpointDTO{
		{ID: "1", Method: "GET", Path: "/test"},
	}
	state.SetEndpoints(endpoints)
	
	// Run smoke
	// ... test smoke execution
}
```

---

## 📦 Build & Deployment

### Development
```bash
# Run with desktop UI
go run -tags desktop cmd/lazytest-desktop/main.go

# Build
./scripts/build-desktop.sh

# Package
./scripts/package-desktop.sh
```

### Cross-platform Build
```bash
# Windows
./scripts/build-desktop.sh windows
./scripts/package-desktop.sh windows

# macOS (universal binary)
./scripts/build-desktop.sh macos
./scripts/package-desktop.sh macos

# Linux
./scripts/build-desktop.sh linux
./scripts/package-desktop.sh linux
```

### Distribution
- **Windows**: `.exe` + installer (Inno Setup)
- **macOS**: `.app` + `.dmg` (fyne package)
- **Linux**: `.tar.xz` + `.deb` / `.rpm` (fyne package)

---

## 🎯 Milestone Timeline

| Faz | Süre | Deliverable |
|-----|------|-------------|
| **Faz 1: UI Refactor** | 1 hafta | Modüler yapı, state management, navigation |
| **Faz 2: Custom Theme** | 1 hafta | Theme, custom widgets (MetricCard, Collapsible, Chart) |
| **Faz 3: Load Test & Metrics** | 2 hafta | Load test panel, live metrics, charts |
| **Faz 4: Enhanced Panels** | 1 hafta | Dashboard, Explorer, improved existing panels |
| **Faz 5: Polish** | 1 hafta | Bug fixes, packaging, documentation |

**Toplam:** ~6 hafta

---

## 🔄 TUI → Fyne Mapping

| TUI Component | Fyne Equivalent |
|---------------|-----------------|
| `bubbletea.Model` | `fyne.App` + `MainWindow` |
| `lipgloss.Style` | `fyne.Theme` + custom styles |
| `tea.Cmd` | `goroutine` + channels |
| `table.Model` | `widget.Table` + custom renderer |
| `viewport` | `container.Scroll` |
| `progress.Model` | `widget.ProgressBar` |
| `textinput.Model` | `widget.Entry` |
| `list.Model` | `widget.List` |
| Key bindings | `fyne.Shortcut` |
| Colors | `color.Color` + theme |

---

## 💡 Best Practices

### 1. Goroutine Safety
```go
// Always update UI from main goroutine
go func() {
	result := doHeavyWork()
	
	// Update UI
	fyne.CurrentApp().SendNotification(&fyne.Notification{
		Title: "Test Complete",
		Content: result.Summary,
	})
	
	// Refresh widgets
	myWidget.Refresh()
}()
```

### 2. Cancel Support
```go
ctx, cancel := context.WithCancel(context.Background())
defer cancel()

go func() {
	select {
	case <-ctx.Done():
		return
	case result := <-resultChan:
		handleResult(result)
	}
}()
```

### 3. Memory Management
```go
// Use bounded channels
resultChan := make(chan Result, 100)

// Close channels when done
defer close(resultChan)

// Use weak references for large data
type WeakRef struct {
	data *LargeData // Will be GC'd when no other refs
}
```

---

## 📚 Resources

- **Fyne Documentation:** https://docs.fyne.io/
- **Fyne Examples:** https://github.com/fyne-io/examples
- **Fyne Community:** https://fyne.io/community/
- **Go-Echarts:** https://go-echarts.github.io/go-echarts/
- **Material Design:** https://material.io/design

---

## 🎉 Next Steps

1. **Faz 1 başlat:** UI refactor & modüler yapı
2. **Migration script:** Mevcut `fyne_ui.go` → yeni yapı
3. **Custom widgets:** MetricCard, LineChart implement
4. **Integration:** Backend (`appsvc`) ile test et
5. **Iteration:** Her faz sonunda demo & feedback

**Sorular veya detay gerekiyorsa lütfen belirtin!** 🚀

