package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/chromedp/cdproto/emulation"
	cdpruntime "github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/cdproto/target"
	"github.com/chromedp/chromedp"

	"validex-e2e/internal/mockapi"
)

const liveAuditTimeout = 8 * time.Minute

type liveRemoteTarget struct {
	ID                   string `json:"id"`
	Title                string `json:"title"`
	Type                 string `json:"type"`
	URL                  string `json:"url"`
	WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
}

type liveRemoteVersion struct {
	WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
}

type liveAPITracker struct {
	server *httptest.Server
	mock   *mockapi.Server
}

func newLiveAPITracker(t *testing.T, environment string) *liveAPITracker {
	t.Helper()
	mock := mockapi.New(environment)
	tracker := &liveAPITracker{
		mock: mock,
	}
	tracker.server = httptest.NewServer(mock)
	t.Cleanup(tracker.server.Close)
	return tracker
}

func (tracker *liveAPITracker) URL() string {
	return tracker.server.URL
}

func (tracker *liveAPITracker) hitCount(path string) int {
	return tracker.mock.HitCount(path)
}

func (tracker *liveAPITracker) maxActive() int {
	return tracker.mock.MaxConcurrent()
}

type liveLayoutReport struct {
	HorizontalOverflow int      `json:"horizontalOverflow"`
	ClippedControls    []string `json:"clippedControls"`
	OffscreenControls  []string `json:"offscreenControls"`
	Overlaps           []string `json:"overlaps"`
	MissingNames       []string `json:"missingNames"`
	DuplicateIDs       []string `json:"duplicateIds"`
}

type liveAudit struct {
	t         *testing.T
	world     *browserWorld
	artifacts string
	errorsMu  sync.Mutex
	errors    []string
}

func TestLiveLocalAPIAudit(t *testing.T) {
	if os.Getenv("VALIDEX_LIVE_E2E") != "1" {
		t.Skip("set VALIDEX_LIVE_E2E=1 and launch Electron with remote debugging")
	}

	primary := newLiveAPITracker(t, "primary")
	candidate := newLiveAPITracker(t, "candidate")
	writeLiveOpenAPIFixture(t, primary.URL())

	t.Log("attaching to the live Electron page")
	pageContext, _ := connectLiveElectron(t)
	root, err := repositoryRoot()
	if err != nil {
		t.Fatal(err)
	}
	audit := &liveAudit{
		t:         t,
		world:     &browserWorld{context: pageContext, pageContext: pageContext},
		artifacts: filepath.Join(root, "tests", "e2e", "artifacts"),
	}
	audit.listenForErrors(pageContext)
	t.Log("resetting application state")
	audit.initialize()
	audit.setViewport(1440, 900)
	audit.setTheme("dark")
	audit.capture("live-01-requests-welcome-dark")

	t.Log("testing Requests against the local API")
	audit.testRequests(primary)
	t.Log("testing the built-in mock server")
	audit.testBuiltInMock(primary)
	t.Log("testing OpenAPI import and contract validation")
	audit.testOpenAPIImport(primary)
	t.Log("testing JSON Lab modes")
	audit.testJSONLab()
	t.Log("testing Diagnostics modes")
	audit.testDiagnostics(primary, candidate)
	t.Log("testing streaming protocols")
	audit.testProtocols(primary)
	t.Log("testing automation tools")
	audit.testAutomation(primary)
	t.Log("capturing desktop and mobile visual matrices")
	audit.captureWorkspaceMatrix("dark-desktop", 1440, 900)

	audit.setTheme("light")
	audit.captureWorkspaceMatrix("light-desktop", 1440, 900)
	audit.captureWorkspaceMatrix("light-mobile", 390, 844)
	audit.setTheme("dark")
	audit.captureWorkspaceMatrix("dark-mobile", 390, 844)

	if errorsFound := audit.frontendErrors(); len(errorsFound) > 0 {
		t.Fatalf("live Electron frontend errors:\n%s", strings.Join(errorsFound, "\n"))
	}
	if primary.hitCount("/api/orders/42") == 0 ||
		primary.hitCount("/events") == 0 ||
		primary.hitCount("/actuator/health") == 0 {
		t.Fatalf("required live endpoints were not reached: orders=%d events=%d actuator=%d",
			primary.hitCount("/api/orders/42"),
			primary.hitCount("/events"),
			primary.hitCount("/actuator/health"),
		)
	}
	t.Logf(
		"live local API audit passed: orders=%d slow=%d maxConcurrent=%d screenshots=%s",
		primary.hitCount("/api/orders/42"),
		primary.hitCount("/api/slow"),
		primary.maxActive(),
		audit.artifacts,
	)
}

func TestLiveURLPerformanceAudit(t *testing.T) {
	if os.Getenv("VALIDEX_LIVE_E2E") != "1" {
		t.Skip("set VALIDEX_LIVE_E2E=1 and launch Electron with remote debugging")
	}

	api := newLiveAPITracker(t, "performance")
	pageContext, cancel := connectLiveElectron(t)
	defer cancel()
	root, err := repositoryRoot()
	if err != nil {
		t.Fatal(err)
	}
	audit := &liveAudit{
		t:         t,
		world:     &browserWorld{context: pageContext, pageContext: pageContext},
		artifacts: filepath.Join(root, "tests", "e2e", "artifacts"),
	}
	audit.listenForErrors(pageContext)
	audit.initialize()
	audit.setViewport(1440, 900)
	audit.setTheme("light")
	audit.openWorkspace("diagnostics")
	audit.diagnosticsMode("Performance")
	audit.diagnosticsControl("performance-url", api.URL()+"/actuator/health")
	audit.diagnosticsControl("performance-timeout", "3000")
	audit.diagnosticsControl("performance-samples", "3")
	audit.diagnosticsRun("performance-run")
	audit.capture("live-diagnostics-04-performance")

	audit.setViewport(390, 844)
	audit.capture("live-diagnostics-04-performance-mobile")
	audit.run(chromedp.Evaluate(
		`(() => {
			const result = document.querySelector('.diagnostics-performance-result');
			result?.scrollIntoView({block: 'start'});
			for (let parent = result?.parentElement; parent; parent = parent.parentElement) {
				if (parent.scrollTop > 0) {
					parent.scrollTop = Math.max(0, parent.scrollTop - 80);
				}
			}
			window.scrollBy(0, -80);
		})()`,
		nil,
	))
	audit.capture("live-diagnostics-04-performance-mobile-result")

	if errorsFound := audit.frontendErrors(); len(errorsFound) > 0 {
		t.Fatalf("URL performance frontend errors:\n%s", strings.Join(errorsFound, "\n"))
	}
	if hits := api.hitCount("/actuator/health"); hits != 3 {
		t.Fatalf("URL performance request count = %d, want 3", hits)
	}
}

func connectLiveElectron(t *testing.T) (context.Context, context.CancelFunc) {
	t.Helper()
	remote := strings.TrimRight(os.Getenv("VALIDEX_LIVE_E2E_REMOTE"), "/")
	if remote == "" {
		remote = "http://127.0.0.1:9225"
	}
	readJSON := func(path string, target any) {
		response, err := http.Get(remote + path)
		if err != nil {
			t.Fatalf("connect to Electron DevTools at %s: %v", remote, err)
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("Electron DevTools %s returned %s", path, response.Status)
		}
		if err := json.NewDecoder(response.Body).Decode(target); err != nil {
			t.Fatalf("decode Electron DevTools %s: %v", path, err)
		}
	}

	var version liveRemoteVersion
	readJSON("/json/version", &version)
	var targets []liveRemoteTarget
	readJSON("/json/list", &targets)
	var application liveRemoteTarget
	for _, candidate := range targets {
		if candidate.Type == "page" && strings.HasPrefix(candidate.URL, "app://validex/") {
			application = candidate
			break
		}
	}
	if version.WebSocketDebuggerURL == "" || application.ID == "" {
		t.Fatalf("Validex Electron target is unavailable: version=%+v targets=%+v", version, targets)
	}

	allocatorContext, cancelAllocator := chromedp.NewRemoteAllocator(
		context.Background(),
		version.WebSocketDebuggerURL,
	)
	pageContext, cancelTarget := chromedp.NewContext(
		allocatorContext,
		chromedp.WithTargetID(target.ID(application.ID)),
	)
	pageContext, cancelTimeout := context.WithTimeout(pageContext, liveAuditTimeout)
	if err := chromedp.Run(
		pageContext,
		chromedp.WaitVisible("[data-activity]", chromedp.ByQuery),
		chromedp.WaitReady("[data-workspace-view]", chromedp.ByQuery),
	); err != nil {
		cancelTimeout()
		cancelTarget()
		cancelAllocator()
		t.Fatalf("attach to Validex Electron page: %v", err)
	}
	return pageContext, func() {
		cancelTimeout()
		cancelTarget()
		cancelAllocator()
	}
}

func writeLiveOpenAPIFixture(t *testing.T, serverURL string) {
	t.Helper()
	path := os.Getenv("VALIDEX_LIVE_OPENAPI_FILE")
	if path == "" {
		path = "/tmp/validex-live-openapi.yaml"
	}
	document := fmt.Sprintf(`openapi: 3.0.3
info:
  title: Validex Live Orders API
  version: 1.0.0
servers:
  - url: %s
paths:
  /api/orders/42:
    get:
      summary: Get live order
      responses:
        "200":
          description: Live order
          content:
            application/json:
              schema:
                type: object
  /api/echo:
    post:
      summary: Echo live payload
      requestBody:
        content:
          application/json:
            schema:
              type: object
      responses:
        "200":
          description: Echo response
`, serverURL)
	if err := os.WriteFile(path, []byte(document), 0o600); err != nil {
		t.Fatalf("write live OpenAPI fixture: %v", err)
	}
	t.Cleanup(func() { _ = os.Remove(path) })
}

func (audit *liveAudit) run(actions ...chromedp.Action) {
	audit.t.Helper()
	if err := audit.world.run(actions...); err != nil {
		audit.t.Fatal(err)
	}
}

func (audit *liveAudit) wait(expression, description string) {
	audit.t.Helper()
	if err := audit.world.run(chromedp.Poll(
		expression,
		nil,
		chromedp.WithPollingInterval(40*time.Millisecond),
		chromedp.WithPollingTimeout(12*time.Second),
	)); err != nil {
		audit.t.Fatalf("wait for %s: %v", description, err)
	}
}

func (audit *liveAudit) click(selector string) {
	audit.t.Helper()
	audit.wait(fmt.Sprintf(`(() => {
		const element = document.querySelector(%s);
		if (!(element instanceof HTMLElement) || element.matches(':disabled')) return false;
		const style = getComputedStyle(element);
		const bounds = element.getBoundingClientRect();
		return !element.hidden && style.display !== 'none' &&
			style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
	})()`, requestJSON(selector)), "clickable "+selector)
	var clicked bool
	audit.run(chromedp.Evaluate(fmt.Sprintf(`(() => {
		const element = document.querySelector(%s);
		if (!(element instanceof HTMLElement) || element.matches(':disabled')) return false;
		element.click();
		return true;
	})()`, requestJSON(selector)), &clicked))
	if !clicked {
		audit.t.Fatalf("click %s: element changed before activation", selector)
	}
}

func (audit *liveAudit) setControl(selector, value string) {
	audit.t.Helper()
	if err := requestSetValue(audit.world, selector, value, true); err != nil {
		audit.t.Fatalf("set %s: %v", selector, err)
	}
}

func (audit *liveAudit) listenForErrors(ctx context.Context) {
	chromedp.ListenTarget(ctx, func(event any) {
		var message string
		switch value := event.(type) {
		case *cdpruntime.EventExceptionThrown:
			if value.ExceptionDetails != nil {
				message = value.ExceptionDetails.Error()
			}
		case *cdpruntime.EventConsoleAPICalled:
			if value.Type != cdpruntime.APITypeError && value.Type != cdpruntime.APITypeAssert {
				return
			}
			parts := make([]string, 0, len(value.Args))
			for _, argument := range value.Args {
				if argument != nil && argument.Description != "" {
					parts = append(parts, argument.Description)
				}
			}
			message = fmt.Sprintf("console.%s: %s", value.Type, strings.Join(parts, " "))
		}
		if strings.TrimSpace(message) == "" {
			return
		}
		audit.errorsMu.Lock()
		audit.errors = append(audit.errors, message)
		audit.errorsMu.Unlock()
	})
}

func (audit *liveAudit) frontendErrors() []string {
	audit.errorsMu.Lock()
	defer audit.errorsMu.Unlock()
	return append([]string(nil), audit.errors...)
}

func (audit *liveAudit) initialize() {
	audit.run(
		chromedp.Evaluate(`localStorage.clear(); localStorage.setItem("validex.locale", "tr")`, nil),
		chromedp.Reload(),
		chromedp.WaitVisible("[data-activity]", chromedp.ByQuery),
		chromedp.WaitVisible(".welcome-workspace-content", chromedp.ByQuery),
	)
	audit.wait(`document.documentElement.lang === "tr"`, "Turkish live-audit locale")
}

func (audit *liveAudit) setViewport(width, height int64) {
	audit.run(emulation.SetDeviceMetricsOverride(width, height, 1, false))
	audit.wait(
		fmt.Sprintf(`window.innerWidth === %d && window.innerHeight === %d`, width, height),
		fmt.Sprintf("%dx%d viewport", width, height),
	)
}

func (audit *liveAudit) setTheme(theme string) {
	label := map[string]string{"light": "Açık tema", "dark": "Koyu tema"}[theme]
	if label == "" {
		audit.t.Fatalf("unsupported live theme %q", theme)
	}
	audit.click(`[data-topbar] [data-action="settings"]`)
	audit.wait(`Boolean(document.querySelector('.native-menu[role="menu"]'))`, "settings menu")
	var selected bool
	audit.run(chromedp.Evaluate(fmt.Sprintf(`(() => {
		const item = [...document.querySelectorAll('.native-menu [role="menuitem"]')]
			.find((candidate) => candidate.textContent?.trim() === %q);
		if (!(item instanceof HTMLButtonElement)) return false;
		item.click();
		return true;
	})()`, label), &selected))
	if !selected {
		audit.t.Fatalf("theme menu item %q was not available", label)
	}
	audit.wait(
		fmt.Sprintf(`document.documentElement.dataset.theme === %q`, theme),
		theme+" theme",
	)
}

func (audit *liveAudit) openWorkspace(workspace string) {
	audit.t.Helper()
	if err := audit.world.selectWorkspace(workspace); err != nil {
		audit.t.Fatalf("open %s workspace: %v", workspace, err)
	}
	if err := audit.world.workspaceIsActiveAndVisible(workspace); err != nil {
		audit.t.Fatalf("verify %s workspace: %v", workspace, err)
	}
}

func (audit *liveAudit) capture(name string) {
	audit.t.Helper()
	if err := os.MkdirAll(audit.artifacts, 0o755); err != nil {
		audit.t.Fatal(err)
	}
	var screenshot []byte
	var report liveLayoutReport
	audit.run(
		chromedp.Evaluate(`(() => {
			const visible = (element) => {
				const style = getComputedStyle(element);
				const rect = element.getBoundingClientRect();
				return !element.hidden && style.display !== "none" &&
					style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
			};
			const accessibleName = (element) => {
				const labelledBy = (element.getAttribute("aria-labelledby") || "")
					.split(/\s+/)
					.filter(Boolean)
					.map((id) => document.getElementById(id)?.textContent?.trim() || "")
					.filter(Boolean)
					.join(" ");
				const labels = "labels" in element && element.labels
					? [...element.labels]
						.map((label) => label.textContent?.trim() || "")
						.filter(Boolean)
						.join(" ")
					: "";
				return (
					element.getAttribute("aria-label") ||
					labelledBy ||
					labels ||
					element.getAttribute("title") ||
					element.textContent?.trim() ||
					""
				).replace(/\s+/g, " ");
			};
			const name = (element) => (
				accessibleName(element) ||
				element.tagName
			).slice(0, 90);
			const controls = [...document.querySelectorAll(
				'button, input, select, textarea, [role="tab"], [role="menuitem"]'
			)].filter(visible);
			const insideHorizontalScroller = (element) => {
				for (let parent = element.parentElement; parent; parent = parent.parentElement) {
					const style = getComputedStyle(parent);
					if ((style.overflowX === "auto" || style.overflowX === "scroll") &&
						parent.scrollWidth > parent.clientWidth + 2) return true;
				}
				return false;
			};
			const visibleRect = (element) => {
				const bounds = element.getBoundingClientRect();
				const rect = {
					left: bounds.left,
					right: bounds.right,
					top: bounds.top,
					bottom: bounds.bottom,
				};
				for (let parent = element.parentElement; parent; parent = parent.parentElement) {
					const style = getComputedStyle(parent);
					const parentRect = parent.getBoundingClientRect();
					if (style.overflowX !== "visible") {
						rect.left = Math.max(rect.left, parentRect.left);
						rect.right = Math.min(rect.right, parentRect.right);
					}
					if (style.overflowY !== "visible") {
						rect.top = Math.max(rect.top, parentRect.top);
						rect.bottom = Math.min(rect.bottom, parentRect.bottom);
					}
				}
				return rect;
			};
			const clippedControls = controls.filter((element) => {
				const style = getComputedStyle(element);
				return style.overflowX !== "auto" && style.overflowX !== "scroll" &&
					element.scrollWidth > element.clientWidth + 2;
			}).map(name);
			const offscreenControls = controls.filter((element) => {
				const rect = visibleRect(element);
				if (rect.right >= -1 && rect.left <= innerWidth + 1) return false;
				if (insideHorizontalScroller(element)) return false;
				return !element.closest('[aria-hidden="true"], [inert]');
			}).map(name);
			const onScreenControls = controls.filter((element) => {
				const rect = visibleRect(element);
				if (rect.right <= rect.left || rect.bottom <= rect.top) return false;
				return rect.right >= -1 && rect.left <= innerWidth + 1 &&
					rect.bottom >= -1 && rect.top <= innerHeight + 1;
			});
			const overlaps = [];
			for (let left = 0; left < onScreenControls.length; left += 1) {
				const first = onScreenControls[left];
				const a = visibleRect(first);
				for (let right = left + 1; right < onScreenControls.length; right += 1) {
					const second = onScreenControls[right];
					if (first.contains(second) || second.contains(first)) continue;
					const b = visibleRect(second);
					const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
					const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
					if (width > 3 && height > 3) {
						overlaps.push(
							name(first) + " <> " + name(second) +
							" [" + [a.left, a.right, a.top, a.bottom, b.left, b.right, b.top, b.bottom]
								.map((value) => Math.round(value)).join(",") + "]"
						);
					}
				}
			}
			const missingNames = controls.filter((element) => {
				if (element instanceof HTMLInputElement && element.type === "hidden") return false;
				return accessibleName(element) === "";
			}).map((element) => element.outerHTML.slice(0, 100));
			const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
			const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
			return {
				horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
				clippedControls: [...new Set(clippedControls)],
				offscreenControls: [...new Set(offscreenControls)],
				overlaps: [...new Set(overlaps)],
				missingNames: [...new Set(missingNames)],
				duplicateIds,
			};
		})()`, &report),
		chromedp.CaptureScreenshot(&screenshot),
	)
	if len(screenshot) == 0 {
		audit.t.Fatalf("empty screenshot for %s", name)
	}
	path := filepath.Join(audit.artifacts, name+".png")
	if err := os.WriteFile(path, screenshot, 0o600); err != nil {
		audit.t.Fatal(err)
	}
	if report.HorizontalOverflow > 1 || len(report.ClippedControls) > 0 ||
		len(report.OffscreenControls) > 0 || len(report.Overlaps) > 0 ||
		len(report.MissingNames) > 0 || len(report.DuplicateIDs) > 0 {
		audit.t.Fatalf("visual/accessibility audit failed for %s: %+v", name, report)
	}
}

func (audit *liveAudit) captureWorkspaceMatrix(
	prefix string,
	width, height int64,
) {
	audit.setViewport(width, height)
	for _, workspace := range []string{
		"requests", "mock", "json", "diagnostics", "protocols", "automation",
	} {
		audit.openWorkspace(workspace)
		audit.capture(fmt.Sprintf("live-matrix-%s-%s", prefix, workspace))
	}
}

func (audit *liveAudit) sendRequest(
	method, url, body string,
	expectedStatus int,
) {
	audit.t.Helper()
	if err := requestEnsureEditable(audit.world); err != nil {
		audit.t.Fatal(err)
	}
	audit.setControl(`[name="method"]`, method)
	audit.setControl(`[name="url"]`, url)
	if body != "" {
		audit.click(`[data-request-section="body"]`)
		audit.setControl(`[name="body"]`, body)
	}
	audit.click(`[data-request-form] .send-button[type="submit"]`)
	audit.wait(
		fmt.Sprintf(`document.querySelector('[data-request-form]')?.getAttribute('aria-busy') === 'false' &&
			document.querySelector('.response-summary .status-mark')?.textContent.trim().startsWith(%q)`,
			fmt.Sprintf("%d", expectedStatus)),
		fmt.Sprintf("%d response from %s", expectedStatus, url),
	)
}

func (audit *liveAudit) newRequest() {
	audit.click(`[data-topbar] [data-action="new-request"]`)
	audit.wait(`Boolean(document.querySelector('[data-request-form]'))`, "new request form")
}

func (audit *liveAudit) testRequests(api *liveAPITracker) {
	audit.openWorkspace("requests")
	audit.newRequest()
	audit.sendRequest("GET", api.URL()+"/api/orders/42?expand=items", "", 200)
	audit.wait(`document.querySelector('.response-body')?.dataset.responseKind === 'json' &&
		document.querySelector('.response-code')?.textContent.includes('order-42')`, "JSON response body")
	audit.capture("live-02-request-json")
	audit.click(`[data-action="copy-response"]`)
	audit.wait(
		`document.querySelector('.app-feedback.success')?.textContent.includes('Kopyalandı')`,
		"response body copied through the Electron clipboard IPC",
	)
	audit.click(`.app-feedback [data-action="dismiss-feedback"]`)
	audit.wait(`!document.querySelector('.app-feedback')`, "dismissed clipboard feedback")
	for _, section := range []string{"headers", "cookies", "timeline", "raw", "body"} {
		audit.click(fmt.Sprintf(`[data-response-section="%s"]`, section))
		audit.wait(
			fmt.Sprintf(`document.querySelector('[data-response-section="%s"]')?.getAttribute('aria-selected') === 'true'`, section),
			section+" response view",
		)
		audit.capture("live-request-response-" + section)
	}

	audit.sendRequest("POST", api.URL()+"/api/echo?source=validex", `{"sku":"SKU-42","quantity":2}`, 200)
	audit.wait(`document.querySelector('.response-code')?.textContent.includes('SKU-42')`, "echoed request body")
	for _, section := range []string{"params", "headers", "variables", "body"} {
		audit.click(fmt.Sprintf(`[data-request-section="%s"]`, section))
		audit.wait(
			fmt.Sprintf(`document.querySelector('[data-request-section="%s"]')?.getAttribute('aria-selected') === 'true'`, section),
			section+" request editor",
		)
		audit.capture("live-request-editor-" + section)
	}
	audit.sendRequest("GET", api.URL()+"/api/xml", "", 200)
	audit.wait(`document.querySelector('.response-body')?.dataset.responseKind === 'xml'`, "XML response view")
	audit.sendRequest("GET", api.URL()+"/api/text", "", 200)
	audit.wait(`document.querySelector('.response-body')?.dataset.responseKind === 'text'`, "text response view")
	audit.sendRequest("GET", api.URL()+"/api/binary", "", 200)
	audit.wait(`document.querySelector('.response-body')?.dataset.responseKind === 'base64'`, "binary response view")
	audit.sendRequest("GET", api.URL()+"/api/problem", "", 422)
	audit.capture("live-03-request-problem")
	audit.sendRequest("GET", api.URL()+"/api/redirect", "", http.StatusFound)

	audit.setControl(`[name="url"]`, api.URL()+"/api/drop")
	audit.click(`[data-request-form] .send-button[type="submit"]`)
	audit.wait(`Boolean(document.querySelector('.user-error-card[role="alert"] [data-action="retry-request"]'))`, "actionable network error")
	audit.capture("live-04-request-network-error")

	var before []string
	audit.run(chromedp.Evaluate(`[
		...document.querySelectorAll('[data-request-tab-button]')
	].map((tab) => tab.getAttribute('data-tab-id'))`, &before))
	for index := 0; index < 6; index++ {
		audit.newRequest()
		audit.setControl(`[name="url"]`, fmt.Sprintf("%s/api/slow?request=%d", api.URL(), index))
		audit.click(`[data-request-form] .send-button[type="submit"]`)
	}
	audit.wait(`document.querySelectorAll('.request-tab-main svg.spin').length === 0`, "six concurrent requests")
	if maximum := api.maxActive(); maximum < 2 || maximum > 4 {
		audit.t.Fatalf("live request concurrency = %d, want 2..4", maximum)
	}
	var after []string
	audit.run(chromedp.Evaluate(`[
		...document.querySelectorAll('[data-request-tab-button]')
	].map((tab) => tab.getAttribute('data-tab-id'))`, &after))
	if len(after)-len(before) != 6 {
		audit.t.Fatalf("concurrent request tabs added = %d, want 6", len(after)-len(before))
	}
	audit.capture("live-05-request-concurrency")
}

func (audit *liveAudit) testBuiltInMock(api *liveAPITracker) {
	audit.openWorkspace("mock")
	audit.wait(`document.querySelector('.mock-server-page')?.getAttribute('aria-busy') === 'false'`, "mock workspace")
	var wasRunning bool
	audit.run(chromedp.Evaluate(`(() => {
		const stop = document.querySelector('[data-action="stop"]');
		if (!(stop instanceof HTMLButtonElement)) return false;
		stop.click();
		return true;
	})()`, &wasRunning))
	if wasRunning {
		audit.wait(`Boolean(document.querySelector('[data-action="start"]')) &&
			document.querySelector('.mock-server-page')?.getAttribute('aria-busy') === 'false'`, "stopped previous mock server")
	}
	audit.click(`[data-action="import-openapi"]`)
	audit.wait(`document.querySelector('.mock-server-page')?.getAttribute('aria-busy') === 'false' &&
		document.querySelectorAll('[data-route-id]').length >= 2`, "mock OpenAPI route import")
	var selected bool
	audit.run(chromedp.Evaluate(`(() => {
		const row = [...document.querySelectorAll('[data-route-id]')]
			.find((candidate) => candidate.textContent?.includes('/api/orders/42'));
		if (!(row instanceof HTMLElement)) return false;
		row.click();
		return true;
	})()`, &selected))
	if !selected {
		audit.t.Fatal("imported live mock route was not selectable")
	}
	if err := mockSetControl(audit.world, `[data-field="headers"]`, `{"Content-Type":"application/json","X-Live-Mock":"true"}`); err != nil {
		audit.t.Fatal(err)
	}
	if err := mockSetControl(audit.world, `[data-field="body"]`, `{"source":"validex-mock","status":"READY"}`); err != nil {
		audit.t.Fatal(err)
	}
	audit.click(`[data-action="apply-routes"]`)
	audit.wait(`document.querySelector('.mock-server-page')?.getAttribute('aria-busy') === 'false' &&
		document.querySelector('[data-action="apply-routes"]')?.disabled === true`, "applied live mock routes")
	audit.click(`[data-action="start"]`)
	audit.wait(`Boolean(document.querySelector('[data-action="stop"]')) &&
		document.querySelector('.mock-server-page')?.getAttribute('aria-busy') === 'false'`, "running live mock server")
	var baseURL string
	audit.run(chromedp.Evaluate(`document.querySelector('[data-action="copy-url"]')?.textContent?.trim() || ''`, &baseURL))
	if !strings.HasPrefix(baseURL, "http://127.0.0.1:") {
		audit.t.Fatalf("live mock base URL = %q", baseURL)
	}
	audit.capture("live-06-mock-running")

	audit.openWorkspace("requests")
	audit.newRequest()
	audit.sendRequest("GET", baseURL+"/api/orders/42", "", 200)
	audit.wait(`document.querySelector('.response-code')?.textContent.includes('validex-mock')`, "built-in mock response")
	audit.openWorkspace("mock")
	audit.wait(`document.querySelectorAll('.mock-hit-table tbody tr').length >= 1`, "built-in mock hit history")
	audit.capture("live-07-mock-hit-history")
	audit.click(`[data-action="stop"]`)
	audit.wait(`Boolean(document.querySelector('[data-action="start"]'))`, "stopped live mock server")
	_ = api
}

func (audit *liveAudit) testOpenAPIImport(api *liveAPITracker) {
	audit.openWorkspace("requests")
	audit.click(`[data-topbar] [data-action="import"]`)
	audit.wait(`document.querySelector('.topbar-notice.success')?.textContent.includes('Validex Live Orders API') &&
		document.querySelectorAll('[data-action="open-api"]').length >= 2`, "live OpenAPI import")
	var opened bool
	audit.run(chromedp.Evaluate(`(() => {
		const endpoint = [...document.querySelectorAll('[data-action="open-api"]')]
			.find((candidate) => candidate.getAttribute('title')?.includes('/api/orders/42'));
		if (!(endpoint instanceof HTMLButtonElement)) return false;
		endpoint.click();
		return true;
	})()`, &opened))
	if !opened {
		audit.t.Fatal("live OpenAPI GET endpoint was not available")
	}
	audit.wait(`document.querySelector('[name="url"]')?.value.startsWith(`+requestJSON(api.URL())+`)`, "imported live endpoint")
	audit.click(`[data-request-form] .send-button[type="submit"]`)
	audit.wait(`document.querySelector('.response-summary .status-mark')?.textContent.trim().startsWith('200')`, "imported endpoint response")
	audit.wait(`Boolean(document.querySelector('[data-response-section="contract"]'))`, "OpenAPI contract result")
	audit.click(`[data-response-section="contract"]`)
	audit.wait(`Boolean(document.querySelector('.contract-ok'))`, "matching live OpenAPI contract")
	audit.capture("live-08-openapi-contract")
	audit.click(`[data-topbar] [data-action="dismiss-notice"]`)
	audit.wait(`!document.querySelector('.topbar-notice')`, "dismissed OpenAPI notice")
}

func (audit *liveAudit) testJSONLab() {
	audit.openWorkspace("json")
	cases := []struct {
		mode       string
		source     string
		extra      map[string]string
		action     string
		resultTest string
	}{
		{"format", `{"z":1,"a":{"ready":true}}`, nil, "format", `document.querySelector('[data-json-slot="result"] textarea')?.value.includes('"ready": true')`},
		{"diff", `{"id":42,"status":"READY"}`, map[string]string{"compare": `{"id":42,"status":"DONE"}`}, "compare", `document.querySelectorAll('.json-difference').length === 1`},
		{"query", `{"orders":[{"id":"order-42"}]}`, map[string]string{"path": "$.orders[0].id"}, "query", `document.querySelector('[data-json-slot="result"] textarea')?.value.includes('order-42')`},
		{"schema", `{"id":42,"active":true,"tags":["api"]}`, nil, "schema", `document.querySelector('[data-json-slot="result"] textarea')?.value.includes('json-schema.org')`},
		{"dto", `public record UserResponse(java.util.UUID id, String name, boolean active) {}`, nil, "dto", `document.querySelector('[data-json-slot="result"] textarea')?.value.includes('active')`},
	}
	for index, fixture := range cases {
		audit.click(fmt.Sprintf(`[data-json-mode="%s"]`, fixture.mode))
		audit.setControl(`[data-json-control="source"]`, fixture.source)
		for control, value := range fixture.extra {
			audit.setControl(fmt.Sprintf(`[data-json-control="%s"]`, control), value)
		}
		audit.click(fmt.Sprintf(`[data-json-action="%s"]`, fixture.action))
		audit.wait(fixture.resultTest, "JSON Lab "+fixture.mode+" result")
		audit.capture(fmt.Sprintf("live-json-%02d-%s", index+1, fixture.mode))
	}
}

func (audit *liveAudit) diagnosticsMode(label string) {
	audit.t.Helper()
	if err := audit.world.diagnosticsOpenMode(label); err != nil {
		audit.t.Fatalf("open diagnostics %s: %v", label, err)
	}
}

func (audit *liveAudit) diagnosticsControl(name, value string) {
	audit.t.Helper()
	if err := audit.world.diagnosticsSetControl(
		fmt.Sprintf(`[data-diagnostics-control="%s"]`, name),
		value,
	); err != nil {
		audit.t.Fatal(err)
	}
}

func (audit *liveAudit) diagnosticsRun(action string) {
	audit.t.Helper()
	if err := audit.world.diagnosticsClickAndWait(action); err != nil {
		audit.t.Fatalf("run diagnostics %s: %v", action, err)
	}
}

func (audit *liveAudit) testDiagnostics(
	primary, candidate *liveAPITracker,
) {
	audit.openWorkspace("diagnostics")
	audit.diagnosticsMode("Spring")
	audit.diagnosticsControl("spring-body", `{"type":"https://validex.test/problems/validation","title":"Validation failed","status":422,"detail":"quantity must be positive","traceId":"live-problem-422"}`)
	audit.diagnosticsControl("spring-status", "422")
	audit.diagnosticsControl("spring-headers", "Content-Type: application/problem+json\nX-Trace-ID: live-problem-422")
	audit.diagnosticsRun("analyze-spring")
	audit.capture("live-diagnostics-01-spring")

	audit.diagnosticsMode("JWT")
	audit.diagnosticsControl("jwt-input", diagnosticsJWT())
	audit.diagnosticsRun("analyze-jwt")
	audit.capture("live-diagnostics-02-jwt")

	audit.diagnosticsMode("Runtime")
	audit.diagnosticsControl("actuator-url", primary.URL()+"/actuator")
	audit.diagnosticsControl("metric-names", "jvm.memory.used")
	audit.diagnosticsRun("runtime-snapshot")
	audit.capture("live-diagnostics-03-runtime")

	audit.diagnosticsMode("Performance")
	audit.diagnosticsControl("performance-url", primary.URL()+"/actuator/health")
	audit.diagnosticsControl("performance-timeout", "3000")
	audit.diagnosticsControl("performance-samples", "3")
	audit.diagnosticsRun("performance-run")
	audit.capture("live-diagnostics-04-performance")

	audit.diagnosticsMode("Environments")
	audit.diagnosticsControl("environment-path", "/environment")
	audit.diagnosticsControl("environment-target", "Primary")
	audit.diagnosticsControl("environment-timeout", "3000")
	for index, target := range []struct{ name, url string }{
		{"Primary", primary.URL()},
		{"Candidate", candidate.URL()},
	} {
		audit.setControl(fmt.Sprintf(`[data-diagnostics-control="environment-target"][data-target-index="%d"][data-target-field="name"]`, index), target.name)
		audit.setControl(fmt.Sprintf(`[data-diagnostics-control="environment-target"][data-target-index="%d"][data-target-field="baseUrl"]`, index), target.url)
	}
	audit.diagnosticsRun("compare-environments")
	audit.capture("live-diagnostics-05-environments")

	audit.diagnosticsMode("Thread")
	audit.diagnosticsControl("thread-dump", `"worker-1" #1
   java.lang.Thread.State: BLOCKED
        at com.example.OrderService.load(OrderService.java:42)
        - waiting to lock <0x00000001>
"worker-2" #2
   java.lang.Thread.State: RUNNABLE
        at com.example.Worker.run(Worker.java:21)`)
	audit.diagnosticsRun("analyze-threads")
	audit.capture("live-diagnostics-06-thread")

	audit.diagnosticsMode("Logs")
	audit.diagnosticsControl("log-text", "2026-08-26 INFO boot complete\n2026-08-26 INFO traceId=live-trace-42 order ready\n2026-08-26 INFO complete")
	audit.diagnosticsControl("trace-query", "live-trace-42")
	audit.diagnosticsRun("search-logs")
	audit.capture("live-diagnostics-07-logs")

	audit.diagnosticsMode("Coverage")
	audit.diagnosticsControl("known-endpoints", "GET /api/orders/{id}\nPOST /api/echo")
	audit.diagnosticsControl("observed-calls", "GET /api/orders/42 [3]\nPOST /api/echo [1]")
	audit.diagnosticsRun("coverage-calculate")
	audit.capture("live-diagnostics-08-coverage")
}

func (audit *liveAudit) testProtocols(api *liveAPITracker) {
	audit.openWorkspace("protocols")
	for selector, value := range map[string]string{
		`[data-protocol-control="url"]`:       api.URL() + "/events",
		`[data-protocol-control="headers"]`:   `{"X-Validex-Client":"live-audit"}`,
		`[data-protocol-control="timeout"]`:   "5",
		`[data-protocol-control="maxEvents"]`: "2",
	} {
		if err := automationSetControl(audit.world, selector, value); err != nil {
			audit.t.Fatal(err)
		}
	}
	audit.click(`[data-protocol-focus="listen"]`)
	audit.wait(`document.querySelector('[data-protocol-form]')?.getAttribute('aria-busy') === 'false' &&
		document.querySelectorAll('.protocol-event-table tbody tr').length === 2`, "live SSE events")
	audit.capture("live-protocols-sse")
}

func (audit *liveAudit) testAutomation(api *liveAPITracker) {
	audit.openWorkspace("automation")
	definition, err := json.Marshal(map[string]any{
		"name": "Validex live collection",
		"requests": []map[string]any{{
			"id":     "live-order",
			"name":   "Live order",
			"method": "GET",
			"url":    api.URL() + "/api/orders/42",
			"assertions": []map[string]any{
				{"name": "HTTP 200", "target": "status", "operator": "equals", "expected": 200},
				{"name": "Order ID", "target": "json_path", "path": "$.order.id", "operator": "equals", "expected": "order-42"},
			},
		}},
	})
	if err != nil {
		audit.t.Fatal(err)
	}
	if err := automationSetControl(audit.world, `[data-form="runner"] [name="collection"]`, string(definition)); err != nil {
		audit.t.Fatal(err)
	}
	audit.click(`[data-focus="runner-run"]`)
	audit.wait(`document.querySelector('[data-form="runner"]')?.getAttribute('aria-busy') === 'false' &&
		document.querySelectorAll('.automation-request-result.passed').length === 1`, "live collection runner")
	audit.capture("live-automation-01-runner")

	audit.click(`[role="tab"][data-tab="network"]`)
	for selector, value := range map[string]string{
		`[data-form="network"] [name="url"]`:          api.URL() + "/api/redirect",
		`[data-form="network"] [name="timeout"]`:      "5",
		`[data-form="network"] [name="maxRedirects"]`: "4",
	} {
		if err := automationSetControl(audit.world, selector, value); err != nil {
			audit.t.Fatal(err)
		}
	}
	audit.click(`[data-focus="network-run"]`)
	audit.wait(`document.querySelector('[data-form="network"]')?.getAttribute('aria-busy') === 'false' &&
		document.querySelectorAll('.automation-network-results ol li').length === 2`, "live network redirect analysis")
	audit.capture("live-automation-02-network")

	audit.click(`[role="tab"][data-tab="openapi"]`)
	audit.click(`[data-action="lint"]`)
	audit.wait(`!document.querySelector('#automation-panel-openapi [aria-busy="true"]') &&
		Boolean(document.querySelector('.automation-lint-list, .automation-lint-success'))`, "live OpenAPI lint")
	audit.capture("live-automation-03-openapi")
}
