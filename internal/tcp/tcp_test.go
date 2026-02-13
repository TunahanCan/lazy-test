package tcp

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"testing"
)

func startDummy(t *testing.T) (string, func()) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func(conn net.Conn) {
				defer conn.Close()
				_, _ = conn.Write([]byte("BANNER\n"))
				r := bufio.NewReader(conn)
				for {
					line, err := r.ReadBytes('\n')
					if err != nil {
						return
					}
					_, _ = conn.Write(line)
				}
			}(c)
		}
	}()
	return ln.Addr().String(), func() { _ = ln.Close() }
}

func TestRunSuccess(t *testing.T) {
	addr, stop := startDummy(t)
	defer stop()
	host, portStr, _ := net.SplitHostPort(addr)
	var port int
	_, _ = fmt.Sscanf(portStr, "%d", &port)
	var s Scenario
	s.Name = "ok"
	s.Target.Host = host
	s.Target.Port = port
	s.Options.TimeoutMs = 500
	s.Steps = []Step{
		{Kind: "connect"},
		{Kind: "read", Read: &struct {
			Until     string  `yaml:"until,omitempty"`
			Size      int     `yaml:"size,omitempty"`
			TimeoutMs int     `yaml:"timeout_ms,omitempty"`
			Assert    *Assert `yaml:"assert,omitempty"`
		}{Until: "\n", Assert: &Assert{Contains: "BANNER"}}},
		{Kind: "write", Write: &struct {
			Bytes  []byte `yaml:"bytes,omitempty"`
			Base64 string `yaml:"base64,omitempty"`
			Hex    string `yaml:"hex,omitempty"`
		}{Bytes: []byte("PING\n")}},
		{Kind: "read", Read: &struct {
			Until     string  `yaml:"until,omitempty"`
			Size      int     `yaml:"size,omitempty"`
			TimeoutMs int     `yaml:"timeout_ms,omitempty"`
			Assert    *Assert `yaml:"assert,omitempty"`
		}{Until: "\n", Assert: &Assert{Regex: "PING"}}},
		{Kind: "close"},
	}
	res, err := Run(context.Background(), s)
	if err != nil {
		t.Fatal(err)
	}
	if !res.OK {
		t.Fatal("expected ok")
	}
}

func TestEvaluateAssertJSON(t *testing.T) {
	body := []byte(`{"a":{"b":[{"name":"x"}]},"items":[1,2,3]}`)
	if err := EvaluateAssert(Assert{JSONPath: "$.a.b[0].name"}, body); err != nil {
		t.Fatal(err)
	}
	if err := EvaluateAssert(Assert{JMESPath: "a.b[0].name"}, body); err != nil {
		t.Fatal(err)
	}
	if err := EvaluateAssert(Assert{LenRange: &struct {
		Min int `yaml:"min"`
		Max int `yaml:"max"`
	}{Min: 1, Max: 200}}, body); err != nil {
		t.Fatal(err)
	}
	if err := EvaluateAssert(Assert{Not: &Assert{Contains: "zzz"}}, body); err != nil {
		t.Fatal(err)
	}
}

func TestDialTimeout(t *testing.T) {
	var s Scenario
	s.Name = "timeout"
	s.Target.Host = "10.255.255.1"
	s.Target.Port = 65000
	s.Options.DialTimeoutMs = 50
	s.Options.Retry.MaxAttempts = 1
	s.Steps = []Step{{Kind: "connect"}}
	_, err := Run(context.Background(), s)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestBreaker(t *testing.T) {
	var s Scenario
	s.Options.Breaker.Failures = 1
	br := NewBreaker(s)
	br.Record(context.DeadlineExceeded)
	if br.State() == "closed" {
		t.Fatal("expected open")
	}
}
