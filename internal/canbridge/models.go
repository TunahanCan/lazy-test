package canbridge

// KeyValue preserves editor order and repeated header values. The shared
// net/http executor preserves value order for a canonical name, but does not
// promise global wire order across different header names.
type KeyValue struct {
	Enabled     bool   `json:"enabled"`
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description,omitempty"`
	Source      string `json:"source,omitempty"`
}

type RequestInput struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Method        string            `json:"method"`
	URL           string            `json:"url"`
	Headers       []KeyValue        `json:"headers"`
	Body          string            `json:"body"`
	Variables     map[string]string `json:"variables"`
	LiteralValues bool              `json:"literalValues"`
	TimeoutMS     int               `json:"timeoutMs"`
	SaveHistory   bool              `json:"saveHistory"`
}

type TimelinePhase struct {
	ID          string  `json:"id"`
	Label       string  `json:"label"`
	DurationMS  float64 `json:"durationMs"`
	Percent     float64 `json:"percent"`
	Description string  `json:"description,omitempty"`
}

// ResponseBodyEncoding describes how Body and RawBody are represented in the
// JSON bridge envelope. Binary bytes use base64 so JSON marshaling cannot
// replace invalid UTF-8 sequences.
type ResponseBodyEncoding string

const (
	ResponseBodyUTF8   ResponseBodyEncoding = "utf8"
	ResponseBodyBase64 ResponseBodyEncoding = "base64"
)

type ResponseEnvelope struct {
	RequestID    string               `json:"requestId"`
	StatusCode   int                  `json:"statusCode"`
	Status       string               `json:"status"`
	DurationMS   int64                `json:"durationMs"`
	SizeBytes    int64                `json:"sizeBytes"`
	ContentType  string               `json:"contentType"`
	Protocol     string               `json:"protocol"`
	RemoteAddr   string               `json:"remoteAddr"`
	TLS          string               `json:"tls"`
	TraceID      string               `json:"traceId"`
	Headers      map[string][]string  `json:"headers"`
	Cookies      []ResponseCookie     `json:"cookies"`
	Body         string               `json:"body"`
	RawBody      string               `json:"rawBody,omitempty"`
	BodyEncoding ResponseBodyEncoding `json:"bodyEncoding"`
	Timeline     []TimelinePhase      `json:"timeline"`
	ResolvedURL  string               `json:"resolvedUrl"`
	Contract     *ContractCheckResult `json:"contract,omitempty"`
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

// UserErrorCode is the stable machine-readable category used by frontend
// branching. Human-readable fallback text may change; these wire values must
// remain backward compatible.
type UserErrorCode string

const (
	UserErrorInvalidRequest             UserErrorCode = "invalid_request"
	UserErrorMissingVariables           UserErrorCode = "missing_variables"
	UserErrorRequestAlreadyRunning      UserErrorCode = "request_already_running"
	UserErrorRequestCanceled            UserErrorCode = "request_canceled"
	UserErrorRequestTimeout             UserErrorCode = "request_timeout"
	UserErrorRequestFailed              UserErrorCode = "request_failed"
	UserErrorNetwork                    UserErrorCode = "network_error"
	UserErrorResponseTooLarge           UserErrorCode = "response_too_large"
	UserErrorResponseHeadersTooLarge    UserErrorCode = "response_headers_too_large"
	UserErrorUnsupportedEncoding        UserErrorCode = "unsupported_content_encoding"
	UserErrorTooManyEncodings           UserErrorCode = "too_many_content_encodings"
	UserErrorResponseDecodeFailed       UserErrorCode = "response_decode_failed"
	UserErrorRuntimeUnavailable         UserErrorCode = "runtime_unavailable"
	UserErrorFileDialogFailed           UserErrorCode = "file_dialog_failed"
	UserErrorInvalidOpenAPI             UserErrorCode = "invalid_openapi"
	UserErrorOperationCanceled          UserErrorCode = "operation_canceled"
	UserErrorSpecUnavailable            UserErrorCode = "spec_unavailable"
	UserErrorResponseSchemaUnavailable  UserErrorCode = "response_schema_unavailable"
	UserErrorOperationUnavailable       UserErrorCode = "operation_unavailable"
	UserErrorMockRoutesInvalid          UserErrorCode = "mock_routes_invalid"
	UserErrorMockAlreadyRunning         UserErrorCode = "mock_already_running"
	UserErrorMockStartFailed            UserErrorCode = "mock_start_failed"
	UserErrorMockStopFailed             UserErrorCode = "mock_stop_failed"
	UserErrorToolCanceled               UserErrorCode = "tool_canceled"
	UserErrorToolTimeout                UserErrorCode = "tool_timeout"
	UserErrorInvalidInput               UserErrorCode = "invalid_input"
	UserErrorDiagnosticFailed           UserErrorCode = "diagnostic_failed"
	UserErrorCollectionOperationInvalid UserErrorCode = "collection_operation_invalid"
	UserErrorCollectionInvalid          UserErrorCode = "collection_invalid"
	UserErrorCollectionRunFailed        UserErrorCode = "collection_run_failed"
	UserErrorCollectionFileInvalid      UserErrorCode = "collection_file_invalid"
	UserErrorCollectionFileReadFailed   UserErrorCode = "collection_file_read_failed"
	UserErrorCollectionFileWriteFailed  UserErrorCode = "collection_file_write_failed"
	UserErrorNetworkOperationInvalid    UserErrorCode = "network_operation_invalid"
	UserErrorNetworkInspectionFailed    UserErrorCode = "network_inspection_failed"
	UserErrorOpenAPILintFailed          UserErrorCode = "openapi_lint_failed"
	UserErrorSSEFailed                  UserErrorCode = "sse_failed"
	UserErrorCoverageSpecMissing        UserErrorCode = "coverage_spec_missing"
	UserErrorBodyEncodingInvalid        UserErrorCode = "response_body_encoding_invalid"
)

type UserError struct {
	Code       UserErrorCode   `json:"code"`
	MessageKey string          `json:"messageKey,omitempty"`
	Params     UserErrorParams `json:"params,omitempty"`
	Title      string          `json:"title"`
	Message    string          `json:"message"`
	Hint       string          `json:"hint,omitempty"`
	Technical  string          `json:"technical,omitempty"`
}

// UserErrorParams carries non-sensitive values used by locale-specific
// renderers. Values deliberately remain strings so the desktop wire contract
// is predictable across Go and JavaScript runtimes.
type UserErrorParams map[string]string

type SendResult struct {
	Response *ResponseEnvelope `json:"response,omitempty"`
	Error    *UserError        `json:"error,omitempty"`
}

type CollectionFileImportResult struct {
	Data     string     `json:"data"`
	Path     string     `json:"path"`
	Canceled bool       `json:"canceled"`
	Error    *UserError `json:"error,omitempty"`
}

type CollectionFileExportInput struct {
	Data          string `json:"data"`
	SuggestedName string `json:"suggestedName"`
}

type CollectionFileExportResult struct {
	Path     string     `json:"path"`
	Exported bool       `json:"exported"`
	Canceled bool       `json:"canceled"`
	Error    *UserError `json:"error,omitempty"`
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
	SpecID    string             `json:"specId"`
	Path      string             `json:"path"`
	Title     string             `json:"title"`
	Version   string             `json:"version"`
	BaseURL   string             `json:"baseUrl"`
	Endpoints []ImportedEndpoint `json:"endpoints"`
	Canceled  bool               `json:"canceled"`
	Error     *UserError         `json:"error,omitempty"`
}

type ContractCheckInput struct {
	SpecID       string               `json:"specId"`
	Method       string               `json:"method"`
	Path         string               `json:"path"`
	StatusCode   int                  `json:"statusCode"`
	ContentType  string               `json:"contentType"`
	Body         string               `json:"body"`
	BodyEncoding ResponseBodyEncoding `json:"bodyEncoding,omitempty"`
}

type ContractFinding struct {
	Path     string   `json:"path"`
	Type     string   `json:"type"`
	Expected string   `json:"expected,omitempty"`
	Actual   string   `json:"actual,omitempty"`
	Allowed  []string `json:"allowed,omitempty"`
}

type ContractCheckResult struct {
	Available bool              `json:"available"`
	OK        bool              `json:"ok"`
	Truncated bool              `json:"truncated"`
	Method    string            `json:"method"`
	Path      string            `json:"path"`
	Findings  []ContractFinding `json:"findings"`
	Error     *UserError        `json:"error,omitempty"`
}
