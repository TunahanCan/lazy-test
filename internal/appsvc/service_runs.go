package appsvc

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"lazytest/internal/core"
	"lazytest/internal/lt"
	"lazytest/internal/report"
	"lazytest/internal/tcp"

	"github.com/getkin/kin-openapi/openapi3"
)

// StartSmoke runs smoke checks for selected endpoints.
func (s *Service) StartSmoke(cfg SmokeStartConfig, envName, authProfile, baseOverride string) (string, error) {
	startFn := func(ctx context.Context, run *runState) (interface{}, error) {
		s.mu.RLock()
		eps := append([]core.Endpoint(nil), s.endpoints...)
		s.mu.RUnlock()

		if !cfg.RunAll && len(cfg.EndpointIDs) > 0 {
			selected := make([]core.Endpoint, 0, len(cfg.EndpointIDs))
			s.mu.RLock()
			for _, id := range cfg.EndpointIDs {
				if ep, ok := s.byID[id]; ok {
					selected = append(selected, ep)
				}
			}
			s.mu.RUnlock()
			eps = selected
		}

		base, headers, authHeader := s.resolveContext(envName, authProfile)
		if baseOverride != "" {
			base = baseOverride
		}
		scfg := core.SmokeConfig{
			BaseURL:      base,
			Headers:      headers,
			AuthHeader:   authHeader,
			Workers:      cfg.Workers,
			RateLimitRPS: cfg.RateLimit,
			Timeout:      time.Duration(max(cfg.TimeoutMS, 5000)) * time.Millisecond,
		}

		results := make([]core.SmokeResult, 0, len(eps))
		okCount := 0
		for i, ep := range eps {
			select {
			case <-ctx.Done():
				return results, ctx.Err()
			default:
			}

			if ep.Schema == nil {
				ep.Schema = &openapi3.Operation{}
			}

			r := core.RunSmokeSingle(scfg, ep)
			if r.OK {
				okCount++
			}
			results = append(results, r)
			s.emitProgress(run.id, "smoke", i+1, len(eps), ep.Method+" "+ep.Path, okCount, (i+1)-okCount)
		}

		if cfg.ExportDir != "" {
			_ = os.MkdirAll(cfg.ExportDir, 0755)
			d := time.Second
			_ = report.WriteJSON(filepath.Join(cfg.ExportDir, "smoke.json"), report.SmokeReportFromResults(results, d))
			_ = report.WriteJUnitSmoke(filepath.Join(cfg.ExportDir, "smoke.junit.xml"), results, d)
		}
		return results, nil
	}
	return s.startRun("smoke", startFn)
}

// StartDrift validates one endpoint response against schema and exports result if requested.
func (s *Service) StartDrift(cfg DriftStartConfig, envName, authProfile, baseOverride string) (string, error) {
	return s.startRun("drift", func(ctx context.Context, run *runState) (interface{}, error) {
		s.mu.RLock()
		ep, ok := s.byID[cfg.EndpointID]
		s.mu.RUnlock()
		if !ok {
			return nil, errors.New("endpoint not found")
		}

		base, headers, authHeader := s.resolveContext(envName, authProfile)
		if baseOverride != "" {
			base = baseOverride
		}
		scfg := core.SmokeConfig{
			BaseURL:    base,
			Headers:    headers,
			AuthHeader: authHeader,
			Timeout:    time.Duration(max(cfg.TimeoutMS, 5000)) * time.Millisecond,
		}

		code, body, err := core.FetchResponse(scfg, ep)
		if err != nil {
			return nil, err
		}
		dr := core.RunDrift(body, ep.Schema, code)
		dr.Path = ep.Path
		dr.Method = ep.Method
		s.emitProgress(run.id, "drift", 1, 1, ep.Method+" "+ep.Path, b2i(dr.OK), b2i(!dr.OK))

		if cfg.ExportDir != "" {
			_ = os.MkdirAll(cfg.ExportDir, 0755)
			_ = report.WriteJSON(filepath.Join(cfg.ExportDir, "drift.json"), report.DriftReportFromResults([]core.DriftResult{dr}, time.Second))
		}
		return dr, nil
	})
}

// StartCompare performs A/B response compare between two environments.
func (s *Service) StartCompare(cfg CompareStartConfig) (string, error) {
	return s.startRun("compare", func(ctx context.Context, run *runState) (interface{}, error) {
		_ = ctx
		s.mu.RLock()
		ep, ok := s.byID[cfg.EndpointID]
		s.mu.RUnlock()
		if !ok {
			return nil, errors.New("endpoint not found")
		}
		baseA, headersA, authA := s.resolveContext(cfg.EnvA, "")
		baseB, _, _ := s.resolveContext(cfg.EnvB, "")
		res := core.RunABCompare(ep, baseA, baseB, headersA, authA, time.Duration(max(cfg.TimeoutMS, 5000))*time.Millisecond)
		s.emitProgress(run.id, "compare", 1, 1, ep.Method+" "+ep.Path, b2i(res.StatusMatch), b2i(!res.StatusMatch))
		return res, nil
	})
}

// StartLT executes load-test plan and streams metrics snapshots periodically.
func (s *Service) StartLT(planPath string, cfg LTStartConfig) (string, error) {
	return s.startRun("lt", func(ctx context.Context, run *runState) (interface{}, error) {
		p, err := lt.ParseFile(planPath)
		if err != nil {
			return nil, err
		}
		r := &lt.Runner{Plan: p, Config: lt.DefaultRunConfig()}
		r.Config.MaxErrorPct = cfg.MaxErrorPct
		r.Config.MaxP95Ms = cfg.MaxP95Ms

		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		done := make(chan error, 1)
		go func() { done <- r.Run(ctx) }()

		for {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case err := <-done:
				snap := r.Metrics.Snapshot()
				s.emitMetrics(run.id, snap)
				return snap, err
			case <-ticker.C:
				if r.Metrics != nil {
					s.emitMetrics(run.id, r.Metrics.Snapshot())
				}
			}
		}
	})
}

// StartTCP runs TCP scenario and emits progress for each completed step.
func (s *Service) StartTCP(planPath string, _ TCPStartConfig) (string, error) {
	return s.startRun("tcp", func(ctx context.Context, run *runState) (interface{}, error) {
		sc, err := tcp.LoadScenario(planPath)
		if err != nil {
			return nil, err
		}
		res, err := tcp.Run(ctx, sc)
		for i, st := range res.Steps {
			s.emitProgress(run.id, "tcp", i+1, len(res.Steps), st.Kind, b2i(st.Err == ""), b2i(st.Err != ""))
		}
		return res, err
	})
}

// startRun registers and executes one asynchronous run.
//
// Java analogy: this is similar to a @Async orchestration method with an in-memory run registry.
func (s *Service) startRun(typ string, fn func(context.Context, *runState) (interface{}, error)) (string, error) {
	s.mu.Lock()
	if s.active != nil {
		s.active.cancel()
	}
	id := fmt.Sprintf("run-%d", s.runSeq.Add(1))
	ctx, cancel := context.WithCancel(context.Background())
	run := &runState{id: id, typ: typ, ctx: ctx, cancel: cancel, started: s.clk.Now(), status: "running"}
	s.runs[id] = run
	s.active = run
	s.mu.Unlock()

	go func() {
		res, err := fn(ctx, run)

		s.mu.Lock()
		defer s.mu.Unlock()

		run.ended = s.clk.Now()
		run.result = res
		run.err = err
		if errors.Is(err, context.Canceled) {
			run.status = "canceled"
		} else if err != nil {
			run.status = "failed"
		} else {
			run.status = "completed"
		}
		if s.active != nil && s.active.id == run.id {
			s.active = nil
		}

		dto := ResultDTO{
			RunID:     run.id,
			Type:      run.typ,
			Status:    run.status,
			StartedAt: run.started,
			EndedAt:   run.ended,
			Data:      run.result,
		}
		if err != nil {
			dto.Error = err.Error()
		}
		dto.Summary = fmt.Sprintf("%s %s", run.typ, run.status)
		s.history = append([]ResultDTO{dto}, s.history...)
		s.emitDone(run.id, run.status, dto.Summary)
	}()

	return id, nil
}

// CancelRun requests cancellation for a run id.
func (s *Service) CancelRun(runID string) bool {
	s.mu.RLock()
	run, ok := s.runs[runID]
	s.mu.RUnlock()
	if !ok {
		return false
	}
	run.cancel()
	return true
}

// GetRunResult returns current snapshot of one run record.
func (s *Service) GetRunResult(runID string) (ResultDTO, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	run, ok := s.runs[runID]
	if !ok {
		return ResultDTO{}, errors.New("run not found")
	}
	dto := ResultDTO{
		RunID:     run.id,
		Type:      run.typ,
		Status:    run.status,
		StartedAt: run.started,
		EndedAt:   run.ended,
		Data:      run.result,
	}
	if run.err != nil {
		dto.Error = run.err.Error()
	}
	dto.Summary = fmt.Sprintf("%s %s", run.typ, run.status)
	return dto, nil
}

// ListHistory returns newest-first immutable copy of run results.
func (s *Service) ListHistory() []ResultDTO {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]ResultDTO(nil), s.history...)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}
