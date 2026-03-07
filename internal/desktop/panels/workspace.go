//go:build desktop

package panels

import (
	"fmt"
	"path/filepath"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"lazytest/internal/appsvc"
)

type WorkspacePanel struct {
	app    DesktopApp
	state  SharedState
	win    fyne.Window
	status func(string)

	specPath *widget.Entry
	envPath  *widget.Entry
	authPath *widget.Entry
	envName  *widget.Entry
	baseURL  *widget.Entry
	authProf *widget.Entry

	container fyne.CanvasObject
}

func NewWorkspacePanel(app DesktopApp, state SharedState, win fyne.Window, status func(string)) *WorkspacePanel {
	p := &WorkspacePanel{app: app, state: state, win: win, status: status}
	p.build()
	p.syncFromState(state.GetWorkspace())
	state.OnWorkspaceChange(func(ws appsvc.Workspace) { p.syncFromState(ws) })
	return p
}

func (p *WorkspacePanel) build() {
	p.specPath = widget.NewEntry()
	p.envPath = widget.NewEntry()
	p.authPath = widget.NewEntry()
	p.envName = widget.NewEntry()
	p.baseURL = widget.NewEntry()
	p.authProf = widget.NewEntry()

	pick := func(title string, entry *widget.Entry) *widget.Button {
		return widget.NewButton("Browse", func() {
			d := dialog.NewFileOpen(func(r fyne.URIReadCloser, err error) {
				if err != nil {
					p.status("File dialog error: " + err.Error())
					return
				}
				if r == nil {
					return
				}
				entry.SetText(r.URI().Path())
				_ = r.Close()
			}, p.win)
			d.Show()
		})
	}

	specRow := container.NewBorder(nil, nil, nil, pick("Select OpenAPI spec", p.specPath), p.specPath)
	envRow := container.NewBorder(nil, nil, nil, pick("Select env config", p.envPath), p.envPath)
	authRow := container.NewBorder(nil, nil, nil, pick("Select auth config", p.authPath), p.authPath)

	saveBtn := widget.NewButton("Save Workspace", func() {
		ws, err := p.readWorkspace()
		if err != nil {
			dialog.ShowError(err, p.win)
			return
		}
		if _, err := p.app.SaveWorkspace(ws); err != nil {
			dialog.ShowError(err, p.win)
			return
		}
		p.state.SetWorkspace(ws)
		p.status("Workspace saved")
	})
	saveBtn.Importance = widget.HighImportance

	loadSpecBtn := widget.NewButton("Load Spec", func() {
		if strings.TrimSpace(p.specPath.Text) == "" {
			dialog.ShowError(fmt.Errorf("spec path is required"), p.win)
			return
		}
		summary, err := p.app.LoadSpec(strings.TrimSpace(p.specPath.Text))
		if err != nil {
			dialog.ShowError(err, p.win)
			return
		}
		p.state.SetSpecSummary(&summary)
		p.state.SetEndpoints(p.app.ListEndpoints(appsvc.EndpointFilter{}))
		p.status(fmt.Sprintf("Spec loaded: %d endpoints", summary.EndpointsCount))
	})

	content := container.NewVBox(
		widget.NewLabelWithStyle("Workspace", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		widget.NewForm(
			widget.NewFormItem("OpenAPI Spec", specRow),
			widget.NewFormItem("Env Config", envRow),
			widget.NewFormItem("Auth Config", authRow),
			widget.NewFormItem("Environment", p.envName),
			widget.NewFormItem("Base URL", p.baseURL),
			widget.NewFormItem("Auth Profile", p.authProf),
		),
		container.NewHBox(saveBtn, loadSpecBtn),
	)
	p.container = container.NewScroll(content)
}

func (p *WorkspacePanel) readWorkspace() (appsvc.Workspace, error) {
	spec := strings.TrimSpace(p.specPath.Text)
	if spec == "" {
		return appsvc.Workspace{}, fmt.Errorf("OpenAPI spec path cannot be empty")
	}
	if filepath.Ext(spec) == "" {
		return appsvc.Workspace{}, fmt.Errorf("OpenAPI spec path looks invalid")
	}
	return appsvc.Workspace{
		Version:     1,
		SpecPath:    spec,
		EnvPath:     strings.TrimSpace(p.envPath.Text),
		AuthPath:    strings.TrimSpace(p.authPath.Text),
		EnvName:     strings.TrimSpace(p.envName.Text),
		BaseURL:     strings.TrimSpace(p.baseURL.Text),
		AuthProfile: strings.TrimSpace(p.authProf.Text),
	}, nil
}

func (p *WorkspacePanel) syncFromState(ws appsvc.Workspace) {
	p.specPath.SetText(ws.SpecPath)
	p.envPath.SetText(ws.EnvPath)
	p.authPath.SetText(ws.AuthPath)
	p.envName.SetText(ws.EnvName)
	p.baseURL.SetText(ws.BaseURL)
	p.authProf.SetText(ws.AuthProfile)
}

func (p *WorkspacePanel) OnShow()                      {}
func (p *WorkspacePanel) OnHide()                      {}
func (p *WorkspacePanel) Dispose()                     {}
func (p *WorkspacePanel) Container() fyne.CanvasObject { return p.container }
