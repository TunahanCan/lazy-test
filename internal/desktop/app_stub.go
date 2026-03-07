//go:build !desktop

package desktop

import (
	"context"
	"errors"

	"lazytest/internal/appsvc"
)

type App struct {
	svc       *appsvc.Service
	workspace appsvc.Workspace
}

func NewApp(workspacePath string) *App     { return &App{svc: appsvc.NewService(workspacePath, nil)} }
func (a *App) Startup(ctx context.Context) {}
func (a *App) SaveWorkspace(ws appsvc.Workspace) (bool, error) {
	a.workspace = ws
	return true, a.svc.SaveWorkspace(ws)
}
func (a *App) LoadWorkspace() (appsvc.Workspace, error)             { return a.svc.LoadWorkspace() }
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
	return "", errors.New("desktop build tag required")
}
func (a *App) Progress(e appsvc.RunProgressEvent) {}
func (a *App) Metrics(e appsvc.RunMetricsEvent)   {}
func (a *App) Log(e appsvc.RunLogEvent)           {}
func (a *App) Done(e appsvc.RunDoneEvent)         {}

func Run() error {
	return errors.New("desktop build tag required")
}
