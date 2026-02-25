//go:build desktop

package desktop

import (
	"context"

	"lazytest/internal/appsvc"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context
	svc *appsvc.Service

	workspace appsvc.Workspace
}

func NewApp(workspacePath string) *App {
	a := &App{}
	a.svc = appsvc.NewService(workspacePath, a)
	return a
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	if ws, err := a.svc.LoadWorkspace(); err == nil {
		a.workspace = ws
		_ = a.svc.LoadConfigs(ws.EnvPath, ws.AuthPath)
		if ws.SpecPath != "" {
			_, _ = a.svc.LoadSpec(ws.SpecPath)
		}
	}
}

func (a *App) SaveWorkspace(ws appsvc.Workspace) (bool, error) {
	a.workspace = ws
	if err := a.svc.SaveWorkspace(ws); err != nil {
		return false, err
	}
	if err := a.svc.LoadConfigs(ws.EnvPath, ws.AuthPath); err != nil {
		return false, err
	}
	return true, nil
}
func (a *App) LoadWorkspace() (appsvc.Workspace, error) { return a.svc.LoadWorkspace() }

func (a *App) LoadSpec(filePath string) (appsvc.SpecSummary, error) { return a.svc.LoadSpec(filePath) }
func (a *App) ListEndpoints(filter appsvc.EndpointFilter) []appsvc.EndpointDTO {
	return a.svc.ListEndpoints(filter)
}
func (a *App) BuildExampleRequest(endpointID, envName, authProfile string, overrides map[string]string) (appsvc.RequestDTO, error) {
	return a.svc.BuildExampleRequest(endpointID, envName, authProfile, overrides)
}
func (a *App) SendRequest(req appsvc.RequestDTO) (appsvc.ResponseDTO, error) {
	return a.svc.SendRequest(req)
}

func (a *App) StartSmoke(cfg appsvc.SmokeStartConfig) (string, error) {
	return a.svc.StartSmoke(cfg, a.workspace.EnvName, a.workspace.AuthProfile, a.workspace.BaseURL)
}
func (a *App) StartDrift(cfg appsvc.DriftStartConfig) (string, error) {
	return a.svc.StartDrift(cfg, a.workspace.EnvName, a.workspace.AuthProfile, a.workspace.BaseURL)
}
func (a *App) StartCompare(cfg appsvc.CompareStartConfig) (string, error) {
	return a.svc.StartCompare(cfg)
}
func (a *App) StartLT(planPath string, cfg appsvc.LTStartConfig) (string, error) {
	return a.svc.StartLT(planPath, cfg)
}
func (a *App) StartTCP(planPath string, cfg appsvc.TCPStartConfig) (string, error) {
	return a.svc.StartTCP(planPath, cfg)
}
func (a *App) CancelRun(runID string) bool                         { return a.svc.CancelRun(runID) }
func (a *App) GetRunResult(runID string) (appsvc.ResultDTO, error) { return a.svc.GetRunResult(runID) }
func (a *App) ListReports() []appsvc.ResultDTO                     { return a.svc.ListHistory() }

func (a *App) OpenFileDialog(pattern string) (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Filters: []runtime.FileFilter{{DisplayName: "Files", Pattern: pattern}}})
}

func (a *App) Progress(e appsvc.RunProgressEvent) { runtime.EventsEmit(a.ctx, "run.progress", e) }
func (a *App) Metrics(e appsvc.RunMetricsEvent)   { runtime.EventsEmit(a.ctx, "run.metrics", e) }
func (a *App) Log(e appsvc.RunLogEvent)           { runtime.EventsEmit(a.ctx, "run.log", e) }
func (a *App) Done(e appsvc.RunDoneEvent)         { runtime.EventsEmit(a.ctx, "run.done", e) }
