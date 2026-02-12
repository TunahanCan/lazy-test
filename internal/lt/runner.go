package lt

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// RunConfig configures the LT run (warm-up, error budget, etc.).
type RunConfig struct {
	WarmUpDuration time.Duration
	MaxErrorPct    float64 // stop if error rate > this (0 = disabled)
	MaxP95Ms       int64   // stop if p95 > this (0 = disabled)
	HTTPTimeout    time.Duration
	MaxIdleConns   int
	IdleConnTimeout time.Duration
}

// DefaultRunConfig returns a default RunConfig.
func DefaultRunConfig() RunConfig {
	return RunConfig{
		WarmUpDuration:  30 * time.Second,
		HTTPTimeout:     10 * time.Second,
		MaxIdleConns:    100,
		IdleConnTimeout: 90 * time.Second,
	}
}

// Runner runs a Taurus plan (single-node, goroutine VUs).
type Runner struct {
	Plan   *Plan
	Config RunConfig
	Metrics *Metrics
}

// Run executes the plan until context is cancelled or hold-for elapses. Metrics are recorded.
func (r *Runner) Run(ctx context.Context) error {
	if r.Plan == nil || len(r.Plan.Execution) == 0 {
		return fmt.Errorf("no execution blocks")
	}
	rampUp, _ := parseDuration(r.Plan.Execution[0].RampUp)
	holdFor, _ := parseDuration(r.Plan.Execution[0].HoldFor)
	if holdFor <= 0 {
		holdFor = 5 * time.Minute
	}
	concurrency := r.Plan.Execution[0].Concurrency
	if concurrency <= 0 {
		concurrency = 1
	}
	scenarioName := r.Plan.Execution[0].Scenario
	sc, ok := r.Plan.Scenarios[scenarioName]
	if !ok {
		return fmt.Errorf("scenario %q not found", scenarioName)
	}
	r.Metrics = NewMetrics(r.Config.WarmUpDuration)
	baseURL := strings.TrimSuffix(sc.BaseURL, "/")
	client := &http.Client{
		Timeout: r.Config.HTTPTimeout,
		Transport: &http.Transport{
			MaxIdleConns:    r.Config.MaxIdleConns,
			IdleConnTimeout: r.Config.IdleConnTimeout,
		},
	}
	stopAt := time.Now().Add(holdFor)
	var wg sync.WaitGroup
	for v := 0; v < concurrency; v++ {
		wg.Add(1)
		go func(vuId int) {
			defer wg.Done()
			vars := make(map[string]string)
			for time.Now().Before(stopAt) {
				select {
				case <-ctx.Done():
					return
				default:
				}
				for i := range sc.Requests {
					req := &sc.Requests[i]
					resolvedURL := ResolveVars(req.URL, vars)
					var urlStr string
					if strings.HasPrefix(resolvedURL, "http") {
						urlStr = resolvedURL
					} else {
						urlStr = baseURL + "/" + strings.TrimPrefix(resolvedURL, "/")
					}
					bodyStr := ResolveVars(req.Body, vars)
					var body io.Reader
					if bodyStr != "" {
						body = strings.NewReader(bodyStr)
					}
					httpReq, err := http.NewRequest(req.Method, urlStr, body)
					if err != nil {
						r.Metrics.Record(0, false, 0)
						continue
					}
					for k, v := range sc.Headers {
						httpReq.Header.Set(k, ResolveVars(v, vars))
					}
					for k, v := range req.Headers {
						httpReq.Header.Set(k, ResolveVars(v, vars))
					}
					if body != nil {
						httpReq.Header.Set("Content-Type", "application/json")
					}
					start := time.Now()
					resp, err := client.Do(httpReq)
					latencyMS := time.Since(start).Milliseconds()
					if err != nil {
						r.Metrics.Record(latencyMS, false, 0)
						continue
					}
					bodyBytes, _ := io.ReadAll(resp.Body)
					resp.Body.Close()
					ok := true
					for _, a := range req.Assertions {
						if a.StatusCode != nil && *a.StatusCode != resp.StatusCode {
							ok = false
							break
						}
					}
					if ok && len(bodyBytes) > 0 {
						for _, ex := range req.ExtractJSONPath {
							val := extractJSONPath(bodyBytes, ex.JSONPath)
							if val != "" {
								vars[ex.Variable] = val
							}
						}
					}
					if time.Now().Before(r.Metrics.WarmUpEnd) {
						// warm-up: don't record
					} else {
						r.Metrics.Record(latencyMS, ok && resp.StatusCode >= 200 && resp.StatusCode < 400, resp.StatusCode)
					}
					// Think time
					think := parseThinkTime(sc.ThinkTime)
					if think > 0 {
						time.Sleep(think)
					}
				}
			}
		}(v)
		// Ramp-up: stagger start
		if rampUp > 0 && v < concurrency-1 {
			time.Sleep(rampUp / time.Duration(concurrency))
		}
	}
	wg.Wait()
	r.Metrics.SetEnd(time.Now())
	return nil
}

func parseDuration(s string) (time.Duration, error) {
	if s == "" {
		return 0, nil
	}
	return time.ParseDuration(s)
}

func parseThinkTime(t ThinkTime) time.Duration {
	if t.Constant != "" {
		d, _ := time.ParseDuration(strings.TrimSpace(t.Constant))
		return d
	}
	return 0
}

// extractJSONPath returns a simple path value from JSON (e.g. "$.token" -> value).
func extractJSONPath(data []byte, path string) string {
	path = strings.TrimPrefix(path, "$.")
	path = strings.TrimPrefix(path, "$")
	path = strings.Trim(path, ".")
	if path == "" {
		return ""
	}
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		return ""
	}
	parts := strings.Split(path, ".")
	v := interface{}(m)
	for _, p := range parts {
		if m2, ok := v.(map[string]interface{}); ok {
			v = m2[p]
		} else {
			return ""
		}
	}
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(x)
	default:
		b, _ := json.Marshal(v)
		return string(b)
	}
}
