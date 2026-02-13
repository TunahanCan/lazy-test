// Package tui runs the LazyGit-style terminal UI using gocui.
package tui

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jroimartin/gocui"
	"lazytest/internal/core"
	"lazytest/internal/lt"
	"lazytest/internal/report"
	"lazytest/internal/tui/views"
)

const (
	leftNavW   = 34
	statusBarH = 1
	logoH      = 8
)

// Run starts the TUI with the given state. It blocks until the user quits.
func Run(ctx context.Context, state *AppState) error {
	g, err := gocui.NewGui(gocui.OutputNormal)
	if err != nil {
		return err
	}
	defer g.Close()
	g.Cursor = true
	g.Mouse = false

	layout := func(g *gocui.Gui) error {
		maxX, maxY := g.Size()
		if maxY < statusBarH+logoH+2 {
			return nil
		}
		if err := views.RenderLeftNav(g, 0, 0, leftNavW, maxY-statusBarH-logoH, state.NavIndex); err != nil {
			return err
		}
		tableH := (maxY - statusBarH - logoH) / 2
		td := state.FilteredTableData()
		statusCol := -1
		if NavMode(state.NavIndex) == NavEndpointExplorer && len(td.Headers) >= 5 {
			statusCol = 4
		}
		if err := views.GenericTable(g, leftNavW+1, 0, maxX, tableH, td.Headers, td.Rows, state.TableIdx, statusCol); err != nil {
			return err
		}
		detailY := tableH + 1
		detailH := maxY - detailY - statusBarH - logoH
		if detailH > 0 {
			detailContent := buildDetailContent(state)
			if err := views.RenderDetail(g, leftNavW+1, detailY, maxX, detailY+detailH, detailContent); err != nil {
				return err
			}
		}
		if err := views.RenderStatusBar(g, 0, maxY-statusBarH-logoH, maxX, maxY-logoH); err != nil {
			return err
		}
		if err := views.RenderLogo(g, 0, maxY-logoH, maxX, maxY); err != nil {
			return err
		}
		if state.FocusView == "" {
			if _, err := g.SetCurrentView(views.LeftNavName()); err != nil && err != gocui.ErrUnknownView {
				return err
			}
			state.FocusView = "leftNav"
		}
		return nil
	}
	g.SetManagerFunc(layout)

	if err := g.SetKeybinding("", gocui.KeyTab, gocui.ModNone, func(g *gocui.Gui, v *gocui.View) error {
		if state.FocusView == "leftNav" {
			state.FocusView = "mainTable"
			if _, err := g.SetCurrentView(views.MainTableName()); err != nil {
				return err
			}
		} else {
			state.FocusView = "leftNav"
			if _, err := g.SetCurrentView(views.LeftNavName()); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}
	if err := g.SetKeybinding("", gocui.KeyCtrlC, gocui.ModNone, quit); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'q', gocui.ModNone, quit); err != nil {
		return err
	}

	if err := g.SetKeybinding(views.LeftNavName(), gocui.KeyArrowDown, gocui.ModNone, arrowDownLeftNav(state)); err != nil {
		return err
	}
	if err := g.SetKeybinding(views.LeftNavName(), gocui.KeyArrowUp, gocui.ModNone, arrowUpLeftNav(state)); err != nil {
		return err
	}
	if err := g.SetKeybinding(views.MainTableName(), gocui.KeyArrowDown, gocui.ModNone, arrowDownTable(state)); err != nil {
		return err
	}
	if err := g.SetKeybinding(views.MainTableName(), gocui.KeyArrowUp, gocui.ModNone, arrowUpTable(state)); err != nil {
		return err
	}

	if err := g.SetKeybinding(views.LeftNavName(), gocui.KeyEnter, gocui.ModNone, enterLeftNav(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding(views.MainTableName(), gocui.KeyEnter, gocui.ModNone, enterTable(state, g)); err != nil {
		return err
	}

	if err := g.SetKeybinding("", 'r', gocui.ModNone, runSmokeSelected(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'A', gocui.ModNone, runSuite(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'a', gocui.ModNone, runSmokeAll(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'o', gocui.ModNone, runDriftSelected(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'C', gocui.ModNone, runABCompare(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'c', gocui.ModNone, runABCompare(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 's', gocui.ModNone, saveReports(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'e', gocui.ModNone, cycleEnv(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'p', gocui.ModNone, cycleAuthProfile(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'L', gocui.ModNone, runLT(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'W', gocui.ModNone, toggleWarmUp(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'E', gocui.ModNone, setErrorBudget(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'R', gocui.ModNone, resetMetrics(state, g)); err != nil {
		return err
	}
	if err := g.SetKeybinding("", 'H', gocui.ModNone, toggleMetricsHidden(state, g)); err != nil {
		return err
	}

	return g.MainLoop()
}

func quit(g *gocui.Gui, v *gocui.View) error {
	return gocui.ErrQuit
}

func arrowDownLeftNav(state *AppState) func(*gocui.Gui, *gocui.View) error {
	return func(g *gocui.Gui, v *gocui.View) error {
		if state.NavIndex < len(views.LeftNavItems())-1 {
			state.NavIndex++
			views.SetLeftNavCursor(g, state.NavIndex)
			state.TableIdx = 0
		}
		return nil
	}
}
func arrowUpLeftNav(state *AppState) func(*gocui.Gui, *gocui.View) error {
	return func(g *gocui.Gui, v *gocui.View) error {
		if state.NavIndex > 0 {
			state.NavIndex--
			views.SetLeftNavCursor(g, state.NavIndex)
			state.TableIdx = 0
		}
		return nil
	}
}
func arrowDownTable(state *AppState) func(*gocui.Gui, *gocui.View) error {
	return func(g *gocui.Gui, v *gocui.View) error {
		td := state.FilteredTableData()
		if state.TableIdx < len(td.Rows)-1 {
			state.TableIdx++
			views.SetTableCursor(g, state.TableIdx)
		}
		return nil
	}
}
func arrowUpTable(state *AppState) func(*gocui.Gui, *gocui.View) error {
	return func(g *gocui.Gui, v *gocui.View) error {
		if state.TableIdx > 0 {
			state.TableIdx--
			views.SetTableCursor(g, state.TableIdx)
		}
		return nil
	}
}

func enterLeftNav(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		state.FocusView = "mainTable"
		if _, err := g.SetCurrentView(views.MainTableName()); err != nil {
			return err
		}
		views.SetTableCursor(g, state.TableIdx)
		g.Update(func(*gocui.Gui) error { return nil })
		return nil
	}
}

func enterTable(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		td := state.FilteredTableData()
		if state.TableIdx >= len(td.Rows) {
			g.Update(func(*gocui.Gui) error { return nil })
			return nil
		}
		switch NavMode(state.NavIndex) {
		case NavTestSuites:
			runSuite(state, g)(nil, nil)
		case NavEnvSettings:
			// Section column: Env, Auth, OpenAPI, Report, Settings
			if len(td.Rows[state.TableIdx]) < 2 {
				break
			}
			section := td.Rows[state.TableIdx][0]
			switch section {
			case "Env":
				if state.EnvConfig != nil && state.TableIdx < len(state.EnvConfig.Environments) {
					e := state.EnvConfig.Environments[state.TableIdx]
					state.EnvName = e.Name
					state.BaseURL = e.BaseURL
					state.Headers = e.Headers
					state.RateLimitRPS = e.RateLimitRPS
				}
			case "Auth":
				if state.AuthConfig != nil {
					authIdx := state.tableEnvSettingsAuthOffset()
					if state.TableIdx >= authIdx && state.TableIdx < authIdx+len(state.AuthConfig.Profiles) {
						p := state.AuthConfig.Profiles[state.TableIdx-authIdx]
						state.AuthProfile = p.Name
						state.AuthHeader = make(map[string]string)
						if p.Type == "jwt" {
							state.AuthHeader["Authorization"] = "Bearer " + p.Token
						}
						if p.Type == "apikey" && p.Header != "" {
							state.AuthHeader[p.Header] = p.Key
						}
					}
				}
			case "OpenAPI":
				openAPIIdx := state.tableEnvSettingsOpenAPIOffset()
				if state.TableIdx >= openAPIIdx && state.TableIdx < openAPIIdx+len(state.LoadedSpecs) {
					spec := &state.LoadedSpecs[state.TableIdx-openAPIIdx]
					state.CurrentSpec = spec
					state.Endpoints = spec.Endpoints
					state.SmokeResults = make([]core.SmokeResult, len(spec.Endpoints))
				}
			case "Report":
				saveReports(state, g)(nil, nil)
			}
		}
		g.Update(func(*gocui.Gui) error { return nil })
		return nil
	}
}

func runSmokeSelected(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		rows := state.FilteredRows()
		if state.TableIdx >= len(rows) || state.BaseURL == "" {
			return nil
		}
		if NavMode(state.NavIndex) != NavEndpointExplorer {
			return nil
		}
		ep := rows[state.TableIdx].Endpoint
		cfg := core.SmokeConfig{
			BaseURL: state.BaseURL, Headers: state.Headers, AuthHeader: state.AuthHeader,
			Timeout: 5 * time.Second, RateLimitRPS: state.RateLimitRPS,
		}
		go func() {
			res := core.RunSmokeSingle(cfg, ep)
			state.mu.Lock()
			for i := range state.Endpoints {
				if state.Endpoints[i].Path == ep.Path && state.Endpoints[i].Method == ep.Method {
					if i >= len(state.SmokeResults) {
						state.SmokeResults = append(state.SmokeResults, make([]core.SmokeResult, i+1-len(state.SmokeResults))...)
					}
					state.SmokeResults[i] = res
					state.RunHistory = appendRunHistory(state.RunHistory, state.EnvName, ep.Path, ep.Method, res)
					break
				}
			}
			state.mu.Unlock()
			g.Update(func(*gocui.Gui) error { return nil })
		}()
		return nil
	}
}
func runSmokeAll(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		if len(state.Endpoints) == 0 || state.BaseURL == "" {
			return nil
		}
		cfg := core.SmokeConfig{
			BaseURL: state.BaseURL, Headers: state.Headers, AuthHeader: state.AuthHeader,
			Timeout: 5 * time.Second, Workers: 10, RateLimitRPS: state.RateLimitRPS,
		}
		go func() {
			start := time.Now()
			results := core.RunSmokeBulk(context.Background(), cfg, state.Endpoints)
			state.mu.Lock()
			state.SmokeResults = results
			state.LastRunDuration = time.Since(start)
			for i, r := range results {
				if i < len(state.Endpoints) {
					state.RunHistory = appendRunHistory(state.RunHistory, state.EnvName, state.Endpoints[i].Path, state.Endpoints[i].Method, r)
				}
			}
			state.mu.Unlock()
			g.Update(func(*gocui.Gui) error { return nil })
		}()
		return nil
	}
}
func runSuite(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		if NavMode(state.NavIndex) != NavTestSuites {
			return nil
		}
		td := state.FilteredTableData()
		if state.TableIdx >= len(td.Rows) {
			return nil
		}
		suiteName := ""
		if state.TableIdx < len(td.Rows) && len(td.Rows[state.TableIdx]) > 0 {
			suiteName = td.Rows[state.TableIdx][0]
		}
		switch suiteName {
		case string(SuiteSmokeAll), string(SuiteSmokeCritical):
			runSmokeAll(state, g)(nil, nil)
		case string(SuiteContract):
			runDriftSelected(state, g)(nil, nil)
		default:
			runSmokeAll(state, g)(nil, nil)
		}
		return nil
	}
}
func runDriftSelected(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		rows := state.FilteredRows()
		if state.TableIdx >= len(rows) || state.BaseURL == "" {
			return nil
		}
		ep := rows[state.TableIdx].Endpoint
		cfg := core.SmokeConfig{BaseURL: state.BaseURL, Headers: state.Headers, AuthHeader: state.AuthHeader, Timeout: 5 * time.Second}
		go func() {
			statusCode, body, err := core.FetchResponse(cfg, ep)
			dr := core.DriftResult{Path: ep.Path, Method: ep.Method, OK: true}
			if err != nil {
				dr.OK = false
				dr.Findings = []core.DriftFinding{{Path: "$", Type: core.DriftTypeMismatch, Actual: err.Error()}}
			} else if statusCode >= 200 && statusCode < 300 && len(body) > 0 {
				dr = core.RunDrift(body, ep.Schema, statusCode)
				dr.Path = ep.Path
				dr.Method = ep.Method
			}
			state.mu.Lock()
			state.DriftResult = &dr
			missing, extra, typeM, enumV := 0, 0, 0, 0
			for _, f := range dr.Findings {
				switch f.Type {
				case core.DriftMissing:
					missing++
				case core.DriftExtra:
					extra++
				case core.DriftTypeMismatch:
					typeM++
				case core.DriftEnumViolation:
					enumV++
				}
			}
			state.DriftSummaries = appendDriftSummary(state.DriftSummaries, DriftSummaryRow{Path: dr.Path, Method: dr.Method, Missing: missing, Extra: extra, TypeMism: typeM, EnumViol: enumV, Findings: dr.Findings})
			state.mu.Unlock()
			g.Update(func(*gocui.Gui) error { return nil })
		}()
		return nil
	}
}
func runABCompare(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		if state.EnvConfig == nil || len(state.EnvConfig.Environments) < 2 {
			return nil
		}
		rows := state.FilteredRows()
		if state.TableIdx >= len(rows) {
			return nil
		}
		ep := rows[state.TableIdx].Endpoint
		envA := state.EnvConfig.Environments[0]
		envB := state.EnvConfig.Environments[1]
		go func() {
			res := core.RunABCompare(ep, envA.BaseURL, envB.BaseURL, state.Headers, state.AuthHeader, 5*time.Second)
			state.mu.Lock()
			state.ABResult = &res
			state.mu.Unlock()
			g.Update(func(*gocui.Gui) error { return nil })
		}()
		return nil
	}
}
func saveReports(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		_ = report.WriteJUnitSmoke("junit.xml", state.SmokeResults, state.LastRunDuration)
		rep := report.SmokeReportFromResults(state.SmokeResults, state.LastRunDuration)
		_ = report.WriteJSON("out.json", rep)
		g.Update(func(*gocui.Gui) error { return nil })
		return nil
	}
}
func cycleEnv(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		if state.EnvConfig == nil || len(state.EnvConfig.Environments) == 0 {
			return nil
		}
		names := make([]string, len(state.EnvConfig.Environments))
		for i, e := range state.EnvConfig.Environments {
			names[i] = e.Name
		}
		next := 0
		for i, n := range names {
			if n == state.EnvName {
				next = (i + 1) % len(names)
				break
			}
		}
		state.EnvName = names[next]
		if e := state.EnvConfig.GetEnvironment(state.EnvName); e != nil {
			state.BaseURL = e.BaseURL
			state.Headers = e.Headers
			state.RateLimitRPS = e.RateLimitRPS
		}
		g.Update(func(*gocui.Gui) error { return nil })
		return nil
	}
}
func cycleAuthProfile(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		if state.AuthConfig == nil || len(state.AuthConfig.Profiles) == 0 {
			return nil
		}
		next := 0
		for i, p := range state.AuthConfig.Profiles {
			if p.Name == state.AuthProfile {
				next = (i + 1) % len(state.AuthConfig.Profiles)
				break
			}
		}
		p := state.AuthConfig.Profiles[next]
		state.AuthProfile = p.Name
		state.AuthHeader = make(map[string]string)
		if p.Type == "jwt" {
			state.AuthHeader["Authorization"] = "Bearer " + p.Token
		}
		if p.Type == "apikey" && p.Header != "" {
			state.AuthHeader[p.Header] = p.Key
		}
		g.Update(func(*gocui.Gui) error { return nil })
		return nil
	}
}

func runLT(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		if NavMode(state.NavIndex) != NavLoadTests || state.TableIdx >= len(state.LTPlans) {
			return nil
		}
		entry := state.LTPlans[state.TableIdx]
		if entry.Plan == nil {
			return nil
		}
		if state.LTRunning {
			return nil
		}
		state.LTRunning = true
		warmUp := 30 * time.Second
		if !state.LTWarmUpOn {
			warmUp = 0
		}
		cfg := lt.DefaultRunConfig()
		cfg.WarmUpDuration = warmUp
		cfg.MaxErrorPct = state.LTErrorBudget.MaxErrorPct
		cfg.MaxP95Ms = state.LTErrorBudget.MaxP95Ms
		runner := &lt.Runner{Plan: entry.Plan, Config: cfg}
		runner.Metrics = lt.NewMetrics(warmUp)
		state.LTMetrics = runner.Metrics
		go func() {
			ctx := context.Background()
			_ = runner.Run(ctx)
			state.mu.Lock()
			state.LTRunning = false
			state.LiveMetricsSnapshot = runner.Metrics.Snapshot()
			state.mu.Unlock()
			g.Update(func(*gocui.Gui) error { return nil })
		}()
		return nil
	}
}

func toggleWarmUp(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		state.LTWarmUpOn = !state.LTWarmUpOn
		g.Update(func(*gocui.Gui) error { return nil })
		return nil
	}
}

func setErrorBudget(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		// Cycle thresholds: 0/0 -> 5%/500 -> 10%/1000 -> 0/0
		if state.LTErrorBudget.MaxErrorPct == 0 && state.LTErrorBudget.MaxP95Ms == 0 {
			state.LTErrorBudget.MaxErrorPct = 5
			state.LTErrorBudget.MaxP95Ms = 500
		} else if state.LTErrorBudget.MaxErrorPct == 5 {
			state.LTErrorBudget.MaxErrorPct = 10
			state.LTErrorBudget.MaxP95Ms = 1000
		} else {
			state.LTErrorBudget.MaxErrorPct = 0
			state.LTErrorBudget.MaxP95Ms = 0
		}
		g.Update(func(*gocui.Gui) error { return nil })
		return nil
	}
}

func resetMetrics(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		if state.LTMetrics != nil {
			state.LTMetrics.Reset(0)
		}
		state.LiveMetricsSnapshot = lt.Snapshot{}
		g.Update(func(*gocui.Gui) error { return nil })
		return nil
	}
}

func toggleMetricsHidden(state *AppState, g *gocui.Gui) func(*gocui.Gui, *gocui.View) error {
	return func(_ *gocui.Gui, _ *gocui.View) error {
		state.LiveMetricsHidden = !state.LiveMetricsHidden
		g.Update(func(*gocui.Gui) error { return nil })
		return nil
	}
}

func appendRunHistory(h []RunHistoryEntry, env, path, method string, r core.SmokeResult) []RunHistoryEntry {
	status := "Fail"
	if r.OK {
		status = "OK"
	}
	if r.Err != "" {
		status = "Fail"
	}
	e := RunHistoryEntry{When: time.Now(), Path: path, Method: method, Status: status, Latency: r.LatencyMS, Env: env, Error: r.Err}
	h = append(h, e)
	if len(h) > 50 {
		h = h[len(h)-50:]
	}
	return h
}
func appendDriftSummary(h []DriftSummaryRow, r DriftSummaryRow) []DriftSummaryRow {
	h = append(h, r)
	if len(h) > 100 {
		h = h[len(h)-100:]
	}
	return h
}
func buildDetailContent(state *AppState) *views.DetailContent {
	nav := NavMode(state.NavIndex)
	switch nav {
	case NavEndpointExplorer:
		rows := state.FilteredRows()
		if state.TableIdx >= len(rows) {
			return nil
		}
		r := rows[state.TableIdx]
		content := &views.DetailContent{
			Title:   r.Endpoint.Method + " " + r.Endpoint.Path,
			Summary: fmt.Sprintf("Summary: %s\nLast status: %s  P95: %d ms", r.Endpoint.Summary, r.Status, r.P95),
		}
		if state.DriftResult != nil && state.DriftResult.Path == r.Endpoint.Path && state.DriftResult.Method == r.Endpoint.Method {
			content.Findings = state.DriftResult.Findings
			if !state.DriftResult.OK {
				content.Title = "Drift: " + content.Title
			}
		}
		if state.ABResult != nil {
			content.ABDiff = state.ABResult
		}
		return content
	case NavContractDrift:
		if state.TableIdx >= len(state.DriftSummaries) {
			return nil
		}
		d := state.DriftSummaries[state.TableIdx]
		summary := fmt.Sprintf("PATH: %s %s | missing=%d extra=%d type_mismatch=%d enum_violation=%d", d.Path, d.Method, d.Missing, d.Extra, d.TypeMism, d.EnumViol)
		return &views.DetailContent{Title: "Contract Drift", Summary: summary, Findings: d.Findings}
	case NavLoadTests:
		if state.TableIdx >= len(state.LTPlans) {
			return &views.DetailContent{Title: "Load Tests", Summary: "L to run selected plan. W warm-up, E error budget."}
		}
		entry := state.LTPlans[state.TableIdx]
		if entry.Plan == nil {
			return &views.DetailContent{Title: entry.Path, Summary: "Invalid plan"}
		}
		lines := entry.Plan.ScenarioSummary()
		return &views.DetailContent{Title: "LT: " + entry.Path, Summary: fmt.Sprintf("Scenarios:\n%s", strings.Join(lines, "\n"))}
	case NavLiveMetrics:
		if state.LiveMetricsHidden {
			return &views.DetailContent{Title: "Live Metrics", Summary: "H to show. R to reset."}
		}
		snap := state.LiveMetricsSnapshot
		errBudget, p95Viol := snap.ThresholdCheck(state.LTErrorBudget.MaxErrorPct, state.LTErrorBudget.MaxP95Ms)
		summary := fmt.Sprintf("p50=%d p90=%d p95=%d p99=%d ms\nRPS=%.1f  Error%%=%.2f  Total=%d",
			snap.P50, snap.P90, snap.P95, snap.P99, snap.RPS, snap.ErrorRatePct, snap.Total)
		if errBudget || p95Viol {
			summary += "\n[THRESHOLD VIOLATION]"
		}
		return &views.DetailContent{Title: "Live Metrics", Summary: summary, IsError: errBudget || p95Viol}
	case NavEnvSettings:
		td := state.FilteredTableData()
		if state.TableIdx < len(td.Rows) {
			row := td.Rows[state.TableIdx]
			if len(row) >= 3 {
				return &views.DetailContent{Title: row[1], Summary: row[2]}
			}
		}
		return &views.DetailContent{Title: "Environments & Settings", Summary: "e env, p auth. Enter to apply."}
	}
	td := state.FilteredTableData()
	if state.TableIdx < len(td.Rows) {
		row := td.Rows[state.TableIdx]
		if len(row) > 0 {
			return &views.DetailContent{Title: row[0], Summary: fmt.Sprintf("%v", row)}
		}
	}
	return nil
}
