//go:build desktop

package desktop

import (
	"context"
	"os"
	"path/filepath"
	"sync"

	"lazytest/internal/appsvc"
)

type App struct {
	mu        sync.Mutex
	svc       *appsvc.Service
	workspace appsvc.Workspace
	rm        *RunManager
}

func NewApp(workspacePath string) *App {
	a := &App{rm: NewRunManager()}
	a.svc = appsvc.NewService(workspacePath, a)
	if ws, err := a.svc.LoadWorkspace(); err == nil {
		a.workspace = ws
		_ = a.svc.LoadConfigs(ws.EnvPath, ws.AuthPath)
		if ws.SpecPath != "" {
			_, _ = a.svc.LoadSpec(ws.SpecPath)
		}
	}
	return a
}

func (a *App) Startup(ctx context.Context) {
	_ = ctx
}

func (a *App) RunManager() *RunManager { return a.rm }

func (a *App) SubscribeRun(runID string) (<-chan any, func()) {
	if a.rm == nil {
		ch := make(chan any)
		close(ch)
		return ch, func() {}
	}
	return a.rm.Subscribe(runID)
}

func (a *App) TrackActiveRun(runID string) {
	if a.rm == nil || runID == "" {
		return
	}
	a.rm.SetActive(runID, func() { _ = a.svc.CancelRun(runID) })
}

func (a *App) CancelActiveRun() bool {
	if a.rm == nil {
		return false
	}
	return a.rm.CancelActive()
}

func (a *App) SaveWorkspace(ws appsvc.Workspace) (bool, error) {
	a.mu.Lock()
	a.workspace = ws
	a.mu.Unlock()
	if err := a.svc.SaveWorkspace(ws); err != nil {
		return false, err
	}
	if err := a.svc.LoadConfigs(ws.EnvPath, ws.AuthPath); err != nil {
		return false, err
	}
	return true, nil
}

func (a *App) LoadWorkspace() (appsvc.Workspace, error) { return a.svc.LoadWorkspace() }

func (a *App) CurrentWorkspace() appsvc.Workspace {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.workspace
}

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
	ws := a.CurrentWorkspace()
	return a.svc.StartSmoke(cfg, ws.EnvName, ws.AuthProfile, ws.BaseURL)
}
func (a *App) StartDrift(cfg appsvc.DriftStartConfig) (string, error) {
	ws := a.CurrentWorkspace()
	return a.svc.StartDrift(cfg, ws.EnvName, ws.AuthProfile, ws.BaseURL)
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
	_ = pattern
	return "", nil
}

func (a *App) Progress(e appsvc.RunProgressEvent) {
	if a.rm != nil {
		a.rm.Publish(e.RunID, e)
	}
}
func (a *App) Metrics(e appsvc.RunMetricsEvent) {
	if a.rm != nil {
		a.rm.Publish(e.RunID, e)
	}
}
func (a *App) Log(e appsvc.RunLogEvent) {
	if a.rm != nil {
		a.rm.Publish(e.RunID, e)
	}
}
func (a *App) Done(e appsvc.RunDoneEvent) {
	if a.rm != nil {
		a.rm.Publish(e.RunID, e)
		a.rm.Close(e.RunID)
	}
}

func Run() error {
	// Use new modular UI
	return RunNewUI(NewApp(defaultWorkspacePath()))

	// Old UI (commented out for now)
	// return runFyneUI(NewApp(defaultWorkspacePath()))
}

func defaultWorkspacePath() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return filepath.Join(".", ".lazytest", "workspace.json")
	}
	return filepath.Join(home, ".lazytest", "workspace.json")
}
