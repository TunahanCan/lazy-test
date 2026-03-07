//go:build desktop

package desktop

import (
	"testing"
	"time"

	"lazytest/internal/appsvc"
)

func TestRunEventAggregator_OutOfOrderAndDone(t *testing.T) {
	agg := NewRunEventAggregator(5, 5)
	runID := "run-1"

	agg.Consume(appsvc.RunDoneEvent{RunID: runID, Status: "completed", ResultSummary: "ok"})
	agg.Consume(appsvc.RunProgressEvent{RunID: runID, Phase: "smoke", Done: 1, Total: 2})

	s := agg.Snapshot(runID)
	if s.Status != "completed" {
		t.Fatalf("expected completed, got %s", s.Status)
	}
	if s.Progress.Done != 1 || s.Progress.Total != 2 {
		t.Fatalf("unexpected progress: %+v", s.Progress)
	}
}

func TestRunEventAggregator_BufferLimit(t *testing.T) {
	agg := NewRunEventAggregator(3, 10)
	runID := "run-2"

	for i := 0; i < 7; i++ {
		agg.Consume(appsvc.RunMetricsEvent{
			RunID: runID,
			Snapshot: appsvc.RunMetricsSnapshot{
				Time:      time.Now(),
				P95:       int64(i),
				RPS:       float64(i),
				ErrorRate: 0.1,
			},
		})
	}

	s := agg.Snapshot(runID)
	if len(s.Metrics) != 3 {
		t.Fatalf("expected 3 metrics, got %d", len(s.Metrics))
	}
	if s.Metrics[0].P95 != 4 || s.Metrics[2].P95 != 6 {
		t.Fatalf("unexpected metrics window: %+v", s.Metrics)
	}
}

func TestRunEventAggregator_CanceledStatus(t *testing.T) {
	agg := NewRunEventAggregator(3, 3)
	runID := "run-3"
	agg.Consume(appsvc.RunProgressEvent{RunID: runID, Phase: "lt", Done: 2, Total: 10})
	agg.Consume(appsvc.RunDoneEvent{RunID: runID, Status: "canceled", ResultSummary: "lt canceled"})

	s := agg.Snapshot(runID)
	if s.Status != "canceled" {
		t.Fatalf("expected canceled, got %s", s.Status)
	}
	if s.Summary != "lt canceled" {
		t.Fatalf("unexpected summary: %s", s.Summary)
	}
}

func TestRunEventAggregator_LogBuffer(t *testing.T) {
	agg := NewRunEventAggregator(3, 2)
	runID := "run-4"
	agg.Consume(appsvc.RunLogEvent{RunID: runID, Level: "info", Msg: "first"})
	agg.Consume(appsvc.RunLogEvent{RunID: runID, Level: "info", Msg: "second"})
	agg.Consume(appsvc.RunLogEvent{RunID: runID, Level: "info", Msg: "third"})

	s := agg.Snapshot(runID)
	if len(s.Logs) != 2 {
		t.Fatalf("expected 2 logs, got %d", len(s.Logs))
	}
}
