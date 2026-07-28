// Package canbridge exposes the typed application boundary consumed by the
// Validex frontend.
package canbridge

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http/httptrace"
	neturl "net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"validex/internal/core"
	"validex/internal/httpexec"
	"validex/internal/mockserver"
)

var variablePattern = regexp.MustCompile(`\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}`)

var errInvalidToolOperation = errors.New("invalid tool operation")

const (
	maxHTTPRequestBodyBytes      = int64(16 << 20)
	maxHTTPResponseBodyBytes     = int64(16 << 20)
	maxHTTPResponseHeaderBytes   = int64(1 << 20)
	maxHTTPContentEncodingLayers = 4
	minHTTPRequestTimeoutMS      = 1
	maxHTTPRequestTimeoutMS      = 300_000
	maxCachedOpenAPISpecs        = 8
	maxObservedCoverageEntries   = 10_000
)

type toolOperation struct {
	cancel context.CancelFunc
}

type requestOperation struct {
	cancel context.CancelFunc
}

type bridgeLifecycleState uint8

const (
	bridgeLifecycleCreated bridgeLifecycleState = iota
	bridgeLifecycleRunning
	bridgeLifecycleStopped
)

type Bridge struct {
	mu                sync.Mutex
	mockMu            sync.Mutex
	lifecycleMu       sync.Mutex
	lifecycleState    bridgeLifecycleState
	ctx               context.Context
	lifecycleCtx      context.Context
	lifecycleCancel   context.CancelFunc
	collectionLibrary *collectionLibraryService
	cancels           map[string]*requestOperation
	toolCancels       map[string]*toolOperation
	specs             map[string][]core.Endpoint
	specOrder         []string
	mock              *mockserver.Server
	observed          map[string]int
	observedOrder     []string
	observedNext      int
	filePicker        filePicker
}

func NewBridge() *Bridge {
	return newBridge(newDefaultCollectionLibraryRepository())
}

// newBridgeWithCollectionLibraryDir keeps collection persistence deterministic
// in tests. Production composition must use NewBridge and the user config dir.
func newBridgeWithCollectionLibraryDir(dataDir string) *Bridge {
	return newBridge(newCollectionLibraryRepository(dataDir))
}

func newBridge(collectionRepository collectionLibraryRepository) *Bridge {
	lifecycleCtx, lifecycleCancel := context.WithCancel(context.Background())
	return &Bridge{
		lifecycleCtx:      lifecycleCtx,
		lifecycleCancel:   lifecycleCancel,
		collectionLibrary: newCollectionLibraryService(collectionRepository),
		cancels:           map[string]*requestOperation{},
		toolCancels:       map[string]*toolOperation{},
		specs:             map[string][]core.Endpoint{},
		specOrder:         make([]string, 0, maxCachedOpenAPISpecs),
		mock:              mockserver.New(mockserver.Options{}),
		observed:          map[string]int{},
		observedOrder:     make([]string, 0, maxObservedCoverageEntries),
		filePicker:        systemFilePicker{},
	}
}

func Startup(b *Bridge) func(context.Context) {
	return func(ctx context.Context) {
		if ctx == nil {
			ctx = context.Background()
		}
		b.lifecycleMu.Lock()
		defer b.lifecycleMu.Unlock()

		b.mu.Lock()
		previousCancel := b.lifecycleCancel
		b.ctx = ctx
		b.lifecycleCtx, b.lifecycleCancel = context.WithCancel(ctx)
		b.mu.Unlock()
		if previousCancel != nil {
			previousCancel()
		}
		if b.collectionLibrary != nil {
			// Runtime shutdown cancels concurrent bridge work before it drains
			// accepted collection writes. Collection cancellation is therefore
			// owned explicitly by its service/queue, not the shared app context.
			b.collectionLibrary.Start(context.WithoutCancel(ctx))
		}
		b.lifecycleState = bridgeLifecycleRunning
	}
}

func Shutdown(b *Bridge) func(context.Context) {
	return func(shutdownCtx context.Context) {
		b.lifecycleMu.Lock()
		defer b.lifecycleMu.Unlock()
		if b.lifecycleState == bridgeLifecycleStopped {
			return
		}

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
		b.mu.Unlock()

		if lifecycleCancel != nil {
			lifecycleCancel()
		}
		b.cancelCollectionPersistence()
		for _, cancel := range requestCancels {
			cancel()
		}
		for _, cancel := range toolCancels {
			cancel()
		}
		b.mockMu.Lock()
		b.mu.Lock()
		mock := b.mock
		b.mu.Unlock()
		if mock != nil {
			if shutdownCtx == nil {
				shutdownCtx = context.Background()
			}
			ctx, cancel := context.WithTimeout(shutdownCtx, 3*time.Second)
			defer cancel()
			_ = mock.Stop(ctx)
		}
		b.mockMu.Unlock()
		b.lifecycleState = bridgeLifecycleStopped
	}
}

func (b *Bridge) Bootstrap() BootstrapData {
	return BootstrapData{
		AppVersion:    "0.2.0",
		WorkspaceID:   "validex-workspace",
		WorkspaceName: "Validex Workspace",
		Environments: []EnvironmentSummary{
			{ID: "none", Name: "No Environment", Variables: map[string]string{}},
			{ID: "local", Name: "Local", Variables: map[string]string{"baseUrl": "http://localhost:8080"}},
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
	requestTimeout, timeoutValid := requestTimeoutDuration(input.TimeoutMS)
	if !timeoutValid {
		return failed(
			"invalid_request",
			"Timeout geçerli değil",
			"Request gönderilmedi çünkü timeout desteklenen aralığın dışında.",
			fmt.Sprintf("Timeout değerini %d ile %d ms arasında girin.", minHTTPRequestTimeoutMS, maxHTTPRequestTimeoutMS),
			"",
		)
	}
	if strings.TrimSpace(input.ID) == "" {
		input.ID = fmt.Sprintf("request-%d", time.Now().UnixNano())
	}
	started := time.Now()

	resolvedURL := input.URL
	if !input.LiteralValues {
		var missing []string
		resolvedURL, missing = resolveVariables(input.URL, input.Variables)
		if len(missing) > 0 {
			return failed("missing_variables", "Eksik değişken var", "Request gönderilmedi çünkü URL içindeki bazı değişkenlerin değeri yok.", "Environment veya context panelinden şu değerleri tanımlayın: "+strings.Join(missing, ", "), "")
		}
	}
	parsedURL, err := neturl.Parse(resolvedURL)
	if err != nil || parsedURL.Host == "" || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		technical := ""
		if err != nil {
			technical = err.Error()
		}
		return failed("invalid_request", "URL geçerli değil", "Request gönderilmedi çünkü URL eksiksiz bir HTTP adresi değil.", "URL’yi http:// veya https:// ile başlayacak şekilde açıkça yazın.", technical)
	}
	if parsedURL.User != nil {
		return failed("invalid_request", "URL içinde kullanıcı bilgisi desteklenmiyor", "URL’deki kullanıcı adı veya parola gizli bir Authorization header’ına dönüşebilir.", "Kimlik bilgisini URL’den kaldırın; gerekiyorsa Authorization header’ını açıkça ekleyip etkinleştirin.", "")
	}
	if parsedURL.Fragment != "" || strings.Contains(resolvedURL, "#") {
		return failed("invalid_request", "URL fragment içeriyor", "URL’nin # işaretinden sonraki bölümü HTTP request’ine gönderilmez.", "Fragment bölümünü URL’den kaldırın.", "")
	}

	ctx, cancel := context.WithTimeout(b.operationContext(), requestTimeout)
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

	trace := &requestTrace{started: started}
	ctx = httptrace.WithClientTrace(ctx, trace.clientTrace())

	resolvedBody := ""
	if input.Body != "" && httpexec.MethodAllowsBody(input.Method) {
		resolvedBody = input.Body
		if !input.LiteralValues {
			var bodyMissing []string
			resolvedBody, bodyMissing = resolveVariables(input.Body, input.Variables)
			if len(bodyMissing) > 0 {
				return failed("missing_variables", "Body içinde eksik değişken var", "Request body çözümlenemedi.", "Şu değişkenleri tanımlayın: "+strings.Join(bodyMissing, ", "), "")
			}
		}
	}

	headers := make([]httpexec.HeaderField, 0, len(input.Headers))
	for _, header := range input.Headers {
		if !header.Enabled || strings.TrimSpace(header.Key) == "" {
			continue
		}
		value := header.Value
		if !input.LiteralValues {
			var headerMissing []string
			value, headerMissing = resolveVariables(header.Value, input.Variables)
			if len(headerMissing) > 0 {
				return failed("missing_variables", "Header içinde eksik değişken var", header.Key+" header değeri çözümlenemedi.", "Şu değişkenleri tanımlayın: "+strings.Join(headerMissing, ", "), "")
			}
		}
		headers = append(headers, httpexec.HeaderField{
			Name:  header.Key,
			Value: value,
		})
	}

	executor := httpexec.NewExecutor(httpexec.ExecutorConfig{
		MaxResponseHeaderBytes: maxHTTPResponseHeaderBytes,
	})
	defer executor.CloseIdleConnections()
	trace.mark(&trace.requestReady)
	response, err := executor.Execute(ctx, httpexec.Request{
		Method:  strings.TrimSpace(input.Method),
		URL:     resolvedURL,
		Headers: headers,
		Body:    []byte(resolvedBody),
	}, httpexec.Options{
		RequestBodyLimit:     maxHTTPRequestBodyBytes,
		ResponseBodyLimit:    maxHTTPResponseBodyBytes,
		ResponseHeaderLimit:  maxHTTPResponseHeaderBytes,
		MaxContentEncodings:  maxHTTPContentEncodingLayers,
		RedirectPolicy:       httpexec.StopAtFirstResponse,
		SuppressDefaultAgent: true,
	})
	if err != nil {
		if errors.Is(err, httpexec.ErrResponseHeadersTooLarge) {
			return responseHeadersTooLarge(err)
		}
		if errors.Is(err, httpexec.ErrRequestBodyTooLarge) {
			return requestTooLarge()
		}
		if errors.Is(err, httpexec.ErrResponseBodyTooLarge) {
			return responseTooLarge()
		}
		if errors.Is(err, context.Canceled) {
			return failed("request_canceled", "Request iptal edildi", "İstek kullanıcı tarafından durduruldu.", "URL ve form değerleri sekmede korunuyor.", "")
		}
		if errors.Is(err, context.DeadlineExceeded) {
			return failed("request_timeout", "Request zaman aşımına uğradı", fmt.Sprintf("%d ms içinde yanıt alınamadı.", input.TimeoutMS), "Timeout değerini artırın veya hedef servisin erişilebilirliğini kontrol edin.", err.Error())
		}
		if errors.Is(err, httpexec.ErrUnsupportedContentEncoding) {
			var encodingError *httpexec.ContentEncodingError
			if errors.As(err, &encodingError) {
				return unsupportedContentEncoding(encodingError.Encoding)
			}
			return unsupportedContentEncoding("")
		}
		if errors.Is(err, httpexec.ErrTooManyContentEncodings) {
			return tooManyContentEncodings()
		}
		if errors.Is(err, httpexec.ErrResponseDecodeFailed) {
			var encodingError *httpexec.ContentEncodingError
			if errors.As(err, &encodingError) {
				return responseDecodeFailed(encodingError.Encoding, err)
			}
			return responseDecodeFailed("", err)
		}
		var headerError *httpexec.HeaderError
		if errors.As(err, &headerError) {
			return interactiveHeaderError(headerError)
		}
		if errors.Is(err, httpexec.ErrInvalidRequest) {
			return failed(
				"invalid_request",
				"Request oluşturulamadı",
				"Method, URL veya header tanımı geçerli görünmüyor.",
				"URL’yi, method seçimini ve etkin header’ları kontrol edin.",
				err.Error(),
			)
		}
		var netErr net.Error
		if errors.As(err, &netErr) {
			return failed("network_error", "Sunucuya ulaşılamadı", "Ağ bağlantısı kurulamadı.", "Base URL, VPN, proxy ve sunucu durumunu kontrol edin.", err.Error())
		}
		return failed("request_failed", "Request tamamlanamadı", "Beklenmeyen bir bağlantı hatası oluştu.", "Teknik ayrıntıyı kopyalayıp servis loglarıyla karşılaştırın.", err.Error())
	}
	raw := response.Body
	end := time.Now()
	duration := end.Sub(started)
	pretty := prettyBody(raw, response.Headers.Get("Content-Type"))
	traceSnapshot := trace.snapshot()
	timeline := traceSnapshot.timeline(end)

	cookies := make([]ResponseCookie, 0, len(response.Cookies))
	for _, cookie := range response.Cookies {
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
	if response.TLS != nil {
		tlsSummary = tlsVersion(response.TLS.Version) + " · " +
			tls.CipherSuiteName(response.TLS.CipherSuite)
	}

	traceID := traceIDFromTraceparent(response.Headers.Get("traceparent"))
	if traceID == "" {
		traceID = firstNonEmpty(
			response.Headers.Get("X-Trace-ID"),
			response.Headers.Get("X-Request-ID"),
		)
	}
	b.recordObservedCall(input.Method, parsedURL.Path)

	return SendResult{Response: &ResponseEnvelope{
		RequestID: input.ID, StatusCode: response.StatusCode, Status: response.Status,
		DurationMS: duration.Milliseconds(), SizeBytes: int64(len(raw)),
		ContentType: response.Headers.Get("Content-Type"), Protocol: response.Protocol,
		RemoteAddr: traceSnapshot.remoteAddr, TLS: tlsSummary, TraceID: traceID,
		Headers: response.Headers.Clone(), Cookies: cookies, Body: pretty, RawBody: string(raw),
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
	result := ImportSpecResult{Endpoints: []ImportedEndpoint{}}
	b.mu.Lock()
	ctx := b.ctx
	b.mu.Unlock()
	if ctx == nil {
		result.Error = &UserError{Code: "runtime_unavailable", Title: "Dosya seçici açılamadı", Message: "Desktop runtime henüz hazır değil."}
		return result
	}
	path, err := b.filePicker.Open(ctx, fileDialogOptions{
		Title:      "OpenAPI dosyası seç",
		Extensions: []string{"yaml", "yml", "json"},
	})
	if err != nil {
		result.Error = &UserError{Code: "file_dialog_failed", Title: "Dosya seçilemedi", Message: "Sistem dosya seçicisi tamamlanamadı.", Technical: err.Error()}
		return result
	}
	if path == "" {
		result.Canceled = true
		return result
	}

	endpoints, doc, err := core.LoadOpenAPI(path)
	if err != nil {
		result.Path = path
		result.Error = &UserError{
			Code: "invalid_openapi", Title: "OpenAPI içe aktarılamadı",
			Message: "Dosya geçerli bir OpenAPI dokümanı değil.",
			Hint:    "YAML/JSON sözdizimini ve schema referanslarını kontrol edin.", Technical: err.Error(),
		}
		return result
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
			ID: id, Method: endpoint.Method, Path: endpoint.Path, Summary: endpoint.Summary,
			Tags: nonNilSlice(endpoint.Tags),
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
			Findings: []ContractFinding{},
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
		Findings: []ContractFinding{},
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
		return nil, nil, fmt.Errorf(
			"%w: operation ID is required",
			errInvalidToolOperation,
		)
	}
	if len(operationID) > 128 {
		return nil, nil, fmt.Errorf(
			"%w: operation ID must be at most 128 characters",
			errInvalidToolOperation,
		)
	}

	ctx, cancel := context.WithCancel(b.operationContext())
	b.mu.Lock()
	if _, exists := b.toolCancels[operationID]; exists {
		b.mu.Unlock()
		cancel()
		return nil, nil, fmt.Errorf(
			"%w: operation %q is already running",
			errInvalidToolOperation,
			operationID,
		)
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

func requestTooLarge() SendResult {
	return failed(
		"invalid_request",
		"Request body sınırı aştı",
		fmt.Sprintf(
			"Request body %d MiB güvenlik sınırını aştığı için gönderilmedi.",
			maxHTTPRequestBodyBytes>>20,
		),
		"Body boyutunu küçültün veya büyük dosya aktarımı için özel bir istemci kullanın.",
		"",
	)
}

func responseHeadersTooLarge(err error) SendResult {
	return failed(
		"response_headers_too_large",
		"Response header’ları sınırı aştı",
		fmt.Sprintf(
			"Sunucunun response header’ları %d MiB güvenlik sınırını aştığı için request durduruldu.",
			maxHTTPResponseHeaderBytes>>20,
		),
		"Sunucunun büyük header değerlerini küçültün veya gereksiz response header’larını kaldırın.",
		err.Error(),
	)
}

func interactiveHeaderError(headerError *httpexec.HeaderError) SendResult {
	if headerError == nil {
		return invalidRequestHeader(
			"Header",
			"Header adı veya değeri geçerli değil.",
		)
	}
	name := headerError.Name
	if strings.TrimSpace(name) == "" {
		name = "Header"
	}
	message := headerError.Error()
	switch headerError.Reason {
	case httpexec.HeaderNameInvalid:
		message = "Header adı geçerli bir HTTP token değeri olmalıdır."
	case httpexec.HeaderValueInvalid:
		message = "Header değeri güvenli olmayan satır sonu karakterleri içeriyor."
	case httpexec.HeaderHostDuplicate:
		message = "Bir request birden fazla Host header içeremez."
	case httpexec.HeaderHostInvalid:
		message = "Host değeri geçersiz veya güvenli olmayan karakterler içeriyor."
	case httpexec.HeaderContentLengthDuplicate:
		message = "Bir request birden fazla Content-Length header içeremez."
	case httpexec.HeaderContentLengthInvalid:
		message = "Content-Length negatif olmayan bir tam sayı olmalıdır."
	case httpexec.HeaderContentLengthMismatch:
		message = fmt.Sprintf(
			"Content-Length %d ancak çözümlenmiş request body %d byte.",
			headerError.DeclaredLength,
			headerError.BodyLength,
		)
	case httpexec.HeaderContentLengthUnsupported:
		message = "Bu method için açık Content-Length: 0 net/http tarafından wire’a yazılamaz; header’ı kaldırın."
	case httpexec.HeaderFramingConflict:
		message = "Content-Length ve Transfer-Encoding aynı request’te birlikte kullanılamaz."
	case httpexec.HeaderTransferDuplicate:
		message = "Bir request birden fazla Transfer-Encoding header içeremez."
	case httpexec.HeaderTransferInvalid:
		message = "Yalnız chunked Transfer-Encoding destekleniyor."
	case httpexec.HeaderTransferBodyUnsupported:
		message = "HEAD ve TRACE requestleri chunked body taşıyamaz."
	case httpexec.HeaderTrailerUnsupported:
		message = "Trailer alanları düz bir header listesi olarak güvenilir biçimde gönderilemez."
	}
	return invalidRequestHeader(name, message)
}

func unsupportedContentEncoding(encoding string) SendResult {
	return failed(
		"unsupported_content_encoding",
		"Response sıkıştırması desteklenmiyor",
		fmt.Sprintf(
			"Sunucu yanıtı %q Content-Encoding ile gönderdi; Validex yalnız gzip ve deflate yanıtlarını açabilir.",
			encoding,
		),
		"Accept-Encoding header’ından bu formatı kaldırın ve gzip veya deflate isteyin.",
		"",
	)
}

func tooManyContentEncodings() SendResult {
	return failed(
		"too_many_content_encodings",
		"Response sıkıştırması çok karmaşık",
		fmt.Sprintf(
			"Sunucu %d katmandan fazla Content-Encoding bildirdi.",
			maxHTTPContentEncodingLayers,
		),
		"Sunucuyu daha az sıkıştırma katmanı kullanacak şekilde yapılandırın.",
		"",
	)
}

func responseDecodeFailed(encoding string, err error) SendResult {
	return failed(
		"response_decode_failed",
		"Response açılamadı",
		fmt.Sprintf(
			"Sunucu %q ile sıkıştırılmış bir yanıt verdi ancak body çözülemedi.",
			encoding,
		),
		"Sunucunun Content-Encoding header’ı ile gönderdiği body formatının eşleştiğini kontrol edin.",
		err.Error(),
	)
}

func invalidRequestHeader(name, message string) SendResult {
	return failed(
		"invalid_request",
		name+" header geçerli değil",
		message,
		"Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
		"",
	)
}

func failed(code, title, message, hint, technical string) SendResult {
	return SendResult{Error: &UserError{Code: code, Title: title, Message: message, Hint: hint, Technical: technical}}
}

func requestTimeoutDuration(timeoutMS int) (time.Duration, bool) {
	if timeoutMS < minHTTPRequestTimeoutMS || timeoutMS > maxHTTPRequestTimeoutMS {
		return 0, false
	}
	return time.Duration(timeoutMS) * time.Millisecond, true
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

const (
	maxPrettyJSONBytes        = int64(32 << 20)
	maxPrettyJSONNestingDepth = 128
)

func prettyBody(raw []byte, contentType string) string {
	if !prettyJSONWithinBudget(raw) {
		return string(raw)
	}
	if strings.Contains(strings.ToLower(contentType), "json") || json.Valid(raw) {
		var formatted bytes.Buffer
		if err := json.Indent(&formatted, raw, "", "  "); err == nil {
			return formatted.String()
		}
	}
	return string(raw)
}

// prettyJSONWithinBudget estimates json.Indent's expansion before allocating
// its destination. Structural characters inside JSON strings are ignored.
func prettyJSONWithinBudget(raw []byte) bool {
	if int64(len(raw)) > maxPrettyJSONBytes {
		return false
	}
	estimatedBytes := int64(len(raw))
	depth := 0
	inString := false
	escaped := false
	for _, character := range raw {
		if inString {
			switch {
			case escaped:
				escaped = false
			case character == '\\':
				escaped = true
			case character == '"':
				inString = false
			}
			continue
		}
		if character == '"' {
			inString = true
			continue
		}

		switch character {
		case '{', '[':
			depth++
			if depth > maxPrettyJSONNestingDepth {
				return false
			}
			estimatedBytes += 1 + int64(depth*2)
		case ',':
			estimatedBytes += 1 + int64(depth*2)
		case '}', ']':
			if depth > 0 {
				depth--
			}
			estimatedBytes += 1 + int64(depth*2)
		}
		if estimatedBytes > maxPrettyJSONBytes {
			return false
		}
	}
	return true
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
	mu                                           sync.Mutex
	started, requestReady, dnsStart, dnsDone     time.Time
	connectStart, connectDone, tlsStart, tlsDone time.Time
	gotConn, wroteRequest, firstByte             time.Time
	connectionReused                             bool
	remoteAddr                                   string
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
			t.mu.Lock()
			t.gotConn = time.Now()
			t.connectionReused = info.Reused
			if info.Conn != nil && info.Conn.RemoteAddr() != nil {
				t.remoteAddr = info.Conn.RemoteAddr().String()
			}
			t.mu.Unlock()
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
	started, requestReady, dnsStart, dnsDone     time.Time
	connectStart, connectDone, tlsStart, tlsDone time.Time
	gotConn, wroteRequest, firstByte             time.Time
	connectionReused                             bool
	remoteAddr                                   string
}

func (t *requestTrace) snapshot() requestTraceSnapshot {
	t.mu.Lock()
	defer t.mu.Unlock()
	return requestTraceSnapshot{
		started:          t.started,
		requestReady:     t.requestReady,
		dnsStart:         t.dnsStart,
		dnsDone:          t.dnsDone,
		connectStart:     t.connectStart,
		connectDone:      t.connectDone,
		tlsStart:         t.tlsStart,
		tlsDone:          t.tlsDone,
		gotConn:          t.gotConn,
		wroteRequest:     t.wroteRequest,
		firstByte:        t.firstByte,
		connectionReused: t.connectionReused,
		remoteAddr:       t.remoteAddr,
	}
}

func (t requestTraceSnapshot) timeline(end time.Time) []TimelinePhase {
	total := end.Sub(t.started)
	if t.started.IsZero() || total < 0 {
		total = 0
	}
	phase := func(id, label string, duration time.Duration, description string) TimelinePhase {
		ms := float64(duration) / float64(time.Millisecond)
		percent := 0.0
		if total > 0 {
			percent = float64(duration) / float64(total) * 100
		}
		return TimelinePhase{ID: id, Label: label, DurationMS: ms, Percent: percent, Description: description}
	}

	// Consume each measured interval in wire order. The cursor clips overlapping
	// or out-of-order httptrace callbacks so one elapsed interval is never
	// attributed to more than one phase.
	cursor := t.started
	durationBetween := func(start, finish time.Time) time.Duration {
		if total <= 0 || start.IsZero() || finish.IsZero() {
			return 0
		}
		if start.Before(t.started) {
			start = t.started
		}
		if start.Before(cursor) {
			start = cursor
		}
		if finish.After(end) {
			finish = end
		}
		if !finish.After(start) {
			return 0
		}
		cursor = finish
		return finish.Sub(start)
	}

	preparation := durationBetween(t.started, t.requestReady)
	dns := durationBetween(t.dnsStart, t.dnsDone)
	tcp := durationBetween(t.connectStart, t.connectDone)
	tlsHandshake := durationBetween(t.tlsStart, t.tlsDone)

	requestStart := t.gotConn
	requestDescription := ""
	if t.connectionReused {
		// No DNS/TCP/TLS callbacks occur for an idle connection. Attribute the
		// real acquisition-and-write interval to request dispatch instead.
		requestStart = t.requestReady
		requestDescription = "Mevcut bağlantı yeniden kullanıldı."
	}
	requestWrite := durationBetween(requestStart, t.wroteRequest)
	serverWait := durationBetween(t.wroteRequest, t.firstByte)
	download := durationBetween(t.firstByte, end)

	waitDescription := ""
	if total > 0 && float64(serverWait)/float64(total) > .6 {
		waitDescription = fmt.Sprintf("Toplam sürenin %%%.0f kadarı sunucu yanıtını beklerken geçti.", float64(serverWait)/float64(total)*100)
	}
	return []TimelinePhase{
		phase("preparation", "Request preparation", preparation, ""),
		phase("dns", "DNS", dns, ""),
		phase("tcp", "TCP connection", tcp, ""),
		phase("tls", "TLS handshake", tlsHandshake, ""),
		phase("request", "Request send", requestWrite, requestDescription),
		phase("server", "Server wait", serverWait, waitDescription),
		phase("download", "Response download", download, ""),
	}
}
