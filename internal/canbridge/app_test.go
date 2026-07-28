//go:build canbridge

package canbridge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"unsafe"

	"validex/internal/nativewebview"
)

func TestAppOriginRestrictsDevelopmentBridgeToViteLoopback(t *testing.T) {
	for _, allowed := range []string{
		"http://127.0.0.1:34116",
		"http://localhost:34117/path",
		"http://[::1]:34215",
	} {
		if _, err := appOrigin(allowed, true); err != nil {
			t.Errorf("loopback URL %q was rejected: %v", allowed, err)
		}
	}
	for _, rejected := range []string{
		"https://127.0.0.1:34116",
		"http://127.0.0.1",
		"http://127.0.0.1:0",
		"http://127.0.0.1:34216",
		"http://example.test:34116",
	} {
		if _, err := appOrigin(rejected, true); err == nil {
			t.Errorf("unsafe development URL %q was accepted", rejected)
		}
	}
}

func TestCanbridgeStartupBannerAdvertisesSelectedURLAndPort(t *testing.T) {
	banner := canbridgeStartupBanner(
		"Validex",
		"http://127.0.0.1:49152/",
		false,
		true,
	)
	for _, expected := range []string{
		"Validex is powered by canbridge",
		"Frontend  http://127.0.0.1:49152/",
		"Port      49152 (dynamic fallback; preferred 34117 was busy)",
		"Transport native WebView IPC · TypeScript ↔ Go",
	} {
		if !strings.Contains(banner, expected) {
			t.Fatalf("banner does not contain %q:\n%s", expected, banner)
		}
	}
}

func TestDecodeBindingStringArguments(t *testing.T) {
	t.Parallel()

	arguments, err := decodeBindingStringArguments(
		`["capability","callback","Bootstrap","[]"]`,
		4,
	)
	if err != nil {
		t.Fatalf("decodeBindingStringArguments() error = %v", err)
	}
	expected := []string{"capability", "callback", "Bootstrap", "[]"}
	if len(arguments) != len(expected) {
		t.Fatalf("arguments = %#v, want %#v", arguments, expected)
	}
	for index := range expected {
		if arguments[index] != expected[index] {
			t.Fatalf("arguments = %#v, want %#v", arguments, expected)
		}
	}

	for _, test := range []struct {
		name        string
		requestJSON string
		count       int
		wantError   string
	}{
		{
			name:        "not an array",
			requestJSON: `{"capability":"test"}`,
			count:       4,
			wantError:   "must be a JSON array",
		},
		{
			name:        "malformed JSON",
			requestJSON: `["capability"`,
			count:       4,
			wantError:   "decode native binding request JSON",
		},
		{
			name:        "wrong argument count",
			requestJSON: `["capability","callback","Bootstrap"]`,
			count:       4,
			wantError:   "expects 4 string arguments, received 3",
		},
		{
			name:        "non-string argument",
			requestJSON: `["capability",42,"Bootstrap","[]"]`,
			count:       4,
			wantError:   "argument 2 must be a string",
		},
		{
			name:        "null argument",
			requestJSON: `["capability",null,"Bootstrap","[]"]`,
			count:       4,
			wantError:   "argument 2 must be a string",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := decodeBindingStringArguments(
				test.requestJSON,
				test.count,
			)
			if err == nil || !strings.Contains(err.Error(), test.wantError) {
				t.Fatalf("error = %v, want containing %q", err, test.wantError)
			}
		})
	}
}

func TestValidateBindingEnvelopeSizeRejectsBeforeJSONDecode(t *testing.T) {
	t.Parallel()
	if err := validateBindingEnvelopeSize("test", "1234", 4); err != nil {
		t.Fatalf("exact envelope limit error = %v", err)
	}
	err := validateBindingEnvelopeSize("test", "12345", 4)
	if err == nil || !strings.Contains(
		err.Error(),
		"native canbridge test request exceeds 4 bytes",
	) {
		t.Fatalf("oversized envelope error = %v", err)
	}
}

func TestIPCBindingAdaptersDecodeAndForwardRequests(t *testing.T) {
	view := &fakeWebView{evaluated: make(chan string, 1)}
	runtime := &ipcRuntime{
		webview:    view,
		bridge:     NewBridge(),
		capability: "test-capability",
	}

	if err := runtime.dispatchBinding(
		`["test-capability","adapter-callback","Bootstrap","[]"]`,
	); err != nil {
		t.Fatalf("dispatchBinding() error = %v", err)
	}
	select {
	case script := <-view.evaluated:
		if !strings.Contains(script, `"callbackId":"adapter-callback"`) ||
			!strings.Contains(script, `"workspaceId":"validex-workspace"`) {
			t.Fatalf("unexpected callback script: %s", script)
		}
	case <-time.After(time.Second):
		t.Fatal("dispatch binding callback was not delivered")
	}
	runtime.concurrentCalls.Wait()

	if err := runtime.logBrowserMessageBinding(
		`["test-capability","info","native adapter ready"]`,
	); err != nil {
		t.Fatalf("logBrowserMessageBinding() error = %v", err)
	}
}

func TestIPCBindingAdaptersRejectInvalidArguments(t *testing.T) {
	t.Parallel()

	runtime := &ipcRuntime{capability: "test-capability"}
	for _, test := range []struct {
		name      string
		handler   nativewebview.BindingHandler
		request   string
		wantError string
	}{
		{
			name:      "dispatcher wrong count",
			handler:   runtime.dispatchBinding,
			request:   `["test-capability","callback","Bootstrap"]`,
			wantError: "dispatcher request",
		},
		{
			name:      "dispatcher non-string",
			handler:   runtime.dispatchBinding,
			request:   `["test-capability","callback","Bootstrap",1]`,
			wantError: "argument 4 must be a string",
		},
		{
			name:      "logger malformed JSON",
			handler:   runtime.logBrowserMessageBinding,
			request:   `["test-capability"`,
			wantError: "logger request",
		},
		{
			name:      "logger wrong count",
			handler:   runtime.logBrowserMessageBinding,
			request:   `["test-capability","info"]`,
			wantError: "expects 3 string arguments, received 2",
		},
		{
			name:      "logger non-string",
			handler:   runtime.logBrowserMessageBinding,
			request:   `["test-capability","info",false]`,
			wantError: "argument 3 must be a string",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			err := test.handler(test.request)
			if err == nil || !strings.Contains(err.Error(), test.wantError) {
				t.Fatalf("error = %v, want containing %q", err, test.wantError)
			}
		})
	}
}

func TestIPCRuntimeDispatchesOffThreadAndDeliversPromiseCallback(t *testing.T) {
	view := &fakeWebView{evaluated: make(chan string, 1)}
	runtime := &ipcRuntime{
		webview:    view,
		bridge:     NewBridge(),
		capability: "test-capability",
	}

	if err := runtime.dispatch(
		"test-capability",
		"callback-1",
		bridgeMethodBootstrap,
		"[]",
	); err != nil {
		t.Fatal(err)
	}

	select {
	case script := <-view.evaluated:
		if !strings.Contains(script, `"callbackId":"callback-1"`) ||
			!strings.Contains(script, `"workspaceId":"validex-workspace"`) {
			t.Fatalf("unexpected callback script: %s", script)
		}
	case <-time.After(time.Second):
		t.Fatal("native IPC callback was not delivered")
	}
	runtime.concurrentCalls.Wait()
	assertIPCAdmissionReleased(t, runtime)

	if err := runtime.dispatch(
		"wrong",
		"callback-2",
		bridgeMethodBootstrap,
		"[]",
	); err == nil {
		t.Fatal("invalid capability was accepted")
	}
}

func TestIPCRuntimeAllowsCancellationWhileRequestIsRunning(t *testing.T) {
	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(
		_ http.ResponseWriter,
		request *http.Request,
	) {
		close(started)
		<-request.Context().Done()
	}))
	defer server.Close()

	view := &fakeWebView{evaluated: make(chan string, 2)}
	runtime := &ipcRuntime{
		webview:    view,
		bridge:     NewBridge(),
		capability: "test-capability",
	}
	requestArguments, err := json.Marshal([]any{RequestInput{
		ID:        "ipc-request",
		Method:    http.MethodGet,
		URL:       server.URL,
		TimeoutMS: 10_000,
	}})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.dispatch(
		"test-capability",
		"send-callback",
		bridgeMethodSendRequest,
		string(requestArguments),
	); err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("request did not reach the test server")
	}

	cancelArguments, err := json.Marshal([]any{"ipc-request"})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.dispatch(
		"test-capability",
		"cancel-callback",
		bridgeMethodCancelRequest,
		string(cancelArguments),
	); err != nil {
		t.Fatal(err)
	}

	var callbacks strings.Builder
	for range 2 {
		select {
		case script := <-view.evaluated:
			callbacks.WriteString(script)
		case <-time.After(time.Second):
			t.Fatal("request cancellation callback was not delivered")
		}
	}
	runtime.concurrentCalls.Wait()
	assertIPCAdmissionReleased(t, runtime)
	output := callbacks.String()
	for _, expected := range []string{
		`"callbackId":"send-callback"`,
		`"callbackId":"cancel-callback"`,
		`"code":"request_canceled"`,
		`"result":true`,
	} {
		if !strings.Contains(output, expected) {
			t.Fatalf("callbacks do not contain %q: %s", expected, output)
		}
	}
}

func TestIPCRuntimeKeepsCancellationFastLaneAvailableWhenConcurrentLaneIsFull(
	t *testing.T,
) {
	bridge := NewBridge()
	picker := &blockingLifecycleFilePicker{
		started:  make(chan struct{}),
		canceled: make(chan struct{}),
		release:  make(chan struct{}),
	}
	bridge.filePicker = picker
	appContext, cancelApp := context.WithCancel(context.Background())
	Startup(bridge)(appContext)

	view := &fakeWebView{evaluated: make(chan string, 4)}
	runtime := &ipcRuntime{
		webview:    view,
		bridge:     bridge,
		capability: "test-capability",
		concurrentAdmission: ipcAdmissionState{
			limits: ipcAdmissionLimits{
				maxCalls:         1,
				maxArgumentBytes: 1 << 10,
			},
		},
	}
	blockingCallAccepted := false
	cleanedUp := false
	defer func() {
		if cleanedUp {
			return
		}
		cancelApp()
		if blockingCallAccepted {
			close(picker.release)
			runtime.concurrentCalls.Wait()
		}
		runtime.close()
		Shutdown(bridge)(context.Background())
	}()

	if err := runtime.dispatch(
		"test-capability",
		"blocking-callback",
		bridgeMethodImportOpenAPI,
		"[]",
	); err != nil {
		t.Fatal(err)
	}
	blockingCallAccepted = true
	select {
	case <-picker.started:
	case <-time.After(time.Second):
		t.Fatal("concurrent bridge call did not start")
	}

	err := runtime.dispatch(
		"test-capability",
		"overflow-callback",
		bridgeMethodBootstrap,
		"[]",
	)
	if err == nil || !strings.Contains(
		err.Error(),
		"concurrent lane is full: maximum 1 in-flight calls",
	) {
		t.Fatalf("concurrent saturation error = %v", err)
	}
	select {
	case script := <-view.evaluated:
		t.Fatalf("saturated dispatch unexpectedly created work: %s", script)
	default:
	}

	cancelArguments, err := json.Marshal([]any{"missing-request"})
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.dispatch(
		"test-capability",
		"cancel-callback",
		bridgeMethodCancelRequest,
		string(cancelArguments),
	); err != nil {
		t.Fatalf("cancellation fast lane was blocked: %v", err)
	}
	select {
	case script := <-view.evaluated:
		if !strings.Contains(script, `"callbackId":"cancel-callback"`) ||
			!strings.Contains(script, `"result":false`) {
			t.Fatalf("unexpected cancellation callback: %s", script)
		}
	case <-time.After(time.Second):
		t.Fatal("cancellation fast lane did not deliver its callback")
	}

	cancelApp()
	select {
	case <-picker.canceled:
	case <-time.After(time.Second):
		t.Fatal("blocking call did not observe application cancellation")
	}
	close(picker.release)
	runtime.concurrentCalls.Wait()
	runtime.close()
	Shutdown(bridge)(context.Background())
	cleanedUp = true
	assertIPCAdmissionReleased(t, runtime)

	for {
		select {
		case script := <-view.evaluated:
			if strings.Contains(script, `"callbackId":"overflow-callback"`) {
				t.Fatalf("saturated dispatch opened a goroutine: %s", script)
			}
		default:
			return
		}
	}
}

func TestIPCRuntimeBoundsCancellationFastLane(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name      string
		admission ipcAdmissionState
		wantError string
	}{
		{
			name: "in-flight calls",
			admission: ipcAdmissionState{
				limits: ipcAdmissionLimits{
					maxCalls:         1,
					maxArgumentBytes: 1 << 10,
				},
				inFlightCalls:         1,
				acceptedArgumentBytes: 2,
			},
			wantError: "cancellation lane is full: maximum 1 in-flight calls",
		},
		{
			name: "accepted argument bytes",
			admission: ipcAdmissionState{
				limits: ipcAdmissionLimits{
					maxCalls:         2,
					maxArgumentBytes: 2,
				},
				inFlightCalls:         1,
				acceptedArgumentBytes: 2,
			},
			wantError: "cancellation lane byte budget exceeded: maximum 2 accepted argument bytes",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			view := &fakeWebView{evaluated: make(chan string, 1)}
			runtime := &ipcRuntime{
				webview:               view,
				bridge:                NewBridge(),
				capability:            "test-capability",
				cancellationAdmission: test.admission,
			}
			err := runtime.dispatch(
				"test-capability",
				"cancel-overflow",
				bridgeMethodCancelToolOperation,
				`["operation"]`,
			)
			if err == nil || !strings.Contains(err.Error(), test.wantError) {
				t.Fatalf("fast-lane saturation error = %v", err)
			}
			select {
			case script := <-view.evaluated:
				t.Fatalf("saturated fast lane unexpectedly created work: %s", script)
			default:
			}
		})
	}
}

func TestIPCAdmissionStateBoundsTotalAcceptedArgumentBytes(t *testing.T) {
	t.Parallel()

	admission := ipcAdmissionState{
		limits: ipcAdmissionLimits{
			maxCalls:         2,
			maxArgumentBytes: 10,
		},
	}
	defaults := ipcAdmissionLimits{
		maxCalls:         maxConcurrentIPCCalls,
		maxArgumentBytes: maxConcurrentIPCArgumentBytes,
	}
	if err := admission.acquire(
		ipcAdmissionConcurrent,
		6,
		defaults,
	); err != nil {
		t.Fatalf("first admission failed: %v", err)
	}
	if err := admission.acquire(
		ipcAdmissionConcurrent,
		5,
		defaults,
	); err == nil || !strings.Contains(
		err.Error(),
		"maximum 10 accepted argument bytes",
	) {
		t.Fatalf("byte-budget error = %v", err)
	}
	if admission.inFlightCalls != 1 ||
		admission.acceptedArgumentBytes != 6 {
		t.Fatalf("failed admission mutated state: %#v", admission)
	}

	admission.release(6)
	if admission.inFlightCalls != 0 ||
		admission.acceptedArgumentBytes != 0 {
		t.Fatalf("released admission state = %#v", admission)
	}
}

func TestMarshalIPCResponseReplacesOversizedPayloadWithSmallError(t *testing.T) {
	t.Parallel()

	const responseLimit = 96
	payload := marshalIPCResponse(ipcResponse{
		CallbackID: "large-callback",
		Result:     strings.Repeat("x", responseLimit*2),
	}, responseLimit)
	if len(payload) > 256 {
		t.Fatalf("oversized response fallback is not small: %d bytes", len(payload))
	}

	var response ipcResponse
	if err := json.Unmarshal(payload, &response); err != nil {
		t.Fatalf("decode fallback response: %v", err)
	}
	if response.CallbackID != "large-callback" ||
		!strings.Contains(response.Error, "exceeds 96 byte transport limit") ||
		response.Result != nil {
		t.Fatalf("fallback response = %#v", response)
	}
}

func TestIPCRuntimePreservesCollectionCommandAcceptanceOrder(t *testing.T) {
	bridge := newBridgeWithCollectionLibraryDir(t.TempDir())
	if result := bridge.SaveCollectionLibrary(initialCollectionLibraryDocument); !result.Saved {
		t.Fatalf("seed save failed: %#v", result)
	}

	view := &fakeWebView{evaluated: make(chan string, 2)}
	runtime := &ipcRuntime{
		webview:    view,
		bridge:     bridge,
		capability: "test-capability",
	}
	latest := `{"version":1,"state":{"collections":[{"id":"latest"}]}}`
	saveArguments, err := json.Marshal([]any{latest})
	if err != nil {
		t.Fatal(err)
	}

	// Block the service so Save and Load are both accepted before execution.
	// The collection execution policy must preserve that acceptance order.
	bridge.collectionLibrary.operationMu.Lock()
	if err := runtime.dispatch(
		"test-capability",
		"save-callback",
		bridgeMethodSaveCollectionLibrary,
		string(saveArguments),
	); err != nil {
		bridge.collectionLibrary.operationMu.Unlock()
		t.Fatal(err)
	}
	if err := runtime.dispatch(
		"test-capability",
		"load-callback",
		bridgeMethodLoadCollectionLibrary,
		"[]",
	); err != nil {
		bridge.collectionLibrary.operationMu.Unlock()
		t.Fatal(err)
	}
	bridge.collectionLibrary.operationMu.Unlock()

	responses := make([]testIPCResponse, 0, 2)
	for range 2 {
		select {
		case script := <-view.evaluated:
			responses = append(responses, decodeTestIPCResponse(t, script))
		case <-time.After(time.Second):
			t.Fatal("collection callback was not delivered")
		}
	}
	runtime.concurrentCalls.Wait()
	runtime.close()

	if responses[0].CallbackID != "save-callback" ||
		!responses[0].Result.Saved {
		t.Fatalf("first response = %#v, want successful save", responses[0])
	}
	if responses[1].CallbackID != "load-callback" ||
		responses[1].Result.Data != latest {
		t.Fatalf("second response = %#v, want latest loaded snapshot", responses[1])
	}
}

func TestIPCRuntimeReturnsTypedResultWhenCollectionQueueIsFull(t *testing.T) {
	view := &fakeWebView{evaluated: make(chan string, 1)}
	runtime := &ipcRuntime{
		webview:    view,
		bridge:     newBridgeWithCollectionLibraryDir(t.TempDir()),
		capability: "test-capability",
	}
	started := make(chan struct{})
	release := make(chan struct{})
	runtime.collectionLibraryQueue = newIPCSerialInvocationQueue(
		1,
		1<<10,
		func(invocation ipcInvocation) {
			if invocation.callbackID == "in-flight" {
				close(started)
				<-release
			}
		},
	)
	if status := runtime.collectionLibraryQueue.enqueue(
		ipcTestInvocation("in-flight", 1),
	); status != ipcSerialQueueAccepted {
		t.Fatalf("in-flight enqueue status = %d", status)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("in-flight invocation did not start")
	}
	if status := runtime.collectionLibraryQueue.enqueue(
		ipcTestInvocation("queued", 1),
	); status != ipcSerialQueueAccepted {
		t.Fatalf("queued enqueue status = %d", status)
	}

	if err := runtime.dispatch(
		"test-capability",
		"busy-callback",
		bridgeMethodLoadCollectionLibrary,
		"[]",
	); err != nil {
		t.Fatalf("queue-full dispatch returned a transport error: %v", err)
	}
	select {
	case script := <-view.evaluated:
		response := decodeTestIPCResponse(t, script)
		if response.CallbackID != "busy-callback" ||
			response.Result.Error == nil ||
			response.Result.Error.Code != CollectionLibraryErrorBusy {
			t.Fatalf("busy response = %#v", response)
		}
	case <-time.After(time.Second):
		t.Fatal("typed queue-full callback was not delivered")
	}

	close(release)
	runtime.collectionLibraryQueue.closeAndDrain(time.Second, nil)
}

func TestIPCRuntimeCloseStopsWaitingAfterCollectionDrainDeadline(t *testing.T) {
	runtime := &ipcRuntime{
		bridge:                       newBridgeWithCollectionLibraryDir(t.TempDir()),
		collectionLibraryDrainPeriod: 25 * time.Millisecond,
	}
	started := make(chan struct{})
	release := make(chan struct{})
	runtime.collectionLibraryQueue = newIPCSerialInvocationQueue(
		1,
		1<<10,
		func(ipcInvocation) {
			close(started)
			<-release // Deliberately ignores the canceled persistence context.
		},
	)
	if status := runtime.collectionLibraryQueue.enqueue(
		ipcTestInvocation("blocked", 1),
	); status != ipcSerialQueueAccepted {
		t.Fatalf("enqueue status = %d", status)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("blocked invocation did not start")
	}

	startedAt := time.Now()
	runtime.close()
	if elapsed := time.Since(startedAt); elapsed > time.Second {
		t.Fatalf("runtime close exceeded its drain deadline: %s", elapsed)
	}
	close(release)
	select {
	case <-runtime.collectionLibraryQueue.done:
	case <-time.After(time.Second):
		t.Fatal("collection worker did not finish after release")
	}

	// close is idempotent and must not wait on the already closed queue again.
	runtime.close()
}

func TestIPCRuntimeCloseCancelsAndJoinsConcurrentCalls(t *testing.T) {
	bridge := NewBridge()
	picker := &blockingLifecycleFilePicker{
		started:  make(chan struct{}),
		canceled: make(chan struct{}),
		release:  make(chan struct{}),
	}
	bridge.filePicker = picker
	appContext, cancelApp := context.WithCancel(context.Background())
	Startup(bridge)(appContext)
	runtime := &ipcRuntime{
		webview:               &fakeWebView{evaluated: make(chan string, 1)},
		bridge:                bridge,
		capability:            "test-capability",
		concurrentDrainPeriod: time.Second,
	}
	if err := runtime.dispatch(
		"test-capability",
		"shutdown-callback",
		bridgeMethodImportOpenAPI,
		"[]",
	); err != nil {
		t.Fatal(err)
	}
	select {
	case <-picker.started:
	case <-time.After(time.Second):
		t.Fatal("concurrent bridge call did not start")
	}

	closed := make(chan struct{})
	go func() {
		runtime.closeWithConcurrentCancel(cancelApp)
		close(closed)
	}()
	select {
	case <-picker.canceled:
	case <-time.After(time.Second):
		t.Fatal("runtime close did not cancel the concurrent bridge call")
	}
	select {
	case <-closed:
		t.Fatal("runtime close returned before the concurrent call released")
	case <-time.After(25 * time.Millisecond):
	}
	close(picker.release)
	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("runtime close did not join the released concurrent call")
	}
	Shutdown(bridge)(context.Background())
}

func TestIPCRuntimeCloseBoundsNonCooperativeConcurrentCall(t *testing.T) {
	runtime := &ipcRuntime{
		concurrentDrainPeriod: 25 * time.Millisecond,
	}
	runtime.concurrentCalls.Add(1)

	startedAt := time.Now()
	runtime.close()
	if elapsed := time.Since(startedAt); elapsed > time.Second {
		t.Fatalf("runtime close waited indefinitely for concurrent work: %s", elapsed)
	}
	runtime.concurrentCalls.Done()
}

func TestIPCRuntimeDropsCallbackScheduledBeforeClose(t *testing.T) {
	scheduled := make(chan func(), 1)
	view := &fakeWebView{
		evaluated: make(chan string, 1),
		dispatch: func(callback func()) {
			scheduled <- callback
		},
	}
	runtime := &ipcRuntime{webview: view}
	runtime.deliver(ipcResponse{CallbackID: "late", Result: true})

	var callback func()
	select {
	case callback = <-scheduled:
	case <-time.After(time.Second):
		t.Fatal("callback was not scheduled")
	}
	runtime.close()
	callback()

	select {
	case script := <-view.evaluated:
		t.Fatalf("closed runtime evaluated a late callback: %s", script)
	default:
	}
}

type testIPCResponse struct {
	CallbackID string `json:"callbackId"`
	Result     struct {
		Data  string     `json:"data"`
		Saved bool       `json:"saved"`
		Error *UserError `json:"error"`
	} `json:"result"`
	Error string `json:"error"`
}

func decodeTestIPCResponse(t *testing.T, script string) testIPCResponse {
	t.Helper()
	const prefix = "window.__canbridgeReceive("
	if !strings.HasPrefix(script, prefix) || !strings.HasSuffix(script, ");") {
		t.Fatalf("unexpected callback script: %s", script)
	}
	payload := strings.TrimSuffix(strings.TrimPrefix(script, prefix), ");")
	var response testIPCResponse
	if err := json.Unmarshal([]byte(payload), &response); err != nil {
		t.Fatalf("decode callback: %v", err)
	}
	return response
}

func assertIPCAdmissionReleased(t *testing.T, runtime *ipcRuntime) {
	t.Helper()
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if runtime.concurrentAdmission.inFlightCalls != 0 ||
		runtime.concurrentAdmission.acceptedArgumentBytes != 0 ||
		runtime.cancellationAdmission.inFlightCalls != 0 ||
		runtime.cancellationAdmission.acceptedArgumentBytes != 0 {
		t.Fatalf(
			"IPC admission was not released: concurrent=%#v cancellation=%#v",
			runtime.concurrentAdmission,
			runtime.cancellationAdmission,
		)
	}
}

type fakeWebView struct {
	evaluated chan string
	dispatch  func(func())
}

type blockingLifecycleFilePicker struct {
	started  chan struct{}
	canceled chan struct{}
	release  chan struct{}
}

func (picker *blockingLifecycleFilePicker) Open(
	ctx context.Context,
	_ fileDialogOptions,
) (string, error) {
	close(picker.started)
	<-ctx.Done()
	close(picker.canceled)
	<-picker.release
	return "", ctx.Err()
}

func (*fakeWebView) Run()                                 {}
func (*fakeWebView) Destroy()                             {}
func (*fakeWebView) Window() unsafe.Pointer               { return nil }
func (*fakeWebView) SetTitle(string)                      {}
func (*fakeWebView) SetSize(int, int, nativewebview.Hint) {}
func (*fakeWebView) Navigate(string)                      {}
func (*fakeWebView) Init(string)                          {}
func (view *fakeWebView) Eval(script string)              { view.evaluated <- script }
func (*fakeWebView) Bind(string, nativewebview.BindingHandler) error {
	return nil
}
func (view *fakeWebView) Dispatch(callback func()) {
	if view.dispatch != nil {
		view.dispatch(callback)
		return
	}
	callback()
}
