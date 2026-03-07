//go:build desktop

package desktop

import (
	"fmt"
	"sync"
	"time"

	"lazytest/internal/appsvc"
)

// RunEventAggregator normalizes run events for UI panels.
type RunEventAggregator interface {
	Consume(ev any) appsvc.RunSnapshot
	Snapshot(runID string) appsvc.RunSnapshot
	Clear(runID string)
}

type runAgg struct {
	mu          sync.RWMutex
	metricLimit int
	logLimit    int
	runs        map[string]appsvc.RunSnapshot
}

func NewRunEventAggregator(metricLimit, logLimit int) RunEventAggregator {
	if metricLimit <= 0 {
		metricLimit = 120
	}
	if logLimit <= 0 {
		logLimit = 400
	}
	_ = logLimit
	return &runAgg{metricLimit: metricLimit, logLimit: logLimit, runs: map[string]appsvc.RunSnapshot{}}
}

func (a *runAgg) Consume(ev any) appsvc.RunSnapshot {
	a.mu.Lock()
	defer a.mu.Unlock()

	switch e := ev.(type) {
	case appsvc.RunProgressEvent:
		s := a.ensure(e.RunID)
		s.Progress = e
		s.LastUpdatedAt = time.Now()
		if s.RunType == "" {
			s.RunType = e.Phase
		}
		s.Logs = a.appendLog(s.Logs, formatProgressLog(e))
		a.runs[e.RunID] = s
		return s
	case appsvc.RunMetricsEvent:
		s := a.ensure(e.RunID)
		s.Metrics = append(s.Metrics, appsvc.MetricsPoint{
			Time:      e.Snapshot.Time,
			P95:       e.Snapshot.P95,
			RPS:       e.Snapshot.RPS,
			ErrorRate: e.Snapshot.ErrorRate,
		})
		if len(s.Metrics) > a.metricLimit {
			s.Metrics = s.Metrics[len(s.Metrics)-a.metricLimit:]
		}
		s.Statuses = map[int]int{}
		for code, count := range e.Snapshot.Statuses {
			s.Statuses[code] = count
		}
		s.LastUpdatedAt = time.Now()
		s.Logs = a.appendLog(s.Logs, formatMetricsLog(e))
		a.runs[e.RunID] = s
		return s
	case appsvc.RunDoneEvent:
		s := a.ensure(e.RunID)
		s.Status = e.Status
		s.Summary = e.ResultSummary
		s.LastUpdatedAt = time.Now()
		s.Logs = a.appendLog(s.Logs, formatDoneLog(e))
		a.runs[e.RunID] = s
		return s
	case appsvc.RunLogEvent:
		s := a.ensure(e.RunID)
		s.LastUpdatedAt = time.Now()
		s.Logs = a.appendLog(s.Logs, formatAppLog(e))
		a.runs[e.RunID] = s
		return s
	default:
		return appsvc.RunSnapshot{}
	}
}

func (a *runAgg) Snapshot(runID string) appsvc.RunSnapshot {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.runs[runID]
}

func (a *runAgg) Clear(runID string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.runs, runID)
}

func (a *runAgg) ensure(runID string) appsvc.RunSnapshot {
	s, ok := a.runs[runID]
	if !ok {
		s = appsvc.RunSnapshot{RunID: runID, Status: "running"}
	}
	return s
}

func (a *runAgg) appendLog(lines []string, line string) []string {
	if line == "" {
		return lines
	}
	lines = append(lines, line)
	if len(lines) > a.logLimit {
		lines = lines[len(lines)-a.logLimit:]
	}
	return lines
}

func formatProgressLog(e appsvc.RunProgressEvent) string {
	return time.Now().Format("15:04:05") + " [progress] " + e.Phase + " " +
		it(e.Done) + "/" + it(e.Total) + " item=" + e.CurrentItem +
		" ok=" + it(e.OKCount) + " err=" + it(e.ErrCount)
}

func formatMetricsLog(e appsvc.RunMetricsEvent) string {
	return time.Now().Format("15:04:05") + " [metrics] p95=" + it64(e.Snapshot.P95) +
		"ms rps=" + ff(e.Snapshot.RPS) + " err=" + ff(e.Snapshot.ErrorRate) + "%"
}

func formatDoneLog(e appsvc.RunDoneEvent) string {
	return time.Now().Format("15:04:05") + " [done] status=" + e.Status + " summary=" + e.ResultSummary
}

func formatAppLog(e appsvc.RunLogEvent) string {
	return time.Now().Format("15:04:05") + " [" + e.Level + "] " + e.Msg
}

func it(v int) string     { return fmt.Sprintf("%d", v) }
func it64(v int64) string { return fmt.Sprintf("%d", v) }
func ff(v float64) string { return fmt.Sprintf("%.2f", v) }
