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

const diagnosticsEditedActuatorURL = "http://edited.example.test/actuator"

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

func (w *browserWorld) diagnosticsResolveDeferredOperation() error {
	staleResult := diagnosticsSnapshot(
		"2026-07-29T10:00:00Z",
		999_999,
		[]map[string]any{},
	)
	staleResult["health"] = map[string]any{
		"status":     "STALE_SHOULD_NOT_RENDER",
		"components": map[string]any{},
		"data":       map[string]any{},
	}
	encoded, err := stdjson.Marshal(staleResult)
	if err != nil {
		return err
	}
	var resolved bool
	if err := w.run(
		chromedp.Evaluate(
			fmt.Sprintf(
				`globalThis.__VALIDEX_E2E__.resolve("InspectActuator", %s)`,
				string(encoded),
			),
			&resolved,
		),
		chromedp.Poll(
			`document.querySelector(
				'[data-diagnostics-slot="notice"] .tool-notice.info[role="status"]'
			)?.textContent?.includes("previous operation result was ignored")`,
			nil,
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
		HasStaleResult bool `json:"hasStaleResult"`
		HasMetric      bool `json:"hasMetric"`
		HasEmptyState  bool `json:"hasEmptyState"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const panel = document.querySelector("#diagnostics-panel-runtime");
		const text = panel?.textContent || "";
		return {
			hasStaleResult: text.includes("STALE_SHOULD_NOT_RENDER"),
			hasMetric: text.includes("999,999"),
			hasEmptyState: text.includes("No runtime snapshot")
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.HasStaleResult || state.HasMetric || !state.HasEmptyState {
		return fmt.Errorf(
			"stale diagnostics result leaked into UI: marker=%t metric=%t empty=%t",
			state.HasStaleResult,
			state.HasMetric,
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
