//go:build desktop

package ui

import (
	"sync"
	"testing"
	"time"

	"lazytest/internal/appsvc"
)

func TestUIState_SetWorkspace(t *testing.T) {
	state := NewUIState()
	called := false

	state.OnWorkspaceChange(func(ws appsvc.Workspace) {
		called = true
		if ws.EnvName != "test" {
			t.Errorf("Expected EnvName 'test', got '%s'", ws.EnvName)
		}
	})

	ws := appsvc.Workspace{EnvName: "test"}
	state.SetWorkspace(ws)

	if !called {
		t.Error("callback was not invoked")
	}

	retrieved := state.GetWorkspace()
	if retrieved.EnvName != "test" {
		t.Errorf("Expected EnvName 'test', got '%s'", retrieved.EnvName)
	}
}

func TestUIState_SetSpecSummary(t *testing.T) {
	state := NewUIState()
	called := false

	state.OnSpecLoad(func(summary *appsvc.SpecSummary) {
		called = true
		if summary.Title != "Test API" {
			t.Errorf("Expected Title 'Test API', got '%s'", summary.Title)
		}
	})

	summary := &appsvc.SpecSummary{Title: "Test API"}
	state.SetSpecSummary(summary)

	if !called {
		t.Error("callback was not invoked")
	}

	retrieved := state.GetSpecSummary()
	if retrieved == nil || retrieved.Title != "Test API" {
		t.Error("SpecSummary not correctly stored")
	}
}

func TestUIState_SetEndpoints(t *testing.T) {
	state := NewUIState()
	called := false

	state.OnEndpointsChange(func(endpoints []appsvc.EndpointDTO) {
		called = true
		if len(endpoints) != 2 {
			t.Errorf("Expected 2 endpoints, got %d", len(endpoints))
		}
	})

	endpoints := []appsvc.EndpointDTO{{ID: "1", Path: "/test1"}, {ID: "2", Path: "/test2"}}
	state.SetEndpoints(endpoints)

	if !called {
		t.Error("callback was not invoked")
	}

	retrieved := state.GetEndpoints()
	if len(retrieved) != 2 {
		t.Errorf("Expected 2 endpoints, got %d", len(retrieved))
	}
}

func TestUIState_SelectedEndpoint(t *testing.T) {
	state := NewUIState()

	endpoint := &appsvc.EndpointDTO{ID: "1", Path: "/test"}
	state.SetSelectedEndpoint(endpoint)

	retrieved := state.GetSelectedEndpoint()
	if retrieved == nil || retrieved.ID != "1" {
		t.Error("selected endpoint not correctly stored")
	}
}

func TestUIState_ActiveRun(t *testing.T) {
	state := NewUIState()

	state.SetActiveRun("run-123", "smoke")

	runID, runType := state.GetActiveRun()
	if runID != "run-123" {
		t.Errorf("Expected runID 'run-123', got '%s'", runID)
	}
	if runType != "smoke" {
		t.Errorf("Expected runType 'smoke', got '%s'", runType)
	}

	state.ClearActiveRun()
	runID, runType = state.GetActiveRun()
	if runID != "" || runType != "" {
		t.Error("active run not cleared")
	}
}

func TestUIState_ObserverOrdering(t *testing.T) {
	state := NewUIState()
	order := make([]int, 0, 2)

	state.OnWorkspaceChange(func(ws appsvc.Workspace) { order = append(order, 1) })
	state.OnWorkspaceChange(func(ws appsvc.Workspace) { order = append(order, 2) })

	state.SetWorkspace(appsvc.Workspace{EnvName: "dev"})

	if len(order) != 2 || order[0] != 1 || order[1] != 2 {
		t.Fatalf("unexpected observer order: %+v", order)
	}
}

func TestUIState_RunSnapshot(t *testing.T) {
	state := NewUIState()
	called := false

	state.OnRunChange(func(s appsvc.RunSnapshot) {
		called = true
	})

	state.SetRunSnapshot(appsvc.RunSnapshot{RunID: "r1", RunType: "lt", Status: "running", LastUpdatedAt: time.Now()})
	if !called {
		t.Fatal("run callback not invoked")
	}

	snap := state.GetRunSnapshot()
	if snap.RunID != "r1" || snap.RunType != "lt" {
		t.Fatalf("unexpected run snapshot: %+v", snap)
	}
}

func TestUIState_ConcurrentAccess(t *testing.T) {
	state := NewUIState()
	var wg sync.WaitGroup

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				state.SetWorkspace(appsvc.Workspace{EnvName: "test"})
				_ = state.GetWorkspace()
				state.SetEndpoints([]appsvc.EndpointDTO{{ID: "1"}})
				_ = state.GetEndpoints()
			}
		}()
	}
	wg.Wait()
}
