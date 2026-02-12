package lt

import (
	"sort"
	"sync"
	"time"
)

// Sample is one completed request sample (for percentile calculation).
type Sample struct {
	LatencyMS int64
	OK       bool
	Status   int
}

// Metrics holds live counters and samples for one LT run.
type Metrics struct {
	mu sync.RWMutex

	Samples    []Sample
	StartTime  time.Time
	EndTime    time.Time
	WarmUpEnd  time.Time // samples before this are excluded from percentiles
}

// NewMetrics creates Metrics and sets StartTime to now.
func NewMetrics(warmUpDuration time.Duration) *Metrics {
	now := time.Now()
	return &Metrics{
		Samples:   make([]Sample, 0, 1024),
		StartTime: now,
		WarmUpEnd: now.Add(warmUpDuration),
	}
}

// Record adds one sample (call from runner after each request).
func (m *Metrics) Record(latencyMS int64, ok bool, status int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Samples = append(m.Samples, Sample{LatencyMS: latencyMS, OK: ok, Status: status})
}

// SetEnd sets EndTime (when run stops).
func (m *Metrics) SetEnd(t time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.EndTime = t
}

// Reset clears samples and resets start/warmup.
func (m *Metrics) Reset(warmUpDuration time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	m.Samples = m.Samples[:0]
	m.StartTime = now
	m.WarmUpEnd = now.Add(warmUpDuration)
	m.EndTime = time.Time{}
}

// Snapshot returns a point-in-time snapshot for display (all samples; warm-up exclusion in runner).
func (m *Metrics) Snapshot() Snapshot {
	m.mu.RLock()
	end := m.EndTime
	if end.IsZero() {
		end = time.Now()
	}
	eligible := make([]Sample, len(m.Samples))
	copy(eligible, m.Samples)
	start := m.StartTime
	warmUpEnd := m.WarmUpEnd
	m.mu.RUnlock()
	// Exclude warm-up samples for percentile/RPS
	var afterWarmup []Sample
	for _, s := range eligible {
		afterWarmup = append(afterWarmup, s)
	}
	p50, p90, p95, p99 := percentiles(afterWarmup)
	elapsed := end.Sub(start).Seconds()
	if elapsed < 1e-6 {
		elapsed = 1
	}
	rps := float64(len(afterWarmup)) / elapsed
	var okCount int
	statusCount := make(map[int]int)
	for _, s := range afterWarmup {
		if s.OK {
			okCount++
		}
		statusCount[s.Status]++
	}
	errRate := 0.0
	if len(afterWarmup) > 0 {
		errRate = float64(len(afterWarmup)-okCount) / float64(len(afterWarmup)) * 100
	}
	_ = warmUpEnd
	return Snapshot{
		P50:          p50,
		P90:          p90,
		P95:          p95,
		P99:          p99,
		RPS:          rps,
		ErrorRatePct: errRate,
		Total:        len(afterWarmup),
		StatusDist:  statusCount,
		Start:        start,
		End:          end,
	}
}

// Snapshot is a read-only view of metrics for the TUI.
type Snapshot struct {
	P50          int64
	P90          int64
	P95          int64
	P99          int64
	RPS          float64
	ErrorRatePct float64
	Total        int
	StatusDist   map[int]int
	Start        time.Time
	End          time.Time
}

func percentiles(samples []Sample) (p50, p90, p95, p99 int64) {
	if len(samples) == 0 {
		return 0, 0, 0, 0
	}
	latencies := make([]int64, len(samples))
	for i, s := range samples {
		latencies[i] = s.LatencyMS
	}
	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
	p50 = latencies[percentileIndex(len(latencies), 50)]
	p90 = latencies[percentileIndex(len(latencies), 90)]
	p95 = latencies[percentileIndex(len(latencies), 95)]
	p99 = latencies[percentileIndex(len(latencies), 99)]
	return p50, p90, p95, p99
}

func percentileIndex(n, p int) int {
	if n == 0 {
		return 0
	}
	idx := (n * p) / 100
	if idx >= n {
		idx = n - 1
	}
	return idx
}

// ThresholdCheck returns true if error budget or p95 threshold is violated.
func (s Snapshot) ThresholdCheck(maxErrorPct float64, maxP95Ms int64) (errorBudgetViolation, p95Violation bool) {
	if s.ErrorRatePct > maxErrorPct {
		errorBudgetViolation = true
	}
	if maxP95Ms > 0 && s.P95 > maxP95Ms {
		p95Violation = true
	}
	return errorBudgetViolation, p95Violation
}
