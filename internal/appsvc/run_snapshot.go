package appsvc

import "time"

// MetricsPoint is a normalized chart point used by live dashboard/metrics UI.
type MetricsPoint struct {
	Time      time.Time `json:"time"`
	P95       int64     `json:"p95"`
	RPS       float64   `json:"rps"`
	ErrorRate float64   `json:"errorRate"`
}

// RunSnapshot is the read model materialized from run events.
// Java analogy: projection DTO built from event stream.
type RunSnapshot struct {
	RunID         string           `json:"runID"`
	RunType       string           `json:"runType"`
	Status        string           `json:"status"`
	Summary       string           `json:"summary"`
	Progress      RunProgressEvent `json:"progress"`
	Metrics       []MetricsPoint   `json:"metrics"`
	Logs          []string         `json:"logs,omitempty"`
	Statuses      map[int]int      `json:"statuses"`
	LastUpdatedAt time.Time        `json:"lastUpdatedAt"`
}
