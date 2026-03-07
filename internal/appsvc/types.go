package appsvc

import "time"

type SpecSummary struct {
	Title          string   `json:"title"`
	Version        string   `json:"version"`
	EndpointCount  int      `json:"endpointCount"`
	EndpointsCount int      `json:"endpointsCount"`
	TagCount       int      `json:"tagCount"`
	Tags           []string `json:"tags"`
}

type EndpointDTO struct {
	ID          string   `json:"id"`
	Method      string   `json:"method"`
	Path        string   `json:"path"`
	Summary     string   `json:"summary"`
	OperationID string   `json:"operationID"`
	Tags        []string `json:"tags"`
}

type RequestDTO struct {
	EndpointID string            `json:"endpointID"`
	Method     string            `json:"method"`
	URL        string            `json:"url"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	TimeoutMS  int               `json:"timeoutMs,omitempty"`
}

type ResponseDTO struct {
	StatusCode int                 `json:"statusCode"`
	Status     int                 `json:"status"`
	Headers    map[string][]string `json:"headers"`
	Body       string              `json:"body"`
	LatencyMS  int64               `json:"latencyMS"`
	Error      string              `json:"error,omitempty"`
	Err        string              `json:"err,omitempty"`
}

type EndpointFilter struct {
	Query  string `json:"query"`
	Tag    string `json:"tag"`
	Method string `json:"method"`
}

type SmokeStartConfig struct {
	EndpointIDs []string `json:"endpointIDs"`
	RunAll      bool     `json:"runAll"`
	Workers     int      `json:"workers"`
	RateLimit   int      `json:"rateLimit"`
	TimeoutMS   int      `json:"timeoutMS"`
	ExportDir   string   `json:"exportDir"`
}

type DriftStartConfig struct {
	EndpointID string `json:"endpointID"`
	TimeoutMS  int    `json:"timeoutMS"`
	ExportDir  string `json:"exportDir"`
}

type CompareStartConfig struct {
	EndpointID string `json:"endpointID"`
	EnvA       string `json:"envA"`
	EnvB       string `json:"envB"`
	OnlyDiff   bool   `json:"onlyDiff"`
	TimeoutMS  int    `json:"timeoutMS"`
}

type LTStartConfig struct {
	MaxErrorPct float64 `json:"maxErrorPct"`
	MaxP95Ms    int64   `json:"maxP95Ms"`
}

type TCPStartConfig struct{}

type ResultDTO struct {
	RunID     string      `json:"runID"`
	Type      string      `json:"type"`
	Status    string      `json:"status"`
	Summary   string      `json:"summary"`
	StartedAt time.Time   `json:"startedAt"`
	EndedAt   time.Time   `json:"endedAt"`
	Data      interface{} `json:"data,omitempty"`
	Error     string      `json:"error,omitempty"`
}

type Workspace struct {
	Version       int    `json:"version"`
	SpecPath      string `json:"specPath"`
	EnvPath       string `json:"envPath"`
	AuthPath      string `json:"authPath"`
	EnvName       string `json:"envName"`
	AuthProfile   string `json:"authProfile"`
	BaseURL       string `json:"baseURL"`
	TokenAlias    string `json:"tokenAlias,omitempty"`
	UpdatedAtUnix int64  `json:"updatedAtUnix"`
}

type RunProgressEvent struct {
	RunID       string `json:"runID"`
	Phase       string `json:"phase"`
	Done        int    `json:"done"`
	Total       int    `json:"total"`
	CurrentItem string `json:"currentItem"`
	OKCount     int    `json:"okCount"`
	ErrCount    int    `json:"errCount"`
}

type RunMetricsSnapshot struct {
	P95       int64          `json:"p95"`
	RPS       float64        `json:"rps"`
	ErrorRate float64        `json:"errorRate"`
	Statuses  map[int]int    `json:"statuses"`
	Time      time.Time      `json:"time"`
	Extra     map[string]any `json:"extra,omitempty"`
}

type RunMetricsEvent struct {
	RunID    string             `json:"runID"`
	Snapshot RunMetricsSnapshot `json:"snapshot"`
}

type RunLogEvent struct {
	RunID string `json:"runID"`
	Level string `json:"level"`
	Msg   string `json:"msg"`
}

type RunDoneEvent struct {
	RunID         string `json:"runID"`
	Status        string `json:"status"`
	ResultSummary string `json:"resultSummary"`
}

type RunEventSink interface {
	Progress(RunProgressEvent)
	Metrics(RunMetricsEvent)
	Log(RunLogEvent)
	Done(RunDoneEvent)
}
