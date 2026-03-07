package desktop

import (
	"context"
	"fmt"
	"sync"
)

// RunManager is the desktop-side pub/sub hub for run events.
// MVP policy: only one active run at a time; starting a new active run cancels the previous one.
type RunManager struct {
	mu           sync.RWMutex
	nextID       int64
	activeRunID  string
	activeCancel context.CancelFunc
	subs         map[string]map[chan any]struct{}
}

func NewRunManager() *RunManager {
	return &RunManager{
		subs: map[string]map[chan any]struct{}{},
	}
}

func (m *RunManager) NewRunID(kind string) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.nextID++
	return fmt.Sprintf("%s-%d", kind, m.nextID)
}

// SetActive installs the active run cancel function and cancels the previous active run.
func (m *RunManager) SetActive(runID string, cancel context.CancelFunc) (prevCanceled bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.activeCancel != nil && m.activeRunID != "" && m.activeRunID != runID {
		m.activeCancel()
		prevCanceled = true
	}
	m.activeRunID = runID
	m.activeCancel = cancel
	return prevCanceled
}

func (m *RunManager) ClearActive(runID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.activeRunID == runID {
		m.activeRunID = ""
		m.activeCancel = nil
	}
}

func (m *RunManager) CancelActive() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.activeCancel == nil {
		return false
	}
	m.activeCancel()
	return true
}

func (m *RunManager) Subscribe(runID string) (<-chan any, func()) {
	ch := make(chan any, 32)
	m.mu.Lock()
	if m.subs[runID] == nil {
		m.subs[runID] = map[chan any]struct{}{}
	}
	m.subs[runID][ch] = struct{}{}
	m.mu.Unlock()

	unsub := func() {
		m.mu.Lock()
		if set, ok := m.subs[runID]; ok {
			if _, ok := set[ch]; ok {
				delete(set, ch)
				close(ch)
			}
			if len(set) == 0 {
				delete(m.subs, runID)
			}
		}
		m.mu.Unlock()
	}
	return ch, unsub
}

func (m *RunManager) Publish(runID string, ev any) {
	m.mu.RLock()
	set := m.subs[runID]
	snapshot := make([]chan any, 0, len(set))
	for ch := range set {
		snapshot = append(snapshot, ch)
	}
	m.mu.RUnlock()

	for _, ch := range snapshot {
		select {
		case ch <- ev:
		default:
		}
	}
}

func (m *RunManager) Close(runID string) {
	m.mu.Lock()
	set := m.subs[runID]
	delete(m.subs, runID)
	if m.activeRunID == runID {
		m.activeRunID = ""
		m.activeCancel = nil
	}
	m.mu.Unlock()

	for ch := range set {
		close(ch)
	}
}
