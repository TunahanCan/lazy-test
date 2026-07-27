package wailsapp

// KeyValue preserves header order and allows repeated header names.
type KeyValue struct {
	Enabled     bool   `json:"enabled"`
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description,omitempty"`
	Source      string `json:"source,omitempty"`
}

type RequestInput struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Method      string            `json:"method"`
	URL         string            `json:"url"`
	Headers     []KeyValue        `json:"headers"`
	Body        string            `json:"body"`
	Variables   map[string]string `json:"variables"`
	TimeoutMS   int               `json:"timeoutMs"`
	SaveHistory bool              `json:"saveHistory"`
}

type TimelinePhase struct {
	ID          string  `json:"id"`
	Label       string  `json:"label"`
	DurationMS  float64 `json:"durationMs"`
	Percent     float64 `json:"percent"`
	Description string  `json:"description,omitempty"`
}

type ResponseEnvelope struct {
	RequestID   string              `json:"requestId"`
	StatusCode  int                 `json:"statusCode"`
	Status      string              `json:"status"`
	DurationMS  int64               `json:"durationMs"`
	SizeBytes   int64               `json:"sizeBytes"`
	ContentType string              `json:"contentType"`
	Protocol    string              `json:"protocol"`
	RemoteAddr  string              `json:"remoteAddr"`
	TLS         string              `json:"tls"`
	TraceID     string              `json:"traceId"`
	Headers     map[string][]string `json:"headers"`
	Cookies     []ResponseCookie    `json:"cookies"`
	Body        string              `json:"body"`
	RawBody     string              `json:"rawBody"`
	Timeline    []TimelinePhase     `json:"timeline"`
	ResolvedURL string              `json:"resolvedUrl"`
}

type ResponseCookie struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Path     string `json:"path"`
	Domain   string `json:"domain"`
	Expires  string `json:"expires,omitempty"`
	HTTPOnly bool   `json:"httpOnly"`
	Secure   bool   `json:"secure"`
}

type UserError struct {
	Code      string `json:"code"`
	Title     string `json:"title"`
	Message   string `json:"message"`
	Hint      string `json:"hint,omitempty"`
	Technical string `json:"technical,omitempty"`
}

type SendResult struct {
	Response *ResponseEnvelope `json:"response,omitempty"`
	Error    *UserError        `json:"error,omitempty"`
}

type CollectionNode struct {
	ID       string `json:"id"`
	ParentID string `json:"parentId,omitempty"`
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	Method   string `json:"method,omitempty"`
	URL      string `json:"url,omitempty"`
	Depth    int    `json:"depth"`
	Expanded bool   `json:"expanded,omitempty"`
	Favorite bool   `json:"favorite,omitempty"`
}

type EnvironmentSummary struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Variables map[string]string `json:"variables"`
}

type HistoryEntry struct {
	ID             string `json:"id"`
	RequestName    string `json:"requestName"`
	Method         string `json:"method"`
	URL            string `json:"url"`
	StatusCode     int    `json:"statusCode"`
	DurationMS     int64  `json:"durationMs"`
	Environment    string `json:"environment"`
	CreatedAt      string `json:"createdAt"`
	AssertionsOK   bool   `json:"assertionsOk"`
	TraceID        string `json:"traceId,omitempty"`
	ResolvedValues int    `json:"resolvedValues"`
}

type BootstrapData struct {
	AppVersion      string               `json:"appVersion"`
	WorkspaceID     string               `json:"workspaceId"`
	WorkspaceName   string               `json:"workspaceName"`
	Environments    []EnvironmentSummary `json:"environments"`
	Collections     []CollectionNode     `json:"collections"`
	History         []HistoryEntry       `json:"history"`
	RecentURLs      []string             `json:"recentUrls"`
	OnboardingSteps []string             `json:"onboardingSteps"`
}

type ImportedEndpoint struct {
	ID      string   `json:"id"`
	Method  string   `json:"method"`
	Path    string   `json:"path"`
	Summary string   `json:"summary"`
	Tags    []string `json:"tags"`
}

type ImportSpecResult struct {
	Path      string             `json:"path"`
	Title     string             `json:"title"`
	Version   string             `json:"version"`
	Endpoints []ImportedEndpoint `json:"endpoints"`
	Canceled  bool               `json:"canceled"`
	Error     *UserError         `json:"error,omitempty"`
}

type GeneratedFile struct {
	Name         string `json:"name"`
	RelativePath string `json:"relativePath"`
	Content      string `json:"content"`
}

type SaveGeneratedFileInput struct {
	SuggestedName string `json:"suggestedName"`
	Content       string `json:"content"`
}

type ExportGeneratedProjectInput struct {
	ProjectName string          `json:"projectName"`
	Files       []GeneratedFile `json:"files"`
}

type FileWriteResult struct {
	Path     string     `json:"path"`
	Count    int        `json:"count"`
	Canceled bool       `json:"canceled"`
	Error    *UserError `json:"error,omitempty"`
}
