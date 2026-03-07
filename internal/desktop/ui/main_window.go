//go:build desktop

package ui

import (
	"fmt"
	"image/color"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	fyneDesktop "fyne.io/fyne/v2/driver/desktop"
	"fyne.io/fyne/v2/widget"

	"lazytest/internal/appsvc"
	"lazytest/internal/desktop/panels"
	"lazytest/internal/styles"
)

// EventAggregator is the normalized run-event surface required by main window.
type EventAggregator interface {
	Consume(ev any) appsvc.RunSnapshot
	Snapshot(runID string) appsvc.RunSnapshot
	Clear(runID string)
}

// MainWindow is the main application window.
type MainWindow struct {
	app       panels.DesktopApp
	agg       EventAggregator
	fyneApp   fyne.App
	window    fyne.Window
	state     *UIState
	nav       *Navigation
	liveLog   *LiveLogDock
	statusBar *StatusBar
	content   *fyne.Container

	panelMap     map[string]Panel
	currentPanel Panel

	activeUnsub func()
}

func NewMainWindow(desktopApp panels.DesktopApp, agg EventAggregator) *MainWindow {
	mw := &MainWindow{
		app:      desktopApp,
		agg:      agg,
		fyneApp:  app.NewWithID("com.lazytest.desktop"),
		state:    NewUIState(),
		panelMap: map[string]Panel{},
	}
	mw.fyneApp.Settings().SetTheme(styles.NewDesktopTheme())
	mw.window = mw.fyneApp.NewWindow("LazyTest - API Testing Suite")
	mw.window.Resize(fyne.NewSize(1460, 920))
	mw.window.CenterOnScreen()

	if ws, err := desktopApp.LoadWorkspace(); err == nil {
		mw.state.SetWorkspace(ws)
		if strings.TrimSpace(ws.SpecPath) != "" {
			if summary, err := desktopApp.LoadSpec(ws.SpecPath); err == nil {
				mw.state.SetSpecSummary(&summary)
				mw.state.SetEndpoints(desktopApp.ListEndpoints(appsvc.EndpointFilter{}))
			}
		}
	}

	mw.setupUI()
	mw.setupShortcuts()
	mw.window.SetCloseIntercept(func() {
		mw.cleanup()
		mw.fyneApp.Quit()
	})
	return mw
}

func (mw *MainWindow) setupUI() {
	mw.statusBar = NewStatusBar()
	mw.statusBar.SetStatus("Ready")

	mw.panelMap = map[string]Panel{
		"Dashboard":   panels.NewDashboardPanel(mw.state),
		"Workspace":   panels.NewWorkspacePanel(mw.app, mw.state, mw.window, mw.setStatus),
		"Explorer":    panels.NewExplorerPanel(mw.app, mw.state, mw.setStatus),
		"Smoke":       panels.NewSmokePanel(mw.app, mw.state, mw.setStatus, mw.onRunStarted),
		"Drift":       panels.NewDriftPanel(mw.app, mw.state, mw.setStatus, mw.onRunStarted),
		"Compare":     panels.NewComparePanel(mw.app, mw.state, mw.setStatus, mw.onRunStarted),
		"LoadTests":   panels.NewLoadTestPanel(mw.app, mw.state, mw.window, mw.setStatus, mw.onRunStarted),
		"LiveMetrics": panels.NewLiveMetricsPanel(mw.state, mw.setStatus),
		"Logs":        panels.NewLogsPanel(mw.state, mw.setStatus),
		"Reports":     panels.NewReportsPanel(mw.app, mw.window, mw.setStatus),
		"About":       panels.NewAboutPanel(),
	}

	first := mw.panelMap["Dashboard"]
	mw.currentPanel = first
	mw.content = container.NewStack(first.Container())
	mw.liveLog = NewLiveLogDock(mw.state, mw.setStatus)
	mw.nav = NewNavigation(mw.onNavigate)

	logDock := mw.liveLog.Container()
	logDock.Resize(fyne.NewSize(300, 250))
	logDockMin := canvas.NewRectangle(color.Transparent)
	logDockMin.SetMinSize(fyne.NewSize(300, 250))
	logDockObj := container.NewStack(logDockMin, container.NewPadded(logDock))

	center := container.NewBorder(
		mw.buildAbilityBar(),
		logDockObj, // bottom fixed live log
		nil,
		nil,
		mw.content,
	)

	split := container.NewHSplit(mw.nav.Container(), center)
	split.SetOffset(0.22) // left navigation full bar

	main := container.NewBorder(nil, mw.statusBar.Container(), nil, nil, split)
	mw.window.SetContent(main)
	first.OnShow()
}

func (mw *MainWindow) buildAbilityBar() fyne.CanvasObject {
	title := canvas.NewText("YETENEKLER", color.RGBA{R: 0x96, G: 0xBE, B: 0xF7, A: 0xFF})
	title.TextStyle = fyne.TextStyle{Bold: true, Monospace: true}
	title.TextSize = 11

	bg := canvas.NewRectangle(color.RGBA{R: 0x11, G: 0x1A, B: 0x27, A: 0xFF})
	bg.CornerRadius = 8

	buttons := make([]fyne.CanvasObject, 0, len(ViewNavOptions())+1)
	for _, option := range ViewNavOptions() {
		id := option.ID
		btn := widget.NewButton(option.Label, func() { mw.nav.SelectItem(id) })
		btn.Importance = widget.LowImportance
		buttons = append(buttons, btn)
	}
	cancelBtn := widget.NewButton("Cancel Active", func() {
		if mw.app.CancelActiveRun() {
			mw.setStatus("active run canceled")
			return
		}
		mw.setStatus("no active run")
	})
	cancelBtn.Importance = widget.DangerImportance
	buttons = append(buttons, cancelBtn)

	row := container.NewHBox(buttons...)
	scroll := container.NewHScroll(container.NewPadded(row))
	scroll.SetMinSize(fyne.NewSize(200, 56))
	content := container.NewVBox(title, scroll)
	return container.NewStack(bg, container.NewPadded(content))
}

func (mw *MainWindow) setupMenuBar() {
	fileMenu := fyne.NewMenu("File",
		fyne.NewMenuItem("Load Spec", func() { mw.nav.SelectItem("Workspace") }),
		fyne.NewMenuItemSeparator(),
		fyne.NewMenuItem("Quit", func() { mw.window.Close() }),
	)
	viewItems := make([]*fyne.MenuItem, 0, len(ViewNavOptions()))
	for _, option := range ViewNavOptions() {
		id := option.ID
		viewItems = append(viewItems, fyne.NewMenuItem(option.Label, func() { mw.nav.SelectItem(id) }))
	}
	viewMenu := fyne.NewMenu("View", viewItems...)
	helpMenu := fyne.NewMenu("Help", fyne.NewMenuItem("About", func() { mw.nav.SelectItem("About") }))
	mw.window.SetMainMenu(fyne.NewMainMenu(fileMenu, viewMenu, helpMenu))
}

func (mw *MainWindow) setupShortcuts() {
	canvas := mw.window.Canvas()
	canvas.AddShortcut(&fyneDesktop.CustomShortcut{KeyName: fyne.KeyO, Modifier: fyne.KeyModifierControl}, func(fyne.Shortcut) {
		mw.nav.SelectItem("Workspace")
	})
	canvas.AddShortcut(&fyneDesktop.CustomShortcut{KeyName: fyne.KeyE, Modifier: fyne.KeyModifierControl}, func(fyne.Shortcut) {
		mw.nav.SelectItem("Explorer")
	})
	canvas.AddShortcut(&fyneDesktop.CustomShortcut{KeyName: fyne.KeyR, Modifier: fyne.KeyModifierControl}, func(fyne.Shortcut) {
		mw.nav.SelectItem("Reports")
	})
	canvas.AddShortcut(&fyneDesktop.CustomShortcut{KeyName: fyne.KeyEscape}, func(fyne.Shortcut) {
		if mw.app.CancelActiveRun() {
			mw.setStatus("active run canceled")
		}
	})
}

func (mw *MainWindow) onNavigate(panelName string) {
	switch panelName {
	case "LoadSpec":
		mw.nav.SelectItem("Workspace")
		mw.setStatus("Open spec from Workspace panel")
		return
	case "Quit":
		mw.window.Close()
		return
	}

	next, ok := mw.panelMap[panelName]
	if !ok {
		mw.setStatus("Unknown panel: " + panelName)
		return
	}
	if mw.content == nil {
		return
	}
	if mw.currentPanel != nil {
		mw.currentPanel.OnHide()
	}
	mw.currentPanel = next
	mw.content.Objects = []fyne.CanvasObject{next.Container()}
	mw.content.Refresh()
	next.OnShow()
	mw.setStatus("Viewing: " + panelName)
}

func (mw *MainWindow) onRunStarted(runID, kind string) {
	mw.state.SetActiveRun(runID, kind)
	mw.app.TrackActiveRun(runID)
	if mw.activeUnsub != nil {
		mw.activeUnsub()
		mw.activeUnsub = nil
	}
	ch, unsub := mw.app.SubscribeRun(runID)
	mw.activeUnsub = unsub
	mw.setStatus(fmt.Sprintf("%s started: %s", kind, runID))

	go func() {
		for ev := range ch {
			snap := mw.agg.Consume(ev)
			if snap.RunType == "" {
				snap.RunType = kind
			}
			mw.state.SetRunSnapshot(snap)
			mw.statusBar.SetInfo(fmt.Sprintf("%s %s", snap.RunID, snap.Status))
		}
		final := mw.agg.Snapshot(runID)
		if final.Status == "completed" || final.Status == "failed" || final.Status == "canceled" {
			mw.state.ClearActiveRun()
		}
	}()
}

func (mw *MainWindow) setStatus(msg string) {
	if mw.statusBar != nil {
		mw.statusBar.SetStatus(msg)
	}
}

func (mw *MainWindow) cleanup() {
	if mw.activeUnsub != nil {
		mw.activeUnsub()
	}
	if mw.statusBar != nil {
		mw.statusBar.Stop()
	}
	for _, p := range mw.panelMap {
		p.Dispose()
	}
}

func (mw *MainWindow) Show() {
	mw.window.ShowAndRun()
}
