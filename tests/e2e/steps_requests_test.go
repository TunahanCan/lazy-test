package e2e

import (
	stdcontext "context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/chromedp/cdproto/input"
	"github.com/chromedp/chromedp"
	"github.com/chromedp/chromedp/kb"
	"github.com/cucumber/godog"
)

const (
	requestStepTimeout = 6 * time.Second
	requestTestURL     = "https://api.example.test/orders"
)

type requestSteps struct {
	world *browserWorld

	pendingSendResult     map[string]any
	sendIsDeferred        bool
	runningObserved       bool
	activeSection         string
	importFocusMovedToURL bool
	responseBody          string
	responseFormat        string
	keyboardNavigationOK  bool
	reorderedTabID        string
	reorderBefore         []string
	reorderAfter          []string
	reorderFocusOK        bool
	dirtyTabID            string
}

type requestBridgeCall struct {
	Method string          `json:"method"`
	Input  json.RawMessage `json:"input"`
}

func registerRequestSteps(context *godog.ScenarioContext, world *browserWorld) {
	steps := &requestSteps{world: world}
	context.Before(func(
		ctx stdcontext.Context,
		_ *godog.Scenario,
	) (stdcontext.Context, error) {
		*steps = requestSteps{world: world}
		return ctx, nil
	})

	context.Step(
		`^the bridge will return the "([^"]+)" request result$`,
		steps.bridgeWillReturnRequestResult,
	)
	context.Step(`^I create a new request$`, steps.createNewRequest)
	context.Step(
		`^I compose a "([^"]+)" request to "([^"]+)"$`,
		steps.composeRequest,
	)
	context.Step(`^I send the active request$`, steps.sendActiveRequest)
	context.Step(
		`^the request is shown as running before it completes$`,
		steps.requestRunsBeforeCompletion,
	)
	context.Step(
		`^the response summary shows status, duration, size, content type, and protocol$`,
		steps.responseSummaryIsComplete,
	)
	context.Step(
		`^the response body is formatted as highlighted JSON$`,
		steps.responseBodyIsHighlightedJSON,
	)
	context.Step(
		`^the application has no uncaught frontend error$`,
		steps.applicationHasNoFrontendError,
	)
	context.Step(
		`^the active request has the "([^"]+)" result$`,
		steps.activeRequestHasResult,
	)
	context.Step(
		`^I open the "([^"]+)" response view$`,
		steps.openResponseView,
	)
	context.Step(
		`^the "([^"]+)" response content is visible$`,
		steps.responseContentIsVisible,
	)
	context.Step(
		`^the selected response view is announced as active$`,
		steps.selectedResponseViewIsActive,
	)
	context.Step(
		`^the active request has a "([^"]+)" response$`,
		steps.activeRequestHasMediaResponse,
	)
	context.Step(
		`^the response body is presented as "([^"]+)"$`,
		steps.responseBodyUsesFormat,
	)
	context.Step(
		`^long response lines remain readable without changing their content$`,
		steps.longResponseLinesRemainReadable,
	)
	context.Step(`^I have an editable request$`, steps.haveEditableRequest)
	context.Step(
		`^I open the "([^"]+)" request section$`,
		steps.openRequestSection,
	)
	context.Step(
		`^I perform the "([^"]+)" request edit$`,
		steps.performRequestEdit,
	)
	context.Step(
		`^the "([^"]+)" request data is updated$`,
		steps.requestDataIsUpdated,
	)
	context.Step(
		`^the request tab is marked as a local draft$`,
		steps.requestTabIsLocalDraft,
	)
	context.Step(
		`^focus remains in the edited request section$`,
		steps.focusRemainsInRequestSection,
	)
	context.Step(
		`^I am on the requests welcome screen$`,
		steps.requestsWelcomeIsVisible,
	)
	context.Step(
		`^I open the cURL import dialog$`,
		steps.openCurlImportDialog,
	)
	context.Step(
		`^I import a cURL command with method, URL, headers, and body$`,
		steps.importCompleteCurlCommand,
	)
	context.Step(
		`^a new request tab contains the imported method, URL, headers, and body$`,
		steps.importedRequestIsComplete,
	)
	context.Step(
		`^sensitive imported headers are called out without exposing their values$`,
		steps.sensitiveImportIsSafelyCalledOut,
	)
	context.Step(
		`^focus moves to the imported request URL$`,
		steps.focusMovedToImportedURL,
	)
	context.Step(
		`^I enter an unsupported request URL$`,
		steps.enterUnsupportedRequestURL,
	)
	context.Step(
		`^sending is unavailable and the URL error is announced$`,
		steps.invalidURLPreventsSend,
	)
	context.Step(
		`^I enter a valid request URL$`,
		steps.enterValidRequestURL,
	)
	context.Step(
		`^the bridge is configured to fail the next request with a network error$`,
		steps.nextRequestFailsWithNetworkError,
	)
	context.Step(
		`^a user-facing network error and retry action are shown$`,
		steps.networkErrorAndRetryAreVisible,
	)
	context.Step(
		`^the next request attempt will succeed$`,
		steps.nextRequestWillSucceed,
	)
	context.Step(`^I retry the active request$`, steps.retryActiveRequest)
	context.Step(
		`^a successful response replaces the error$`,
		steps.successfulResponseReplacesError,
	)
	context.Step(
		`^the next request remains in progress until it is canceled$`,
		steps.nextRequestRemainsInProgress,
	)
	context.Step(
		`^the composer offers a cancel action and disables mutable request fields$`,
		steps.composerOffersCancelAndDisablesFields,
	)
	context.Step(`^I cancel the active request$`, steps.cancelActiveRequest)
	context.Step(
		`^the bridge receives the active request identifier$`,
		steps.bridgeReceivesActiveRequestID,
	)
	context.Step(
		`^the response area reports a canceled request without an uncaught error$`,
		steps.canceledRequestIsReported,
	)
	context.Step(
		`^the request can be sent again$`,
		steps.canceledRequestCanBeSentAgain,
	)
	context.Step(
		`^I have three clean request tabs and one dirty request tab$`,
		steps.haveCleanAndDirtyRequestTabs,
	)
	context.Step(
		`^I navigate request tabs with Arrow keys, Home, and End$`,
		steps.navigateRequestTabsWithKeyboard,
	)
	context.Step(
		`^focus and the active request follow the keyboard selection$`,
		steps.focusAndActiveTabFollowKeyboard,
	)
	context.Step(
		`^I reorder a clean request tab with the keyboard$`,
		steps.reorderCleanTabWithKeyboard,
	)
	context.Step(
		`^the tab order changes and focus stays on the moved tab$`,
		steps.tabOrderChangesAndFocusStays,
	)
	context.Step(
		`^I close the dirty request tab with the keyboard$`,
		steps.closeDirtyTabWithKeyboard,
	)
	context.Step(
		`^a discard confirmation is shown$`,
		steps.discardConfirmationIsShown,
	)
	context.Step(
		`^I cancel the discard confirmation$`,
		steps.cancelDiscardConfirmation,
	)
	context.Step(
		`^the dirty request tab remains open$`,
		steps.dirtyRequestTabRemainsOpen,
	)
}

func (s *requestSteps) bridgeWillReturnRequestResult(fixture string) error {
	if fixture != "rich JSON response" {
		return fmt.Errorf("unknown request result fixture %q", fixture)
	}
	s.pendingSendResult = requestResponseResult(
		"rich JSON response",
		"POST",
		requestTestURL,
	)
	s.sendIsDeferred = true
	return requestDeferBridgeCall(s.world, "SendRequest")
}

func (s *requestSteps) createNewRequest() error {
	return requestEnsureEditable(s.world)
}

func (s *requestSteps) composeRequest(method, url string) error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	if err := requestSetValue(s.world, `[name="method"]`, method, true); err != nil {
		return fmt.Errorf("set request method: %w", err)
	}
	if err := requestWaitVisible(s.world, `[name="url"]`); err != nil {
		return err
	}
	if err := requestSetValue(s.world, `[name="url"]`, url, false); err != nil {
		return fmt.Errorf("set request URL: %w", err)
	}
	return requestWaitFor(
		s.world,
		`document.querySelector('[name="url"]')?.value === `+requestJSON(url),
		"composed request URL",
	)
}

func (s *requestSteps) sendActiveRequest() error {
	before, err := requestBridgeCallCount(s.world, "SendRequest")
	if err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`[data-request-form] .send-button[type="submit"]`,
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter((call) => call.method === "SendRequest").length > %d`,
			before,
		),
		"native SendRequest call",
	); err != nil {
		return err
	}
	if s.sendIsDeferred {
		return requestWaitFor(
			s.world,
			`document.querySelector("[data-request-form]")?.getAttribute("aria-busy") === "true" &&
			 Boolean(document.querySelector('[data-action="cancel-request"]'))`,
			"request running state",
		)
	}
	return nil
}

func (s *requestSteps) requestRunsBeforeCompletion() error {
	var observed bool
	if err := s.world.run(chromedp.Evaluate(
		`Boolean(
			document.querySelector('[data-action="cancel-request"]') &&
			document.querySelector(".response-loading") &&
			document.querySelector("[data-request-form]")?.getAttribute("aria-busy") === "true"
		)`,
		&observed,
	)); err != nil {
		return err
	}
	if !observed {
		return fmt.Errorf("request did not expose its running state before completion")
	}
	s.runningObserved = true
	result := s.pendingSendResult
	if result == nil {
		result = requestResponseResult("rich JSON response", "POST", requestTestURL)
	}
	if err := requestResolveBridgeCall(s.world, "SendRequest", result); err != nil {
		return err
	}
	s.sendIsDeferred = false
	return requestWaitVisible(s.world, `.response-summary`)
}

func (s *requestSteps) responseSummaryIsComplete() error {
	if !s.runningObserved {
		return fmt.Errorf("running state was not observed before the response")
	}
	var summary struct {
		Status      string `json:"status"`
		Duration    string `json:"duration"`
		Size        string `json:"size"`
		ContentType string `json:"contentType"`
		Protocol    string `json:"protocol"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`(() => ({
			status: document.querySelector(".status-mark")?.textContent?.trim() || "",
			duration: document.querySelector(".response-duration")?.textContent?.trim() || "",
			size: document.querySelector(".response-size")?.textContent?.trim() || "",
			contentType: document.querySelector(".response-content-type")?.textContent?.trim() || "",
			protocol: document.querySelector(".response-protocol")?.textContent?.trim() || ""
		}))()`,
		&summary,
	)); err != nil {
		return err
	}
	if !strings.Contains(summary.Status, "200") ||
		summary.Duration == "" ||
		summary.Size == "" ||
		!strings.Contains(summary.ContentType, "application/json") ||
		summary.Protocol != "HTTP/2" {
		return fmt.Errorf("incomplete response summary: %+v", summary)
	}
	return nil
}

func (s *requestSteps) responseBodyIsHighlightedJSON() error {
	var result struct {
		Kind        string `json:"kind"`
		Highlighted string `json:"highlighted"`
		TokenCount  int    `json:"tokenCount"`
		Text        string `json:"text"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const body = document.querySelector(".response-body");
			return {
				kind: body?.getAttribute("data-response-kind") || "",
				highlighted: body?.getAttribute("data-response-highlighted") || "",
				tokenCount: body?.querySelectorAll('[class^="response-syntax-"]').length || 0,
				text: body?.querySelector(".response-code")?.textContent || ""
			};
		})()`,
		&result,
	)); err != nil {
		return err
	}
	if result.Kind != "json" ||
		result.Highlighted != "true" ||
		result.TokenCount < 4 ||
		!strings.Contains(result.Text, "order-42") {
		return fmt.Errorf("response was not highlighted JSON: %+v", result)
	}
	return nil
}

func (s *requestSteps) applicationHasNoFrontendError() error {
	if errorsFound := s.world.errors(); len(errorsFound) > 0 {
		return fmt.Errorf(
			"frontend errors were captured:\n%s",
			strings.Join(errorsFound, "\n"),
		)
	}
	return nil
}

func (s *requestSteps) activeRequestHasResult(fixture string) error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	if err := s.composeRequest("GET", requestTestURL); err != nil {
		return err
	}
	result := requestResponseResult(fixture, "GET", requestTestURL)
	if err := requestConfigureBridgeCall(s.world, "SendRequest", result); err != nil {
		return err
	}
	s.sendIsDeferred = false
	if err := s.sendActiveRequest(); err != nil {
		return err
	}
	return requestWaitVisible(s.world, `.response-summary`)
}

func (s *requestSteps) openResponseView(view string) error {
	section, ok := requestResponseSection(view)
	if !ok {
		return fmt.Errorf("unknown response view %q", view)
	}
	selector := fmt.Sprintf(`[data-response-section="%s"]`, section)
	if err := requestClick(s.world, selector); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(%s)?.getAttribute("aria-selected") === "true"`,
			requestJSON(selector),
		),
		view+" response view selection",
	)
}

func (s *requestSteps) responseContentIsVisible(view string) error {
	expressions := map[string]string{
		"Body":     `document.querySelector('.response-body .response-code')?.textContent.includes("order-42")`,
		"Headers":  `document.querySelector(".response-kv-table")?.textContent.includes("x-request-id")`,
		"Cookies":  `document.querySelector(".cookie-table")?.textContent.includes("session")`,
		"Timeline": `document.querySelector(".timeline")?.textContent.includes("DNS")`,
		"Raw":      `document.querySelector(".response-body .response-code")?.textContent.includes("HTTP/2 200 OK")`,
	}
	expression, ok := expressions[view]
	if !ok {
		return fmt.Errorf("unknown response view %q", view)
	}
	var visible bool
	if err := s.world.run(chromedp.Evaluate(`Boolean(`+expression+`)`, &visible)); err != nil {
		return err
	}
	if !visible {
		return fmt.Errorf("%s response content is not visible", view)
	}
	return nil
}

func (s *requestSteps) selectedResponseViewIsActive() error {
	var active bool
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const selected = document.querySelector(
				'[data-response-section][aria-selected="true"]'
			);
			const panel = document.querySelector(".response-content[role=tabpanel]");
			return Boolean(
				selected &&
				panel &&
				panel.getAttribute("aria-labelledby") === selected.id &&
				selected.getAttribute("data-state") === "active"
			);
		})()`,
		&active,
	)); err != nil {
		return err
	}
	if !active {
		return fmt.Errorf("selected response view is not exposed as the active tab")
	}
	return nil
}

func (s *requestSteps) activeRequestHasMediaResponse(fixture string) error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	if err := s.composeRequest("GET", requestTestURL); err != nil {
		return err
	}
	result := requestResponseResult(fixture, "GET", requestTestURL)
	response, _ := result["response"].(map[string]any)
	s.responseBody, _ = response["body"].(string)
	s.responseFormat = requestFixtureFormat(fixture)
	if s.responseFormat == "" {
		return fmt.Errorf("unknown response fixture %q", fixture)
	}
	if err := requestConfigureBridgeCall(s.world, "SendRequest", result); err != nil {
		return err
	}
	s.sendIsDeferred = false
	if err := s.sendActiveRequest(); err != nil {
		return err
	}
	return requestWaitVisible(s.world, `.response-summary`)
}

func (s *requestSteps) responseBodyUsesFormat(format string) error {
	expected := strings.ToLower(format)
	if expected == "text" {
		expected = "text"
	}
	var result struct {
		Kind        string `json:"kind"`
		Label       string `json:"label"`
		Highlighted string `json:"highlighted"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const body = document.querySelector(".response-body");
			return {
				kind: body?.getAttribute("data-response-kind") || "",
				label: body?.querySelector(".response-format-label")?.textContent?.trim() || "",
				highlighted: body?.getAttribute("data-response-highlighted") || ""
			};
		})()`,
		&result,
	)); err != nil {
		return err
	}
	highlightExpected := expected == "json" || expected == "xml"
	if result.Kind != expected ||
		!strings.Contains(result.Label, format) ||
		(result.Highlighted == "true") != highlightExpected ||
		(s.responseFormat != "" && !strings.EqualFold(s.responseFormat, format)) {
		return fmt.Errorf(
			"response format = %+v, want %s (highlighted=%t)",
			result,
			format,
			highlightExpected,
		)
	}
	return nil
}

func (s *requestSteps) longResponseLinesRemainReadable() error {
	expectedJSON := requestJSON(s.responseBody)
	var result struct {
		ContentPreserved bool   `json:"contentPreserved"`
		OverflowX        string `json:"overflowX"`
		WhiteSpace       string `json:"whiteSpace"`
		LongestLine      int    `json:"longestLine"`
	}
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`(() => {
				const viewer = document.querySelector(".response-code");
				if (!viewer) return {};
				const text = viewer.textContent || "";
				const style = getComputedStyle(viewer);
				return {
					contentPreserved: text === %s,
					overflowX: style.overflowX,
					whiteSpace: style.whiteSpace,
					longestLine: Math.max(...text.split("\n").map((line) => line.length))
				};
			})()`,
			expectedJSON,
		),
		&result,
	)); err != nil {
		return err
	}
	readable := result.OverflowX == "auto" ||
		result.OverflowX == "scroll" ||
		result.WhiteSpace == "pre-wrap" ||
		result.WhiteSpace == "break-spaces"
	if !result.ContentPreserved || !readable || result.LongestLine < 200 {
		return fmt.Errorf("long response line is not safely readable: %+v", result)
	}
	return nil
}

func (s *requestSteps) haveEditableRequest() error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	return s.composeRequest("POST", requestTestURL)
}

func (s *requestSteps) openRequestSection(section string) error {
	normalized, ok := requestEditorSection(section)
	if !ok {
		return fmt.Errorf("unknown request section %q", section)
	}
	s.activeSection = normalized
	selector := fmt.Sprintf(`[data-request-section="%s"]`, normalized)
	if err := requestClick(s.world, selector); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(%s)?.getAttribute("aria-selected") === "true"`,
			requestJSON(selector),
		),
		section+" request section",
	)
}

func (s *requestSteps) performRequestEdit(edit string) error {
	switch edit {
	case "add and edit a query pair":
		if err := requestClick(s.world, `[data-action="add-query"]`); err != nil {
			return err
		}
		if err := requestSetValue(
			s.world,
			`[data-query-row]:last-of-type [data-query-field="key"]`,
			"limit",
			false,
		); err != nil {
			return err
		}
		return requestSetValue(
			s.world,
			`[data-query-row]:last-of-type [data-query-field="value"]`,
			"25",
			false,
		)
	case "add and edit a header row":
		if err := requestClick(s.world, `[data-action="add-header"]`); err != nil {
			return err
		}
		if err := requestSetValue(
			s.world,
			`[data-header-row]:last-of-type [data-header-field="key"]`,
			"X-E2E",
			false,
		); err != nil {
			return err
		}
		return requestSetValue(
			s.world,
			`[data-header-row]:last-of-type [data-header-field="value"]`,
			"enabled",
			false,
		)
	case "format a JSON request body":
		if err := requestSetValue(
			s.world,
			`[name="body"]`,
			`{"order":{"id":"order-42","ready":true}}`,
			false,
		); err != nil {
			return err
		}
		if err := requestClick(s.world, `[data-action="format-body"]`); err != nil {
			return err
		}
		return requestWaitFor(
			s.world,
			`document.querySelector('[name="body"]')?.value.includes("\n  ")`,
			"formatted request JSON",
		)
	case "add an environment override":
		if err := requestSetValue(
			s.world,
			`[data-new-variable-key]`,
			"region",
			false,
		); err != nil {
			return err
		}
		if err := requestSetValue(
			s.world,
			`[data-new-variable-value]`,
			"eu-west-1",
			false,
		); err != nil {
			return err
		}
		return requestClick(s.world, `[data-action="add-variable"]`)
	default:
		return fmt.Errorf("unknown request edit %q", edit)
	}
}

func (s *requestSteps) requestDataIsUpdated(section string) error {
	normalized, ok := requestEditorSection(section)
	if !ok {
		return fmt.Errorf("unknown request section %q", section)
	}
	expressions := map[string]string{
		"params": `(() => {
			const key = document.querySelector('[data-query-field="key"]');
			const value = document.querySelector('[data-query-field="value"]');
			return key?.value === "limit" && value?.value === "25";
		})()`,
		"headers": `(() => {
			const row = [...document.querySelectorAll("[data-header-row]")].at(-1);
			return row?.querySelector('[data-header-field="key"]')?.value === "X-E2E" &&
				row?.querySelector('[data-header-field="value"]')?.value === "enabled";
		})()`,
		"body": `(() => {
			const body = document.querySelector('[name="body"]')?.value || "";
			try {
				return JSON.parse(body).order.id === "order-42" && body.includes("\n");
			} catch { return false; }
		})()`,
		"variables": `(() => {
			const row = document.querySelector('[data-variable-row="region"]');
			return row?.querySelector("[data-variable-value]")?.value === "eu-west-1";
		})()`,
	}
	var updated bool
	if err := s.world.run(chromedp.Evaluate(expressions[normalized], &updated)); err != nil {
		return err
	}
	if !updated {
		return fmt.Errorf("%s request data was not updated", section)
	}
	return nil
}

func (s *requestSteps) requestTabIsLocalDraft() error {
	return requestWaitFor(
		s.world,
		`Boolean(
			document.querySelector(
				'.request-tab.active [data-request-tab-button][aria-selected="true"] .dirty-dot'
			)
		)`,
		"local draft marker",
	)
}

func (s *requestSteps) focusRemainsInRequestSection() error {
	var withinSection bool
	if err := s.world.run(chromedp.Evaluate(
		`Boolean(
			document.activeElement &&
			document.activeElement.closest(".request-section-content")
		)`,
		&withinSection,
	)); err != nil {
		return err
	}
	if !withinSection {
		return fmt.Errorf(
			"focus left the %s request editor after the edit",
			s.activeSection,
		)
	}
	return nil
}

func (s *requestSteps) requestsWelcomeIsVisible() error {
	var state struct {
		Welcome bool `json:"welcome"`
		Tabs    int  `json:"tabs"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`({
			welcome: Boolean(document.querySelector(".welcome-workspace-content")),
			tabs: document.querySelectorAll("[data-request-tab]").length
		})`,
		&state,
	)); err != nil {
		return err
	}
	if !state.Welcome || state.Tabs != 0 {
		return fmt.Errorf("request welcome screen is not the empty active view: %+v", state)
	}
	return nil
}

func (s *requestSteps) openCurlImportDialog() error {
	if err := requestClick(
		s.world,
		`[data-request-layout] [data-action="import-curl"]`,
	); err != nil {
		return err
	}
	return requestWaitVisible(s.world, `[data-curl-import-form]`)
}

func (s *requestSteps) importCompleteCurlCommand() error {
	const command = `curl -X POST 'https://api.example.test/orders' -H 'Content-Type: application/json' -H 'Authorization: Bearer super-secret-e2e' --data '{"sku":"SKU-1","quantity":2}'`
	if err := requestSetValue(
		s.world,
		`[name="curlSource"]`,
		command,
		false,
	); err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`[data-curl-import-form] button[type="submit"]`,
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		`!document.querySelector("[data-curl-import-form]") &&
		 document.querySelector('[name="url"]')?.value === "https://api.example.test/orders"`,
		"completed cURL import",
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		`document.activeElement === document.querySelector('[name="url"]')`,
		"imported URL focus",
	); err != nil {
		return err
	}
	s.importFocusMovedToURL = true
	return nil
}

func (s *requestSteps) importedRequestIsComplete() error {
	var composer struct {
		Method string `json:"method"`
		URL    string `json:"url"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`({
			method: document.querySelector('[name="method"]')?.value || "",
			url: document.querySelector('[name="url"]')?.value || ""
		})`,
		&composer,
	)); err != nil {
		return err
	}
	if composer.Method != "POST" || composer.URL != requestTestURL {
		return fmt.Errorf("imported composer fields are incomplete: %+v", composer)
	}
	if err := s.openRequestSection("Headers"); err != nil {
		return err
	}
	var headersOK bool
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const rows = [...document.querySelectorAll("[data-header-row]")];
			const headers = rows.map((row) => ({
				key: row.querySelector('[data-header-field="key"]')?.value,
				value: row.querySelector('[data-header-field="value"]')?.value
			}));
			return headers.some((header) =>
				header.key === "Content-Type" && header.value === "application/json"
			) && headers.some((header) =>
				header.key === "Authorization" &&
				header.value === "Bearer super-secret-e2e"
			);
		})()`,
		&headersOK,
	)); err != nil {
		return err
	}
	if !headersOK {
		return fmt.Errorf("imported cURL headers were not restored in the editor")
	}
	if err := s.openRequestSection("Body"); err != nil {
		return err
	}
	var body string
	if err := s.world.run(chromedp.Value(`[name="body"]`, &body, chromedp.ByQuery)); err != nil {
		return err
	}
	if body != `{"sku":"SKU-1","quantity":2}` {
		return fmt.Errorf("imported cURL body = %q", body)
	}
	return nil
}

func (s *requestSteps) sensitiveImportIsSafelyCalledOut() error {
	var notice string
	if err := s.world.run(chromedp.Text(`.tool-notice`, &notice, chromedp.ByQuery)); err != nil {
		return err
	}
	normalized := strings.ToLower(notice)
	if !strings.Contains(normalized, "hassas") &&
		!strings.Contains(normalized, "sensitive") {
		return fmt.Errorf("sensitive imported headers were not called out: %q", notice)
	}
	if strings.Contains(notice, "super-secret-e2e") ||
		strings.Contains(notice, "Bearer") {
		return fmt.Errorf("sensitive imported value leaked into the import notice")
	}
	return nil
}

func (s *requestSteps) focusMovedToImportedURL() error {
	if !s.importFocusMovedToURL {
		return fmt.Errorf("the cURL import did not move focus to the request URL")
	}
	return nil
}

func (s *requestSteps) enterUnsupportedRequestURL() error {
	if err := requestSetValue(
		s.world,
		`[name="url"]`,
		`ftp://api.example.test/orders`,
		false,
	); err != nil {
		return err
	}
	return requestBlur(s.world, `[name="url"]`)
}

func (s *requestSteps) invalidURLPreventsSend() error {
	return requestWaitFor(
		s.world,
		`(() => {
			const send = document.querySelector(
				'[data-request-form] .send-button[type="submit"]'
			);
			const input = document.querySelector('[name="url"]');
			const alert = document.querySelector(".request-validation-message[role=alert]");
			return Boolean(
				send?.disabled &&
				input?.getAttribute("aria-invalid") === "true" &&
				alert?.textContent?.trim()
			);
		})()`,
		"announced URL validation error",
	)
}

func (s *requestSteps) enterValidRequestURL() error {
	if err := requestSetValue(s.world, `[name="url"]`, requestTestURL, false); err != nil {
		return err
	}
	if err := requestBlur(s.world, `[name="url"]`); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`!document.querySelector(
			'[data-request-form] .send-button[type="submit"]'
		)?.disabled`,
		"enabled request send action",
	)
}

func (s *requestSteps) nextRequestFailsWithNetworkError() error {
	return requestConfigureBridgeCall(s.world, "SendRequest", map[string]any{
		"error": map[string]any{
			"code":    "network_error",
			"title":   "Network request failed",
			"message": "The fixture endpoint refused the connection.",
			"hint":    "Check the URL and try again.",
		},
	})
}

func (s *requestSteps) networkErrorAndRetryAreVisible() error {
	if err := requestWaitVisible(s.world, `.user-error-card[role="alert"]`); err != nil {
		return err
	}
	var result struct {
		Title   string `json:"title"`
		Message string `json:"message"`
		Retry   bool   `json:"retry"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const card = document.querySelector(".user-error-card");
			return {
				title: card?.querySelector("h3")?.textContent?.trim() || "",
				message: card?.querySelector("p")?.textContent?.trim() || "",
				retry: Boolean(card?.querySelector('[data-action="retry-request"]'))
			};
		})()`,
		&result,
	)); err != nil {
		return err
	}
	if result.Title == "" || result.Message == "" || !result.Retry {
		return fmt.Errorf("network failure is not actionable: %+v", result)
	}
	return nil
}

func (s *requestSteps) nextRequestWillSucceed() error {
	return requestConfigureBridgeCall(
		s.world,
		"SendRequest",
		requestResponseResult("rich JSON response", "POST", requestTestURL),
	)
}

func (s *requestSteps) retryActiveRequest() error {
	before, err := requestBridgeCallCount(s.world, "SendRequest")
	if err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-action="retry-request"]`); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter((call) => call.method === "SendRequest").length > %d`,
			before,
		),
		"retried native request",
	)
}

func (s *requestSteps) successfulResponseReplacesError() error {
	if err := requestWaitVisible(s.world, `.response-summary`); err != nil {
		return err
	}
	var replaced bool
	if err := s.world.run(chromedp.Evaluate(
		`Boolean(
			document.querySelector(".response-summary .status-mark")?.textContent.includes("200") &&
			!document.querySelector(".user-error-card")
		)`,
		&replaced,
	)); err != nil {
		return err
	}
	if !replaced {
		return fmt.Errorf("successful response did not replace the previous network error")
	}
	return nil
}

func (s *requestSteps) nextRequestRemainsInProgress() error {
	if err := s.haveEditableRequest(); err != nil {
		return err
	}
	s.sendIsDeferred = true
	return requestDeferBridgeCall(s.world, "SendRequest")
}

func (s *requestSteps) composerOffersCancelAndDisablesFields() error {
	var state struct {
		Cancel bool `json:"cancel"`
		Method bool `json:"method"`
		URL    bool `json:"url"`
		Save   bool `json:"save"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`({
			cancel: Boolean(document.querySelector('[data-action="cancel-request"]')),
			method: Boolean(document.querySelector('[name="method"]')?.disabled),
			url: Boolean(document.querySelector('[name="url"]')?.disabled),
			save: Boolean(document.querySelector('[data-action="save-request"]')?.disabled)
		})`,
		&state,
	)); err != nil {
		return err
	}
	if !state.Cancel || !state.Method || !state.URL || !state.Save {
		return fmt.Errorf("running composer remained mutable: %+v", state)
	}
	return nil
}

func (s *requestSteps) cancelActiveRequest() error {
	before, err := requestBridgeCallCount(s.world, "CancelRequest")
	if err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-action="cancel-request"]`); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter((call) => call.method === "CancelRequest").length > %d`,
			before,
		),
		"native CancelRequest call",
	); err != nil {
		return err
	}
	s.sendIsDeferred = false
	return requestWaitVisible(s.world, `.user-error-card.request-canceled`)
}

func (s *requestSteps) bridgeReceivesActiveRequestID() error {
	calls, err := requestBridgeCalls(s.world)
	if err != nil {
		return err
	}
	var sentID string
	var canceledID string
	for _, call := range calls {
		switch call.Method {
		case "SendRequest":
			var input struct {
				ID string `json:"id"`
			}
			if err := json.Unmarshal(call.Input, &input); err == nil {
				sentID = input.ID
			}
		case "CancelRequest":
			_ = json.Unmarshal(call.Input, &canceledID)
		}
	}
	if sentID == "" || canceledID == "" || sentID != canceledID {
		return fmt.Errorf(
			"bridge request identifiers differ: sent=%q canceled=%q",
			sentID,
			canceledID,
		)
	}
	return nil
}

func (s *requestSteps) canceledRequestIsReported() error {
	var canceled bool
	if err := s.world.run(chromedp.Evaluate(
		`Boolean(
			document.querySelector(".user-error-card.request-canceled[role=status]") &&
			!document.querySelector('[data-request-form][aria-busy="true"]')
		)`,
		&canceled,
	)); err != nil {
		return err
	}
	if !canceled {
		return fmt.Errorf("canceled request is not reported as a non-error status")
	}
	return s.applicationHasNoFrontendError()
}

func (s *requestSteps) canceledRequestCanBeSentAgain() error {
	var available bool
	if err := s.world.run(chromedp.Evaluate(
		`Boolean(
			document.querySelector(
				'[data-request-form] .send-button[type="submit"]:not(:disabled)'
			) &&
			document.querySelector('[data-action="retry-request"]')
		)`,
		&available,
	)); err != nil {
		return err
	}
	if !available {
		return fmt.Errorf("request actions did not recover after cancellation")
	}
	return nil
}

func (s *requestSteps) haveCleanAndDirtyRequestTabs() error {
	document := requestTabCollectionDocument()
	s.world.closePage()
	s.world.initialConfig = map[string]any{"collectionData": document}
	if err := s.world.openPage(); err != nil {
		return fmt.Errorf("reload request tab fixture: %w", err)
	}
	if err := collectionEnsureSidebarVisible(s.world); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		`document.querySelectorAll('[data-library-kind="request"] [data-action="open-saved-request"]').length === 3`,
		"three saved request entries",
	); err != nil {
		return err
	}
	for _, id := range []string{
		"request-tabs-health",
		"request-tabs-orders",
		"request-tabs-customers",
	} {
		if err := requestClick(
			s.world,
			fmt.Sprintf(
				`[data-action="open-saved-request"][data-library-item-id="%s"]`,
				id,
			),
		); err != nil {
			return err
		}
	}
	if err := requestClick(s.world, `[data-action="new-request"]`); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`document.querySelectorAll("[data-request-tab]").length === 4 &&
		 document.querySelectorAll(".request-tab .dirty-dot").length === 1`,
		"three clean tabs and one dirty tab",
	)
}

func (s *requestSteps) navigateRequestTabsWithKeyboard() error {
	ids, err := requestTabIDs(s.world)
	if err != nil {
		return err
	}
	if len(ids) != 4 {
		return fmt.Errorf("request tab count = %d, want 4", len(ids))
	}
	if err := s.world.run(
		chromedp.Focus(
			fmt.Sprintf(`[data-request-tab-button][data-tab-id="%s"]`, ids[0]),
			chromedp.ByQuery,
		),
		chromedp.KeyEvent(kb.ArrowRight),
	); err != nil {
		return err
	}
	if err := requestAssertActiveFocusedTab(s.world, ids[1]); err != nil {
		return fmt.Errorf("ArrowRight navigation: %w", err)
	}
	if err := s.world.run(chromedp.KeyEvent(kb.End)); err != nil {
		return err
	}
	if err := requestAssertActiveFocusedTab(s.world, ids[3]); err != nil {
		return fmt.Errorf("End navigation: %w", err)
	}
	if err := s.world.run(chromedp.KeyEvent(kb.Home)); err != nil {
		return err
	}
	if err := requestAssertActiveFocusedTab(s.world, ids[0]); err != nil {
		return fmt.Errorf("Home navigation: %w", err)
	}
	if err := s.world.run(chromedp.KeyEvent(kb.ArrowLeft)); err != nil {
		return err
	}
	if err := requestAssertActiveFocusedTab(s.world, ids[3]); err != nil {
		return fmt.Errorf("ArrowLeft navigation: %w", err)
	}
	s.keyboardNavigationOK = true
	return nil
}

func (s *requestSteps) focusAndActiveTabFollowKeyboard() error {
	if !s.keyboardNavigationOK {
		return fmt.Errorf("keyboard navigation did not keep focus and selection aligned")
	}
	return nil
}

func (s *requestSteps) reorderCleanTabWithKeyboard() error {
	ids, err := requestTabIDs(s.world)
	if err != nil {
		return err
	}
	if len(ids) < 3 {
		return fmt.Errorf("not enough request tabs to test reordering")
	}
	s.reorderedTabID = ids[1]
	s.reorderBefore = append([]string(nil), ids...)
	selector := fmt.Sprintf(
		`[data-request-tab-button][data-tab-id="%s"]`,
		s.reorderedTabID,
	)
	if err := s.world.run(
		chromedp.Focus(selector, chromedp.ByQuery),
		chromedp.KeyEvent(
			kb.ArrowLeft,
			chromedp.KeyModifiers(input.ModifierAlt, input.ModifierShift),
		),
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector("[data-request-tab]")?.getAttribute("data-request-tab") === %s`,
			requestJSON(s.reorderedTabID),
		),
		"keyboard tab reorder",
	); err != nil {
		return err
	}
	s.reorderAfter, err = requestTabIDs(s.world)
	if err != nil {
		return err
	}
	var focusID string
	if err := s.world.run(chromedp.Evaluate(
		`document.activeElement?.getAttribute("data-tab-id") || ""`,
		&focusID,
	)); err != nil {
		return err
	}
	s.reorderFocusOK = focusID == s.reorderedTabID
	return nil
}

func (s *requestSteps) tabOrderChangesAndFocusStays() error {
	if strings.Join(s.reorderBefore, "\x00") ==
		strings.Join(s.reorderAfter, "\x00") {
		return fmt.Errorf("request tab order did not change")
	}
	if len(s.reorderAfter) == 0 ||
		s.reorderAfter[0] != s.reorderedTabID ||
		!s.reorderFocusOK {
		return fmt.Errorf(
			"moved tab lost order or focus: id=%q before=%v after=%v focus=%t",
			s.reorderedTabID,
			s.reorderBefore,
			s.reorderAfter,
			s.reorderFocusOK,
		)
	}
	return nil
}

func (s *requestSteps) closeDirtyTabWithKeyboard() error {
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const dirty = document.querySelector(".request-tab .dirty-dot");
			const button = dirty?.closest("[data-request-tab-button]");
			button?.focus();
			return button?.getAttribute("data-tab-id") || "";
		})()`,
		&s.dirtyTabID,
	)); err != nil {
		return err
	}
	if s.dirtyTabID == "" {
		return fmt.Errorf("dirty request tab could not be resolved")
	}
	if err := s.world.run(chromedp.KeyEvent(kb.Delete)); err != nil {
		return err
	}
	return requestWaitVisible(s.world, `dialog.native-dialog [data-confirm]`)
}

func (s *requestSteps) discardConfirmationIsShown() error {
	var state struct {
		Open        bool   `json:"open"`
		Description string `json:"description"`
		Confirm     bool   `json:"confirm"`
		Cancel      bool   `json:"cancel"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const dialog = document.querySelector("dialog.native-dialog");
			return {
				open: Boolean(dialog?.open),
				description: dialog?.querySelector(".dialog-header p")?.textContent?.trim() || "",
				confirm: Boolean(dialog?.querySelector("[data-confirm]")),
				cancel: Boolean(dialog?.querySelector("[data-cancel]"))
			};
		})()`,
		&state,
	)); err != nil {
		return err
	}
	if !state.Open || state.Description == "" || !state.Confirm || !state.Cancel {
		return fmt.Errorf("discard confirmation is incomplete: %+v", state)
	}
	return nil
}

func (s *requestSteps) cancelDiscardConfirmation() error {
	if err := requestClick(s.world, `dialog.native-dialog [data-cancel]`); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`!document.querySelector("dialog.native-dialog")`,
		"closed discard confirmation",
	)
}

func (s *requestSteps) dirtyRequestTabRemainsOpen() error {
	selector := fmt.Sprintf(
		`[data-request-tab-button][data-tab-id="%s"]`,
		s.dirtyTabID,
	)
	var remains bool
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`Boolean(document.querySelector(%s)?.querySelector(".dirty-dot"))`,
			requestJSON(selector),
		),
		&remains,
	)); err != nil {
		return err
	}
	if !remains {
		return fmt.Errorf("dirty request tab was removed after canceling discard")
	}
	return nil
}

func requestResponseSection(view string) (string, bool) {
	sections := map[string]string{
		"Body":     "body",
		"Headers":  "headers",
		"Cookies":  "cookies",
		"Timeline": "timeline",
		"Raw":      "raw",
	}
	section, ok := sections[view]
	return section, ok
}

func requestEditorSection(section string) (string, bool) {
	sections := map[string]string{
		"Params":    "params",
		"Headers":   "headers",
		"Body":      "body",
		"Variables": "variables",
	}
	value, ok := sections[section]
	return value, ok
}

func requestFixtureFormat(fixture string) string {
	return map[string]string{
		"JSON document":  "JSON",
		"XML document":   "XML",
		"plain text":     "TEXT",
		"binary payload": "BASE64",
	}[fixture]
}

func requestResponseResult(fixture, method, url string) map[string]any {
	longValue := strings.Repeat("validex-e2e-", 32)
	body := fmt.Sprintf(
		"{\n  \"order\": {\n    \"id\": \"order-42\",\n    \"status\": \"READY\",\n    \"trace\": %q\n  },\n  \"items\": [{\"sku\":\"SKU-1\",\"quantity\":2}]\n}",
		longValue,
	)
	contentType := "application/json; charset=utf-8"
	bodyEncoding := "utf8"
	bodyKind := "json"
	bodyFormatted := true
	rawBody := "HTTP/2 200 OK\r\n" +
		"content-type: application/json; charset=utf-8\r\n" +
		"x-request-id: trace-e2e-42\r\n\r\n" +
		body

	switch fixture {
	case "rich JSON response":
	case "JSON document":
		body = fmt.Sprintf(`{"kind":"json","long":"%s","count":42}`, longValue)
		rawBody = body
		bodyFormatted = false
	case "XML document":
		contentType = "application/xml; charset=utf-8"
		bodyKind = "xml"
		body = fmt.Sprintf(
			`<?xml version="1.0"?><order trace="%s"><id>order-42</id></order>`,
			longValue,
		)
		rawBody = body
		bodyFormatted = false
	case "plain text":
		contentType = "text/plain; charset=utf-8"
		bodyKind = "text"
		body = "plain-response:" + longValue
		rawBody = body
		bodyFormatted = false
	case "binary payload":
		contentType = "application/octet-stream"
		bodyEncoding = "base64"
		bodyKind = "binary"
		body = strings.Repeat("QUJDREVGR0g=", 40)
		rawBody = body
		bodyFormatted = false
	default:
		body = fmt.Sprintf(`{"fixture":%q,"long":%q}`, fixture, longValue)
		rawBody = body
	}

	response := map[string]any{
		"requestId":     "request-e2e",
		"statusCode":    200,
		"status":        "OK",
		"durationMs":    42,
		"sizeBytes":     len(body),
		"contentType":   contentType,
		"protocol":      "HTTP/2",
		"remoteAddr":    "203.0.113.10:443",
		"tls":           "TLS 1.3",
		"traceId":       "trace-e2e-42",
		"body":          body,
		"rawBody":       rawBody,
		"bodyEncoding":  bodyEncoding,
		"bodyKind":      bodyKind,
		"bodyFormatted": bodyFormatted,
		"resolvedUrl":   url,
		"headers": map[string]any{
			"content-type":  []string{contentType},
			"cache-control": []string{"no-store"},
			"x-request-id":  []string{"trace-e2e-42"},
			"set-cookie": []string{
				"session=e2e; Path=/; HttpOnly; Secure",
			},
		},
		"cookies": []map[string]any{
			{
				"name":     "session",
				"value":    "e2e",
				"path":     "/",
				"domain":   "api.example.test",
				"httpOnly": true,
				"secure":   true,
			},
		},
		"timeline": []map[string]any{
			{
				"id":          "dns",
				"label":       "DNS",
				"durationMs":  5,
				"percent":     12,
				"description": "Resolved api.example.test",
			},
			{
				"id":          "connect",
				"label":       "Connect",
				"durationMs":  10,
				"percent":     24,
				"description": "TLS connection",
			},
			{
				"id":          "server",
				"label":       "Server",
				"durationMs":  27,
				"percent":     64,
				"description": "Waiting for response",
			},
		},
		"contract": map[string]any{
			"available": true,
			"ok":        true,
			"truncated": false,
			"method":    method,
			"path":      "/orders",
			"findings":  []any{},
		},
	}
	return map[string]any{"response": response}
}

func requestEnsureEditable(world *browserWorld) error {
	var exists bool
	if err := world.run(chromedp.Evaluate(
		`Boolean(document.querySelector("[data-request-form]"))`,
		&exists,
	)); err != nil {
		return err
	}
	if !exists {
		if err := requestClick(
			world,
			`[data-request-layout] [data-action="new-request"]`,
		); err != nil {
			return err
		}
	}
	return requestWaitVisible(world, `[data-request-form]`)
}

func requestSetValue(
	world *browserWorld,
	selector string,
	value string,
	change bool,
) error {
	var changed bool
	expression := fmt.Sprintf(
		`(() => {
			const element = document.querySelector(%s);
			if (!element) return false;
			element.focus();
			const prototype =
				element instanceof HTMLSelectElement ? HTMLSelectElement.prototype :
				element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
				HTMLInputElement.prototype;
			const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
			if (setter) setter.call(element, %s);
			else element.value = %s;
			element.dispatchEvent(new Event("input", { bubbles: true }));
			%s
			return element.value === %s;
		})()`,
		requestJSON(selector),
		requestJSON(value),
		requestJSON(value),
		map[bool]string{
			true:  `element.dispatchEvent(new Event("change", { bubbles: true }));`,
			false: ``,
		}[change],
		requestJSON(value),
	)
	if err := world.run(chromedp.Evaluate(expression, &changed)); err != nil {
		return err
	}
	if !changed {
		return fmt.Errorf("could not set %s to %q", selector, value)
	}
	return nil
}

func requestBlur(world *browserWorld, selector string) error {
	var blurred bool
	if err := world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`(() => {
				const element = document.querySelector(%s);
				if (!element) return false;
				element.focus();
				element.blur();
				return document.activeElement !== element;
			})()`,
			requestJSON(selector),
		),
		&blurred,
	)); err != nil {
		return err
	}
	if !blurred {
		return fmt.Errorf("could not blur %s", selector)
	}
	return nil
}

func requestClick(world *browserWorld, selector string) error {
	if err := requestWaitVisible(world, selector); err != nil {
		return err
	}
	return world.run(chromedp.Click(selector, chromedp.ByQuery))
}

func requestWaitVisible(world *browserWorld, selector string) error {
	return requestWaitFor(
		world,
		fmt.Sprintf(
			`(() => {
				const element = document.querySelector(%s);
				if (!element) return false;
				const style = getComputedStyle(element);
				const bounds = element.getBoundingClientRect();
				return style.visibility !== "hidden" &&
					style.display !== "none" &&
					!element.hidden &&
					bounds.width > 0 &&
					bounds.height > 0;
			})()`,
			requestJSON(selector),
		),
		"visible "+selector,
	)
}

func requestWaitFor(
	world *browserWorld,
	expression string,
	description string,
) error {
	var result bool
	if err := world.run(chromedp.Poll(
		expression,
		&result,
		chromedp.WithPollingInterval(25*time.Millisecond),
		chromedp.WithPollingTimeout(requestStepTimeout),
	)); err != nil {
		return fmt.Errorf("wait for %s: %w", description, err)
	}
	if !result {
		return fmt.Errorf("wait for %s returned false", description)
	}
	return nil
}

func requestConfigureBridgeCall(
	world *browserWorld,
	method string,
	value any,
) error {
	var configured bool
	if err := world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`(() => {
				globalThis.__VALIDEX_E2E__.configure({
					overrides: { [%s]: %s }
				});
				return true;
			})()`,
			requestJSON(method),
			requestJSON(value),
		),
		&configured,
	)); err != nil {
		return err
	}
	if !configured {
		return fmt.Errorf("could not configure bridge method %s", method)
	}
	return nil
}

func requestDeferBridgeCall(world *browserWorld, method string) error {
	var deferred bool
	if err := world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`(() => {
				globalThis.__VALIDEX_E2E__.defer(%s);
				return true;
			})()`,
			requestJSON(method),
		),
		&deferred,
	)); err != nil {
		return err
	}
	if !deferred {
		return fmt.Errorf("could not defer bridge method %s", method)
	}
	return nil
}

func requestResolveBridgeCall(
	world *browserWorld,
	method string,
	value any,
) error {
	var resolved bool
	if err := world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.resolve(%s, %s)`,
			requestJSON(method),
			requestJSON(value),
		),
		&resolved,
	)); err != nil {
		return err
	}
	if !resolved {
		return fmt.Errorf("bridge method %s had no pending call to resolve", method)
	}
	return nil
}

func requestBridgeCallCount(world *browserWorld, method string) (int, error) {
	var count int
	err := world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === %s
			).length`,
			requestJSON(method),
		),
		&count,
	))
	return count, err
}

func requestBridgeCalls(world *browserWorld) ([]requestBridgeCall, error) {
	var calls []requestBridgeCall
	err := world.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls`,
		&calls,
	))
	return calls, err
}

func requestAssertActiveFocusedTab(world *browserWorld, id string) error {
	return requestWaitFor(
		world,
		fmt.Sprintf(
			`(() => {
				const target = document.querySelector(
					'[data-request-tab-button][data-tab-id=%s]'
				);
				return target?.getAttribute("aria-selected") === "true" &&
					document.activeElement === target;
			})()`,
			requestJSON(id),
		),
		"active and focused request tab "+id,
	)
}

func requestTabIDs(world *browserWorld) ([]string, error) {
	var ids []string
	err := world.run(chromedp.Evaluate(
		`[...document.querySelectorAll("[data-request-tab]")]
			.map((tab) => tab.getAttribute("data-request-tab"))`,
		&ids,
	))
	return ids, err
}

func requestJSON(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(fmt.Sprintf("encode E2E JavaScript value: %v", err))
	}
	return string(encoded)
}

func requestTabCollectionDocument() string {
	const timestamp = "2026-07-29T12:00:00.000Z"
	document := map[string]any{
		"state": map[string]any{
			"collections": []map[string]any{
				{
					"id":        "collection-tabs",
					"name":      "Keyboard fixtures",
					"createdAt": timestamp,
					"updatedAt": timestamp,
					"sortOrder": 0,
				},
			},
			"requests": []map[string]any{
				requestSavedFixture(
					"request-tabs-health",
					"collection-tabs",
					"Health",
					"GET",
					"https://api.example.test/health",
					0,
				),
				requestSavedFixture(
					"request-tabs-orders",
					"collection-tabs",
					"Orders",
					"GET",
					requestTestURL,
					1,
				),
				requestSavedFixture(
					"request-tabs-customers",
					"collection-tabs",
					"Customers",
					"GET",
					"https://api.example.test/customers",
					2,
				),
			},
			"expandedCollectionIds": []string{"collection-tabs"},
		},
		"version": 1,
	}
	return requestJSON(document)
}

func requestSavedFixture(
	id string,
	collectionID string,
	name string,
	method string,
	url string,
	sortOrder int,
) map[string]any {
	const timestamp = "2026-07-29T12:00:00.000Z"
	return map[string]any{
		"id":            id,
		"collectionId":  collectionID,
		"name":          name,
		"method":        method,
		"url":           url,
		"headers":       []any{},
		"body":          "",
		"createdAt":     timestamp,
		"updatedAt":     timestamp,
		"sortOrder":     sortOrder,
		"literalValues": false,
	}
}
