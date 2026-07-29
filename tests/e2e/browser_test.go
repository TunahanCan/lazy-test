package e2e

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/page"
	cdpruntime "github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/cdproto/target"
	"github.com/chromedp/chromedp"
	"github.com/cucumber/godog"
)

const (
	defaultBrowserWidth    = 1440
	defaultBrowserHeight   = 900
	browserScenarioTimeout = 60 * time.Second
)

type testHarness struct {
	repositoryRoot string
	artifactRoot   string
	fixtureScript  string
	server         *httptest.Server
	browserContext context.Context
	closeBrowser   context.CancelFunc
	closeAllocator context.CancelFunc
	profileRoot    string
}

func newTestHarness(t *testing.T) *testHarness {
	t.Helper()
	root, err := repositoryRoot()
	if err != nil {
		t.Fatal(err)
	}
	dist := filepath.Join(root, "cmd", "validex", "frontend", "dist")
	if information, statErr := os.Stat(filepath.Join(dist, "index.html")); statErr != nil ||
		!information.Mode().IsRegular() {
		t.Fatalf(
			"production frontend is missing at %s; run `make test-e2e`: %v",
			dist,
			statErr,
		)
	}
	fixture, err := os.ReadFile(
		filepath.Join(root, "tests", "e2e", "fixtures", "native_bridge.js"),
	)
	if err != nil {
		t.Fatalf("read deterministic native bridge fixture: %v", err)
	}

	fileServer := http.FileServer(http.Dir(dist))
	server := httptest.NewServer(http.HandlerFunc(func(
		response http.ResponseWriter,
		request *http.Request,
	) {
		response.Header().Set("Cache-Control", "no-store")
		response.Header().Set("X-Content-Type-Options", "nosniff")
		fileServer.ServeHTTP(response, request)
	}))

	chromePath, err := findChrome()
	if err != nil {
		server.Close()
		t.Fatal(err)
	}
	profile, err := os.MkdirTemp("", "validex-e2e-chrome-*")
	if err != nil {
		server.Close()
		t.Fatalf("create temporary Chrome profile: %v", err)
	}
	options := append(
		chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(chromePath),
		chromedp.UserDataDir(profile),
		chromedp.Flag("disable-background-networking", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-extensions", true),
		chromedp.Flag("disable-sync", true),
		chromedp.Flag("lang", "en-US"),
		chromedp.Flag("metrics-recording-only", true),
		chromedp.WindowSize(defaultBrowserWidth, defaultBrowserHeight),
	)
	allocatorContext, closeAllocator := chromedp.NewExecAllocator(
		context.Background(),
		options...,
	)
	browserContext, closeBrowser := chromedp.NewContext(allocatorContext)
	// The context passed to the first Run owns the browser process. Do not wrap
	// it in a short-lived timeout context: canceling that child would also tear
	// down the allocator-owned browser used by subsequent isolated scenarios.
	if err := chromedp.Run(browserContext); err != nil {
		closeBrowser()
		closeAllocator()
		server.Close()
		_ = os.RemoveAll(profile)
		t.Fatalf("start Chrome %s: %v", chromePath, err)
	}

	artifactRoot := filepath.Join(root, "tests", "e2e", "artifacts")
	if err := os.MkdirAll(artifactRoot, 0o755); err != nil {
		closeBrowser()
		closeAllocator()
		server.Close()
		_ = os.RemoveAll(profile)
		t.Fatalf("create E2E artifact directory: %v", err)
	}
	if err := cleanArtifactRoot(artifactRoot); err != nil {
		closeBrowser()
		closeAllocator()
		server.Close()
		_ = os.RemoveAll(profile)
		t.Fatalf("clean stale E2E artifacts: %v", err)
	}

	t.Logf("Cucumber browser runtime: %s", chromePath)
	return &testHarness{
		repositoryRoot: root,
		artifactRoot:   artifactRoot,
		fixtureScript:  string(fixture),
		server:         server,
		browserContext: browserContext,
		closeBrowser:   closeBrowser,
		closeAllocator: closeAllocator,
		profileRoot:    profile,
	}
}

func (h *testHarness) close() error {
	h.closeBrowser()
	h.closeAllocator()
	h.server.Close()
	var lastError error
	for attempt := 0; attempt < 10; attempt++ {
		if err := os.RemoveAll(h.profileRoot); err == nil {
			return nil
		} else {
			lastError = err
		}
		time.Sleep(20 * time.Millisecond)
	}
	return fmt.Errorf(
		"remove temporary Chrome profile %s: %w",
		h.profileRoot,
		lastError,
	)
}

func cleanArtifactRoot(root string) error {
	entries, err := os.ReadDir(root)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.Name() == ".gitkeep" {
			continue
		}
		path := filepath.Join(root, entry.Name())
		if entry.IsDir() {
			return fmt.Errorf(
				"refusing to recursively remove unexpected artifact directory %s",
				path,
			)
		}
		if err := os.Remove(path); err != nil {
			return fmt.Errorf("remove stale artifact %s: %w", path, err)
		}
	}
	return nil
}

func repositoryRoot() (string, error) {
	_, current, _, ok := runtime.Caller(0)
	if !ok {
		return "", errors.New("could not resolve E2E source location")
	}
	root := filepath.Clean(filepath.Join(filepath.Dir(current), "..", ".."))
	if information, err := os.Stat(filepath.Join(root, "Makefile")); err != nil ||
		!information.Mode().IsRegular() {
		return "", fmt.Errorf("could not resolve repository root from %s", current)
	}
	return root, nil
}

func findChrome() (string, error) {
	if configured := strings.TrimSpace(os.Getenv("VALIDEX_E2E_CHROME")); configured != "" {
		information, err := os.Stat(configured)
		if err != nil || !information.Mode().IsRegular() {
			return "", fmt.Errorf(
				"VALIDEX_E2E_CHROME does not point to an executable file: %s",
				configured,
			)
		}
		return configured, nil
	}
	for _, name := range []string{
		"google-chrome",
		"google-chrome-stable",
		"chromium",
		"chromium-browser",
	} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}
	return "", errors.New(
		"Chrome/Chromium was not found; install it or set VALIDEX_E2E_CHROME",
	)
}

type browserWorld struct {
	harness          *testHarness
	pageContext      context.Context
	context          context.Context
	cancel           context.CancelFunc
	disposeContext   func() error
	browserContextID cdp.BrowserContextID
	scenarioName     string
	scenarioID       string
	initialConfig    map[string]any
	width            int64
	height           int64

	errorMutex     sync.Mutex
	frontendErrors []string
}

func newBrowserWorld(harness *testHarness) *browserWorld {
	return &browserWorld{harness: harness}
}

func (w *browserWorld) beforeScenario(
	ctx context.Context,
	scenario *godog.Scenario,
) (context.Context, error) {
	if err := w.closePage(); err != nil {
		return ctx, fmt.Errorf("close previous browser context: %w", err)
	}
	w.scenarioName = scenario.Name
	w.scenarioID = scenario.Id
	w.initialConfig = nil
	w.width = defaultBrowserWidth
	w.height = defaultBrowserHeight
	w.errorMutex.Lock()
	w.frontendErrors = nil
	w.errorMutex.Unlock()
	return ctx, nil
}

func (w *browserWorld) afterScenario(
	ctx context.Context,
	_ *godog.Scenario,
	scenarioErr error,
) (context.Context, error) {
	errorsFound := w.errors()
	var artifactErr error
	if scenarioErr != nil || len(errorsFound) > 0 {
		artifactErr = w.captureArtifacts()
	}
	closeErr := w.closePage()
	if artifactErr != nil || closeErr != nil {
		var cleanupErrors []error
		if artifactErr != nil {
			cleanupErrors = append(
				cleanupErrors,
				fmt.Errorf("capture failure artifacts: %w", artifactErr),
			)
		}
		if closeErr != nil {
			cleanupErrors = append(
				cleanupErrors,
				fmt.Errorf("dispose isolated browser context: %w", closeErr),
			)
		}
		return ctx, errors.Join(cleanupErrors...)
	}
	if scenarioErr == nil && len(errorsFound) > 0 {
		return ctx, fmt.Errorf(
			"browser reported frontend errors:\n%s",
			strings.Join(errorsFound, "\n"),
		)
	}
	return ctx, nil
}

func (w *browserWorld) openPage() error {
	return w.openPageUntil(
		chromedp.WaitVisible("[data-activity]", chromedp.ByQuery),
		chromedp.WaitReady("[data-workspace-view]", chromedp.ByQuery),
	)
}

func (w *browserWorld) openPageUntil(
	readyActions ...chromedp.Action,
) error {
	if w.context != nil {
		return nil
	}
	browser := chromedp.FromContext(w.harness.browserContext).Browser
	if browser == nil {
		return errors.New("Chrome browser connection is unavailable")
	}
	browserExecutor := cdp.WithExecutor(w.harness.browserContext, browser)
	browserContextID, err := target.CreateBrowserContext().Do(browserExecutor)
	if err != nil {
		return fmt.Errorf("create isolated browser context: %w", err)
	}
	// Chrome 150 requires the first target in a newly created off-the-record
	// profile to open a window explicitly. chromedp v0.14.2 sends
	// newWindow=false internally, so create that first target through CDP and
	// then attach chromedp to it.
	targetID, err := target.
		CreateTarget("about:blank").
		WithBrowserContextID(browserContextID).
		WithNewWindow(true).
		Do(browserExecutor)
	if err != nil {
		disposeErr := target.
			DisposeBrowserContext(browserContextID).
			Do(browserExecutor)
		targetErr := fmt.Errorf("create isolated browser target: %w", err)
		if disposeErr == nil {
			return targetErr
		}
		return errors.Join(
			targetErr,
			fmt.Errorf(
				"dispose browser context after target failure: %w",
				disposeErr,
			),
		)
	}
	pageContext, closePage := chromedp.NewContext(
		w.harness.browserContext,
		chromedp.WithTargetID(targetID),
	)
	scenarioContext, cancelScenario := context.WithTimeout(
		pageContext,
		browserScenarioTimeout,
	)
	w.browserContextID = browserContextID
	w.pageContext = pageContext
	w.context = scenarioContext
	w.cancel = func() {
		cancelScenario()
		closePage()
	}
	w.disposeContext = func() error {
		disposeContext, cancelDispose := context.WithTimeout(
			context.Background(),
			5*time.Second,
		)
		defer cancelDispose()
		return target.DisposeBrowserContext(browserContextID).Do(
			cdp.WithExecutor(disposeContext, browser),
		)
	}
	chromedp.ListenTarget(w.context, func(event any) {
		switch value := event.(type) {
		case *cdpruntime.EventExceptionThrown:
			if value.ExceptionDetails != nil {
				w.addFrontendError(value.ExceptionDetails.Error())
			}
		case *cdpruntime.EventConsoleAPICalled:
			if value.Type != cdpruntime.APITypeError &&
				value.Type != cdpruntime.APITypeAssert {
				return
			}
			parts := make([]string, 0, len(value.Args))
			for _, argument := range value.Args {
				if argument == nil {
					continue
				}
				text := argument.Description
				if text == "" && len(argument.Value) > 0 {
					text = string(argument.Value)
				}
				if text != "" {
					parts = append(parts, text)
				}
			}
			w.addFrontendError(
				fmt.Sprintf("console.%s: %s", value.Type, strings.Join(parts, " ")),
			)
		}
	})

	initialJSON, err := json.Marshal(w.initialConfig)
	if err != nil {
		return errors.Join(
			fmt.Errorf("encode initial bridge config: %w", err),
			w.closePage(),
		)
	}
	injected := fmt.Sprintf(
		"globalThis.__VALIDEX_E2E_INITIAL__ = %s;\n%s",
		initialJSON,
		w.harness.fixtureScript,
	)
	actions := []chromedp.Action{
		chromedp.ActionFunc(func(ctx context.Context) error {
			_, addErr := page.AddScriptToEvaluateOnNewDocument(injected).Do(ctx)
			return addErr
		}),
		emulation.SetDeviceMetricsOverride(w.width, w.height, 1, false),
		chromedp.Navigate(w.harness.server.URL + "/__e2e_reset__"),
		chromedp.Evaluate(
			`localStorage.clear();
			 sessionStorage.clear();
			 localStorage.setItem("validex.locale", "en");`,
			nil,
		),
		chromedp.Navigate(w.harness.server.URL + "/"),
	}
	actions = append(actions, readyActions...)
	return w.run(actions...)
}

func (w *browserWorld) closePage() error {
	if w.cancel != nil {
		w.cancel()
	}
	var disposeErr error
	if w.disposeContext != nil {
		disposeErr = w.disposeContext()
	}
	w.context = nil
	w.pageContext = nil
	w.cancel = nil
	w.disposeContext = nil
	w.browserContextID = ""
	return disposeErr
}

func (w *browserWorld) run(actions ...chromedp.Action) error {
	if w.context == nil {
		return errors.New("browser page is not open")
	}
	return chromedp.Run(w.context, actions...)
}

func (w *browserWorld) addFrontendError(message string) {
	message = strings.TrimSpace(message)
	if message == "" {
		return
	}
	w.errorMutex.Lock()
	defer w.errorMutex.Unlock()
	w.frontendErrors = append(w.frontendErrors, message)
}

func (w *browserWorld) errors() []string {
	w.errorMutex.Lock()
	defer w.errorMutex.Unlock()
	return append([]string(nil), w.frontendErrors...)
}

func (w *browserWorld) captureArtifacts() error {
	if w.context == nil {
		return nil
	}
	name := artifactName(w.scenarioName, w.scenarioID)
	var screenshot []byte
	var document string
	captureContext := w.pageContext
	if captureContext == nil {
		captureContext = w.context
	}
	captureContext, cancelCapture := context.WithTimeout(
		captureContext,
		5*time.Second,
	)
	defer cancelCapture()
	captureErr := chromedp.Run(
		captureContext,
		chromedp.CaptureScreenshot(&screenshot),
		chromedp.OuterHTML("html", &document, chromedp.ByQuery),
	)
	var writeErrors []error
	if len(screenshot) > 0 {
		if err := os.WriteFile(
			filepath.Join(w.harness.artifactRoot, name+".png"),
			screenshot,
			0o600,
		); err != nil {
			writeErrors = append(writeErrors, err)
		}
	}
	if document != "" {
		if err := os.WriteFile(
			filepath.Join(w.harness.artifactRoot, name+".html"),
			[]byte(document),
			0o600,
		); err != nil {
			writeErrors = append(writeErrors, err)
		}
	}
	if errorsFound := w.errors(); len(errorsFound) > 0 {
		if err := os.WriteFile(
			filepath.Join(w.harness.artifactRoot, name+".console.txt"),
			[]byte(strings.Join(errorsFound, "\n")+"\n"),
			0o600,
		); err != nil {
			writeErrors = append(writeErrors, err)
		}
	}
	return errors.Join(append(writeErrors, captureErr)...)
}

var artifactCharacters = regexp.MustCompile(`[^a-z0-9]+`)

func artifactName(value, scenarioID string) string {
	name := artifactCharacters.ReplaceAllString(strings.ToLower(value), "-")
	name = strings.Trim(name, "-")
	if name == "" {
		name = "scenario"
	}
	if len(name) > 80 {
		name = strings.Trim(name[:80], "-")
	}
	// Pickle IDs differ between Scenario Outline examples even when their
	// rendered names are identical. A short digest prevents collisions without
	// allowing generated IDs to create unbounded artifact paths.
	identity := scenarioID
	if identity == "" {
		identity = value
	}
	digest := sha256.Sum256([]byte(identity))
	return fmt.Sprintf("%s-%x", name, digest[:6])
}
