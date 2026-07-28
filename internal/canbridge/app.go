//go:build canbridge

package canbridge

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"validex/internal/nativewebview"
)

const (
	nativeDispatchName               = "__canbridgeNativeDispatch"
	nativeLogName                    = "__canbridgeNativeLog"
	developmentPortMinimum           = 34116
	developmentPortMaximum           = 34215
	defaultConcurrentCallDrainPeriod = 3 * time.Second
	maxConcurrentIPCCalls            = 64
	maxConcurrentIPCArgumentBytes    = 64 << 20
	maxCancellationIPCCalls          = 8
	maxCancellationIPCArgumentBytes  = 1 << 20
	maxIPCResponseBytes              = 64 << 20
	maxIPCDispatchEnvelopeBytes      = 128 << 20
	maxIPCLogEnvelopeBytes           = 128 << 10
)

type AppOptions struct {
	AppID     string
	Title     string
	IconPNG   []byte
	Width     int
	Height    int
	MinWidth  int
	MinHeight int
	Debug     bool
	DevURL    string
	Assets    fs.FS
	AssetRoot string
	Bridge    *Bridge
}

type ipcRuntime struct {
	webview    nativewebview.WebView
	bridge     *Bridge
	capability string

	mu                           sync.Mutex
	closed                       bool
	concurrentCalls              sync.WaitGroup
	concurrentAdmission          ipcAdmissionState
	cancellationAdmission        ipcAdmissionState
	collectionLibraryQueue       *ipcSerialInvocationQueue
	collectionLibraryDrainPeriod time.Duration
	concurrentDrainPeriod        time.Duration
	viewDispatchMu               sync.Mutex
	viewEvalMu                   sync.Mutex
}

type ipcResponse struct {
	CallbackID string `json:"callbackId"`
	Result     any    `json:"result,omitempty"`
	Error      string `json:"error,omitempty"`
}

type ipcAdmissionLimits struct {
	maxCalls         int
	maxArgumentBytes int
}

type ipcAdmissionState struct {
	// limits is optional so directly constructed runtimes retain production
	// defaults. Tests may set smaller positive limits to exercise saturation.
	limits                ipcAdmissionLimits
	inFlightCalls         int
	acceptedArgumentBytes int
}

func Run(options AppOptions) error {
	if options.Bridge == nil {
		return errors.New("canbridge requires a Bridge")
	}
	if options.DevURL == "" && options.Assets == nil {
		return errors.New("canbridge requires embedded assets or a development URL")
	}
	if options.Title == "" {
		options.Title = "Application"
	}
	if options.Width <= 0 {
		options.Width = 1024
	}
	if options.Height <= 0 {
		options.Height = 768
	}

	targetURL := options.DevURL
	dynamicPortFallback := false
	var frontendServer *http.Server
	if targetURL == "" {
		endpoint, err := listenForFrontendAssets(productionAssetAddress)
		if err != nil {
			return err
		}
		handler, err := assetHandler(options.Assets, options.AssetRoot, endpoint.Host)
		if err != nil {
			_ = endpoint.Close()
			return fmt.Errorf("prepare embedded frontend assets: %w", err)
		}
		if options.Debug {
			next := handler
			handler = http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
				log.Printf("[canbridge:asset] %s %s host=%s", request.Method, request.URL.Path, request.Host)
				next.ServeHTTP(response, request)
			})
		}
		frontendServer = &http.Server{
			Handler:           handler,
			ReadHeaderTimeout: 5 * time.Second,
		}
		go func() {
			if serveErr := frontendServer.Serve(endpoint.Listener); serveErr != nil &&
				!errors.Is(serveErr, http.ErrServerClosed) {
				log.Printf("[canbridge:error] frontend asset server stopped: %v", serveErr)
			}
		}()
		targetURL = endpoint.URL
		dynamicPortFallback = endpoint.DynamicFallback
		defer func() {
			shutdownContext, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_ = frontendServer.Shutdown(shutdownContext)
		}()
	}

	allowedOrigin, err := appOrigin(targetURL, options.DevURL != "")
	if err != nil {
		return err
	}
	capability, err := randomCapability()
	if err != nil {
		return fmt.Errorf("create canbridge capability: %w", err)
	}

	appContext, cancelApp := context.WithCancel(context.Background())
	Startup(options.Bridge)(appContext)

	prepareNativeApplication(options.AppID, options.Title)
	nativeView := nativewebview.New(options.Debug)
	if nativeView == nil {
		cancelApp()
		Shutdown(options.Bridge)(context.Background())
		return errors.New("create native WebView")
	}
	runtime := &ipcRuntime{
		webview:    nativeView,
		bridge:     options.Bridge,
		capability: capability,
	}
	if err := applyNativeWindowIcon(nativeView.Window(), options.IconPNG); err != nil {
		log.Printf("[canbridge:warning] native application icon could not be applied: %v", err)
	}

	defer nativeView.Destroy()
	defer func() {
		runtime.closeWithConcurrentCancel(cancelApp)
		Shutdown(options.Bridge)(context.Background())
	}()

	if err := nativeView.Bind(nativeDispatchName, runtime.dispatchBinding); err != nil {
		return fmt.Errorf("bind native canbridge dispatcher: %w", err)
	}
	if err := nativeView.Bind(nativeLogName, runtime.logBrowserMessageBinding); err != nil {
		return fmt.Errorf("bind native canbridge logger: %w", err)
	}
	log.Print(canbridgeStartupBanner(
		options.Title,
		targetURL,
		options.DevURL != "",
		dynamicPortFallback,
	))
	nativeView.Init(browserRuntime(capability, allowedOrigin, options.Debug))
	nativeView.SetTitle(options.Title)
	nativeView.SetSize(options.Width, options.Height, nativewebview.HintNone)
	if options.MinWidth > 0 && options.MinHeight > 0 {
		nativeView.SetSize(options.MinWidth, options.MinHeight, nativewebview.HintMin)
	}

	nativeView.Navigate(targetURL)
	nativeView.Run()
	return nil
}

func (runtime *ipcRuntime) dispatchBinding(requestJSON string) error {
	if err := validateBindingEnvelopeSize(
		"dispatcher",
		requestJSON,
		maxIPCDispatchEnvelopeBytes,
	); err != nil {
		return err
	}
	arguments, err := decodeBindingStringArguments(requestJSON, 4)
	if err != nil {
		return fmt.Errorf("decode native canbridge dispatcher request: %w", err)
	}
	return runtime.dispatch(
		arguments[0],
		arguments[1],
		arguments[2],
		arguments[3],
	)
}

func (runtime *ipcRuntime) logBrowserMessageBinding(requestJSON string) error {
	if err := validateBindingEnvelopeSize(
		"logger",
		requestJSON,
		maxIPCLogEnvelopeBytes,
	); err != nil {
		return err
	}
	arguments, err := decodeBindingStringArguments(requestJSON, 3)
	if err != nil {
		return fmt.Errorf("decode native canbridge logger request: %w", err)
	}
	return runtime.logBrowserMessage(
		arguments[0],
		arguments[1],
		arguments[2],
	)
}

func validateBindingEnvelopeSize(
	bindingName string,
	requestJSON string,
	maximumBytes int,
) error {
	if maximumBytes < 0 || len(requestJSON) > maximumBytes {
		return fmt.Errorf(
			"native canbridge %s request exceeds %d bytes",
			bindingName,
			maximumBytes,
		)
	}
	return nil
}

func decodeBindingStringArguments(
	requestJSON string,
	expectedCount int,
) ([]string, error) {
	trimmedRequest := strings.TrimSpace(requestJSON)
	if trimmedRequest == "" || trimmedRequest[0] != '[' {
		return nil, errors.New("native binding request must be a JSON array")
	}

	var encodedArguments []json.RawMessage
	if err := json.Unmarshal([]byte(trimmedRequest), &encodedArguments); err != nil {
		return nil, fmt.Errorf("decode native binding request JSON: %w", err)
	}
	if len(encodedArguments) != expectedCount {
		return nil, fmt.Errorf(
			"native binding request expects %d string arguments, received %d",
			expectedCount,
			len(encodedArguments),
		)
	}

	arguments := make([]string, len(encodedArguments))
	for index, encodedArgument := range encodedArguments {
		var value any
		if err := json.Unmarshal(encodedArgument, &value); err != nil {
			return nil, fmt.Errorf(
				"decode native binding argument %d: %w",
				index+1,
				err,
			)
		}
		argument, ok := value.(string)
		if !ok {
			return nil, fmt.Errorf(
				"native binding argument %d must be a string",
				index+1,
			)
		}
		arguments[index] = argument
	}
	return arguments, nil
}

func (runtime *ipcRuntime) logBrowserMessage(
	capability string,
	level string,
	message string,
) error {
	if subtle.ConstantTimeCompare(
		[]byte(capability),
		[]byte(runtime.capability),
	) != 1 {
		return errors.New("invalid canbridge capability")
	}
	if len(level) > 16 {
		level = level[:16]
	}
	if len(message) > 16<<10 {
		message = message[:16<<10] + "…"
	}
	log.Printf("[canbridge:%s] %s", level, message)
	return nil
}

func (runtime *ipcRuntime) dispatch(
	capability string,
	callbackID string,
	method string,
	encodedArguments string,
) error {
	if subtle.ConstantTimeCompare(
		[]byte(capability),
		[]byte(runtime.capability),
	) != 1 {
		return errors.New("invalid canbridge capability")
	}
	if callbackID == "" || len(callbackID) > 256 {
		return errors.New("invalid canbridge callback ID")
	}
	if method == "" || len(method) > 128 {
		return errors.New("invalid canbridge method")
	}
	if len(encodedArguments) > maxBridgeArgumentsBytes {
		return fmt.Errorf("canbridge arguments exceed %d bytes", maxBridgeArgumentsBytes)
	}

	runtime.mu.Lock()
	if runtime.closed {
		runtime.mu.Unlock()
		return errors.New("canbridge is shutting down")
	}
	invocation := ipcInvocation{
		callbackID:       callbackID,
		method:           method,
		encodedArguments: encodedArguments,
	}
	if executionPolicyForBridgeMethod(method) ==
		bridgeExecutionCollectionLibrarySerial {
		queue := runtime.collectionLibraryQueueLocked()
		runtime.mu.Unlock()
		switch queue.enqueue(invocation) {
		case ipcSerialQueueAccepted:
			return nil
		case ipcSerialQueueClosed:
			return errors.New("canbridge is shutting down")
		default:
			busyResult, ok := busyResultForBridgeMethod(method)
			if !ok {
				return fmt.Errorf(
					"canbridge serial method %s has no busy result",
					method,
				)
			}
			runtime.deliver(ipcResponse{
				CallbackID: callbackID,
				Result:     busyResult,
			})
			return nil
		}
	}
	admissionLane, err := runtime.admitConcurrentCallLocked(
		method,
		len(encodedArguments),
	)
	if err != nil {
		runtime.mu.Unlock()
		return err
	}
	runtime.concurrentCalls.Add(1)
	runtime.mu.Unlock()

	go func() {
		defer runtime.releaseConcurrentCall(
			admissionLane,
			len(invocation.encodedArguments),
		)
		runtime.execute(invocation)
	}()
	return nil
}

func (runtime *ipcRuntime) admitConcurrentCallLocked(
	method string,
	argumentBytes int,
) (ipcAdmissionLane, error) {
	lane := admissionLaneForBridgeMethod(method)
	admission, defaultLimits := runtime.admissionStateLocked(lane)
	if err := admission.acquire(lane, argumentBytes, defaultLimits); err != nil {
		return lane, err
	}
	return lane, nil
}

func (runtime *ipcRuntime) releaseConcurrentCall(
	lane ipcAdmissionLane,
	argumentBytes int,
) {
	runtime.mu.Lock()
	admission, _ := runtime.admissionStateLocked(lane)
	admission.release(argumentBytes)
	runtime.concurrentCalls.Done()
	runtime.mu.Unlock()
}

func (runtime *ipcRuntime) admissionStateLocked(
	lane ipcAdmissionLane,
) (*ipcAdmissionState, ipcAdmissionLimits) {
	if lane == ipcAdmissionCancellation {
		return &runtime.cancellationAdmission, ipcAdmissionLimits{
			maxCalls:         maxCancellationIPCCalls,
			maxArgumentBytes: maxCancellationIPCArgumentBytes,
		}
	}
	return &runtime.concurrentAdmission, ipcAdmissionLimits{
		maxCalls:         maxConcurrentIPCCalls,
		maxArgumentBytes: maxConcurrentIPCArgumentBytes,
	}
}

func (admission *ipcAdmissionState) acquire(
	lane ipcAdmissionLane,
	argumentBytes int,
	defaultLimits ipcAdmissionLimits,
) error {
	limits := admission.limits
	if limits.maxCalls <= 0 {
		limits.maxCalls = defaultLimits.maxCalls
	}
	if limits.maxArgumentBytes <= 0 {
		limits.maxArgumentBytes = defaultLimits.maxArgumentBytes
	}
	if admission.inFlightCalls >= limits.maxCalls {
		return fmt.Errorf(
			"canbridge IPC %s lane is full: maximum %d in-flight calls",
			lane,
			limits.maxCalls,
		)
	}
	if argumentBytes > limits.maxArgumentBytes-admission.acceptedArgumentBytes {
		return fmt.Errorf(
			"canbridge IPC %s lane byte budget exceeded: maximum %d accepted argument bytes",
			lane,
			limits.maxArgumentBytes,
		)
	}
	admission.inFlightCalls++
	admission.acceptedArgumentBytes += argumentBytes
	return nil
}

func (admission *ipcAdmissionState) release(argumentBytes int) {
	admission.inFlightCalls--
	admission.acceptedArgumentBytes -= argumentBytes
}

func (runtime *ipcRuntime) execute(invocation ipcInvocation) {
	result, err := runtime.bridge.Invoke(
		invocation.method,
		invocation.encodedArguments,
	)
	response := ipcResponse{CallbackID: invocation.callbackID, Result: result}
	if err != nil {
		response.Result = nil
		response.Error = err.Error()
	}
	runtime.deliver(response)
}

func (runtime *ipcRuntime) deliver(response ipcResponse) {
	payload := marshalIPCResponse(response, maxIPCResponseBytes)

	// Coordinate both scheduling and execution with close. Dispatch may invoke
	// its callback synchronously in tests or asynchronously in a native WebView,
	// so separate gates avoid re-entrant mutex deadlocks while ensuring Destroy
	// cannot race with Dispatch/Eval.
	runtime.viewDispatchMu.Lock()
	defer runtime.viewDispatchMu.Unlock()
	runtime.mu.Lock()
	closed := runtime.closed
	view := runtime.webview
	runtime.mu.Unlock()
	if closed {
		return
	}
	view.Dispatch(func() {
		runtime.viewEvalMu.Lock()
		defer runtime.viewEvalMu.Unlock()
		runtime.mu.Lock()
		closed := runtime.closed
		runtime.mu.Unlock()
		if closed {
			return
		}
		view.Eval("window.__canbridgeReceive(" + string(payload) + ");")
	})
}

func marshalIPCResponse(response ipcResponse, maximumBytes int) []byte {
	payload, err := json.Marshal(response)
	if err != nil {
		log.Printf(
			"[canbridge:error] encode IPC response for callback %q: %v",
			response.CallbackID,
			err,
		)
		return marshalIPCError(response.CallbackID, "encode canbridge response")
	}
	if len(payload) > maximumBytes {
		return marshalIPCError(
			response.CallbackID,
			fmt.Sprintf(
				"canbridge response exceeds %d byte transport limit",
				maximumBytes,
			),
		)
	}
	return payload
}

func marshalIPCError(callbackID string, message string) []byte {
	payload, _ := json.Marshal(ipcResponse{
		CallbackID: callbackID,
		Error:      message,
	})
	return payload
}

func (runtime *ipcRuntime) close() {
	runtime.closeWithConcurrentCancel(nil)
}

func (runtime *ipcRuntime) closeWithConcurrentCancel(
	cancelConcurrent context.CancelFunc,
) {
	runtime.viewDispatchMu.Lock()
	runtime.mu.Lock()
	if runtime.closed {
		runtime.mu.Unlock()
		runtime.viewDispatchMu.Unlock()
		if cancelConcurrent != nil {
			cancelConcurrent()
		}
		return
	}
	runtime.closed = true
	collectionLibraryQueue := runtime.collectionLibraryQueue
	runtime.mu.Unlock()
	// Wait only for a callback already inside Eval. A callback scheduled but
	// not yet executed will observe closed and discard its response.
	runtime.viewEvalMu.Lock()
	runtime.viewEvalMu.Unlock()
	runtime.viewDispatchMu.Unlock()

	// General IPC work uses the application context, while collection
	// persistence has its own explicitly stopped lifecycle so accepted writes
	// may drain. Admission is sealed before Wait begins, making WaitGroup use
	// safe with concurrent Add.
	if cancelConcurrent != nil {
		cancelConcurrent()
	}
	concurrentDone := make(chan struct{})
	go func() {
		runtime.concurrentCalls.Wait()
		close(concurrentDone)
	}()
	concurrentDrainPeriod := runtime.concurrentDrainPeriod
	if concurrentDrainPeriod <= 0 {
		concurrentDrainPeriod = defaultConcurrentCallDrainPeriod
	}
	concurrentTimer := time.NewTimer(concurrentDrainPeriod)
	defer concurrentTimer.Stop()

	if collectionLibraryQueue != nil {
		drained := collectionLibraryQueue.closeAndDrain(
			runtime.collectionLibraryDrainPeriod,
			func() {
				if runtime.bridge != nil {
					runtime.bridge.cancelCollectionPersistence()
				}
			},
		)
		if !drained {
			log.Print("[canbridge:warning] collection persistence drain timed out")
		}
	}
	select {
	case <-concurrentDone:
		return
	default:
	}
	select {
	case <-concurrentDone:
	case <-concurrentTimer.C:
		log.Print("[canbridge:warning] concurrent IPC drain timed out")
	}
}

func randomCapability() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func appOrigin(appURL string, development bool) (string, error) {
	if appURL == "" {
		return "", nil
	}
	parsed, err := url.Parse(appURL)
	if err != nil {
		return "", fmt.Errorf("parse canbridge app URL: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("canbridge app URL must use http or https")
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("canbridge app URL must include a host")
	}
	if development {
		hostname := parsed.Hostname()
		address := net.ParseIP(hostname)
		if hostname != "localhost" && (address == nil || !address.IsLoopback()) {
			return "", fmt.Errorf("canbridge development URL must use a loopback host")
		}
		if parsed.Scheme != "http" {
			return "", fmt.Errorf("canbridge development URL must use http")
		}
		port, portErr := strconv.Atoi(parsed.Port())
		if portErr != nil ||
			port < developmentPortMinimum ||
			port > developmentPortMaximum {
			return "", fmt.Errorf(
				"canbridge development URL port must be between %d and %d",
				developmentPortMinimum,
				developmentPortMaximum,
			)
		}
	}
	return parsed.Scheme + "://" + parsed.Host, nil
}

func canbridgeStartupBanner(
	title string,
	targetURL string,
	development bool,
	dynamicPortFallback bool,
) string {
	parsed, _ := url.Parse(targetURL)
	mode := "production"
	portMode := "preferred"
	if development {
		mode = "development"
		portMode = "development"
	} else if dynamicPortFallback {
		_, preferredPort, _ := net.SplitHostPort(productionAssetAddress)
		portMode = "dynamic fallback; preferred " + preferredPort + " was busy"
	}
	return fmt.Sprintf(
		"\n"+
			"╭─ canbridge ─────────────────────────────────────\n"+
			"│ %s is powered by canbridge\n"+
			"│ Frontend  %s\n"+
			"│ Port      %s (%s)\n"+
			"│ Mode      %s\n"+
			"│ Transport native WebView IPC · TypeScript ↔ Go\n"+
			"╰─ bridge ready",
		title,
		targetURL,
		parsed.Port(),
		portMode,
		mode,
	)
}

func browserRuntime(capability string, allowedOrigin string, debug bool) string {
	config, _ := json.Marshal(struct {
		Capability    string   `json:"capability"`
		AllowedOrigin string   `json:"allowedOrigin"`
		Methods       []string `json:"methods"`
		Debug         bool     `json:"debug"`
	}{
		Capability:    capability,
		AllowedOrigin: allowedOrigin,
		Methods:       bridgeMethodNames,
		Debug:         debug,
	})

	return `(function () {
  "use strict";
  const config = ` + string(config) + `;
  const nativeDispatch = window.` + nativeDispatchName + `;
  const nativeLog = window.` + nativeLogName + `;
  try {
    delete window.` + nativeDispatchName + `;
    delete window.` + nativeLogName + `;
  } catch (_) {
    window.` + nativeDispatchName + ` = undefined;
    window.` + nativeLogName + ` = undefined;
  }

  const allowed = window.location.origin === config.allowedOrigin;
  if (!allowed || typeof nativeDispatch !== "function") {
    if (typeof nativeLog === "function") {
      nativeLog(
        config.capability,
        "error",
        "bridge refused origin=" + window.location.origin +
          " expected=" + config.allowedOrigin +
          " dispatch=" + typeof nativeDispatch,
      );
    }
    return;
  }

  function reportBrowserError(kind, value) {
    if (typeof nativeLog !== "function") return;
    let message;
    try {
      message = value && value.stack ? value.stack : String(value);
    } catch (_) {
      message = "unprintable browser error";
    }
    nativeLog(config.capability, kind, message);
  }
  window.addEventListener("error", (event) => {
    reportBrowserError("error", event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportBrowserError("rejection", event.reason);
  });
  if (typeof nativeLog === "function") {
    nativeLog(
      config.capability,
      config.debug ? "debug" : "info",
      "bridge ready origin=" + window.location.origin,
    );
  }

  const pending = new Map();
  let sequence = 0;

  function rejectPending(callbackID, error) {
    const callback = pending.get(callbackID);
    if (!callback) return;
    pending.delete(callbackID);
    callback.reject(error instanceof Error ? error : new Error(String(error)));
  }

  function invoke(method, args) {
    const callbackID =
      "canbridge-" + Date.now().toString(36) + "-" + (++sequence).toString(36);
    return new Promise((resolve, reject) => {
      pending.set(callbackID, { resolve, reject });
      let encodedArguments;
      try {
        encodedArguments = JSON.stringify(args);
      } catch (error) {
        rejectPending(callbackID, error);
        return;
      }
      Promise.resolve(
        nativeDispatch(config.capability, callbackID, method, encodedArguments),
      ).catch((error) => rejectPending(callbackID, error));
    });
  }

  const bridge = {};
  for (const method of config.methods) {
    bridge[method] = (...args) => invoke(method, args);
  }

  Object.defineProperty(window, "__canbridgeReceive", {
    configurable: false,
    enumerable: false,
    value: (message) => {
      if (!message || typeof message.callbackId !== "string") return;
      const callback = pending.get(message.callbackId);
      if (!callback) return;
      pending.delete(message.callbackId);
      if (message.error) {
        callback.reject(new Error(message.error));
      } else {
        callback.resolve(message.result);
      }
    },
  });
  Object.defineProperty(window, "canbridge", {
    configurable: false,
    enumerable: false,
    value: Object.freeze({ Bridge: Object.freeze(bridge) }),
  });
})();`
}
