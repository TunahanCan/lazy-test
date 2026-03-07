package appsvc

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"lazytest/internal/config"
	"lazytest/internal/core"
	"lazytest/internal/lt"
	"lazytest/internal/report"
	"lazytest/internal/tcp"
)

type fakeClock struct{ t time.Time }

func (f fakeClock) Now() time.Time { return f.t }

type sink struct{}

func (sink) Progress(RunProgressEvent) {}
func (sink) Metrics(RunMetricsEvent)   {}
func (sink) Log(RunLogEvent)           {}
func (sink) Done(RunDoneEvent)         {}

func TestLoadSpecValidInvalid(t *testing.T) {
	s := NewService(filepath.Join(t.TempDir(), "ws.json"), sink{})
	if _, err := s.LoadSpec("../../openapi.sample.yaml"); err != nil {
		t.Fatalf("valid spec: %v", err)
	}
	if _, err := s.LoadSpec("missing.yaml"); err == nil {
		t.Fatalf("expected invalid")
	}
}

func TestSendRequest(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Test", "ok")
		w.WriteHeader(201)
		w.Write([]byte(`{"a":1}`))
	}))
	defer ts.Close()
	s := NewService("", sink{})
	res, err := s.SendRequest(RequestDTO{Method: http.MethodGet, URL: ts.URL, Headers: map[string]string{"Accept": "application/json"}})
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != 201 || len(res.Headers["X-Test"]) == 0 || res.Headers["X-Test"][0] != "ok" {
		t.Fatalf("unexpected response: %+v", res)
	}
}

func TestSmokeRuleAndCancel(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/bad" {
			w.WriteHeader(404)
			return
		}
		w.WriteHeader(200)
	}))
	defer ts.Close()
	svc := NewService("", sink{})
	svc.endpoints = []core.Endpoint{{Method: "GET", Path: "/ok"}, {Method: "GET", Path: "/bad"}}
	svc.byID = map[string]core.Endpoint{"GET /ok": svc.endpoints[0], "GET /bad": svc.endpoints[1]}
	id, err := svc.StartSmoke(SmokeStartConfig{RunAll: true, Workers: 1, RateLimit: 50}, "", "", ts.URL)
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	res, _ := svc.GetRunResult(id)
	if res.Status == "failed" {
		t.Fatalf("unexpected fail: %+v", res)
	}

	id2, _ := svc.StartSmoke(SmokeStartConfig{RunAll: true, Workers: 1, RateLimit: 1}, "", "", ts.URL)
	_ = svc.CancelRun(id2)
	time.Sleep(50 * time.Millisecond)
	res2, _ := svc.GetRunResult(id2)
	if res2.Status != "canceled" && res2.Status != "completed" {
		t.Fatalf("status %s", res2.Status)
	}
}

func TestDriftCompare(t *testing.T) {
	spec := `openapi: 3.0.3
info: {title: t, version: "1"}
paths:
  /x:
    get:
      operationId: getX
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
                required: [name,status]
                properties:
                  name: {type: string}
                  status: {type: string, enum: [ok]}
`
	d := t.TempDir()
	sp := filepath.Join(d, "o.yaml")
	os.WriteFile(sp, []byte(spec), 0644)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"name":1,"status":"bad","extra":true}`))
	}))
	defer ts.Close()
	s := NewService("", sink{})
	if _, err := s.LoadSpec(sp); err != nil {
		t.Fatal(err)
	}
	id, err := s.StartDrift(DriftStartConfig{EndpointID: "getX"}, "", "", ts.URL)
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	res, _ := s.GetRunResult(id)
	if res.Status == "failed" {
		t.Fatalf("drift run failed: %+v", res)
	}

	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Header().Set("A", "1"); w.Write([]byte(`{"v":1}`)) }))
	defer a.Close()
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("B", "1")
		w.WriteHeader(201)
		w.Write([]byte(`{"v":2}`))
	}))
	defer b.Close()
	s.envCfg = &config.EnvConfig{Environments: []config.Environment{{Name: "a", BaseURL: a.URL}, {Name: "b", BaseURL: b.URL}}}
	cid, err := s.StartCompare(CompareStartConfig{EndpointID: "getX", EnvA: "a", EnvB: "b"})
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	cr, _ := s.GetRunResult(cid)
	if cr.Status == "failed" {
		t.Fatalf("compare failed: %+v", cr)
	}
}

func TestLTMetricsAndThreshold(t *testing.T) {
	m := lt.NewMetrics(0)
	m.Record(10, true, 200)
	m.Record(120, false, 500)
	s := m.Snapshot()
	if s.P95 == 0 || s.RPS <= 0 {
		t.Fatalf("bad snapshot: %+v", s)
	}
	e, p := s.ThresholdCheck(10, 50)
	if !e || !p {
		t.Fatalf("expected threshold violation")
	}
}

func TestTCPRetryBreakerAndAssertionClass(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func(conn net.Conn) {
				defer conn.Close()
				buf := make([]byte, 64)
				conn.Read(buf)
				conn.Write([]byte("NOPE"))
			}(c)
		}
	}()
	s := tcp.Scenario{Name: "t"}
	s.Target.Host = "127.0.0.1"
	s.Target.Port = ln.Addr().(*net.TCPAddr).Port
	s.Options.Retry.MaxAttempts = 2
	s.Options.Retry.Strategy = "exponential"
	s.Options.Retry.BaseMs = 10
	s.Options.Breaker.Failures = 1
	s.Steps = []tcp.Step{{Kind: "connect"}, {Kind: "write", Write: &struct {
		Bytes  []byte "yaml:\"bytes,omitempty\""
		Base64 string "yaml:\"base64,omitempty\""
		Hex    string "yaml:\"hex,omitempty\""
	}{Bytes: []byte("PING")}}, {Kind: "read", Read: &struct {
		Until     string      "yaml:\"until,omitempty\""
		Size      int         "yaml:\"size,omitempty\""
		TimeoutMs int         "yaml:\"timeout_ms,omitempty\""
		Assert    *tcp.Assert "yaml:\"assert,omitempty\""
	}{Size: 4, Assert: &tcp.Assert{Contains: "PONG"}}}}
	res, _ := tcp.Run(context.Background(), s)
	if res.OK {
		t.Fatalf("expected failure")
	}
	if len(res.Steps) == 0 || res.Steps[len(res.Steps)-1].ErrorClass == "" {
		t.Fatalf("expected error class")
	}
}

func TestReportExportAndWorkspaceRoundTrip(t *testing.T) {
	d := t.TempDir()
	smoke := []core.SmokeResult{{Path: "/x", Method: "GET", OK: true}}
	if err := report.WriteJUnitSmoke(filepath.Join(d, "junit.xml"), smoke, time.Second); err != nil {
		t.Fatal(err)
	}
	if err := report.WriteJSON(filepath.Join(d, "out.json"), report.SmokeReportFromResults(smoke, time.Second)); err != nil {
		t.Fatal(err)
	}
	svc := NewService(filepath.Join(d, "ws.json"), sink{})
	ws := Workspace{SpecPath: "a", EnvPath: "b", AuthPath: "c", BaseURL: "http://x"}
	if err := svc.SaveWorkspace(ws); err != nil {
		t.Fatal(err)
	}
	got, err := svc.LoadWorkspace()
	if err != nil {
		t.Fatal(err)
	}
	if got.SpecPath != ws.SpecPath || got.BaseURL != ws.BaseURL {
		t.Fatalf("roundtrip mismatch")
	}
}
