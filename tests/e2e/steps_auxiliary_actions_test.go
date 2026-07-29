package e2e

import (
	"fmt"
	"strings"

	"github.com/chromedp/chromedp"
	"github.com/cucumber/godog"
)

const (
	auxiliaryRequestURL = "https://api.example.test/orders/42"
	auxiliaryMockPort   = "45123"
)

func registerAuxiliaryActionSteps(
	context *godog.ScenarioContext,
	world *browserWorld,
) {
	context.Step(
		`^an active request has a reusable JSON response$`,
		world.auxiliaryMockJSONResponse,
	)
	context.Step(
		`^I create the mock route from the active response$`,
		world.auxiliaryUseActiveMockResponse,
	)
	context.Step(
		`^the request method, path, status, content type, and body populate the route$`,
		world.auxiliaryMockRouteMatchesResponse,
	)
	context.Step(
		`^I start the mock server on a manual port with CORS$`,
		world.auxiliaryStartManualCORSMock,
	)
	context.Step(
		`^I copy the running mock server URL$`,
		world.auxiliaryCopyMockURL,
	)
	context.Step(
		`^the manual start payload and clipboard value are exact$`,
		world.auxiliaryManualMockPayloadAndClipboardAreExact,
	)
	context.Step(
		`^an active request has a non-JSON response$`,
		world.auxiliaryMockNonJSONResponse,
	)
	context.Step(
		`^I try to create the mock route from the active response$`,
		world.auxiliaryTryInvalidActiveMockResponse,
	)
	context.Step(
		`^an active-response validation error is announced$`,
		world.auxiliaryActiveMockResponseErrorIsAnnounced,
	)
	context.Step(
		`^the existing mock route fields remain unchanged$`,
		world.auxiliaryMockRouteFieldsRemainUnchanged,
	)
	context.Step(
		`^I load the built-in runner sample$`,
		world.auxiliaryLoadRunnerSample,
	)
	context.Step(
		`^the sample contains its base URL, request, and all assertions$`,
		world.auxiliaryRunnerSampleIsComplete,
	)
	context.Step(
		`^I run the loaded runner sample$`,
		world.auxiliaryRunRunnerSample,
	)
	context.Step(
		`^the runner bridge receives the unchanged sample and an operation identifier$`,
		world.auxiliaryRunnerSamplePayloadIsExact,
	)
	context.Step(
		`^I minify a formatted JSON document$`,
		world.auxiliaryMinifyJSONDocument,
	)
	context.Step(
		`^the result is compact JSON with the same data$`,
		world.auxiliaryMinifiedJSONIsEquivalent,
	)
	context.Step(
		`^I clear the JSON editor$`,
		world.auxiliaryClearJSONEditor,
	)
	context.Step(
		`^the input, result, and notice are empty and focus returns to the editor$`,
		world.auxiliaryJSONEditorIsCleanAndFocused,
	)
	context.Step(
		`^an active request has diagnostics response data$`,
		world.auxiliaryDiagnosticsResponseData,
	)
	context.Step(
		`^I load the active response into Spring diagnostics$`,
		world.auxiliaryLoadActiveSpringResponse,
	)
	context.Step(
		`^its body, status, and headers populate the Spring inputs$`,
		world.auxiliarySpringInputsMatchActiveResponse,
	)
	context.Step(
		`^I use the active trace identifier in log diagnostics$`,
		world.auxiliaryUseActiveTrace,
	)
	context.Step(
		`^the exact trace identifier populates the log search$`,
		world.auxiliaryTraceIdentifierIsExact,
	)
	context.Step(
		`^I analyze recorded endpoint coverage$`,
		world.auxiliaryAnalyzeRecordedCoverage,
	)
	context.Step(
		`^the recorded coverage call and result are rendered correctly$`,
		world.auxiliaryRecordedCoverageIsCorrect,
	)
}

func (w *browserWorld) auxiliaryPrepareActiveResponse(fixture string) error {
	if err := w.shellOpenWorkspace("Requests"); err != nil {
		return err
	}
	if err := requestEnsureEditable(w); err != nil {
		return err
	}
	if err := requestSetValue(w, `[name="method"]`, "POST", true); err != nil {
		return err
	}
	if err := requestSetValue(w, `[name="url"]`, auxiliaryRequestURL, false); err != nil {
		return err
	}
	if err := requestConfigureBridgeCall(
		w,
		"SendRequest",
		requestResponseResult(fixture, "POST", auxiliaryRequestURL),
	); err != nil {
		return err
	}
	before, err := requestBridgeCallCount(w, "SendRequest")
	if err != nil {
		return err
	}
	if err := requestClick(
		w,
		`[data-request-form] .send-button[type="submit"]`,
	); err != nil {
		return err
	}
	return requestWaitFor(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "SendRequest"
			).length > %d &&
			Boolean(document.querySelector(".response-summary"))`, before),
		"active request response",
	)
}

func (w *browserWorld) auxiliaryMockJSONResponse() error {
	if err := w.auxiliaryPrepareActiveResponse("rich JSON response"); err != nil {
		return err
	}
	return w.shellOpenWorkspace("Mock")
}

func (w *browserWorld) auxiliaryMockNonJSONResponse() error {
	if err := w.auxiliaryPrepareActiveResponse("plain text"); err != nil {
		return err
	}
	return w.shellOpenWorkspace("Mock")
}

func (w *browserWorld) auxiliaryUseActiveMockResponse() error {
	if err := w.run(chromedp.Click(
		`[data-action="use-active-response"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return mockWait(
		w,
		`Boolean(document.querySelector(".tool-notice.success[role=status]")) &&
		 document.querySelector('[data-field="path"]')?.value === "/orders/42"`,
		"active response copied into mock route",
	)
}

func (w *browserWorld) auxiliaryMockRouteMatchesResponse() error {
	var matches bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const headers = document.querySelector('[data-field="headers"]')?.value;
		const body = document.querySelector('[data-field="body"]')?.value;
		if (!headers || !body) return false;
		return document.querySelector('[data-field="method"]')?.value === "POST" &&
			document.querySelector('[data-field="path"]')?.value === "/orders/42" &&
			document.querySelector('[data-field="status"]')?.value === "200" &&
			JSON.parse(headers)["Content-Type"] ===
				"application/json; charset=utf-8" &&
			JSON.parse(body).order?.id === "order-42";
	})()`, &matches)); err != nil {
		return err
	}
	if !matches {
		return fmt.Errorf("active response did not populate every mock route field")
	}
	return nil
}

func (w *browserWorld) auxiliaryStartManualCORSMock() error {
	if err := w.run(
		chromedp.Click(`[data-action="port-manual"]`, chromedp.ByQuery),
		chromedp.WaitVisible(`[data-field="port"]`, chromedp.ByQuery),
	); err != nil {
		return err
	}
	if err := mockSetControl(w, `[data-field="port"]`, auxiliaryMockPort); err != nil {
		return err
	}
	if err := w.run(chromedp.Click(`[data-field="cors"]`, chromedp.ByQuery)); err != nil {
		return err
	}
	if err := mockWait(
		w,
		`document.querySelector('[data-field="port"]')?.value === "45123" &&
		 document.querySelector('[data-field="cors"]')?.checked === true &&
		 document.querySelector('[data-action="start"]')?.disabled === false`,
		"valid manual mock settings",
	); err != nil {
		return err
	}
	var before int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "StartMockServer"
		).length`,
		&before,
	)); err != nil {
		return err
	}
	if err := w.run(chromedp.Click(`[data-action="start"]`, chromedp.ByQuery)); err != nil {
		return err
	}
	return mockWait(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "StartMockServer"
			).length > %d &&
			Boolean(document.querySelector('[data-action="copy-url"]'))`, before),
		"manual CORS mock server start",
	)
}

func (w *browserWorld) auxiliaryCopyMockURL() error {
	if err := w.run(chromedp.Click(
		`[data-action="copy-url"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return mockWait(
		w,
		`globalThis.__VALIDEX_E2E__.clipboard ===
			"http://127.0.0.1:45123" &&
		 Boolean(document.querySelector(".tool-notice.success[role=status]"))`,
		"copied mock server URL",
	)
}

func (w *browserWorld) auxiliaryManualMockPayloadAndClipboardAreExact() error {
	var matches bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const call = globalThis.__VALIDEX_E2E__.calls.filter(
			(candidate) => candidate.method === "StartMockServer"
		).at(-1);
		return call?.input?.port === 45123 &&
			call.input.enableCors === true &&
			globalThis.__VALIDEX_E2E__.clipboard ===
				"http://127.0.0.1:45123";
	})()`, &matches)); err != nil {
		return err
	}
	if !matches {
		return fmt.Errorf("manual mock start payload or copied URL is not exact")
	}
	return nil
}

func (w *browserWorld) auxiliaryTryInvalidActiveMockResponse() error {
	var stored bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const value = (selector) => document.querySelector(selector)?.value ?? "";
		globalThis.__VALIDEX_E2E_AUXILIARY__ = {
			mockRouteBefore: {
				method: value('[data-field="method"]'),
				path: value('[data-field="path"]'),
				status: value('[data-field="status"]'),
				headers: value('[data-field="headers"]'),
				body: value('[data-field="body"]'),
			},
		};
		return true;
	})()`, &stored)); err != nil {
		return err
	}
	if !stored {
		return fmt.Errorf("could not capture mock route fields before validation")
	}
	if err := w.run(chromedp.Click(
		`[data-action="use-active-response"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return mockWait(
		w,
		`Boolean(document.querySelector(".tool-notice.error[role=alert]"))`,
		"non-JSON active-response validation",
	)
}

func (w *browserWorld) auxiliaryActiveMockResponseErrorIsAnnounced() error {
	var state struct {
		Text string `json:"text"`
		Role string `json:"role"`
		Live string `json:"live"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const error = document.querySelector(".tool-notice.error");
		return {
			text: error?.textContent?.trim() || "",
			role: error?.getAttribute("role") || "",
			live: error?.getAttribute("aria-live") || "",
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.Text == "" || state.Role != "alert" || state.Live != "assertive" {
		return fmt.Errorf("active-response error is not accessible: %+v", state)
	}
	return nil
}

func (w *browserWorld) auxiliaryMockRouteFieldsRemainUnchanged() error {
	var unchanged bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const before =
			globalThis.__VALIDEX_E2E_AUXILIARY__?.mockRouteBefore;
		const value = (selector) => document.querySelector(selector)?.value ?? "";
		return Boolean(before) &&
			before.method === value('[data-field="method"]') &&
			before.path === value('[data-field="path"]') &&
			before.status === value('[data-field="status"]') &&
			before.headers === value('[data-field="headers"]') &&
			before.body === value('[data-field="body"]');
	})()`, &unchanged)); err != nil {
		return err
	}
	if !unchanged {
		return fmt.Errorf("invalid active response changed the editable mock route")
	}
	return nil
}

func (w *browserWorld) auxiliaryLoadRunnerSample() error {
	if err := automationSetControl(
		w,
		`[data-form="runner"] [name="collection"]`,
		`{"version":2,"name":"replacement","requests":[]}`,
	); err != nil {
		return err
	}
	if err := w.run(chromedp.Click(
		`[data-action="runner-sample"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return automationWait(
		w,
		`(() => {
			const textarea = document.querySelector(
				'[data-form="runner"] [name="collection"]'
			);
			if (!textarea?.value.includes('"Local smoke"')) return false;
			globalThis.__VALIDEX_E2E_AUXILIARY__ = {
				...(globalThis.__VALIDEX_E2E_AUXILIARY__ || {}),
				runnerSample: textarea.value,
			};
			return true;
		})()`,
		"built-in runner sample",
	)
}

func (w *browserWorld) auxiliaryRunnerSampleIsComplete() error {
	var matches bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const raw = document.querySelector(
			'[data-form="runner"] [name="collection"]'
		)?.value;
		if (!raw) return false;
		const sample = JSON.parse(raw);
		const request = sample.requests?.[0];
		return sample.version === 2 &&
			sample.name === "Local smoke" &&
			sample.variables?.baseUrl === "http://localhost:8080" &&
			sample.requests?.length === 1 &&
			request?.method === "GET" &&
			request?.url === "{{baseUrl}}/actuator/health" &&
			request?.assertions?.length === 3;
	})()`, &matches)); err != nil {
		return err
	}
	if !matches {
		return fmt.Errorf("built-in runner sample is incomplete")
	}
	return nil
}

func (w *browserWorld) auxiliaryRunRunnerSample() error {
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
		`[data-form="runner"] button[type="submit"]`,
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
				?.getAttribute("aria-busy") === "false"`, before),
		"completed built-in runner sample",
	)
}

func (w *browserWorld) auxiliaryRunnerSamplePayloadIsExact() error {
	var matches bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const sample =
			globalThis.__VALIDEX_E2E_AUXILIARY__?.runnerSample;
		const call = globalThis.__VALIDEX_E2E__.calls.filter(
			(candidate) => candidate.method === "RunCollection"
		).at(-1);
		return typeof sample === "string" &&
			call?.input?.definition === sample &&
			/^collection-[0-9a-f-]{36}$/i.test(call.input.operationId || "") &&
			Object.keys(call.input.variables || {}).length === 0;
	})()`, &matches)); err != nil {
		return err
	}
	if !matches {
		return fmt.Errorf("runner bridge did not receive the exact built-in sample")
	}
	return nil
}

func (w *browserWorld) auxiliaryMinifyJSONDocument() error {
	const source = "{\n  \"z\": 2,\n  \"nested\": { \"ok\": true },\n  \"a\": [1, 2]\n}"
	if err := w.jsonSetControl("source", source); err != nil {
		return err
	}
	if err := w.run(chromedp.Click(
		`[data-json-action="minify"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return requestWaitFor(
		w,
		`document.querySelector(
			'[data-json-slot="result"] textarea'
		)?.value === '{"z":2,"nested":{"ok":true},"a":[1,2]}' &&
		Boolean(document.querySelector(
			'[data-json-slot="notice"] .tool-notice.success'
		))`,
		"minified JSON result",
	)
}

func (w *browserWorld) auxiliaryMinifiedJSONIsEquivalent() error {
	var matches bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const result = document.querySelector(
			'[data-json-slot="result"] textarea'
		)?.value;
		if (result !== '{"z":2,"nested":{"ok":true},"a":[1,2]}') return false;
		const parsed = JSON.parse(result);
		return parsed.z === 2 &&
			parsed.nested?.ok === true &&
			parsed.a?.length === 2 &&
			parsed.a[0] === 1 &&
			parsed.a[1] === 2;
	})()`, &matches)); err != nil {
		return err
	}
	if !matches {
		return fmt.Errorf("minified JSON changed its data")
	}
	return nil
}

func (w *browserWorld) auxiliaryClearJSONEditor() error {
	if err := w.run(chromedp.Click(
		`[data-json-action="clear"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return requestWaitFor(
		w,
		`(() => {
			const source = document.querySelector('[data-json-control="source"]');
			const result = document.querySelector(
				'[data-json-slot="result"] textarea'
			)?.value || "";
			return source?.value === "" &&
				result === "" &&
				!document.querySelector(
					'[data-json-slot="notice"]'
				)?.textContent?.trim() &&
				document.querySelector('[data-json-action="clear"]')?.disabled === true &&
				document.activeElement === source;
		})()`,
		"cleared and focused JSON editor",
	)
}

func (w *browserWorld) auxiliaryJSONEditorIsCleanAndFocused() error {
	var state struct {
		Source        string `json:"source"`
		Result        string `json:"result"`
		Notice        string `json:"notice"`
		ClearDisabled bool   `json:"clearDisabled"`
		Focused       bool   `json:"focused"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const source = document.querySelector('[data-json-control="source"]');
		return {
			source: source?.value || "",
			result: document.querySelector(
				'[data-json-slot="result"] textarea'
			)?.value || "",
			notice: document.querySelector(
				'[data-json-slot="notice"]'
			)?.textContent?.trim() || "",
			clearDisabled:
				document.querySelector('[data-json-action="clear"]')?.disabled === true,
			focused: document.activeElement === source,
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.Source != "" || state.Result != "" || state.Notice != "" ||
		!state.ClearDisabled || !state.Focused {
		return fmt.Errorf("JSON clear state is incomplete: %+v", state)
	}
	return nil
}

func (w *browserWorld) auxiliaryDiagnosticsResponseData() error {
	if err := w.auxiliaryPrepareActiveResponse("rich JSON response"); err != nil {
		return err
	}
	return w.shellOpenWorkspace("Diagnostics")
}

func (w *browserWorld) auxiliaryLoadActiveSpringResponse() error {
	if err := w.diagnosticsOpenMode("Spring"); err != nil {
		return err
	}
	for selector, value := range map[string]string{
		`[data-diagnostics-control="spring-body"]`:    `{"stale":true}`,
		`[data-diagnostics-control="spring-status"]`:  "418",
		`[data-diagnostics-control="spring-headers"]`: `{"X-Stale":"true"}`,
	} {
		if err := w.diagnosticsSetControl(selector, value); err != nil {
			return err
		}
	}
	if err := w.run(chromedp.Click(
		`[data-diagnostics-action="load-active-response"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return requestWaitFor(
		w,
		`document.querySelector(
			'[data-diagnostics-control="spring-status"]'
		)?.value === "200" &&
		document.querySelector(
			'[data-diagnostics-control="spring-body"]'
		)?.value.includes('"order-42"')`,
		"active response loaded into Spring diagnostics",
	)
}

func (w *browserWorld) auxiliarySpringInputsMatchActiveResponse() error {
	var matches bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const body = document.querySelector(
			'[data-diagnostics-control="spring-body"]'
		)?.value;
		const headers = document.querySelector(
			'[data-diagnostics-control="spring-headers"]'
		)?.value;
		if (!body || !headers) return false;
		const parsedHeaders = JSON.parse(headers);
		return JSON.parse(body).order?.id === "order-42" &&
			document.querySelector(
				'[data-diagnostics-control="spring-status"]'
			)?.value === "200" &&
			parsedHeaders["content-type"] ===
				"application/json; charset=utf-8" &&
			parsedHeaders["x-request-id"] === "trace-e2e-42";
	})()`, &matches)); err != nil {
		return err
	}
	if !matches {
		return fmt.Errorf("Spring diagnostics inputs do not match the active response")
	}
	return nil
}

func (w *browserWorld) auxiliaryUseActiveTrace() error {
	if err := w.diagnosticsOpenMode("Logs"); err != nil {
		return err
	}
	if err := w.diagnosticsSetControl(
		`[data-diagnostics-control="trace-query"]`,
		"stale-trace",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.Click(
		`[data-diagnostics-action="use-active-trace"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return requestWaitFor(
		w,
		`document.querySelector(
			'[data-diagnostics-control="trace-query"]'
		)?.value === "trace-e2e-42"`,
		"active trace loaded into log diagnostics",
	)
}

func (w *browserWorld) auxiliaryTraceIdentifierIsExact() error {
	var value string
	if err := w.run(chromedp.Value(
		`[data-diagnostics-control="trace-query"]`,
		&value,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	if value != "trace-e2e-42" {
		return fmt.Errorf("trace query = %q, want trace-e2e-42", value)
	}
	return nil
}

func (w *browserWorld) auxiliaryAnalyzeRecordedCoverage() error {
	report := map[string]any{
		"totalKnown":      2,
		"covered":         1,
		"coveragePercent": 50,
		"endpoints": []map[string]any{
			{
				"method":                 "GET",
				"path":                   "/orders",
				"hitCount":               3,
				"observedPaths":          []string{"/orders"},
				"observedPathsTruncated": false,
			},
			{
				"method":                 "POST",
				"path":                   "/orders",
				"hitCount":               0,
				"observedPaths":          []string{},
				"observedPathsTruncated": false,
			},
		},
		"unknownObserved": []any{},
	}
	if err := w.diagnosticsConfigure(map[string]any{
		"overrides": map[string]any{"AnalyzeEndpointCoverage": report},
	}); err != nil {
		return err
	}
	if err := w.diagnosticsOpenMode("Coverage"); err != nil {
		return err
	}
	var before int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "AnalyzeEndpointCoverage"
		).length`,
		&before,
	)); err != nil {
		return err
	}
	if err := w.run(chromedp.Click(
		`[data-diagnostics-action="coverage-recorded"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return requestWaitFor(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "AnalyzeEndpointCoverage"
			).length > %d &&
			document.querySelector(
				".diagnostics-coverage-summary [role=progressbar]"
			)?.getAttribute("aria-valuenow") === "50"`, before),
		"recorded endpoint coverage result",
	)
}

func (w *browserWorld) auxiliaryRecordedCoverageIsCorrect() error {
	var state struct {
		InputExact bool   `json:"inputExact"`
		Progress   string `json:"progress"`
		Text       string `json:"text"`
		Rows       int    `json:"rows"`
		Notice     bool   `json:"notice"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const call = globalThis.__VALIDEX_E2E__.calls.filter(
			(candidate) => candidate.method === "AnalyzeEndpointCoverage"
		).at(-1);
		const result = document.querySelector(".diagnostics-result-stack");
		return {
			inputExact: Array.isArray(call?.input?.known) &&
				call.input.known.length === 0 &&
				Array.isArray(call.input.observed) &&
				call.input.observed.length === 0,
			progress: result?.querySelector(
				'[role="progressbar"]'
			)?.getAttribute("aria-valuenow") || "",
			text: result?.textContent || "",
			rows: result?.querySelectorAll(
				".diagnostics-table tbody tr"
			).length || 0,
			notice: Boolean(document.querySelector(
				'[data-diagnostics-slot="notice"] .tool-notice.success[role=status]'
			)),
		};
	})()`, &state)); err != nil {
		return err
	}
	if !state.InputExact || state.Progress != "50" || state.Rows != 2 ||
		!state.Notice || !strings.Contains(state.Text, "1 / 2") ||
		!strings.Contains(state.Text, "GET") ||
		!strings.Contains(state.Text, "POST") {
		return fmt.Errorf("recorded coverage state is incomplete: %+v", state)
	}
	return nil
}
