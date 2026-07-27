//go:build canbridge

package canbridge

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"unsafe"

	webview "github.com/webview/webview_go"
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
		"Bootstrap",
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
	runtime.pending.Wait()

	if err := runtime.dispatch("wrong", "callback-2", "Bootstrap", "[]"); err == nil {
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
		"SendRequest",
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
		"CancelRequest",
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
	runtime.pending.Wait()
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

type fakeWebView struct {
	evaluated chan string
}

func (*fakeWebView) Run()                           {}
func (*fakeWebView) Terminate()                     {}
func (*fakeWebView) Destroy()                       {}
func (*fakeWebView) Window() unsafe.Pointer         { return nil }
func (*fakeWebView) SetTitle(string)                {}
func (*fakeWebView) SetSize(int, int, webview.Hint) {}
func (*fakeWebView) Navigate(string)                {}
func (*fakeWebView) SetHtml(string)                 {}
func (*fakeWebView) Init(string)                    {}
func (view *fakeWebView) Eval(script string)        { view.evaluated <- script }
func (*fakeWebView) Bind(string, interface{}) error { return nil }
func (*fakeWebView) Unbind(string) error            { return nil }
func (*fakeWebView) Dispatch(callback func())       { callback() }
