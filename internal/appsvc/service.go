package appsvc

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"lazytest/internal/config"
	"lazytest/internal/core"
)

// clock lets tests control time deterministically.
// Java analogy: this is similar to injecting a java.time.Clock.
type clock interface{ Now() time.Time }

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

// Service is the application service facade used by CLI/Desktop layers.
//
// Java analogy:
// - This type acts like an "ApplicationService" that orchestrates use-cases.
// - Internal fields play repository/cache roles for runtime state.
type Service struct {
	mu sync.RWMutex

	// Spec cache (in-memory read model).
	specPath  string
	docTitle  string
	docVer    string
	endpoints []core.Endpoint
	byID      map[string]core.Endpoint

	// Runtime configuration context.
	envCfg  *config.EnvConfig
	authCfg *config.AuthConfig

	// Workspace persistence location.
	wsPath string

	// Event sink consumed by desktop/cli progress streams.
	sink RunEventSink
	clk  clock

	// Run registry (active + history).
	runs    map[string]*runState
	active  *runState
	runSeq  atomic.Int64
	history []ResultDTO
}

// runState is the internal lifecycle record for one run.
type runState struct {
	id      string
	typ     string
	ctx     context.Context
	cancel  context.CancelFunc
	started time.Time
	ended   time.Time
	status  string
	result  interface{}
	err     error
}

// NewService creates the application service with default workspace path fallback.
func NewService(workspaceFile string, sink RunEventSink) *Service {
	if workspaceFile == "" {
		home, _ := os.UserHomeDir()
		workspaceFile = filepath.Join(home, ".lazytest", "workspace.json")
	}
	return &Service{
		wsPath: workspaceFile,
		sink:   sink,
		clk:    realClock{},
		byID:   map[string]core.Endpoint{},
		runs:   map[string]*runState{},
	}
}
