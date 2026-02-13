package tui

import (
	"strconv"
	"strings"
	"sync"
	"time"

	"lazytest/internal/config"
	"lazytest/internal/core"
	"lazytest/internal/lt"
	"lazytest/internal/tui/views"
)

// NavMode is the left menu selection (0–5): 6 items.
type NavMode int

const (
	NavEndpointExplorer NavMode = iota
	NavTestSuites
	NavLoadTests
	NavLiveMetrics
	NavContractDrift
	NavEnvSettings
)

// LoadedSpec is one loaded OpenAPI file.
type LoadedSpec struct {
	Path      string
	Title     string
	Version   string
	Endpoints []core.Endpoint
	Tags      []string
}

// AddLoadedSpec adds a spec to LoadedSpecs and sets it as current if CurrentSpec is nil.
func (s *AppState) AddLoadedSpec(spec LoadedSpec) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LoadedSpecs = append(s.LoadedSpecs, spec)
	if s.CurrentSpec == nil {
		s.CurrentSpec = &s.LoadedSpecs[len(s.LoadedSpecs)-1]
		s.Endpoints = spec.Endpoints
		s.SmokeResults = make([]core.SmokeResult, len(spec.Endpoints))
	}
}

func UniqueTagsFromEndpoints(eps []core.Endpoint) []string {
	seen := make(map[string]bool)
	var out []string
	for _, ep := range eps {
		for _, t := range ep.Tags {
			if t != "" && !seen[t] {
				seen[t] = true
				out = append(out, t)
			}
		}
	}
	return out
}

type RunHistoryEntry struct {
	When    time.Time
	Path    string
	Method  string
	Status  string
	Latency int64
	Env     string
	Error   string
}

type DriftSummaryRow struct {
	Path     string
	Method   string
	Missing  int
	Extra    int
	TypeMism int
	EnumViol int
	Findings []core.DriftFinding
}

type TestSuiteKind string

const (
	SuiteSmokeCritical TestSuiteKind = "Smoke (critical)"
	SuiteSmokeAll      TestSuiteKind = "Smoke (all)"
	SuiteContract      TestSuiteKind = "Contract (schema)"
	SuiteNegative      TestSuiteKind = "Negative (401/403/404)"
	SuiteRegression    TestSuiteKind = "Regression (snapshot)"
)

// LTPlanEntry is a loaded Taurus plan file for the Load Tests menu.
type LTPlanEntry struct {
	Path string
	Plan *lt.Plan
}

// AppState holds TUI state: 6 nav items, endpoints, smoke, drift, LT, Live Metrics, env/settings.
type AppState struct {
	mu sync.RWMutex

	NavIndex    int
	TableIdx    int
	TableFilter string
	FocusView   string

	// OpenAPI & endpoints
	LoadedSpecs    []LoadedSpec
	CurrentSpec    *LoadedSpec
	Endpoints      []core.Endpoint
	SmokeResults   []core.SmokeResult
	DriftResult    *core.DriftResult
	DriftSummaries []DriftSummaryRow
	ABResult       *core.ABCompareResult
	RunHistory     []RunHistoryEntry

	// Load Tests (LT mode)
	LTPlans       []LTPlanEntry
	LTRunning     bool
	LTWarmUpOn    bool
	LTErrorBudget struct {
		MaxErrorPct float64
		MaxP95Ms    int64
	}
	LTMetrics *lt.Metrics

	// Live Metrics (last run snapshot)
	LiveMetricsSnapshot lt.Snapshot
	LiveMetricsHidden   bool

	// Environment & auth (under Env & Settings)
	EnvName         string
	EnvConfig       *config.EnvConfig
	AuthConfig      *config.AuthConfig
	AuthProfile     string
	BaseURL         string
	Headers         map[string]string
	AuthHeader      map[string]string
	RateLimitRPS    int
	Timeout         time.Duration
	Retries         int
	Proxy           string
	CACert          string
	LastRunDuration time.Duration

	// Quick actions
	LastQuickAction string

	// Inline prompt modal
	PromptActive bool
	PromptKind   string
	PromptTitle  string
	PromptValue  string
}

type TableData struct {
	Headers []string
	Rows    [][]string
}

func (s *AppState) TableDataForNav() TableData {
	s.mu.RLock()
	defer s.mu.RUnlock()
	switch NavMode(s.NavIndex) {
	case NavEndpointExplorer:
		return s.tableEndpointExplorer()
	case NavTestSuites:
		return s.tableTestSuites()
	case NavLoadTests:
		return s.tableLoadTests()
	case NavLiveMetrics:
		return s.tableLiveMetrics()
	case NavContractDrift:
		return s.tableContractDrift()
	case NavEnvSettings:
		return s.tableEnvSettings()
	default:
		return TableData{Headers: []string{"?"}, Rows: nil}
	}
}

func (s *AppState) tableEndpointExplorer() TableData {
	h := []string{"PATH", "METHOD", "EXPECTED", "TAG", "LAST STATUS", "P95(ms)"}
	rows := make([][]string, 0)
	for i, ep := range s.Endpoints {
		tag := ""
		if len(ep.Tags) > 0 {
			tag = ep.Tags[0]
		}
		status := "-"
		p95 := "0"
		if i < len(s.SmokeResults) {
			r := s.SmokeResults[i]
			p95 = itoa(int(r.LatencyMS))
			if r.Err != "" {
				status = "Fail"
			} else if r.OK {
				status = "OK"
			} else {
				status = "Fail"
			}
		}
		rows = append(rows, []string{
			trunc(ep.Path, 28), ep.Method, "2xx/4xx", trunc(tag, 12), status, p95,
		})
	}
	return TableData{Headers: h, Rows: rows}
}

func (s *AppState) tableTestSuites() TableData {
	h := []string{"SUITE", "DESCRIPTION"}
	rows := [][]string{
		{string(SuiteSmokeCritical), "Critical paths only"},
		{string(SuiteSmokeAll), "All endpoints"},
		{string(SuiteContract), "Schema contract check"},
		{string(SuiteNegative), "401/403/404"},
		{string(SuiteRegression), "Snapshot diff"},
	}
	return TableData{Headers: h, Rows: rows}
}

func (s *AppState) tableLoadTests() TableData {
	h := []string{"PLAN", "SCENARIOS", "REQUESTS", "ASSERTIONS"}
	rows := make([][]string, 0)
	for _, e := range s.LTPlans {
		if e.Plan == nil {
			rows = append(rows, []string{trunc(e.Path, 30), "0", "0", "0"})
			continue
		}
		reqCount := 0
		assertCount := 0
		for _, sc := range e.Plan.Scenarios {
			reqCount += len(sc.Requests)
			for _, r := range sc.Requests {
				assertCount += len(r.Assertions)
			}
		}
		rows = append(rows, []string{
			trunc(e.Path, 30),
			itoa(len(e.Plan.Scenarios)),
			itoa(reqCount),
			itoa(assertCount),
		})
	}
	return TableData{Headers: h, Rows: rows}
}

func (s *AppState) tableLiveMetrics() TableData {
	h := []string{"METRIC", "VALUE"}
	snap := s.LiveMetricsSnapshot
	rows := [][]string{
		{"p50 (ms)", itoa(int(snap.P50))},
		{"p90 (ms)", itoa(int(snap.P90))},
		{"p95 (ms)", itoa(int(snap.P95))},
		{"p99 (ms)", itoa(int(snap.P99))},
		{"RPS", formatFloat(snap.RPS, 1)},
		{"Error %", formatFloat(snap.ErrorRatePct, 2)},
		{"Total", itoa(snap.Total)},
	}
	return TableData{Headers: h, Rows: rows}
}

func (s *AppState) tableContractDrift() TableData {
	h := []string{"PATH", "METHOD", "MISSING", "EXTRA", "TYPE_MISM", "ENUM_VIO"}
	rows := make([][]string, 0, len(s.DriftSummaries))
	for _, d := range s.DriftSummaries {
		rows = append(rows, []string{
			trunc(d.Path, 24), d.Method, itoa(d.Missing), itoa(d.Extra), itoa(d.TypeMism), itoa(d.EnumViol),
		})
	}
	return TableData{Headers: h, Rows: rows}
}

func (s *AppState) tableEnvSettings() TableData {
	h := []string{"SECTION", "KEY", "VALUE"}
	rows := make([][]string, 0)
	if s.EnvConfig != nil {
		for _, e := range s.EnvConfig.Environments {
			rows = append(rows, []string{"Env", e.Name, trunc(e.BaseURL, 28)})
		}
	}
	if s.AuthConfig != nil {
		for _, p := range s.AuthConfig.Profiles {
			rows = append(rows, []string{"Auth", p.Name, p.Type})
		}
	}
	for _, spec := range s.LoadedSpecs {
		rows = append(rows, []string{"OpenAPI", trunc(spec.Path, 24), itoa(len(spec.Endpoints)) + " eps"})
	}
	rows = append(rows, []string{"Report", "JUnit+JSON", "s to save"})
	timeoutVal := "5s"
	if s.Timeout > 0 {
		timeoutVal = s.Timeout.String()
	}
	rows = append(rows, []string{"Settings", "RateLimit", itoa(s.RateLimitRPS) + " RPS"})
	rows = append(rows, []string{"Settings", "Timeout", timeoutVal})
	return TableData{Headers: h, Rows: rows}
}

func (s *AppState) tableEnvSettingsEnvOffset() int {
	if s.EnvConfig == nil {
		return 0
	}
	return 0
}
func (s *AppState) tableEnvSettingsAuthOffset() int {
	n := 0
	if s.EnvConfig != nil {
		n = len(s.EnvConfig.Environments)
	}
	return n
}
func (s *AppState) tableEnvSettingsOpenAPIOffset() int {
	n := 0
	if s.EnvConfig != nil {
		n = len(s.EnvConfig.Environments)
	}
	if s.AuthConfig != nil {
		n += len(s.AuthConfig.Profiles)
	}
	return n
}

func formatFloat(f float64, prec int) string {
	return strconv.FormatFloat(f, 'f', prec, 64)
}

func (s *AppState) FailuresLast24h() []RunHistoryEntry {
	cutoff := time.Now().Add(-24 * time.Hour)
	var out []RunHistoryEntry
	for _, e := range s.RunHistory {
		if e.Status != "Fail" || e.When.Before(cutoff) {
			continue
		}
		out = append(out, e)
	}
	return out
}

func trunc(s string, w int) string {
	if w <= 0 || len(s) <= w {
		return s
	}
	return s[:w-1] + "…"
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}

func (s *AppState) Rows() []views.Row {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows := make([]views.Row, len(s.Endpoints))
	for i, ep := range s.Endpoints {
		rows[i] = views.Row{Endpoint: ep, P95: 0}
		if i < len(s.SmokeResults) {
			r := s.SmokeResults[i]
			rows[i].P95 = r.LatencyMS
			if r.Err != "" {
				rows[i].Status = "Fail"
			} else if r.OK {
				rows[i].Status = "OK"
			} else {
				rows[i].Status = "Fail"
			}
		}
	}
	return rows
}

func (s *AppState) FilteredRows() []views.Row {
	rows := s.Rows()
	if s.TableFilter == "" {
		return rows
	}
	filter := strings.ToLower(s.TableFilter)
	var out []views.Row
	for _, r := range rows {
		if strings.Contains(strings.ToLower(r.Endpoint.Path+r.Endpoint.Method), filter) {
			out = append(out, r)
		}
	}
	return out
}

func (s *AppState) FilteredTableData() TableData {
	td := s.TableDataForNav()
	if s.TableFilter == "" || NavMode(s.NavIndex) != NavEndpointExplorer {
		return td
	}
	filter := strings.ToLower(s.TableFilter)
	var out [][]string
	for _, row := range td.Rows {
		if len(row) >= 2 && strings.Contains(strings.ToLower(row[0]+row[1]), filter) {
			out = append(out, row)
		}
	}
	td.Rows = out
	return td
}
