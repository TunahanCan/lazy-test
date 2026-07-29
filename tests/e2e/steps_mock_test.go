package e2e

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/chromedp/chromedp/kb"
	"github.com/cucumber/godog"
)

const (
	mockConfiguredPath    = "/orders/42"
	mockEditedPath        = "/inventory/{id}"
	mockInvalidHeaderText = "{not-valid-json"
)

func registerMockSteps(context *godog.ScenarioContext, world *browserWorld) {
	context.Step(
		`^the mock server is initially stopped$`,
		world.mockServerInitiallyStopped,
	)
	context.Step(`^I add a mock route$`, world.mockAddRoute)
	context.Step(
		`^I configure the route as "([^"]+)" with status (\d+) and a JSON response$`,
		world.mockConfigureRoute,
	)
	context.Step(
		`^the route is marked as having unapplied changes$`,
		world.mockRouteIsDirty,
	)
	context.Step(`^I apply the mock routes$`, world.mockApplyRoutes)
	context.Step(
		`^the route is synchronized with the native bridge$`,
		world.mockRouteIsSynchronized,
	)
	context.Step(
		`^I start the mock server with automatic port selection$`,
		world.mockStartWithAutomaticPort,
	)
	context.Step(
		`^the mock server reports a running state and a local base URL$`,
		world.mockServerReportsRunning,
	)
	context.Step(
		`^the bridge reports a matching mock request hit$`,
		world.mockBridgeReportsHit,
	)
	context.Step(
		`^the mock hit history shows its method, path, route, status, and duration$`,
		world.mockHitHistoryIsComplete,
	)
	context.Step(`^I stop the mock server$`, world.mockStopServer)
	context.Step(
		`^the mock server reports a stopped state$`,
		world.mockServerReportsStopped,
	)
	context.Step(
		`^three editable mock routes exist$`,
		world.mockCreateThreeRoutes,
	)
	context.Step(
		`^I navigate the mock route list with Arrow keys, Home, and End$`,
		world.mockNavigateRouteList,
	)
	context.Step(
		`^the selected route and route editor stay synchronized$`,
		world.mockSelectedRouteAndEditorAreSynchronized,
	)
	context.Step(
		`^I change the selected route method, path, status, delay, and enabled state$`,
		world.mockEditSelectedRoute,
	)
	context.Step(
		`^all route fields are preserved as unapplied changes$`,
		world.mockEditedFieldsArePreserved,
	)
	context.Step(
		`^I delete the selected route and confirm the deletion$`,
		world.mockDeleteSelectedRoute,
	)
	context.Step(
		`^an adjacent route becomes selected$`,
		world.mockAdjacentRouteIsSelected,
	)
	context.Step(
		`^applying routes persists the remaining routes$`,
		world.mockApplyRemainingRoutes,
	)
	context.Step(
		`^the mock OpenAPI picker will return valid route definitions$`,
		world.mockConfigureOpenAPIImport,
	)
	context.Step(
		`^I import OpenAPI routes into the mock server$`,
		world.mockImportOpenAPIRoutes,
	)
	context.Step(
		`^every imported route appears in the route list and editor$`,
		world.mockImportedRoutesAppear,
	)
	context.Step(
		`^the imported routes are synchronized with the native bridge$`,
		world.mockImportedRoutesAreSynchronized,
	)
	context.Step(
		`^I select manual port mode and enter an invalid port$`,
		world.mockEnterInvalidManualPort,
	)
	context.Step(
		`^starting the mock server is unavailable and the port is marked invalid$`,
		world.mockInvalidPortBlocksStart,
	)
	context.Step(
		`^I configure a route with invalid headers$`,
		world.mockConfigureInvalidHeaders,
	)
	context.Step(
		`^I attempt to apply the mock routes$`,
		world.mockAttemptToApplyRoutes,
	)
	context.Step(
		`^a route validation error is announced$`,
		world.mockRouteValidationErrorIsAnnounced,
	)
	context.Step(
		`^the invalid route remains available for correction$`,
		world.mockInvalidRouteIsPreserved,
	)
}

func mockJSON(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(fmt.Sprintf("encode mock E2E value: %v", err))
	}
	return string(encoded)
}

func mockWait(
	world *browserWorld,
	expression string,
	description string,
) error {
	if err := world.run(chromedp.Poll(
		expression,
		nil,
		chromedp.WithPollingInterval(25*time.Millisecond),
		chromedp.WithPollingTimeout(5*time.Second),
	)); err != nil {
		return fmt.Errorf("wait for %s: %w", description, err)
	}
	return nil
}

func mockSetControl(
	world *browserWorld,
	selector string,
	value string,
) error {
	var changed bool
	expression := fmt.Sprintf(`(() => {
		const control = document.querySelector(%s);
		if (!(
			control instanceof HTMLInputElement ||
			control instanceof HTMLSelectElement ||
			control instanceof HTMLTextAreaElement
		)) return false;
		control.focus();
		control.value = %s;
		control.dispatchEvent(new Event("input", { bubbles: true }));
		control.dispatchEvent(new Event("change", { bubbles: true }));
		return true;
	})()`, mockJSON(selector), mockJSON(value))
	if err := world.run(chromedp.Evaluate(expression, &changed)); err != nil {
		return err
	}
	if !changed {
		return fmt.Errorf("mock control %s was not found", selector)
	}
	return nil
}

func (w *browserWorld) mockServerInitiallyStopped() error {
	if err := mockWait(
		w,
		`Boolean(
			document.querySelector('.mock-server-page[aria-busy="false"]') &&
			document.querySelector('[data-action="start"]') &&
			!document.querySelector('[data-action="stop"]') &&
			globalThis.__VALIDEX_E2E__.calls.some(
				(call) => call.method === "GetMockServer"
			)
		)`,
		"initial stopped mock-server snapshot",
	); err != nil {
		return err
	}
	var state struct {
		Busy          string `json:"busy"`
		StartDisabled bool   `json:"startDisabled"`
		RouteCount    int    `json:"routeCount"`
		HitCount      int    `json:"hitCount"`
	}
	if err := w.run(chromedp.Evaluate(`(() => ({
		busy: document.querySelector(".mock-server-page")?.getAttribute("aria-busy") || "",
		startDisabled: document.querySelector('[data-action="start"]')?.disabled ?? true,
		routeCount: document.querySelectorAll("[data-route-id]").length,
		hitCount: document.querySelectorAll(".mock-hit-table tbody tr").length
	}))()`, &state)); err != nil {
		return err
	}
	if state.Busy != "false" || state.StartDisabled ||
		state.RouteCount != 0 || state.HitCount != 0 {
		return fmt.Errorf(
			"initial mock state is not clean and stopped: busy=%q startDisabled=%t routes=%d hits=%d",
			state.Busy,
			state.StartDisabled,
			state.RouteCount,
			state.HitCount,
		)
	}
	return nil
}

func (w *browserWorld) mockAddRoute() error {
	var before int
	if err := w.run(chromedp.Evaluate(
		`document.querySelectorAll("[data-route-id]").length`,
		&before,
	)); err != nil {
		return err
	}
	if err := w.run(
		chromedp.Click(`[data-action="add-route"]`, chromedp.ByQuery),
	); err != nil {
		return err
	}
	return mockWait(
		w,
		fmt.Sprintf(
			`document.querySelectorAll("[data-route-id]").length === %d &&
			 Boolean(document.querySelector('[data-field="path"]'))`,
			before+1,
		),
		"new editable mock route",
	)
}

func (w *browserWorld) mockConfigureRoute(
	target string,
	status int,
) error {
	parts := strings.SplitN(strings.TrimSpace(target), " ", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return fmt.Errorf("mock route target %q must contain method and path", target)
	}
	if err := mockSetControl(
		w,
		`[data-field="method"]`,
		parts[0],
	); err != nil {
		return err
	}
	if err := mockSetControl(
		w,
		`[data-field="path"]`,
		parts[1],
	); err != nil {
		return err
	}
	if err := mockSetControl(
		w,
		`[data-field="status"]`,
		fmt.Sprintf("%d", status),
	); err != nil {
		return err
	}
	if err := mockSetControl(
		w,
		`[data-field="headers"]`,
		`{"Content-Type":"application/json","X-E2E":"route"}`,
	); err != nil {
		return err
	}
	return mockSetControl(
		w,
		`[data-field="body"]`,
		`{"id":"order-42","status":"READY"}`,
	)
}

func (w *browserWorld) mockRouteIsDirty() error {
	var state struct {
		Warning      bool   `json:"warning"`
		Status       string `json:"status"`
		ApplyEnabled bool   `json:"applyEnabled"`
		StartBlocked bool   `json:"startBlocked"`
	}
	if err := w.run(chromedp.Evaluate(`(() => ({
		warning: Boolean(document.querySelector(".tool-notice.warning[role=status]")),
		status: document.querySelector(".mock-route-sync-status")?.textContent?.trim() || "",
		applyEnabled: document.querySelector('[data-action="apply-routes"]')?.disabled === false,
		startBlocked: document.querySelector('[data-action="start"]')?.disabled === true
	}))()`, &state)); err != nil {
		return err
	}
	if !state.Warning || state.Status == "" ||
		!state.ApplyEnabled || !state.StartBlocked {
		return fmt.Errorf(
			"dirty route state is incomplete: warning=%t status=%q apply=%t startBlocked=%t",
			state.Warning,
			state.Status,
			state.ApplyEnabled,
			state.StartBlocked,
		)
	}
	return nil
}

func (w *browserWorld) mockApplyRoutes() error {
	var before int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "UpdateMockRoutes"
		).length`,
		&before,
	)); err != nil {
		return err
	}
	if err := w.run(
		chromedp.Click(`[data-action="apply-routes"]`, chromedp.ByQuery),
	); err != nil {
		return err
	}
	return mockWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "UpdateMockRoutes"
			).length > %d &&
			document.querySelector('.mock-server-page')?.getAttribute("aria-busy") === "false" &&
			document.querySelector('[data-action="apply-routes"]')?.disabled === true &&
			!document.querySelector(".tool-notice.warning")`, before),
		"native route update and synchronized UI",
	)
}

func (w *browserWorld) mockRouteIsSynchronized() error {
	var state struct {
		ValidPayload bool `json:"validPayload"`
		RowMatches   bool `json:"rowMatches"`
		Editor       bool `json:"editor"`
		Synced       bool `json:"synced"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const calls = globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "UpdateMockRoutes"
		);
		const route = calls.at(-1)?.input?.[0];
		const row = document.querySelector('[data-route-id][aria-selected="true"]');
		return {
			validPayload: Boolean(
				route &&
				route.method === "GET" &&
				route.path === "/orders/42" &&
				route.status === 200 &&
				route.delayMs === 0 &&
				route.enabled === true &&
				route.headers?.["Content-Type"] === "application/json" &&
				route.headers?.["X-E2E"] === "route" &&
				JSON.parse(route.body).id === "order-42"
			),
			rowMatches:
				row?.querySelector(".mock-route-method")?.textContent === "GET" &&
				row?.querySelector(".mock-route-path")?.textContent === "/orders/42",
			editor:
				document.querySelector('[data-field="path"]')?.value === "/orders/42" &&
				document.querySelector('[data-field="status"]')?.value === "200",
			synced:
				document.querySelector('[data-action="apply-routes"]')?.disabled === true
		};
	})()`, &state)); err != nil {
		return err
	}
	if !state.ValidPayload || !state.RowMatches ||
		!state.Editor || !state.Synced {
		return fmt.Errorf(
			"mock route was not synchronized end-to-end: payload=%t row=%t editor=%t synced=%t",
			state.ValidPayload,
			state.RowMatches,
			state.Editor,
			state.Synced,
		)
	}
	return nil
}

func (w *browserWorld) mockStartWithAutomaticPort() error {
	var before int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "StartMockServer"
		).length`,
		&before,
	)); err != nil {
		return err
	}
	if err := w.run(
		chromedp.Click(`[data-action="start"]`, chromedp.ByQuery),
	); err != nil {
		return err
	}
	return mockWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "StartMockServer"
			).length > %d &&
			Boolean(document.querySelector('[data-action="stop"]')) &&
			document.querySelector('.mock-server-page')?.getAttribute("aria-busy") === "false"`,
			before,
		),
		"mock server start",
	)
}

func (w *browserWorld) mockServerReportsRunning() error {
	var state struct {
		StartInput bool   `json:"startInput"`
		URL        string `json:"url"`
		Running    bool   `json:"running"`
		PortLocked bool   `json:"portLocked"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const call = globalThis.__VALIDEX_E2E__.calls.filter(
			(item) => item.method === "StartMockServer"
		).at(-1);
		const copy = document.querySelector('[data-action="copy-url"]');
		return {
			startInput: call?.input?.port === 0 &&
				call?.input?.enableCors === false,
			url: copy?.textContent?.trim() || "",
			running: Boolean(
				document.querySelector('[data-action="stop"]') &&
				!document.querySelector('[data-action="start"]')
			),
			portLocked:
				document.querySelector('[data-action="port-auto"]')?.disabled === true &&
				document.querySelector('[data-action="port-manual"]')?.disabled === true
		};
	})()`, &state)); err != nil {
		return err
	}
	if !state.StartInput || !state.Running || !state.PortLocked ||
		!strings.Contains(state.URL, "http://127.0.0.1:") {
		return fmt.Errorf(
			"running mock state is incomplete: input=%t running=%t locked=%t url=%q",
			state.StartInput,
			state.Running,
			state.PortLocked,
			state.URL,
		)
	}
	return nil
}

func (w *browserWorld) mockBridgeReportsHit() error {
	hit := map[string]any{
		"id":         42,
		"routeId":    "",
		"method":     "GET",
		"path":       mockConfiguredPath,
		"rawQuery":   "expand=items",
		"status":     200,
		"matched":    true,
		"timestamp":  "2026-07-29T12:34:56.000Z",
		"durationMs": 17,
	}
	var routeID string
	if err := w.run(chromedp.Evaluate(
		`document.querySelector('[data-route-id]')?.getAttribute("data-route-id") || ""`,
		&routeID,
	)); err != nil {
		return err
	}
	if routeID == "" {
		return fmt.Errorf("cannot report mock hit without a route id")
	}
	hit["routeId"] = routeID
	if err := w.run(chromedp.Evaluate(
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.setMockHit(%s)`,
			mockJSON(hit),
		),
		nil,
	)); err != nil {
		return err
	}
	return mockWait(
		w,
		`document.querySelectorAll(".mock-hit-table tbody tr").length === 1`,
		"polled mock request hit",
	)
}

func (w *browserWorld) mockHitHistoryIsComplete() error {
	var state struct {
		Cells   []string `json:"cells"`
		Columns int      `json:"columns"`
		Clear   bool     `json:"clear"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const row = document.querySelector(".mock-hit-table tbody tr");
		return {
			cells: [...(row?.querySelectorAll("td") || [])].map(
				(cell) => cell.textContent?.trim() || ""
			),
			columns: document.querySelectorAll(".mock-hit-table thead th").length,
			clear: document.querySelector('[data-action="clear-hits"]')?.disabled === false
		};
	})()`, &state)); err != nil {
		return err
	}
	joined := strings.Join(state.Cells, " | ")
	for _, expected := range []string{
		"GET",
		"/orders/42?expand=items",
		"200",
		"17 ms",
	} {
		if !strings.Contains(joined, expected) {
			return fmt.Errorf(
				"mock hit history %q does not contain %q",
				joined,
				expected,
			)
		}
	}
	if state.Columns != 6 || len(state.Cells) != 6 || !state.Clear {
		return fmt.Errorf(
			"mock hit table structure is incomplete: columns=%d cells=%d clear=%t",
			state.Columns,
			len(state.Cells),
			state.Clear,
		)
	}
	return nil
}

func (w *browserWorld) mockStopServer() error {
	var clearBefore int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "ClearMockHits"
		).length`,
		&clearBefore,
	)); err != nil {
		return err
	}
	var clearDispatched bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const action = document.querySelector('[data-action="clear-hits"]');
		if (!(action instanceof HTMLButtonElement) || action.disabled) {
			return false;
		}
		action.click();
		return true;
	})()`, &clearDispatched)); err != nil {
		return fmt.Errorf("clear mock hit history before stopping: %w", err)
	}
	if !clearDispatched {
		return fmt.Errorf("clear mock hit history action was unavailable")
	}
	if err := mockWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "ClearMockHits"
			).length > %d`, clearBefore),
		"native clear mock hit operation",
	); err != nil {
		return err
	}
	if err := mockWait(
		w,
		`!document.querySelector(".mock-hit-table") &&
			document.querySelector('[data-action="clear-hits"]')?.disabled === true`,
		"cleared mock hit history UI",
	); err != nil {
		return err
	}

	staleSnapshot := map[string]any{
		"state": map[string]any{
			"running":      true,
			"host":         "127.0.0.1",
			"port":         43117,
			"baseUrl":      "http://127.0.0.1:43117",
			"routeCount":   1,
			"enabledCount": 1,
			"hitCount":     1,
			"totalHits":    999,
			"startedAt":    "2026-07-29T12:00:00.000Z",
		},
		"routes": []any{},
		"hits": []map[string]any{
			{
				"id":         999,
				"routeId":    "STALE_ROUTE",
				"method":     "DELETE",
				"path":       "/STALE_POLL_RESULT",
				"status":     599,
				"matched":    true,
				"timestamp":  "2026-07-29T12:35:00.000Z",
				"durationMs": 999,
			},
		},
		"canceled": false,
	}
	var getBefore int
	if err := w.run(chromedp.Evaluate(
		`(() => {
			const control = globalThis.__VALIDEX_E2E__;
			const before = control.calls.filter(
				(call) => call.method === "GetMockServer"
			).length;
			control.defer("GetMockServer");
			return before;
		})()`,
		&getBefore,
	)); err != nil {
		return err
	}
	if err := mockWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "GetMockServer"
		).length > %d`, getBefore),
		"in-flight stale polling snapshot",
	); err != nil {
		return err
	}

	var stopBefore int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "StopMockServer"
		).length`,
		&stopBefore,
	)); err != nil {
		return err
	}
	if err := w.run(
		chromedp.Click(`[data-action="stop"]`, chromedp.ByQuery),
	); err != nil {
		return err
	}
	if err := mockWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "StopMockServer"
			).length > %d &&
			Boolean(document.querySelector('[data-action="start"]')) &&
			document.querySelector('.mock-server-page')?.getAttribute("aria-busy") === "false"`,
			stopBefore,
		),
		"mock server stop",
	); err != nil {
		return err
	}

	// Resolve the deliberately older GetMockServer call only after StopMockServer
	// has completed. A pair of animation frames lets the awaiting refresh settle
	// without relying on a timing race or requiring a stale full-page render.
	var resolved bool
	if err := w.run(chromedp.Evaluate(
		fmt.Sprintf(`(() => {
			const page = document.querySelector(".mock-server-page");
			if (page) page.dataset.staleAwaitingRender = "true";
			const resolved = globalThis.__VALIDEX_E2E__.resolve(
				"GetMockServer",
				%s
			);
			if (resolved) {
				document.body.dataset.mockStaleFrames = "pending";
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						document.body.dataset.mockStaleFrames = "done";
					});
				});
			}
			return resolved;
		})()`, mockJSON(staleSnapshot)),
		&resolved,
	)); err != nil {
		return err
	}
	if !resolved {
		return fmt.Errorf("stale GetMockServer polling call was not pending")
	}
	if err := mockWait(
		w,
		`document.body.dataset.mockStaleFrames === "done"`,
		"stale polling completion settlement",
	); err != nil {
		return err
	}
	var staleIgnored bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const page = document.querySelector(".mock-server-page");
		const noStaleRender =
			page?.dataset.staleAwaitingRender === "true";
		if (page) delete page.dataset.staleAwaitingRender;
		delete document.body.dataset.mockStaleFrames;
		return Boolean(
			noStaleRender &&
			document.querySelector('[data-action="start"]') &&
			!document.querySelector('[data-action="stop"]') &&
			!document.body.textContent.includes("STALE_POLL_RESULT") &&
			!document.body.textContent.includes("STALE_ROUTE")
		);
	})()`, &staleIgnored)); err != nil {
		return err
	}
	if !staleIgnored {
		return fmt.Errorf("a stale polling snapshot overwrote the stopped mock state")
	}
	return nil
}

func (w *browserWorld) mockServerReportsStopped() error {
	var state struct {
		Stopped      bool `json:"stopped"`
		StartEnabled bool `json:"startEnabled"`
		StopCalls    int  `json:"stopCalls"`
		ClearCalls   int  `json:"clearCalls"`
		NoHits       bool `json:"noHits"`
	}
	if err := w.run(chromedp.Evaluate(`(() => ({
		stopped: Boolean(
			document.querySelector('[data-action="start"]') &&
			!document.querySelector('[data-action="stop"]') &&
			!document.querySelector('[data-action="copy-url"]')
		),
		startEnabled: document.querySelector('[data-action="start"]')?.disabled === false,
		stopCalls: globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "StopMockServer"
		).length,
		clearCalls: globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "ClearMockHits"
		).length,
		noHits: !document.querySelector(".mock-hit-table")
	}))()`, &state)); err != nil {
		return err
	}
	if !state.Stopped || !state.StartEnabled ||
		state.StopCalls == 0 || state.ClearCalls == 0 || !state.NoHits {
		return fmt.Errorf(
			"stopped mock state is incomplete: stopped=%t start=%t stopCalls=%d clearCalls=%d noHits=%t",
			state.Stopped,
			state.StartEnabled,
			state.StopCalls,
			state.ClearCalls,
			state.NoHits,
		)
	}
	return nil
}

func (w *browserWorld) mockCreateThreeRoutes() error {
	for index := 1; index <= 3; index++ {
		if err := w.mockAddRoute(); err != nil {
			return fmt.Errorf("add mock route %d: %w", index, err)
		}
		if err := mockSetControl(
			w,
			`[data-field="path"]`,
			fmt.Sprintf("/route/%d", index),
		); err != nil {
			return err
		}
	}
	return mockWait(
		w,
		`document.querySelectorAll("[data-route-id]").length === 3`,
		"three editable routes",
	)
}

func (w *browserWorld) mockNavigateRouteList() error {
	var routeIDs []string
	if err := w.run(chromedp.Evaluate(
		`[...document.querySelectorAll("[data-route-id]")]
			.map((route) => route.getAttribute("data-route-id"))`,
		&routeIDs,
	)); err != nil {
		return err
	}
	if len(routeIDs) != 3 {
		return fmt.Errorf("route list contains %d routes, want 3", len(routeIDs))
	}
	first := fmt.Sprintf(`[data-route-id="%s"]`, routeIDs[0])
	if err := w.run(
		chromedp.Click(first, chromedp.ByQuery),
		chromedp.Focus(first, chromedp.ByQuery),
	); err != nil {
		return err
	}
	sequence := []struct {
		key  string
		want string
	}{
		{key: kb.ArrowDown, want: routeIDs[1]},
		{key: kb.ArrowUp, want: routeIDs[0]},
		{key: kb.End, want: routeIDs[2]},
		{key: kb.Home, want: routeIDs[0]},
		{key: kb.ArrowDown, want: routeIDs[1]},
	}
	for _, item := range sequence {
		if err := w.run(chromedp.KeyEvent(item.key)); err != nil {
			return err
		}
		if err := mockWait(
			w,
			fmt.Sprintf(
				`document.querySelector('[data-route-id=%s]')?.getAttribute("aria-selected") === "true" &&
				document.activeElement === document.querySelector('[data-route-id=%s]')`,
				mockJSON(item.want),
				mockJSON(item.want),
			),
			"keyboard-selected mock route "+item.want,
		); err != nil {
			return err
		}
	}
	return nil
}

func (w *browserWorld) mockSelectedRouteAndEditorAreSynchronized() error {
	var state struct {
		SelectedPath string `json:"selectedPath"`
		EditorPath   string `json:"editorPath"`
		Heading      string `json:"heading"`
		Focused      bool   `json:"focused"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const selected = document.querySelector('[data-route-id][aria-selected="true"]');
		return {
			selectedPath: selected?.querySelector(".mock-route-path")?.textContent || "",
			editorPath: document.querySelector('[data-field="path"]')?.value || "",
			heading: document.querySelector(".tool-editor-card h2")?.textContent?.trim() || "",
			focused: document.activeElement === selected
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.SelectedPath != "/route/2" ||
		state.EditorPath != state.SelectedPath ||
		!strings.Contains(state.Heading, state.SelectedPath) ||
		!state.Focused {
		return fmt.Errorf(
			"route list/editor selection diverged: selected=%q editor=%q heading=%q focused=%t",
			state.SelectedPath,
			state.EditorPath,
			state.Heading,
			state.Focused,
		)
	}
	return nil
}

func (w *browserWorld) mockEditSelectedRoute() error {
	for selector, value := range map[string]string{
		`[data-field="method"]`: "PATCH",
		`[data-field="path"]`:   mockEditedPath,
		`[data-field="status"]`: "207",
		`[data-field="delay"]`:  "125",
	} {
		if err := mockSetControl(w, selector, value); err != nil {
			return err
		}
	}
	var enabled bool
	if err := w.run(chromedp.Evaluate(
		`document.querySelector('[data-field="enabled"]')?.checked ?? false`,
		&enabled,
	)); err != nil {
		return err
	}
	if !enabled {
		return fmt.Errorf("selected mock route unexpectedly started disabled")
	}
	return w.run(
		chromedp.Click(`[data-field="enabled"]`, chromedp.ByQuery),
	)
}

func (w *browserWorld) mockEditedFieldsArePreserved() error {
	var state struct {
		Method      string `json:"method"`
		Path        string `json:"path"`
		Status      string `json:"status"`
		Delay       string `json:"delay"`
		Enabled     bool   `json:"enabled"`
		Dirty       bool   `json:"dirty"`
		RowMethod   string `json:"rowMethod"`
		RowPath     string `json:"rowPath"`
		ApplyActive bool   `json:"applyActive"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const selected = document.querySelector('[data-route-id][aria-selected="true"]');
		return {
			method: document.querySelector('[data-field="method"]')?.value || "",
			path: document.querySelector('[data-field="path"]')?.value || "",
			status: document.querySelector('[data-field="status"]')?.value || "",
			delay: document.querySelector('[data-field="delay"]')?.value || "",
			enabled: document.querySelector('[data-field="enabled"]')?.checked ?? true,
			dirty: Boolean(document.querySelector(".tool-notice.warning[role=status]")),
			rowMethod: selected?.querySelector(".mock-route-method")?.textContent || "",
			rowPath: selected?.querySelector(".mock-route-path")?.textContent || "",
			applyActive: document.querySelector('[data-action="apply-routes"]')?.disabled === false
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.Method != "PATCH" || state.Path != mockEditedPath ||
		state.Status != "207" || state.Delay != "125" ||
		state.Enabled || !state.Dirty || !state.ApplyActive ||
		state.RowMethod != "PATCH" || state.RowPath != mockEditedPath {
		return fmt.Errorf(
			"edited mock route fields were not preserved: %+v",
			state,
		)
	}
	return nil
}

func (w *browserWorld) mockDeleteSelectedRoute() error {
	var deletedID string
	if err := w.run(chromedp.Evaluate(
		`document.querySelector('[data-route-id][aria-selected="true"]')
			?.getAttribute("data-route-id") || ""`,
		&deletedID,
	)); err != nil {
		return err
	}
	if deletedID == "" {
		return fmt.Errorf("there is no selected route to delete")
	}
	if err := w.run(
		chromedp.Click(`[data-action="delete-route"]`, chromedp.ByQuery),
		chromedp.WaitVisible(`dialog[open] [data-confirm]`, chromedp.ByQuery),
		chromedp.Click(`dialog[open] [data-confirm]`, chromedp.ByQuery),
	); err != nil {
		return err
	}
	return mockWait(
		w,
		fmt.Sprintf(`document.querySelectorAll("[data-route-id]").length === 2 &&
			!document.querySelector('[data-route-id=%s]') &&
			!document.querySelector("dialog[open]")`,
			mockJSON(deletedID),
		),
		"confirmed route deletion",
	)
}

func (w *browserWorld) mockAdjacentRouteIsSelected() error {
	var state struct {
		SelectedCount int    `json:"selectedCount"`
		SelectedPath  string `json:"selectedPath"`
		EditorPath    string `json:"editorPath"`
		Dirty         bool   `json:"dirty"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const selected = document.querySelector('[data-route-id][aria-selected="true"]');
		return {
			selectedCount: document.querySelectorAll(
				'[data-route-id][aria-selected="true"]'
			).length,
			selectedPath: selected?.querySelector(".mock-route-path")?.textContent || "",
			editorPath: document.querySelector('[data-field="path"]')?.value || "",
			dirty: document.querySelector('[data-action="apply-routes"]')?.disabled === false
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.SelectedCount != 1 || state.SelectedPath != "/route/3" ||
		state.EditorPath != state.SelectedPath || !state.Dirty {
		return fmt.Errorf("adjacent route selection is incorrect: %+v", state)
	}
	return nil
}

func (w *browserWorld) mockApplyRemainingRoutes() error {
	if err := w.mockApplyRoutes(); err != nil {
		return err
	}
	var state struct {
		Length int      `json:"length"`
		Paths  []string `json:"paths"`
		Synced bool     `json:"synced"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const routes = globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "UpdateMockRoutes"
		).at(-1)?.input || [];
		return {
			length: routes.length,
			paths: routes.map((route) => route.path),
			synced: document.querySelector('[data-action="apply-routes"]')?.disabled === true
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.Length != 2 || len(state.Paths) != 2 ||
		state.Paths[0] != "/route/1" || state.Paths[1] != "/route/3" ||
		!state.Synced {
		return fmt.Errorf(
			"remaining mock routes were not persisted in order: %+v",
			state,
		)
	}
	return nil
}

func (w *browserWorld) mockConfigureOpenAPIImport() error {
	snapshot := map[string]any{
		"state": map[string]any{
			"running":      false,
			"host":         "127.0.0.1",
			"port":         0,
			"baseUrl":      "",
			"routeCount":   2,
			"enabledCount": 2,
			"hitCount":     0,
			"totalHits":    0,
		},
		"routes": []map[string]any{
			{
				"id":      "openapi-orders-list",
				"method":  "GET",
				"path":    "/orders",
				"status":  200,
				"headers": map[string]string{"Content-Type": "application/json"},
				"body":    `{"items":[]}`,
				"delayMs": 0,
				"enabled": true,
			},
			{
				"id":      "openapi-orders-create",
				"method":  "POST",
				"path":    "/orders",
				"status":  201,
				"headers": map[string]string{"Content-Type": "application/json"},
				"body":    `{"id":"order-created"}`,
				"delayMs": 10,
				"enabled": true,
			},
		},
		"hits":         []any{},
		"importedPath": "/fixtures/orders.openapi.yaml",
		"canceled":     false,
	}
	config := map[string]any{
		"overrides": map[string]any{
			"ImportMockOpenAPI": snapshot,
		},
	}
	return w.run(chromedp.Evaluate(
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.configure(%s)`,
			mockJSON(config),
		),
		nil,
	))
}

func (w *browserWorld) mockImportOpenAPIRoutes() error {
	var before int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "ImportMockOpenAPI"
		).length`,
		&before,
	)); err != nil {
		return err
	}
	if err := w.run(
		chromedp.Click(`[data-action="import-openapi"]`, chromedp.ByQuery),
	); err != nil {
		return err
	}
	return mockWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "ImportMockOpenAPI"
			).length > %d &&
			document.querySelectorAll("[data-route-id]").length === 2 &&
			document.querySelector('.mock-server-page')?.getAttribute("aria-busy") === "false"`,
			before,
		),
		"OpenAPI mock route import",
	)
}

func (w *browserWorld) mockImportedRoutesAppear() error {
	var state struct {
		Methods    []string `json:"methods"`
		Paths      []string `json:"paths"`
		EditorID   string   `json:"editorID"`
		EditorPath string   `json:"editorPath"`
		Body       string   `json:"body"`
	}
	if err := w.run(chromedp.Evaluate(`(() => ({
		methods: [...document.querySelectorAll(".mock-route-method")]
			.map((element) => element.textContent || ""),
		paths: [...document.querySelectorAll(".mock-route-path")]
			.map((element) => element.textContent || ""),
		editorID: document.querySelector('[data-route-id][aria-selected="true"]')
			?.getAttribute("data-route-id") || "",
		editorPath: document.querySelector('[data-field="path"]')?.value || "",
		body: document.querySelector('[data-field="body"]')?.value || ""
	}))()`, &state)); err != nil {
		return err
	}
	if len(state.Methods) != 2 || state.Methods[0] != "GET" ||
		state.Methods[1] != "POST" || len(state.Paths) != 2 ||
		state.Paths[0] != "/orders" || state.Paths[1] != "/orders" ||
		state.EditorID != "openapi-orders-list" ||
		state.EditorPath != "/orders" ||
		!strings.Contains(state.Body, `"items"`) {
		return fmt.Errorf("imported OpenAPI routes are incomplete: %+v", state)
	}
	return nil
}

func (w *browserWorld) mockImportedRoutesAreSynchronized() error {
	var state struct {
		ImportCalls int  `json:"importCalls"`
		UpdateCalls int  `json:"updateCalls"`
		Dirty       bool `json:"dirty"`
		CanStart    bool `json:"canStart"`
	}
	if err := w.run(chromedp.Evaluate(`(() => ({
		importCalls: globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "ImportMockOpenAPI"
		).length,
		updateCalls: globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "UpdateMockRoutes"
		).length,
		dirty: document.querySelector('[data-action="apply-routes"]')?.disabled === false,
		canStart: document.querySelector('[data-action="start"]')?.disabled === false
	}))()`, &state)); err != nil {
		return err
	}
	if state.ImportCalls != 1 || state.UpdateCalls != 0 ||
		state.Dirty || !state.CanStart {
		return fmt.Errorf(
			"imported routes are not synchronized native state: %+v",
			state,
		)
	}
	return nil
}

func (w *browserWorld) mockEnterInvalidManualPort() error {
	if err := w.run(
		chromedp.Click(`[data-action="port-manual"]`, chromedp.ByQuery),
		chromedp.WaitVisible(`[data-field="port"]`, chromedp.ByQuery),
	); err != nil {
		return err
	}
	return mockSetControl(w, `[data-field="port"]`, "70000")
}

func (w *browserWorld) mockInvalidPortBlocksStart() error {
	var state struct {
		Invalid    string `json:"invalid"`
		Disabled   bool   `json:"disabled"`
		Hint       string `json:"hint"`
		StartCalls int    `json:"startCalls"`
	}
	if err := w.run(chromedp.Evaluate(`(() => ({
		invalid: document.querySelector('[data-field="port"]')?.getAttribute("aria-invalid") || "",
		disabled: document.querySelector('[data-action="start"]')?.disabled ?? false,
		hint: document.querySelector("#mock-server-port-help")?.textContent?.trim() || "",
		startCalls: globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "StartMockServer"
		).length
	}))()`, &state)); err != nil {
		return err
	}
	if state.Invalid != "true" || !state.Disabled ||
		state.Hint == "" || state.StartCalls != 0 {
		return fmt.Errorf("invalid manual port was not blocked: %+v", state)
	}
	return nil
}

func (w *browserWorld) mockConfigureInvalidHeaders() error {
	if err := w.mockAddRoute(); err != nil {
		return err
	}
	if err := mockSetControl(
		w,
		`[data-field="path"]`,
		"/invalid-headers",
	); err != nil {
		return err
	}
	return mockSetControl(
		w,
		`[data-field="headers"]`,
		mockInvalidHeaderText,
	)
}

func (w *browserWorld) mockAttemptToApplyRoutes() error {
	if err := w.run(
		chromedp.Click(`[data-action="apply-routes"]`, chromedp.ByQuery),
	); err != nil {
		return err
	}
	return mockWait(
		w,
		`Boolean(document.querySelector(".tool-notice.error[role=alert]"))`,
		"mock route validation error",
	)
}

func (w *browserWorld) mockRouteValidationErrorIsAnnounced() error {
	var state struct {
		Text        string `json:"text"`
		Role        string `json:"role"`
		UpdateCalls int    `json:"updateCalls"`
		Dirty       bool   `json:"dirty"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const notice = document.querySelector(".tool-notice.error");
		return {
			text: notice?.textContent?.trim() || "",
			role: notice?.getAttribute("role") || "",
			updateCalls: globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "UpdateMockRoutes"
			).length,
			dirty: document.querySelector('[data-action="apply-routes"]')?.disabled === false
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.Text == "" || state.Role != "alert" ||
		state.UpdateCalls != 0 || !state.Dirty {
		return fmt.Errorf("mock validation error is not accessible: %+v", state)
	}
	return nil
}

func (w *browserWorld) mockInvalidRouteIsPreserved() error {
	var state struct {
		Path         string `json:"path"`
		Headers      string `json:"headers"`
		Selected     bool   `json:"selected"`
		ApplyEnabled bool   `json:"applyEnabled"`
		StartBlocked bool   `json:"startBlocked"`
	}
	if err := w.run(chromedp.Evaluate(`(() => ({
		path: document.querySelector('[data-field="path"]')?.value || "",
		headers: document.querySelector('[data-field="headers"]')?.value || "",
		selected: Boolean(document.querySelector('[data-route-id][aria-selected="true"]')),
		applyEnabled: document.querySelector('[data-action="apply-routes"]')?.disabled === false,
		startBlocked: document.querySelector('[data-action="start"]')?.disabled === true
	}))()`, &state)); err != nil {
		return err
	}
	if state.Path != "/invalid-headers" ||
		state.Headers != mockInvalidHeaderText ||
		!state.Selected || !state.ApplyEnabled || !state.StartBlocked {
		return fmt.Errorf("invalid mock route was not preserved: %+v", state)
	}
	return nil
}
