package wailsapp

// MockRoute is the desktop bridge representation of one deterministic mock
// response.
type MockRoute struct {
	ID      string            `json:"id"`
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body"`
	DelayMS int               `json:"delayMs"`
	Enabled bool              `json:"enabled"`
}

type MockHit struct {
	ID         uint64            `json:"id"`
	RouteID    string            `json:"routeId,omitempty"`
	Method     string            `json:"method"`
	Path       string            `json:"path"`
	RawQuery   string            `json:"rawQuery,omitempty"`
	Status     int               `json:"status"`
	Matched    bool              `json:"matched"`
	PathParams map[string]string `json:"pathParams,omitempty"`
	Timestamp  string            `json:"timestamp"`
	DurationMS int64             `json:"durationMs"`
}

type MockServerState struct {
	Running      bool   `json:"running"`
	Host         string `json:"host"`
	Port         int    `json:"port"`
	BaseURL      string `json:"baseUrl"`
	RouteCount   int    `json:"routeCount"`
	EnabledCount int    `json:"enabledCount"`
	HitCount     int    `json:"hitCount"`
	TotalHits    uint64 `json:"totalHits"`
	StartedAt    string `json:"startedAt,omitempty"`
	LastError    string `json:"lastError,omitempty"`
}

type MockServerSnapshot struct {
	State        MockServerState `json:"state"`
	Routes       []MockRoute     `json:"routes"`
	Hits         []MockHit       `json:"hits"`
	ImportedPath string          `json:"importedPath,omitempty"`
	Canceled     bool            `json:"canceled"`
	Error        *UserError      `json:"error,omitempty"`
}

type MockStartInput struct {
	Port       int  `json:"port"`
	EnableCORS bool `json:"enableCors"`
}

type SSEInput struct {
	OperationID        string            `json:"operationId"`
	URL                string            `json:"url"`
	Headers            map[string]string `json:"headers"`
	TimeoutMS          int               `json:"timeoutMs"`
	MaxEvents          int               `json:"maxEvents"`
	InsecureSkipVerify bool              `json:"insecureSkipVerify"`
}

type SSEEvent struct {
	Event       string `json:"event"`
	ID          string `json:"id"`
	Data        string `json:"data"`
	RetryMillis int64  `json:"retryMillis"`
	HasRetry    bool   `json:"hasRetry"`
}

type SSEResult struct {
	StatusCode int                 `json:"statusCode"`
	Headers    map[string][]string `json:"headers"`
	Events     []SSEEvent          `json:"events"`
	DurationMS int64               `json:"durationMs"`
	Error      *UserError          `json:"error,omitempty"`
}

type WebSocketMessage struct {
	Type      string `json:"type"`
	Data      string `json:"data"`
	Encoding  string `json:"encoding,omitempty"`
	SizeBytes int64  `json:"sizeBytes"`
}

type WebSocketInput struct {
	OperationID        string             `json:"operationId"`
	URL                string             `json:"url"`
	Headers            map[string]string  `json:"headers"`
	Subprotocols       []string           `json:"subprotocols"`
	Send               []WebSocketMessage `json:"send"`
	TimeoutMS          int                `json:"timeoutMs"`
	MaxMessages        int                `json:"maxMessages"`
	InsecureSkipVerify bool               `json:"insecureSkipVerify"`
}

type WebSocketResult struct {
	StatusCode int                 `json:"statusCode"`
	Headers    map[string][]string `json:"headers"`
	Protocol   string              `json:"protocol"`
	Messages   []WebSocketMessage  `json:"messages"`
	DurationMS int64               `json:"durationMs"`
	Error      *UserError          `json:"error,omitempty"`
}

type GRPCInput struct {
	OperationID        string            `json:"operationId"`
	Address            string            `json:"address"`
	Metadata           map[string]string `json:"metadata"`
	TimeoutMS          int               `json:"timeoutMs"`
	UseTLS             bool              `json:"useTLS"`
	ServerName         string            `json:"serverName"`
	InsecureSkipVerify bool              `json:"insecureSkipVerify"`
}

type GRPCResult struct {
	Services          []string   `json:"services"`
	ReflectionVersion string     `json:"reflectionVersion"`
	ConnectionState   string     `json:"connectionState"`
	DurationMS        int64      `json:"durationMs"`
	Error             *UserError `json:"error,omitempty"`
}

type ActuatorMetricSample struct {
	Name          string              `json:"name"`
	Description   string              `json:"description,omitempty"`
	BaseUnit      string              `json:"baseUnit,omitempty"`
	Measurements  map[string]float64  `json:"measurements"`
	AvailableTags []ActuatorMetricTag `json:"availableTags,omitempty"`
}

type ActuatorMetricTag struct {
	Tag    string   `json:"tag"`
	Values []string `json:"values"`
}

type ActuatorMetricSnapshot struct {
	CapturedAt string                          `json:"capturedAt"`
	Metrics    map[string]ActuatorMetricSample `json:"metrics"`
	Failures   map[string]string               `json:"failures,omitempty"`
}

type ActuatorMetricDelta struct {
	Metric        string   `json:"metric"`
	Statistic     string   `json:"statistic"`
	Before        *float64 `json:"before,omitempty"`
	After         *float64 `json:"after,omitempty"`
	Delta         *float64 `json:"delta,omitempty"`
	PercentChange *float64 `json:"percentChange,omitempty"`
}

type ActuatorHealth struct {
	Status     string         `json:"status"`
	Components map[string]any `json:"components,omitempty"`
	Groups     []string       `json:"groups,omitempty"`
	Data       map[string]any `json:"data"`
}

type ActuatorMappings struct {
	Contexts map[string]any `json:"contexts,omitempty"`
	Data     map[string]any `json:"data"`
}

type ActuatorInspectInput struct {
	BaseURL         string                  `json:"baseUrl"`
	Headers         map[string]string       `json:"headers"`
	TimeoutMS       int                     `json:"timeoutMs"`
	MetricNames     []string                `json:"metricNames"`
	IncludeMappings bool                    `json:"includeMappings"`
	Before          *ActuatorMetricSnapshot `json:"before,omitempty"`
}

type ActuatorInspectResult struct {
	Health   *ActuatorHealth        `json:"health,omitempty"`
	Mappings *ActuatorMappings      `json:"mappings,omitempty"`
	Metrics  ActuatorMetricSnapshot `json:"metrics"`
	Deltas   []ActuatorMetricDelta  `json:"deltas"`
	Error    *UserError             `json:"error,omitempty"`
}

type EnvironmentTarget struct {
	Name    string `json:"name"`
	BaseURL string `json:"baseUrl"`
}

type EnvironmentCompareInput struct {
	Method          string              `json:"method"`
	Path            string              `json:"path"`
	Headers         map[string][]string `json:"headers"`
	Body            string              `json:"body"`
	Targets         []EnvironmentTarget `json:"targets"`
	IgnoreJSONPaths []string            `json:"ignoreJsonPaths"`
	IgnoreHeaders   []string            `json:"ignoreHeaders"`
	AllowUnsafe     bool                `json:"allowUnsafe"`
	TimeoutMS       int                 `json:"timeoutMs"`
}

type EnvironmentResponse struct {
	Name        string              `json:"name"`
	URL         string              `json:"url"`
	StatusCode  int                 `json:"statusCode"`
	DurationMS  int64               `json:"durationMs"`
	Headers     map[string][]string `json:"headers,omitempty"`
	Body        string              `json:"body,omitempty"`
	ContentType string              `json:"contentType,omitempty"`
	Truncated   bool                `json:"truncated"`
	Error       string              `json:"error,omitempty"`
}

type EnvironmentJSONDifference struct {
	Path      string `json:"path"`
	Kind      string `json:"kind"`
	Baseline  any    `json:"baseline,omitempty"`
	Candidate any    `json:"candidate,omitempty"`
}

type EnvironmentDiff struct {
	Baseline                   string                      `json:"baseline"`
	Candidate                  string                      `json:"candidate"`
	StatusMatch                bool                        `json:"statusMatch"`
	BaselineStatus             int                         `json:"baselineStatus"`
	CandidateStatus            int                         `json:"candidateStatus"`
	HeaderDifferences          []string                    `json:"headerDifferences,omitempty"`
	HeaderDifferencesTruncated bool                        `json:"headerDifferencesTruncated"`
	BodyEqual                  bool                        `json:"bodyEqual"`
	BodyMode                   string                      `json:"bodyMode"`
	JSONDifferences            []EnvironmentJSONDifference `json:"jsonDifferences,omitempty"`
	JSONDifferencesTruncated   bool                        `json:"jsonDifferencesTruncated"`
	Error                      string                      `json:"error,omitempty"`
}

type EnvironmentCompareResult struct {
	Method      string                `json:"method"`
	Path        string                `json:"path"`
	Responses   []EnvironmentResponse `json:"responses"`
	Comparisons []EnvironmentDiff     `json:"comparisons"`
	Error       *UserError            `json:"error,omitempty"`
}

type ThreadDumpInput struct {
	Text string `json:"text"`
}

type ThreadIssue struct {
	Name  string   `json:"name"`
	State string   `json:"state"`
	Clues []string `json:"clues,omitempty"`
}

type RepeatedStack struct {
	Count   int      `json:"count"`
	Frames  []string `json:"frames"`
	Threads []string `json:"threads"`
}

type ThreadDumpResult struct {
	ThreadCount      int             `json:"threadCount"`
	StateCounts      map[string]int  `json:"stateCounts"`
	BlockedThreads   []ThreadIssue   `json:"blockedThreads,omitempty"`
	DeadlockDetected bool            `json:"deadlockDetected"`
	DeadlockClues    []string        `json:"deadlockClues,omitempty"`
	RepeatedStacks   []RepeatedStack `json:"repeatedStacks,omitempty"`
	Truncated        bool            `json:"truncated"`
	Error            *UserError      `json:"error,omitempty"`
}

type LogSearchInput struct {
	Text          string `json:"text"`
	Query         string `json:"query"`
	CaseSensitive bool   `json:"caseSensitive"`
}

type LogMatch struct {
	LineNumber int    `json:"lineNumber"`
	Line       string `json:"line"`
}

type LogSearchResult struct {
	Query        string     `json:"query"`
	Matches      []LogMatch `json:"matches"`
	ScannedLines int        `json:"scannedLines"`
	Truncated    bool       `json:"truncated"`
	Error        *UserError `json:"error,omitempty"`
}

type KnownEndpoint struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

type ObservedCall struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	Count  int    `json:"count"`
}

type CoverageInput struct {
	Known    []KnownEndpoint `json:"known"`
	Observed []ObservedCall  `json:"observed"`
}

type EndpointCoverage struct {
	Method        string   `json:"method"`
	Path          string   `json:"path"`
	HitCount      int      `json:"hitCount"`
	ObservedPaths []string `json:"observedPaths,omitempty"`
}

type CoverageResult struct {
	TotalKnown      int                `json:"totalKnown"`
	Covered         int                `json:"covered"`
	CoveragePercent float64            `json:"coveragePercent"`
	Endpoints       []EndpointCoverage `json:"endpoints"`
	UnknownObserved []ObservedCall     `json:"unknownObserved,omitempty"`
	Error           *UserError         `json:"error,omitempty"`
}
