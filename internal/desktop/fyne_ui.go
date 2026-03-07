//go:build desktop

package desktop

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"lazytest/internal/appsvc"
	"lazytest/internal/core"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
)

var navItems = []string{
	"Workspace",
	"Explorer",
	"Smoke",
	"Drift",
	"Compare",
	"LoadTests (Phase 3)",
	"Reports",
	"Settings (Phase 4)",
}

const (
	rightWorkspace = iota
	rightExplorer
	rightSmoke
	rightDrift
	rightCompare
	rightReports
	rightPlaceholder
)

type fyneUI struct {
	app *App
	win fyne.Window

	workspace appsvc.Workspace
	summary   *appsvc.SpecSummary

	endpoints []appsvc.EndpointDTO
	selected  *appsvc.EndpointDTO

	navIndex int

	statusLabel     *widget.Label
	currentRunLabel *widget.Label
	summaryLabel    *widget.Label
	errorLabel      *widget.Label

	specPathEntry *widget.Entry
	envPathEntry  *widget.Entry
	authPathEntry *widget.Entry
	envNameEntry  *widget.Entry
	authProfEntry *widget.Entry
	baseURLEntry  *widget.Entry

	filterEntry *widget.Entry

	methodEntry   *widget.Entry
	urlEntry      *widget.Entry
	headersEntry  *widget.Entry
	bodyEntry     *widget.Entry
	respMetaLabel *widget.Label
	respHeaders   *widget.Entry
	respBody      *widget.Entry

	smokeExportDirEntry *widget.Entry
	smokeProgressLabel  *widget.Label
	smokeProgressBar    *widget.ProgressBar
	smokeLiveEntry      *widget.Entry
	smokeResultEntry    *widget.Entry

	driftExportDirEntry *widget.Entry
	driftProgressLabel  *widget.Label
	driftProgressBar    *widget.ProgressBar
	driftFindingsEntry  *widget.Entry
	driftRawEntry       *widget.Entry

	compareEnvAEntry     *widget.Entry
	compareEnvBEntry     *widget.Entry
	compareOnlyDiff      *widget.Check
	compareProgressLabel *widget.Label
	compareProgressBar   *widget.ProgressBar
	compareDiffEntry     *widget.Entry
	compareRawEntry      *widget.Entry

	reportsEntry *widget.Entry

	explorerSelectedLabel *widget.Label
	smokeSelectedLabel    *widget.Label
	driftSelectedLabel    *widget.Label
	compareSelectedLabel  *widget.Label

	endpointList  *widget.List
	endpointPanel fyne.CanvasObject
	middleStack   *fyne.Container
	rightStack    *fyne.Container

	workspaceView   fyne.CanvasObject
	explorerView    fyne.CanvasObject
	smokeView       fyne.CanvasObject
	driftView       fyne.CanvasObject
	compareView     fyne.CanvasObject
	reportsView     fyne.CanvasObject
	placeholderView fyne.CanvasObject

	activeRunID   string
	activeRunKind string
	runUnsub      func()

	lastSmokeResults  []core.SmokeResult
	lastDriftResult   *core.DriftResult
	lastCompareResult *core.ABCompareResult
}

func runFyneUI(appSvc *App) error {
	fa := app.NewWithID("lazytest-desktop")
	w := fa.NewWindow("lazytest-desktop (Fyne)")
	w.Resize(fyne.NewSize(1460, 920))
	w.SetMaster()

	ui := newFyneUI(appSvc, w)
	ui.initState()
	w.SetContent(ui.build())
	ui.refreshWorkspaceWidgets()
	ui.tryAutoLoadSpec()
	ui.refreshReports()

	w.ShowAndRun()
	return nil
}

func newFyneUI(appSvc *App, win fyne.Window) *fyneUI {
	ui := &fyneUI{app: appSvc, win: win}
	ui.statusLabel = widget.NewLabel("Ready")
	ui.currentRunLabel = widget.NewLabel("No active run")
	ui.summaryLabel = widget.NewLabel("No spec loaded")
	ui.errorLabel = widget.NewLabel("")
	ui.errorLabel.Hide()

	ui.specPathEntry = widget.NewEntry()
	ui.envPathEntry = widget.NewEntry()
	ui.authPathEntry = widget.NewEntry()
	ui.envNameEntry = widget.NewEntry()
	ui.authProfEntry = widget.NewEntry()
	ui.baseURLEntry = widget.NewEntry()

	ui.filterEntry = widget.NewEntry()
	ui.filterEntry.SetPlaceHolder("Search endpoint path / summary / operationId")

	ui.methodEntry = widget.NewEntry()
	ui.urlEntry = widget.NewEntry()
	ui.headersEntry = widget.NewMultiLineEntry()
	ui.headersEntry.SetPlaceHolder("Header: Value")
	ui.bodyEntry = widget.NewMultiLineEntry()
	ui.bodyEntry.SetPlaceHolder("Request body")
	ui.respMetaLabel = widget.NewLabel("Response: not sent")
	ui.respHeaders = widget.NewMultiLineEntry()
	ui.respHeaders.Disable()
	ui.respBody = widget.NewMultiLineEntry()
	ui.respBody.Disable()

	ui.smokeExportDirEntry = widget.NewEntry()
	ui.smokeExportDirEntry.SetText("./out")
	ui.smokeProgressLabel = widget.NewLabel("Idle")
	ui.smokeProgressBar = widget.NewProgressBar()
	ui.smokeLiveEntry = widget.NewMultiLineEntry()
	ui.smokeLiveEntry.Disable()
	ui.smokeResultEntry = widget.NewMultiLineEntry()
	ui.smokeResultEntry.Disable()

	ui.driftExportDirEntry = widget.NewEntry()
	ui.driftExportDirEntry.SetText("./out")
	ui.driftProgressLabel = widget.NewLabel("Idle")
	ui.driftProgressBar = widget.NewProgressBar()
	ui.driftFindingsEntry = widget.NewMultiLineEntry()
	ui.driftFindingsEntry.Disable()
	ui.driftRawEntry = widget.NewMultiLineEntry()
	ui.driftRawEntry.Disable()

	ui.compareEnvAEntry = widget.NewEntry()
	ui.compareEnvAEntry.SetText("dev")
	ui.compareEnvBEntry = widget.NewEntry()
	ui.compareEnvBEntry.SetText("test")
	ui.compareProgressLabel = widget.NewLabel("Idle")
	ui.compareProgressBar = widget.NewProgressBar()
	ui.compareDiffEntry = widget.NewMultiLineEntry()
	ui.compareDiffEntry.Disable()
	ui.compareRawEntry = widget.NewMultiLineEntry()
	ui.compareRawEntry.Disable()
	ui.compareOnlyDiff = widget.NewCheck("Only differences", func(_ bool) {
		ui.renderLastCompareResult()
	})
	ui.compareOnlyDiff.SetChecked(true)

	ui.reportsEntry = widget.NewMultiLineEntry()
	ui.reportsEntry.Disable()

	ui.endpointList = widget.NewList(
		func() int { return len(ui.endpoints) },
		func() fyne.CanvasObject { return widget.NewLabel("endpoint") },
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			if id < 0 || id >= len(ui.endpoints) {
				obj.(*widget.Label).SetText("")
				return
			}
			ep := ui.endpoints[id]
			text := fmt.Sprintf("%s %s", strings.ToUpper(ep.Method), ep.Path)
			if ep.Summary != "" {
				text += "  |  " + ep.Summary
			}
			obj.(*widget.Label).SetText(text)
		},
	)
	ui.endpointList.OnSelected = func(id widget.ListItemID) { ui.onEndpointSelected(id) }

	return ui
}

func (ui *fyneUI) initState() {
	ui.workspace = appsvc.Workspace{Version: 1, EnvName: "dev", AuthProfile: "default-jwt"}
	if ws, err := ui.app.LoadWorkspace(); err == nil {
		ui.workspace = ws
		if ui.workspace.Version == 0 {
			ui.workspace.Version = 1
		}
		if ui.workspace.EnvName == "" {
			ui.workspace.EnvName = "dev"
		}
		if ui.workspace.EnvName != "" {
			ui.compareEnvAEntry.SetText(ui.workspace.EnvName)
		}
	} else {
		ui.setStatus("Workspace file not found yet; using defaults")
	}
}

func (ui *fyneUI) build() fyne.CanvasObject {
	leftNav := ui.buildLeftNav()
	ui.endpointPanel = ui.buildEndpointPanel()
	placeholderMiddle := container.NewCenter(widget.NewLabel("This screen is planned for next phase."))
	ui.middleStack = container.NewStack(ui.endpointPanel, placeholderMiddle)

	ui.workspaceView = ui.buildWorkspaceView()
	ui.explorerView = ui.buildExplorerView()
	ui.smokeView = ui.buildSmokeView()
	ui.driftView = ui.buildDriftView()
	ui.compareView = ui.buildCompareView()
	ui.reportsView = ui.buildReportsView()
	ui.placeholderView = container.NewCenter(widget.NewLabel("Screen will be implemented in next phase."))
	ui.rightStack = container.NewStack(
		ui.workspaceView,
		ui.explorerView,
		ui.smokeView,
		ui.driftView,
		ui.compareView,
		ui.reportsView,
		ui.placeholderView,
	)
	ui.showWorkspace()

	centerSplit := container.NewHSplit(ui.middleStack, ui.rightStack)
	centerSplit.Offset = 0.42
	rootSplit := container.NewHSplit(leftNav, centerSplit)
	rootSplit.Offset = 0.16

	statusBar := container.NewBorder(nil, nil,
		widget.NewLabel("lazytest-desktop / Fyne / Phase 2"),
		container.NewHBox(
			widget.NewButtonWithIcon("Refresh Endpoints", theme.ViewRefreshIcon(), func() { ui.reloadEndpoints() }),
			widget.NewButtonWithIcon("Cancel Run", theme.CancelIcon(), ui.cancelActiveRun),
		),
		container.NewVBox(ui.currentRunLabel, ui.statusLabel),
	)

	return container.NewBorder(nil, statusBar, nil, nil, rootSplit)
}

func (ui *fyneUI) buildLeftNav() fyne.CanvasObject {
	list := widget.NewList(
		func() int { return len(navItems) },
		func() fyne.CanvasObject { return widget.NewLabel("nav") },
		func(id widget.ListItemID, obj fyne.CanvasObject) { obj.(*widget.Label).SetText(navItems[id]) },
	)
	list.OnSelected = func(id widget.ListItemID) {
		ui.navIndex = id
		switch id {
		case 0:
			ui.showWorkspace()
		case 1:
			ui.showExplorer()
		case 2:
			ui.showSmoke()
		case 3:
			ui.showDrift()
		case 4:
			ui.showCompare()
		case 6:
			ui.showReports()
		default:
			ui.showPlaceholder()
		}
	}
	list.Select(0)

	title := widget.NewLabel("Navigation")
	return container.NewBorder(title, nil, nil, nil, list)
}

func (ui *fyneUI) buildEndpointPanel() fyne.CanvasObject {
	ui.filterEntry.OnSubmitted = func(_ string) { ui.reloadEndpoints() }
	toolbar := container.NewBorder(nil, nil, nil,
		widget.NewButtonWithIcon("Search", theme.SearchIcon(), func() { ui.reloadEndpoints() }),
		ui.filterEntry,
	)

	openDetail := widget.NewButton("Build Example For Selected", func() {
		ui.showExplorer()
		ui.buildExampleRequest()
	})

	panel := container.NewBorder(
		container.NewVBox(
			widget.NewLabel("Endpoints"),
			ui.summaryLabel,
			toolbar,
			openDetail,
		),
		nil, nil, nil,
		ui.endpointList,
	)
	return panel
}

func (ui *fyneUI) buildWorkspaceView() fyne.CanvasObject {
	pickBtn := func(label string, entry *widget.Entry) *widget.Button {
		return widget.NewButtonWithIcon(label, theme.FolderOpenIcon(), func() { ui.pickFile(entry) })
	}

	form := widget.NewForm(
		widget.NewFormItem("OpenAPI", container.NewBorder(nil, nil, nil, pickBtn("Pick", ui.specPathEntry), ui.specPathEntry)),
		widget.NewFormItem("env.yaml", container.NewBorder(nil, nil, nil, pickBtn("Pick", ui.envPathEntry), ui.envPathEntry)),
		widget.NewFormItem("auth.yaml", container.NewBorder(nil, nil, nil, pickBtn("Pick", ui.authPathEntry), ui.authPathEntry)),
		widget.NewFormItem("Environment", ui.envNameEntry),
		widget.NewFormItem("Auth Profile", ui.authProfEntry),
		widget.NewFormItem("Base URL Override", ui.baseURLEntry),
	)

	actions := container.NewHBox(
		widget.NewButtonWithIcon("Save Workspace", theme.DocumentSaveIcon(), ui.saveWorkspace),
		widget.NewButtonWithIcon("Load Workspace", theme.FolderOpenIcon(), ui.loadWorkspaceFromDisk),
		widget.NewButtonWithIcon("Load Spec", theme.ViewRefreshIcon(), ui.loadSpecAndEndpoints),
	)

	errWrap := container.NewVBox(ui.errorLabel)
	return container.NewBorder(
		container.NewVBox(widget.NewLabel("Workspace / Project"), actions),
		nil, nil, nil,
		container.NewVScroll(container.NewVBox(form, errWrap)),
	)
}

func (ui *fyneUI) buildExplorerView() fyne.CanvasObject {
	ui.bodyEntry.Wrapping = fyne.TextWrapWord
	ui.respBody.Wrapping = fyne.TextWrapWord
	ui.respHeaders.Wrapping = fyne.TextWrapWord

	ui.explorerSelectedLabel = widget.NewLabel("No endpoint selected")

	headersCard := container.NewBorder(widget.NewLabel("Headers (one per line: Key: Value)"), nil, nil, nil, ui.headersEntry)
	requestCard := container.NewBorder(
		container.NewVBox(
			widget.NewLabel("Request Builder"),
			ui.explorerSelectedLabel,
			container.NewHBox(
				widget.NewButtonWithIcon("Build Example", theme.DocumentCreateIcon(), ui.buildExampleRequest),
				widget.NewButtonWithIcon("Send", theme.MailSendIcon(), ui.sendRequest),
			),
		),
		nil, nil, nil,
		container.NewVScroll(container.NewVBox(
			widget.NewForm(
				widget.NewFormItem("Method", ui.methodEntry),
				widget.NewFormItem("URL", ui.urlEntry),
			),
			headersCard,
			widget.NewLabel("Body"),
			ui.bodyEntry,
		)),
	)

	responsePane := container.NewBorder(
		container.NewVBox(widget.NewLabel("Response Viewer"), ui.respMetaLabel),
		nil, nil, nil,
		container.NewVScroll(container.NewVBox(
			widget.NewLabel("Headers"),
			ui.respHeaders,
			widget.NewLabel("Body"),
			ui.respBody,
		)),
	)

	split := container.NewVSplit(requestCard, responsePane)
	split.Offset = 0.48
	ui.refreshSelectedLabels()
	return split
}

func (ui *fyneUI) buildSmokeView() fyne.CanvasObject {
	ui.smokeSelectedLabel = widget.NewLabel("No endpoint selected")
	ui.smokeLiveEntry.Wrapping = fyne.TextWrapWord
	ui.smokeResultEntry.Wrapping = fyne.TextWrapWord

	header := container.NewVBox(
		widget.NewLabel("Smoke"),
		ui.smokeSelectedLabel,
		widget.NewForm(widget.NewFormItem("Export Dir", ui.smokeExportDirEntry)),
		container.NewHBox(
			widget.NewButton("Run Selected", func() { ui.runSmoke(false) }),
			widget.NewButton("Run All", func() { ui.runSmoke(true) }),
			widget.NewButton("Cancel", ui.cancelActiveRun),
		),
		ui.smokeProgressLabel,
		ui.smokeProgressBar,
	)

	content := container.NewVSplit(
		container.NewVScroll(container.NewVBox(widget.NewLabel("Live Progress"), ui.smokeLiveEntry)),
		container.NewVScroll(container.NewVBox(widget.NewLabel("Result"), ui.smokeResultEntry)),
	)
	content.Offset = 0.45
	return container.NewBorder(header, nil, nil, nil, content)
}

func (ui *fyneUI) buildDriftView() fyne.CanvasObject {
	ui.driftSelectedLabel = widget.NewLabel("No endpoint selected")
	ui.driftFindingsEntry.Wrapping = fyne.TextWrapWord
	ui.driftRawEntry.Wrapping = fyne.TextWrapWord

	header := container.NewVBox(
		widget.NewLabel("Drift"),
		ui.driftSelectedLabel,
		widget.NewForm(widget.NewFormItem("Export Dir", ui.driftExportDirEntry)),
		container.NewHBox(
			widget.NewButton("Run Drift (Selected)", ui.runDrift),
			widget.NewButton("Cancel", ui.cancelActiveRun),
		),
		ui.driftProgressLabel,
		ui.driftProgressBar,
	)

	lower := container.NewVSplit(
		container.NewVScroll(container.NewVBox(widget.NewLabel("Findings"), ui.driftFindingsEntry)),
		container.NewVScroll(container.NewVBox(widget.NewLabel("Raw Result"), ui.driftRawEntry)),
	)
	lower.Offset = 0.42
	return container.NewBorder(header, nil, nil, nil, lower)
}

func (ui *fyneUI) buildCompareView() fyne.CanvasObject {
	ui.compareSelectedLabel = widget.NewLabel("No endpoint selected")
	ui.compareDiffEntry.Wrapping = fyne.TextWrapWord
	ui.compareRawEntry.Wrapping = fyne.TextWrapWord

	envForm := widget.NewForm(
		widget.NewFormItem("Env A", ui.compareEnvAEntry),
		widget.NewFormItem("Env B", ui.compareEnvBEntry),
	)

	header := container.NewVBox(
		widget.NewLabel("A/B Compare"),
		ui.compareSelectedLabel,
		envForm,
		ui.compareOnlyDiff,
		container.NewHBox(
			widget.NewButton("Run Compare", ui.runCompare),
			widget.NewButton("Cancel", ui.cancelActiveRun),
		),
		ui.compareProgressLabel,
		ui.compareProgressBar,
	)

	lower := container.NewVSplit(
		container.NewVScroll(container.NewVBox(widget.NewLabel("Diff Summary"), ui.compareDiffEntry)),
		container.NewVScroll(container.NewVBox(widget.NewLabel("Raw Result"), ui.compareRawEntry)),
	)
	lower.Offset = 0.45
	return container.NewBorder(header, nil, nil, nil, lower)
}

func (ui *fyneUI) buildReportsView() fyne.CanvasObject {
	ui.reportsEntry.Wrapping = fyne.TextWrapWord
	return container.NewBorder(
		container.NewHBox(
			widget.NewLabel("Reports / Run History"),
			widget.NewButtonWithIcon("Refresh", theme.ViewRefreshIcon(), ui.refreshReports),
		),
		nil, nil, nil,
		container.NewVScroll(ui.reportsEntry),
	)
}

func (ui *fyneUI) showWorkspace()   { ui.showRight(rightWorkspace, true) }
func (ui *fyneUI) showExplorer()    { ui.showRight(rightExplorer, true) }
func (ui *fyneUI) showSmoke()       { ui.showRight(rightSmoke, true) }
func (ui *fyneUI) showDrift()       { ui.showRight(rightDrift, true) }
func (ui *fyneUI) showCompare()     { ui.showRight(rightCompare, true) }
func (ui *fyneUI) showReports()     { ui.showRight(rightReports, true) }
func (ui *fyneUI) showPlaceholder() { ui.showRight(rightPlaceholder, false) }

func (ui *fyneUI) showRight(rightIndex int, showEndpoints bool) {
	if ui.rightStack != nil {
		for i, obj := range ui.rightStack.Objects {
			if i == rightIndex {
				obj.Show()
			} else {
				obj.Hide()
			}
		}
	}
	if ui.middleStack == nil || len(ui.middleStack.Objects) < 2 {
		return
	}
	if showEndpoints {
		ui.middleStack.Objects[0].Show()
		ui.middleStack.Objects[1].Hide()
	} else {
		ui.middleStack.Objects[0].Hide()
		ui.middleStack.Objects[1].Show()
	}
}

func (ui *fyneUI) refreshWorkspaceWidgets() {
	ui.specPathEntry.SetText(ui.workspace.SpecPath)
	ui.envPathEntry.SetText(ui.workspace.EnvPath)
	ui.authPathEntry.SetText(ui.workspace.AuthPath)
	if ui.workspace.EnvName == "" {
		ui.workspace.EnvName = "dev"
	}
	ui.envNameEntry.SetText(ui.workspace.EnvName)
	ui.authProfEntry.SetText(ui.workspace.AuthProfile)
	ui.baseURLEntry.SetText(ui.workspace.BaseURL)
}

func (ui *fyneUI) collectWorkspaceFromWidgets() appsvc.Workspace {
	ws := ui.workspace
	if ws.Version == 0 {
		ws.Version = 1
	}
	ws.SpecPath = strings.TrimSpace(ui.specPathEntry.Text)
	ws.EnvPath = strings.TrimSpace(ui.envPathEntry.Text)
	ws.AuthPath = strings.TrimSpace(ui.authPathEntry.Text)
	ws.EnvName = strings.TrimSpace(ui.envNameEntry.Text)
	ws.AuthProfile = strings.TrimSpace(ui.authProfEntry.Text)
	ws.BaseURL = strings.TrimSpace(ui.baseURLEntry.Text)
	if ws.EnvName == "" {
		ws.EnvName = "dev"
	}
	return ws
}

func (ui *fyneUI) saveWorkspace() {
	ui.saveWorkspaceInternal(true)
}

func (ui *fyneUI) saveWorkspaceInternal(showDialogOnErr bool) bool {
	ws := ui.collectWorkspaceFromWidgets()
	if _, err := ui.app.SaveWorkspace(ws); err != nil {
		ui.setError(err, showDialogOnErr)
		return false
	}
	ui.workspace = ws
	ui.setError(nil, false)
	ui.setStatus("Workspace saved")
	return true
}

func (ui *fyneUI) loadWorkspaceFromDisk() {
	ws, err := ui.app.LoadWorkspace()
	if err != nil {
		ui.setError(err, true)
		return
	}
	ui.workspace = ws
	ui.refreshWorkspaceWidgets()
	ui.setError(nil, false)
	ui.setStatus("Workspace loaded")
}

func (ui *fyneUI) tryAutoLoadSpec() {
	if strings.TrimSpace(ui.workspace.SpecPath) == "" {
		return
	}
	ui.loadSpecAndEndpoints()
}

func (ui *fyneUI) loadSpecAndEndpoints() {
	if !ui.saveWorkspaceInternal(true) {
		return
	}
	ws := ui.collectWorkspaceFromWidgets()
	if ws.SpecPath == "" {
		ui.setError(fmt.Errorf("openapi path is required"), true)
		return
	}
	sum, err := ui.app.LoadSpec(ws.SpecPath)
	if err != nil {
		ui.setError(err, true)
		return
	}
	ui.summary = &sum
	ui.updateSummaryLabel()
	ui.reloadEndpoints()
	ui.showExplorer()
	ui.setStatus(fmt.Sprintf("Loaded spec: %d endpoints", sum.EndpointCount))
}

func (ui *fyneUI) reloadEndpoints() {
	query := strings.TrimSpace(ui.filterEntry.Text)
	ui.endpoints = ui.app.ListEndpoints(appsvc.EndpointFilter{Query: query})
	ui.endpointList.Refresh()
	if len(ui.endpoints) == 0 {
		ui.selected = nil
		ui.refreshSelectedLabels()
		ui.setStatus("No endpoints matched filter")
		return
	}
	if ui.selected == nil {
		ui.endpointList.Select(0)
		return
	}
	for i := range ui.endpoints {
		if ui.endpoints[i].ID == ui.selected.ID {
			ui.endpointList.Select(i)
			return
		}
	}
	ui.endpointList.Select(0)
}

func (ui *fyneUI) updateSummaryLabel() {
	if ui.summary == nil {
		ui.summaryLabel.SetText("No spec loaded")
		return
	}
	sum := ui.summary
	ui.summaryLabel.SetText(fmt.Sprintf("Spec: %s v%s  •  %d endpoints  •  %d tags", sum.Title, sum.Version, sum.EndpointCount, sum.TagCount))
}

func (ui *fyneUI) onEndpointSelected(id widget.ListItemID) {
	if id < 0 || id >= len(ui.endpoints) {
		return
	}
	ep := ui.endpoints[id]
	ui.selected = &ep
	ui.refreshSelectedLabels()
	ui.setStatus("Selected endpoint: " + ep.Method + " " + ep.Path)
	ui.setError(nil, false)
}

func (ui *fyneUI) refreshSelectedLabels() {
	text := "No endpoint selected"
	if ui.selected != nil {
		text = fmt.Sprintf("%s %s (%s)", strings.ToUpper(ui.selected.Method), ui.selected.Path, ui.selected.ID)
	}
	for _, lbl := range []*widget.Label{ui.explorerSelectedLabel, ui.smokeSelectedLabel, ui.driftSelectedLabel, ui.compareSelectedLabel} {
		if lbl != nil {
			lbl.SetText(text)
		}
	}
}

func (ui *fyneUI) buildExampleRequest() {
	if ui.selected == nil {
		ui.setError(fmt.Errorf("select an endpoint first"), true)
		return
	}
	_ = ui.saveWorkspaceInternal(false)
	ws := ui.collectWorkspaceFromWidgets()
	req, err := ui.app.BuildExampleRequest(ui.selected.ID, ws.EnvName, ws.AuthProfile, map[string]string{"baseURL": ws.BaseURL})
	if err != nil {
		ui.setError(err, true)
		return
	}
	ui.methodEntry.SetText(req.Method)
	ui.urlEntry.SetText(req.URL)
	ui.headersEntry.SetText(formatHeaderMap(req.Headers))
	ui.bodyEntry.SetText(req.Body)
	ui.setError(nil, false)
	ui.setStatus("Example request built")
}

func (ui *fyneUI) sendRequest() {
	req := appsvc.RequestDTO{
		Method:    strings.TrimSpace(ui.methodEntry.Text),
		URL:       strings.TrimSpace(ui.urlEntry.Text),
		Headers:   parseHeaderMap(ui.headersEntry.Text),
		Body:      ui.bodyEntry.Text,
		TimeoutMS: 15000,
	}
	if req.Method == "" || req.URL == "" {
		ui.setError(fmt.Errorf("method and URL are required"), true)
		return
	}
	res, err := ui.app.SendRequest(req)
	if err != nil && res.Error == "" {
		ui.setError(err, true)
	} else {
		ui.setError(nil, false)
	}
	ui.respMetaLabel.SetText(fmt.Sprintf("Response: status=%d latency=%dms", res.StatusCode, res.LatencyMS))
	ui.respHeaders.SetText(formatResponseHeaders(res.Headers))
	ui.respBody.SetText(prettyJSONOrText(res.Body))
	ui.setStatus("Request sent")
}

func (ui *fyneUI) runSmoke(runAll bool) {
	if !runAll && ui.selected == nil {
		ui.setError(fmt.Errorf("select an endpoint for selected smoke run"), true)
		return
	}
	if !ui.saveWorkspaceInternal(false) {
		return
	}
	cfg := appsvc.SmokeStartConfig{
		RunAll:    runAll,
		Workers:   4,
		RateLimit: 10,
		TimeoutMS: 5000,
		ExportDir: strings.TrimSpace(ui.smokeExportDirEntry.Text),
	}
	if !runAll && ui.selected != nil {
		cfg.EndpointIDs = []string{ui.selected.ID}
	}
	ui.smokeProgressBar.SetValue(0)
	ui.smokeProgressLabel.SetText("Starting smoke run...")
	ui.smokeLiveEntry.SetText("")
	ui.smokeResultEntry.SetText("")
	ui.lastSmokeResults = nil
	runID, err := ui.app.StartSmoke(cfg)
	if err != nil {
		ui.setError(err, true)
		return
	}
	ui.attachRun(runID, "smoke")
}

func (ui *fyneUI) runDrift() {
	if ui.selected == nil {
		ui.setError(fmt.Errorf("select an endpoint for drift"), true)
		return
	}
	if !ui.saveWorkspaceInternal(false) {
		return
	}
	cfg := appsvc.DriftStartConfig{
		EndpointID: ui.selected.ID,
		TimeoutMS:  5000,
		ExportDir:  strings.TrimSpace(ui.driftExportDirEntry.Text),
	}
	ui.driftProgressBar.SetValue(0)
	ui.driftProgressLabel.SetText("Starting drift run...")
	ui.driftFindingsEntry.SetText("")
	ui.driftRawEntry.SetText("")
	ui.lastDriftResult = nil
	runID, err := ui.app.StartDrift(cfg)
	if err != nil {
		ui.setError(err, true)
		return
	}
	ui.attachRun(runID, "drift")
}

func (ui *fyneUI) runCompare() {
	if ui.selected == nil {
		ui.setError(fmt.Errorf("select an endpoint for compare"), true)
		return
	}
	if !ui.saveWorkspaceInternal(false) {
		return
	}
	cfg := appsvc.CompareStartConfig{
		EndpointID: ui.selected.ID,
		EnvA:       strings.TrimSpace(ui.compareEnvAEntry.Text),
		EnvB:       strings.TrimSpace(ui.compareEnvBEntry.Text),
		OnlyDiff:   ui.compareOnlyDiff.Checked,
		TimeoutMS:  5000,
	}
	if cfg.EnvA == "" || cfg.EnvB == "" {
		ui.setError(fmt.Errorf("envA and envB are required"), true)
		return
	}
	ui.compareProgressBar.SetValue(0)
	ui.compareProgressLabel.SetText("Starting compare run...")
	ui.compareDiffEntry.SetText("")
	ui.compareRawEntry.SetText("")
	ui.lastCompareResult = nil
	runID, err := ui.app.StartCompare(cfg)
	if err != nil {
		ui.setError(err, true)
		return
	}
	ui.attachRun(runID, "compare")
}

func (ui *fyneUI) cancelActiveRun() {
	if ui.activeRunID == "" {
		ui.setStatus("No active run to cancel")
		return
	}
	if !ui.app.CancelActiveRun() {
		_ = ui.app.CancelRun(ui.activeRunID)
	}
	ui.setStatus("Cancel requested for " + ui.activeRunID)
}

func (ui *fyneUI) attachRun(runID, kind string) {
	if ui.runUnsub != nil {
		ui.runUnsub()
		ui.runUnsub = nil
	}
	ui.activeRunID = runID
	ui.activeRunKind = kind
	ui.currentRunLabel.SetText(fmt.Sprintf("Active run: %s (%s)", runID, kind))
	ui.app.TrackActiveRun(runID)
	ch, unsub := ui.app.SubscribeRun(runID)
	ui.runUnsub = unsub
	ui.setError(nil, false)
	ui.setStatus("Run started: " + runID)
	go ui.consumeRunEvents(runID, kind, ch)
}

func (ui *fyneUI) consumeRunEvents(runID, kind string, ch <-chan any) {
	for ev := range ch {
		switch e := ev.(type) {
		case appsvc.RunProgressEvent:
			ui.applyProgress(e)
		case appsvc.RunMetricsEvent:
			ui.applyMetrics(e)
		case appsvc.RunLogEvent:
			ui.applyLog(e)
		case appsvc.RunDoneEvent:
			ui.applyDone(runID, kind, e)
		}
	}
}

func (ui *fyneUI) applyProgress(e appsvc.RunProgressEvent) {
	frac := 0.0
	if e.Total > 0 {
		frac = float64(e.Done) / float64(e.Total)
	}
	line := fmt.Sprintf("[%s] %d/%d ok=%d err=%d current=%s", e.Phase, e.Done, e.Total, e.OKCount, e.ErrCount, e.CurrentItem)
	ui.currentRunLabel.SetText(fmt.Sprintf("Active run: %s (%s)", e.RunID, e.Phase))
	ui.setStatus(line)

	switch e.Phase {
	case "smoke":
		ui.smokeProgressBar.SetValue(frac)
		ui.smokeProgressLabel.SetText(line)
		appendEntryLine(ui.smokeLiveEntry, line, 8000)
	case "drift":
		ui.driftProgressBar.SetValue(frac)
		ui.driftProgressLabel.SetText(line)
	case "compare":
		ui.compareProgressBar.SetValue(frac)
		ui.compareProgressLabel.SetText(line)
	case "tcp":
		// Phase 3 UI
	}
}

func (ui *fyneUI) applyMetrics(e appsvc.RunMetricsEvent) {
	line := fmt.Sprintf("metrics p95=%dms rps=%.2f errRate=%.2f%%", e.Snapshot.P95, e.Snapshot.RPS, e.Snapshot.ErrorRate)
	ui.setStatus(line)
}

func (ui *fyneUI) applyLog(e appsvc.RunLogEvent) {
	line := fmt.Sprintf("[%s] %s", strings.ToUpper(e.Level), e.Msg)
	if ui.activeRunKind == "smoke" {
		appendEntryLine(ui.smokeLiveEntry, line, 8000)
	}
}

func (ui *fyneUI) applyDone(runID, kind string, e appsvc.RunDoneEvent) {
	ui.currentRunLabel.SetText(fmt.Sprintf("Last run: %s (%s)", e.RunID, e.Status))
	ui.setStatus(fmt.Sprintf("Run done: %s %s", e.RunID, e.Status))

	dto, err := ui.app.GetRunResult(runID)
	if err != nil {
		ui.setError(err, false)
	} else {
		ui.renderRunResult(kind, dto)
	}
	ui.refreshReports()

	if ui.activeRunID == runID {
		ui.activeRunID = ""
		ui.activeRunKind = ""
	}
	if ui.runUnsub != nil {
		ui.runUnsub()
		ui.runUnsub = nil
	}
}

func (ui *fyneUI) renderRunResult(kind string, dto appsvc.ResultDTO) {
	raw := prettyAny(dto)
	switch kind {
	case "smoke":
		ui.smokeProgressBar.SetValue(1)
		ui.smokeProgressLabel.SetText(fmt.Sprintf("Smoke %s", dto.Status))
		if arr, ok := dto.Data.([]core.SmokeResult); ok {
			ui.lastSmokeResults = append([]core.SmokeResult(nil), arr...)
			okCount := 0
			for _, r := range arr {
				if r.OK {
					okCount++
				}
			}
			appendEntryLine(ui.smokeLiveEntry, fmt.Sprintf("Done: total=%d ok=%d failed=%d", len(arr), okCount, len(arr)-okCount), 8000)
		}
		ui.smokeResultEntry.SetText(raw)
	case "drift":
		ui.driftProgressBar.SetValue(1)
		ui.driftProgressLabel.SetText(fmt.Sprintf("Drift %s", dto.Status))
		if dr, ok := dto.Data.(core.DriftResult); ok {
			ui.lastDriftResult = &dr
			ui.driftFindingsEntry.SetText(formatDriftFindings(dr))
		} else {
			ui.driftFindingsEntry.SetText("")
		}
		ui.driftRawEntry.SetText(raw)
	case "compare":
		ui.compareProgressBar.SetValue(1)
		ui.compareProgressLabel.SetText(fmt.Sprintf("Compare %s", dto.Status))
		if cmp, ok := dto.Data.(core.ABCompareResult); ok {
			ui.lastCompareResult = &cmp
		}
		ui.renderLastCompareResult()
		ui.compareRawEntry.SetText(raw)
	}
}

func (ui *fyneUI) renderLastCompareResult() {
	if ui.compareDiffEntry == nil {
		return
	}
	if ui.lastCompareResult == nil {
		ui.compareDiffEntry.SetText("")
		return
	}
	cmp := *ui.lastCompareResult
	lines := []string{
		fmt.Sprintf("%s %s", strings.ToUpper(cmp.Method), cmp.Path),
		fmt.Sprintf("Status: A=%d B=%d match=%v", cmp.StatusA, cmp.StatusB, cmp.StatusMatch),
	}
	if cmp.ErrA != "" {
		lines = append(lines, "ErrA: "+cmp.ErrA)
	}
	if cmp.ErrB != "" {
		lines = append(lines, "ErrB: "+cmp.ErrB)
	}
	if len(cmp.HeadersDiff) > 0 {
		lines = append(lines, "", "HeadersDiff:")
		for _, d := range cmp.HeadersDiff {
			lines = append(lines, "- "+d)
		}
	}
	if len(cmp.BodyStructureDiff) > 0 {
		lines = append(lines, "", "BodyStructureDiff:")
		for _, d := range cmp.BodyStructureDiff {
			lines = append(lines, "- "+d)
		}
	}
	if len(cmp.BodyValueDiff) > 0 {
		lines = append(lines, "", "BodyValueDiff:")
		for _, d := range cmp.BodyValueDiff {
			lines = append(lines, "- "+d)
		}
	}
	if ui.compareOnlyDiff.Checked {
		filtered := make([]string, 0, len(lines))
		for _, line := range lines {
			trim := strings.TrimSpace(line)
			if strings.HasPrefix(trim, "Status:") && cmp.StatusMatch && len(cmp.HeadersDiff) == 0 && len(cmp.BodyStructureDiff) == 0 && len(cmp.BodyValueDiff) == 0 && cmp.ErrA == "" && cmp.ErrB == "" {
				continue
			}
			filtered = append(filtered, line)
		}
		if len(cmp.HeadersDiff) == 0 && len(cmp.BodyStructureDiff) == 0 && len(cmp.BodyValueDiff) == 0 && cmp.ErrA == "" && cmp.ErrB == "" && cmp.StatusMatch {
			filtered = append(filtered, "No differences")
		}
		lines = filtered
	}
	ui.compareDiffEntry.SetText(strings.Join(lines, "\n"))
}

func (ui *fyneUI) refreshReports() {
	reports := ui.app.ListReports()
	ui.reportsEntry.SetText(prettyAny(reports))
}

func (ui *fyneUI) pickFile(entry *widget.Entry) {
	d := dialog.NewFileOpen(func(rc fyne.URIReadCloser, err error) {
		if err != nil {
			ui.setError(err, true)
			return
		}
		if rc == nil {
			return
		}
		defer rc.Close()
		entry.SetText(rc.URI().Path())
	}, ui.win)
	d.Resize(fyne.NewSize(900, 600))
	d.Show()
}

func (ui *fyneUI) setStatus(msg string) {
	ui.statusLabel.SetText(msg)
}

func (ui *fyneUI) setError(err error, showDialog bool) {
	if err == nil {
		ui.errorLabel.SetText("")
		ui.errorLabel.Hide()
		return
	}
	ui.errorLabel.SetText("Error: " + err.Error())
	ui.errorLabel.Show()
	if showDialog {
		dialog.ShowError(err, ui.win)
	}
}

func parseHeaderMap(text string) map[string]string {
	out := map[string]string{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		k := strings.TrimSpace(parts[0])
		v := strings.TrimSpace(parts[1])
		if k != "" {
			out[k] = v
		}
	}
	return out
}

func formatHeaderMap(m map[string]string) string {
	if len(m) == 0 {
		return ""
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	lines := make([]string, 0, len(keys))
	for _, k := range keys {
		lines = append(lines, k+": "+m[k])
	}
	return strings.Join(lines, "\n")
}

func formatResponseHeaders(m map[string][]string) string {
	if len(m) == 0 {
		return ""
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	lines := make([]string, 0, len(keys))
	for _, k := range keys {
		lines = append(lines, k+": "+strings.Join(m[k], ", "))
	}
	return strings.Join(lines, "\n")
}

func prettyJSONOrText(s string) string {
	if s == "" {
		return ""
	}
	var v any
	if err := json.Unmarshal([]byte(s), &v); err != nil {
		return s
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return s
	}
	return string(b)
}

func prettyAny(v any) string {
	if v == nil {
		return "null"
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Sprintf("%+v", v)
	}
	return string(b)
}

func appendEntryLine(entry *widget.Entry, line string, maxChars int) {
	if entry == nil {
		return
	}
	text := entry.Text
	if text == "" {
		text = line
	} else {
		text += "\n" + line
	}
	if maxChars > 0 && len(text) > maxChars {
		text = text[len(text)-maxChars:]
	}
	entry.SetText(text)
}

func formatDriftFindings(dr core.DriftResult) string {
	if len(dr.Findings) == 0 {
		return fmt.Sprintf("%s %s\nOK: true\nNo drift findings", strings.ToUpper(dr.Method), dr.Path)
	}
	lines := []string{fmt.Sprintf("%s %s", strings.ToUpper(dr.Method), dr.Path), fmt.Sprintf("OK: %v", dr.OK), "", "Findings:"}
	for _, f := range dr.Findings {
		line := fmt.Sprintf("- %s [%s] schema=%s actual=%s", f.Path, f.Type, f.Schema, f.Actual)
		if len(f.Enum) > 0 {
			line += " enum=" + strings.Join(f.Enum, ",")
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}
