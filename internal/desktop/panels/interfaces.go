//go:build desktop

package panels

import "lazytest/internal/appsvc"

// DesktopApp defines desktop backend methods used by panels.
// Java analogy: this behaves like a facade interface injected into each panel.
type DesktopApp interface {
	LoadWorkspace() (appsvc.Workspace, error)
	SaveWorkspace(ws appsvc.Workspace) (bool, error)
	CurrentWorkspace() appsvc.Workspace
	LoadSpec(filePath string) (appsvc.SpecSummary, error)
	ListEndpoints(filter appsvc.EndpointFilter) []appsvc.EndpointDTO
	BuildExampleRequest(endpointID, envName, authProfile string, overrides map[string]string) (appsvc.RequestDTO, error)
	SendRequest(req appsvc.RequestDTO) (appsvc.ResponseDTO, error)
	StartSmoke(cfg appsvc.SmokeStartConfig) (string, error)
	StartDrift(cfg appsvc.DriftStartConfig) (string, error)
	StartCompare(cfg appsvc.CompareStartConfig) (string, error)
	StartLT(planPath string, cfg appsvc.LTStartConfig) (string, error)
	CancelRun(runID string) bool
	ListReports() []appsvc.ResultDTO
	SubscribeRun(runID string) (<-chan any, func())
	TrackActiveRun(runID string)
	CancelActiveRun() bool
}

// SharedState is the observable state surface consumed by panels.
// Java analogy: comparable to a shared ViewModel/store abstraction.
type SharedState interface {
	GetWorkspace() appsvc.Workspace
	SetWorkspace(ws appsvc.Workspace)
	OnWorkspaceChange(cb func(appsvc.Workspace))

	GetSpecSummary() *appsvc.SpecSummary
	SetSpecSummary(summary *appsvc.SpecSummary)
	OnSpecLoad(cb func(*appsvc.SpecSummary))

	GetEndpoints() []appsvc.EndpointDTO
	SetEndpoints(endpoints []appsvc.EndpointDTO)
	OnEndpointsChange(cb func([]appsvc.EndpointDTO))

	GetSelectedEndpoint() *appsvc.EndpointDTO
	SetSelectedEndpoint(ep *appsvc.EndpointDTO)
	OnSelectedEndpointChange(cb func(*appsvc.EndpointDTO))

	SetActiveRun(runID, runType string)
	GetActiveRun() (string, string)
	ClearActiveRun()

	SetRunSnapshot(snapshot appsvc.RunSnapshot)
	GetRunSnapshot() appsvc.RunSnapshot
	OnRunChange(cb func(appsvc.RunSnapshot))
}
