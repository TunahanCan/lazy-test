package e2e

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/cucumber/godog"
)

const (
	automationRunnerFixtureName = "e2e-assertions"
	automationNetworkFixtureURL = "https://api.example.test/redirect-start"
)

func registerProtocolAutomationSteps(
	context *godog.ScenarioContext,
	world *browserWorld,
) {
	context.Step(
		`^the bridge will return an SSE stream with headers and multiple events$`,
		world.protocolConfigureCompletedStream,
	)
	context.Step(
		`^I configure an SSE connection with URL, headers, timeout, and event limit$`,
		world.protocolConfigureConnection,
	)
	context.Step(
		`^I start listening to the SSE stream$`,
		world.protocolStartListening,
	)
	context.Step(
		`^the protocol form is busy and offers a cancel action while listening$`,
		world.protocolFormIsBusyAndCancelable,
	)
	context.Step(
		`^the completed result shows HTTP status, duration, and event count$`,
		world.protocolCompletedMetricsAreShown,
	)
	context.Step(
		`^every SSE event shows its type, identifier, retry value, and data$`,
		world.protocolEventsAreComplete,
	)
	context.Step(
		`^the next SSE operation remains in progress until canceled$`,
		world.protocolDeferNextStream,
	)
	context.Step(
		`^I cancel the active protocol operation$`,
		world.protocolCancelActiveOperation,
	)
	context.Step(
		`^the bridge receives the protocol operation identifier$`,
		world.protocolBridgeReceivesOperationID,
	)
	context.Step(
		`^focus returns to the listen action when the operation completes$`,
		world.protocolFocusReturnsToListen,
	)
	context.Step(
		`^I open the "([^"]+)" automation mode$`,
		world.automationOpenMode,
	)
	context.Step(
		`^I provide the "([^"]+)" automation fixture$`,
		world.automationProvideFixture,
	)
	context.Step(
		`^I run the "([^"]+)" automation operation$`,
		world.automationRunOperation,
	)
	context.Step(
		`^the automation result shows the "([^"]+)" summary$`,
		world.automationResultShowsSummary,
	)
	context.Step(
		`^a completed automation status is announced$`,
		world.automationCompletedStatusIsAnnounced,
	)
	context.Step(
		`^a saved collection contains ordered requests$`,
		world.automationSeedSavedCollection,
	)
	context.Step(
		`^I select and load the saved collection in Collection Runner$`,
		world.automationSelectAndLoadSavedCollection,
	)
	context.Step(
		`^the runner definition contains every saved request in collection order$`,
		world.automationLoadedDefinitionIsOrdered,
	)
	context.Step(
		`^I run the loaded collection$`,
		world.automationRunLoadedCollection,
	)
	context.Step(
		`^every request and assertion result is displayed$`,
		world.automationEveryRequestAndAssertionIsDisplayed,
	)
	context.Step(
		`^the total passed, failed, and duration summaries are correct$`,
		world.automationLoadedCollectionTotalsAreCorrect,
	)
}

func automationJSON(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(fmt.Sprintf("encode protocol/automation E2E value: %v", err))
	}
	return string(encoded)
}

func automationWait(
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

func automationSetControl(
	world *browserWorld,
	selector string,
	value string,
) error {
	var changed bool
	if err := world.run(chromedp.Evaluate(
		fmt.Sprintf(`(() => {
			const control = document.querySelector(%s);
			if (!(
				control instanceof HTMLInputElement ||
				control instanceof HTMLTextAreaElement ||
				control instanceof HTMLSelectElement
			)) return false;
			control.focus();
			control.value = %s;
			control.dispatchEvent(new Event("input", { bubbles: true }));
			control.dispatchEvent(new Event("change", { bubbles: true }));
			return true;
		})()`, automationJSON(selector), automationJSON(value)),
		&changed,
	)); err != nil {
		return err
	}
	if !changed {
		return fmt.Errorf("automation control %s was not found", selector)
	}
	return nil
}

func (w *browserWorld) protocolConfigureCompletedStream() error {
	result := map[string]any{
		"statusCode": 200,
		"headers": map[string][]string{
			"content-type":  {"text/event-stream; charset=utf-8"},
			"cache-control": {"no-cache"},
			"x-stream-id":   {"stream-e2e-42"},
		},
		"events": []map[string]any{
			{
				"event":       "order.created",
				"id":          "evt-1",
				"data":        `{"id":"order-42","status":"READY"}`,
				"retryMillis": 1500,
				"hasRetry":    true,
			},
			{
				"event":       "heartbeat",
				"id":          "evt-2",
				"data":        "alive",
				"retryMillis": 0,
				"hasRetry":    false,
			},
		},
		"durationMs": 85,
	}
	config := map[string]any{
		"overrides": map[string]any{
			"RunSSE": map[string]any{
				"__delayMs": 1500,
				"value":     result,
			},
		},
	}
	return w.run(chromedp.Evaluate(
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.configure(%s)`,
			automationJSON(config),
		),
		nil,
	))
}

func (w *browserWorld) protocolConfigureConnection() error {
	for selector, value := range map[string]string{
		`[data-protocol-control="url"]`:       "https://api.example.test/events",
		`[data-protocol-control="headers"]`:   `{"Authorization":"Bearer e2e","X-Trace":"stream-42"}`,
		`[data-protocol-control="timeout"]`:   "12",
		`[data-protocol-control="maxEvents"]`: "2",
	} {
		if err := automationSetControl(w, selector, value); err != nil {
			return err
		}
	}
	var certificateEnabled bool
	if err := w.run(chromedp.Evaluate(
		`document.querySelector(
			'[data-protocol-control="insecureSkipVerify"]'
		)?.disabled === false`,
		&certificateEnabled,
	)); err != nil {
		return err
	}
	if !certificateEnabled {
		return fmt.Errorf("HTTPS SSE target did not enable certificate controls")
	}
	return w.run(chromedp.Click(
		`[data-protocol-control="insecureSkipVerify"]`,
		chromedp.ByQuery,
	))
}

func (w *browserWorld) protocolStartListening() error {
	var before int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "RunSSE"
		).length`,
		&before,
	)); err != nil {
		return err
	}
	if err := w.run(chromedp.Click(
		`[data-protocol-focus="listen"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return automationWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "RunSSE"
			).length > %d &&
			document.querySelector("[data-protocol-form]")?.getAttribute("aria-busy") === "true" &&
			Boolean(document.querySelector('[data-protocol-action="cancel"]'))`,
			before,
		),
		"active SSE listener",
	)
}

func (w *browserWorld) protocolFormIsBusyAndCancelable() error {
	var state struct {
		Busy             string `json:"busy"`
		DisabledControls int    `json:"disabledControls"`
		ControlCount     int    `json:"controlCount"`
		CancelEnabled    bool   `json:"cancelEnabled"`
		CancelFocused    bool   `json:"cancelFocused"`
		ResultBusy       string `json:"resultBusy"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const form = document.querySelector("[data-protocol-form]");
		const cancel = document.querySelector('[data-protocol-action="cancel"]');
		const controls = [...(form?.querySelectorAll(
			"[data-protocol-control]"
		) || [])];
		return {
			busy: form?.getAttribute("aria-busy") || "",
			disabledControls: controls.filter((control) => control.disabled).length,
			controlCount: controls.length,
			cancelEnabled: cancel?.disabled === false,
			cancelFocused: document.activeElement === cancel,
			resultBusy: document.querySelector(".protocol-result")
				?.getAttribute("aria-busy") || ""
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.Busy != "true" || state.ControlCount != 5 ||
		state.DisabledControls != state.ControlCount ||
		!state.CancelEnabled || !state.CancelFocused ||
		state.ResultBusy != "true" {
		return fmt.Errorf("SSE busy/cancel state is incomplete: %+v", state)
	}
	return nil
}

func (w *browserWorld) protocolCompletedMetricsAreShown() error {
	if err := automationWait(
		w,
		`document.querySelector("[data-protocol-form]")
				?.getAttribute("aria-busy") === "false" &&
			document.querySelectorAll(".protocol-metrics dd").length === 3 &&
			document.querySelectorAll(".protocol-event-table tbody tr").length === 2`,
		"completed SSE result",
	); err != nil {
		return err
	}
	var state struct {
		Metrics    []string `json:"metrics"`
		Summary    string   `json:"summary"`
		StatusRole string   `json:"statusRole"`
		Headers    string   `json:"headers"`
		InputValid bool     `json:"inputValid"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const call = globalThis.__VALIDEX_E2E__.calls.filter(
			(item) => item.method === "RunSSE"
		).at(-1);
		const summary = document.querySelector(".protocol-result-summary");
		return {
			metrics: [...document.querySelectorAll(".protocol-metrics dd")]
				.map((item) => item.textContent?.trim() || ""),
			summary: summary?.textContent?.trim() || "",
			statusRole: summary?.getAttribute("role") || "",
			headers: document.querySelector(".protocol-header-details")?.textContent || "",
			inputValid: Boolean(
				call?.input?.operationId &&
				call.input.url === "https://api.example.test/events" &&
				call.input.headers?.Authorization === "Bearer e2e" &&
				call.input.headers?.["X-Trace"] === "stream-42" &&
				call.input.timeoutMs === 12000 &&
				call.input.maxEvents === 2 &&
				call.input.insecureSkipVerify === true
			)
		};
	})()`, &state)); err != nil {
		return err
	}
	metrics := strings.Join(state.Metrics, " | ")
	if len(state.Metrics) != 3 ||
		state.Metrics[0] != "200" ||
		!strings.Contains(metrics, "85 ms") ||
		state.Metrics[2] != "2" ||
		state.Summary == "" ||
		state.StatusRole != "status" ||
		!strings.Contains(state.Headers, "text/event-stream") ||
		!strings.Contains(state.Headers, "stream-e2e-42") ||
		!state.InputValid {
		return fmt.Errorf("completed SSE metrics/input are incomplete: %+v", state)
	}
	return nil
}

func (w *browserWorld) protocolEventsAreComplete() error {
	var rows []struct {
		Cells []string `json:"cells"`
		Data  string   `json:"data"`
	}
	if err := w.run(chromedp.Evaluate(`[...document.querySelectorAll(
		".protocol-event-table tbody tr"
	)].map((row) => ({
		cells: [...row.querySelectorAll("td")].map(
			(cell) => cell.textContent?.trim() || ""
		),
		data: row.querySelector("pre")?.textContent || ""
	}))`, &rows)); err != nil {
		return err
	}
	if len(rows) != 2 {
		return fmt.Errorf("SSE event table has %d rows, want 2", len(rows))
	}
	first := strings.Join(rows[0].Cells, " | ")
	second := strings.Join(rows[1].Cells, " | ")
	if !strings.Contains(first, "order.created") ||
		!strings.Contains(first, "evt-1") ||
		!strings.Contains(first, "1500 ms") ||
		!strings.Contains(rows[0].Data, `"order-42"`) ||
		!strings.Contains(second, "heartbeat") ||
		!strings.Contains(second, "evt-2") ||
		!strings.Contains(second, "—") ||
		rows[1].Data != "alive" {
		return fmt.Errorf(
			"SSE event details are incomplete: first=%q second=%q",
			first,
			second,
		)
	}
	return nil
}

func (w *browserWorld) protocolDeferNextStream() error {
	return w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.defer("RunSSE")`,
		nil,
	))
}

func (w *browserWorld) protocolCancelActiveOperation() error {
	var before int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "CancelToolOperation"
		).length`,
		&before,
	)); err != nil {
		return err
	}
	if err := w.run(chromedp.Click(
		`[data-protocol-action="cancel"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return automationWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "CancelToolOperation"
		).length > %d`, before),
		"native SSE cancellation",
	)
}

func (w *browserWorld) protocolBridgeReceivesOperationID() error {
	var state struct {
		RunID       string `json:"runID"`
		CancelID    string `json:"cancelID"`
		RunCalls    int    `json:"runCalls"`
		CancelCalls int    `json:"cancelCalls"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const runs = globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "RunSSE"
		);
		const cancels = globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "CancelToolOperation"
		);
		return {
			runID: runs.at(-1)?.input?.operationId || "",
			cancelID: cancels.at(-1)?.input || "",
			runCalls: runs.length,
			cancelCalls: cancels.length
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.RunCalls != 1 || state.CancelCalls != 1 ||
		state.RunID == "" || state.RunID != state.CancelID {
		return fmt.Errorf(
			"protocol operation identifiers differ: run=%q cancel=%q calls=%d/%d",
			state.RunID,
			state.CancelID,
			state.RunCalls,
			state.CancelCalls,
		)
	}
	return nil
}

func (w *browserWorld) protocolFocusReturnsToListen() error {
	if err := automationWait(
		w,
		`document.querySelector("[data-protocol-form]")
				?.getAttribute("aria-busy") === "false" &&
			!document.querySelector('[data-protocol-action="cancel"]') &&
			document.activeElement === document.querySelector(
				'[data-protocol-focus="listen"]'
			)`,
		"SSE cancellation completion and restored focus",
	); err != nil {
		return err
	}
	var state struct {
		Issue      bool `json:"issue"`
		Listen     bool `json:"listen"`
		ControlsOn bool `json:"controlsOn"`
	}
	if err := w.run(chromedp.Evaluate(`(() => ({
		issue: Boolean(document.querySelector(
			'[data-protocol-slot="issue"] [role="alert"]'
		)),
		listen: document.querySelector(
			'[data-protocol-focus="listen"]'
		)?.disabled === false,
		controlsOn: [...document.querySelectorAll(
			"[data-protocol-control]"
		)].filter((control) => control.disabled).length === 1
	}))()`, &state)); err != nil {
		return err
	}
	// The HTTP URL leaves only the HTTPS-specific certificate checkbox disabled.
	if !state.Issue || !state.Listen || !state.ControlsOn {
		return fmt.Errorf("protocol form did not recover after cancel: %+v", state)
	}
	return nil
}

func automationModeID(label string) (string, error) {
	switch label {
	case "Runner":
		return "runner", nil
	case "Network":
		return "network", nil
	case "OpenAPI lint":
		return "openapi", nil
	default:
		return "", fmt.Errorf("unknown automation mode %q", label)
	}
}

func (w *browserWorld) automationOpenMode(label string) error {
	mode, err := automationModeID(label)
	if err != nil {
		return err
	}
	selector := fmt.Sprintf(`#automation-tab-%s`, mode)
	if err := w.run(
		chromedp.WaitVisible(selector, chromedp.ByQuery),
		chromedp.Click(selector, chromedp.ByQuery),
	); err != nil {
		return err
	}
	if err := automationWait(
		w,
		fmt.Sprintf(`document.querySelector(%s)?.getAttribute("aria-selected") === "true" &&
			document.querySelector(%s)?.getAttribute("aria-controls") ===
				"automation-panel-%s" &&
			!document.querySelector("#automation-panel-%s")?.hidden`,
			automationJSON(selector),
			automationJSON(selector),
			mode,
			mode,
		),
		"active automation mode "+mode,
	); err != nil {
		return err
	}
	var accessibility struct {
		Selected string `json:"selected"`
		TabIndex int    `json:"tabIndex"`
		Role     string `json:"role"`
	}
	if err := w.run(chromedp.Evaluate(
		fmt.Sprintf(`(() => {
			const tab = document.querySelector(%s);
			return {
				selected: tab?.getAttribute("aria-selected") || "",
				tabIndex: tab?.tabIndex ?? -1,
				role: document.querySelector("#automation-panel-%s")
					?.getAttribute("role") || ""
			};
		})()`, automationJSON(selector), mode),
		&accessibility,
	)); err != nil {
		return err
	}
	if accessibility.Selected != "true" ||
		accessibility.TabIndex != 0 ||
		accessibility.Role != "tabpanel" {
		return fmt.Errorf(
			"automation mode %q accessibility state is incomplete: %+v",
			label,
			accessibility,
		)
	}
	return nil
}

func automationCollectionFixture() string {
	document := map[string]any{
		"version": 2,
		"name":    automationRunnerFixtureName,
		"requests": []map[string]any{
			{
				"id":     "health",
				"name":   "Health",
				"method": "GET",
				"url":    "https://api.example.test/health",
				"assertions": []map[string]any{
					{
						"id":       "health-status",
						"name":     "HTTP 200",
						"target":   "status",
						"operator": "equals",
						"expected": 200,
					},
				},
			},
			{
				"id":     "orders",
				"name":   "Orders",
				"method": "GET",
				"url":    "https://api.example.test/orders",
				"assertions": []map[string]any{
					{
						"id":       "orders-status",
						"name":     "HTTP 200",
						"target":   "status",
						"operator": "equals",
						"expected": 200,
					},
				},
			},
		},
	}
	return automationJSON(document)
}

func (w *browserWorld) automationProvideFixture(name string) error {
	switch name {
	case "collection with assertions":
		if err := automationSetControl(
			w,
			`[data-form="runner"] [name="collection"]`,
			automationCollectionFixture(),
		); err != nil {
			return err
		}
		return automationSetControl(
			w,
			`[data-form="runner"] [name="variables"]`,
			`{"token":"runner-e2e"}`,
		)
	case "redirecting HTTPS endpoint":
		for selector, value := range map[string]string{
			`[data-form="network"] [name="url"]`:          automationNetworkFixtureURL,
			`[data-form="network"] [name="timeout"]`:      "20",
			`[data-form="network"] [name="maxRedirects"]`: "5",
		} {
			if err := automationSetControl(w, selector, value); err != nil {
				return err
			}
		}
		return w.run(chromedp.Click(
			`[data-form="network"] [name="insecure"]`,
			chromedp.ByQuery,
		))
	case "OpenAPI document with issues":
		// The fixture's deterministic lint report includes error, warning, and
		// info issues. Explicit configuration makes that contract visible in
		// this Given step rather than relying on an incidental default.
		report := map[string]any{
			"path":     "/fixtures/orders.openapi.yaml",
			"canceled": false,
			"report": map[string]any{
				"issues": []map[string]any{
					{
						"code":     "operation.summary",
						"severity": "warning",
						"path":     "/paths/~1orders/get",
						"message":  "Operation summary should be more descriptive.",
						"hint":     "Use a user-facing summary.",
					},
					{
						"code":     "response.error",
						"severity": "error",
						"path":     "/paths/~1orders/post/responses",
						"message":  "An error response is required.",
					},
					{
						"code":     "document.info",
						"severity": "info",
						"path":     "/info",
						"message":  "Contact information is recommended.",
					},
				},
				"summary": map[string]any{
					"paths":      1,
					"operations": 2,
					"total":      3,
					"errors":     1,
					"warnings":   1,
					"infos":      1,
				},
				"truncated": false,
			},
		}
		return w.run(chromedp.Evaluate(
			fmt.Sprintf(
				`globalThis.__VALIDEX_E2E__.configure(%s)`,
				automationJSON(map[string]any{
					"overrides": map[string]any{"LintOpenAPI": report},
				}),
			),
			nil,
		))
	default:
		return fmt.Errorf("unknown automation fixture %q", name)
	}
}

func (w *browserWorld) automationRunOperation(operation string) error {
	switch operation {
	case "run collection":
		return w.automationRunCancelableMode(
			"runner",
			"RunCollection",
			`[data-form="runner"]`,
			`[data-focus="runner-run"]`,
			`[data-action="runner-stop"]`,
			`document.querySelector(
				'[data-form="runner"] [name="collection"]'
			)?.value.includes('"e2e-assertions"') &&
			document.querySelector(
				'[data-form="runner"] [name="variables"]'
			)?.value === '{"token":"runner-e2e"}'`,
		)
	case "analyze network":
		return w.automationRunCancelableMode(
			"network",
			"AnalyzeNetwork",
			`[data-form="network"]`,
			`[data-focus="network-run"]`,
			`[data-action="network-stop"]`,
			fmt.Sprintf(`document.querySelector(
					'[data-form="network"] [name="url"]'
				)?.value === %s &&
				document.querySelector(
					'[data-form="network"] [name="timeout"]'
				)?.value === "20" &&
				document.querySelector(
					'[data-form="network"] [name="maxRedirects"]'
				)?.value === "5" &&
				document.querySelector(
					'[data-form="network"] [name="insecure"]'
				)?.checked === true`,
				automationJSON(automationNetworkFixtureURL),
			),
		)
	case "lint OpenAPI":
		var before int
		if err := w.run(chromedp.Evaluate(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "LintOpenAPI"
			).length`,
			&before,
		)); err != nil {
			return err
		}
		if err := w.run(chromedp.Click(
			`[data-action="lint"]`,
			chromedp.ByQuery,
		)); err != nil {
			return err
		}
		return automationWait(
			w,
			fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
					(call) => call.method === "LintOpenAPI"
				).length > %d &&
				document.querySelector("#automation-panel-openapi")
					?.querySelector('[aria-busy="true"]') === null &&
				document.querySelectorAll(".automation-lint-list li").length === 3`,
				before,
			),
			"completed OpenAPI lint operation",
		)
	default:
		return fmt.Errorf("unknown automation operation %q", operation)
	}
}

func (w *browserWorld) automationRunCancelableMode(
	mode string,
	bridgeMethod string,
	formSelector string,
	runSelector string,
	stopSelector string,
	preservedExpression string,
) error {
	var operationBefore int
	if err := w.run(chromedp.Evaluate(
		fmt.Sprintf(`(() => {
			const control = globalThis.__VALIDEX_E2E__;
			const before = control.calls.filter(
				(call) => call.method === %s
			).length;
			control.defer(%s);
			return before;
		})()`, automationJSON(bridgeMethod), automationJSON(bridgeMethod)),
		&operationBefore,
	)); err != nil {
		return err
	}
	if err := w.run(chromedp.Click(runSelector, chromedp.ByQuery)); err != nil {
		return err
	}
	if err := automationWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === %s
			).length > %d &&
			document.querySelector(%s)?.getAttribute("aria-busy") === "true" &&
			Boolean(document.querySelector(%s))`,
			automationJSON(bridgeMethod),
			operationBefore,
			automationJSON(formSelector),
			automationJSON(stopSelector),
		),
		"deferred "+mode+" automation operation",
	); err != nil {
		return err
	}
	if err := w.automationSwitchLocaleWhileBusy(
		formSelector,
		preservedExpression,
	); err != nil {
		return err
	}
	var cancelBefore int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "CancelToolOperation"
		).length`,
		&cancelBefore,
	)); err != nil {
		return err
	}
	if err := w.run(chromedp.Click(stopSelector, chromedp.ByQuery)); err != nil {
		return err
	}
	if err := automationWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "CancelToolOperation"
			).length > %d &&
			document.querySelector(%s)?.getAttribute("aria-busy") === "false" &&
			document.activeElement === document.querySelector(%s) &&
			(%s)`,
			cancelBefore,
			automationJSON(formSelector),
			automationJSON(runSelector),
			preservedExpression,
		),
		"canceled "+mode+" operation with restored input and focus",
	); err != nil {
		return err
	}

	var cancellationMatches bool
	if err := w.run(chromedp.Evaluate(
		fmt.Sprintf(`(() => {
			const operations = globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === %s
			);
			const cancels = globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "CancelToolOperation"
			);
			return Boolean(
				operations.at(-1)?.input?.operationId &&
				operations.at(-1).input.operationId === cancels.at(-1)?.input
			);
		})()`, automationJSON(bridgeMethod)),
		&cancellationMatches,
	)); err != nil {
		return err
	}
	if !cancellationMatches {
		return fmt.Errorf("%s cancel did not use its active operation id", mode)
	}

	if err := w.run(chromedp.Click(runSelector, chromedp.ByQuery)); err != nil {
		return err
	}
	return automationWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === %s
			).length > %d &&
			document.querySelector(%s)?.getAttribute("aria-busy") === "false" &&
			Boolean(document.querySelector(
				"#automation-panel-%s .automation-summary"
			))`,
			automationJSON(bridgeMethod),
			operationBefore+1,
			automationJSON(formSelector),
			mode,
		),
		"completed "+mode+" operation after cancellation",
	)
}

func (w *browserWorld) automationSwitchLocaleWhileBusy(
	formSelector string,
	preservedExpression string,
) error {
	if err := w.run(
		chromedp.Click(`[data-action="settings"]`, chromedp.ByQuery),
		chromedp.WaitVisible(`[role="menu"]`, chromedp.ByQuery),
	); err != nil {
		return fmt.Errorf("open settings while automation is busy: %w", err)
	}
	var targetLocale string
	if err := w.run(chromedp.Evaluate(`(() => {
		const current = document.documentElement.lang;
		const target = current === "tr" ? "en" : "tr";
		const label = target === "tr" ? "Türkçe" : "English";
		const item = [...document.querySelectorAll(
			':is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]):not(:disabled)'
		)].find((candidate) => candidate.textContent?.trim() === label);
		if (!(item instanceof HTMLButtonElement)) return "";
		item.click();
		return target;
	})()`, &targetLocale)); err != nil {
		return err
	}
	if targetLocale == "" {
		return fmt.Errorf("opposite locale action was not available")
	}
	return automationWait(
		w,
		fmt.Sprintf(`document.documentElement.lang === %s &&
			document.querySelector(%s)?.getAttribute("aria-busy") === "true" &&
			(%s)`,
			automationJSON(targetLocale),
			automationJSON(formSelector),
			preservedExpression,
		),
		"busy automation form preservation across locale rerender",
	)
}

func (w *browserWorld) automationResultShowsSummary(name string) error {
	var matches bool
	var details string
	switch name {
	case "passed and failed requests":
		if err := w.run(chromedp.Evaluate(`(() => {
			const call = globalThis.__VALIDEX_E2E__.calls.filter(
				(item) => item.method === "RunCollection"
			).at(-1);
			const definition = JSON.parse(call?.input?.definition || "{}");
			const passed = document.querySelectorAll(
				".automation-request-result.passed"
			).length;
			const failed = document.querySelectorAll(
				".automation-request-result.failed"
			).length;
			const assertionPassed = document.querySelectorAll(
				".automation-assertions li.passed"
			).length;
			const assertionFailed = document.querySelectorAll(
				".automation-assertions li.failed"
			).length;
			return Boolean(
				definition.name === "e2e-assertions" &&
				call.input.variables?.token === "runner-e2e" &&
				passed === 1 &&
				failed === 1 &&
				assertionPassed === 1 &&
				assertionFailed === 1
			);
		})()`, &matches)); err != nil {
			return err
		}
		details = "runner passed/failed request and assertion counts"
	case "DNS redirects and final URL":
		if err := w.run(chromedp.Evaluate(
			fmt.Sprintf(`(() => {
				const call = globalThis.__VALIDEX_E2E__.calls.filter(
					(item) => item.method === "AnalyzeNetwork"
				).at(-1);
				const dns = document.querySelector(".automation-network-results section ul");
				const hops = document.querySelectorAll(
					".automation-network-results section ol li"
				);
				const finalURL = document.querySelector(
					".automation-final-url code"
				)?.textContent || "";
				const text = document.querySelector(
					".automation-network-results"
				)?.textContent || "";
				return Boolean(
					call?.input?.url === %s &&
					call.input.timeoutMs === 20000 &&
					call.input.maxRedirects === 5 &&
					call.input.insecureSkipVerify === true &&
					dns?.textContent?.includes("api.example.test") &&
					dns?.textContent?.includes("203.0.113.10") &&
					hops.length === 2 &&
					text.includes("301") &&
					text.includes("200") &&
					finalURL === "https://api.example.test/v2"
				);
			})()`, automationJSON(automationNetworkFixtureURL)),
			&matches,
		)); err != nil {
			return err
		}
		details = "network DNS, redirect hops, input, and final URL"
	case "errors warnings and issue list":
		if err := w.run(chromedp.Evaluate(`(() => {
			const issues = document.querySelectorAll(".automation-lint-list li");
			const summary = [...document.querySelectorAll(
				"#automation-panel-openapi .automation-summary div"
			)].map((item) => ({
				label: item.querySelector("dt")?.textContent?.trim() || "",
				value: item.querySelector("dd")?.textContent?.trim() || ""
			}));
			const text = document.querySelector(".automation-lint-list")
				?.textContent || "";
			return Boolean(
				globalThis.__VALIDEX_E2E__.calls.filter(
					(call) => call.method === "LintOpenAPI"
				).length === 1 &&
				issues.length === 3 &&
				document.querySelectorAll(".automation-lint-list li.error").length === 1 &&
				document.querySelectorAll(".automation-lint-list li.warning").length === 1 &&
				document.querySelectorAll(".automation-lint-list li.info").length === 1 &&
				summary.length === 4 &&
				summary.map((item) => item.value).join(",") === "2,1,1,1" &&
				text.includes("operation.summary") &&
				text.includes("response.error") &&
				text.includes("document.info")
			);
		})()`, &matches)); err != nil {
			return err
		}
		details = "OpenAPI error, warning, info summary and issue list"
	default:
		return fmt.Errorf("unknown automation result summary %q", name)
	}
	if !matches {
		return fmt.Errorf("automation result is missing %s", details)
	}
	return nil
}

func (w *browserWorld) automationCompletedStatusIsAnnounced() error {
	var state struct {
		Text       string `json:"text"`
		Role       string `json:"role"`
		Tone       string `json:"tone"`
		HasIcon    bool   `json:"hasIcon"`
		AnyBusy    bool   `json:"anyBusy"`
		ActionType string `json:"actionType"`
		Focused    bool   `json:"focused"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const notice = document.querySelector(".automation-page > .tool-notice");
		const activePanel = document.querySelector(
			'.automation-page [role="tabpanel"]:not([hidden])'
		);
		const action = activePanel?.querySelector(
			'[data-focus="runner-run"], [data-focus="network-run"], [data-focus="lint"]'
		);
		return {
			text: notice?.textContent?.trim() || "",
			role: notice?.getAttribute("role") || "",
			tone: notice?.className || "",
			hasIcon: Boolean(notice?.querySelector("svg")),
			anyBusy: Boolean(activePanel?.querySelector('[aria-busy="true"]')),
			actionType: action?.getAttribute("data-focus") || "",
			focused: document.activeElement === action
		};
	})()`, &state)); err != nil {
		return err
	}
	expectedTone := ""
	expectedRole := ""
	switch state.ActionType {
	case "runner-run", "lint":
		expectedTone = "error"
		expectedRole = "alert"
	case "network-run":
		expectedTone = "success"
		expectedRole = "status"
	}
	if state.Text == "" ||
		state.Role != expectedRole ||
		!strings.Contains(state.Tone, expectedTone) ||
		!state.HasIcon || state.AnyBusy || state.ActionType == "" ||
		!state.Focused {
		return fmt.Errorf("completed automation announcement is incomplete: %+v", state)
	}
	return nil
}

func automationSavedCollectionDocument() string {
	const timestamp = "2026-07-29T12:00:00.000Z"
	request := func(
		id string,
		name string,
		method string,
		url string,
		order int,
	) map[string]any {
		return map[string]any{
			"id":           id,
			"collectionId": "collection-runner",
			"name":         name,
			"method":       method,
			"url":          url,
			"headers": []map[string]any{
				{
					"id":      "header-" + id,
					"enabled": true,
					"key":     "X-E2E-Order",
					"value":   fmt.Sprintf("%d", order),
				},
			},
			"body":          "",
			"createdAt":     timestamp,
			"updatedAt":     timestamp,
			"sortOrder":     order,
			"literalValues": false,
		}
	}
	return automationJSON(map[string]any{
		"state": map[string]any{
			"collections": []map[string]any{
				{
					"id":        "collection-runner",
					"name":      "Ordered E2E collection",
					"createdAt": timestamp,
					"updatedAt": timestamp,
					"sortOrder": 0,
				},
			},
			"requests": []map[string]any{
				request(
					"saved-health",
					"Health",
					"GET",
					"https://api.example.test/health",
					0,
				),
				request(
					"saved-orders",
					"Orders",
					"POST",
					"https://api.example.test/orders",
					1,
				),
			},
			"expandedCollectionIds": []string{"collection-runner"},
		},
		"version": 1,
	})
}

func (w *browserWorld) automationSeedSavedCollection() error {
	w.closePage()
	w.initialConfig = map[string]any{
		"collectionData": automationSavedCollectionDocument(),
	}
	if err := w.openPage(); err != nil {
		return fmt.Errorf("reload saved collection fixture: %w", err)
	}
	if err := w.selectWorkspace("automation"); err != nil {
		return fmt.Errorf("return to Automation workspace: %w", err)
	}
	return automationWait(
		w,
		`Boolean(
			document.querySelector(
				'[data-runner-saved-collection] option[value="collection-runner"]'
			) &&
			globalThis.__VALIDEX_E2E__.calls.some(
				(call) => call.method === "LoadCollectionLibrary"
			)
		)`,
		"saved collection hydration in Collection Runner",
	)
}

func (w *browserWorld) automationSelectAndLoadSavedCollection() error {
	var selected bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const select = document.querySelector("[data-runner-saved-collection]");
		if (!(select instanceof HTMLSelectElement)) return false;
		select.focus();
		select.value = "collection-runner";
		select.dispatchEvent(new Event("change", { bubbles: true }));
		return select.value === "collection-runner";
	})()`, &selected)); err != nil {
		return err
	}
	if !selected {
		return fmt.Errorf("saved collection option could not be selected")
	}
	if err := w.run(chromedp.Click(
		`[data-action="runner-load-saved"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return automationWait(
		w,
		`(() => {
			const input = document.querySelector(
				'[data-form="runner"] [name="collection"]'
			)?.value;
			if (!input) return false;
			const definition = JSON.parse(input);
			return definition.version === 2 &&
				definition.name === "Ordered E2E collection" &&
				definition.requests?.length === 2;
		})()`,
		"saved collection loaded into runner definition",
	)
}

func (w *browserWorld) automationLoadedDefinitionIsOrdered() error {
	var state struct {
		Version int      `json:"version"`
		Name    string   `json:"name"`
		IDs     []string `json:"ids"`
		Methods []string `json:"methods"`
		Headers []string `json:"headers"`
		Notice  bool     `json:"notice"`
		Focused bool     `json:"focused"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const input = document.querySelector(
			'[data-form="runner"] [name="collection"]'
		);
		const definition = JSON.parse(input?.value || "{}");
		return {
			version: definition.version || 0,
			name: definition.name || "",
			ids: (definition.requests || []).map((request) => request.id),
			methods: (definition.requests || []).map((request) => request.method),
			headers: (definition.requests || []).map(
				(request) => request.headers?.[0]?.value || ""
			),
			notice: Boolean(document.querySelector(
				".automation-page > .tool-notice.success[role=status]"
			)),
			focused: document.activeElement === input
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.Version != 2 ||
		state.Name != "Ordered E2E collection" ||
		len(state.IDs) != 2 ||
		state.IDs[0] != "saved-health" ||
		state.IDs[1] != "saved-orders" ||
		len(state.Methods) != 2 ||
		state.Methods[0] != "GET" ||
		state.Methods[1] != "POST" ||
		len(state.Headers) != 2 ||
		state.Headers[0] != "0" ||
		state.Headers[1] != "1" ||
		!state.Notice ||
		!state.Focused {
		return fmt.Errorf("saved collection runner definition is not ordered: %+v", state)
	}
	return nil
}

func (w *browserWorld) automationRunLoadedCollection() error {
	var before int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "RunCollection"
		).length`,
		&before,
	)); err != nil {
		return err
	}
	if err := w.run(chromedp.Click(
		`[data-focus="runner-run"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return automationWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "RunCollection"
			).length > %d &&
			document.querySelector('[data-form="runner"]')
				?.getAttribute("aria-busy") === "false" &&
			document.querySelectorAll(".automation-request-result").length === 2`,
			before,
		),
		"saved collection run",
	)
}

func (w *browserWorld) automationEveryRequestAndAssertionIsDisplayed() error {
	var state struct {
		Requests   int      `json:"requests"`
		Names      []string `json:"names"`
		Assertions int      `json:"assertions"`
		Passed     int      `json:"passed"`
		Failed     int      `json:"failed"`
	}
	if err := w.run(chromedp.Evaluate(`(() => ({
		requests: document.querySelectorAll(".automation-request-result").length,
		names: [...document.querySelectorAll(
			".automation-request-result header strong"
		)].map((item) => item.textContent?.trim() || ""),
		assertions: document.querySelectorAll(".automation-assertions li").length,
		passed: document.querySelectorAll(".automation-assertions li.passed").length,
		failed: document.querySelectorAll(".automation-assertions li.failed").length
	}))()`, &state)); err != nil {
		return err
	}
	if state.Requests != 2 ||
		len(state.Names) != 2 ||
		state.Names[0] != "Health" ||
		state.Names[1] != "Orders" ||
		state.Assertions != 2 ||
		state.Passed != 1 ||
		state.Failed != 1 {
		return fmt.Errorf("runner request/assertion details are incomplete: %+v", state)
	}
	return nil
}

func (w *browserWorld) automationLoadedCollectionTotalsAreCorrect() error {
	var state struct {
		Values         []string `json:"values"`
		DefinitionIDs  []string `json:"definitionIDs"`
		DefinitionName string   `json:"definitionName"`
		VariablesEmpty bool     `json:"variablesEmpty"`
		Focused        bool     `json:"focused"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const call = globalThis.__VALIDEX_E2E__.calls.filter(
			(item) => item.method === "RunCollection"
		).at(-1);
		const definition = JSON.parse(call?.input?.definition || "{}");
		const run = document.querySelector('[data-focus="runner-run"]');
		return {
			values: [...document.querySelectorAll(
				"#automation-panel-runner .automation-summary dd"
			)].map((item) => item.textContent?.trim() || ""),
			definitionIDs: (definition.requests || []).map(
				(request) => request.id
			),
			definitionName: definition.name || "",
			variablesEmpty: Object.keys(call?.input?.variables || {}).length === 0,
			focused: document.activeElement === run
		};
	})()`, &state)); err != nil {
		return err
	}
	if len(state.Values) != 4 ||
		state.Values[0] != "2" ||
		state.Values[1] != "1" ||
		state.Values[2] != "1" ||
		state.Values[3] != "64 ms" ||
		len(state.DefinitionIDs) != 2 ||
		state.DefinitionIDs[0] != "saved-health" ||
		state.DefinitionIDs[1] != "saved-orders" ||
		state.DefinitionName != "Ordered E2E collection" ||
		!state.VariablesEmpty ||
		!state.Focused {
		return fmt.Errorf("saved collection totals/payload are incorrect: %+v", state)
	}
	return nil
}
