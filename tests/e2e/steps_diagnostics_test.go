package e2e

import (
	"encoding/base64"
	stdjson "encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/cucumber/godog"
)

const (
	diagnosticsEditedActuatorURL = "http://edited.example.test/actuator"
	diagnosticsPerformanceURL    = "https://performance.example.test/health"
	diagnosticsStaleHealthMarker = "STALE_HEALTH_SHOULD_NOT_RENDER"
	diagnosticsStaleMetricMarker = "stale.metric.should.not.render"
)

func registerDiagnosticsSteps(
	context *godog.ScenarioContext,
	world *browserWorld,
) {
	context.Step(
		`^I open the "([^"]+)" diagnostics mode$`,
		world.diagnosticsOpenMode,
	)
	context.Step(
		`^I provide the "([^"]+)" diagnostics fixture$`,
		world.diagnosticsProvideFixture,
	)
	context.Step(
		`^I run the "([^"]+)" diagnostics operation$`,
		world.diagnosticsRunOperation,
	)
	context.Step(
		`^the diagnostics result shows the "([^"]+)" summary$`,
		world.diagnosticsResultShowsSummary,
	)
	context.Step(
		`^a successful diagnostics status is announced$`,
		world.diagnosticsSuccessIsAnnounced,
	)
	context.Step(
		`^the diagnostics workspace has no uncaught frontend error$`,
		world.diagnosticsHasNoFrontendError,
	)
	context.Step(
		`^I am in the "Runtime" diagnostics mode$`,
		func() error { return world.diagnosticsOpenMode("Runtime") },
	)
	context.Step(
		`^the bridge has two deterministic Actuator snapshots$`,
		world.diagnosticsConfigureActuatorSnapshots,
	)
	context.Step(
		`^I capture a runtime baseline$`,
		world.diagnosticsCaptureRuntimeBaseline,
	)
	context.Step(
		`^the baseline is retained and its successful capture is announced$`,
		world.diagnosticsBaselineIsRetained,
	)
	context.Step(
		`^I capture the next runtime snapshot$`,
		world.diagnosticsCaptureNextRuntimeSnapshot,
	)
	context.Step(
		`^metric deltas are shown relative to the retained baseline$`,
		world.diagnosticsMetricDeltasAreShown,
	)
	context.Step(
		`^I clear the runtime baseline$`,
		world.diagnosticsClearRuntimeBaseline,
	)
	context.Step(
		`^the next capture is presented as a standalone snapshot$`,
		world.diagnosticsCaptureStandaloneSnapshot,
	)
	context.Step(
		`^a diagnostics bridge operation is still in progress$`,
		world.diagnosticsStartDeferredOperation,
	)
	context.Step(
		`^I change an input that belongs to the pending operation$`,
		world.diagnosticsChangePendingInput,
	)
	context.Step(
		`^the previous bridge operation completes$`,
		world.diagnosticsResolveDeferredOperation,
	)
	context.Step(
		`^its stale result is not rendered$`,
		world.diagnosticsStaleResultIsNotRendered,
	)
	context.Step(
		`^the operation is reported as stale$`,
		world.diagnosticsOperationIsReportedStale,
	)
	context.Step(
		`^the edited input value and focus are preserved$`,
		world.diagnosticsEditedInputAndFocusArePreserved,
	)
	context.Step(
		`^I switch Diagnostics to the opposite locale while it is busy$`,
		world.diagnosticsSwitchLocaleWhileBusy,
	)
	context.Step(
		`^Diagnostics is idle and reports the stale operation in the new locale$`,
		world.diagnosticsLocaleChangeIsReportedStale,
	)
	context.Step(
		`^Diagnostics stays idle after the stale bridge completion$`,
		world.diagnosticsRemainsIdleAfterStaleCompletion,
	)
	context.Step(
		`^Diagnostics uses the "([^"]+)" locale$`,
		world.diagnosticsUseLocale,
	)
	context.Step(
		`^a URL performance sample is still in progress$`,
		world.diagnosticsStartDeferredPerformanceSample,
	)
	context.Step(
		`^the backend rejects the first performance Stop command$`,
		world.diagnosticsRejectFirstPerformanceStop,
	)
	context.Step(
		`^I stop the URL performance test$`,
		world.diagnosticsStopPerformanceTest,
	)
	context.Step(
		`^the URL performance test stays busy with a localized actionable Stop error$`,
		world.diagnosticsPerformanceStopErrorIsActionable,
	)
	context.Step(
		`^Stop can be retried for the same active URL performance operation$`,
		world.diagnosticsPerformanceStopCanBeRetried,
	)
	context.Step(
		`^I retry stopping the URL performance test$`,
		world.diagnosticsRetryPerformanceStop,
	)
	context.Step(
		`^the URL performance test becomes idle and announces cancellation$`,
		world.diagnosticsPerformanceCancellationIsAnnounced,
	)
	context.Step(
		`^both Stop commands used the active URL performance operation identifier$`,
		world.diagnosticsPerformanceCancelIDsMatch,
	)
}

func diagnosticsQuoted(value string) string {
	encoded, _ := stdjson.Marshal(value)
	return string(encoded)
}

func diagnosticsMode(label string) (mainMode, threadMode string, err error) {
	switch label {
	case "Spring":
		return "spring", "", nil
	case "JWT":
		return "jwt", "", nil
	case "Runtime":
		return "runtime", "", nil
	case "Performance":
		return "performance", "", nil
	case "Environments":
		return "environments", "", nil
	case "Thread":
		return "thread-logs", "thread", nil
	case "Logs":
		return "thread-logs", "logs", nil
	case "Coverage":
		return "coverage", "", nil
	default:
		return "", "", fmt.Errorf("unknown diagnostics mode %q", label)
	}
}

func (w *browserWorld) diagnosticsOpenMode(label string) error {
	mainMode, threadMode, err := diagnosticsMode(label)
	if err != nil {
		return err
	}
	mainSelector := fmt.Sprintf(`[data-diagnostics-mode="%s"]`, mainMode)
	if err := w.run(
		chromedp.WaitVisible(mainSelector, chromedp.ByQuery),
		chromedp.Click(mainSelector, chromedp.ByQuery),
		chromedp.Poll(
			fmt.Sprintf(
				`document.querySelector(%s)?.getAttribute("aria-selected") === "true"`,
				diagnosticsQuoted(mainSelector),
			),
			nil,
			chromedp.WithPollingTimeout(3*time.Second),
		),
	); err != nil {
		return fmt.Errorf("open diagnostics mode %q: %w", label, err)
	}
	if threadMode != "" {
		threadSelector := fmt.Sprintf(
			`[data-diagnostics-thread-mode="%s"]`,
			threadMode,
		)
		if err := w.run(
			chromedp.WaitVisible(threadSelector, chromedp.ByQuery),
			chromedp.Click(threadSelector, chromedp.ByQuery),
			chromedp.Poll(
				fmt.Sprintf(
					`document.querySelector(%s)?.getAttribute("aria-selected") === "true"`,
					diagnosticsQuoted(threadSelector),
				),
				nil,
				chromedp.WithPollingTimeout(3*time.Second),
			),
		); err != nil {
			return fmt.Errorf(
				"open diagnostics %q submode: %w",
				threadMode,
				err,
			)
		}
	}
	return w.diagnosticsAssertActiveMode(mainMode, threadMode)
}

func (w *browserWorld) diagnosticsAssertActiveMode(
	mainMode string,
	threadMode string,
) error {
	var state struct {
		MainSelected   string `json:"mainSelected"`
		MainTabIndex   int    `json:"mainTabIndex"`
		PanelVisible   bool   `json:"panelVisible"`
		ThreadSelected string `json:"threadSelected"`
		ThreadVisible  bool   `json:"threadVisible"`
	}
	expression := fmt.Sprintf(`(() => {
		const main = document.querySelector('[data-diagnostics-mode=%s]');
		const panel = main &&
			document.getElementById(main.getAttribute("aria-controls"));
		const sub = %s
			? document.querySelector('[data-diagnostics-thread-mode=%s]')
			: null;
		const subPanel = sub &&
			document.getElementById(sub.getAttribute("aria-controls"));
		return {
			mainSelected: main?.getAttribute("aria-selected") || "",
			mainTabIndex: main?.tabIndex ?? -99,
			panelVisible: Boolean(panel && !panel.hidden),
			threadSelected: sub?.getAttribute("aria-selected") || "",
			threadVisible: sub ? Boolean(subPanel && !subPanel.hidden) : true
		};
	})()`,
		diagnosticsQuoted(mainMode),
		diagnosticsQuoted(threadMode),
		diagnosticsQuoted(threadMode),
	)
	if err := w.run(chromedp.Evaluate(expression, &state)); err != nil {
		return err
	}
	if state.MainSelected != "true" ||
		state.MainTabIndex != 0 ||
		!state.PanelVisible {
		return fmt.Errorf(
			"diagnostics mode %q is not active: selected=%q tabindex=%d visible=%t",
			mainMode,
			state.MainSelected,
			state.MainTabIndex,
			state.PanelVisible,
		)
	}
	if threadMode != "" &&
		(state.ThreadSelected != "true" || !state.ThreadVisible) {
		return fmt.Errorf(
			"diagnostics submode %q is not active: selected=%q visible=%t",
			threadMode,
			state.ThreadSelected,
			state.ThreadVisible,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsSetControl(
	selector string,
	value string,
) error {
	var updated bool
	expression := fmt.Sprintf(`(() => {
		const element = document.querySelector(%s);
		if (!(
			element instanceof HTMLInputElement ||
			element instanceof HTMLTextAreaElement ||
			element instanceof HTMLSelectElement
		)) return false;
			element.focus();
			element.value = %s;
			if (
				element instanceof HTMLTextAreaElement ||
				(
					element instanceof HTMLInputElement &&
					["text", "search", "url", "tel", "password"].includes(element.type)
				)
			) {
				element.setSelectionRange(element.value.length, element.value.length);
			}
		element.dispatchEvent(new InputEvent("input", {
			bubbles: true,
			inputType: "insertText",
			data: null
		}));
		return true;
	})()`, diagnosticsQuoted(selector), diagnosticsQuoted(value))
	if err := w.run(
		chromedp.WaitVisible(selector, chromedp.ByQuery),
		chromedp.Evaluate(expression, &updated),
		chromedp.Poll(
			fmt.Sprintf(
				`document.querySelector(%s)?.value === %s`,
				diagnosticsQuoted(selector),
				diagnosticsQuoted(value),
			),
			nil,
			chromedp.WithPollingTimeout(3*time.Second),
		),
	); err != nil {
		return err
	}
	if !updated {
		return fmt.Errorf("diagnostics control %s could not be updated", selector)
	}
	return nil
}

func (w *browserWorld) diagnosticsConfigure(config any) error {
	encoded, err := stdjson.Marshal(config)
	if err != nil {
		return fmt.Errorf("encode diagnostics bridge fixture: %w", err)
	}
	return w.run(chromedp.Evaluate(
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.configure(%s)`,
			string(encoded),
		),
		nil,
	))
}

func diagnosticsSnapshot(
	capturedAt string,
	memory float64,
	deltas []map[string]any,
) map[string]any {
	return map[string]any{
		"health": map[string]any{
			"status": "UP",
			"components": map[string]any{
				"db": map[string]any{"status": "UP"},
			},
			"data": map[string]any{
				"status": "UP",
			},
		},
		"mappings": map[string]any{
			"contexts": map[string]any{
				"application": map[string]any{},
			},
			"data": map[string]any{},
		},
		"metrics": map[string]any{
			"capturedAt": capturedAt,
			"metrics": map[string]any{
				"jvm.memory.used": map[string]any{
					"name":        "jvm.memory.used",
					"description": "JVM memory used",
					"baseUnit":    "bytes",
					"measurements": map[string]any{
						"VALUE": memory,
					},
				},
				"process.cpu.usage": map[string]any{
					"name": "process.cpu.usage",
					"measurements": map[string]any{
						"VALUE": 0.25,
					},
				},
			},
		},
		"deltas": deltas,
	}
}

func diagnosticsJWT() string {
	encode := func(value any) string {
		data, _ := stdjson.Marshal(value)
		return base64.RawURLEncoding.EncodeToString(data)
	}
	return strings.Join([]string{
		encode(map[string]any{"alg": "RS256", "typ": "JWT"}),
		encode(map[string]any{
			"sub":   "user-42",
			"iss":   "https://identity.example.test",
			"aud":   []string{"orders-api"},
			"iat":   1_700_000_000,
			"exp":   4_102_444_800,
			"scope": "orders:read orders:write",
			"realm_access": map[string]any{
				"roles": []string{"admin", "operator"},
			},
		}),
		"e2e-signature",
	}, ".")
}

func diagnosticsPerformanceReport(
	durationMs int,
	statusCode int,
) map[string]any {
	return map[string]any{
		"report": map[string]any{
			"inputUrl":        diagnosticsPerformanceURL,
			"dnsLookups":      []map[string]any{},
			"hops":            []map[string]any{},
			"finalUrl":        diagnosticsPerformanceURL,
			"finalStatusCode": statusCode,
			"totalDurationMs": durationMs,
			"usedGetFallback": false,
		},
	}
}

func (w *browserWorld) diagnosticsProvideFixture(name string) error {
	control := func(name string) string {
		return fmt.Sprintf(`[data-diagnostics-control="%s"]`, name)
	}
	switch name {
	case "Spring ProblemDetail response":
		if err := w.diagnosticsSetControl(
			control("spring-body"),
			`{"type":"https://example.test/problems/validation","title":"Validation failed","status":400,"detail":"Email is invalid","instance":"/orders","traceId":"trace-diag-42","exception":"MethodArgumentNotValidException","errors":[{"field":"email","defaultMessage":"must be valid","rejectedValue":"not-an-email"}]}`,
		); err != nil {
			return err
		}
		if err := w.diagnosticsSetControl(
			control("spring-status"),
			"400",
		); err != nil {
			return err
		}
		return w.diagnosticsSetControl(
			control("spring-headers"),
			"Content-Type: application/problem+json\nX-Trace-ID: trace-diag-42",
		)
	case "valid JWT token":
		return w.diagnosticsSetControl(
			control("jwt-input"),
			diagnosticsJWT(),
		)
	case "Actuator endpoint":
		if err := w.diagnosticsConfigure(map[string]any{
			"overrides": map[string]any{
				"InspectActuator": diagnosticsSnapshot(
					"2026-07-29T09:00:00Z",
					1_048_576,
					[]map[string]any{},
				),
			},
		}); err != nil {
			return err
		}
		if err := w.diagnosticsSetControl(
			control("actuator-url"),
			"http://service.example.test/actuator",
		); err != nil {
			return err
		}
		if err := w.diagnosticsSetControl(
			control("metric-names"),
			"jvm.memory.used\nprocess.cpu.usage",
		); err != nil {
			return err
		}
		return w.run(chromedp.Click(
			control("include-mappings"),
			chromedp.ByQuery,
		))
	case "URL performance target":
		if err := w.diagnosticsConfigure(map[string]any{
			"overrides": map[string]any{
				"AnalyzeNetwork": []any{
					diagnosticsPerformanceReport(12, 200),
					diagnosticsPerformanceReport(4, 204),
					diagnosticsPerformanceReport(8, 200),
				},
			},
		}); err != nil {
			return err
		}
		if err := w.diagnosticsSetControl(
			control("performance-url"),
			diagnosticsPerformanceURL,
		); err != nil {
			return err
		}
		return w.diagnosticsSetControl(
			control("performance-samples"),
			"3",
		)
	case "three environment targets":
		targets := []struct {
			index int
			name  string
			url   string
		}{
			{index: 0, name: "Local", url: "https://local.example.test"},
			{index: 1, name: "Test", url: "https://test.example.test"},
			{index: 2, name: "Staging", url: "https://staging.example.test"},
		}
		for _, target := range targets {
			nameSelector := fmt.Sprintf(
				`[data-diagnostics-control="environment-target"][data-target-index="%d"][data-target-field="name"]`,
				target.index,
			)
			if err := w.diagnosticsSetControl(
				nameSelector,
				target.name,
			); err != nil {
				return err
			}
			urlSelector := fmt.Sprintf(
				`[data-diagnostics-control="environment-target"][data-target-index="%d"][data-target-field="baseUrl"]`,
				target.index,
			)
			if err := w.diagnosticsSetControl(
				urlSelector,
				target.url,
			); err != nil {
				return err
			}
		}
		return w.diagnosticsSetControl(
			control("environment-path"),
			"/api/orders/42",
		)
	case "blocked thread dump":
		return w.diagnosticsSetControl(
			control("thread-dump"),
			`"worker-1" #11
   java.lang.Thread.State: RUNNABLE
        at com.example.Worker.run(Worker.java:42)
"worker-2" #12
   java.lang.Thread.State: BLOCKED
        at com.example.Worker.run(Worker.java:42)
"worker-3" #13
   java.lang.Thread.State: BLOCKED
        - waiting to lock <0x00000001>`,
		)
	case "trace-bearing log text":
		if err := w.diagnosticsSetControl(
			control("log-text"),
			"2026-07-29 INFO boot complete\n2026-07-29 INFO traceId=trace-diag-42 order created\n2026-07-29 INFO request complete",
		); err != nil {
			return err
		}
		return w.diagnosticsSetControl(
			control("trace-query"),
			"trace-diag-42",
		)
	case "known and observed endpoints":
		if err := w.diagnosticsSetControl(
			control("known-endpoints"),
			"GET /orders\nPOST /orders",
		); err != nil {
			return err
		}
		return w.diagnosticsSetControl(
			control("observed-calls"),
			"GET /orders [3]",
		)
	default:
		return fmt.Errorf("unknown diagnostics fixture %q", name)
	}
}

func diagnosticsAction(operation string) (string, error) {
	actions := map[string]string{
		"analyze Spring response":     "analyze-spring",
		"decode JWT":                  "analyze-jwt",
		"capture runtime snapshot":    "runtime-snapshot",
		"test URL performance":        "performance-run",
		"compare environments":        "compare-environments",
		"analyze thread dump":         "analyze-threads",
		"search trace logs":           "search-logs",
		"calculate endpoint coverage": "coverage-calculate",
	}
	action, ok := actions[operation]
	if !ok {
		return "", fmt.Errorf("unknown diagnostics operation %q", operation)
	}
	return action, nil
}

func (w *browserWorld) diagnosticsClickAndWait(action string) error {
	selector := fmt.Sprintf(`[data-diagnostics-action="%s"]`, action)
	return w.run(
		chromedp.WaitVisible(selector, chromedp.ByQuery),
		chromedp.Click(selector, chromedp.ByQuery),
		chromedp.Poll(
			`Boolean(
				document.querySelector(
					'[data-diagnostics-slot="notice"] .tool-notice.success[role="status"]'
				)
			) && !document.querySelector(
				'[id^="diagnostics-panel-"][aria-busy="true"]'
			)`,
			nil,
			chromedp.WithPollingTimeout(5*time.Second),
		),
	)
}

func (w *browserWorld) diagnosticsRunOperation(operation string) error {
	action, err := diagnosticsAction(operation)
	if err != nil {
		return err
	}
	if err := w.diagnosticsClickAndWait(action); err != nil {
		return fmt.Errorf("run diagnostics operation %q: %w", operation, err)
	}
	return nil
}

func (w *browserWorld) diagnosticsResultShowsSummary(name string) error {
	checks := map[string]string{
		"HTTP and error advice": `(() => {
			const panel = document.querySelector(
				'[id^="diagnostics-panel-"][aria-busy]'
			);
			const text = panel?.textContent || "";
			return text.includes("HTTP 400") &&
				text.includes("Validation failed") &&
				text.includes("Email is invalid") &&
				text.includes("Checklist") &&
				text.includes("email") &&
				panel.querySelectorAll(".diagnostics-advice li").length >= 2;
		})()`,
		"header payload and claims": `(() => {
			const panel = document.querySelector(
				'[id^="diagnostics-panel-"][aria-busy]'
			);
			const text = panel?.textContent || "";
			return text.includes("Header and payload") &&
				text.includes("user-42") &&
				text.includes("RS256") &&
				text.includes("admin") &&
				text.includes("orders:read") &&
				panel.querySelector("details pre")?.textContent.includes('"alg": "RS256"');
		})()`,
		"components and metrics": `(() => {
			const panel = document.querySelector(
				'[id^="diagnostics-panel-"][aria-busy]'
			);
			const text = panel?.textContent || "";
			return text.includes("UP") &&
				text.includes("db") &&
				text.includes("jvm.memory.used") &&
				text.includes("process.cpu.usage") &&
				text.includes("Health components") &&
				text.includes("Metric snapshot") &&
				panel.querySelectorAll(".diagnostics-table").length >= 2;
		})()`,
		"URL timing samples": fmt.Sprintf(`(() => {
			const panel = document.querySelector(
				"#diagnostics-panel-performance[aria-busy]"
			);
			const cards = [...(panel?.querySelectorAll(
				".diagnostics-performance-cards > article"
			) ?? [])];
			const cardText = cards.map((card) =>
				(card.textContent || "").replace(/\s+/g, " ").trim()
			);
			const rows = [...(panel?.querySelectorAll(
				".diagnostics-table tbody tr"
			) ?? [])];
			const rowValues = rows.map((row) =>
				[...row.cells].map((cell) => cell.textContent?.trim() || "")
			);
			const calls = globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "AnalyzeNetwork"
			);
			const operationIds = calls.map(
				(call) => call.input?.operationId
			);
			return cards.length === 4 &&
				cardText[0].includes("Fastest") &&
				cardText[0].includes("4 ms") &&
				cardText[1].includes("Average") &&
				cardText[1].includes("8 ms") &&
				cardText[2].includes("Slowest") &&
				cardText[2].includes("12 ms") &&
				cardText[3].includes("Completed samples") &&
				cardText[3].includes("3") &&
				rows.length === 3 &&
				rowValues[0][0] === "1" &&
				rowValues[0][1] === "HTTP 200" &&
				rowValues[0][2] === "12 ms" &&
				rowValues[1][0] === "2" &&
				rowValues[1][1] === "HTTP 204" &&
				rowValues[1][2] === "4 ms" &&
				rowValues[2][0] === "3" &&
				rowValues[2][1] === "HTTP 200" &&
				rowValues[2][2] === "8 ms" &&
				rowValues.every((row) => row[3] === %s) &&
				calls.length === 3 &&
				calls.every((call) => call.input?.url === %s) &&
				operationIds.every((id) =>
					typeof id === "string" && id.length > 0
				) &&
				new Set(operationIds).size === 3;
		})()`,
			diagnosticsQuoted(diagnosticsPerformanceURL),
			diagnosticsQuoted(diagnosticsPerformanceURL),
		),
		"response differences": `(() => {
			const panel = document.querySelector(
				'[id^="diagnostics-panel-"][aria-busy]'
			);
			const text = panel?.textContent || "";
			return panel.querySelectorAll(
					".diagnostics-runtime-cards > article"
				).length === 3 &&
				text.includes("Differences found") &&
				text.includes("$.environment") &&
				text.includes("503") &&
				text.includes("Local") &&
				text.includes("Staging");
		})()`,
		"thread states": `(() => {
			const panel = document.querySelector(
				'[id^="diagnostics-panel-"][aria-busy]'
			);
			const text = panel?.textContent || "";
			return text.includes("3") &&
				text.includes("BLOCKED") &&
				text.includes("worker-2") &&
				text.includes("Repeated stacks") &&
				panel.querySelectorAll(".diagnostics-table tbody tr").length >= 1;
		})()`,
		"matching log lines": `(() => {
			const panel = document.querySelector(
				'[id^="diagnostics-panel-"][aria-busy]'
			);
			const text = panel?.textContent || "";
			return text.includes("1 matches") &&
				text.includes("3 lines scanned") &&
				text.includes("trace-diag-42") &&
				panel.querySelectorAll(".diagnostics-log-results > div").length === 1;
		})()`,
		"coverage totals": `(() => {
			const panel = document.querySelector(
				'[id^="diagnostics-panel-"][aria-busy]'
			);
			const progress = panel?.querySelector('[role="progressbar"]');
			const text = panel?.textContent || "";
			return progress?.getAttribute("aria-valuenow") === "50" &&
				text.includes("1 / 2 endpoints called") &&
				text.includes("GET") &&
				text.includes("POST") &&
				text.includes("/orders") &&
				panel.querySelectorAll(".diagnostics-table tbody tr").length === 2;
		})()`,
	}
	expression, ok := checks[name]
	if !ok {
		return fmt.Errorf("unknown diagnostics result summary %q", name)
	}
	var matches bool
	if err := w.run(chromedp.Evaluate(expression, &matches)); err != nil {
		return err
	}
	if !matches {
		return fmt.Errorf(
			"diagnostics result does not show %q summary",
			name,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsSuccessIsAnnounced() error {
	var state struct {
		Text string `json:"text"`
		Role string `json:"role"`
		Live string `json:"live"`
		Tone bool   `json:"tone"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const status = document.querySelector(
			'[data-diagnostics-slot="notice"] .tool-notice.success'
		);
		return {
			text: status?.textContent?.trim() || "",
			role: status?.getAttribute("role") || "",
			live: status?.getAttribute("aria-live") || "",
			tone: status?.classList.contains("success") || false
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.Text == "" || state.Role != "status" ||
		state.Live != "polite" || !state.Tone {
		return fmt.Errorf(
			"diagnostics success announcement is incomplete: text=%q role=%q live=%q tone=%t",
			state.Text,
			state.Role,
			state.Live,
			state.Tone,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsHasNoFrontendError() error {
	if frontendErrors := w.errors(); len(frontendErrors) > 0 {
		return fmt.Errorf(
			"diagnostics produced frontend errors:\n%s",
			strings.Join(frontendErrors, "\n"),
		)
	}
	var errorNotice bool
	if err := w.run(chromedp.Evaluate(
		`Boolean(document.querySelector('.diagnostics-lab [role="alert"]'))`,
		&errorNotice,
	)); err != nil {
		return err
	}
	if errorNotice {
		return fmt.Errorf("diagnostics rendered an unexpected error alert")
	}
	return nil
}

func (w *browserWorld) diagnosticsConfigureActuatorSnapshots() error {
	baseline := diagnosticsSnapshot(
		"2026-07-29T09:00:00Z",
		100,
		[]map[string]any{},
	)
	delta := diagnosticsSnapshot(
		"2026-07-29T09:05:00Z",
		145,
		[]map[string]any{
			{
				"metric":        "jvm.memory.used",
				"statistic":     "VALUE",
				"before":        100,
				"after":         145,
				"delta":         45,
				"percentChange": 45,
			},
		},
	)
	// The third response repeats the later deterministic snapshot without a
	// comparison. It proves that clearing the baseline removes `before` from
	// the next bridge request instead of merely hiding the previous delta.
	standalone := diagnosticsSnapshot(
		"2026-07-29T09:05:00Z",
		145,
		[]map[string]any{},
	)
	return w.diagnosticsConfigure(map[string]any{
		"overrides": map[string]any{
			"InspectActuator": []any{baseline, delta, standalone},
		},
	})
}

func (w *browserWorld) diagnosticsCaptureRuntimeBaseline() error {
	return w.diagnosticsClickAndWait("runtime-baseline")
}

func (w *browserWorld) diagnosticsBaselineIsRetained() error {
	var state struct {
		Notice       string `json:"notice"`
		ClearVisible bool   `json:"clearVisible"`
		BaselineText string `json:"baselineText"`
		SentBefore   bool   `json:"sentBefore"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const cards = [...document.querySelectorAll(
			".diagnostics-runtime-cards > article"
		)];
		const baseline = cards.find((card) =>
			card.textContent?.includes("BASELINE")
		);
		const calls = globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "InspectActuator"
		);
		const last = calls.at(-1);
		return {
			notice:
				document.querySelector(
					'[data-diagnostics-slot="notice"] [role="status"]'
				)?.textContent?.trim() || "",
			clearVisible: Boolean(
				document.querySelector(
					'[data-diagnostics-action="clear-runtime-baseline"]'
				)
			),
			baselineText: baseline?.textContent?.trim() || "",
			sentBefore: Boolean(last?.input?.before)
		};
	})()`, &state)); err != nil {
		return err
	}
	if !strings.Contains(state.Notice, "Metric baseline captured") ||
		!state.ClearVisible ||
		!strings.Contains(state.BaselineText, "0 deltas") ||
		state.SentBefore {
		return fmt.Errorf(
			"runtime baseline was not retained correctly: notice=%q clear=%t card=%q sentBefore=%t",
			state.Notice,
			state.ClearVisible,
			state.BaselineText,
			state.SentBefore,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsCaptureNextRuntimeSnapshot() error {
	return w.diagnosticsClickAndWait("runtime-snapshot")
}

func (w *browserWorld) diagnosticsMetricDeltasAreShown() error {
	var state struct {
		HasDeltaTable bool `json:"hasDeltaTable"`
		HasValues     bool `json:"hasValues"`
		SentBefore    bool `json:"sentBefore"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const panel = document.querySelector(
			'[id^="diagnostics-panel-"][aria-busy]'
		);
		const text = panel?.textContent || "";
		const calls = globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "InspectActuator"
		);
		const last = calls.at(-1);
		return {
			hasDeltaTable:
				text.includes("Baseline difference") &&
				text.includes("Before") &&
				text.includes("After") &&
				text.includes("Delta"),
			hasValues:
				text.includes("jvm.memory.used") &&
				text.includes("100") &&
				text.includes("145") &&
				text.includes("45%"),
			sentBefore:
				last?.input?.before?.metrics?.["jvm.memory.used"]
					?.measurements?.VALUE === 100
		};
	})()`, &state)); err != nil {
		return err
	}
	if !state.HasDeltaTable || !state.HasValues || !state.SentBefore {
		return fmt.Errorf(
			"runtime delta is incomplete: table=%t values=%t sentBefore=%t",
			state.HasDeltaTable,
			state.HasValues,
			state.SentBefore,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsClearRuntimeBaseline() error {
	if err := w.run(
		chromedp.Click(
			`[data-diagnostics-action="clear-runtime-baseline"]`,
			chromedp.ByQuery,
		),
		chromedp.Poll(
			`document.querySelector(
				'[data-diagnostics-action="runtime-snapshot"]'
			)?.textContent?.includes("Capture snapshot")`,
			nil,
			chromedp.WithPollingTimeout(3*time.Second),
		),
	); err != nil {
		return err
	}
	var notice string
	if err := w.run(chromedp.Text(
		`[data-diagnostics-slot="notice"] [role="status"]`,
		&notice,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	if !strings.Contains(notice, "Runtime baseline cleared") {
		return fmt.Errorf("baseline-clear status = %q", notice)
	}
	return nil
}

func (w *browserWorld) diagnosticsCaptureStandaloneSnapshot() error {
	if err := w.diagnosticsClickAndWait("runtime-snapshot"); err != nil {
		return err
	}
	var state struct {
		Notice         string `json:"notice"`
		BaselineText   string `json:"baselineText"`
		HasDelta       bool   `json:"hasDelta"`
		SentBefore     bool   `json:"sentBefore"`
		SnapshotMetric bool   `json:"snapshotMetric"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const panel = document.querySelector(
			'[id^="diagnostics-panel-"][aria-busy]'
		);
		const cards = [...document.querySelectorAll(
			".diagnostics-runtime-cards > article"
		)];
		const baseline = cards.find((card) =>
			card.textContent?.includes("BASELINE")
		);
		const calls = globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "InspectActuator"
		);
		const last = calls.at(-1);
		return {
			notice:
				document.querySelector(
					'[data-diagnostics-slot="notice"] [role="status"]'
				)?.textContent?.trim() || "",
			baselineText: baseline?.textContent?.trim() || "",
			hasDelta: (panel?.textContent || "").includes("Baseline difference"),
			sentBefore: Boolean(last?.input?.before),
			snapshotMetric:
				(panel?.textContent || "").includes("jvm.memory.used")
		};
	})()`, &state)); err != nil {
		return err
	}
	if !strings.Contains(state.Notice, "Runtime snapshot captured") ||
		!strings.Contains(state.BaselineText, "None") ||
		state.HasDelta ||
		state.SentBefore ||
		!state.SnapshotMetric {
		return fmt.Errorf(
			"standalone runtime capture is incorrect: notice=%q baseline=%q delta=%t sentBefore=%t metric=%t",
			state.Notice,
			state.BaselineText,
			state.HasDelta,
			state.SentBefore,
			state.SnapshotMetric,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsStartDeferredOperation() error {
	if err := w.diagnosticsOpenMode("Runtime"); err != nil {
		return err
	}
	if err := w.diagnosticsSetControl(
		`[data-diagnostics-control="actuator-url"]`,
		"http://pending.example.test/actuator",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.defer("InspectActuator")`,
		nil,
	)); err != nil {
		return err
	}
	if err := w.run(
		chromedp.Click(
			`[data-diagnostics-action="runtime-snapshot"]`,
			chromedp.ByQuery,
		),
		chromedp.Poll(
			`document.querySelector(
				'#diagnostics-panel-runtime'
			)?.getAttribute("aria-busy") === "true" &&
			globalThis.__VALIDEX_E2E__.calls.some(
				(call) => call.method === "InspectActuator"
			)`,
			nil,
			chromedp.WithPollingTimeout(3*time.Second),
		),
	); err != nil {
		return fmt.Errorf("start deferred diagnostics operation: %w", err)
	}
	return nil
}

func (w *browserWorld) diagnosticsChangePendingInput() error {
	selector := `[data-diagnostics-control="actuator-url"]`
	if err := w.diagnosticsSetControl(
		selector,
		diagnosticsEditedActuatorURL,
	); err != nil {
		return err
	}
	return w.run(chromedp.Poll(
		fmt.Sprintf(
			`document.activeElement === document.querySelector(%s) &&
			document.querySelector(%s)?.value === %s &&
			document.querySelector(
				'#diagnostics-panel-runtime'
			)?.getAttribute("aria-busy") === "false"`,
			diagnosticsQuoted(selector),
			diagnosticsQuoted(selector),
			diagnosticsQuoted(diagnosticsEditedActuatorURL),
		),
		nil,
		chromedp.WithPollingTimeout(3*time.Second),
	))
}

func (w *browserWorld) diagnosticsSwitchLocaleWhileBusy() error {
	var busy bool
	if err := w.run(chromedp.Evaluate(
		`document.querySelector(
			"#diagnostics-panel-runtime"
		)?.getAttribute("aria-busy") === "true"`,
		&busy,
	)); err != nil {
		return err
	}
	if !busy {
		return fmt.Errorf("diagnostics was not busy before switching locale")
	}

	if err := w.run(
		chromedp.Click(`[data-action="settings"]`, chromedp.ByQuery),
		chromedp.WaitVisible(`[role="menu"]`, chromedp.ByQuery),
	); err != nil {
		return fmt.Errorf("open settings while diagnostics is busy: %w", err)
	}

	var targetLocale string
	if err := w.run(chromedp.Evaluate(`(() => {
		const current = document.documentElement.lang;
		const target = current === "tr" ? "en" : "tr";
		const label = target === "tr" ? "Türkçe" : "English";
		const item = [...document.querySelectorAll(
			'[role="menuitem"]:not(:disabled)'
		)].find((candidate) => candidate.textContent?.trim() === label);
		if (!(item instanceof HTMLButtonElement)) return "";
		item.click();
		return target;
	})()`, &targetLocale)); err != nil {
		return err
	}
	if targetLocale == "" {
		return fmt.Errorf("opposite diagnostics locale action was not available")
	}

	return w.run(chromedp.Poll(
		fmt.Sprintf(
			`document.documentElement.lang === %s &&
			document.querySelector(
				"#diagnostics-panel-runtime"
			)?.getAttribute("aria-busy") === "false"`,
			diagnosticsQuoted(targetLocale),
		),
		nil,
		chromedp.WithPollingInterval(25*time.Millisecond),
		chromedp.WithPollingTimeout(3*time.Second),
	))
}

func diagnosticsStaleNotice(locale string) (string, error) {
	switch locale {
	case "en":
		return "The input or tool changed; the previous operation result was ignored.", nil
	case "tr":
		return "Girdi veya araç değişti; önceki işlemin sonucu yok sayıldı.", nil
	default:
		return "", fmt.Errorf("unsupported diagnostics locale %q", locale)
	}
}

func (w *browserWorld) diagnosticsLocaleChangeIsReportedStale() error {
	var state struct {
		Locale      string `json:"locale"`
		Busy        string `json:"busy"`
		Text        string `json:"text"`
		Role        string `json:"role"`
		Live        string `json:"live"`
		Info        bool   `json:"info"`
		HasProgress bool   `json:"hasProgress"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const notice = document.querySelector(
			'[data-diagnostics-slot="notice"] .tool-notice.info'
		);
		return {
			locale: document.documentElement.lang,
			busy: document.querySelector("#diagnostics-panel-runtime")
				?.getAttribute("aria-busy") || "",
			text: notice?.textContent?.trim() || "",
			role: notice?.getAttribute("role") || "",
			live: notice?.getAttribute("aria-live") || "",
			info: notice?.classList.contains("info") || false,
			hasProgress: Boolean(document.querySelector(".diagnostics-progress"))
		};
	})()`, &state)); err != nil {
		return err
	}
	expected, err := diagnosticsStaleNotice(state.Locale)
	if err != nil {
		return err
	}
	if state.Busy != "false" || state.Text != expected ||
		state.Role != "status" || state.Live != "polite" ||
		!state.Info || state.HasProgress {
		return fmt.Errorf(
			"localized stale diagnostics state is incomplete: locale=%q busy=%q text=%q role=%q live=%q info=%t progress=%t",
			state.Locale,
			state.Busy,
			state.Text,
			state.Role,
			state.Live,
			state.Info,
			state.HasProgress,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsResolveDeferredOperation() error {
	staleResult := diagnosticsSnapshot(
		"2026-07-29T10:00:00Z",
		999_999,
		[]map[string]any{},
	)
	staleResult["health"] = map[string]any{
		"status":     diagnosticsStaleHealthMarker,
		"components": map[string]any{},
		"data":       map[string]any{},
	}
	staleResult["metrics"] = map[string]any{
		"capturedAt": "2026-07-29T10:00:00Z",
		"metrics": map[string]any{
			diagnosticsStaleMetricMarker: map[string]any{
				"name":        diagnosticsStaleMetricMarker,
				"description": "Stale metric that must not render",
				"baseUnit":    "widgets",
				"measurements": map[string]any{
					"VALUE": 999_999,
				},
			},
		},
	}
	encoded, err := stdjson.Marshal(staleResult)
	if err != nil {
		return err
	}
	var resolved bool
	if err := w.run(
		chromedp.Evaluate(
			fmt.Sprintf(
				`(() => {
					globalThis.__VALIDEX_E2E_DIAGNOSTICS_STALE_SETTLED__ = false;
					const resolved = globalThis.__VALIDEX_E2E__.resolve(
						"InspectActuator",
						%s
					);
					if (resolved) {
						requestAnimationFrame(() => {
							requestAnimationFrame(() => {
								globalThis.__VALIDEX_E2E_DIAGNOSTICS_STALE_SETTLED__ = true;
							});
						});
					}
					return resolved;
				})()`,
				string(encoded),
			),
			&resolved,
		),
		chromedp.Poll(
			`globalThis.__VALIDEX_E2E_DIAGNOSTICS_STALE_SETTLED__ === true &&
			document.querySelector(
				'#diagnostics-panel-runtime'
			)?.getAttribute("aria-busy") === "false" &&
			Boolean(document.querySelector(
				'[data-diagnostics-slot="notice"] .tool-notice.info[role="status"]'
			))`,
			nil,
			chromedp.WithPollingInterval(25*time.Millisecond),
			chromedp.WithPollingTimeout(3*time.Second),
		),
	); err != nil {
		return err
	}
	if !resolved {
		return fmt.Errorf("deferred InspectActuator call was not pending")
	}
	return nil
}

func (w *browserWorld) diagnosticsStaleResultIsNotRendered() error {
	var state struct {
		HasStaleHealth bool `json:"hasStaleHealth"`
		HasStaleMetric bool `json:"hasStaleMetric"`
		HasEmptyState  bool `json:"hasEmptyState"`
	}
	if err := w.run(chromedp.Evaluate(fmt.Sprintf(`(() => {
		const panel = document.querySelector("#diagnostics-panel-runtime");
		const text = panel?.textContent || "";
		return {
			hasStaleHealth: text.includes(%s),
			hasStaleMetric: text.includes(%s),
			hasEmptyState: Boolean(panel?.querySelector(".tool-empty-result"))
		};
	})()`,
		diagnosticsQuoted(diagnosticsStaleHealthMarker),
		diagnosticsQuoted(diagnosticsStaleMetricMarker),
	), &state)); err != nil {
		return err
	}
	if state.HasStaleHealth || state.HasStaleMetric || !state.HasEmptyState {
		return fmt.Errorf(
			"stale diagnostics result leaked into UI: health=%t metric=%t empty=%t",
			state.HasStaleHealth,
			state.HasStaleMetric,
			state.HasEmptyState,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsOperationIsReportedStale() error {
	var state struct {
		Text string `json:"text"`
		Role string `json:"role"`
		Live string `json:"live"`
		Info bool   `json:"info"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const notice = document.querySelector(
			'[data-diagnostics-slot="notice"] .tool-notice.info'
		);
		return {
			text: notice?.textContent?.trim() || "",
			role: notice?.getAttribute("role") || "",
			live: notice?.getAttribute("aria-live") || "",
			info: notice?.classList.contains("info") || false
		};
	})()`, &state)); err != nil {
		return err
	}
	if !strings.Contains(
		state.Text,
		"previous operation result was ignored",
	) || state.Role != "status" || state.Live != "polite" || !state.Info {
		return fmt.Errorf(
			"stale diagnostics status is incomplete: text=%q role=%q live=%q info=%t",
			state.Text,
			state.Role,
			state.Live,
			state.Info,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsEditedInputAndFocusArePreserved() error {
	var state struct {
		Value          string `json:"value"`
		Focused        bool   `json:"focused"`
		SelectionStart int    `json:"selectionStart"`
		SelectionEnd   int    `json:"selectionEnd"`
		Busy           string `json:"busy"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const input = document.querySelector(
			'[data-diagnostics-control="actuator-url"]'
		);
		return {
			value: input?.value || "",
			focused: document.activeElement === input,
			selectionStart: input?.selectionStart ?? -1,
			selectionEnd: input?.selectionEnd ?? -1,
			busy:
				document.querySelector("#diagnostics-panel-runtime")
					?.getAttribute("aria-busy") || ""
		};
	})()`, &state)); err != nil {
		return err
	}
	wantSelection := len(diagnosticsEditedActuatorURL)
	if state.Value != diagnosticsEditedActuatorURL ||
		!state.Focused ||
		state.SelectionStart != wantSelection ||
		state.SelectionEnd != wantSelection ||
		state.Busy != "false" {
		return fmt.Errorf(
			"edited diagnostics input was not preserved: value=%q focus=%t selection=%d:%d busy=%q",
			state.Value,
			state.Focused,
			state.SelectionStart,
			state.SelectionEnd,
			state.Busy,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsRemainsIdleAfterStaleCompletion() error {
	var state struct {
		Busy            string `json:"busy"`
		HasProgress     bool   `json:"hasProgress"`
		SnapshotEnabled bool   `json:"snapshotEnabled"`
		PendingCalls    int    `json:"pendingCalls"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const action = document.querySelector(
			'[data-diagnostics-action="runtime-snapshot"]'
		);
		return {
			busy: document.querySelector("#diagnostics-panel-runtime")
				?.getAttribute("aria-busy") || "",
			hasProgress: Boolean(document.querySelector(".diagnostics-progress")),
			snapshotEnabled: action instanceof HTMLButtonElement && !action.disabled,
			pendingCalls: globalThis.__VALIDEX_E2E__.pendingCount("InspectActuator")
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.Busy != "false" || state.HasProgress ||
		!state.SnapshotEnabled || state.PendingCalls != 0 {
		return fmt.Errorf(
			"diagnostics returned to a busy state after stale completion: busy=%q progress=%t snapshotEnabled=%t pending=%d",
			state.Busy,
			state.HasProgress,
			state.SnapshotEnabled,
			state.PendingCalls,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsUseLocale(label string) error {
	targetLocale := ""
	switch label {
	case "English":
		targetLocale = "en"
	case "Türkçe":
		targetLocale = "tr"
	default:
		return fmt.Errorf("unsupported diagnostics locale label %q", label)
	}

	var currentLocale string
	if err := w.run(chromedp.Evaluate(
		`document.documentElement.lang`,
		&currentLocale,
	)); err != nil {
		return err
	}
	if currentLocale == targetLocale {
		return nil
	}

	if err := w.run(
		chromedp.Click(`[data-action="settings"]`, chromedp.ByQuery),
		chromedp.WaitVisible(`[role="menu"]`, chromedp.ByQuery),
	); err != nil {
		return fmt.Errorf("open settings to select %q: %w", label, err)
	}

	var selected bool
	if err := w.run(
		chromedp.Evaluate(fmt.Sprintf(`(() => {
			const item = [...document.querySelectorAll(
				'[role="menuitem"]:not(:disabled)'
			)].find((candidate) => candidate.textContent?.trim() === %s);
			if (!(item instanceof HTMLButtonElement)) return false;
			item.click();
			return true;
		})()`, diagnosticsQuoted(label)), &selected),
		chromedp.Poll(
			fmt.Sprintf(
				`document.documentElement.lang === %s`,
				diagnosticsQuoted(targetLocale),
			),
			nil,
			chromedp.WithPollingInterval(25*time.Millisecond),
			chromedp.WithPollingTimeout(3*time.Second),
		),
	); err != nil {
		return fmt.Errorf("select diagnostics locale %q: %w", label, err)
	}
	if !selected {
		return fmt.Errorf("diagnostics locale action %q was not available", label)
	}
	return nil
}

func (w *browserWorld) diagnosticsStartDeferredPerformanceSample() error {
	if err := w.diagnosticsOpenMode("Performance"); err != nil {
		return err
	}
	if err := w.diagnosticsSetControl(
		`[data-diagnostics-control="performance-url"]`,
		diagnosticsPerformanceURL,
	); err != nil {
		return err
	}
	if err := w.diagnosticsSetControl(
		`[data-diagnostics-control="performance-samples"]`,
		"3",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.defer("AnalyzeNetwork")`,
		nil,
	)); err != nil {
		return err
	}
	if err := w.run(
		chromedp.Click(
			`[data-diagnostics-action="performance-run"]`,
			chromedp.ByQuery,
		),
		chromedp.Poll(
			`document.querySelector(
				"#diagnostics-panel-performance"
			)?.getAttribute("aria-busy") === "true" &&
			globalThis.__VALIDEX_E2E__.pendingCount("AnalyzeNetwork") === 1 &&
			Boolean(document.querySelector(
				'[data-diagnostics-action="performance-stop"]:not(:disabled)'
			))`,
			nil,
			chromedp.WithPollingInterval(25*time.Millisecond),
			chromedp.WithPollingTimeout(3*time.Second),
		),
	); err != nil {
		return fmt.Errorf("start deferred URL performance sample: %w", err)
	}
	return nil
}

func (w *browserWorld) diagnosticsRejectFirstPerformanceStop() error {
	return w.diagnosticsConfigure(map[string]any{
		"overrides": map[string]any{
			"CancelToolOperation": []any{false, true},
		},
	})
}

func (w *browserWorld) diagnosticsStopPerformanceTest() error {
	var cancelCallsBefore int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "CancelToolOperation"
		).length`,
		&cancelCallsBefore,
	)); err != nil {
		return err
	}
	if err := w.run(
		chromedp.Click(
			`[data-diagnostics-action="performance-stop"]`,
			chromedp.ByQuery,
		),
		chromedp.Poll(
			fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "CancelToolOperation"
			).length > %d`, cancelCallsBefore),
			nil,
			chromedp.WithPollingInterval(25*time.Millisecond),
			chromedp.WithPollingTimeout(3*time.Second),
		),
	); err != nil {
		return fmt.Errorf("stop URL performance test: %w", err)
	}
	return nil
}

func diagnosticsPerformanceStopMessages(
	locale string,
) (title string, message string, hint string, err error) {
	switch locale {
	case "en":
		return "URL test could not be stopped",
			"The backend did not accept the stop command for the active sample.",
			"Retry Stop; the bounded sample remains active until it finishes or reaches its timeout.",
			nil
	case "tr":
		return "URL testi durdurulamadı",
			"Backend, etkin örnek için durdurma komutunu kabul etmedi.",
			"Durdur’u yeniden deneyin; sınırlı örnek tamamlanana veya zaman aşımına ulaşana kadar etkin kalır.",
			nil
	default:
		return "", "", "", fmt.Errorf(
			"unsupported diagnostics locale %q",
			locale,
		)
	}
}

func (w *browserWorld) diagnosticsPerformanceStopErrorIsActionable() error {
	if err := w.run(chromedp.Poll(
		`document.querySelector(
			"#diagnostics-panel-performance"
		)?.getAttribute("aria-busy") === "true" &&
		Boolean(document.querySelector(
			'[data-diagnostics-slot="notice"] .tool-notice.error[role="alert"]'
		)) &&
		Boolean(document.querySelector(
			'[data-diagnostics-action="performance-stop"]:not(:disabled)'
		))`,
		nil,
		chromedp.WithPollingInterval(25*time.Millisecond),
		chromedp.WithPollingTimeout(3*time.Second),
	)); err != nil {
		return fmt.Errorf("wait for rejected performance Stop state: %w", err)
	}

	var state struct {
		Locale      string `json:"locale"`
		Busy        string `json:"busy"`
		Title       string `json:"title"`
		Message     string `json:"message"`
		Hint        string `json:"hint"`
		Role        string `json:"role"`
		Live        string `json:"live"`
		StopEnabled bool   `json:"stopEnabled"`
		HasProgress bool   `json:"hasProgress"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const notice = document.querySelector(
			'[data-diagnostics-slot="notice"] .tool-notice.error'
		);
		const stop = document.querySelector(
			'[data-diagnostics-action="performance-stop"]'
		);
		return {
			locale: document.documentElement.lang,
			busy: document.querySelector("#diagnostics-panel-performance")
				?.getAttribute("aria-busy") || "",
			title: notice?.querySelector("strong")?.textContent?.trim() || "",
			message: notice?.querySelector("span")?.textContent?.trim() || "",
			hint: notice?.querySelector("small")?.textContent?.trim() || "",
			role: notice?.getAttribute("role") || "",
			live: notice?.getAttribute("aria-live") || "",
			stopEnabled: stop instanceof HTMLButtonElement && !stop.disabled,
			hasProgress: Boolean(document.querySelector(".diagnostics-progress"))
		};
	})()`, &state)); err != nil {
		return err
	}
	expectedTitle, expectedMessage, expectedHint, err :=
		diagnosticsPerformanceStopMessages(state.Locale)
	if err != nil {
		return err
	}
	if state.Busy != "true" || state.Title != expectedTitle ||
		state.Message != expectedMessage || state.Hint != expectedHint ||
		state.Role != "alert" || state.Live != "assertive" ||
		!state.StopEnabled || !state.HasProgress {
		return fmt.Errorf(
			"rejected performance Stop state is incomplete: locale=%q busy=%q title=%q message=%q hint=%q role=%q live=%q stopEnabled=%t progress=%t",
			state.Locale,
			state.Busy,
			state.Title,
			state.Message,
			state.Hint,
			state.Role,
			state.Live,
			state.StopEnabled,
			state.HasProgress,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsPerformanceStopCanBeRetried() error {
	var state struct {
		AnalyzeID    string `json:"analyzeID"`
		CancelID     string `json:"cancelID"`
		AnalyzeCalls int    `json:"analyzeCalls"`
		CancelCalls  int    `json:"cancelCalls"`
		Pending      int    `json:"pending"`
		StopEnabled  bool   `json:"stopEnabled"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const analyzes = globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "AnalyzeNetwork"
		);
		const cancels = globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "CancelToolOperation"
		);
		const stop = document.querySelector(
			'[data-diagnostics-action="performance-stop"]'
		);
		return {
			analyzeID: analyzes.at(-1)?.input?.operationId || "",
			cancelID: cancels.at(-1)?.input || "",
			analyzeCalls: analyzes.length,
			cancelCalls: cancels.length,
			pending: globalThis.__VALIDEX_E2E__.pendingCount("AnalyzeNetwork"),
			stopEnabled: stop instanceof HTMLButtonElement && !stop.disabled
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.AnalyzeID == "" || state.AnalyzeID != state.CancelID ||
		state.AnalyzeCalls != 1 || state.CancelCalls != 1 ||
		state.Pending != 1 || !state.StopEnabled {
		return fmt.Errorf(
			"performance Stop is not retryable for its active operation: analyze=%q cancel=%q calls=%d/%d pending=%d enabled=%t",
			state.AnalyzeID,
			state.CancelID,
			state.AnalyzeCalls,
			state.CancelCalls,
			state.Pending,
			state.StopEnabled,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsRetryPerformanceStop() error {
	if err := w.run(
		chromedp.Click(
			`[data-diagnostics-action="performance-stop"]`,
			chromedp.ByQuery,
		),
		chromedp.Poll(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "CancelToolOperation"
			).length === 2 &&
			globalThis.__VALIDEX_E2E__.pendingCount("AnalyzeNetwork") === 0 &&
			document.querySelector(
				"#diagnostics-panel-performance"
			)?.getAttribute("aria-busy") === "false" &&
			Boolean(document.querySelector(
				'[data-diagnostics-slot="notice"] .tool-notice.info[role="status"]'
			))`,
			nil,
			chromedp.WithPollingInterval(25*time.Millisecond),
			chromedp.WithPollingTimeout(3*time.Second),
		),
	); err != nil {
		return fmt.Errorf("retry URL performance Stop: %w", err)
	}
	return nil
}

func diagnosticsPerformanceCanceledNotice(locale string) (string, error) {
	switch locale {
	case "en":
		return "URL performance test stopped.", nil
	case "tr":
		return "URL performans testi durduruldu.", nil
	default:
		return "", fmt.Errorf("unsupported diagnostics locale %q", locale)
	}
}

func (w *browserWorld) diagnosticsPerformanceCancellationIsAnnounced() error {
	var state struct {
		Locale      string `json:"locale"`
		Busy        string `json:"busy"`
		Text        string `json:"text"`
		Role        string `json:"role"`
		Live        string `json:"live"`
		Info        bool   `json:"info"`
		RunEnabled  bool   `json:"runEnabled"`
		HasStop     bool   `json:"hasStop"`
		HasProgress bool   `json:"hasProgress"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const notice = document.querySelector(
			'[data-diagnostics-slot="notice"] .tool-notice.info'
		);
		const run = document.querySelector(
			'[data-diagnostics-action="performance-run"]'
		);
		return {
			locale: document.documentElement.lang,
			busy: document.querySelector("#diagnostics-panel-performance")
				?.getAttribute("aria-busy") || "",
			text: notice?.querySelector("span")?.textContent?.trim() || "",
			role: notice?.getAttribute("role") || "",
			live: notice?.getAttribute("aria-live") || "",
			info: notice?.classList.contains("info") || false,
			runEnabled: run instanceof HTMLButtonElement && !run.disabled,
			hasStop: Boolean(document.querySelector(
				'[data-diagnostics-action="performance-stop"]'
			)),
			hasProgress: Boolean(document.querySelector(".diagnostics-progress"))
		};
	})()`, &state)); err != nil {
		return err
	}
	expected, err := diagnosticsPerformanceCanceledNotice(state.Locale)
	if err != nil {
		return err
	}
	if state.Busy != "false" || state.Text != expected ||
		state.Role != "status" || state.Live != "polite" ||
		!state.Info || !state.RunEnabled || state.HasStop || state.HasProgress {
		return fmt.Errorf(
			"performance cancellation announcement is incomplete: locale=%q busy=%q text=%q role=%q live=%q info=%t runEnabled=%t stop=%t progress=%t",
			state.Locale,
			state.Busy,
			state.Text,
			state.Role,
			state.Live,
			state.Info,
			state.RunEnabled,
			state.HasStop,
			state.HasProgress,
		)
	}
	return nil
}

func (w *browserWorld) diagnosticsPerformanceCancelIDsMatch() error {
	var state struct {
		AnalyzeID    string   `json:"analyzeID"`
		CancelIDs    []string `json:"cancelIDs"`
		AnalyzeCalls int      `json:"analyzeCalls"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const analyzes = globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "AnalyzeNetwork"
		);
		return {
			analyzeID: analyzes.at(-1)?.input?.operationId || "",
			cancelIDs: globalThis.__VALIDEX_E2E__.calls
				.filter((call) => call.method === "CancelToolOperation")
				.map((call) => call.input || ""),
			analyzeCalls: analyzes.length
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.AnalyzeID == "" || state.AnalyzeCalls != 1 ||
		len(state.CancelIDs) != 2 ||
		state.CancelIDs[0] != state.AnalyzeID ||
		state.CancelIDs[1] != state.AnalyzeID {
		return fmt.Errorf(
			"performance cancellation operation identifiers differ: analyze=%q analyzeCalls=%d cancels=%q",
			state.AnalyzeID,
			state.AnalyzeCalls,
			state.CancelIDs,
		)
	}
	return nil
}
