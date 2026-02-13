package tcp

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"regexp"
	"strings"
	"time"
)

type Scenario struct {
	Kind   string `yaml:"kind,omitempty"`
	Name   string `yaml:"name"`
	Target struct {
		Host        string `yaml:"host"`
		Port        int    `yaml:"port"`
		NoDelay     bool   `yaml:"nodelay"`
		KeepAliveMs int    `yaml:"keepalive_ms"`
	} `yaml:",inline"`
	Options struct {
		TimeoutMs     int `yaml:"timeout_ms"`
		DialTimeoutMs int `yaml:"dial_timeout_ms"`
		Retry         struct {
			MaxAttempts int    `yaml:"max_attempts"`
			Strategy    string `yaml:"strategy"`
			BaseMs      int    `yaml:"base_ms"`
			MaxMs       int    `yaml:"max_ms"`
		} `yaml:"retry"`
		Breaker struct {
			WindowSec int `yaml:"window_sec"`
			Failures  int `yaml:"failures"`
			HalfOpen  int `yaml:"half_open"`
		} `yaml:"breaker"`
	} `yaml:"options"`
	Steps []Step `yaml:"steps"`
}

type Step struct {
	Kind  string `yaml:"kind"`
	Write *struct {
		Bytes  []byte `yaml:"bytes,omitempty"`
		Base64 string `yaml:"base64,omitempty"`
		Hex    string `yaml:"hex,omitempty"`
	} `yaml:"write,omitempty"`
	Read *struct {
		Until     string  `yaml:"until,omitempty"`
		Size      int     `yaml:"size,omitempty"`
		TimeoutMs int     `yaml:"timeout_ms,omitempty"`
		Assert    *Assert `yaml:"assert,omitempty"`
	} `yaml:"read,omitempty"`
	SleepMs int `yaml:"sleep_ms,omitempty"`
}

type Assert struct {
	Contains string  `yaml:"contains,omitempty"`
	Regex    string  `yaml:"regex,omitempty"`
	Not      *Assert `yaml:"not,omitempty"`
	LenRange *struct {
		Min int `yaml:"min"`
		Max int `yaml:"max"`
	} `yaml:"len_range,omitempty"`
	JSONPath string `yaml:"jsonpath,omitempty"`
	JMESPath string `yaml:"jmespath,omitempty"`
}

type StepResult struct {
	Index      int           `json:"index"`
	Kind       string        `json:"kind"`
	Latency    time.Duration `json:"latency_ns"`
	BytesRead  int           `json:"bytes_read,omitempty"`
	BytesWrite int           `json:"bytes_write,omitempty"`
	Hexdump    string        `json:"hexdump,omitempty"`
	Err        string        `json:"err,omitempty"`
	ErrorClass string        `json:"error_class,omitempty"`
}
type Result struct {
	PlanName     string        `json:"plan_name"`
	OK           bool          `json:"ok"`
	Attempts     int           `json:"attempts"`
	Duration     time.Duration `json:"duration_ns"`
	Steps        []StepResult  `json:"steps"`
	BreakerState string        `json:"breaker_state,omitempty"`
}

type CircuitBreaker struct {
	failures  int
	threshold int
	open      bool
}

func NewBreaker(s Scenario) *CircuitBreaker {
	return &CircuitBreaker{threshold: max(1, s.Options.Breaker.Failures)}
}
func (b *CircuitBreaker) Allow() bool { return !b.open }
func (b *CircuitBreaker) Record(err error) {
	if err != nil {
		b.failures++
		if b.failures >= b.threshold {
			b.open = true
		}
	} else {
		b.failures = 0
	}
}
func (b *CircuitBreaker) State() string {
	if b.open {
		return "open"
	}
	return "closed"
}

func Run(ctx context.Context, s Scenario) (Result, error) {
	res := Result{PlanName: s.Name, OK: true}
	start := time.Now()
	attempts := max(1, s.Options.Retry.MaxAttempts)
	breaker := NewBreaker(s)
	var final error
	for i := 0; i < attempts; i++ {
		if !breaker.Allow() {
			final = errors.New("circuit breaker open")
			break
		}
		steps, err := runOnce(ctx, s)
		res.Steps = steps
		breaker.Record(err)
		res.Attempts = i + 1
		if err == nil {
			final = nil
			break
		}
		final = err
		if i < attempts-1 {
			time.Sleep(backoffDelay(s, i))
		}
	}
	if final != nil {
		res.OK = false
	}
	res.Duration = time.Since(start)
	res.BreakerState = breaker.State()
	return res, final
}

func backoffDelay(s Scenario, attempt int) time.Duration {
	base := durationMs(s.Options.Retry.BaseMs, 100)
	switch strings.ToLower(s.Options.Retry.Strategy) {
	case "constant":
		return base
	case "exponential":
		d := base * time.Duration(1<<attempt)
		mx := durationMs(s.Options.Retry.MaxMs, 2000)
		if d > mx {
			d = mx
		}
		return d
	default:
		return 0
	}
}

func runOnce(ctx context.Context, s Scenario) ([]StepResult, error) {
	_ = ctx
	var conn net.Conn
	out := make([]StepResult, 0, len(s.Steps))
	dialer := net.Dialer{Timeout: durationMs(s.Options.DialTimeoutMs, 2000)}
	for i, stp := range s.Steps {
		sr := StepResult{Index: i, Kind: stp.Kind}
		st := time.Now()
		switch stp.Kind {
		case "connect":
			c, err := dialer.Dial("tcp", fmt.Sprintf("%s:%d", s.Target.Host, s.Target.Port))
			if err != nil {
				sr.Err = err.Error()
				sr.ErrorClass = classifyErr(err)
				sr.Latency = time.Since(st)
				out = append(out, sr)
				return out, err
			}
			conn = c
			if tc, ok := conn.(*net.TCPConn); ok {
				_ = tc.SetKeepAlive(s.Target.KeepAliveMs > 0)
				if s.Target.KeepAliveMs > 0 {
					_ = tc.SetKeepAlivePeriod(time.Duration(s.Target.KeepAliveMs) * time.Millisecond)
				}
				if s.Target.NoDelay {
					_ = tc.SetNoDelay(true)
				}
			}
		case "write":
			if conn == nil {
				return append(out, sr), errors.New("write before connect")
			}
			p, err := decodeWrite(stp)
			if err != nil {
				return append(out, sr), err
			}
			_ = conn.SetWriteDeadline(time.Now().Add(durationMs(s.Options.TimeoutMs, 1500)))
			n, err := conn.Write(p)
			sr.BytesWrite = n
			if err != nil {
				sr.Err = err.Error()
				sr.ErrorClass = classifyErr(err)
				sr.Latency = time.Since(st)
				out = append(out, sr)
				return out, err
			}
		case "read":
			if conn == nil {
				return append(out, sr), errors.New("read before connect")
			}
			r := bufio.NewReader(conn)
			tmo := durationMs(s.Options.TimeoutMs, 1500)
			if stp.Read != nil && stp.Read.TimeoutMs > 0 {
				tmo = time.Duration(stp.Read.TimeoutMs) * time.Millisecond
			}
			_ = conn.SetReadDeadline(time.Now().Add(tmo))
			b, err := readBytes(r, stp.Read)
			sr.BytesRead = len(b)
			sr.Hexdump = hexDump(b, 64)
			if err != nil {
				sr.Err = err.Error()
				sr.ErrorClass = classifyErr(err)
				sr.Latency = time.Since(st)
				out = append(out, sr)
				return out, err
			}
			if stp.Read != nil && stp.Read.Assert != nil {
				if err := EvaluateAssert(*stp.Read.Assert, b); err != nil {
					sr.Err = err.Error()
					sr.ErrorClass = "assert_failed"
					sr.Latency = time.Since(st)
					out = append(out, sr)
					return out, err
				}
			}
		case "sleep":
			time.Sleep(time.Duration(stp.SleepMs) * time.Millisecond)
		case "close":
			if conn != nil {
				_ = conn.Close()
				conn = nil
			}
		}
		sr.Latency = time.Since(st)
		out = append(out, sr)
	}
	if conn != nil {
		_ = conn.Close()
	}
	return out, nil
}

func decodeWrite(step Step) ([]byte, error) {
	if step.Write == nil {
		return nil, nil
	}
	if len(step.Write.Bytes) > 0 {
		return step.Write.Bytes, nil
	}
	if step.Write.Base64 != "" {
		return base64.StdEncoding.DecodeString(step.Write.Base64)
	}
	if step.Write.Hex != "" {
		return hex.DecodeString(strings.TrimSpace(step.Write.Hex))
	}
	return nil, nil
}
func readBytes(r *bufio.Reader, cfg *struct {
	Until     string  `yaml:"until,omitempty"`
	Size      int     `yaml:"size,omitempty"`
	TimeoutMs int     `yaml:"timeout_ms,omitempty"`
	Assert    *Assert `yaml:"assert,omitempty"`
}) ([]byte, error) {
	if cfg == nil {
		return r.ReadBytes('\n')
	}
	if cfg.Until != "" {
		return r.ReadBytes(cfg.Until[0])
	}
	if cfg.Size > 0 {
		buf := make([]byte, cfg.Size)
		_, err := r.Read(buf)
		return buf, err
	}
	return r.ReadBytes('\n')
}
func EvaluateAssert(a Assert, body []byte) error {
	s := string(body)
	if a.Contains != "" && !strings.Contains(s, a.Contains) {
		return fmt.Errorf("contains assertion failed")
	}
	if a.Regex != "" {
		re, err := regexp.Compile(a.Regex)
		if err != nil {
			return err
		}
		if !re.Match(body) {
			return fmt.Errorf("regex assertion failed")
		}
	}
	if a.LenRange != nil {
		l := len(body)
		if l < a.LenRange.Min || l > a.LenRange.Max {
			return fmt.Errorf("len assertion failed")
		}
	}
	if a.JSONPath != "" {
		v, err := lookupJSONPath(body, a.JSONPath)
		if err != nil || v == nil {
			return fmt.Errorf("jsonpath assertion failed")
		}
	}
	if a.JMESPath != "" {
		v, err := lookupJSONPath(body, "$."+a.JMESPath)
		if err != nil || v == nil {
			return fmt.Errorf("jmespath assertion failed")
		}
	}
	if a.Not != nil {
		if err := EvaluateAssert(*a.Not, body); err == nil {
			return fmt.Errorf("not assertion failed")
		}
	}
	return nil
}
func lookupJSONPath(body []byte, path string) (any, error) {
	var doc any
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, err
	}
	path = strings.TrimPrefix(strings.TrimPrefix(path, "$"), ".")
	cur := doc
	for _, p := range strings.Split(path, ".") {
		if p == "" {
			continue
		}
		name := p
		idx := -1
		if strings.Contains(p, "[") && strings.HasSuffix(p, "]") {
			name = p[:strings.Index(p, "[")]
			fmt.Sscanf(p[strings.Index(p, "[")+1:len(p)-1], "%d", &idx)
		}
		if name != "" {
			m, ok := cur.(map[string]any)
			if !ok {
				return nil, fmt.Errorf("segment")
			}
			cur = m[name]
		}
		if idx >= 0 {
			arr, ok := cur.([]any)
			if !ok || idx >= len(arr) {
				return nil, fmt.Errorf("index")
			}
			cur = arr[idx]
		}
	}
	return cur, nil
}
func durationMs(v, d int) time.Duration {
	if v <= 0 {
		v = d
	}
	return time.Duration(v) * time.Millisecond
}
func classifyErr(err error) string {
	if err == nil {
		return ""
	}
	if ne, ok := err.(net.Error); ok && ne.Timeout() {
		return "read_timeout"
	}
	e := strings.ToLower(err.Error())
	if strings.Contains(e, "dial") || strings.Contains(e, "i/o timeout") {
		return "dial_timeout"
	}
	if strings.Contains(e, "broken pipe") {
		return "write_timeout"
	}
	if errors.Is(err, net.ErrClosed) {
		return "unexpected_close"
	}
	return "error"
}
func hexDump(b []byte, n int) string {
	if len(b) > n {
		b = b[:n]
	}
	return hex.EncodeToString(b)
}
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
