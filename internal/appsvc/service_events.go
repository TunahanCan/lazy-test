package appsvc

import "lazytest/internal/lt"

// emitProgress forwards progress events to sink if available.
func (s *Service) emitProgress(runID, phase string, done, total int, item string, okCount, errCount int) {
	if s.sink == nil {
		return
	}
	s.sink.Progress(RunProgressEvent{
		RunID:       runID,
		Phase:       phase,
		Done:        done,
		Total:       total,
		CurrentItem: item,
		OKCount:     okCount,
		ErrCount:    errCount,
	})
}

// emitMetrics forwards normalized LT snapshot to sink.
func (s *Service) emitMetrics(runID string, snap lt.Snapshot) {
	if s.sink == nil {
		return
	}
	s.sink.Metrics(RunMetricsEvent{
		RunID: runID,
		Snapshot: RunMetricsSnapshot{
			P95:       snap.P95,
			RPS:       snap.RPS,
			ErrorRate: snap.ErrorRatePct,
			Statuses:  snap.StatusDist,
			Time:      s.clk.Now(),
		},
	})
}

// emitDone forwards final run status.
func (s *Service) emitDone(runID, status, summary string) {
	if s.sink == nil {
		return
	}
	s.sink.Done(RunDoneEvent{
		RunID:         runID,
		Status:        status,
		ResultSummary: summary,
	})
}
