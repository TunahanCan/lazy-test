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
	"sync"
	"time"

	webview "github.com/webview/webview_go"
)

const (
	nativeDispatchName = "__canbridgeNativeDispatch"
	nativeLogName      = "__canbridgeNativeLog"
)

type AppOptions struct {
	Title     string
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
	webview    webview.WebView
	bridge     *Bridge
	capability string

	mu      sync.Mutex
	closed  bool
	pending sync.WaitGroup
}

type ipcResponse struct {
	CallbackID string `json:"callbackId"`
	Result     any    `json:"result,omitempty"`
	Error      string `json:"error,omitempty"`
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
	var frontendServer *http.Server
	if targetURL == "" {
		handler, err := assetHandler(options.Assets, options.AssetRoot)
		if err != nil {
			return fmt.Errorf("prepare embedded frontend assets: %w", err)
		}
		if options.Debug {
			next := handler
			handler = http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
				log.Printf("[canbridge:asset] %s %s host=%s", request.Method, request.URL.Path, request.Host)
				next.ServeHTTP(response, request)
			})
		}
		listener, err := net.Listen("tcp4", productionAssetAddress)
		if err != nil {
			return fmt.Errorf(
				"start embedded frontend server on %s: %w",
				productionAssetAddress,
				err,
			)
		}
		frontendServer = &http.Server{
			Handler:           handler,
			ReadHeaderTimeout: 5 * time.Second,
		}
		go func() {
			_ = frontendServer.Serve(listener)
		}()
		targetURL = productionAssetURL
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

	nativeView := webview.New(options.Debug)
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

	defer nativeView.Destroy()
	defer func() {
		runtime.close()
		cancelApp()
		Shutdown(options.Bridge)(context.Background())
		runtime.pending.Wait()
	}()

	if err := nativeView.Bind(nativeDispatchName, runtime.dispatch); err != nil {
		return fmt.Errorf("bind native canbridge dispatcher: %w", err)
	}
	if err := nativeView.Bind(nativeLogName, runtime.logBrowserMessage); err != nil {
		return fmt.Errorf("bind native canbridge logger: %w", err)
	}
	nativeView.Init(browserRuntime(capability, allowedOrigin, options.Debug))
	nativeView.SetTitle(options.Title)
	nativeView.SetSize(options.Width, options.Height, webview.HintNone)
	if options.MinWidth > 0 && options.MinHeight > 0 {
		nativeView.SetSize(options.MinWidth, options.MinHeight, webview.HintMin)
	}

	nativeView.Navigate(targetURL)
	nativeView.Run()
	return nil
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
	runtime.pending.Add(1)
	runtime.mu.Unlock()

	go func() {
		defer runtime.pending.Done()
		result, err := runtime.bridge.Invoke(method, encodedArguments)
		response := ipcResponse{CallbackID: callbackID, Result: result}
		if err != nil {
			response.Result = nil
			response.Error = err.Error()
		}
		runtime.deliver(response)
	}()
	return nil
}

func (runtime *ipcRuntime) deliver(response ipcResponse) {
	payload, err := json.Marshal(response)
	if err != nil {
		payload, _ = json.Marshal(ipcResponse{
			CallbackID: response.CallbackID,
			Error:      "encode canbridge response: " + err.Error(),
		})
	}

	runtime.mu.Lock()
	closed := runtime.closed
	runtime.mu.Unlock()
	if closed {
		return
	}
	runtime.webview.Dispatch(func() {
		runtime.webview.Eval("window.__canbridgeReceive(" + string(payload) + ");")
	})
}

func (runtime *ipcRuntime) close() {
	runtime.mu.Lock()
	runtime.closed = true
	runtime.mu.Unlock()
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
		if parsed.Port() != "34116" {
			return "", fmt.Errorf("canbridge development URL must use port 34116")
		}
	}
	return parsed.Scheme + "://" + parsed.Host, nil
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
  if (config.debug && typeof nativeLog === "function") {
    nativeLog(
      config.capability,
      "debug",
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
