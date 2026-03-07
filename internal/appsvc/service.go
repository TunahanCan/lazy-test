package appsvc

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"lazytest/internal/config"
	"lazytest/internal/core"
	"lazytest/internal/lt"
	"lazytest/internal/report"
	"lazytest/internal/tcp"

	"github.com/getkin/kin-openapi/openapi3"
)

type clock interface{ Now() time.Time }
type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

type Service struct {
	mu        sync.RWMutex
	specPath  string
	docTitle  string
	docVer    string
	endpoints []core.Endpoint
	byID      map[string]core.Endpoint
	envCfg    *config.EnvConfig
	authCfg   *config.AuthConfig
	wsPath    string
	sink      RunEventSink
	clk       clock
	runs      map[string]*runState
	active    *runState
	runSeq    atomic.Int64
	history   []ResultDTO
}

type runState struct {
	id      string
	typ     string
	ctx     context.Context
	cancel  context.CancelFunc
	started time.Time
	ended   time.Time
	status  string
	result  interface{}
	err     error
}

func NewService(workspaceFile string, sink RunEventSink) *Service {
	if workspaceFile == "" {
		home, _ := os.UserHomeDir()
		workspaceFile = filepath.Join(home, ".lazytest", "workspace.json")
	}
	return &Service{wsPath: workspaceFile, sink: sink, clk: realClock{}, byID: map[string]core.Endpoint{}, runs: map[string]*runState{}}
}

func (s *Service) LoadSpec(filePath string) (SpecSummary, error) {
	eps, doc, err := core.LoadOpenAPI(filePath)
	if err != nil {
		return SpecSummary{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.specPath = filePath
	s.endpoints = eps
	s.byID = map[string]core.Endpoint{}
	tags := map[string]struct{}{}
	for _, ep := range eps {
		id := endpointID(ep)
		s.byID[id] = ep
		for _, t := range ep.Tags {
			tags[t] = struct{}{}
		}
	}
	var tagList []string
	for t := range tags {
		tagList = append(tagList, t)
	}
	sort.Strings(tagList)
	if doc != nil && doc.Info != nil {
		s.docTitle = doc.Info.Title
		s.docVer = doc.Info.Version
	}
	return SpecSummary{
		Title:          s.docTitle,
		Version:        s.docVer,
		EndpointCount:  len(eps),
		EndpointsCount: len(eps),
		TagCount:       len(tagList),
		Tags:           tagList,
	}, nil
}

func endpointID(ep core.Endpoint) string {
	if ep.OperationID != "" {
		return ep.OperationID
	}
	return strings.ToUpper(ep.Method) + " " + ep.Path
}

func (s *Service) ListEndpoints(filter EndpointFilter) []EndpointDTO {
	s.mu.RLock()
	defer s.mu.RUnlock()
	query := strings.ToLower(strings.TrimSpace(filter.Query))
	var out []EndpointDTO
	for _, ep := range s.endpoints {
		id := endpointID(ep)
		if filter.Tag != "" && !contains(ep.Tags, filter.Tag) {
			continue
		}
		if filter.Method != "" && !strings.EqualFold(ep.Method, filter.Method) {
			continue
		}
		if query != "" {
			h := strings.ToLower(ep.Summary + " " + ep.Path + " " + ep.OperationID)
			if !strings.Contains(h, query) {
				continue
			}
		}
		out = append(out, EndpointDTO{ID: id, Method: ep.Method, Path: ep.Path, Summary: ep.Summary, OperationID: ep.OperationID, Tags: ep.Tags})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Path == out[j].Path {
			return out[i].Method < out[j].Method
		}
		return out[i].Path < out[j].Path
	})
	return out
}

func contains(s []string, x string) bool {
	for _, v := range s {
		if v == x {
			return true
		}
	}
	return false
}

func (s *Service) BuildExampleRequest(endpointID, envName, authProfile string, overrides map[string]string) (RequestDTO, error) {
	s.mu.RLock()
	ep, ok := s.byID[endpointID]
	s.mu.RUnlock()
	if !ok {
		return RequestDTO{}, fmt.Errorf("endpoint not found: %s", endpointID)
	}
	baseURL, headers, authHeader := s.resolveContext(envName, authProfile)
	if v := overrides["baseURL"]; v != "" {
		baseURL = v
	}
	urlStr, err := core.BuildURL(baseURL, ep.Path, nil)
	if err != nil {
		return RequestDTO{}, err
	}
	body, _ := core.ExampleBody(ep.Schema)
	merged := map[string]string{}
	for k, v := range headers {
		merged[k] = v
	}
	for k, v := range authHeader {
		merged[k] = v
	}
	return RequestDTO{EndpointID: endpointID, Method: ep.Method, URL: urlStr, Headers: merged, Body: string(body)}, nil
}

func (s *Service) resolveContext(envName, authProfile string) (string, map[string]string, map[string]string) {
	base := ""
	headers := map[string]string{}
	authHeader := map[string]string{}
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.envCfg != nil {
		if env := s.envCfg.GetEnvironment(envName); env != nil {
			base = env.BaseURL
			for k, v := range env.Headers {
				headers[k] = v
			}
		}
	}
	if s.authCfg != nil {
		if p := s.authCfg.GetAuthProfile(authProfile); p != nil {
			if p.Type == "jwt" && p.Token != "" {
				authHeader["Authorization"] = "Bearer " + p.Token
			}
			if p.Type == "apikey" && p.Header != "" && p.Key != "" {
				authHeader[p.Header] = p.Key
			}
		}
	}
	return base, headers, authHeader
}

func (s *Service) SendRequest(req RequestDTO) (ResponseDTO, error) {
	start := s.clk.Now()
	var body io.Reader
	if req.Body != "" && (req.Method == http.MethodPost || req.Method == http.MethodPut || req.Method == http.MethodPatch) {
		body = bytes.NewReader([]byte(req.Body))
	}
	hreq, err := http.NewRequest(req.Method, req.URL, body)
	if err != nil {
		return ResponseDTO{}, err
	}
	for k, v := range req.Headers {
		hreq.Header.Set(k, v)
	}
	timeout := 15 * time.Second
	if req.TimeoutMS > 0 {
		timeout = time.Duration(req.TimeoutMS) * time.Millisecond
	}
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(hreq)
	if err != nil {
		lat := s.clk.Now().Sub(start).Milliseconds()
		return ResponseDTO{Error: err.Error(), Err: err.Error(), LatencyMS: lat}, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	pretty := string(b)
	if json.Valid(b) {
		var tmp interface{}
		_ = json.Unmarshal(b, &tmp)
		pb, _ := json.MarshalIndent(tmp, "", "  ")
		pretty = string(pb)
	}
	h := map[string][]string{}
	for k, v := range resp.Header {
		h[k] = append([]string(nil), v...)
	}
	lat := s.clk.Now().Sub(start).Milliseconds()
	return ResponseDTO{
		StatusCode: resp.StatusCode,
		Status:     resp.StatusCode,
		Headers:    h,
		Body:       pretty,
		LatencyMS:  lat,
	}, nil
}

func (s *Service) LoadConfigs(envPath, authPath string) error {
	if envPath != "" {
		e, err := config.LoadEnvConfig(envPath)
		if err != nil {
			return err
		}
		s.envCfg = e
	}
	if authPath != "" {
		a, err := config.LoadAuthConfig(authPath)
		if err != nil {
			return err
		}
		s.authCfg = a
	}
	return nil
}

func (s *Service) StartSmoke(cfg SmokeStartConfig, envName, authProfile, baseOverride string) (string, error) {
	startFn := func(ctx context.Context, run *runState) (interface{}, error) {
		s.mu.RLock()
		eps := append([]core.Endpoint(nil), s.endpoints...)
		s.mu.RUnlock()
		if !cfg.RunAll && len(cfg.EndpointIDs) > 0 {
			selected := []core.Endpoint{}
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
		scfg := core.SmokeConfig{BaseURL: base, Headers: headers, AuthHeader: authHeader, Workers: cfg.Workers, RateLimitRPS: cfg.RateLimit, Timeout: time.Duration(max(cfg.TimeoutMS, 5000)) * time.Millisecond}
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

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

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
		scfg := core.SmokeConfig{BaseURL: base, Headers: headers, AuthHeader: authHeader, Timeout: time.Duration(max(cfg.TimeoutMS, 5000)) * time.Millisecond}
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

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

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
		dto := ResultDTO{RunID: run.id, Type: run.typ, Status: run.status, StartedAt: run.started, EndedAt: run.ended, Data: run.result}
		if err != nil {
			dto.Error = err.Error()
		}
		dto.Summary = fmt.Sprintf("%s %s", run.typ, run.status)
		s.history = append([]ResultDTO{dto}, s.history...)
		s.emitDone(run.id, run.status, dto.Summary)
	}()
	return id, nil
}

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

func (s *Service) GetRunResult(runID string) (ResultDTO, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	run, ok := s.runs[runID]
	if !ok {
		return ResultDTO{}, errors.New("run not found")
	}
	dto := ResultDTO{RunID: run.id, Type: run.typ, Status: run.status, StartedAt: run.started, EndedAt: run.ended, Data: run.result}
	if run.err != nil {
		dto.Error = run.err.Error()
	}
	dto.Summary = fmt.Sprintf("%s %s", run.typ, run.status)
	return dto, nil
}

func (s *Service) ListHistory() []ResultDTO {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]ResultDTO(nil), s.history...)
}

func (s *Service) SaveWorkspace(ws Workspace) error {
	if ws.Version == 0 {
		ws.Version = 1
	}
	ws.UpdatedAtUnix = s.clk.Now().Unix()
	b, err := json.MarshalIndent(ws, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.wsPath), 0755); err != nil {
		return err
	}
	return os.WriteFile(s.wsPath, b, 0600)
}

func (s *Service) LoadWorkspace() (Workspace, error) {
	b, err := os.ReadFile(s.wsPath)
	if err != nil {
		return Workspace{}, err
	}
	var ws Workspace
	if err := json.Unmarshal(b, &ws); err != nil {
		return Workspace{}, err
	}
	if ws.Version == 0 {
		ws.Version = 1
	}
	return ws, nil
}

func (s *Service) emitProgress(runID, phase string, done, total int, item string, okCount, errCount int) {
	if s.sink != nil {
		s.sink.Progress(RunProgressEvent{RunID: runID, Phase: phase, Done: done, Total: total, CurrentItem: item, OKCount: okCount, ErrCount: errCount})
	}
}
func (s *Service) emitMetrics(runID string, snap lt.Snapshot) {
	if s.sink != nil {
		s.sink.Metrics(RunMetricsEvent{RunID: runID, Snapshot: RunMetricsSnapshot{P95: snap.P95, RPS: snap.RPS, ErrorRate: snap.ErrorRatePct, Statuses: snap.StatusDist, Time: s.clk.Now()}})
	}
}
func (s *Service) emitDone(runID, status, summary string) {
	if s.sink != nil {
		s.sink.Done(RunDoneEvent{RunID: runID, Status: status, ResultSummary: summary})
	}
}
