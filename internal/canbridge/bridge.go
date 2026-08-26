// Package canbridge exposes the typed application boundary consumed by the
// Validex frontend.
package canbridge

import (
	"context"
	"crypto/tls"
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
	maxConcurrentHTTPRequests    = 4
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
	httpExecutor      *httpexec.Executor
	requestSlots      chan struct{}
	cancels           map[string]*requestOperation
	toolCancels       map[string]*toolOperation
	specs             map[string][]core.Endpoint
	specOrder         []string
	mock              *mockserver.Server
	observed          map[string]int
	observedOrder     []string
	observedNext      int
	filePicker        filePicker
	fileSaver         fileSaver
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
		httpExecutor: httpexec.NewExecutor(httpexec.ExecutorConfig{
			MaxResponseHeaderBytes: maxHTTPResponseHeaderBytes,
		}),
		requestSlots:  make(chan struct{}, maxConcurrentHTTPRequests),
		cancels:       map[string]*requestOperation{},
		toolCancels:   map[string]*toolOperation{},
		specs:         map[string][]core.Endpoint{},
		specOrder:     make([]string, 0, maxCachedOpenAPISpecs),
		mock:          mockserver.New(mockserver.Options{}),
		observed:      map[string]int{},
		observedOrder: make([]string, 0, maxObservedCoverageEntries),
		filePicker:    systemFilePicker{},
		fileSaver:     systemFileSaver{},
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
		if b.httpExecutor != nil {
			b.httpExecutor.CloseIdleConnections()
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
			userErrorRequestTimeoutInvalid,
			UserErrorParams{
				"minTimeoutMs": fmt.Sprintf("%d", minHTTPRequestTimeoutMS),
				"maxTimeoutMs": fmt.Sprintf("%d", maxHTTPRequestTimeoutMS),
			},
			nil,
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
			return failed(
				userErrorRequestURLVariablesMissing,
				UserErrorParams{"variables": strings.Join(missing, ", ")},
				nil,
			)
		}
	}
	parsedURL, err := neturl.Parse(resolvedURL)
	if err != nil || parsedURL.Host == "" || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return failed(userErrorRequestURLInvalid, nil, err)
	}
	if parsedURL.User != nil {
		return failed(userErrorRequestURLUserInfoUnsupported, nil, nil)
	}
	if parsedURL.Fragment != "" || strings.Contains(resolvedURL, "#") {
		return failed(userErrorRequestURLFragmentUnsupported, nil, nil)
	}

	sessionContext := b.operationContext()
	ctx, cancel := context.WithTimeout(sessionContext, requestTimeout)
	operation := &requestOperation{cancel: cancel}
	b.mu.Lock()
	if _, exists := b.cancels[input.ID]; exists {
		b.mu.Unlock()
		cancel()
		return failed(
			userErrorRequestAlreadyRunning,
			nil,
			nil,
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
	if err := b.acquireRequestSlot(ctx); err != nil {
		if errors.Is(err, context.Canceled) {
			return failed(userErrorRequestCanceled, nil, nil)
		}
		return failed(
			userErrorRequestTimeout,
			UserErrorParams{"timeoutMs": fmt.Sprintf("%d", input.TimeoutMS)},
			err,
		)
	}
	defer b.releaseRequestSlot()

	trace := &requestTrace{started: started}
	ctx = httptrace.WithClientTrace(ctx, trace.clientTrace())

	resolvedBody := ""
	if input.Body != "" && httpexec.MethodAllowsBody(input.Method) {
		resolvedBody = input.Body
		if !input.LiteralValues {
			var bodyMissing []string
			resolvedBody, bodyMissing = resolveVariables(input.Body, input.Variables)
			if len(bodyMissing) > 0 {
				return failed(
					userErrorRequestBodyVariablesMissing,
					UserErrorParams{"variables": strings.Join(bodyMissing, ", ")},
					nil,
				)
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
				return failed(
					userErrorRequestHeaderVariablesMissing,
					UserErrorParams{
						"headerName": header.Key,
						"variables":  strings.Join(headerMissing, ", "),
					},
					nil,
				)
			}
		}
		headers = append(headers, httpexec.HeaderField{
			Name:  header.Key,
			Value: value,
		})
	}

	executor := b.httpExecutor
	if executor == nil {
		// Directly constructed Bridge values are supported in focused tests.
		// Production composition always installs a session-owned executor.
		executor = httpexec.NewExecutor(httpexec.ExecutorConfig{
			MaxResponseHeaderBytes: maxHTTPResponseHeaderBytes,
		})
		defer executor.CloseIdleConnections()
	}
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
			return failed(userErrorRequestCanceled, nil, nil)
		}
		if errors.Is(err, context.DeadlineExceeded) {
			return failed(
				userErrorRequestTimeout,
				UserErrorParams{"timeoutMs": fmt.Sprintf("%d", input.TimeoutMS)},
				err,
			)
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
				userErrorRequestInvalidDefinition,
				nil,
				err,
			)
		}
		var netErr net.Error
		if errors.As(err, &netErr) {
			return failed(userErrorRequestNetwork, nil, err)
		}
		return failed(userErrorRequestFailed, nil, err)
	}
	raw := response.Body
	end := time.Now()
	duration := end.Sub(started)
	presentedBody := presentResponseBody(
		raw,
		response.Headers.Get("Content-Type"),
	)
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
	b.recordObservedCallForContext(
		sessionContext,
		input.Method,
		parsedURL.Path,
	)

	return SendResult{Response: &ResponseEnvelope{
		RequestID: input.ID, StatusCode: response.StatusCode, Status: response.Status,
		DurationMS: duration.Milliseconds(), SizeBytes: int64(len(raw)),
		ContentType: response.Headers.Get("Content-Type"), Protocol: response.Protocol,
		RemoteAddr: traceSnapshot.remoteAddr, TLS: tlsSummary, TraceID: traceID,
		Headers: response.Headers.Clone(), Cookies: cookies,
		Body: presentedBody.Body, RawBody: presentedBody.Raw,
		BodyEncoding: presentedBody.Encoding,
		Timeline:     timeline, ResolvedURL: resolvedURL,
	}}
}

func (b *Bridge) acquireRequestSlot(ctx context.Context) error {
	if b.requestSlots == nil {
		return nil
	}
	select {
	case b.requestSlots <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (b *Bridge) releaseRequestSlot() {
	if b.requestSlots != nil {
		<-b.requestSlots
	}
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
	ctx := b.runtimeContext()
	if ctx == nil {
		result.Error = newUserError(userErrorOpenAPIRuntimeUnavailable, nil, nil)
		return result
	}
	path, err := b.filePicker.Open(ctx, fileDialogOptions{
		Title:      "OpenAPI dosyası seç",
		Extensions: []string{"yaml", "yml", "json"},
	})
	if err != nil {
		result.Error = newUserError(userErrorOpenAPIFileDialogFailed, nil, err)
		return result
	}
	if path == "" {
		result.Canceled = true
		return result
	}

	endpoints, doc, err := core.LoadOpenAPIContext(ctx, path)
	if err != nil {
		result.Path = path
		result.Error = newUserError(userErrorOpenAPIInvalidDocument, nil, err)
		return result
	}

	specID := fmt.Sprintf("spec-%d", time.Now().UnixNano())
	if !b.cacheOpenAPISpecForContext(ctx, specID, endpoints) {
		result.Path = path
		result.Error = newUserError(userErrorOpenAPISessionCanceled, nil, nil)
		return result
	}
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
			Error:    newUserError(userErrorOpenAPISpecUnavailable, nil, nil),
		}
	}
	body, err := decodePresentedResponseBody(input.Body, input.BodyEncoding)
	if err != nil {
		return ContractCheckResult{
			Findings: []ContractFinding{},
			Error:    newUserError(userErrorOpenAPIBodyEncodingInvalid, nil, err),
		}
	}
	for _, endpoint := range endpoints {
		if !strings.EqualFold(endpoint.Method, input.Method) || endpoint.Path != input.Path {
			continue
		}
		drift := core.RunEndpointDriftWithContentType(
			body,
			endpoint,
			input.StatusCode,
			input.ContentType,
		)
		if !drift.Compared {
			contentType := strings.TrimSpace(input.ContentType)
			definition := userErrorOpenAPIResponseSchemaUnavailable
			params := UserErrorParams{
				"statusCode":  fmt.Sprintf("%d", input.StatusCode),
				"contentType": contentType,
			}
			if contentType == "" {
				definition = userErrorOpenAPIResponseSchemaUnavailableWithoutContentType
				delete(params, "contentType")
			}
			return ContractCheckResult{
				Available: false,
				Method:    endpoint.Method,
				Path:      endpoint.Path,
				Findings:  []ContractFinding{},
				Error:     newUserError(definition, params, nil),
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
		Error: newUserError(
			userErrorOpenAPIOperationUnavailable,
			UserErrorParams{
				"method": strings.ToUpper(input.Method),
				"path":   input.Path,
			},
			nil,
		),
	}
}

func (b *Bridge) cacheOpenAPISpec(specID string, endpoints []core.Endpoint) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.cacheOpenAPISpecLocked(specID, endpoints)
}

func (b *Bridge) cacheOpenAPISpecForContext(
	ctx context.Context,
	specID string,
	endpoints []core.Endpoint,
) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.ctx == nil || b.lifecycleCtx != ctx || ctx.Err() != nil {
		return false
	}
	b.cacheOpenAPISpecLocked(specID, endpoints)
	return true
}

func (b *Bridge) cacheOpenAPISpecLocked(
	specID string,
	endpoints []core.Endpoint,
) {
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

func (b *Bridge) runtimeContextIsCurrent(ctx context.Context) bool {
	if ctx == nil || ctx.Err() != nil {
		return false
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.ctx != nil && b.lifecycleCtx == ctx
}

func (b *Bridge) runtimeContext() context.Context {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.ctx == nil {
		return nil
	}
	return b.lifecycleCtx
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
		userErrorRequestResponseBodyTooLarge,
		UserErrorParams{"maxMiB": fmt.Sprintf("%d", maxHTTPResponseBodyBytes>>20)},
		nil,
	)
}

func requestTooLarge() SendResult {
	return failed(
		userErrorRequestBodyTooLarge,
		UserErrorParams{"maxMiB": fmt.Sprintf("%d", maxHTTPRequestBodyBytes>>20)},
		nil,
	)
}

func responseHeadersTooLarge(err error) SendResult {
	return failed(
		userErrorRequestResponseHeadersTooLarge,
		UserErrorParams{"maxMiB": fmt.Sprintf("%d", maxHTTPResponseHeaderBytes>>20)},
		err,
	)
}

func interactiveHeaderError(headerError *httpexec.HeaderError) SendResult {
	if headerError == nil {
		return failed(
			userErrorRequestHeaderInvalid,
			UserErrorParams{"headerName": "Header"},
			nil,
		)
	}
	name := headerError.Name
	if strings.TrimSpace(name) == "" {
		name = "Header"
	}
	definition := userErrorRequestHeaderInvalid
	params := UserErrorParams{"headerName": name}
	switch headerError.Reason {
	case httpexec.HeaderNameInvalid:
		definition = userErrorRequestHeaderNameInvalid
	case httpexec.HeaderValueInvalid:
		definition = userErrorRequestHeaderValueInvalid
	case httpexec.HeaderHostDuplicate:
		definition = userErrorRequestHostHeaderDuplicate
	case httpexec.HeaderHostInvalid:
		definition = userErrorRequestHostHeaderInvalid
	case httpexec.HeaderContentLengthDuplicate:
		definition = userErrorRequestContentLengthDuplicate
	case httpexec.HeaderContentLengthInvalid:
		definition = userErrorRequestContentLengthInvalid
	case httpexec.HeaderContentLengthMismatch:
		definition = userErrorRequestContentLengthMismatch
		params["declaredLength"] = fmt.Sprintf("%d", headerError.DeclaredLength)
		params["bodyLength"] = fmt.Sprintf("%d", headerError.BodyLength)
	case httpexec.HeaderContentLengthUnsupported:
		definition = userErrorRequestContentLengthUnsupported
	case httpexec.HeaderFramingConflict:
		definition = userErrorRequestFramingConflict
	case httpexec.HeaderTransferDuplicate:
		definition = userErrorRequestTransferEncodingDuplicate
	case httpexec.HeaderTransferInvalid:
		definition = userErrorRequestTransferEncodingInvalid
	case httpexec.HeaderTransferBodyUnsupported:
		definition = userErrorRequestTransferEncodingBodyUnsupported
	case httpexec.HeaderTrailerUnsupported:
		definition = userErrorRequestTrailerUnsupported
	}
	return failed(definition, params, headerError)
}

func unsupportedContentEncoding(encoding string) SendResult {
	return failed(
		userErrorRequestUnsupportedContentEncoding,
		UserErrorParams{"encoding": encoding},
		nil,
	)
}

func tooManyContentEncodings() SendResult {
	return failed(
		userErrorRequestTooManyContentEncodings,
		UserErrorParams{"maxLayers": fmt.Sprintf("%d", maxHTTPContentEncodingLayers)},
		nil,
	)
}

func responseDecodeFailed(encoding string, err error) SendResult {
	return failed(
		userErrorRequestResponseDecodeFailed,
		UserErrorParams{"encoding": encoding},
		err,
	)
}

func failed(
	definition userErrorDefinition,
	params UserErrorParams,
	err error,
) SendResult {
	return SendResult{Error: newUserError(definition, params, err)}
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
