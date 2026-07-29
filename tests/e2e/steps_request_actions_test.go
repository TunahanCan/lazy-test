package e2e

import (
	stdcontext "context"
	"fmt"
	"strings"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/chromedp"
	"github.com/cucumber/godog"
)

const (
	requestActionSecretKey   = "API_TOKEN"
	requestActionSecretValue = "secret-e2e-token"
	requestActionBodyCompact = `{"order":{"id":"order-42","ready":true},"items":[1,2]}`
	requestActionBodyPretty  = "{\n" +
		"  \"order\": {\n" +
		"    \"id\": \"order-42\",\n" +
		"    \"ready\": true\n" +
		"  },\n" +
		"  \"items\": [\n" +
		"    1,\n" +
		"    2\n" +
		"  ]\n" +
		"}"
	requestActionCurl = "curl --request POST --url " +
		"'https://api.example.test/orders?expand=items' " +
		"--header 'X-E2E: request-actions' " +
		"--data-raw '{\"sku\":\"SKU-1\",\"quantity\":2}'"
)

type requestActionSteps struct {
	world *browserWorld

	expectedClipboard     string
	expectedFocusSelector string
	contextRevealObserved bool
	renamedTabID          string
	duplicateTabID        string
	adjacentTabID         string
	bulkTargetTabID       string
	bulkDirtyTabID        string
}

func registerRequestActionSteps(
	context *godog.ScenarioContext,
	world *browserWorld,
) {
	steps := &requestActionSteps{world: world}
	context.Before(func(
		ctx stdcontext.Context,
		_ *godog.Scenario,
	) (stdcontext.Context, error) {
		*steps = requestActionSteps{world: world}
		return ctx, nil
	})

	context.Step(
		`^I have an editable request with two query rows and two header rows$`,
		steps.haveRequestWithQueryAndHeaderRows,
	)
	context.Step(`^I remove the first query row$`, steps.removeFirstQueryRow)
	context.Step(
		`^only the remaining query row is kept and its key receives focus$`,
		steps.remainingQueryRowIsFocused,
	)
	context.Step(`^I remove every header row$`, steps.removeEveryHeaderRow)
	context.Step(
		`^the header editor is empty and the add header action receives focus$`,
		steps.headerEditorIsEmptyAndAddFocused,
	)

	context.Step(
		`^I have a compact JSON request body$`,
		steps.haveCompactJSONRequestBody,
	)
	context.Step(`^I format the request body$`, steps.formatRequestBody)
	context.Step(
		`^the request body is pretty printed exactly and keeps editor focus$`,
		steps.requestBodyIsPrettyAndFocused,
	)
	context.Step(`^I minify the request body$`, steps.minifyRequestBody)
	context.Step(
		`^the request body is compacted exactly and keeps editor focus$`,
		steps.requestBodyIsCompactAndFocused,
	)

	context.Step(
		`^I am editing request variables in the Local environment$`,
		steps.editRequestVariablesInLocal,
	)
	context.Step(
		`^I add the secret variable "([^"]+)" with value "([^"]+)"$`,
		steps.addSecretVariable,
	)
	context.Step(
		`^the secret override is masked and focus returns to the new variable name$`,
		steps.secretOverrideIsMasked,
	)
	context.Step(
		`^I reveal the "([^"]+)" secret override$`,
		steps.revealSecretOverride,
	)
	context.Step(
		`^its exact value is visible and the secret input receives focus$`,
		steps.secretValueIsVisibleAndFocused,
	)
	context.Step(
		`^I hide the "([^"]+)" secret override$`,
		steps.hideSecretOverride,
	)
	context.Step(
		`^its value is masked again and the secret input receives focus$`,
		steps.secretValueIsMaskedAndFocused,
	)
	context.Step(
		`^I remove the "([^"]+)" secret override$`,
		steps.removeSecretOverride,
	)
	context.Step(
		`^the override is gone and focus moves to the remaining variable value$`,
		steps.secretOverrideIsGone,
	)

	context.Step(`^I copy the response body$`, steps.copyResponseBody)
	context.Step(
		`^the clipboard contains the exact response body and its copy action keeps focus$`,
		steps.clipboardContainsExpectedAndActionFocused,
	)
	context.Step(`^I copy the raw response$`, steps.copyRawResponse)
	context.Step(
		`^the clipboard contains the exact raw response and its copy action keeps focus$`,
		steps.clipboardContainsExpectedAndActionFocused,
	)
	context.Step(
		`^I copy the response trace identifier$`,
		steps.copyResponseTrace,
	)
	context.Step(
		`^the clipboard contains the exact trace identifier and its copy action keeps focus$`,
		steps.clipboardContainsExpectedAndActionFocused,
	)

	context.Step(
		`^I have a request populated for cURL export$`,
		steps.haveRequestForCurlExport,
	)
	context.Step(
		`^I choose Copy as cURL from the send options$`,
		steps.chooseCopyAsCurl,
	)
	context.Step(
		`^the clipboard contains the exact exported cURL command$`,
		steps.clipboardContainsExactCurl,
	)
	context.Step(
		`^the send options trigger regains focus$`,
		steps.sendOptionsTriggerHasFocus,
	)

	context.Step(
		`^I have a Local request context with a secret variable$`,
		steps.haveLocalRequestContext,
	)
	context.Step(
		`^I copy the ordinary variable from the context panel$`,
		steps.copyOrdinaryContextVariable,
	)
	context.Step(
		`^its exact value is copied and its copy action keeps focus$`,
		steps.clipboardContainsExpectedAndActionFocused,
	)
	context.Step(
		`^I copy the secret variable from the context panel$`,
		steps.copySecretContextVariable,
	)
	context.Step(
		`^only its exact variable reference is copied and its copy action keeps focus$`,
		steps.clipboardContainsExpectedAndActionFocused,
	)
	context.Step(
		`^I reveal and hide context panel secrets$`,
		steps.revealAndHideContextSecrets,
	)
	context.Step(
		`^the secret value is revealed, remasked, and the toggle keeps focus$`,
		steps.contextSecretWasRevealedAndRemasked,
	)
	context.Step(
		`^I add an Authorization header from the context panel$`,
		steps.addAuthorizationFromContext,
	)
	context.Step(
		`^a disabled safe Authorization template is added and the replacement action has focus$`,
		steps.authorizationTemplateIsSafeAndFocused,
	)
	context.Step(
		`^I open request headers from the context panel$`,
		steps.openHeadersFromContext,
	)
	context.Step(
		`^the Headers request section is active and the context action keeps focus$`,
		steps.headersSectionAndContextFocusAreActive,
	)

	context.Step(
		`^I have clean request tabs for context menu actions$`,
		steps.haveCleanContextMenuTabs,
	)
	context.Step(
		`^I rename the "([^"]+)" tab to "([^"]+)" from its context menu$`,
		steps.renameTabFromContextMenu,
	)
	context.Step(
		`^the renamed tab is dirty, active, and focused$`,
		steps.renamedTabIsDirtyActiveAndFocused,
	)
	context.Step(
		`^I pin and unpin the renamed tab from its context menu$`,
		steps.pinAndUnpinRenamedTab,
	)
	context.Step(
		`^the renamed tab is unpinned and focused$`,
		steps.renamedTabIsUnpinnedAndFocused,
	)
	context.Step(
		`^I duplicate the renamed tab from its context menu$`,
		steps.duplicateRenamedTab,
	)
	context.Step(
		`^an unsaved duplicate is active and focused$`,
		steps.unsavedDuplicateIsActiveAndFocused,
	)
	context.Step(
		`^I close the duplicate from its context menu and confirm discard$`,
		steps.closeDuplicateAndConfirm,
	)
	context.Step(
		`^the duplicate is removed and the adjacent clean tab receives focus$`,
		steps.duplicateIsRemovedAndAdjacentFocused,
	)

	context.Step(
		`^I have clean request tabs and a dirty draft for bulk close actions$`,
		steps.haveTabsForBulkClose,
	)
	context.Step(
		`^I choose Close other clean tabs on the "([^"]+)" tab$`,
		steps.closeOtherCleanTabs,
	)
	context.Step(
		`^only the chosen clean tab and dirty draft remain and the chosen tab has focus$`,
		steps.onlyChosenAndDirtyRemain,
	)
	context.Step(
		`^I choose Close clean tabs to the right of the "([^"]+)" tab$`,
		steps.closeCleanTabsToRight,
	)
	context.Step(
		`^the clean right tab is closed, left and dirty tabs remain, and the chosen tab has focus$`,
		steps.cleanRightTabIsClosed,
	)
}

func (s *requestActionSteps) haveRequestWithQueryAndHeaderRows() error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[name="url"]`,
		requestTestURL+"?first=1&second=2",
		false,
	); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-request-section="headers"]`); err != nil {
		return err
	}
	for index, pair := range [][2]string{
		{"X-First", "one"},
		{"X-Second", "two"},
	} {
		if err := requestClick(s.world, `[data-action="add-header"]`); err != nil {
			return err
		}
		if err := requestSetValue(
			s.world,
			fmt.Sprintf(
				`[data-header-row="%d"] [data-header-field="key"]`,
				index,
			),
			pair[0],
			false,
		); err != nil {
			return err
		}
		if err := requestSetValue(
			s.world,
			fmt.Sprintf(
				`[data-header-row="%d"] [data-header-field="value"]`,
				index,
			),
			pair[1],
			false,
		); err != nil {
			return err
		}
	}
	if err := requestClick(s.world, `[data-request-section="params"]`); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`document.querySelectorAll("[data-query-row]").length === 2`,
		"two query rows",
	)
}

func (s *requestActionSteps) removeFirstQueryRow() error {
	return requestClick(
		s.world,
		`[data-query-row="0"] [data-action="remove-query"]`,
	)
}

func (s *requestActionSteps) remainingQueryRowIsFocused() error {
	return requestWaitFor(
		s.world,
		`(() => {
			const rows = [...document.querySelectorAll("[data-query-row]")];
			const key = rows[0]?.querySelector('[data-query-field="key"]');
			const value = rows[0]?.querySelector('[data-query-field="value"]');
			const url = document.querySelector('[name="url"]');
			return rows.length === 1 &&
				key?.value === "second" &&
				value?.value === "2" &&
				url?.value === "https://api.example.test/orders?second=2" &&
				document.activeElement === key;
		})()`,
		"remaining query row state and focus",
	)
}

func (s *requestActionSteps) removeEveryHeaderRow() error {
	if err := requestClick(s.world, `[data-request-section="headers"]`); err != nil {
		return err
	}
	for expected := 2; expected > 0; expected-- {
		if err := requestWaitFor(
			s.world,
			fmt.Sprintf(
				`document.querySelectorAll("[data-header-row]").length === %d`,
				expected,
			),
			fmt.Sprintf("%d header rows", expected),
		); err != nil {
			return err
		}
		if err := requestClick(
			s.world,
			`[data-header-row="0"] [data-action="remove-header"]`,
		); err != nil {
			return err
		}
	}
	return nil
}

func (s *requestActionSteps) headerEditorIsEmptyAndAddFocused() error {
	return requestWaitFor(
		s.world,
		`(() => {
			const add = document.querySelector('[data-action="add-header"]');
			return document.querySelectorAll("[data-header-row]").length === 0 &&
				Boolean(document.querySelector(".request-headers-editor .editor-empty-state")) &&
				document.activeElement === add;
		})()`,
		"empty header editor and add-header focus",
	)
}

func (s *requestActionSteps) haveCompactJSONRequestBody() error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	if err := requestSetValue(s.world, `[name="method"]`, "POST", true); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-request-section="body"]`); err != nil {
		return err
	}
	return requestSetValue(
		s.world,
		`[name="body"]`,
		requestActionBodyCompact,
		false,
	)
}

func (s *requestActionSteps) formatRequestBody() error {
	return requestClick(s.world, `[data-action="format-body"]`)
}

func (s *requestActionSteps) requestBodyIsPrettyAndFocused() error {
	return requestActionAssertValueAndFocus(
		s.world,
		`[name="body"]`,
		requestActionBodyPretty,
		"pretty request body",
	)
}

func (s *requestActionSteps) minifyRequestBody() error {
	return requestClick(s.world, `[data-action="minify-body"]`)
}

func (s *requestActionSteps) requestBodyIsCompactAndFocused() error {
	return requestActionAssertValueAndFocus(
		s.world,
		`[name="body"]`,
		requestActionBodyCompact,
		"minified request body",
	)
}

func (s *requestActionSteps) editRequestVariablesInLocal() error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	if err := requestSetValue(s.world, `[data-environment]`, "local", true); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-request-section="variables"]`); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`document.querySelector("[data-environment]")?.value === "local" &&
		 Boolean(document.querySelector('[data-variable-row="baseUrl"]'))`,
		"Local request variable editor",
	)
}

func (s *requestActionSteps) addSecretVariable(key, value string) error {
	if key != requestActionSecretKey || value != requestActionSecretValue {
		return fmt.Errorf("unexpected secret fixture %q=%q", key, value)
	}
	if err := requestSetValue(
		s.world,
		`[data-new-variable-key]`,
		key,
		false,
	); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[data-new-variable-value]`,
		value,
		false,
	); err != nil {
		return err
	}
	return requestClick(s.world, `[data-action="add-variable"]`)
}

func (s *requestActionSteps) secretOverrideIsMasked() error {
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const row = document.querySelector('[data-variable-row=%s]');
				const value = row?.querySelector("[data-variable-value]");
				const remove = row?.querySelector('[data-action="remove-variable"]');
				return value?.type === "password" &&
					value.value === %s &&
					remove?.disabled === false &&
					document.activeElement?.hasAttribute("data-new-variable-key");
			})()`,
			requestJSON(requestActionSecretKey),
			requestJSON(requestActionSecretValue),
		),
		"masked secret override and new-variable focus",
	)
}

func (s *requestActionSteps) revealSecretOverride(key string) error {
	return requestActionClickSecretToggle(s.world, key)
}

func (s *requestActionSteps) secretValueIsVisibleAndFocused() error {
	return requestActionAssertSecretState(
		s.world,
		requestActionSecretKey,
		"text",
		true,
	)
}

func (s *requestActionSteps) hideSecretOverride(key string) error {
	return requestActionClickSecretToggle(s.world, key)
}

func (s *requestActionSteps) secretValueIsMaskedAndFocused() error {
	return requestActionAssertSecretState(
		s.world,
		requestActionSecretKey,
		"password",
		false,
	)
}

func (s *requestActionSteps) removeSecretOverride(key string) error {
	return requestClick(
		s.world,
		fmt.Sprintf(
			`[data-variable-row=%s] [data-action="remove-variable"]`,
			requestJSON(key),
		),
	)
}

func (s *requestActionSteps) secretOverrideIsGone() error {
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const removed = document.querySelector('[data-variable-row=%s]');
				const base = document.querySelector(
					'[data-variable-row="baseUrl"] [data-variable-value]'
				);
				return !removed && document.activeElement === base;
			})()`,
			requestJSON(requestActionSecretKey),
		),
		"removed secret override and remaining-variable focus",
	)
}

func (s *requestActionSteps) copyResponseBody() error {
	s.expectedClipboard = requestActionRichResponseField("body")
	s.expectedFocusSelector = `[data-action="copy-response"]`
	return requestClick(s.world, s.expectedFocusSelector)
}

func (s *requestActionSteps) copyRawResponse() error {
	if err := requestClick(s.world, `[data-response-section="raw"]`); err != nil {
		return err
	}
	s.expectedClipboard = requestActionRichResponseField("rawBody")
	s.expectedFocusSelector = `[data-action="copy-raw-response"]`
	return requestClick(s.world, s.expectedFocusSelector)
}

func (s *requestActionSteps) copyResponseTrace() error {
	s.expectedClipboard = requestActionRichResponseField("traceId")
	s.expectedFocusSelector = `[data-action="copy-trace"]`
	return requestClick(s.world, s.expectedFocusSelector)
}

func (s *requestActionSteps) clipboardContainsExpectedAndActionFocused() error {
	if s.expectedClipboard == "" || s.expectedFocusSelector == "" {
		return fmt.Errorf("clipboard expectation was not prepared")
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const action = document.querySelector(%s);
				return globalThis.__VALIDEX_E2E__.clipboard === %s &&
					document.activeElement === action;
			})()`,
			requestJSON(s.expectedFocusSelector),
			requestJSON(s.expectedClipboard),
		),
		"exact clipboard content and copy-action focus",
	)
}

func (s *requestActionSteps) haveRequestForCurlExport() error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	if err := requestSetValue(s.world, `[name="method"]`, "POST", true); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[name="url"]`,
		requestTestURL+"?expand=items",
		false,
	); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-request-section="headers"]`); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-action="add-header"]`); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[data-header-row="0"] [data-header-field="key"]`,
		"X-E2E",
		false,
	); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[data-header-row="0"] [data-header-field="value"]`,
		"request-actions",
		false,
	); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-request-section="body"]`); err != nil {
		return err
	}
	return requestSetValue(
		s.world,
		`[name="body"]`,
		`{"sku":"SKU-1","quantity":2}`,
		false,
	)
}

func (s *requestActionSteps) chooseCopyAsCurl() error {
	if err := requestClick(s.world, `[data-action="request-menu"]`); err != nil {
		return err
	}
	return requestActionChooseMenuItem(s.world, "Copy as cURL")
}

func (s *requestActionSteps) clipboardContainsExactCurl() error {
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.clipboard === %s`,
			requestJSON(requestActionCurl),
		),
		"exact exported cURL command",
	)
}

func (s *requestActionSteps) sendOptionsTriggerHasFocus() error {
	return requestActionAssertFocus(
		s.world,
		`[data-action="request-menu"]`,
		"send options trigger",
	)
}

func (s *requestActionSteps) haveLocalRequestContext() error {
	if err := s.editRequestVariablesInLocal(); err != nil {
		return err
	}
	if err := s.addSecretVariable(
		requestActionSecretKey,
		requestActionSecretValue,
	); err != nil {
		return err
	}
	if err := s.secretOverrideIsMasked(); err != nil {
		return err
	}
	if err := requestActionEnsureContextPanel(s.world); err != nil {
		return err
	}
	return requestWaitVisible(s.world, `#context-content-variables`)
}

func (s *requestActionSteps) copyOrdinaryContextVariable() error {
	s.expectedClipboard = "http://localhost:8080"
	s.expectedFocusSelector =
		`[data-action="copy-variable"][data-variable-key="baseUrl"]`
	return requestClick(s.world, s.expectedFocusSelector)
}

func (s *requestActionSteps) copySecretContextVariable() error {
	s.expectedClipboard = "{{" + requestActionSecretKey + "}}"
	s.expectedFocusSelector = fmt.Sprintf(
		`[data-action="copy-variable"][data-variable-key=%s]`,
		requestJSON(requestActionSecretKey),
	)
	return requestClick(s.world, s.expectedFocusSelector)
}

func (s *requestActionSteps) revealAndHideContextSecrets() error {
	const selector = `[data-action="toggle-secrets"]`
	if err := requestClick(s.world, selector); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const toggle = document.querySelector(%s);
				const copy = document.querySelector(
					'[data-action="copy-variable"][data-variable-key=%s]'
				);
				const value = copy?.closest(".variable-row")?.querySelector("span");
				return toggle?.getAttribute("aria-pressed") === "true" &&
					toggle?.getAttribute("data-state") === "revealed" &&
					value?.textContent?.trim() === %s &&
					document.activeElement === toggle;
			})()`,
			requestJSON(selector),
			requestJSON(requestActionSecretKey),
			requestJSON(requestActionSecretValue),
		),
		"revealed context secret and toggle focus",
	); err != nil {
		return err
	}
	s.contextRevealObserved = true
	return requestClick(s.world, selector)
}

func (s *requestActionSteps) contextSecretWasRevealedAndRemasked() error {
	if !s.contextRevealObserved {
		return fmt.Errorf("context secret was never observed in its revealed state")
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const toggle = document.querySelector('[data-action="toggle-secrets"]');
				const copy = document.querySelector(
					'[data-action="copy-variable"][data-variable-key=%s]'
				);
				const value = copy?.closest(".variable-row")?.querySelector("span");
				return toggle?.getAttribute("aria-pressed") === "false" &&
					toggle?.getAttribute("data-state") === "masked" &&
					value?.textContent?.trim() === "••••••••••••" &&
					value?.getAttribute("aria-label") === "Secret value hidden" &&
					document.activeElement === toggle;
			})()`,
			requestJSON(requestActionSecretKey),
		),
		"remasked context secret and toggle focus",
	)
}

func (s *requestActionSteps) addAuthorizationFromContext() error {
	if err := requestClick(s.world, `[data-context-view="auth"]`); err != nil {
		return err
	}
	if err := requestWaitVisible(
		s.world,
		`[data-action="add-authorization"]`,
	); err != nil {
		return err
	}
	return requestClick(s.world, `[data-action="add-authorization"]`)
}

func (s *requestActionSteps) authorizationTemplateIsSafeAndFocused() error {
	return requestWaitFor(
		s.world,
		`(() => {
			const rows = [...document.querySelectorAll("[data-header-row]")];
			const row = rows.find((candidate) =>
				candidate.querySelector('[data-header-field="key"]')?.value ===
					"Authorization"
			);
			const value = row?.querySelector('[data-header-field="value"]');
			const enabled = row?.querySelector('[data-header-field="enabled"]');
			const section = document.querySelector(
				'[data-request-section="headers"]'
			);
			const action = document.querySelector('[data-action="open-headers"]');
			return value?.value === "Bearer " &&
				enabled?.checked === false &&
				section?.getAttribute("aria-selected") === "true" &&
				document.activeElement === action;
		})()`,
		"safe Authorization template and replacement context focus",
	)
}

func (s *requestActionSteps) openHeadersFromContext() error {
	if err := requestClick(s.world, `[data-request-section="params"]`); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		`(() => {
			const params = document.querySelector(
				'[data-request-section="params"]'
			);
			return params?.getAttribute("aria-selected") === "true" &&
				document.activeElement === params;
		})()`,
		"settled Params section focus before context open-headers action",
	); err != nil {
		return err
	}
	return requestClick(s.world, `[data-action="open-headers"]`)
}

func (s *requestActionSteps) headersSectionAndContextFocusAreActive() error {
	return requestWaitFor(
		s.world,
		`(() => {
			const section = document.querySelector(
				'[data-request-section="headers"]'
			);
			const action = document.querySelector('[data-action="open-headers"]');
			return section?.getAttribute("aria-selected") === "true" &&
				section?.getAttribute("data-state") === "active" &&
				document.activeElement === action;
		})()`,
		"Headers section selection and context action focus",
	)
}

func (s *requestActionSteps) haveCleanContextMenuTabs() error {
	return requestActionLoadCleanTabs(s.world)
}

func (s *requestActionSteps) renameTabFromContextMenu(from, to string) error {
	tabID, err := requestActionTabIDByName(s.world, from)
	if err != nil {
		return err
	}
	s.renamedTabID = tabID
	if err := requestClick(
		s.world,
		fmt.Sprintf(`[data-request-tab-button][data-tab-id=%s]`, requestJSON(tabID)),
	); err != nil {
		return err
	}
	if err := requestAssertActiveFocusedTab(s.world, tabID); err != nil {
		return err
	}
	if err := requestActionOpenTabMenu(s.world, tabID); err != nil {
		return err
	}
	if err := requestActionChooseMenuItem(s.world, "Rename"); err != nil {
		return err
	}
	if err := requestWaitVisible(s.world, `[data-rename-form]`); err != nil {
		return err
	}
	if err := requestActionAssertFocus(
		s.world,
		`[data-rename-form] [name="requestName"]`,
		"rename dialog input",
	); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[data-rename-form] [name="requestName"]`,
		to,
		false,
	); err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`[data-rename-form] button[type="submit"]`,
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(
				'[data-request-tab-button][data-tab-id=%s] span'
			)?.textContent === %s`,
			requestJSON(tabID),
			requestJSON(to),
		),
		"renamed request tab",
	)
}

func (s *requestActionSteps) renamedTabIsDirtyActiveAndFocused() error {
	if s.renamedTabID == "" {
		return fmt.Errorf("renamed tab identifier is missing")
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`Boolean(document.querySelector(
				'[data-request-tab-button][data-tab-id=%s] .dirty-dot'
			))`,
			requestJSON(s.renamedTabID),
		),
		"renamed tab dirty marker",
	); err != nil {
		return err
	}
	return requestAssertActiveFocusedTab(s.world, s.renamedTabID)
}

func (s *requestActionSteps) pinAndUnpinRenamedTab() error {
	if err := requestActionOpenTabMenu(s.world, s.renamedTabID); err != nil {
		return err
	}
	if err := requestActionChooseMenuItem(s.world, "Pin tab"); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(
				'[data-request-tab=%s]'
			)?.classList.contains("pinned") === true`,
			requestJSON(s.renamedTabID),
		),
		"pinned renamed tab",
	); err != nil {
		return err
	}
	if err := requestActionOpenTabMenu(s.world, s.renamedTabID); err != nil {
		return err
	}
	if err := requestActionChooseMenuItem(s.world, "Unpin tab"); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(
				'[data-request-tab=%s]'
			)?.classList.contains("pinned") === false`,
			requestJSON(s.renamedTabID),
		),
		"unpinned renamed tab",
	)
}

func (s *requestActionSteps) renamedTabIsUnpinnedAndFocused() error {
	var unpinned bool
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`(() => {
				const tab = document.querySelector('[data-request-tab=%s]');
				return Boolean(tab) &&
					!tab.classList.contains("pinned") &&
					Boolean(tab.querySelector('[data-action="close-tab"]'));
			})()`,
			requestJSON(s.renamedTabID),
		),
		&unpinned,
	)); err != nil {
		return err
	}
	if !unpinned {
		return fmt.Errorf("renamed tab did not return to its unpinned state")
	}
	return requestAssertActiveFocusedTab(s.world, s.renamedTabID)
}

func (s *requestActionSteps) duplicateRenamedTab() error {
	before, err := requestTabIDs(s.world)
	if err != nil {
		return err
	}
	if err := requestActionOpenTabMenu(s.world, s.renamedTabID); err != nil {
		return err
	}
	if err := requestActionChooseMenuItem(s.world, "Duplicate"); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelectorAll("[data-request-tab]").length === %d`,
			len(before)+1,
		),
		"duplicated request tab",
	); err != nil {
		return err
	}
	if err := s.world.run(chromedp.Evaluate(
		`document.querySelector(
			'[data-request-tab-button][aria-selected="true"]'
		)?.getAttribute("data-tab-id") || ""`,
		&s.duplicateTabID,
	)); err != nil {
		return err
	}
	if s.duplicateTabID == "" || s.duplicateTabID == s.renamedTabID {
		return fmt.Errorf(
			"duplicate tab ID %q is not distinct from source %q",
			s.duplicateTabID,
			s.renamedTabID,
		)
	}
	return nil
}

func (s *requestActionSteps) unsavedDuplicateIsActiveAndFocused() error {
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const tab = document.querySelector(
					'[data-request-tab-button][data-tab-id=%s]'
				);
				return tab?.querySelector("span")?.textContent ===
						"Orders renamed copy" &&
					Boolean(tab.querySelector(".dirty-dot")) &&
					tab.getAttribute("aria-selected") === "true";
			})()`,
			requestJSON(s.duplicateTabID),
		),
		"unsaved active duplicate",
	); err != nil {
		return err
	}
	return requestAssertActiveFocusedTab(s.world, s.duplicateTabID)
}

func (s *requestActionSteps) closeDuplicateAndConfirm() error {
	ids, err := requestTabIDs(s.world)
	if err != nil {
		return err
	}
	index := requestActionIndex(ids, s.duplicateTabID)
	if index < 0 {
		return fmt.Errorf("duplicate tab %q is not open", s.duplicateTabID)
	}
	if index > 0 {
		s.adjacentTabID = ids[index-1]
	} else if len(ids) > 1 {
		s.adjacentTabID = ids[1]
	}
	if err := requestActionOpenTabMenu(s.world, s.duplicateTabID); err != nil {
		return err
	}
	if err := requestActionChooseMenuItem(s.world, "Close tab"); err != nil {
		return err
	}
	if err := requestWaitVisible(
		s.world,
		`dialog.native-dialog [data-confirm]`,
	); err != nil {
		return err
	}
	return requestClick(s.world, `dialog.native-dialog [data-confirm]`)
}

func (s *requestActionSteps) duplicateIsRemovedAndAdjacentFocused() error {
	if s.adjacentTabID == "" {
		return fmt.Errorf("adjacent fallback tab identifier is missing")
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`!document.querySelector(
				'[data-request-tab-button][data-tab-id=%s]'
			) && !document.querySelector("dialog.native-dialog")`,
			requestJSON(s.duplicateTabID),
		),
		"closed duplicate and dismissed discard dialog",
	); err != nil {
		return err
	}
	return requestAssertActiveFocusedTab(s.world, s.adjacentTabID)
}

func (s *requestActionSteps) haveTabsForBulkClose() error {
	if err := requestActionLoadCleanTabs(s.world); err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`[data-request-workspace] [data-action="new-request"]`,
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		`document.querySelectorAll("[data-request-tab]").length === 4 &&
		 document.querySelectorAll(".request-tab .dirty-dot").length === 1`,
		"three clean request tabs and a dirty draft",
	); err != nil {
		return err
	}
	return s.world.run(chromedp.Evaluate(
		`document.querySelector(
			'[data-request-tab-button][aria-selected="true"]'
		)?.getAttribute("data-tab-id") || ""`,
		&s.bulkDirtyTabID,
	))
}

func (s *requestActionSteps) closeOtherCleanTabs(name string) error {
	tabID, err := requestActionTabIDByName(s.world, name)
	if err != nil {
		return err
	}
	s.bulkTargetTabID = tabID
	if err := requestClick(
		s.world,
		fmt.Sprintf(`[data-request-tab-button][data-tab-id=%s]`, requestJSON(tabID)),
	); err != nil {
		return err
	}
	if err := requestActionOpenTabMenu(s.world, tabID); err != nil {
		return err
	}
	return requestActionChooseMenuItem(s.world, "Close other clean tabs")
}

func (s *requestActionSteps) onlyChosenAndDirtyRemain() error {
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const ids = [...document.querySelectorAll("[data-request-tab]")]
					.map((tab) => tab.getAttribute("data-request-tab"));
				return ids.length === 2 &&
					ids.includes(%s) &&
					ids.includes(%s) &&
					document.querySelectorAll(".request-tab .dirty-dot").length === 1;
			})()`,
			requestJSON(s.bulkTargetTabID),
			requestJSON(s.bulkDirtyTabID),
		),
		"chosen clean tab and dirty draft after bulk close",
	); err != nil {
		return err
	}
	return requestAssertActiveFocusedTab(s.world, s.bulkTargetTabID)
}

func (s *requestActionSteps) closeCleanTabsToRight(name string) error {
	tabID, err := requestActionTabIDByName(s.world, name)
	if err != nil {
		return err
	}
	s.bulkTargetTabID = tabID
	if err := requestClick(
		s.world,
		fmt.Sprintf(`[data-request-tab-button][data-tab-id=%s]`, requestJSON(tabID)),
	); err != nil {
		return err
	}
	if err := requestActionOpenTabMenu(s.world, tabID); err != nil {
		return err
	}
	return requestActionChooseMenuItem(
		s.world,
		"Close clean tabs to the right",
	)
}

func (s *requestActionSteps) cleanRightTabIsClosed() error {
	healthID, err := requestActionTabIDByName(s.world, "Health")
	if err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const ids = [...document.querySelectorAll("[data-request-tab]")]
					.map((tab) => tab.getAttribute("data-request-tab"));
				return ids.length === 3 &&
					ids.includes(%s) &&
					ids.includes(%s) &&
					ids.includes(%s) &&
					![...document.querySelectorAll(
						"[data-request-tab-button] span"
					)].some((name) => name.textContent === "Customers") &&
					document.querySelectorAll(".request-tab .dirty-dot").length === 1;
			})()`,
			requestJSON(healthID),
			requestJSON(s.bulkTargetTabID),
			requestJSON(s.bulkDirtyTabID),
		),
		"left, target, and dirty tabs after close-to-right",
	); err != nil {
		return err
	}
	return requestAssertActiveFocusedTab(s.world, s.bulkTargetTabID)
}

func requestActionAssertValueAndFocus(
	world *browserWorld,
	selector string,
	value string,
	description string,
) error {
	return requestWaitFor(
		world,
		fmt.Sprintf(
			`(() => {
				const control = document.querySelector(%s);
				return control?.value === %s && document.activeElement === control;
			})()`,
			requestJSON(selector),
			requestJSON(value),
		),
		description+" and focus",
	)
}

func requestActionClickSecretToggle(world *browserWorld, key string) error {
	if key != requestActionSecretKey {
		return fmt.Errorf("unexpected secret key %q", key)
	}
	return requestClick(
		world,
		fmt.Sprintf(
			`[data-variable-row=%s] [data-action="toggle-variable-secret"]`,
			requestJSON(key),
		),
	)
}

func requestActionAssertSecretState(
	world *browserWorld,
	key string,
	inputType string,
	revealed bool,
) error {
	return requestWaitFor(
		world,
		fmt.Sprintf(
			`(() => {
				const row = document.querySelector('[data-variable-row=%s]');
				const value = row?.querySelector("[data-variable-value]");
				const toggle = row?.querySelector(
					'[data-action="toggle-variable-secret"]'
				);
				return value?.type === %s &&
					value.value === %s &&
					toggle?.getAttribute("aria-pressed") === %s &&
					document.activeElement === value;
			})()`,
			requestJSON(key),
			requestJSON(inputType),
			requestJSON(requestActionSecretValue),
			requestJSON(fmt.Sprintf("%t", revealed)),
		),
		fmt.Sprintf("%s secret state and input focus", inputType),
	)
}

func requestActionRichResponseField(field string) string {
	result := requestResponseResult("rich JSON response", "GET", requestTestURL)
	response, _ := result["response"].(map[string]any)
	value, _ := response[field].(string)
	return value
}

func requestActionEnsureContextPanel(world *browserWorld) error {
	var visible bool
	if err := world.run(chromedp.Evaluate(
		`document.querySelector("[data-right-panel]")?.getAttribute("aria-hidden") === "false"`,
		&visible,
	)); err != nil {
		return err
	}
	if !visible {
		if err := requestClick(world, `[data-action="restore-right"]`); err != nil {
			return err
		}
	}
	return requestWaitFor(
		world,
		`document.querySelector("[data-right-panel]")?.getAttribute("aria-hidden") === "false" &&
		 !document.querySelector("[data-right-panel]")?.hasAttribute("inert")`,
		"visible interactive context panel",
	)
}

func requestActionAssertFocus(
	world *browserWorld,
	selector string,
	description string,
) error {
	return requestWaitFor(
		world,
		fmt.Sprintf(
			`document.activeElement === document.querySelector(%s)`,
			requestJSON(selector),
		),
		description+" focus",
	)
}

func requestActionLoadCleanTabs(world *browserWorld) error {
	world.closePage()
	world.initialConfig = map[string]any{
		"collectionData": requestTabCollectionDocument(),
	}
	if err := world.openPage(); err != nil {
		return fmt.Errorf("reload clean request-tab fixture: %w", err)
	}
	if err := collectionEnsureSidebarVisible(world); err != nil {
		return err
	}
	if err := requestWaitFor(
		world,
		`document.querySelectorAll(
			'[data-library-kind="request"] [data-action="open-saved-request"]'
		).length === 3`,
		"three saved requests for context-menu actions",
	); err != nil {
		return err
	}
	for _, id := range []string{
		"request-tabs-health",
		"request-tabs-orders",
		"request-tabs-customers",
	} {
		if err := requestClick(
			world,
			fmt.Sprintf(
				`[data-action="open-saved-request"][data-library-item-id=%s]`,
				requestJSON(id),
			),
		); err != nil {
			return err
		}
	}
	return requestWaitFor(
		world,
		`document.querySelectorAll("[data-request-tab]").length === 3 &&
		 document.querySelectorAll(".request-tab .dirty-dot").length === 0`,
		"three clean open request tabs",
	)
}

func requestActionTabIDByName(
	world *browserWorld,
	name string,
) (string, error) {
	var tabID string
	if err := world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`[...document.querySelectorAll("[data-request-tab-button]")]
				.find((button) => button.querySelector("span")?.textContent === %s)
				?.getAttribute("data-tab-id") || ""`,
			requestJSON(name),
		),
		&tabID,
	)); err != nil {
		return "", err
	}
	if tabID == "" {
		return "", fmt.Errorf("request tab named %q was not found", name)
	}
	return tabID, nil
}

func requestActionOpenTabMenu(world *browserWorld, tabID string) error {
	selector := fmt.Sprintf(
		`[data-request-tab-button][data-tab-id=%s]`,
		requestJSON(tabID),
	)
	if err := requestWaitVisible(world, selector); err != nil {
		return err
	}
	if err := world.run(chromedp.Focus(selector, chromedp.ByQuery)); err != nil {
		return err
	}
	var nodes []*cdp.Node
	if err := world.run(chromedp.Nodes(
		selector,
		&nodes,
		chromedp.ByQuery,
		chromedp.AtLeast(1),
	)); err != nil {
		return err
	}
	if len(nodes) == 0 {
		return fmt.Errorf("request tab %q has no browser node", tabID)
	}
	if err := world.run(chromedp.MouseClickNode(
		nodes[0],
		chromedp.ButtonRight,
	)); err != nil {
		return err
	}
	return requestWaitVisible(world, `[role="menu"].native-menu`)
}

func requestActionChooseMenuItem(
	world *browserWorld,
	label string,
) error {
	if err := requestWaitFor(
		world,
		fmt.Sprintf(
			`[...document.querySelectorAll(
				'[role="menu"].native-menu [role="menuitem"]'
			)].some((item) =>
				item.textContent?.trim() === %s && !item.disabled
			)`,
			requestJSON(label),
		),
		"enabled menu item "+label,
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		world,
		`Boolean(
			document.activeElement?.matches('[role="menuitem"]') &&
			document.activeElement?.closest('[role="menu"].native-menu')
		)`,
		"initial menu focus",
	); err != nil {
		return err
	}
	var index string
	if err := world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`[...document.querySelectorAll(
				'[role="menu"].native-menu [role="menuitem"]'
			)].find((item) => item.textContent?.trim() === %s)
				?.getAttribute("data-menu-index") || ""`,
			requestJSON(label),
		),
		&index,
	)); err != nil {
		return err
	}
	if strings.TrimSpace(index) == "" {
		return fmt.Errorf("menu item %q has no action index", label)
	}
	selector := fmt.Sprintf(
		`[role="menu"].native-menu [data-menu-index=%s]`,
		requestJSON(index),
	)
	if err := world.run(chromedp.Focus(selector, chromedp.ByQuery)); err != nil {
		return err
	}
	if err := requestActionAssertFocus(
		world,
		selector,
		"menu item "+label,
	); err != nil {
		return err
	}
	if err := requestClick(world, selector); err != nil {
		return err
	}
	return requestWaitFor(
		world,
		`!document.querySelector('[role="menu"].native-menu')`,
		"closed menu after "+label,
	)
}

func requestActionIndex(values []string, target string) int {
	for index, value := range values {
		if value == target {
			return index
		}
	}
	return -1
}
