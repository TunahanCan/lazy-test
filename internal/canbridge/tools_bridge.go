package canbridge

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"validex/internal/diagnostics"
	"validex/internal/mockserver"
	"validex/internal/protocols"
)

const maxWebSocketBridgeMessageBytes = 1 << 20

func (b *Bridge) GetMockServer() MockServerSnapshot {
	return mockSnapshot(b.currentMockServer(), "")
}

func (b *Bridge) UpdateMockRoutes(routes []MockRoute) MockServerSnapshot {
	server := b.currentMockServer()
	if err := server.ReplaceRoutes(toMockRoutes(routes)); err != nil {
		return mockFailure(server, "mock_routes_invalid", "Mock route’ları uygulanamadı", err)
	}
	return mockSnapshot(server, "")
}

func (b *Bridge) StartMockServer(input MockStartInput) MockServerSnapshot {
	b.mu.Lock()
	current := b.mock
	if current == nil {
		current = mockserver.New(mockserver.Options{})
	}
	if current.Status().Running {
		b.mu.Unlock()
		return mockFailure(current, "mock_already_running", "Mock server zaten çalışıyor", errors.New("önce çalışan server’ı durdurun"))
	}
	routes := current.Routes()
	server := mockserver.New(mockserver.Options{EnableCORS: input.EnableCORS})
	if err := server.ReplaceRoutes(routes); err != nil {
		b.mu.Unlock()
		return mockFailure(current, "mock_routes_invalid", "Mock route’ları uygulanamadı", err)
	}
	if _, err := server.Start(input.Port); err != nil {
		b.mu.Unlock()
		return mockFailure(current, "mock_start_failed", "Mock server başlatılamadı", err)
	}
	b.mock = server
	b.mu.Unlock()
	return mockSnapshot(server, "")
}

func (b *Bridge) StopMockServer() MockServerSnapshot {
	server := b.currentMockServer()
	ctx, cancel := context.WithTimeout(b.operationContext(), 3*time.Second)
	defer cancel()
	if err := server.Stop(ctx); err != nil {
		return mockFailure(server, "mock_stop_failed", "Mock server durdurulamadı", err)
	}
	return mockSnapshot(server, "")
}

func (b *Bridge) ClearMockHits() MockServerSnapshot {
	server := b.currentMockServer()
	server.ClearHits()
	return mockSnapshot(server, "")
}

func (b *Bridge) ImportMockOpenAPI() MockServerSnapshot {
	ctx := b.runtimeContext()
	if ctx == nil {
		out := mockSnapshot(b.currentMockServer(), "")
		out.Error = &UserError{
			Code:    "runtime_unavailable",
			Title:   "OpenAPI dosyası seçilemedi",
			Message: "Desktop runtime henüz hazır değil.",
		}
		return out
	}
	path, err := b.filePicker.Open(ctx, fileDialogOptions{
		Title:      "Mock route üretilecek OpenAPI dosyasını seç",
		Extensions: []string{"yaml", "yml", "json"},
	})
	if err != nil {
		out := mockSnapshot(b.currentMockServer(), "")
		out.Error = &UserError{
			Code: "file_dialog_failed", Title: "OpenAPI dosyası seçilemedi",
			Message: "Sistem dosya seçicisi tamamlanamadı.", Technical: err.Error(),
		}
		return out
	}
	if path == "" {
		snapshot := mockSnapshot(b.currentMockServer(), "")
		snapshot.Canceled = true
		return snapshot
	}
	routes, err := mockserver.ImportOpenAPI(path)
	if err != nil {
		return mockFailure(b.currentMockServer(), "invalid_openapi", "Mock route’ları üretilemedi", err)
	}
	server := b.currentMockServer()
	if err := server.ReplaceRoutes(routes); err != nil {
		return mockFailure(server, "mock_routes_invalid", "Mock route’ları uygulanamadı", err)
	}
	return mockSnapshot(server, path)
}

func (b *Bridge) RunSSE(input SSEInput) SSEResult {
	ctx, finish, err := b.beginToolOperation(input.OperationID)
	if err != nil {
		return SSEResult{
			Headers: map[string][]string{},
			Events:  []SSEEvent{},
			Error:   toolError("sse_failed", "SSE akışı başlatılamadı", err),
		}
	}
	defer finish()

	result, err := protocols.ReadSSE(ctx, protocols.SSERequest{
		URL:                input.URL,
		Headers:            input.Headers,
		Timeout:            durationFromMS(input.TimeoutMS),
		MaxEvents:          input.MaxEvents,
		InsecureSkipVerify: input.InsecureSkipVerify,
	})
	return mapSSEResult(result, err)
}

func mapSSEResult(result protocols.SSEResult, err error) SSEResult {
	out := SSEResult{
		StatusCode: result.StatusCode,
		Headers:    nonNilMap(result.Headers),
		Events:     make([]SSEEvent, 0, len(result.Events)),
		DurationMS: result.Duration.Milliseconds(),
	}
	for _, event := range result.Events {
		out.Events = append(out.Events, SSEEvent{
			Event: event.Event, ID: event.ID, Data: event.Data,
			RetryMillis: event.RetryMillis, HasRetry: event.HasRetry,
		})
	}
	if err != nil {
		out.Error = toolError("sse_failed", "SSE akışı tamamlanamadı", err)
	}
	return out
}

func (b *Bridge) RunWebSocket(input WebSocketInput) WebSocketResult {
	ctx, finish, err := b.beginToolOperation(input.OperationID)
	if err != nil {
		return WebSocketResult{
			Headers:  map[string][]string{},
			Messages: []WebSocketMessage{},
			Error:    toolError("websocket_failed", "WebSocket exchange başlatılamadı", err),
		}
	}
	defer finish()

	send := make([]protocols.WebSocketMessage, 0, len(input.Send))
	for index, message := range input.Send {
		data := []byte(message.Data)
		switch strings.ToLower(strings.TrimSpace(message.Type)) {
		case protocols.WebSocketBinaryMessage:
			if len(message.Data) > base64.StdEncoding.EncodedLen(maxWebSocketBridgeMessageBytes) {
				return WebSocketResult{
					Headers:  map[string][]string{},
					Messages: []WebSocketMessage{},
					Error: toolError(
						"websocket_failed",
						"WebSocket exchange başlatılamadı",
						fmt.Errorf("binary WebSocket message %d must not exceed %d decoded bytes", index+1, maxWebSocketBridgeMessageBytes),
					),
				}
			}
			if message.Encoding != "" &&
				!strings.EqualFold(strings.TrimSpace(message.Encoding), "base64") {
				return WebSocketResult{
					Headers:  map[string][]string{},
					Messages: []WebSocketMessage{},
					Error: toolError(
						"websocket_failed",
						"WebSocket exchange başlatılamadı",
						fmt.Errorf("invalid binary WebSocket message %d: encoding must be base64", index+1),
					),
				}
			}
			decoded, decodeErr := base64.StdEncoding.DecodeString(message.Data)
			if decodeErr != nil {
				return WebSocketResult{
					Headers:  map[string][]string{},
					Messages: []WebSocketMessage{},
					Error: toolError(
						"websocket_failed",
						"WebSocket exchange başlatılamadı",
						fmt.Errorf("invalid binary WebSocket message %d: data must use base64 encoding: %w", index+1, decodeErr),
					),
				}
			}
			data = decoded
		case protocols.WebSocketTextMessage:
			if len(data) > maxWebSocketBridgeMessageBytes {
				return WebSocketResult{
					Headers:  map[string][]string{},
					Messages: []WebSocketMessage{},
					Error: toolError(
						"websocket_failed",
						"WebSocket exchange başlatılamadı",
						fmt.Errorf("text WebSocket message %d must not exceed %d bytes", index+1, maxWebSocketBridgeMessageBytes),
					),
				}
			}
			if message.Encoding != "" &&
				!strings.EqualFold(strings.TrimSpace(message.Encoding), "utf-8") {
				return WebSocketResult{
					Headers:  map[string][]string{},
					Messages: []WebSocketMessage{},
					Error: toolError(
						"websocket_failed",
						"WebSocket exchange başlatılamadı",
						fmt.Errorf("invalid text WebSocket message %d: encoding must be utf-8", index+1),
					),
				}
			}
		}
		send = append(send, protocols.WebSocketMessage{
			Type: message.Type,
			Data: data,
		})
	}
	result, err := protocols.ExchangeWebSocket(ctx, protocols.WebSocketRequest{
		URL:                input.URL,
		Headers:            input.Headers,
		Subprotocols:       input.Subprotocols,
		Send:               send,
		Timeout:            durationFromMS(input.TimeoutMS),
		MaxMessages:        input.MaxMessages,
		InsecureSkipVerify: input.InsecureSkipVerify,
	})
	out := WebSocketResult{
		StatusCode: result.StatusCode,
		Headers:    nonNilMap(result.Headers),
		Protocol:   result.Protocol,
		Messages:   make([]WebSocketMessage, 0, len(result.Messages)),
		DurationMS: result.Duration.Milliseconds(),
	}
	for _, message := range result.Messages {
		encoding := "utf-8"
		data := string(message.Data)
		if message.Type == protocols.WebSocketBinaryMessage {
			encoding = "base64"
			data = base64.StdEncoding.EncodeToString(message.Data)
		}
		out.Messages = append(out.Messages, WebSocketMessage{
			Type:      message.Type,
			Data:      data,
			Encoding:  encoding,
			SizeBytes: int64(len(message.Data)),
		})
	}
	if err != nil {
		out.Error = toolError("websocket_failed", "WebSocket exchange tamamlanamadı", err)
	}
	return out
}

func (b *Bridge) InspectGRPC(input GRPCInput) GRPCResult {
	ctx, finish, err := b.beginToolOperation(input.OperationID)
	if err != nil {
		return GRPCResult{
			Services: []string{},
			Error:    toolError("grpc_failed", "gRPC reflection başlatılamadı", err),
		}
	}
	defer finish()

	result, err := protocols.ListGRPCServices(ctx, protocols.GRPCReflectionRequest{
		Address:            input.Address,
		Metadata:           input.Metadata,
		Timeout:            durationFromMS(input.TimeoutMS),
		UseTLS:             input.UseTLS,
		ServerName:         input.ServerName,
		InsecureSkipVerify: input.InsecureSkipVerify,
	})
	out := GRPCResult{
		Services: nonNilSlice(result.Services), ReflectionVersion: result.ReflectionVersion,
		ConnectionState: result.ConnectionState, DurationMS: result.Duration.Milliseconds(),
	}
	if err != nil {
		out.Error = toolError("grpc_failed", "gRPC reflection tamamlanamadı", err)
	}
	return out
}

func (b *Bridge) InspectActuator(input ActuatorInspectInput) ActuatorInspectResult {
	out := emptyActuatorInspectResult()
	headers := make(http.Header, len(input.Headers))
	for key, value := range input.Headers {
		headers.Set(key, value)
	}
	client, err := diagnostics.NewActuatorClient(input.BaseURL, diagnostics.ActuatorClientOptions{
		Headers: headers,
		Timeout: durationFromMS(input.TimeoutMS),
	})
	if err != nil {
		out.Error = diagnosticError("Actuator bağlantısı hazırlanamadı", err)
		return out
	}
	ctx := b.operationContext()
	health, err := client.FetchHealth(ctx)
	if err != nil {
		out.Error = diagnosticError("Actuator health okunamadı", err)
		return out
	}
	out.Health = &ActuatorHealth{
		Status: health.Status, Components: health.Components,
		Groups: health.Groups, Data: nonNilMap(health.Data),
	}
	metrics, err := client.FetchMetrics(ctx, input.MetricNames)
	if err != nil {
		out.Error = diagnosticError("Actuator metric’leri okunamadı", err)
		return out
	}
	out.Metrics = fromMetricSnapshot(metrics)
	if input.IncludeMappings {
		mappings, mappingsErr := client.FetchMappings(ctx)
		if mappingsErr != nil {
			out.Error = diagnosticError("Actuator mappings okunamadı", mappingsErr)
			return out
		}
		out.Mappings = &ActuatorMappings{
			Contexts: mappings.Contexts,
			Data:     nonNilMap(mappings.Data),
		}
	}
	if input.Before != nil {
		for _, delta := range diagnostics.DiffMetricSnapshots(toMetricSnapshot(*input.Before), metrics) {
			out.Deltas = append(out.Deltas, ActuatorMetricDelta{
				Metric: delta.Metric, Statistic: delta.Statistic,
				Before: delta.Before, After: delta.After, Delta: delta.Delta,
				PercentChange: delta.PercentChange,
			})
		}
	}
	return out
}

func (b *Bridge) CompareEnvironments(input EnvironmentCompareInput) EnvironmentCompareResult {
	out := EnvironmentCompareResult{
		Method:      input.Method,
		Path:        input.Path,
		Responses:   []EnvironmentResponse{},
		Comparisons: []EnvironmentDiff{},
	}
	targets := make([]diagnostics.EnvironmentTarget, 0, len(input.Targets))
	for _, target := range input.Targets {
		targets = append(targets, diagnostics.EnvironmentTarget{
			Name: target.Name, BaseURL: target.BaseURL,
		})
	}
	result, err := diagnostics.CompareEnvironments(b.operationContext(), diagnostics.EnvironmentRequest{
		Method: input.Method, Path: input.Path, Headers: input.Headers,
		Body: []byte(input.Body), Targets: targets,
		IgnoreJSONPaths: input.IgnoreJSONPaths, IgnoreHeaders: input.IgnoreHeaders,
		AllowUnsafe: input.AllowUnsafe,
	}, diagnostics.EnvironmentCompareOptions{Timeout: durationFromMS(input.TimeoutMS)})
	if err != nil {
		out.Error = diagnosticError("Ortam karşılaştırması tamamlanamadı", err)
		return out
	}
	out.Method = result.Method
	out.Path = result.Path
	out.Responses = make([]EnvironmentResponse, 0, len(result.Responses))
	out.Comparisons = make([]EnvironmentDiff, 0, len(result.Comparisons))
	for _, response := range result.Responses {
		out.Responses = append(out.Responses, EnvironmentResponse{
			Name: response.Name, URL: response.URL, StatusCode: response.StatusCode,
			DurationMS: response.Duration.Milliseconds(), Headers: response.Headers,
			Body: response.Body, ContentType: response.ContentType,
			Truncated: response.Truncated, Error: response.Error,
		})
	}
	for _, comparison := range result.Comparisons {
		differences := make([]EnvironmentJSONDifference, 0, len(comparison.JSONDifferences))
		for _, difference := range comparison.JSONDifferences {
			differences = append(differences, EnvironmentJSONDifference{
				Path: difference.Path, Kind: difference.Kind,
				Baseline: difference.Baseline, Candidate: difference.Candidate,
			})
		}
		out.Comparisons = append(out.Comparisons, EnvironmentDiff{
			Baseline: comparison.Baseline, Candidate: comparison.Candidate,
			StatusMatch: comparison.StatusMatch, BaselineStatus: comparison.BaselineStatus,
			CandidateStatus:            comparison.CandidateStatus,
			HeaderDifferences:          comparison.HeaderDifferences,
			HeaderDifferencesTruncated: comparison.HeaderDifferencesTruncated,
			BodyEqual:                  comparison.BodyEqual,
			BodyMode:                   comparison.BodyMode,
			JSONDifferences:            differences,
			JSONDifferencesTruncated:   comparison.JSONDifferencesTruncated,
			Error:                      comparison.Error,
		})
	}
	return out
}

func (b *Bridge) AnalyzeThreadDump(input ThreadDumpInput) ThreadDumpResult {
	report, err := diagnostics.AnalyzeThreadDump(input.Text, diagnostics.ThreadDumpOptions{})
	if err != nil {
		return ThreadDumpResult{
			StateCounts: map[string]int{},
			Error:       diagnosticError("Thread dump analiz edilemedi", err),
		}
	}
	out := ThreadDumpResult{
		ThreadCount: report.ThreadCount, StateCounts: report.StateCounts,
		DeadlockDetected: report.DeadlockDetected, DeadlockClues: report.DeadlockClues,
		Truncated:      report.Truncated,
		BlockedThreads: make([]ThreadIssue, 0, len(report.BlockedThreads)),
		RepeatedStacks: make([]RepeatedStack, 0, len(report.RepeatedStacks)),
	}
	for _, issue := range report.BlockedThreads {
		out.BlockedThreads = append(out.BlockedThreads, ThreadIssue{
			Name: issue.Name, State: issue.State, Clues: issue.Clues,
		})
	}
	for _, stack := range report.RepeatedStacks {
		out.RepeatedStacks = append(out.RepeatedStacks, RepeatedStack{
			Count: stack.Count, Frames: stack.Frames, Threads: stack.Threads,
		})
	}
	return out
}

func (b *Bridge) SearchTraceLog(input LogSearchInput) LogSearchResult {
	result, err := diagnostics.SearchTraceLog(input.Text, input.Query, diagnostics.LogSearchOptions{
		CaseSensitive: input.CaseSensitive,
	})
	if err != nil {
		return LogSearchResult{
			Matches: []LogMatch{},
			Error:   diagnosticError("Log araması tamamlanamadı", err),
		}
	}
	out := LogSearchResult{
		Query: result.Query, ScannedLines: result.ScannedLines,
		Truncated: result.Truncated, Matches: make([]LogMatch, 0, len(result.Matches)),
	}
	for _, match := range result.Matches {
		out.Matches = append(out.Matches, LogMatch{
			LineNumber: match.LineNumber, Line: match.Line,
		})
	}
	return out
}

func (b *Bridge) AnalyzeEndpointCoverage(input CoverageInput) CoverageResult {
	if len(input.Known) == 0 && len(input.Observed) == 0 {
		input.Known, input.Observed = b.recordedCoverageInput()
		if len(input.Known) == 0 {
			return CoverageResult{
				Endpoints: []EndpointCoverage{},
				Error: &UserError{
					Code:    "coverage_spec_missing",
					Title:   "Coverage kaynağı bulunamadı",
					Message: "Bu oturumda içe aktarılmış OpenAPI endpoint’i yok.",
					Hint:    "Önce OpenAPI dosyası içe aktarın veya endpoint listesini elle girin.",
				},
			}
		}
	}
	known := make([]diagnostics.KnownEndpoint, 0, len(input.Known))
	for _, endpoint := range input.Known {
		known = append(known, diagnostics.KnownEndpoint{
			Method: endpoint.Method, Path: endpoint.Path,
		})
	}
	observed := make([]diagnostics.ObservedCall, 0, len(input.Observed))
	for _, call := range input.Observed {
		observed = append(observed, diagnostics.ObservedCall{
			Method: call.Method, Path: call.Path, Count: call.Count,
		})
	}
	report, err := diagnostics.AnalyzeEndpointCoverage(known, observed)
	if err != nil {
		return CoverageResult{
			Endpoints: []EndpointCoverage{},
			Error:     diagnosticError("Endpoint coverage hesaplanamadı", err),
		}
	}
	out := CoverageResult{
		TotalKnown: report.TotalKnown, Covered: report.Covered,
		CoveragePercent: report.CoveragePercent,
		Endpoints:       make([]EndpointCoverage, 0, len(report.Endpoints)),
		UnknownObserved: make([]ObservedCall, 0, len(report.UnknownObserved)),
	}
	for _, endpoint := range report.Endpoints {
		out.Endpoints = append(out.Endpoints, EndpointCoverage{
			Method: endpoint.Method, Path: endpoint.Path,
			HitCount: endpoint.HitCount, ObservedPaths: endpoint.ObservedPaths,
		})
	}
	for _, call := range report.UnknownObserved {
		out.UnknownObserved = append(out.UnknownObserved, ObservedCall{
			Method: call.Method, Path: call.Path, Count: call.Count,
		})
	}
	return out
}

func (b *Bridge) recordObservedCall(method, path string) {
	method = strings.ToUpper(strings.TrimSpace(method))
	path = strings.TrimSpace(path)
	if method == "" {
		return
	}
	if path == "" {
		path = "/"
	}
	b.mu.Lock()
	if b.observed == nil {
		b.observed = make(map[string]int)
	}
	key := method + "\x00" + path
	if count, exists := b.observed[key]; exists {
		b.observed[key] = count + 1
		b.mu.Unlock()
		return
	}
	if len(b.observedOrder) < maxObservedCoverageEntries {
		b.observedOrder = append(b.observedOrder, key)
	} else {
		evictedKey := b.observedOrder[b.observedNext]
		delete(b.observed, evictedKey)
		b.observedOrder[b.observedNext] = key
		b.observedNext = (b.observedNext + 1) % maxObservedCoverageEntries
	}
	b.observed[key] = 1
	b.mu.Unlock()
}

func (b *Bridge) ResetEndpointCoverage() {
	b.mu.Lock()
	b.observed = make(map[string]int)
	b.observedOrder = make([]string, 0, maxObservedCoverageEntries)
	b.observedNext = 0
	b.mu.Unlock()
}

func (b *Bridge) recordedCoverageInput() ([]KnownEndpoint, []ObservedCall) {
	b.mu.Lock()
	defer b.mu.Unlock()
	known := make([]KnownEndpoint, 0)
	specIDs := make([]string, 0, 1)
	if len(b.specOrder) > 0 {
		specIDs = append(specIDs, b.specOrder[len(b.specOrder)-1])
	} else {
		for specID := range b.specs {
			specIDs = append(specIDs, specID)
		}
		sort.Strings(specIDs)
	}
	for _, specID := range specIDs {
		endpoints := b.specs[specID]
		for _, endpoint := range endpoints {
			known = append(known, KnownEndpoint{
				Method: endpoint.Method,
				Path:   endpoint.Path,
			})
		}
	}
	observed := make([]ObservedCall, 0, len(b.observed))
	for key, count := range b.observed {
		method, path, ok := strings.Cut(key, "\x00")
		if !ok {
			continue
		}
		observed = append(observed, ObservedCall{
			Method: method,
			Path:   path,
			Count:  count,
		})
	}
	return known, observed
}

func (b *Bridge) currentMockServer() *mockserver.Server {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.mock == nil {
		b.mock = mockserver.New(mockserver.Options{})
	}
	return b.mock
}

func toMockRoutes(routes []MockRoute) []mockserver.Route {
	result := make([]mockserver.Route, 0, len(routes))
	for _, route := range routes {
		result = append(result, mockserver.Route{
			ID: route.ID, Method: route.Method, Path: route.Path,
			Status: route.Status, Headers: route.Headers, Body: route.Body,
			DelayMS: route.DelayMS, Enabled: route.Enabled,
		})
	}
	return result
}

func mockSnapshot(server *mockserver.Server, importedPath string) MockServerSnapshot {
	state := server.Status()
	out := MockServerSnapshot{
		State: MockServerState{
			Running: state.Running, Host: state.Host, Port: state.Port,
			BaseURL: state.BaseURL, RouteCount: state.RouteCount,
			EnabledCount: state.EnabledCount, HitCount: state.HitCount,
			TotalHits: state.TotalHits, LastError: state.LastError,
		},
		Routes:       make([]MockRoute, 0),
		Hits:         make([]MockHit, 0),
		ImportedPath: importedPath,
	}
	if !state.StartedAt.IsZero() {
		out.State.StartedAt = state.StartedAt.UTC().Format(time.RFC3339Nano)
	}
	for _, route := range server.Routes() {
		out.Routes = append(out.Routes, MockRoute{
			ID: route.ID, Method: route.Method, Path: route.Path,
			Status: route.Status, Headers: nonNilMap(route.Headers), Body: route.Body,
			DelayMS: route.DelayMS, Enabled: route.Enabled,
		})
	}
	for _, hit := range server.Hits() {
		out.Hits = append(out.Hits, MockHit{
			ID: hit.ID, RouteID: hit.RouteID, Method: hit.Method, Path: hit.Path,
			RawQuery: hit.RawQuery, Status: hit.Status, Matched: hit.Matched,
			PathParams: hit.PathParams,
			Timestamp:  hit.Timestamp.UTC().Format(time.RFC3339Nano),
			DurationMS: hit.DurationMS,
		})
	}
	return out
}

func mockFailure(server *mockserver.Server, code, title string, err error) MockServerSnapshot {
	out := mockSnapshot(server, "")
	out.Error = &UserError{
		Code: code, Title: title, Message: err.Error(),
		Hint: "Route, port ve server durumunu kontrol edin.",
	}
	return out
}

func durationFromMS(value int) time.Duration {
	if value <= 0 {
		return 0
	}
	return time.Duration(value) * time.Millisecond
}

func toolError(code, title string, err error) *UserError {
	userError := &UserError{
		Code: code, Title: title, Message: "Bağlantı veya protokol işlemi başarısız oldu.",
		Hint:      "Adres, timeout, TLS ve kimlik doğrulama bilgilerini kontrol edin.",
		Technical: err.Error(),
	}
	if errors.Is(err, context.DeadlineExceeded) {
		userError.Code = "tool_timeout"
		userError.Message = "Hedef belirtilen sürede yanıt vermedi."
		userError.Technical = ""
	} else if errors.Is(err, context.Canceled) {
		userError.Code = "tool_canceled"
		userError.Message = "İşlem iptal edildi."
		userError.Technical = ""
	} else if strings.Contains(strings.ToLower(err.Error()), "required") ||
		strings.Contains(strings.ToLower(err.Error()), "invalid") ||
		strings.Contains(strings.ToLower(err.Error()), "must ") {
		userError.Code = "invalid_input"
		userError.Message = err.Error()
		userError.Technical = ""
	}
	return userError
}

func diagnosticError(title string, err error) *UserError {
	code := diagnostics.ErrorCode(err)
	if code == "" {
		code = "diagnostic_failed"
	}
	return &UserError{
		Code: code, Title: title, Message: err.Error(),
		Hint: "Girdi, erişim yetkisi, Actuator görünürlüğü ve timeout değerlerini kontrol edin.",
	}
}

func fromMetricSnapshot(snapshot diagnostics.MetricSnapshot) ActuatorMetricSnapshot {
	out := ActuatorMetricSnapshot{
		CapturedAt: snapshot.CapturedAt.UTC().Format(time.RFC3339Nano),
		Metrics:    make(map[string]ActuatorMetricSample, len(snapshot.Metrics)),
		Failures:   snapshot.Failures,
	}
	for name, metric := range snapshot.Metrics {
		tags := make([]ActuatorMetricTag, 0, len(metric.AvailableTags))
		for _, tag := range metric.AvailableTags {
			tags = append(tags, ActuatorMetricTag{
				Tag:    tag.Tag,
				Values: nonNilSlice(tag.Values),
			})
		}
		out.Metrics[name] = ActuatorMetricSample{
			Name: metric.Name, Description: metric.Description, BaseUnit: metric.BaseUnit,
			Measurements: nonNilMap(metric.Measurements), AvailableTags: tags,
		}
	}
	return out
}

func toMetricSnapshot(snapshot ActuatorMetricSnapshot) diagnostics.MetricSnapshot {
	capturedAt, _ := time.Parse(time.RFC3339Nano, snapshot.CapturedAt)
	out := diagnostics.MetricSnapshot{
		CapturedAt: capturedAt,
		Metrics:    make(map[string]diagnostics.MetricSample, len(snapshot.Metrics)),
		Failures:   snapshot.Failures,
	}
	for name, metric := range snapshot.Metrics {
		tags := make([]diagnostics.MetricTag, 0, len(metric.AvailableTags))
		for _, tag := range metric.AvailableTags {
			tags = append(tags, diagnostics.MetricTag{Tag: tag.Tag, Values: tag.Values})
		}
		out.Metrics[name] = diagnostics.MetricSample{
			Name: metric.Name, Description: metric.Description, BaseUnit: metric.BaseUnit,
			Measurements: metric.Measurements, AvailableTags: tags,
		}
	}
	return out
}
