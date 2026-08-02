package canbridge

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"validex/internal/diagnostics"
	"validex/internal/mockserver"
	"validex/internal/protocols"
)

func (b *Bridge) GetMockServer() MockServerSnapshot {
	return b.snapshotMockServer("")
}

func (b *Bridge) UpdateMockRoutes(routes []MockRoute) MockServerSnapshot {
	b.mockMu.Lock()
	defer b.mockMu.Unlock()
	server := b.currentMockServer()
	if err := server.ReplaceRoutes(toMockRoutes(routes)); err != nil {
		return mockFailure(server, userErrorMockRoutesUpdate, err)
	}
	return mockSnapshot(server, "")
}

func (b *Bridge) StartMockServer(input MockStartInput) MockServerSnapshot {
	b.mockMu.Lock()
	defer b.mockMu.Unlock()
	current := b.currentMockServer()
	if current.Status().Running {
		return mockFailure(current, userErrorMockAlreadyRunning, nil)
	}
	routes := current.Routes()
	server := mockserver.New(mockserver.Options{EnableCORS: input.EnableCORS})
	if err := server.ReplaceRoutes(routes); err != nil {
		return mockFailure(current, userErrorMockRoutesPrepareStart, err)
	}
	if _, err := server.Start(input.Port); err != nil {
		return mockFailure(current, userErrorMockServerStart, err)
	}
	b.mu.Lock()
	b.mock = server
	b.mu.Unlock()
	return mockSnapshot(server, "")
}

func (b *Bridge) StopMockServer() MockServerSnapshot {
	b.mockMu.Lock()
	defer b.mockMu.Unlock()
	server := b.currentMockServer()
	ctx, cancel := context.WithTimeout(b.operationContext(), 3*time.Second)
	defer cancel()
	if err := server.Stop(ctx); err != nil {
		return mockFailure(server, userErrorMockServerStop, err)
	}
	return mockSnapshot(server, "")
}

func (b *Bridge) ClearMockHits() MockServerSnapshot {
	b.mockMu.Lock()
	defer b.mockMu.Unlock()
	server := b.currentMockServer()
	server.ClearHits()
	return mockSnapshot(server, "")
}

func (b *Bridge) ImportMockOpenAPI() MockServerSnapshot {
	ctx := b.runtimeContext()
	if ctx == nil {
		out := b.snapshotMockServer("")
		out.Error = newUserError(userErrorMockImportRuntimeUnavailable, nil, nil)
		return out
	}
	path, err := b.filePicker.Open(ctx, fileDialogOptions{
		Title:      "Mock route üretilecek OpenAPI dosyasını seç",
		Extensions: []string{"yaml", "yml", "json"},
	})
	if err != nil {
		out := b.snapshotMockServer("")
		out.Error = newUserError(userErrorMockImportFileDialog, nil, err)
		return out
	}
	if path == "" {
		snapshot := b.snapshotMockServer("")
		snapshot.Canceled = true
		return snapshot
	}
	routes, err := mockserver.ImportOpenAPIContext(ctx, path)
	if err != nil {
		b.mockMu.Lock()
		defer b.mockMu.Unlock()
		return mockFailure(
			b.currentMockServer(),
			userErrorMockImportInvalidOpenAPI,
			err,
		)
	}
	b.mockMu.Lock()
	defer b.mockMu.Unlock()
	server := b.currentMockServer()
	if !b.runtimeContextIsCurrent(ctx) {
		return mockFailure(
			server,
			userErrorMockImportCanceled,
			context.Canceled,
		)
	}
	if err := server.ReplaceRoutes(routes); err != nil {
		return mockFailure(server, userErrorMockImportApplyRoutes, err)
	}
	return mockSnapshot(server, path)
}

func (b *Bridge) RunSSE(input SSEInput) SSEResult {
	ctx, finish, err := b.beginToolOperation(input.OperationID)
	if err != nil {
		return SSEResult{
			Headers: map[string][]string{},
			Events:  []SSEEvent{},
			Error:   toolError(userErrorProtocolSSEStart, err),
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
		out.Error = toolError(userErrorProtocolSSERead, err)
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
		out.Error = diagnosticError(userErrorDiagnosticsActuatorPrepare, err)
		return out
	}
	ctx := b.operationContext()
	health, err := client.FetchHealth(ctx)
	if err != nil {
		out.Error = diagnosticError(userErrorDiagnosticsActuatorHealth, err)
		return out
	}
	out.Health = &ActuatorHealth{
		Status: health.Status, Components: health.Components,
		Groups: health.Groups, Data: nonNilMap(health.Data),
	}
	metrics, err := client.FetchMetrics(ctx, input.MetricNames)
	if err != nil {
		out.Error = diagnosticError(userErrorDiagnosticsActuatorMetrics, err)
		return out
	}
	out.Metrics = fromMetricSnapshot(metrics)
	if input.IncludeMappings {
		mappings, mappingsErr := client.FetchMappings(ctx)
		if mappingsErr != nil {
			out.Error = diagnosticError(
				userErrorDiagnosticsActuatorMappings,
				mappingsErr,
			)
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
		out.Error = diagnosticError(
			userErrorDiagnosticsEnvironmentCompare,
			err,
		)
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
				Path: difference.Path, Kind: string(difference.Kind),
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
			BodyMode:                   string(comparison.BodyMode),
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
			Error: diagnosticError(
				userErrorDiagnosticsThreadDumpAnalyze,
				err,
			),
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
			Error: diagnosticError(
				userErrorDiagnosticsTraceLogSearch,
				err,
			),
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
				Error: newUserError(
					userErrorDiagnosticsCoverageSpecMissing,
					nil,
					nil,
				),
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
			Error: diagnosticError(
				userErrorDiagnosticsCoverageAnalyze,
				err,
			),
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
			ObservedPathsTruncated: endpoint.ObservedPathsTruncated,
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
	method, path, ok := normalizedObservedCall(method, path)
	if !ok {
		return
	}
	b.mu.Lock()
	b.recordObservedCallLocked(method, path)
	b.mu.Unlock()
}

func (b *Bridge) recordObservedCallForContext(
	ctx context.Context,
	method string,
	path string,
) {
	method, path, ok := normalizedObservedCall(method, path)
	if !ok || ctx == nil || ctx.Err() != nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.lifecycleCtx != ctx {
		return
	}
	b.recordObservedCallLocked(method, path)
}

func (b *Bridge) recordObservedCallLocked(method, path string) {
	if b.observed == nil {
		b.observed = make(map[string]int)
	}
	key := method + "\x00" + path
	if count, exists := b.observed[key]; exists {
		b.observed[key] = count + 1
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
}

func normalizedObservedCall(
	method string,
	path string,
) (string, string, bool) {
	method = strings.ToUpper(strings.TrimSpace(method))
	path = strings.TrimSpace(path)
	if method == "" {
		return "", "", false
	}
	if path == "" {
		path = "/"
	}
	return method, path, true
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

func (b *Bridge) snapshotMockServer(importedPath string) MockServerSnapshot {
	b.mockMu.Lock()
	defer b.mockMu.Unlock()
	return mockSnapshot(b.currentMockServer(), importedPath)
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

func mockFailure(
	server *mockserver.Server,
	definition userErrorDefinition,
	err error,
) MockServerSnapshot {
	out := mockSnapshot(server, "")
	out.Error = newUserError(definition, nil, err)
	return out
}

func durationFromMS(value int) time.Duration {
	if value <= 0 {
		return 0
	}
	return time.Duration(value) * time.Millisecond
}

func toolError(
	definitions protocolUserErrorDefinitions,
	err error,
) *UserError {
	definition := definitions.Failed
	if errors.Is(err, context.DeadlineExceeded) {
		definition = definitions.Timeout
	} else if errors.Is(err, context.Canceled) {
		definition = definitions.Canceled
	} else if errors.Is(err, errInvalidToolOperation) ||
		errors.Is(err, protocols.ErrInvalidRequest) {
		definition = definitions.InvalidInput
	}
	return newUserError(definition, nil, err)
}

func diagnosticError(
	contextDefinition diagnosticUserErrorContext,
	err error,
) *UserError {
	class := diagnosticErrorFailed
	if errors.Is(err, context.DeadlineExceeded) {
		class = diagnosticErrorTimeout
	} else if errors.Is(err, context.Canceled) {
		class = diagnosticErrorCanceled
	} else {
		switch diagnostics.ErrorCode(err) {
		case diagnostics.CodeInvalidInput:
			class = diagnosticErrorInvalidInput
		case diagnostics.CodeUnsafeMethod:
			class = diagnosticErrorUnsafeMethod
		case diagnostics.CodeRequestFailed:
			class = diagnosticErrorRequestFailed
		case diagnostics.CodeResponseTooLarge:
			class = diagnosticErrorResponseTooLarge
		case diagnostics.CodeInvalidResponse:
			class = diagnosticErrorInvalidResponse
		case diagnostics.CodeLimitExceeded:
			class = diagnosticErrorLimitExceeded
		}
	}
	return newUserError(contextDefinition.definition(class), nil, err)
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
