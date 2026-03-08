//go:build desktop

package ui

import (
	"sync"
	"time"

	"lazytest/internal/appsvc"
)

// UIState manages global desktop UI state.
// Java analogy: shared observable store (similar to a simple evented ViewModel).
type UIState struct {
	mu sync.RWMutex

	Workspace        appsvc.Workspace
	SpecSummary      *appsvc.SpecSummary
	Endpoints        []appsvc.EndpointDTO
	SelectedEndpoint *appsvc.EndpointDTO
	ActiveRunID      string
	ActiveRunType    string
	RunSnapshot      appsvc.RunSnapshot

	onWorkspaceChange []func(appsvc.Workspace)
	onSpecLoad        []func(*appsvc.SpecSummary)
	onEndpointsChange []func([]appsvc.EndpointDTO)
	onSelectedChange  []func(*appsvc.EndpointDTO)
	onRunChange       []func(appsvc.RunSnapshot)
}

func NewUIState() *UIState {
	return &UIState{
		onWorkspaceChange: make([]func(appsvc.Workspace), 0),
		onSpecLoad:        make([]func(*appsvc.SpecSummary), 0),
		onEndpointsChange: make([]func([]appsvc.EndpointDTO), 0),
		onSelectedChange:  make([]func(*appsvc.EndpointDTO), 0),
		onRunChange:       make([]func(appsvc.RunSnapshot), 0),
	}
}

func (s *UIState) SetWorkspace(ws appsvc.Workspace) {
	s.mu.Lock()
	s.Workspace = ws
	callbacks := append([]func(appsvc.Workspace){}, s.onWorkspaceChange...)
	s.mu.Unlock()
	for _, cb := range callbacks {
		cb(ws)
	}
}

func (s *UIState) GetWorkspace() appsvc.Workspace {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Workspace
}

func (s *UIState) OnWorkspaceChange(cb func(appsvc.Workspace)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onWorkspaceChange = append(s.onWorkspaceChange, cb)
}

func (s *UIState) SetSpecSummary(summary *appsvc.SpecSummary) {
	s.mu.Lock()
	s.SpecSummary = summary
	callbacks := append([]func(*appsvc.SpecSummary){}, s.onSpecLoad...)
	s.mu.Unlock()
	for _, cb := range callbacks {
		cb(summary)
	}
}

func (s *UIState) GetSpecSummary() *appsvc.SpecSummary {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.SpecSummary
}

func (s *UIState) OnSpecLoad(cb func(*appsvc.SpecSummary)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onSpecLoad = append(s.onSpecLoad, cb)
}

func (s *UIState) SetEndpoints(endpoints []appsvc.EndpointDTO) {
	s.mu.Lock()
	s.Endpoints = append([]appsvc.EndpointDTO(nil), endpoints...)
	callbacks := append([]func([]appsvc.EndpointDTO){}, s.onEndpointsChange...)
	s.mu.Unlock()
	for _, cb := range callbacks {
		cb(endpoints)
	}
}

func (s *UIState) GetEndpoints() []appsvc.EndpointDTO {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]appsvc.EndpointDTO(nil), s.Endpoints...)
}

func (s *UIState) OnEndpointsChange(cb func([]appsvc.EndpointDTO)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onEndpointsChange = append(s.onEndpointsChange, cb)
}

func (s *UIState) GetSelectedEndpoint() *appsvc.EndpointDTO {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.SelectedEndpoint == nil {
		return nil
	}
	ep := *s.SelectedEndpoint
	return &ep
}

func (s *UIState) SetSelectedEndpoint(ep *appsvc.EndpointDTO) {
	s.mu.Lock()
	if ep == nil {
		s.SelectedEndpoint = nil
	} else {
		clone := *ep
		s.SelectedEndpoint = &clone
	}
	selected := s.SelectedEndpoint
	callbacks := append([]func(*appsvc.EndpointDTO){}, s.onSelectedChange...)
	s.mu.Unlock()
	for _, cb := range callbacks {
		cb(selected)
	}
}

func (s *UIState) OnSelectedEndpointChange(cb func(*appsvc.EndpointDTO)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onSelectedChange = append(s.onSelectedChange, cb)
}

func (s *UIState) SetActiveRun(runID, runType string) {
	s.mu.Lock()
	s.ActiveRunID = runID
	s.ActiveRunType = runType
	if s.RunSnapshot.RunID != runID {
		s.RunSnapshot = appsvc.RunSnapshot{RunID: runID, RunType: runType, Status: "running", LastUpdatedAt: time.Now()}
	}
	snap := s.RunSnapshot
	callbacks := append([]func(appsvc.RunSnapshot){}, s.onRunChange...)
	s.mu.Unlock()
	for _, cb := range callbacks {
		cb(snap)
	}
}

func (s *UIState) GetActiveRun() (runID, runType string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ActiveRunID, s.ActiveRunType
}

func (s *UIState) ClearActiveRun() {
	s.mu.Lock()
	s.ActiveRunID = ""
	s.ActiveRunType = ""
	snap := s.RunSnapshot
	callbacks := append([]func(appsvc.RunSnapshot){}, s.onRunChange...)
	s.mu.Unlock()
	for _, cb := range callbacks {
		cb(snap)
	}
}

func (s *UIState) SetRunSnapshot(snapshot appsvc.RunSnapshot) {
	s.mu.Lock()
	s.RunSnapshot = snapshot
	if snapshot.RunID != "" {
		s.ActiveRunID = snapshot.RunID
		if snapshot.RunType != "" {
			s.ActiveRunType = snapshot.RunType
		}
	}
	callbacks := append([]func(appsvc.RunSnapshot){}, s.onRunChange...)
	s.mu.Unlock()
	for _, cb := range callbacks {
		cb(snapshot)
	}
}

func (s *UIState) GetRunSnapshot() appsvc.RunSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	clone := s.RunSnapshot
	clone.Metrics = append([]appsvc.MetricsPoint(nil), s.RunSnapshot.Metrics...)
	clone.Logs = append([]string(nil), s.RunSnapshot.Logs...)
	if s.RunSnapshot.Statuses != nil {
		clone.Statuses = map[int]int{}
		for k, v := range s.RunSnapshot.Statuses {
			clone.Statuses[k] = v
		}
	}
	return clone
}

func (s *UIState) OnRunChange(cb func(appsvc.RunSnapshot)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onRunChange = append(s.onRunChange, cb)
}
