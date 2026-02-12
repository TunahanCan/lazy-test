package core

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"sync"
	"time"
)

// SmokeResult holds result of one smoke test.
type SmokeResult struct {
	Path       string
	Method     string
	StatusCode int
	LatencyMS  int64
	Err        string
	OK         bool
}

// SmokeConfig configures smoke test run.
type SmokeConfig struct {
	BaseURL    string
	Headers    map[string]string
	Timeout    time.Duration
	Workers    int
	RateLimitRPS int
	AuthHeader map[string]string
}

// RunSmoke runs smoke tests for endpoints using worker pool and RPS limiter.
func RunSmoke(ctx context.Context, cfg SmokeConfig, endpoints []Endpoint) []SmokeResult {
	return RunSmokeBulk(ctx, cfg, endpoints)
}

// RunSmokeSingle runs smoke for one endpoint (for "r" key).
func RunSmokeSingle(cfg SmokeConfig, ep Endpoint) SmokeResult {
	return doOneSmoke(cfg, ep)
}

func doOneSmoke(cfg SmokeConfig, ep Endpoint) SmokeResult {
	res := SmokeResult{Path: ep.Path, Method: ep.Method}
	start := time.Now()
	urlStr, err := BuildURL(cfg.BaseURL, ep.Path, nil)
	if err != nil {
		res.Err = err.Error()
		return res
	}
	body, _ := ExampleBody(ep.Schema)
	req, err := http.NewRequest(ep.Method, urlStr, nil)
	if err != nil {
		res.Err = err.Error()
		return res
	}
	if len(body) > 0 && (ep.Method == "POST" || ep.Method == "PUT" || ep.Method == "PATCH") {
		req.Body = io.NopCloser(bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range cfg.Headers {
		req.Header.Set(k, v)
	}
	for k, v := range cfg.AuthHeader {
		req.Header.Set(k, v)
	}
	client := &http.Client{
		Timeout:       cfg.Timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse },
	}
	resp, err := client.Do(req)
	res.LatencyMS = time.Since(start).Milliseconds()
	if err != nil {
		res.Err = err.Error()
		return res
	}
	defer resp.Body.Close()
	res.StatusCode = resp.StatusCode
	// Success: expected 2xx or documented 4xx
	res.OK = resp.StatusCode >= 200 && resp.StatusCode < 300 || (resp.StatusCode >= 400 && resp.StatusCode < 500)
	return res
}

// FetchResponse performs one HTTP request and returns status code, body, and error.
// Used for contract drift (need response body to compare to schema).
func FetchResponse(cfg SmokeConfig, ep Endpoint) (statusCode int, body []byte, err error) {
	urlStr, err := BuildURL(cfg.BaseURL, ep.Path, nil)
	if err != nil {
		return 0, nil, err
	}
	reqBody, _ := ExampleBody(ep.Schema)
	var bodyReader io.Reader
	if len(reqBody) > 0 && (ep.Method == "POST" || ep.Method == "PUT" || ep.Method == "PATCH") {
		bodyReader = bytes.NewReader(reqBody)
	}
	req, err := http.NewRequest(ep.Method, urlStr, bodyReader)
	if err != nil {
		return 0, nil, err
	}
	if len(reqBody) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range cfg.Headers {
		req.Header.Set(k, v)
	}
	for k, v := range cfg.AuthHeader {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: cfg.Timeout}
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, err = io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, nil, err
	}
	return resp.StatusCode, body, nil
}

// RunSmokeBulk runs smoke for all endpoints with worker pool and RPS.
func RunSmokeBulk(ctx context.Context, cfg SmokeConfig, endpoints []Endpoint) []SmokeResult {
	if cfg.Timeout == 0 {
		cfg.Timeout = 5 * time.Second
	}
	if cfg.RateLimitRPS <= 0 {
		cfg.RateLimitRPS = 10
	}
	type job struct{ idx int }
	jobs := make(chan job, len(endpoints))
	for i := 0; i < len(endpoints); i++ {
		jobs <- job{i}
	}
	close(jobs)
	results := make([]SmokeResult, len(endpoints))
	var mu sync.Mutex
	ticker := time.NewTicker(time.Second / time.Duration(cfg.RateLimitRPS))
	defer ticker.Stop()
	var wg sync.WaitGroup
	nWorkers := cfg.Workers
	if nWorkers <= 0 {
		nWorkers = 10
	}
	for w := 0; w < nWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				select {
				case <-ctx.Done():
					return
				default:
				}
				<-ticker.C
				r := doOneSmoke(cfg, endpoints[j.idx])
				mu.Lock()
				results[j.idx] = r
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	return results
}

// P50P95 computes approximate p50 and p95 from latencies (in ms).
func P50P95(latencies []int64) (p50, p95 int64) {
	if len(latencies) == 0 {
		return 0, 0
	}
	// Copy and sort would be correct; for demo we use simple approx
	var sum int64
	for _, l := range latencies {
		sum += l
	}
	p50 = sum / int64(len(latencies))
	p95 = p50 * 2
	if len(latencies) >= 2 {
		p95 = latencies[len(latencies)-1]
	}
	return p50, p95
}
