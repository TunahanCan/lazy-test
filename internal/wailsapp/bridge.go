//go:build wails

// Package wailsapp exposes the typed application boundary consumed by the Wails frontend.
package wailsapp

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	neturl "net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"validex/internal/core"
	"validex/internal/mockserver"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var variablePattern = regexp.MustCompile(`\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}`)

const (
	maxHTTPResponseBodyBytes   = int64(16 << 20)
	maxCachedOpenAPISpecs      = 8
	maxObservedCoverageEntries = 10_000
)

type toolOperation struct {
	cancel context.CancelFunc
}

type requestOperation struct {
	cancel context.CancelFunc
}

type Bridge struct {
	mu              sync.Mutex
	ctx             context.Context
	lifecycleCtx    context.Context
	lifecycleCancel context.CancelFunc
	cancels         map[string]*requestOperation
	toolCancels     map[string]*toolOperation
	specs           map[string][]core.Endpoint
	specOrder       []string
	mock            *mockserver.Server
	observed        map[string]int
	observedOrder   []string
	observedNext    int
}

func NewBridge() *Bridge {
	lifecycleCtx, lifecycleCancel := context.WithCancel(context.Background())
	return &Bridge{
		lifecycleCtx:    lifecycleCtx,
		lifecycleCancel: lifecycleCancel,
		cancels:         map[string]*requestOperation{},
		toolCancels:     map[string]*toolOperation{},
		specs:           map[string][]core.Endpoint{},
		specOrder:       make([]string, 0, maxCachedOpenAPISpecs),
		mock:            mockserver.New(mockserver.Options{}),
		observed:        map[string]int{},
		observedOrder:   make([]string, 0, maxObservedCoverageEntries),
	}
}

func Startup(b *Bridge) func(context.Context) {
	return func(ctx context.Context) {
		if ctx == nil {
			ctx = context.Background()
		}
		b.mu.Lock()
		previousCancel := b.lifecycleCancel
		b.ctx = ctx
		b.lifecycleCtx, b.lifecycleCancel = context.WithCancel(ctx)
		b.mu.Unlock()
		if previousCancel != nil {
			previousCancel()
		}
	}
}

func Shutdown(b *Bridge) func(context.Context) {
	return func(shutdownCtx context.Context) {
		b.mu.Lock()
		lifecycleCancel := b.lifecycleCancel
		requestCancels := make([]context.CancelFunc, 0, len(b.cancels))
		for _, operation := range b.cancels {
			requestCancels = append(requestCancels, operation.cancel)
		}
		toolCancels := make([]context.CancelFunc, 0, len(b.toolCancels))
		for _, operation := range b.toolCancels {
			toolCancels = append(toolCancels, operation.cancel)
		}
		b.ctx = nil
		b.cancels = map[string]*requestOperation{}
		b.toolCancels = map[string]*toolOperation{}
		mock := b.mock
		b.mu.Unlock()

		if lifecycleCancel != nil {
			lifecycleCancel()
		}
		for _, cancel := range requestCancels {
			cancel()
		}
		for _, cancel := range toolCancels {
			cancel()
		}
		if mock != nil {
			if shutdownCtx == nil {
				shutdownCtx = context.Background()
			}
			ctx, cancel := context.WithTimeout(shutdownCtx, 3*time.Second)
			defer cancel()
			_ = mock.Stop(ctx)
		}
	}
}

func (b *Bridge) Bootstrap() BootstrapData {
	return BootstrapData{
		AppVersion:    "0.2.0",
		WorkspaceID:   "validex-workspace",
		WorkspaceName: "Validex Workspace",
		Environments: []EnvironmentSummary{
			{ID: "none", Name: "No Environment", Variables: map[string]string{}},
			{ID: "local", Name: "Local", Variables: map[string]string{"baseUrl": "http://localhost:8080", "token": ""}},
		},
		Collections: []CollectionNode{},
		History:     []HistoryEntry{},
		RecentURLs:  []string{},
		OnboardingSteps: []string{
			"İlk request’ini gönder",
			"OpenAPI contract farklarını incele",
			"Mock server başlat",
		},
	}
}

func (b *Bridge) SendRequest(input RequestInput) SendResult {
	if strings.TrimSpace(input.ID) == "" {
		input.ID = fmt.Sprintf("request-%d", time.Now().UnixNano())
	}
	if input.TimeoutMS <= 0 {
		input.TimeoutMS = 30_000
	}

	resolvedURL, missing := resolveVariables(input.URL, input.Variables)
	if len(missing) > 0 {
		return failed("missing_variables", "Eksik değişken var", "Request gönderilmedi çünkü URL içindeki bazı değişkenlerin değeri yok.", "Environment veya context panelinden şu değerleri tanımlayın: "+strings.Join(missing, ", "), "")
	}
	resolvedURL = normalizeHTTPURL(resolvedURL)
	parsedURL, err := neturl.Parse(resolvedURL)
	if err != nil || parsedURL.Host == "" || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		technical := ""
		if err != nil {
			technical = err.Error()
		}
		return failed("invalid_request", "Request oluşturulamadı", "Method veya URL geçerli görünmüyor.", "URL’nin http:// veya https:// ile başladığını kontrol edin.", technical)
	}

	ctx, cancel := context.WithTimeout(b.operationContext(), time.Duration(input.TimeoutMS)*time.Millisecond)
	operation := &requestOperation{cancel: cancel}
	b.mu.Lock()
	if _, exists := b.cancels[input.ID]; exists {
		b.mu.Unlock()
		cancel()
		return failed(
			"request_already_running",
			"Request zaten çalışıyor",
			"Aynı request ID ile başka bir istek halen devam ediyor.",
			"Çalışan isteği iptal edin veya tamamlanmasını bekleyin.",
			"",
		)
	}
	b.cancels[input.ID] = operation
	b.mu.Unlock()
	defer func() {
		cancel()
		b.mu.Lock()
		if b.cancels[input.ID] == operation {
			delete(b.cancels, input.ID)
		}
		b.mu.Unlock()
	}()

	start := time.Now()
	trace := &requestTrace{start: start}
	ctx = httptrace.WithClientTrace(ctx, trace.clientTrace())

	var body io.Reader
	if input.Body != "" && methodAllowsBody(input.Method) {
		resolvedBody, bodyMissing := resolveVariables(input.Body, input.Variables)
		if len(bodyMissing) > 0 {
			return failed("missing_variables", "Body içinde eksik değişken var", "Request body çözümlenemedi.", "Şu değişkenleri tanımlayın: "+strings.Join(bodyMissing, ", "), "")
		}
		body = bytes.NewBufferString(resolvedBody)
	}

	req, err := http.NewRequestWithContext(ctx, strings.ToUpper(strings.TrimSpace(input.Method)), resolvedURL, body)
	if err != nil {
		return failed("invalid_request", "Request oluşturulamadı", "Method veya URL geçerli görünmüyor.", "URL’yi ve method seçimini kontrol edin.", err.Error())
	}
	for _, header := range input.Headers {
		if !header.Enabled || strings.TrimSpace(header.Key) == "" {
			continue
		}
		value, headerMissing := resolveVariables(header.Value, input.Variables)
		if len(headerMissing) > 0 {
			return failed("missing_variables", "Header içinde eksik değişken var", header.Key+" header değeri çözümlenemedi.", "Şu değişkenleri tanımlayın: "+strings.Join(headerMissing, ", "), "")
		}
		req.Header.Add(header.Key, value)
	}

	client := &http.Client{
		Timeout: time.Duration(input.TimeoutMS) * time.Millisecond,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return failed("request_canceled", "Request iptal edildi", "İstek kullanıcı tarafından durduruldu.", "URL ve form değerleri sekmede korunuyor.", "")
		}
		if errors.Is(err, context.DeadlineExceeded) {
			return failed("request_timeout", "Request zaman aşımına uğradı", fmt.Sprintf("%d ms içinde yanıt alınamadı.", input.TimeoutMS), "Timeout değerini artırın veya hedef servisin erişilebilirliğini kontrol edin.", err.Error())
		}
		var netErr net.Error
		if errors.As(err, &netErr) {
			return failed("network_error", "Sunucuya ulaşılamadı", "Ağ bağlantısı kurulamadı.", "Base URL, VPN, proxy ve sunucu durumunu kontrol edin.", err.Error())
		}
		return failed("request_failed", "Request tamamlanamadı", "Beklenmeyen bir bağlantı hatası oluştu.", "Teknik ayrıntıyı kopyalayıp servis loglarıyla karşılaştırın.", err.Error())
	}
	defer resp.Body.Close()

	if resp.ContentLength > maxHTTPResponseBodyBytes {
		return responseTooLarge()
	}
	raw, tooLarge, readErr := readHTTPResponseBody(resp.Body, maxHTTPResponseBodyBytes)
	if readErr != nil {
		return failed("response_read_failed", "Response okunamadı", "Sunucu yanıt verdi ancak response body tamamlanamadı.", "Bağlantıyı kontrol edip request’i yeniden gönderin.", readErr.Error())
	}
	if tooLarge {
		return responseTooLarge()
	}
	end := time.Now()
	duration := end.Sub(start)
	pretty := prettyBody(raw, resp.Header.Get("Content-Type"))
	traceSnapshot := trace.snapshot()
	timeline := traceSnapshot.timeline(end)

	cookies := make([]ResponseCookie, 0, len(resp.Cookies()))
	for _, cookie := range resp.Cookies() {
		expires := ""
		if !cookie.Expires.IsZero() {
			expires = cookie.Expires.Format(time.RFC3339)
		}
		cookies = append(cookies, ResponseCookie{
			Name: cookie.Name, Value: cookie.Value, Path: cookie.Path, Domain: cookie.Domain,
			Expires: expires, HTTPOnly: cookie.HttpOnly, Secure: cookie.Secure,
		})
	}

	tlsSummary := "Not used"
	if resp.TLS != nil {
		tlsSummary = tlsVersion(resp.TLS.Version) + " · " + tls.CipherSuiteName(resp.TLS.CipherSuite)
	}

	traceID := traceIDFromTraceparent(resp.Header.Get("traceparent"))
	if traceID == "" {
		traceID = firstNonEmpty(
			resp.Header.Get("X-Trace-ID"),
			resp.Header.Get("X-Request-ID"),
		)
	}
	b.recordObservedCall(input.Method, parsedURL.Path)

	return SendResult{Response: &ResponseEnvelope{
		RequestID: input.ID, StatusCode: resp.StatusCode, Status: resp.Status,
		DurationMS: duration.Milliseconds(), SizeBytes: int64(len(raw)),
		ContentType: resp.Header.Get("Content-Type"), Protocol: resp.Proto,
		RemoteAddr: traceSnapshot.remoteAddr, TLS: tlsSummary, TraceID: traceID,
		Headers: resp.Header.Clone(), Cookies: cookies, Body: pretty, RawBody: string(raw),
		Timeline: timeline, ResolvedURL: resolvedURL,
	}}
}

func (b *Bridge) CancelRequest(requestID string) bool {
	b.mu.Lock()
	operation, ok := b.cancels[requestID]
	b.mu.Unlock()
	if ok {
		operation.cancel()
	}
	return ok
}

// CancelToolOperation cancels one running long-lived developer tool operation.
// Tool operation IDs live in a separate namespace from HTTP request IDs.
func (b *Bridge) CancelToolOperation(operationID string) bool {
	operationID = strings.TrimSpace(operationID)
	if operationID == "" {
		return false
	}
	b.mu.Lock()
	operation, ok := b.toolCancels[operationID]
	b.mu.Unlock()
	if ok {
		operation.cancel()
	}
	return ok
}

func (b *Bridge) ImportOpenAPI() ImportSpecResult {
	b.mu.Lock()
	ctx := b.ctx
	b.mu.Unlock()
	if ctx == nil {
		return ImportSpecResult{Error: &UserError{Code: "runtime_unavailable", Title: "Dosya seçici açılamadı", Message: "Desktop runtime henüz hazır değil."}}
	}
	path, err := runtime.OpenFileDialog(ctx, runtime.OpenDialogOptions{
		Title: "OpenAPI dosyası seç",
		Filters: []runtime.FileFilter{
			{DisplayName: "OpenAPI", Pattern: "*.yaml;*.yml;*.json"},
		},
	})
	if err != nil {
		return ImportSpecResult{Error: &UserError{Code: "file_dialog_failed", Title: "Dosya seçilemedi", Message: "Sistem dosya seçicisi tamamlanamadı.", Technical: err.Error()}}
	}
	if path == "" {
		return ImportSpecResult{Canceled: true}
	}

	endpoints, doc, err := core.LoadOpenAPI(path)
	if err != nil {
		return ImportSpecResult{Path: path, Error: &UserError{
			Code: "invalid_openapi", Title: "OpenAPI içe aktarılamadı",
			Message: "Dosya geçerli bir OpenAPI dokümanı değil.",
			Hint:    "YAML/JSON sözdizimini ve schema referanslarını kontrol edin.", Technical: err.Error(),
		}}
	}

	specID := fmt.Sprintf("spec-%d", time.Now().UnixNano())
	b.cacheOpenAPISpec(specID, endpoints)
	out := ImportSpecResult{SpecID: specID, Path: path, Endpoints: make([]ImportedEndpoint, 0, len(endpoints))}
	if doc != nil && doc.Info != nil {
		out.Title = doc.Info.Title
		out.Version = doc.Info.Version
	}
	if doc != nil && len(doc.Servers) > 0 && doc.Servers[0] != nil {
		out.BaseURL = doc.Servers[0].URL
	}
	for _, endpoint := range endpoints {
		id := endpoint.OperationID
		if id == "" {
			id = endpoint.Method + " " + endpoint.Path
		}
		out.Endpoints = append(out.Endpoints, ImportedEndpoint{
			ID: id, Method: endpoint.Method, Path: endpoint.Path, Summary: endpoint.Summary, Tags: endpoint.Tags,
		})
	}
	sort.Slice(out.Endpoints, func(i, j int) bool {
		if out.Endpoints[i].Path == out.Endpoints[j].Path {
			return out.Endpoints[i].Method < out.Endpoints[j].Method
		}
		return out.Endpoints[i].Path < out.Endpoints[j].Path
	})
	return out
}

func (b *Bridge) ValidateOpenAPIResponse(input ContractCheckInput) ContractCheckResult {
	b.mu.Lock()
	endpoints := append([]core.Endpoint(nil), b.specs[input.SpecID]...)
	b.mu.Unlock()
	if strings.TrimSpace(input.SpecID) == "" || len(endpoints) == 0 {
		return ContractCheckResult{
			Error: &UserError{
				Code:    "spec_unavailable",
				Title:   "OpenAPI contract bulunamadı",
				Message: "Bu request’in OpenAPI dokümanı artık bellekte değil.",
				Hint:    "OpenAPI dosyasını yeniden içe aktarın.",
			},
		}
	}
	for _, endpoint := range endpoints {
		if !strings.EqualFold(endpoint.Method, input.Method) || endpoint.Path != input.Path {
			continue
		}
		drift := core.RunDriftWithContentType(
			[]byte(input.Body),
			endpoint.Schema,
			input.StatusCode,
			input.ContentType,
		)
		if !drift.Compared {
			contentType := strings.TrimSpace(input.ContentType)
			if contentType == "" {
				contentType = "Content-Type belirtilmedi"
			}
			return ContractCheckResult{
				Available: false,
				Method:    endpoint.Method,
				Path:      endpoint.Path,
				Findings:  []ContractFinding{},
				Error: &UserError{
					Code:  "response_schema_unavailable",
					Title: "Karşılaştırılacak JSON schema yok",
					Message: fmt.Sprintf(
						"%d response’u için %q ile eşleşen JSON media schema bulunamadı.",
						input.StatusCode,
						contentType,
					),
					Hint: "OpenAPI dokümanında bu status veya default response altına gerçek response media type’ıyla eşleşen JSON schema ekleyin.",
				},
			}
		}
		findings := make([]ContractFinding, 0, len(drift.Findings))
		for _, finding := range drift.Findings {
			findings = append(findings, ContractFinding{
				Path:     finding.Path,
				Type:     string(finding.Type),
				Expected: finding.Schema,
				Actual:   finding.Actual,
				Allowed:  append([]string(nil), finding.Enum...),
			})
		}
		return ContractCheckResult{
			Available: true,
			OK:        drift.OK,
			Truncated: drift.Truncated,
			Method:    endpoint.Method,
			Path:      endpoint.Path,
			Findings:  findings,
		}
	}
	return ContractCheckResult{
		Error: &UserError{
			Code:    "operation_unavailable",
			Title:   "OpenAPI operation bulunamadı",
			Message: strings.ToUpper(input.Method) + " " + input.Path + " bu dokümanda bulunamadı.",
		},
	}
}

func (b *Bridge) cacheOpenAPISpec(specID string, endpoints []core.Endpoint) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.specs == nil {
		b.specs = make(map[string][]core.Endpoint)
	}
	if _, exists := b.specs[specID]; exists {
		for index, existingID := range b.specOrder {
			if existingID == specID {
				b.specOrder = append(b.specOrder[:index], b.specOrder[index+1:]...)
				break
			}
		}
	}
	b.specs[specID] = append([]core.Endpoint(nil), endpoints...)
	b.specOrder = append(b.specOrder, specID)
	for len(b.specOrder) > maxCachedOpenAPISpecs {
		evictedID := b.specOrder[0]
		b.specOrder = b.specOrder[1:]
		delete(b.specs, evictedID)
	}
}

func (b *Bridge) runtimeContext() context.Context {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.ctx
}

func (b *Bridge) operationContext() context.Context {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.lifecycleCtx == nil {
		return context.Background()
	}
	return b.lifecycleCtx
}

func (b *Bridge) beginToolOperation(operationID string) (context.Context, func(), error) {
	operationID = strings.TrimSpace(operationID)
	if operationID == "" {
		return nil, nil, errors.New("operation ID is required")
	}
	if len(operationID) > 128 {
		return nil, nil, errors.New("operation ID must be at most 128 characters")
	}

	ctx, cancel := context.WithCancel(b.operationContext())
	b.mu.Lock()
	if _, exists := b.toolCancels[operationID]; exists {
		b.mu.Unlock()
		cancel()
		return nil, nil, fmt.Errorf("operation %q is already running", operationID)
	}
	operation := &toolOperation{cancel: cancel}
	b.toolCancels[operationID] = operation
	b.mu.Unlock()

	finish := func() {
		cancel()
		b.mu.Lock()
		if b.toolCancels[operationID] == operation {
			delete(b.toolCancels, operationID)
		}
		b.mu.Unlock()
	}
	return ctx, finish, nil
}

func readHTTPResponseBody(body io.Reader, limit int64) ([]byte, bool, error) {
	raw, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil {
		return nil, false, err
	}
	if int64(len(raw)) > limit {
		return nil, true, nil
	}
	return raw, false, nil
}

func responseTooLarge() SendResult {
	return failed(
		"response_too_large",
		"Response sınırı aştı",
		fmt.Sprintf(
			"Sunucunun bildirdiği veya alınan response body %d MiB güvenlik sınırını aştığı için indirme durduruldu.",
			maxHTTPResponseBodyBytes>>20,
		),
		"Daha küçük bir veri kümesi isteyin veya endpoint’e sayfalama/filtre ekleyin.",
		"",
	)
}

func failed(code, title, message, hint, technical string) SendResult {
	return SendResult{Error: &UserError{Code: code, Title: title, Message: message, Hint: hint, Technical: technical}}
}

func resolveVariables(value string, variables map[string]string) (string, []string) {
	missingSet := map[string]struct{}{}
	resolved := variablePattern.ReplaceAllStringFunc(value, func(match string) string {
		parts := variablePattern.FindStringSubmatch(match)
		if len(parts) != 2 {
			return match
		}
		replacement, ok := variables[parts[1]]
		if !ok || replacement == "" || isMaskedSecretValue(replacement) {
			missingSet[parts[1]] = struct{}{}
			return match
		}
		return replacement
	})
	missing := make([]string, 0, len(missingSet))
	for key := range missingSet {
		missing = append(missing, key)
	}
	sort.Strings(missing)
	return resolved, missing
}

func isMaskedSecretValue(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	for _, character := range trimmed {
		if character != '•' {
			return false
		}
	}
	return true
}

func normalizeHTTPURL(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return trimmed
	}
	if strings.HasPrefix(trimmed, "//") {
		return "https:" + trimmed
	}
	if strings.Contains(trimmed, "://") {
		return trimmed
	}

	authority := trimmed
	if boundary := strings.IndexAny(trimmed, "/?#"); boundary >= 0 {
		authority = trimmed[:boundary]
	}
	if authority == "" {
		return trimmed
	}
	host := authority
	if parsedHost, _, err := net.SplitHostPort(authority); err == nil {
		host = parsedHost
	} else if strings.HasPrefix(authority, "[") {
		if end := strings.Index(authority, "]"); end >= 0 {
			host = authority[1:end]
		}
	} else if strings.Count(authority, ":") == 1 {
		host = strings.SplitN(authority, ":", 2)[0]
	}

	scheme := "https"
	normalizedHost := strings.ToLower(strings.Trim(host, "[]"))
	ip := net.ParseIP(normalizedHost)
	if normalizedHost == "localhost" || (ip != nil && (ip.IsLoopback() || ip.IsPrivate())) {
		scheme = "http"
	}
	return scheme + "://" + trimmed
}

func methodAllowsBody(method string) bool {
	switch strings.ToUpper(strings.TrimSpace(method)) {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func prettyBody(raw []byte, contentType string) string {
	if strings.Contains(strings.ToLower(contentType), "json") || json.Valid(raw) {
		var value interface{}
		if json.Unmarshal(raw, &value) == nil {
			if formatted, err := json.MarshalIndent(value, "", "  "); err == nil {
				return string(formatted)
			}
		}
	}
	return string(raw)
}

func tlsVersion(version uint16) string {
	switch version {
	case tls.VersionTLS10:
		return "TLS 1.0"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS13:
		return "TLS 1.3"
	default:
		return "TLS"
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func traceIDFromTraceparent(value string) string {
	parts := strings.Split(strings.TrimSpace(value), "-")
	if len(parts) != 4 ||
		len(parts[0]) != 2 ||
		len(parts[1]) != 32 ||
		len(parts[2]) != 16 ||
		len(parts[3]) != 2 ||
		parts[0] == "ff" ||
		allZeroHex(parts[1]) ||
		allZeroHex(parts[2]) {
		return ""
	}
	for _, part := range parts {
		for _, char := range part {
			if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f')) {
				return ""
			}
		}
	}
	return parts[1]
}

func allZeroHex(value string) bool {
	for _, char := range value {
		if char != '0' {
			return false
		}
	}
	return true
}

type requestTrace struct {
	mu                                                  sync.Mutex
	start, dnsStart, dnsDone, connectStart, connectDone time.Time
	tlsStart, tlsDone, wroteRequest, firstByte          time.Time
	remoteAddr                                          string
}

func (t *requestTrace) clientTrace() *httptrace.ClientTrace {
	return &httptrace.ClientTrace{
		DNSStart:          func(_ httptrace.DNSStartInfo) { t.mark(&t.dnsStart) },
		DNSDone:           func(_ httptrace.DNSDoneInfo) { t.mark(&t.dnsDone) },
		ConnectStart:      func(_, _ string) { t.mark(&t.connectStart) },
		ConnectDone:       func(_, _ string, _ error) { t.mark(&t.connectDone) },
		TLSHandshakeStart: func() { t.mark(&t.tlsStart) },
		TLSHandshakeDone:  func(_ tls.ConnectionState, _ error) { t.mark(&t.tlsDone) },
		GotConn: func(info httptrace.GotConnInfo) {
			if info.Conn != nil && info.Conn.RemoteAddr() != nil {
				t.mu.Lock()
				t.remoteAddr = info.Conn.RemoteAddr().String()
				t.mu.Unlock()
			}
		},
		WroteRequest:         func(_ httptrace.WroteRequestInfo) { t.mark(&t.wroteRequest) },
		GotFirstResponseByte: func() { t.mark(&t.firstByte) },
	}
}

func (t *requestTrace) mark(target *time.Time) {
	t.mu.Lock()
	*target = time.Now()
	t.mu.Unlock()
}

type requestTraceSnapshot struct {
	start, dnsStart, dnsDone, connectStart, connectDone time.Time
	tlsStart, tlsDone, wroteRequest, firstByte          time.Time
	remoteAddr                                          string
}

func (t *requestTrace) snapshot() requestTraceSnapshot {
	t.mu.Lock()
	defer t.mu.Unlock()
	return requestTraceSnapshot{
		start:        t.start,
		dnsStart:     t.dnsStart,
		dnsDone:      t.dnsDone,
		connectStart: t.connectStart,
		connectDone:  t.connectDone,
		tlsStart:     t.tlsStart,
		tlsDone:      t.tlsDone,
		wroteRequest: t.wroteRequest,
		firstByte:    t.firstByte,
		remoteAddr:   t.remoteAddr,
	}
}

func (t requestTraceSnapshot) timeline(end time.Time) []TimelinePhase {
	total := end.Sub(t.start)
	phase := func(id, label string, duration time.Duration, description string) TimelinePhase {
		ms := float64(duration.Microseconds()) / 1000
		percent := 0.0
		if total > 0 {
			percent = float64(duration) / float64(total) * 100
		}
		return TimelinePhase{ID: id, Label: label, DurationMS: ms, Percent: percent, Description: description}
	}
	durationBetween := func(start, finish time.Time) time.Duration {
		if start.IsZero() || finish.IsZero() || finish.Before(start) {
			return 0
		}
		return finish.Sub(start)
	}
	waitStart := t.wroteRequest
	if waitStart.IsZero() {
		waitStart = t.start
	}
	downloadStart := t.firstByte
	if downloadStart.IsZero() {
		downloadStart = end
	}
	serverWait := durationBetween(waitStart, downloadStart)
	waitDescription := ""
	if total > 0 && float64(serverWait)/float64(total) > .6 {
		waitDescription = fmt.Sprintf("Toplam sürenin %%%.0f kadarı sunucu yanıtını beklerken geçti.", float64(serverWait)/float64(total)*100)
	}
	return []TimelinePhase{
		phase("variables", "Variable resolution", 0, "Environment ve request değişkenleri çözüldü."),
		phase("dns", "DNS", durationBetween(t.dnsStart, t.dnsDone), ""),
		phase("tcp", "TCP connection", durationBetween(t.connectStart, t.connectDone), ""),
		phase("tls", "TLS handshake", durationBetween(t.tlsStart, t.tlsDone), ""),
		phase("preparation", "Request preparation", durationBetween(t.start, t.wroteRequest), ""),
		phase("server", "Server wait", serverWait, waitDescription),
		phase("download", "Response download", durationBetween(downloadStart, end), ""),
		phase("contract", "Contract validation", 0, "Contract doğrulaması isteğe bağlıdır."),
	}
}
