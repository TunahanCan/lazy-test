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
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"lazytest/internal/core"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var variablePattern = regexp.MustCompile(`\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}`)

type Bridge struct {
	mu      sync.Mutex
	ctx     context.Context
	cancels map[string]context.CancelFunc
}

func NewBridge() *Bridge {
	return &Bridge{cancels: map[string]context.CancelFunc{}}
}

func Startup(b *Bridge) func(context.Context) {
	return func(ctx context.Context) {
		b.mu.Lock()
		b.ctx = ctx
		b.mu.Unlock()
	}
}

func Shutdown(b *Bridge) func(context.Context) {
	return func(_ context.Context) {
		b.mu.Lock()
		defer b.mu.Unlock()
		for _, cancel := range b.cancels {
			cancel()
		}
		b.cancels = map[string]context.CancelFunc{}
	}
}

func (b *Bridge) Bootstrap() BootstrapData {
	return BootstrapData{
		AppVersion:    "0.2.0",
		WorkspaceID:   "sample-workspace",
		WorkspaceName: "Commerce API",
		Environments: []EnvironmentSummary{
			{ID: "local", Name: "Local", Variables: map[string]string{"baseUrl": "http://localhost:8080", "token": "••••••••"}},
			{ID: "development", Name: "Development", Variables: map[string]string{"baseUrl": "https://api.example.com", "token": "••••••••"}},
			{ID: "staging", Name: "Staging", Variables: map[string]string{"baseUrl": "https://staging.example.com", "token": "••••••••"}},
		},
		Collections: []CollectionNode{
			{ID: "commerce", Kind: "collection", Name: "Commerce API", Depth: 0, Expanded: true},
			{ID: "users", ParentID: "commerce", Kind: "folder", Name: "Users", Depth: 1, Expanded: true},
			{ID: "list-users", ParentID: "users", Kind: "request", Name: "List users", Method: "GET", URL: "{{baseUrl}}/v1/users", Depth: 2, Favorite: true},
			{ID: "create-user", ParentID: "users", Kind: "request", Name: "Create user", Method: "POST", URL: "{{baseUrl}}/v1/users", Depth: 2},
			{ID: "orders", ParentID: "commerce", Kind: "folder", Name: "Orders", Depth: 1, Expanded: true},
			{ID: "list-orders", ParentID: "orders", Kind: "request", Name: "List orders", Method: "GET", URL: "{{baseUrl}}/v1/orders", Depth: 2},
			{ID: "create-order", ParentID: "orders", Kind: "request", Name: "Create order", Method: "POST", URL: "{{baseUrl}}/v1/orders", Depth: 2},
			{ID: "health", ParentID: "commerce", Kind: "request", Name: "Service health", Method: "GET", URL: "{{baseUrl}}/health", Depth: 1},
			{ID: "admin", Kind: "collection", Name: "Admin API", Depth: 0, Expanded: true},
			{ID: "audit", ParentID: "admin", Kind: "request", Name: "Audit events", Method: "GET", URL: "{{baseUrl}}/v1/audit", Depth: 1},
		},
		History: []HistoryEntry{
			{ID: "h-1", RequestName: "List users", Method: "GET", URL: "/v1/users", StatusCode: 200, DurationMS: 184, Environment: "Development", CreatedAt: time.Now().Add(-12 * time.Minute).Format(time.RFC3339), AssertionsOK: true, TraceID: "8f31c1a2", ResolvedValues: 2},
			{ID: "h-2", RequestName: "Create order", Method: "POST", URL: "/v1/orders", StatusCode: 201, DurationMS: 326, Environment: "Staging", CreatedAt: time.Now().Add(-47 * time.Minute).Format(time.RFC3339), AssertionsOK: true, TraceID: "b712d43e", ResolvedValues: 3},
			{ID: "h-3", RequestName: "Service health", Method: "GET", URL: "/health", StatusCode: 503, DurationMS: 1203, Environment: "Local", CreatedAt: time.Now().Add(-2 * time.Hour).Format(time.RFC3339), AssertionsOK: false, TraceID: "d913ee71", ResolvedValues: 1},
		},
		RecentURLs: []string{
			"{{baseUrl}}/v1/users",
			"{{baseUrl}}/v1/orders",
			"{{baseUrl}}/health",
		},
		OnboardingSteps: []string{
			"Bir workspace oluştur",
			"İlk request’ini gönder",
			"Environment oluştur",
			"Assertion ekle",
			"Java testi üret",
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
	if _, err := http.NewRequest(strings.ToUpper(input.Method), resolvedURL, nil); err != nil {
		return failed("invalid_request", "Request oluşturulamadı", "Method veya URL geçerli görünmüyor.", "URL’nin http:// veya https:// ile başladığını kontrol edin.", err.Error())
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(input.TimeoutMS)*time.Millisecond)
	b.mu.Lock()
	b.cancels[input.ID] = cancel
	b.mu.Unlock()
	defer func() {
		cancel()
		b.mu.Lock()
		delete(b.cancels, input.ID)
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

	raw, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return failed("response_read_failed", "Response okunamadı", "Sunucu yanıt verdi ancak response body tamamlanamadı.", "Bağlantıyı kontrol edip request’i yeniden gönderin.", readErr.Error())
	}
	end := time.Now()
	duration := end.Sub(start)
	pretty := prettyBody(raw, resp.Header.Get("Content-Type"))
	timeline := trace.timeline(end)

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

	traceID := firstNonEmpty(
		resp.Header.Get("traceparent"),
		resp.Header.Get("X-Trace-ID"),
		resp.Header.Get("X-Request-ID"),
	)

	return SendResult{Response: &ResponseEnvelope{
		RequestID: input.ID, StatusCode: resp.StatusCode, Status: resp.Status,
		DurationMS: duration.Milliseconds(), SizeBytes: int64(len(raw)),
		ContentType: resp.Header.Get("Content-Type"), Protocol: resp.Proto,
		RemoteAddr: trace.remoteAddr, TLS: tlsSummary, TraceID: traceID,
		Headers: resp.Header.Clone(), Cookies: cookies, Body: pretty, RawBody: string(raw),
		Timeline: timeline, ResolvedURL: resolvedURL,
	}}
}

func (b *Bridge) CancelRequest(requestID string) bool {
	b.mu.Lock()
	cancel, ok := b.cancels[requestID]
	b.mu.Unlock()
	if ok {
		cancel()
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

	out := ImportSpecResult{Path: path, Endpoints: make([]ImportedEndpoint, 0, len(endpoints))}
	if doc != nil && doc.Info != nil {
		out.Title = doc.Info.Title
		out.Version = doc.Info.Version
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

func (b *Bridge) SaveGeneratedFile(input SaveGeneratedFileInput) FileWriteResult {
	ctx := b.runtimeContext()
	if ctx == nil {
		return fileWriteFailure("runtime_unavailable", "Dosya kaydedilemedi", "Desktop runtime henüz hazır değil.", "")
	}
	name := filepath.Base(strings.TrimSpace(input.SuggestedName))
	if name == "." || name == "" {
		name = "GeneratedTest.java"
	}
	path, err := runtime.SaveFileDialog(ctx, runtime.SaveDialogOptions{
		Title:           "Üretilen dosyayı kaydet",
		DefaultFilename: name,
	})
	if err != nil {
		return fileWriteFailure("file_dialog_failed", "Dosya kaydedilemedi", "Sistem dosya seçicisi tamamlanamadı.", err.Error())
	}
	if path == "" {
		return FileWriteResult{Canceled: true}
	}
	if err := writeFileAtomically(path, []byte(input.Content)); err != nil {
		return fileWriteFailure("file_write_failed", "Dosya yazılamadı", "Seçilen konuma yazma işlemi başarısız oldu.", err.Error())
	}
	return FileWriteResult{Path: path, Count: 1}
}

func (b *Bridge) ExportGeneratedProject(input ExportGeneratedProjectInput) FileWriteResult {
	files, err := validateGeneratedFiles(input.Files)
	if err != nil {
		return fileWriteFailure("unsafe_path", "Dosya yolları geçersiz", "Export başlamadan önce generated file yollarını kontrol edin.", err.Error())
	}
	ctx := b.runtimeContext()
	if ctx == nil {
		return fileWriteFailure("runtime_unavailable", "Proje dışa aktarılamadı", "Desktop runtime henüz hazır değil.", "")
	}
	parent, err := runtime.OpenDirectoryDialog(ctx, runtime.OpenDialogOptions{
		Title: "Üretilen Java projesi için üst klasör seç",
	})
	if err != nil {
		return fileWriteFailure("file_dialog_failed", "Klasör seçilemedi", "Sistem klasör seçicisi tamamlanamadı.", err.Error())
	}
	if parent == "" {
		return FileWriteResult{Canceled: true}
	}

	projectName := safeDirectoryName(input.ProjectName)
	target, err := createAvailableDirectory(filepath.Join(parent, projectName))
	if err != nil {
		return fileWriteFailure("folder_prepare_failed", "Export klasörü hazırlanamadı", "Yeni proje klasörü oluşturulamadı.", err.Error())
	}
	complete := false
	defer func() {
		if !complete {
			_ = os.RemoveAll(target)
		}
	}()

	written := 0
	for _, file := range files {
		path := filepath.Join(target, file.relativePath)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return fileWriteFailure("folder_prepare_failed", "Alt klasör oluşturulamadı", file.relativePath+" için klasör hazırlanamadı.", err.Error())
		}
		if err := writeFileAtomically(path, []byte(file.content)); err != nil {
			return fileWriteFailure("file_write_failed", "Proje tamamlanamadı", file.relativePath+" yazılamadı.", err.Error())
		}
		written++
	}
	complete = true
	return FileWriteResult{Path: target, Count: written}
}

func (b *Bridge) runtimeContext() context.Context {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.ctx
}

func safeDirectoryName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "lazytest-generated"
	}
	invalid := regexp.MustCompile(`[^A-Za-z0-9._-]+`)
	value = strings.Trim(invalid.ReplaceAllString(value, "-"), ".-")
	if value == "" {
		return "lazytest-generated"
	}
	return value
}

func safeRelativePath(value string) (string, bool) {
	value = filepath.Clean(strings.TrimSpace(value))
	if value == "." || !filepath.IsLocal(value) || filepath.VolumeName(value) != "" {
		return "", false
	}
	return value, true
}

type preparedGeneratedFile struct {
	relativePath string
	content      string
}

func validateGeneratedFiles(files []GeneratedFile) ([]preparedGeneratedFile, error) {
	if len(files) == 0 {
		return nil, fmt.Errorf("en az bir generated file gerekli")
	}
	prepared := make([]preparedGeneratedFile, 0, len(files))
	seen := make(map[string]struct{}, len(files))
	for _, file := range files {
		relative, ok := safeRelativePath(file.RelativePath)
		if !ok {
			return nil, fmt.Errorf("%s güvenli bir proje yolu değil", file.Name)
		}
		key := filepath.Clean(relative)
		if _, exists := seen[key]; exists {
			return nil, fmt.Errorf("%s birden fazla kez tanımlandı", relative)
		}
		seen[key] = struct{}{}
		prepared = append(prepared, preparedGeneratedFile{relativePath: relative, content: file.Content})
	}
	return prepared, nil
}

func createAvailableDirectory(base string) (string, error) {
	for index := 1; index <= 999; index++ {
		candidate := base
		if index > 1 {
			candidate = fmt.Sprintf("%s-%d", base, index)
		}
		if err := os.Mkdir(candidate, 0o755); err == nil {
			return candidate, nil
		} else if !errors.Is(err, os.ErrExist) {
			return "", err
		}
	}
	return "", fmt.Errorf("uygun export klasörü bulunamadı")
}

func writeFileAtomically(path string, content []byte) error {
	temp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	defer func() {
		_ = temp.Close()
		_ = os.Remove(tempPath)
	}()
	if err := temp.Chmod(0o644); err != nil {
		return err
	}
	if _, err := temp.Write(content); err != nil {
		return err
	}
	if err := temp.Sync(); err != nil {
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(tempPath, path)
}

func fileWriteFailure(code, title, message, technical string) FileWriteResult {
	return FileWriteResult{Error: &UserError{Code: code, Title: title, Message: message, Technical: technical}}
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
		if !ok || replacement == "" || replacement == "••••••••" {
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

func methodAllowsBody(method string) bool {
	switch strings.ToUpper(strings.TrimSpace(method)) {
	case http.MethodPost, http.MethodPut, http.MethodPatch:
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
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

type requestTrace struct {
	start, dnsStart, dnsDone, connectStart, connectDone time.Time
	tlsStart, tlsDone, wroteRequest, firstByte          time.Time
	remoteAddr                                          string
}

func (t *requestTrace) clientTrace() *httptrace.ClientTrace {
	return &httptrace.ClientTrace{
		DNSStart:          func(_ httptrace.DNSStartInfo) { t.dnsStart = time.Now() },
		DNSDone:           func(_ httptrace.DNSDoneInfo) { t.dnsDone = time.Now() },
		ConnectStart:      func(_, _ string) { t.connectStart = time.Now() },
		ConnectDone:       func(_, _ string, _ error) { t.connectDone = time.Now() },
		TLSHandshakeStart: func() { t.tlsStart = time.Now() },
		TLSHandshakeDone:  func(_ tls.ConnectionState, _ error) { t.tlsDone = time.Now() },
		GotConn: func(info httptrace.GotConnInfo) {
			if info.Conn != nil && info.Conn.RemoteAddr() != nil {
				t.remoteAddr = info.Conn.RemoteAddr().String()
			}
		},
		WroteRequest:         func(_ httptrace.WroteRequestInfo) { t.wroteRequest = time.Now() },
		GotFirstResponseByte: func() { t.firstByte = time.Now() },
	}
}

func (t *requestTrace) timeline(end time.Time) []TimelinePhase {
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
		phase("assertions", "Assertion execution", 0, "Bu request için assertion tanımlanmadı."),
		phase("contract", "Contract validation", 0, "Contract doğrulaması isteğe bağlıdır."),
	}
}
