package e2e

import (
	"fmt"
	"strings"

	"github.com/chromedp/chromedp"
	"github.com/chromedp/chromedp/kb"
	"github.com/cucumber/godog"
)

type secondaryUISteps struct {
	world              *browserWorld
	requestCountBefore int
	importCallsBefore  int
	clearCallsBefore   int
	mockPollCalls      int
	longMockBody       string
	editorScrollTop    int
	editorSelection    int
}

func registerSecondaryUISteps(
	context *godog.ScenarioContext,
	world *browserWorld,
) {
	steps := &secondaryUISteps{world: world}
	context.Step(
		`^I click the Validex home control$`,
		steps.clickValidexHome,
	)
	context.Step(
		`^the Requests workspace opens from the top bar$`,
		steps.requestsWorkspaceOpenedFromTopBar,
	)
	context.Step(
		`^I choose the Local environment from the top bar$`,
		steps.chooseLocalEnvironment,
	)
	context.Step(
		`^the Local environment remains selected$`,
		steps.localEnvironmentRemainsSelected,
	)
	context.Step(
		`^I open and dismiss the command palette from the top bar$`,
		steps.openAndDismissPaletteFromTopBar,
	)
	context.Step(
		`^focus returns to the top bar palette control$`,
		steps.paletteFocusIsRestored,
	)
	context.Step(
		`^I create a request from the top bar$`,
		steps.createRequestFromTopBar,
	)
	context.Step(
		`^exactly one new editable request is active$`,
		steps.oneNewRequestIsActive,
	)
	context.Step(
		`^I format a valid request body$`,
		steps.formatValidRequestBody,
	)
	context.Step(
		`^success feedback is visible and can be dismissed$`,
		steps.successFeedbackCanBeDismissed,
	)
	context.Step(
		`^the top bar OpenAPI import is pending$`,
		steps.deferTopBarImport,
	)
	context.Step(
		`^I start the OpenAPI import from the top bar twice$`,
		steps.startTopBarImportTwice,
	)
	context.Step(
		`^only one native OpenAPI import is pending$`,
		steps.onlyOneImportIsPending,
	)
	context.Step(
		`^the pending top bar import succeeds$`,
		steps.resolveTopBarImport,
	)
	context.Step(
		`^the imported API and accessible success notice are visible$`,
		steps.importSuccessIsVisible,
	)
	context.Step(
		`^I dismiss the top bar import notice$`,
		steps.dismissTopBarNotice,
	)
	context.Step(
		`^the notice closes and focus returns to the import control$`,
		steps.importNoticeClosesWithFocus,
	)
	context.Step(
		`^I open the empty imported APIs sidebar$`,
		steps.openEmptyAPISidebar,
	)
	context.Step(
		`^the next sidebar OpenAPI import is canceled$`,
		steps.cancelNextSidebarImport,
	)
	context.Step(
		`^I use the sidebar OpenAPI import action$`,
		steps.useSidebarImport,
	)
	context.Step(
		`^the sidebar dispatches one import without a false success notice$`,
		steps.sidebarCanceledImportIsHonest,
	)
	context.Step(
		`^I clear the mock request history directly$`,
		steps.clearMockHistory,
	)
	context.Step(
		`^the native history is cleared while the mock server keeps running$`,
		steps.mockHistoryIsClearedWhileRunning,
	)
	context.Step(
		`^the next background mock status poll never settles$`,
		steps.nextMockPollNeverSettles,
	)
	context.Step(
		`^I apply a mock route change while the old status poll remains hung$`,
		steps.applyWhileOldMockPollIsHung,
	)
	context.Step(
		`^a newer mock status poll refreshes history independently$`,
		steps.newerMockPollRefreshesHistory,
	)
	context.Step(
		`^a long mock response is being composed with technical details open$`,
		steps.composeLongMockResponse,
	)
	context.Step(
		`^a background mock status poll completes during editing$`,
		steps.mockPollCompletesDuringEditing,
	)
	context.Step(
		`^the response editor state survives and the latest snapshot appears after editing ends$`,
		steps.mockEditorSurvivesPolling,
	)
}

func (s *secondaryUISteps) clickValidexHome() error {
	return requestClick(s.world, `[data-topbar] [data-action="home"]`)
}

func (s *secondaryUISteps) requestsWorkspaceOpenedFromTopBar() error {
	return requestWaitFor(
		s.world,
		`document.querySelector('[data-workspace-view="requests"]')?.getAttribute("aria-current") === "page" &&
			Boolean(document.querySelector("[data-request-layout]"))`,
		"Requests workspace selected by the Validex home control",
	)
}

func (s *secondaryUISteps) chooseLocalEnvironment() error {
	return requestSetValue(s.world, `[data-topbar] [data-environment]`, "local", true)
}

func (s *secondaryUISteps) localEnvironmentRemainsSelected() error {
	return requestWaitFor(
		s.world,
		`document.querySelector('[data-topbar] [data-environment]')?.value === "local"`,
		"Local environment selection",
	)
}

func (s *secondaryUISteps) openAndDismissPaletteFromTopBar() error {
	if err := requestClick(
		s.world,
		`[data-topbar] [data-action="palette"]`,
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		`document.querySelector("[data-palette-input]") === document.activeElement`,
		"top bar command palette focus",
	); err != nil {
		return err
	}
	if err := s.world.run(chromedp.KeyEvent(kb.Escape)); err != nil {
		return fmt.Errorf("dismiss top bar command palette: %w", err)
	}
	return requestWaitFor(
		s.world,
		`!document.querySelector("[data-palette-input]")`,
		"dismissed top bar command palette",
	)
}

func (s *secondaryUISteps) paletteFocusIsRestored() error {
	return requestWaitFor(
		s.world,
		`document.activeElement?.matches('[data-topbar] [data-action="palette"]') === true`,
		"focus restored to top bar palette control",
	)
}

func (s *secondaryUISteps) createRequestFromTopBar() error {
	var err error
	s.requestCountBefore, err = secondaryCount(
		s.world,
		`document.querySelectorAll(".request-tab").length`,
	)
	if err != nil {
		return err
	}
	return requestClick(s.world, `[data-topbar] [data-action="new-request"]`)
}

func (s *secondaryUISteps) oneNewRequestIsActive() error {
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelectorAll(".request-tab").length === %d &&
			 document.querySelectorAll('.request-tab.active').length === 1 &&
			 Boolean(document.querySelector("[data-request-form]")) &&
			 document.querySelector('[data-workspace-view="requests"]')?.getAttribute("aria-current") === "page"`,
			s.requestCountBefore+1,
		),
		"one new active request from the top bar",
	)
}

func (s *secondaryUISteps) formatValidRequestBody() error {
	if err := requestSetValue(s.world, `[name="method"]`, "POST", true); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-request-section="body"]`); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[name="body"]`,
		`{"order":{"id":"order-42","ready":true}}`,
		false,
	); err != nil {
		return err
	}
	return requestClick(s.world, `[data-action="format-body"]`)
}

func (s *secondaryUISteps) successFeedbackCanBeDismissed() error {
	if err := requestWaitFor(
		s.world,
		`(() => {
			const feedback = document.querySelector(".app-feedback.success");
			return feedback?.getAttribute("role") === "status" &&
				feedback.getAttribute("aria-live") === "polite" &&
				Boolean(feedback.querySelector('[data-action="dismiss-feedback"]'));
		})()`,
		"accessible success feedback",
	); err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`.app-feedback [data-action="dismiss-feedback"]`,
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`!document.querySelector(".app-feedback")`,
		"dismissed application feedback",
	)
}

func (s *secondaryUISteps) deferTopBarImport() error {
	var err error
	s.importCallsBefore, err = requestBridgeCallCount(
		s.world,
		"ImportOpenAPI",
	)
	if err != nil {
		return err
	}
	return requestDeferBridgeCall(s.world, "ImportOpenAPI")
}

func (s *secondaryUISteps) startTopBarImportTwice() error {
	if err := requestClick(
		s.world,
		`[data-topbar] [data-action="import"]`,
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "ImportOpenAPI"
			).length === %d &&
			 document.querySelector('[data-topbar] [data-action="import"]')?.disabled === true &&
			 document.querySelector('[data-topbar] [data-action="import"]')?.getAttribute("aria-busy") === "true"`,
			s.importCallsBefore+1,
		),
		"pending top bar OpenAPI import",
	); err != nil {
		return err
	}
	var secondClickBlocked bool
	if err := s.world.run(chromedp.Evaluate(`(() => {
		const button = document.querySelector(
			'[data-topbar] [data-action="import"]'
		);
		if (!(button instanceof HTMLButtonElement) || !button.disabled) {
			return false;
		}
		button.click();
		return true;
	})()`, &secondClickBlocked)); err != nil {
		return err
	}
	if !secondClickBlocked {
		return fmt.Errorf("pending import control did not block a repeated click")
	}
	return nil
}

func (s *secondaryUISteps) onlyOneImportIsPending() error {
	var state struct {
		Calls   int  `json:"calls"`
		Pending int  `json:"pending"`
		Busy    bool `json:"busy"`
	}
	if err := s.world.run(chromedp.Evaluate(`({
		calls: globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "ImportOpenAPI"
		).length,
		pending: globalThis.__VALIDEX_E2E__.pendingCount("ImportOpenAPI"),
		busy:
			document.querySelector('[data-topbar] [data-action="import"]')
				?.getAttribute("aria-busy") === "true"
	})`, &state)); err != nil {
		return err
	}
	if state.Calls != s.importCallsBefore+1 ||
		state.Pending != 1 ||
		!state.Busy {
		return fmt.Errorf(
			"top bar import is not single-flight: calls=%d pending=%d busy=%t",
			state.Calls,
			state.Pending,
			state.Busy,
		)
	}
	return nil
}

func secondaryOpenAPIResult() map[string]any {
	return map[string]any{
		"specId":  "secondary-orders-api",
		"path":    "/fixtures/secondary-orders.openapi.yaml",
		"title":   "Secondary Orders API",
		"version": "2.4.0",
		"baseUrl": "https://secondary.example.test",
		"endpoints": []map[string]any{
			{
				"id":      "listSecondaryOrders",
				"method":  "GET",
				"path":    "/orders",
				"summary": "List secondary orders",
				"tags":    []string{"Orders"},
			},
			{
				"id":      "createSecondaryOrder",
				"method":  "POST",
				"path":    "/orders",
				"summary": "Create secondary order",
				"tags":    []string{"Orders"},
			},
		},
		"canceled": false,
	}
}

func (s *secondaryUISteps) resolveTopBarImport() error {
	return requestResolveBridgeCall(
		s.world,
		"ImportOpenAPI",
		secondaryOpenAPIResult(),
	)
}

func (s *secondaryUISteps) importSuccessIsVisible() error {
	if err := requestWaitFor(
		s.world,
		`(() => {
			const notice = document.querySelector(".topbar-notice.success");
			return notice?.getAttribute("role") === "status" &&
				notice.getAttribute("aria-live") === "polite" &&
				notice.textContent.includes("Secondary Orders API") &&
				notice.textContent.includes("2.4.0") &&
				notice.textContent.includes("2 endpoints") &&
				document.querySelector('[data-section="apis"]')
					?.getAttribute("aria-current") === "page" &&
				document.querySelectorAll('[data-action="open-api"]').length === 2;
		})()`,
		"imported API and success notice",
	); err != nil {
		return err
	}
	return nil
}

func (s *secondaryUISteps) dismissTopBarNotice() error {
	return requestClick(
		s.world,
		`.topbar-notice [data-action="dismiss-notice"]`,
	)
}

func (s *secondaryUISteps) importNoticeClosesWithFocus() error {
	return requestWaitFor(
		s.world,
		`!document.querySelector(".topbar-notice") &&
		 document.activeElement?.matches(
			'[data-topbar] [data-action="import"]'
		 ) === true`,
		"dismissed import notice and restored import focus",
	)
}

func (s *secondaryUISteps) openEmptyAPISidebar() error {
	if err := s.world.shellOpenWorkspace("Requests"); err != nil {
		return err
	}
	if err := collectionEnsureSidebarVisible(s.world); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-section="apis"]`); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`document.querySelector('[data-section="apis"]')?.getAttribute("aria-current") === "page" &&
			Boolean(document.querySelector('[data-sidebar] [data-action="import-openapi"]')) &&
			!document.querySelector(".sidebar-source")`,
		"empty imported APIs sidebar",
	)
}

func (s *secondaryUISteps) cancelNextSidebarImport() error {
	var err error
	s.importCallsBefore, err = requestBridgeCallCount(
		s.world,
		"ImportOpenAPI",
	)
	if err != nil {
		return err
	}
	return requestConfigureBridgeCall(
		s.world,
		"ImportOpenAPI",
		map[string]any{"canceled": true},
	)
}

func (s *secondaryUISteps) useSidebarImport() error {
	if err := requestClick(
		s.world,
		`[data-sidebar] [data-action="import-openapi"]`,
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "ImportOpenAPI"
			).length === %d &&
			 document.querySelector('[data-topbar] [data-action="import"]')
				 ?.getAttribute("aria-busy") === "false"`,
			s.importCallsBefore+1,
		),
		"canceled sidebar OpenAPI import",
	)
}

func (s *secondaryUISteps) sidebarCanceledImportIsHonest() error {
	var state struct {
		Calls       int  `json:"calls"`
		Notice      bool `json:"notice"`
		StillEmpty  bool `json:"stillEmpty"`
		APIsCurrent bool `json:"apisCurrent"`
	}
	if err := s.world.run(chromedp.Evaluate(`({
		calls: globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "ImportOpenAPI"
		).length,
		notice: Boolean(document.querySelector(".topbar-notice")),
		stillEmpty:
			Boolean(document.querySelector(
				'[data-sidebar] [data-action="import-openapi"]'
			)) &&
			!document.querySelector(".sidebar-source"),
		apisCurrent:
			document.querySelector('[data-section="apis"]')
				?.getAttribute("aria-current") === "page"
	})`, &state)); err != nil {
		return err
	}
	if state.Calls != s.importCallsBefore+1 ||
		state.Notice ||
		!state.StillEmpty ||
		!state.APIsCurrent {
		return fmt.Errorf(
			"canceled sidebar import state is misleading: %+v",
			state,
		)
	}
	return nil
}

func (s *secondaryUISteps) clearMockHistory() error {
	var err error
	s.clearCallsBefore, err = requestBridgeCallCount(
		s.world,
		"ClearMockHits",
	)
	if err != nil {
		return err
	}
	pollCallsBefore, err := requestBridgeCallCount(
		s.world,
		"GetMockServer",
	)
	if err != nil {
		return err
	}
	const selector = `[data-action="clear-hits"]:not(:disabled)`
	var scrolled bool
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(`(() => {
			const action = document.querySelector(%s);
			if (!action) return false;
			action.scrollIntoView({ block: "center", inline: "nearest" });
			const bounds = action.getBoundingClientRect();
			return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
		})()`, requestJSON(selector)),
		&scrolled,
	)); err != nil {
		return fmt.Errorf("scroll mock history action into view: %w", err)
	}
	if !scrolled {
		return fmt.Errorf("mock history action could not be scrolled into the viewport")
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "GetMockServer"
			).length > %d && (() => {
				const action = document.querySelector(%s);
				if (!action) return false;
				const bounds = action.getBoundingClientRect();
				return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
			})()`,
			pollCallsBefore,
			requestJSON(selector),
		),
		"mock history action remains reachable after background polling",
	); err != nil {
		return err
	}
	if err := s.world.run(
		chromedp.Focus(selector, chromedp.ByQuery),
		chromedp.KeyEvent(kb.Enter),
	); err != nil {
		return fmt.Errorf("activate mock history action: %w", err)
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "ClearMockHits"
			).length >= %d &&
			 document.querySelector(".mock-server-page")?.getAttribute("aria-busy") === "false"`,
			s.clearCallsBefore+1,
		),
		"completed direct mock history clear",
	)
}

func (s *secondaryUISteps) mockHistoryIsClearedWhileRunning() error {
	var state struct {
		ClearCalls int      `json:"clearCalls"`
		StopCalls  int      `json:"stopCalls"`
		HitRows    int      `json:"hitRows"`
		ClearOff   bool     `json:"clearOff"`
		Running    bool     `json:"running"`
		Focus      string   `json:"focus"`
		Notice     string   `json:"notice"`
		Total      string   `json:"total"`
		Methods    []string `json:"methods"`
	}
	if err := s.world.run(chromedp.Evaluate(`(() => ({
		clearCalls: globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "ClearMockHits"
		).length,
		stopCalls: globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "StopMockServer"
		).length,
		hitRows: document.querySelectorAll(".mock-hit-table tbody tr").length,
		clearOff:
			document.querySelector('[data-action="clear-hits"]')?.disabled === true,
		running:
			Boolean(document.querySelector('[data-action="stop"]')) &&
			!document.querySelector('[data-action="start"]'),
		focus: document.activeElement?.getAttribute("data-action") || "",
		notice: document.querySelector(".tool-notice.success")?.textContent || "",
		total:
			document.querySelector(".mock-hit-panel .tool-card-header span")
				?.textContent?.trim() || "",
		methods: globalThis.__VALIDEX_E2E__.calls.map((call) => call.method)
	}))()`, &state)); err != nil {
		return err
	}
	if state.ClearCalls != s.clearCallsBefore+1 ||
		state.StopCalls != 0 ||
		state.HitRows != 0 ||
		!state.ClearOff ||
		!state.Running ||
		state.Focus != "stop" ||
		!strings.Contains(state.Total, "0 total requests") ||
		!strings.Contains(strings.ToLower(state.Notice), "cleared") {
		return fmt.Errorf(
			"mock history clear did not preserve the running server: calls=%d stop=%d rows=%d disabled=%t running=%t focus=%q total=%q notice=%q methods=%v",
			state.ClearCalls,
			state.StopCalls,
			state.HitRows,
			state.ClearOff,
			state.Running,
			state.Focus,
			state.Total,
			state.Notice,
			state.Methods,
		)
	}
	return nil
}

func (s *secondaryUISteps) nextMockPollNeverSettles() error {
	before, err := requestBridgeCallCount(s.world, "GetMockServer")
	if err != nil {
		return err
	}
	var deferred bool
	if err := s.world.run(chromedp.Evaluate(`(() => {
		globalThis.__VALIDEX_E2E__.deferNext("GetMockServer");
		return true;
	})()`, &deferred)); err != nil {
		return err
	}
	if !deferred {
		return fmt.Errorf("could not defer the next mock status poll")
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "GetMockServer"
			).length > %d &&
			 globalThis.__VALIDEX_E2E__.pendingCount("GetMockServer") === 1`,
			before,
		),
		"permanently hung background mock status poll",
	)
}

func (s *secondaryUISteps) applyWhileOldMockPollIsHung() error {
	if err := mockSetControl(
		s.world,
		`[data-field="body"]`,
		`{"id":"order-42","status":"POLLING_RECOVERY"}`,
	); err != nil {
		return err
	}
	if err := s.world.mockApplyRoutes(); err != nil {
		return err
	}
	var oldPollStillPending bool
	if err := s.world.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.pendingCount("GetMockServer") === 1`,
		&oldPollStillPending,
	)); err != nil {
		return err
	}
	if !oldPollStillPending {
		return fmt.Errorf("the old mock status poll settled unexpectedly")
	}
	var routeID string
	if err := s.world.run(chromedp.Evaluate(
		`document.querySelector("[data-route-id]")?.getAttribute("data-route-id") || ""`,
		&routeID,
	)); err != nil {
		return err
	}
	if routeID == "" {
		return fmt.Errorf("mock polling recovery route ID is unavailable")
	}
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(`(() => {
			document.querySelector('[data-action="stop"]')?.focus();
			globalThis.__VALIDEX_E2E__.setMockHit(%s);
		})()`, requestJSON(map[string]any{
			"id":         84,
			"routeId":    routeID,
			"method":     "GET",
			"path":       "/polling-recovered",
			"status":     200,
			"durationMs": 11,
			"receivedAt": "2026-07-29T12:00:10.000Z",
		})),
		nil,
	)); err != nil {
		return err
	}
	pollCalls, err := requestBridgeCallCount(
		s.world,
		"GetMockServer",
	)
	s.mockPollCalls = pollCalls
	return err
}

func (s *secondaryUISteps) newerMockPollRefreshesHistory() error {
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "GetMockServer"
			).length > %d &&
			 globalThis.__VALIDEX_E2E__.pendingCount("GetMockServer") === 1 &&
			 document.querySelector(".mock-hit-table")?.textContent
				 .includes("/polling-recovered")`,
			s.mockPollCalls,
		),
		"new mock poll accepted while the older poll remains hung",
	); err != nil {
		return err
	}
	return nil
}

func (s *secondaryUISteps) composeLongMockResponse() error {
	before, err := requestBridgeCallCount(s.world, "GetMockServer")
	if err != nil {
		return err
	}
	if err := s.world.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.setMockLastError(
			"polling diagnostic details must stay open"
		)`,
		nil,
	)); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "GetMockServer"
			).length > %d &&
			 Boolean(document.querySelector(
				'details[data-details-state="server-error"]'
			 ))`,
			before,
		),
		"mock server technical details from background polling",
	); err != nil {
		return err
	}

	var body strings.Builder
	body.WriteString("{\n")
	for index := 0; index < 180; index++ {
		fmt.Fprintf(
			&body,
			`  "line-%03d": "This is a long mock response line %03d"%s`+"\n",
			index,
			index,
			map[bool]string{true: ",", false: ""}[index < 179],
		)
	}
	body.WriteString("}")
	s.longMockBody = body.String()

	var editorState struct {
		ScrollTop int `json:"scrollTop"`
		Selection int `json:"selection"`
	}
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(`(() => {
			const details = document.querySelector(
				'details[data-details-state="server-error"]'
			);
			const editor = document.querySelector('[data-field="body"]');
			if (!(details instanceof HTMLDetailsElement) ||
				!(editor instanceof HTMLTextAreaElement)) {
				return { scrollTop: -1, selection: -1 };
			}
			details.open = true;
			const setter = Object.getOwnPropertyDescriptor(
				HTMLTextAreaElement.prototype,
				"value"
			)?.set;
			setter?.call(editor, %s);
			editor.dispatchEvent(new InputEvent("input", {
				bubbles: true,
				inputType: "insertText",
				data: null,
			}));
			editor.focus();
			const selection = Math.floor(editor.value.length / 2);
			editor.setSelectionRange(selection, selection, "none");
			editor.scrollTop = Math.min(
				360,
				Math.max(1, editor.scrollHeight - editor.clientHeight)
			);
			editor.dispatchEvent(new CompositionEvent("compositionstart", {
				bubbles: true,
				data: "編集中",
			}));
			globalThis.__VALIDEX_E2E_EDITING_NODE__ = editor;
			const routeID = document.querySelector("[data-route-id]")
				?.getAttribute("data-route-id") || "";
			globalThis.__VALIDEX_E2E__.setMockHit({
				id: 126,
				routeId: routeID,
				method: "POST",
				path: "/editing-snapshot",
				status: 202,
				durationMs: 19,
				receivedAt: "2026-07-29T12:00:20.000Z",
			});
			return {
				scrollTop: Math.round(editor.scrollTop),
				selection: editor.selectionStart,
			};
		})()`, requestJSON(s.longMockBody)),
		&editorState,
	)); err != nil {
		return err
	}
	if editorState.ScrollTop <= 0 || editorState.Selection <= 0 {
		return fmt.Errorf(
			"long mock editor was not prepared: %+v",
			editorState,
		)
	}
	s.editorScrollTop = editorState.ScrollTop
	s.editorSelection = editorState.Selection
	s.mockPollCalls, err = requestBridgeCallCount(
		s.world,
		"GetMockServer",
	)
	return err
}

func (s *secondaryUISteps) mockPollCompletesDuringEditing() error {
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "GetMockServer"
			).length > %d`,
			s.mockPollCalls,
		),
		"background mock poll during textarea editing",
	)
}

func (s *secondaryUISteps) mockEditorSurvivesPolling() error {
	var state struct {
		SameNode     bool   `json:"sameNode"`
		Focused      bool   `json:"focused"`
		Body         string `json:"body"`
		ScrollTop    int    `json:"scrollTop"`
		Selection    int    `json:"selection"`
		DetailsOpen  bool   `json:"detailsOpen"`
		HitPremature bool   `json:"hitPremature"`
	}
	if err := s.world.run(chromedp.Evaluate(`(() => {
		const editor = document.querySelector('[data-field="body"]');
		return {
			sameNode: editor === globalThis.__VALIDEX_E2E_EDITING_NODE__,
			focused: editor === document.activeElement,
			body: editor?.value || "",
			scrollTop: Math.round(editor?.scrollTop || 0),
			selection: editor?.selectionStart ?? -1,
			detailsOpen:
				document.querySelector(
					'details[data-details-state="server-error"]'
				)?.open === true,
			hitPremature:
				document.querySelector(".mock-hit-table")?.textContent
					.includes("/editing-snapshot") === true,
		};
	})()`, &state)); err != nil {
		return err
	}
	if !state.SameNode ||
		!state.Focused ||
		state.Body != s.longMockBody ||
		state.ScrollTop != s.editorScrollTop ||
		state.Selection != s.editorSelection ||
		!state.DetailsOpen ||
		state.HitPremature {
		return fmt.Errorf(
			"mock editor state changed during polling: same=%t focus=%t body=%t scroll=%d/%d selection=%d/%d details=%t prematureHit=%t",
			state.SameNode,
			state.Focused,
			state.Body == s.longMockBody,
			state.ScrollTop,
			s.editorScrollTop,
			state.Selection,
			s.editorSelection,
			state.DetailsOpen,
			state.HitPremature,
		)
	}
	if err := s.world.run(chromedp.Evaluate(`(() => {
		const editor = document.querySelector('[data-field="body"]');
		if (!(editor instanceof HTMLTextAreaElement)) return false;
		editor.dispatchEvent(new CompositionEvent("compositionend", {
			bubbles: true,
			data: "編集中",
		}));
		document.querySelector(
			'[data-topbar] [data-action="home"]'
		)?.focus();
		return true;
	})()`, nil)); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`document.querySelector(".mock-hit-table")?.textContent
				.includes("/editing-snapshot") === true &&
		 document.querySelector(
			'details[data-details-state="server-error"]'
		 )?.open === true`,
		"deferred mock snapshot after editing ends",
	)
}

func secondaryCount(world *browserWorld, expression string) (int, error) {
	var count int
	if err := world.run(chromedp.Evaluate(expression, &count)); err != nil {
		return 0, err
	}
	return count, nil
}
