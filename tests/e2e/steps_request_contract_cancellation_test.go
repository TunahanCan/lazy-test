package e2e

import (
	stdcontext "context"
	"encoding/json"
	"fmt"

	"github.com/chromedp/chromedp"
	"github.com/chromedp/chromedp/kb"
	"github.com/cucumber/godog"
)

const (
	contractSpecID      = "orders-api"
	contractPath        = "/orders"
	contractContentType = "application/json; charset=utf-8"
)

type requestContractCancellationSteps struct {
	world *browserWorld

	importedTabID       string
	manualTabID         string
	firstRunningTabID   string
	secondRunningTabID  string
	pendingRequestID    string
	expectedMarker      string
	bufferedEditedURL   string
	cancellationOutcome string
}

type contractValidationCall struct {
	SpecID       string `json:"specId"`
	Method       string `json:"method"`
	Path         string `json:"path"`
	StatusCode   int    `json:"statusCode"`
	ContentType  string `json:"contentType"`
	Body         string `json:"body"`
	BodyEncoding string `json:"bodyEncoding"`
}

func registerRequestContractCancellationSteps(
	context *godog.ScenarioContext,
	world *browserWorld,
) {
	steps := &requestContractCancellationSteps{world: world}
	context.Before(func(
		ctx stdcontext.Context,
		_ *godog.Scenario,
	) (stdcontext.Context, error) {
		*steps = requestContractCancellationSteps{world: world}
		return ctx, nil
	})

	context.Step(
		`^the imported Orders OpenAPI endpoint is open$`,
		steps.importedOrdersEndpointIsOpen,
	)
	context.Step(
		`^OpenAPI validation will return "([^"]+)"$`,
		steps.openAPIValidationWillReturn,
	)
	context.Step(
		`^I send the imported endpoint contract fixture$`,
		steps.sendImportedEndpointContractFixture,
	)
	context.Step(
		`^the validator receives the exact imported response envelope$`,
		steps.validatorReceivesExactResponseEnvelope,
	)
	context.Step(
		`^the Contract response section shows "([^"]+)"$`,
		steps.contractResponseSectionShows,
	)
	context.Step(
		`^OpenAPI validation will reject$`,
		steps.openAPIValidationWillReject,
	)
	context.Step(
		`^the Contract response section explains the validation failure$`,
		steps.contractSectionExplainsValidationFailure,
	)
	context.Step(
		`^the HTTP response remains available$`,
		steps.httpResponseRemainsAvailable,
	)
	context.Step(
		`^OpenAPI validation is deferred$`,
		steps.openAPIValidationIsDeferred,
	)
	context.Step(
		`^I change the imported request URL while validation is pending$`,
		steps.changeImportedURLWhileValidationIsPending,
	)
	context.Step(
		`^the stale URL validation completes with findings$`,
		steps.staleURLValidationCompletesWithFindings,
	)
	context.Step(
		`^the stale URL validation does not annotate the current response$`,
		steps.staleURLValidationDoesNotAnnotateResponse,
	)
	context.Step(
		`^I edit the imported URL without blurring and immediately complete validation$`,
		steps.editImportedURLWithoutBlurringAndImmediatelyCompleteValidation,
	)
	context.Step(
		`^the immediate stale validation never annotates the buffered URL edit$`,
		steps.immediateStaleValidationNeverAnnotatesBufferedURLEdit,
	)
	context.Step(
		`^I bulk-close and reopen the imported endpoint while validation is pending$`,
		steps.bulkCloseAndReopenImportedEndpoint,
	)
	context.Step(
		`^I send the reopened imported response named "([^"]+)"$`,
		steps.sendReopenedImportedResponseNamed,
	)
	context.Step(
		`^the "([^"]+)" imported validation completes with findings$`,
		steps.importedValidationCompletesWithFindings,
	)
	context.Step(
		`^the reopened imported tab keeps the "([^"]+)" response without the retired contract$`,
		steps.reopenedImportedTabKeepsCurrentResponse,
	)
	context.Step(
		`^I send the imported response named "([^"]+)"$`,
		steps.sendImportedResponseNamed,
	)
	context.Step(
		`^I send a newer imported response named "([^"]+)"$`,
		steps.sendNewerImportedResponseNamed,
	)
	context.Step(
		`^I open and send a manual request named "([^"]+)"$`,
		steps.openAndSendManualRequestNamed,
	)
	context.Step(
		`^the current imported validation completes$`,
		steps.currentImportedValidationCompletes,
	)
	context.Step(
		`^the manual tab still shows the "([^"]+)" response$`,
		steps.manualTabStillShowsResponse,
	)
	context.Step(
		`^the older imported validation completes$`,
		steps.olderImportedValidationCompletes,
	)
	context.Step(
		`^the imported tab shows the "([^"]+)" response and current contract$`,
		steps.importedTabShowsCurrentResponseAndContract,
	)
	context.Step(
		`^two request tabs are concurrently waiting for native responses$`,
		steps.twoTabsWaitForNativeResponses,
	)
	context.Step(
		`^I press Escape on the second running tab$`,
		steps.pressEscapeOnSecondRunningTab,
	)
	context.Step(
		`^exactly one cancellation targets the second request ID$`,
		steps.exactlyOneCancellationTargetsSecondRequest,
	)
	context.Step(
		`^the first request remains running$`,
		steps.firstRequestRemainsRunning,
	)
	context.Step(
		`^I activate the first running tab and press Escape$`,
		steps.activateFirstTabAndPressEscape,
	)
	context.Step(
		`^exactly one cancellation targets the first request ID$`,
		steps.exactlyOneCancellationTargetsFirstRequest,
	)
	context.Step(
		`^both request tabs can recover independently$`,
		steps.bothRequestTabsRecoverIndependently,
	)
	context.Step(
		`^a request is waiting for a native response$`,
		steps.requestWaitsForNativeResponse,
	)
	context.Step(
		`^native cancellation will "([^"]+)"$`,
		steps.nativeCancellationWill,
	)
	context.Step(
		`^I press Escape on the running request$`,
		steps.pressEscapeOnRunningRequest,
	)
	context.Step(
		`^cancellation "([^"]+)" is actionable and sending recovers$`,
		steps.cancellationIsActionableAndSendingRecovers,
	)
	context.Step(
		`^the late native response completes$`,
		steps.lateNativeResponseCompletes,
	)
	context.Step(
		`^the late response cannot replace the cancellation result$`,
		steps.lateResponseCannotReplaceCancellationResult,
	)
	context.Step(
		`^I start a newer imported request that waits for its response$`,
		steps.startNewerImportedRequestWaitingForResponse,
	)
	context.Step(
		`^the pre-cancel contract validation completes$`,
		steps.preCancelContractValidationCompletes,
	)
	context.Step(
		`^the canceled response remains current without a stale contract$`,
		steps.canceledResponseRemainsWithoutStaleContract,
	)
}

func (s *requestContractCancellationSteps) importedOrdersEndpointIsOpen() error {
	if err := requestConfigureBridgeCall(
		s.world,
		"ImportOpenAPI",
		contractImportResult(),
	); err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`[data-request-layout] [data-action="import-openapi"]`,
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		`document.querySelector(".sidebar-source strong")?.textContent.trim() === "Orders API" &&
		 document.querySelectorAll('[data-action="open-api"]').length === 1`,
		"imported Orders endpoint",
	); err != nil {
		return err
	}
	if err := s.world.run(chromedp.Evaluate(
		`document.querySelector('[data-action="open-api"]')?.getAttribute("data-api-id") || ""`,
		&s.importedTabID,
	)); err != nil {
		return err
	}
	if s.importedTabID == "" {
		return fmt.Errorf("imported Orders endpoint did not expose a tab ID")
	}
	if err := requestClick(
		s.world,
		fmt.Sprintf(
			`[data-action="open-api"][data-api-id=%s]`,
			requestJSON(s.importedTabID),
		),
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector('[data-request-tab-button][data-tab-id=%s]')?.getAttribute("aria-selected") === "true" &&
			 document.querySelector('[name="method"]')?.value === "GET" &&
			 document.querySelector('[name="url"]')?.value === %s`,
			requestJSON(s.importedTabID),
			requestJSON(requestTestURL),
		),
		"opened imported Orders request",
	)
}

func (s *requestContractCancellationSteps) openAPIValidationWillReturn(
	outcome string,
) error {
	result, err := contractOutcome(outcome)
	if err != nil {
		return err
	}
	return requestConfigureBridgeCall(
		s.world,
		"ValidateOpenAPIResponse",
		result,
	)
}

func (s *requestContractCancellationSteps) sendImportedEndpointContractFixture() error {
	return s.sendImported("contract-fixture")
}

func (s *requestContractCancellationSteps) validatorReceivesExactResponseEnvelope() error {
	calls, err := requestBridgeCalls(s.world)
	if err != nil {
		return err
	}
	var validationCalls []contractValidationCall
	for _, call := range calls {
		if call.Method != "ValidateOpenAPIResponse" {
			continue
		}
		var input contractValidationCall
		if err := json.Unmarshal(call.Input, &input); err != nil {
			return fmt.Errorf("decode ValidateOpenAPIResponse input: %w", err)
		}
		validationCalls = append(validationCalls, input)
	}
	if len(validationCalls) != 1 {
		return fmt.Errorf(
			"ValidateOpenAPIResponse call count = %d, want 1",
			len(validationCalls),
		)
	}
	got := validationCalls[0]
	want := contractValidationCall{
		SpecID:       contractSpecID,
		Method:       "GET",
		Path:         contractPath,
		StatusCode:   200,
		ContentType:  contractContentType,
		Body:         contractRawBody(s.expectedMarker),
		BodyEncoding: "utf8",
	}
	if got != want {
		return fmt.Errorf(
			"ValidateOpenAPIResponse input = %+v, want %+v (body must be response.rawBody)",
			got,
			want,
		)
	}
	return nil
}

func (s *requestContractCancellationSteps) contractResponseSectionShows(
	outcome string,
) error {
	if err := s.openContractSection(); err != nil {
		return err
	}
	switch outcome {
	case "success":
		return requestWaitFor(
			s.world,
			`document.querySelector(".contract-ok")?.textContent.includes(
				"Response matches the OpenAPI contract"
			) &&
			document.querySelector(".contract-ok")?.textContent.includes("GET /orders") &&
			!document.querySelector(".contract-findings")`,
			"successful OpenAPI contract",
		)
	case "findings":
		return requestWaitFor(
			s.world,
			`document.querySelector(".contract-drift")?.textContent.includes(
				"contract difference"
			) &&
			document.querySelectorAll(
				".contract-table .contract-row:not(.contract-header)"
			).length === 1 &&
			document.querySelector(".contract-table")?.textContent.includes("$.state") &&
			document.querySelector(".contract-table")?.textContent.includes("READY") &&
			document.querySelector(".contract-table")?.textContent.includes("UNKNOWN")`,
			"OpenAPI contract findings",
		)
	default:
		return fmt.Errorf("unknown contract outcome %q", outcome)
	}
}

func (s *requestContractCancellationSteps) openAPIValidationWillReject() error {
	return requestConfigureBridgeCall(
		s.world,
		"ValidateOpenAPIResponse",
		map[string]any{"__reject": "validator fixture unavailable"},
	)
}

func (s *requestContractCancellationSteps) contractSectionExplainsValidationFailure() error {
	if err := s.openContractSection(); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`document.querySelector(".contract-unavailable")?.textContent.includes(
			"Contract check couldn"
		) &&
		document.querySelector(".contract-unavailable")?.textContent.includes(
			"validator fixture unavailable"
		)`,
		"actionable contract validation rejection",
	)
}

func (s *requestContractCancellationSteps) httpResponseRemainsAvailable() error {
	if err := requestClick(s.world, `[data-response-section="body"]`); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(".status-mark")?.textContent.includes("200") &&
			 document.querySelector(".response-code")?.textContent.includes(%s)`,
			requestJSON(s.expectedMarker),
		),
		"HTTP response after contract rejection",
	)
}

func (s *requestContractCancellationSteps) openAPIValidationIsDeferred() error {
	return requestDeferBridgeCall(s.world, "ValidateOpenAPIResponse")
}

func (s *requestContractCancellationSteps) changeImportedURLWhileValidationIsPending() error {
	if err := requestWaitFor(
		s.world,
		`globalThis.__VALIDEX_E2E__.pendingCount("ValidateOpenAPIResponse") === 1`,
		"pending OpenAPI validation before URL edit",
	); err != nil {
		return err
	}
	editedURL := requestTestURL + "/edited"
	if err := requestSetValue(s.world, `[name="url"]`, editedURL, false); err != nil {
		return err
	}
	if err := requestBlur(s.world, `[name="url"]`); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector('[name="url"]')?.value === %s &&
			 Boolean(document.querySelector(".request-tab.active .dirty-dot"))`,
			requestJSON(editedURL),
		),
		"committed URL edit while contract validation is pending",
	)
}

func (s *requestContractCancellationSteps) staleURLValidationCompletesWithFindings() error {
	findings, _ := contractOutcome("findings")
	return s.resolveBridgeMatching(
		"ValidateOpenAPIResponse",
		findings,
		map[string]any{"body": contractRawBody(s.expectedMarker)},
		0,
	)
}

func (s *requestContractCancellationSteps) staleURLValidationDoesNotAnnotateResponse() error {
	if err := s.openContractSection(); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`!document.querySelector(
			".contract-ok, .contract-findings, .contract-unavailable"
		) &&
		document.querySelector(".response-content")?.textContent.includes(
			"Contract check pending"
		)`,
		"ignored validation result after URL edit",
	)
}

func (s *requestContractCancellationSteps) editImportedURLWithoutBlurringAndImmediatelyCompleteValidation() error {
	if err := requestWaitFor(
		s.world,
		`globalThis.__VALIDEX_E2E__.pendingCount("ValidateOpenAPIResponse") === 1`,
		"pending OpenAPI validation before same-task URL edit",
	); err != nil {
		return err
	}
	findings, err := contractOutcome("findings")
	if err != nil {
		return err
	}
	s.bufferedEditedURL = requestTestURL + "/same-task-edit"
	var resolved bool
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`(() => {
				const input = document.querySelector('[name="url"]');
				if (!(input instanceof HTMLInputElement)) return false;
				input.focus();
				const setter = Object.getOwnPropertyDescriptor(
					HTMLInputElement.prototype,
					"value"
				)?.set;
				if (setter) setter.call(input, %s);
				else input.value = %s;
				input.dispatchEvent(new Event("input", { bubbles: true }));
				if (input.value !== %s) return false;
				return globalThis.__VALIDEX_E2E__.resolve(
					"ValidateOpenAPIResponse",
					%s,
					%s
				);
			})()`,
			requestJSON(s.bufferedEditedURL),
			requestJSON(s.bufferedEditedURL),
			requestJSON(s.bufferedEditedURL),
			requestJSON(findings),
			requestJSON(map[string]any{
				"body": contractRawBody(s.expectedMarker),
			}),
		),
		&resolved,
	)); err != nil {
		return err
	}
	if !resolved {
		return fmt.Errorf(
			"same-task URL input did not resolve its pending contract validation",
		)
	}
	return requestWaitFor(
		s.world,
		`globalThis.__VALIDEX_E2E__.pendingCount("ValidateOpenAPIResponse") === 0`,
		"same-task contract validation completion",
	)
}

func (s *requestContractCancellationSteps) immediateStaleValidationNeverAnnotatesBufferedURLEdit() error {
	if s.bufferedEditedURL == "" {
		return fmt.Errorf("buffered edited URL is unavailable")
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector('[name="url"]')?.value === %s`,
			requestJSON(s.bufferedEditedURL),
		),
		"live buffered same-task URL edit",
	); err != nil {
		return err
	}
	if err := s.staleURLValidationDoesNotAnnotateResponse(); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector('[name="url"]')?.value === %s &&
			 Boolean(document.querySelector(".request-tab.active .dirty-dot"))`,
			requestJSON(s.bufferedEditedURL),
		),
		"committed buffered same-task URL edit",
	)
}

func (s *requestContractCancellationSteps) bulkCloseAndReopenImportedEndpoint() error {
	if s.importedTabID == "" {
		return fmt.Errorf("imported request tab ID is unavailable")
	}
	if err := requestWaitFor(
		s.world,
		`globalThis.__VALIDEX_E2E__.pendingCount("ValidateOpenAPIResponse") === 1`,
		"pending imported validation before bulk close",
	); err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`[data-request-layout] [data-action="new-request"]`,
	); err != nil {
		return err
	}
	if err := s.captureActiveTabID(&s.manualTabID); err != nil {
		return err
	}
	if err := requestActionOpenTabMenu(s.world, s.manualTabID); err != nil {
		return err
	}
	if err := requestActionChooseMenuItem(
		s.world,
		"Close other clean tabs",
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`!document.querySelector(
				'[data-request-tab-button][data-tab-id=%s]'
			) &&
			globalThis.__VALIDEX_E2E__.pendingCount(
				"ValidateOpenAPIResponse"
			) === 1`,
			requestJSON(s.importedTabID),
		),
		"bulk-closed imported tab with pending validation",
	); err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		fmt.Sprintf(
			`[data-action="open-api"][data-api-id=%s]`,
			requestJSON(s.importedTabID),
		),
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(
				'[data-request-tab-button][data-tab-id=%s]'
			)?.getAttribute("aria-selected") === "true" &&
			document.querySelector('[name="method"]')?.value === "GET" &&
			document.querySelector('[name="url"]')?.value === %s &&
			Boolean(document.querySelector(".response-panel-empty"))`,
			requestJSON(s.importedTabID),
			requestJSON(requestTestURL),
		),
		"freshly reopened deterministic imported tab",
	)
}

func (s *requestContractCancellationSteps) sendReopenedImportedResponseNamed(
	marker string,
) error {
	if err := s.sendImported(marker); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`globalThis.__VALIDEX_E2E__.pendingCount("ValidateOpenAPIResponse") === 2`,
		"retired and reopened imported validations",
	)
}

func (s *requestContractCancellationSteps) importedValidationCompletesWithFindings(
	marker string,
) error {
	findings, err := contractOutcome("findings")
	if err != nil {
		return err
	}
	return s.resolveBridgeMatching(
		"ValidateOpenAPIResponse",
		findings,
		map[string]any{"body": contractRawBody(marker)},
		1,
	)
}

func (s *requestContractCancellationSteps) reopenedImportedTabKeepsCurrentResponse(
	marker string,
) error {
	if err := s.assertActiveTab(s.importedTabID); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(".response-code")?.textContent.includes(%s) &&
			 !document.querySelector(".response-code")?.textContent.includes(
				"retired"
			 )`,
			requestJSON(marker),
		),
		"reopened imported response after retired validation",
	); err != nil {
		return err
	}
	if err := s.openContractSection(); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`!document.querySelector(
			".contract-ok, .contract-findings, .contract-unavailable"
		) &&
		document.querySelector(".response-content")?.textContent.includes(
			"Contract check pending"
		) &&
		globalThis.__VALIDEX_E2E__.pendingCount(
			"ValidateOpenAPIResponse"
		) === 1`,
		"reopened contract remains pending after retired validation",
	)
}

func (s *requestContractCancellationSteps) sendImportedResponseNamed(
	marker string,
) error {
	return s.sendImported(marker)
}

func (s *requestContractCancellationSteps) sendNewerImportedResponseNamed(
	marker string,
) error {
	if s.importedTabID == "" {
		return fmt.Errorf("imported request tab ID is unavailable")
	}
	return s.sendImported(marker)
}

func (s *requestContractCancellationSteps) openAndSendManualRequestNamed(
	marker string,
) error {
	if err := requestClick(
		s.world,
		`[data-request-layout] [data-action="new-request"]`,
	); err != nil {
		return err
	}
	if err := requestWaitVisible(s.world, `[data-request-form]`); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[name="url"]`,
		"https://api.example.test/manual",
		false,
	); err != nil {
		return err
	}
	if err := s.captureActiveTabID(&s.manualTabID); err != nil {
		return err
	}
	if err := requestConfigureBridgeCall(
		s.world,
		"SendRequest",
		contractResponseResult(marker, "https://api.example.test/manual"),
	); err != nil {
		return err
	}
	s.expectedMarker = marker
	if err := s.clickSendAndWaitForCall(); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(".response-code")?.textContent.includes(%s)`,
			requestJSON(marker),
		),
		"manual response "+marker,
	); err != nil {
		return err
	}
	return s.world.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_ACTIVE_RESPONSE_NODE__ = document.querySelector(".response-code")`,
		nil,
	))
}

func (s *requestContractCancellationSteps) currentImportedValidationCompletes() error {
	success, _ := contractOutcome("success")
	return s.resolveBridgeMatching(
		"ValidateOpenAPIResponse",
		success,
		map[string]any{"body": contractRawBody("current")},
		1,
	)
}

func (s *requestContractCancellationSteps) manualTabStillShowsResponse(
	marker string,
) error {
	if s.manualTabID == "" {
		return fmt.Errorf("manual request tab ID is unavailable")
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector('[data-request-tab-button][data-tab-id=%s]')?.getAttribute("aria-selected") === "true" &&
			 document.querySelector(".response-code")?.textContent.includes(%s) &&
			 document.querySelector(".response-code") === globalThis.__VALIDEX_ACTIVE_RESPONSE_NODE__ &&
			 !document.querySelector(".response-code")?.textContent.includes("old") &&
			 !document.querySelector(".response-code")?.textContent.includes("current")`,
			requestJSON(s.manualTabID),
			requestJSON(marker),
		),
		"isolated manual response "+marker,
	)
}

func (s *requestContractCancellationSteps) olderImportedValidationCompletes() error {
	findings, _ := contractOutcome("findings")
	return s.resolveBridgeMatching(
		"ValidateOpenAPIResponse",
		findings,
		map[string]any{"body": contractRawBody("old")},
		0,
	)
}

func (s *requestContractCancellationSteps) importedTabShowsCurrentResponseAndContract(
	marker string,
) error {
	if err := s.activateTab(s.importedTabID); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(".response-code")?.textContent.includes(%s) &&
			 !document.querySelector(".response-code")?.textContent.includes("old")`,
			requestJSON(marker),
		),
		"current imported response "+marker,
	); err != nil {
		return err
	}
	if err := s.openContractSection(); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`Boolean(document.querySelector(".contract-ok")) &&
		 !document.querySelector(".contract-findings")`,
		"current contract after older validation completed",
	)
}

func (s *requestContractCancellationSteps) twoTabsWaitForNativeResponses() error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[name="url"]`,
		"https://api.example.test/concurrent/first",
		false,
	); err != nil {
		return err
	}
	if err := s.captureActiveTabID(&s.firstRunningTabID); err != nil {
		return err
	}
	if err := requestDeferBridgeCall(s.world, "SendRequest"); err != nil {
		return err
	}
	if err := s.clickSendAndWaitForPending(1); err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`[data-request-layout] [data-action="new-request"]`,
	); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[name="url"]`,
		"https://api.example.test/concurrent/second",
		false,
	); err != nil {
		return err
	}
	if err := s.captureActiveTabID(&s.secondRunningTabID); err != nil {
		return err
	}
	if s.firstRunningTabID == s.secondRunningTabID {
		return fmt.Errorf("concurrent requests unexpectedly share tab ID %q", s.firstRunningTabID)
	}
	return s.clickSendAndWaitForPending(2)
}

func (s *requestContractCancellationSteps) pressEscapeOnSecondRunningTab() error {
	if err := s.assertActiveTab(s.secondRunningTabID); err != nil {
		return err
	}
	return s.pressEscapeAndWaitForCancellationCount(1)
}

func (s *requestContractCancellationSteps) exactlyOneCancellationTargetsSecondRequest() error {
	return s.assertCancellationCount(s.secondRunningTabID, 1, 1)
}

func (s *requestContractCancellationSteps) firstRequestRemainsRunning() error {
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector('[data-request-tab-button][data-tab-id=%s]')
				?.getAttribute("aria-label")?.toLowerCase().includes("running") === true &&
			 globalThis.__VALIDEX_E2E__.pendingCount("SendRequest") === 1`,
			requestJSON(s.firstRunningTabID),
		),
		"first concurrent request remains running",
	)
}

func (s *requestContractCancellationSteps) activateFirstTabAndPressEscape() error {
	if err := s.activateTab(s.firstRunningTabID); err != nil {
		return err
	}
	if err := requestWaitVisible(s.world, `[data-action="cancel-request"]`); err != nil {
		return err
	}
	return s.pressEscapeAndWaitForCancellationCount(2)
}

func (s *requestContractCancellationSteps) exactlyOneCancellationTargetsFirstRequest() error {
	return s.assertCancellationCount(s.firstRunningTabID, 1, 2)
}

func (s *requestContractCancellationSteps) bothRequestTabsRecoverIndependently() error {
	for _, tabID := range []string{s.firstRunningTabID, s.secondRunningTabID} {
		if err := s.activateTab(tabID); err != nil {
			return err
		}
		if err := requestWaitFor(
			s.world,
			`Boolean(
				document.querySelector(".user-error-card.request-canceled") &&
				document.querySelector(
					'[data-request-form] .send-button[type="submit"]:not(:disabled)'
				) &&
				!document.querySelector('[data-request-form][aria-busy="true"]')
			)`,
			"independent canceled state for tab "+tabID,
		); err != nil {
			return err
		}
	}
	return nil
}

func (s *requestContractCancellationSteps) requestWaitsForNativeResponse() error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[name="url"]`,
		"https://api.example.test/cancel-failure",
		false,
	); err != nil {
		return err
	}
	if err := s.captureActiveTabID(&s.pendingRequestID); err != nil {
		return err
	}
	if err := requestDeferBridgeCall(s.world, "SendRequest"); err != nil {
		return err
	}
	return s.clickSendAndWaitForPending(1)
}

func (s *requestContractCancellationSteps) nativeCancellationWill(
	outcome string,
) error {
	s.cancellationOutcome = outcome
	switch outcome {
	case "false":
		return requestConfigureBridgeCall(s.world, "CancelRequest", false)
	case "reject":
		return requestConfigureBridgeCall(
			s.world,
			"CancelRequest",
			map[string]any{"__reject": "cancel fixture unavailable"},
		)
	default:
		return fmt.Errorf("unknown cancellation outcome %q", outcome)
	}
}

func (s *requestContractCancellationSteps) pressEscapeOnRunningRequest() error {
	return s.pressEscapeAndWaitForCancellationCount(1)
}

func (s *requestContractCancellationSteps) cancellationIsActionableAndSendingRecovers(
	outcome string,
) error {
	if outcome != s.cancellationOutcome {
		return fmt.Errorf(
			"cancellation outcome = %q, want %q",
			s.cancellationOutcome,
			outcome,
		)
	}
	title := map[string]string{
		"false":  "Running request not found",
		"reject": "Couldn’t cancel request",
	}[outcome]
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(".user-error-card[role=alert] h3")?.textContent.trim() === %s &&
			 Boolean(document.querySelector('[data-action="retry-request"]')) &&
			 Boolean(document.querySelector(
				'[data-request-form] .send-button[type="submit"]:not(:disabled)'
			 )) &&
			 !document.querySelector('[data-request-form][aria-busy="true"]')`,
			requestJSON(title),
		),
		"actionable "+outcome+" cancellation result",
	)
}

func (s *requestContractCancellationSteps) lateNativeResponseCompletes() error {
	return s.resolveBridgeMatching(
		"SendRequest",
		contractResponseResult("late-native", "https://api.example.test/cancel-failure"),
		s.pendingRequestID,
		0,
	)
}

func (s *requestContractCancellationSteps) lateResponseCannotReplaceCancellationResult() error {
	title := map[string]string{
		"false":  "Running request not found",
		"reject": "Couldn’t cancel request",
	}[s.cancellationOutcome]
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(".user-error-card h3")?.textContent.trim() === %s &&
			 !document.querySelector(".response-summary") &&
			 !document.querySelector(".response-content")?.textContent.includes("late-native")`,
			requestJSON(title),
		),
		"ignored late SendRequest after "+s.cancellationOutcome+" cancellation",
	)
}

func (s *requestContractCancellationSteps) startNewerImportedRequestWaitingForResponse() error {
	if err := requestDeferBridgeCall(s.world, "SendRequest"); err != nil {
		return err
	}
	if err := s.captureActiveTabID(&s.pendingRequestID); err != nil {
		return err
	}
	return s.clickSendAndWaitForPending(1)
}

func (s *requestContractCancellationSteps) preCancelContractValidationCompletes() error {
	success, _ := contractOutcome("success")
	return s.resolveBridgeMatching(
		"ValidateOpenAPIResponse",
		success,
		map[string]any{"body": contractRawBody("before-cancel")},
		0,
	)
}

func (s *requestContractCancellationSteps) canceledResponseRemainsWithoutStaleContract() error {
	return requestWaitFor(
		s.world,
		`Boolean(
			document.querySelector(".user-error-card.request-canceled") &&
			!document.querySelector(".response-summary") &&
			!document.querySelector(".contract-ok, .contract-findings")
		)`,
		"canceled response after late contract completion",
	)
}

func (s *requestContractCancellationSteps) sendImported(marker string) error {
	if s.importedTabID == "" {
		return fmt.Errorf("imported request tab ID is unavailable")
	}
	if err := s.assertActiveTab(s.importedTabID); err != nil {
		return err
	}
	if err := requestConfigureBridgeCall(
		s.world,
		"SendRequest",
		contractResponseResult(marker, requestTestURL),
	); err != nil {
		return err
	}
	s.expectedMarker = marker
	before, err := requestBridgeCallCount(s.world, "ValidateOpenAPIResponse")
	if err != nil {
		return err
	}
	if err := s.clickSendAndWaitForCall(); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "ValidateOpenAPIResponse"
			).length > %d`,
			before,
		),
		"native OpenAPI validation call",
	); err != nil {
		return err
	}
	return requestWaitVisible(s.world, `.response-summary`)
}

func (s *requestContractCancellationSteps) clickSendAndWaitForCall() error {
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
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "SendRequest"
			).length > %d`,
			before,
		),
		"native SendRequest call",
	)
}

func (s *requestContractCancellationSteps) clickSendAndWaitForPending(
	count int,
) error {
	if err := s.clickSendAndWaitForCall(); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.pendingCount("SendRequest") === %d &&
			 document.querySelector("[data-request-form]")?.getAttribute("aria-busy") === "true" &&
			 Boolean(document.querySelector('[data-action="cancel-request"]'))`,
			count,
		),
		fmt.Sprintf("%d pending native request(s)", count),
	)
}

func (s *requestContractCancellationSteps) pressEscapeAndWaitForCancellationCount(
	count int,
) error {
	if err := s.world.run(chromedp.KeyEvent(kb.Escape)); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "CancelRequest"
			).length === %d`,
			count,
		),
		fmt.Sprintf("%d native cancellation call(s)", count),
	)
}

func (s *requestContractCancellationSteps) assertCancellationCount(
	requestID string,
	wantForID int,
	wantTotal int,
) error {
	calls, err := requestBridgeCalls(s.world)
	if err != nil {
		return err
	}
	total := 0
	forID := 0
	for _, call := range calls {
		if call.Method != "CancelRequest" {
			continue
		}
		total++
		var id string
		if err := json.Unmarshal(call.Input, &id); err != nil {
			return fmt.Errorf("decode CancelRequest ID: %w", err)
		}
		if id == requestID {
			forID++
		}
	}
	if total != wantTotal || forID != wantForID {
		return fmt.Errorf(
			"CancelRequest calls total=%d for %q=%d, want total=%d for ID=%d",
			total,
			requestID,
			forID,
			wantTotal,
			wantForID,
		)
	}
	return nil
}

func (s *requestContractCancellationSteps) activateTab(tabID string) error {
	if tabID == "" {
		return fmt.Errorf("request tab ID is unavailable")
	}
	selector := fmt.Sprintf(
		`[data-request-tab-button][data-tab-id=%s]`,
		requestJSON(tabID),
	)
	if err := requestClick(s.world, selector); err != nil {
		return err
	}
	return s.assertActiveTab(tabID)
}

func (s *requestContractCancellationSteps) assertActiveTab(tabID string) error {
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector('[data-request-tab-button][data-tab-id=%s]')
				?.getAttribute("aria-selected") === "true"`,
			requestJSON(tabID),
		),
		"active request tab "+tabID,
	)
}

func (s *requestContractCancellationSteps) captureActiveTabID(target *string) error {
	if err := s.world.run(chromedp.Evaluate(
		`document.querySelector(
			'[data-request-tab-button][aria-selected="true"]'
		)?.getAttribute("data-tab-id") || ""`,
		target,
	)); err != nil {
		return err
	}
	if *target == "" {
		return fmt.Errorf("active request tab ID could not be resolved")
	}
	return nil
}

func (s *requestContractCancellationSteps) openContractSection() error {
	if err := requestClick(
		s.world,
		`[data-response-section="contract"]`,
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`document.querySelector(
			'[data-response-section="contract"]'
		)?.getAttribute("aria-selected") === "true"`,
		"selected Contract response section",
	)
}

func (s *requestContractCancellationSteps) resolveBridgeMatching(
	method string,
	value any,
	selector any,
	remaining int,
) error {
	var resolved bool
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.resolve(%s, %s, %s)`,
			requestJSON(method),
			requestJSON(value),
			requestJSON(selector),
		),
		&resolved,
	)); err != nil {
		return err
	}
	if !resolved {
		return fmt.Errorf(
			"bridge method %s had no pending call matching %v",
			method,
			selector,
		)
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.pendingCount(%s) === %d`,
			requestJSON(method),
			remaining,
		),
		fmt.Sprintf("%d remaining %s call(s)", remaining, method),
	); err != nil {
		return err
	}
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			globalThis.__VALIDEX_E2E_RENDER_CHECKPOINT__ = false;
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					globalThis.__VALIDEX_E2E_RENDER_CHECKPOINT__ = true;
				});
			});
			return true;
		})()`,
		nil,
	)); err != nil {
		return fmt.Errorf("schedule %s UI checkpoint: %w", method, err)
	}
	return requestWaitFor(
		s.world,
		`globalThis.__VALIDEX_E2E_RENDER_CHECKPOINT__ === true`,
		method+" result render checkpoint",
	)
}

func contractImportResult() map[string]any {
	return map[string]any{
		"specId":  contractSpecID,
		"path":    "/fixtures/orders.openapi.yaml",
		"title":   "Orders API",
		"version": "1.0.0",
		"baseUrl": "https://api.example.test",
		"endpoints": []map[string]any{
			{
				"id":      "listOrders",
				"method":  "GET",
				"path":    contractPath,
				"summary": "List orders",
				"tags":    []string{"Orders"},
			},
		},
		"canceled": false,
	}
}

func contractResponseResult(marker, resolvedURL string) map[string]any {
	result := requestResponseResult("rich JSON response", "GET", resolvedURL)
	response, ok := result["response"].(map[string]any)
	if !ok {
		panic("request response fixture is not an object")
	}
	body := contractRawBody(marker)
	response["requestId"] = "contract-" + marker
	response["statusCode"] = 200
	response["status"] = "OK"
	response["sizeBytes"] = len(body)
	response["contentType"] = contractContentType
	response["body"] = body
	response["rawBody"] = body
	response["bodyEncoding"] = "utf8"
	response["resolvedUrl"] = resolvedURL
	delete(response, "contract")
	return result
}

func contractRawBody(marker string) string {
	encoded, err := json.Marshal(map[string]string{
		"id":     "order-42",
		"marker": marker,
		"state":  "READY",
	})
	if err != nil {
		panic(fmt.Sprintf("encode contract fixture body: %v", err))
	}
	return string(encoded)
}

func contractOutcome(outcome string) (map[string]any, error) {
	base := map[string]any{
		"available": true,
		"truncated": false,
		"method":    "GET",
		"path":      contractPath,
	}
	switch outcome {
	case "success":
		base["ok"] = true
		base["findings"] = []any{}
	case "findings":
		base["ok"] = false
		base["findings"] = []map[string]any{
			{
				"path":     "$.state",
				"type":     "enum_violation",
				"expected": "READY",
				"actual":   "UNKNOWN",
				"allowed":  []string{"READY", "SHIPPED"},
			},
		}
	default:
		return nil, fmt.Errorf("unknown contract outcome %q", outcome)
	}
	return base, nil
}
