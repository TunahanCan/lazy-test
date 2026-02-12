package report

import (
	"encoding/json"
	"os"
	"time"

	"lazytest/internal/core"
)

// JSONReport is the root structure for JSON output.
type JSONReport struct {
	Generated string          `json:"generated"`
	Duration  string          `json:"duration_seconds"`
	Smoke     *SmokeSummary   `json:"smoke,omitempty"`
	Drift     *DriftSummary   `json:"drift,omitempty"`
	AB        *ABSummary      `json:"ab_compare,omitempty"`
}

// SmokeSummary summarizes smoke test results.
type SmokeSummary struct {
	Total   int                  `json:"total"`
	Passed  int                  `json:"passed"`
	Failed  int                  `json:"failed"`
	Results []core.SmokeResult   `json:"results"`
}

// DriftSummary summarizes drift results.
type DriftSummary struct {
	Total   int                  `json:"total"`
	OK      int                  `json:"ok"`
	Drifted int                  `json:"drifted"`
	Results []core.DriftResult   `json:"results"`
}

// ABSummary summarizes A/B compare results.
type ABSummary struct {
	Path     string                 `json:"path"`
	Method   string                 `json:"method"`
	Result   core.ABCompareResult   `json:"result"`
}

// WriteJSON writes a JSON report to path.
func WriteJSON(path string, r *JSONReport) error {
	data, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// SmokeReportFromResults builds JSONReport from smoke results.
func SmokeReportFromResults(results []core.SmokeResult, duration time.Duration) *JSONReport {
	var passed, failed int
	for _, r := range results {
		if r.OK {
			passed++
		} else {
			failed++
		}
	}
	return &JSONReport{
		Generated: time.Now().Format(time.RFC3339),
		Duration:  duration.String(),
		Smoke: &SmokeSummary{
			Total:   len(results),
			Passed:  passed,
			Failed:  failed,
			Results: results,
		},
	}
}

// DriftReportFromResults builds JSONReport from drift results.
func DriftReportFromResults(results []core.DriftResult, duration time.Duration) *JSONReport {
	var ok, drifted int
	for _, r := range results {
		if r.OK {
			ok++
		} else {
			drifted++
		}
	}
	return &JSONReport{
		Generated: time.Now().Format(time.RFC3339),
		Duration:  duration.String(),
		Drift: &DriftSummary{
			Total:   len(results),
			OK:      ok,
			Drifted:  drifted,
			Results: results,
		},
	}
}
