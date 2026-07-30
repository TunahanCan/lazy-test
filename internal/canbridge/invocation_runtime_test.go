package canbridge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestInvocationRuntimeDispatchesThroughBridgeInvoke(t *testing.T) {
	responses := make(chan InvocationResponse, 1)
	runtime, err := NewInvocationRuntime(
		context.Background(),
		NewBridge(),
		func(response InvocationResponse) {
			responses <- response
		},
	)
	if err != nil {
		t.Fatalf("NewInvocationRuntime() error = %v", err)
	}

	if err := runtime.Dispatch(Invocation{
		ID:        "bootstrap",
		Method:    bridgeMethodBootstrap,
		Arguments: "[]",
	}); err != nil {
		t.Fatalf("Dispatch() error = %v", err)
	}
	response := waitForInvocationResponse(t, responses)
	if response.ID != "bootstrap" || response.Error != "" {
		t.Fatalf("response = %#v", response)
	}
	bootstrap, ok := response.Result.(BootstrapData)
	if !ok || bootstrap.WorkspaceID != "validex-workspace" {
		t.Fatalf("bootstrap result = %#v", response.Result)
	}
	closeInvocationRuntime(t, runtime)
}

func TestInvocationRuntimeKeepsCancellationAdmissionIndependent(t *testing.T) {
	normalStarted := make(chan struct{})
	cancelStarted := make(chan struct{})
	releaseNormal := make(chan struct{})
	releaseCancel := make(chan struct{})
	responses := make(chan InvocationResponse, 2)

	runtime, err := newInvocationRuntime(
		context.Background(),
		NewBridge(),
		func(response InvocationResponse) {
			responses <- response
		},
		invocationRuntimeConfig{
			concurrentLimits: invocationAdmissionLimits{maxCalls: 1, maxBytes: 32},
			cancellationLimits: invocationAdmissionLimits{
				maxCalls: 1,
				maxBytes: 32,
			},
			invoke: func(method string, _ string) (any, error) {
				switch method {
				case bridgeMethodBootstrap:
					close(normalStarted)
					<-releaseNormal
				case bridgeMethodCancelRequest:
					close(cancelStarted)
					<-releaseCancel
				}
				return method, nil
			},
		},
	)
	if err != nil {
		t.Fatalf("newInvocationRuntime() error = %v", err)
	}

	if err := runtime.Dispatch(Invocation{
		ID:        "normal",
		Method:    bridgeMethodBootstrap,
		Arguments: "[]",
	}); err != nil {
		t.Fatalf("normal Dispatch() error = %v", err)
	}
	waitForSignal(t, normalStarted, "normal invocation")

	err = runtime.Dispatch(Invocation{
		ID:        "normal-overflow",
		Method:    bridgeMethodBootstrap,
		Arguments: "[]",
	})
	if err == nil || !strings.Contains(err.Error(), "concurrent lane is full") {
		t.Fatalf("normal overflow error = %v", err)
	}
	if err := runtime.Dispatch(Invocation{
		ID:        "cancel",
		Method:    bridgeMethodCancelRequest,
		Arguments: `["request-1"]`,
	}); err != nil {
		t.Fatalf("cancellation Dispatch() error = %v", err)
	}
	waitForSignal(t, cancelStarted, "cancellation invocation")

	close(releaseCancel)
	close(releaseNormal)
	waitForInvocationResponse(t, responses)
	waitForInvocationResponse(t, responses)
	closeInvocationRuntime(t, runtime)
}

func TestInvocationRuntimeSerializesCollectionCallsAndReturnsBusyResult(
	t *testing.T,
) {
	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	responses := make(chan InvocationResponse, 3)
	var orderMu sync.Mutex
	var order []string

	runtime, err := newInvocationRuntime(
		context.Background(),
		NewBridge(),
		func(response InvocationResponse) {
			responses <- response
		},
		invocationRuntimeConfig{
			serialMaxCalls: 1,
			serialMaxBytes: 64,
			invoke: func(_ string, arguments string) (any, error) {
				orderMu.Lock()
				order = append(order, arguments)
				position := len(order)
				orderMu.Unlock()
				if position == 1 {
					close(firstStarted)
					<-releaseFirst
				}
				return arguments, nil
			},
		},
	)
	if err != nil {
		t.Fatalf("newInvocationRuntime() error = %v", err)
	}

	for _, invocation := range []Invocation{
		{
			ID:        "first",
			Method:    bridgeMethodSaveCollectionLibrary,
			Arguments: `["first"]`,
		},
		{
			ID:        "second",
			Method:    bridgeMethodSaveCollectionLibrary,
			Arguments: `["second"]`,
		},
	} {
		if err := runtime.Dispatch(invocation); err != nil {
			t.Fatalf("Dispatch(%q) error = %v", invocation.ID, err)
		}
		if invocation.ID == "first" {
			waitForSignal(t, firstStarted, "first serial invocation")
		}
	}
	if err := runtime.Dispatch(Invocation{
		ID:        "busy",
		Method:    bridgeMethodSaveCollectionLibrary,
		Arguments: `["third"]`,
	}); err != nil {
		t.Fatalf("busy Dispatch() error = %v", err)
	}
	busyResponse := waitForInvocationResponse(t, responses)
	if busyResponse.ID != "busy" || busyResponse.Error != "" {
		t.Fatalf("busy response = %#v", busyResponse)
	}
	busyResult, ok := busyResponse.Result.(CollectionLibrarySaveResult)
	if !ok ||
		busyResult.Error == nil ||
		busyResult.Error.Code != CollectionLibraryErrorBusy {
		t.Fatalf("busy result = %#v", busyResponse.Result)
	}

	close(releaseFirst)
	waitForInvocationResponse(t, responses)
	waitForInvocationResponse(t, responses)
	orderMu.Lock()
	gotOrder := append([]string(nil), order...)
	orderMu.Unlock()
	if !reflect.DeepEqual(gotOrder, []string{`["first"]`, `["second"]`}) {
		t.Fatalf("serial execution order = %#v", gotOrder)
	}
	closeInvocationRuntime(t, runtime)
}

func TestInvocationRuntimeCloseCancelsBridgeOperations(t *testing.T) {
	requestStarted := make(chan struct{})
	requestCanceled := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(
		func(_ http.ResponseWriter, request *http.Request) {
			close(requestStarted)
			<-request.Context().Done()
			close(requestCanceled)
		},
	))
	defer server.Close()

	runtime, err := NewInvocationRuntime(
		context.Background(),
		NewBridge(),
		func(InvocationResponse) {},
	)
	if err != nil {
		t.Fatalf("NewInvocationRuntime() error = %v", err)
	}
	arguments, err := json.Marshal([]RequestInput{{
		ID:        "slow-request",
		Method:    http.MethodGet,
		URL:       server.URL,
		TimeoutMS: 5_000,
	}})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	if err := runtime.Dispatch(Invocation{
		ID:        "send",
		Method:    bridgeMethodSendRequest,
		Arguments: string(arguments),
	}); err != nil {
		t.Fatalf("Dispatch() error = %v", err)
	}
	waitForSignal(t, requestStarted, "HTTP request")

	closeContext, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := runtime.Close(closeContext); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	waitForSignal(t, requestCanceled, "HTTP request cancellation")
	if err := runtime.Dispatch(Invocation{
		ID:        "late",
		Method:    bridgeMethodBootstrap,
		Arguments: "[]",
	}); err == nil || !strings.Contains(err.Error(), "shutting down") {
		t.Fatalf("late Dispatch() error = %v", err)
	}
}

func waitForInvocationResponse(
	t *testing.T,
	responses <-chan InvocationResponse,
) InvocationResponse {
	t.Helper()
	select {
	case response := <-responses:
		return response
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for invocation response")
		return InvocationResponse{}
	}
}

func waitForSignal(t *testing.T, signal <-chan struct{}, label string) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(time.Second):
		t.Fatalf("timed out waiting for %s", label)
	}
}

func closeInvocationRuntime(t *testing.T, runtime *InvocationRuntime) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := runtime.Close(ctx); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}
