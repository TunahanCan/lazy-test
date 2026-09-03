package e2e

import (
	"fmt"

	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/input"
	"github.com/chromedp/chromedp"
	"github.com/chromedp/chromedp/kb"
	"github.com/cucumber/godog"
)

func registerResponsiveSteps(
	context *godog.ScenarioContext,
	world *browserWorld,
) {
	context.Step(
		`^the viewport is "([0-9]+x[0-9]+)"$`,
		world.responsiveSetViewport,
	)
	context.Step(
		`^a request tab with a response is open$`,
		world.responsiveOpenRequestWithResponse,
	)
	context.Step(
		`^the responsive layout settles$`,
		world.responsiveLayoutSettles,
	)
	context.Step(
		`^the main request composer and response remain reachable$`,
		world.responsiveComposerAndResponseAreReachable,
	)
	context.Step(
		`^no application content overflows the viewport horizontally$`,
		world.responsiveHasNoHorizontalOverflow,
	)
	context.Step(
		`^every primary workspace navigation item is fully visible$`,
		world.responsiveNavigationItemsAreFullyVisible,
	)
	context.Step(
		`^the compact top bar actions remain reachable$`,
		world.responsiveTopBarActionsAreReachable,
	)
	context.Step(
		`^every visible enabled control has an accessible name and compact shell targets are usable$`,
		world.responsiveControlsAreNamedAndUsable,
	)
	context.Step(
		`^the response uses the expected "([^"]+)" placement$`,
		world.responsiveResponseUsesPlacement,
	)
	context.Step(
		`^I open the request library drawer$`,
		world.responsiveOpenRequestLibraryDrawer,
	)
	context.Step(
		`^the drawer is modal and the background workspace is inert$`,
		world.responsiveDrawerIsModal,
	)
	context.Step(
		`^keyboard focus is trapped inside the drawer$`,
		world.responsiveFocusIsTrappedInDrawer,
	)
	context.Step(
		`^I close the drawer with Escape$`,
		world.responsiveCloseDrawerWithEscape,
	)
	context.Step(
		`^the drawer closes and focus returns to its restore control$`,
		world.responsiveRequestDrawerClosesWithFocus,
	)
	context.Step(
		`^I open and dismiss the context drawer using its scrim$`,
		world.responsiveDismissContextDrawerWithScrim,
	)
	context.Step(
		`^focus returns to the context drawer restore control$`,
		world.responsiveContextDrawerRestoresFocus,
	)
	context.Step(
		`^I have multiple request tabs and a completed response$`,
		world.responsivePrepareKeyboardNavigation,
	)
	context.Step(
		`^I use the documented workspace, request tab, request section, and response view keys$`,
		world.responsiveUseNavigationKeys,
	)
	context.Step(
		`^each navigation group keeps exactly one tab in the keyboard tab order$`,
		world.responsiveNavigationHasSingleTabStop,
	)
	context.Step(
		`^focus and selected state move together$`,
		world.responsiveFocusAndSelectionMoveTogether,
	)
	context.Step(
		`^I use the new request, send, save, and reopen closed tab shortcuts$`,
		world.responsiveUseRequestShortcuts,
	)
	context.Step(
		`^each shortcut performs its documented action once$`,
		world.responsiveShortcutsRunOnce,
	)
	context.Step(
		`^I am editing a request with both side panels visible$`,
		world.responsivePrepareEditingLayout,
	)
	context.Step(
		`^I open and cancel the save request dialog$`,
		world.responsiveOpenAndCancelSaveDialog,
	)
	context.Step(
		`^focus stays trapped while the dialog is open and returns to its trigger$`,
		world.responsiveDialogFocusIsPreserved,
	)
	context.Step(
		`^I resize each side panel and the response panel with the keyboard$`,
		world.responsiveResizePanelsWithKeyboard,
	)
	context.Step(
		`^every separator announces its updated value within its allowed bounds$`,
		world.responsiveSeparatorsAnnounceValues,
	)
	context.Step(
		`^I open and dismiss a context menu with the keyboard$`,
		world.responsiveOpenAndDismissContextMenu,
	)
	context.Step(
		`^focus returns to the item that opened the menu$`,
		world.responsiveContextMenuRestoresFocus,
	)
	context.Step(
		`^I open the request library from the command palette$`,
		world.responsiveOpenRequestLibraryFromPalette,
	)
	context.Step(
		`^Requests opens with a visible focused request library drawer$`,
		world.responsivePaletteRequestDrawerIsFocused,
	)
	context.Step(
		`^keyboard focus is inside the docked request library$`,
		world.responsiveFocusDockedRequestLibrary,
	)
	context.Step(
		`^focus moves to the visible request library restore control$`,
		world.responsiveCompactTransitionRestoresFocus,
	)
}

func (w *browserWorld) responsiveSetViewport(viewport string) error {
	var width, height int64
	if _, err := fmt.Sscanf(viewport, "%dx%d", &width, &height); err != nil {
		return fmt.Errorf("parse viewport %q: %w", viewport, err)
	}
	if width < 320 || height < 320 {
		return fmt.Errorf("unsupported E2E viewport %dx%d", width, height)
	}
	w.width = width
	w.height = height
	if err := w.run(
		emulation.SetDeviceMetricsOverride(width, height, 1, false),
	); err != nil {
		return fmt.Errorf("set viewport %q: %w", viewport, err)
	}
	return shellPoll(
		w,
		fmt.Sprintf(
			`window.innerWidth === %d && window.innerHeight === %d`,
			width,
			height,
		),
		fmt.Sprintf("browser did not settle at viewport %q", viewport),
	)
}

func (w *browserWorld) responsiveEnsureRequestTab() error {
	if err := shellPoll(
		w,
		`!document.querySelector(
			'.library-loading-state[aria-busy="true"]',
		)`,
		"request library did not finish hydrating",
	); err != nil {
		return err
	}
	var present bool
	if err := w.run(chromedp.Evaluate(
		`Boolean(document.querySelector("[data-request-form]"))`,
		&present,
	)); err != nil {
		return err
	}
	if !present {
		if err := w.run(chromedp.Click(
			`[data-request-workspace] [data-action="new-request"]`,
			chromedp.ByQuery,
		)); err != nil {
			return fmt.Errorf("create request tab: %w", err)
		}
	}
	return w.run(chromedp.WaitVisible(
		`[data-request-form] [name="url"]`,
		chromedp.ByQuery,
	))
}

func (w *browserWorld) responsiveCompleteActiveRequest() error {
	if err := w.responsiveEnsureRequestTab(); err != nil {
		return err
	}
	var sendCalls int
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "SendRequest",
		).length`,
		&sendCalls,
	)); err != nil {
		return err
	}
	if err := w.run(
		chromedp.Focus(`[data-request-form] [name="url"]`, chromedp.ByQuery),
		chromedp.SetValue(
			`[data-request-form] [name="url"]`,
			"https://api.example.test/orders",
			chromedp.ByQuery,
		),
	); err != nil {
		return fmt.Errorf("compose deterministic request: %w", err)
	}
	if err := shellPoll(
		w,
		`document.querySelector(
			'[data-request-form] [name="url"]',
		)?.value === "https://api.example.test/orders"`,
		"deterministic request URL did not settle",
	); err != nil {
		return err
	}
	if err := w.run(
		chromedp.Click(
			`[data-request-form] .send-button[type="submit"]`,
			chromedp.ByQuery,
		),
	); err != nil {
		return fmt.Errorf("send deterministic request: %w", err)
	}
	if err := shellPoll(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "SendRequest",
		).length === %d`, sendCalls+1),
		"deterministic request did not reach the native bridge exactly once",
	); err != nil {
		return err
	}
	return shellPoll(
		w,
		`Boolean(document.querySelector(
			".response-panel:not(.response-panel-empty)",
		))`,
		"deterministic response did not render",
	)
}

func (w *browserWorld) responsiveOpenRequestWithResponse() error {
	if err := w.responsiveCompleteActiveRequest(); err != nil {
		return err
	}
	// Fresh workspaces prefer the desktop side-by-side response. The workspace
	// itself must collapse that default to a bottom response at narrow widths.
	return shellPoll(
		w,
		`Boolean(document.querySelector(".request-workbench"))`,
		"request workbench did not render with the default response placement",
	)
}

func (w *browserWorld) responsiveLayoutSettles() error {
	return shellPoll(
		w,
		`(() => {
			const layout = document.querySelector("[data-request-layout]");
			const workbench = document.querySelector(".request-workbench");
			const layoutRect = layout?.getBoundingClientRect();
			const workbenchRect = workbench?.getBoundingClientRect();
			const rendered = Boolean(
				layout && workbench && layoutRect && workbenchRect &&
				layoutRect.width > 0 && layoutRect.height > 0 &&
				workbenchRect.width > 0 && workbenchRect.height > 0,
			);
			if (!rendered) return false;

			const signature = [
				window.innerWidth,
				window.innerHeight,
				layoutRect.x,
				layoutRect.y,
				layoutRect.width,
				layoutRect.height,
				workbenchRect.x,
				workbenchRect.y,
				workbenchRect.width,
				workbenchRect.height,
			].map((value) => Math.round(value * 10) / 10).join(":");
			const state = globalThis.__VALIDEX_E2E_LAYOUT__ ??= {
				signature: "",
				stableSamples: 0,
			};
			if (state.signature !== signature) {
				state.signature = signature;
				state.stableSamples = 1;
				return false;
			}
			state.stableSamples += 1;
			return state.stableSamples >= 3;
		})()`,
		"responsive request layout did not settle",
	)
}

func (w *browserWorld) responsiveComposerAndResponseAreReachable() error {
	var result struct {
		Composer bool `json:"composer"`
		Response bool `json:"response"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const workbench = document.querySelector(".request-workbench");
		const workbenchRect = workbench?.getBoundingClientRect();
		const reachable = (selector) => {
			const element = document.querySelector(selector);
			const rect = element?.getBoundingClientRect();
			if (!element || !rect || !workbenchRect) return false;
			const style = getComputedStyle(element);
			return rect.width > 0 && rect.height > 0 &&
				style.display !== "none" && style.visibility !== "hidden" &&
				rect.left >= -1 && rect.right <= window.innerWidth + 1 &&
				rect.top >= workbenchRect.top - 1 &&
				rect.bottom <= workbenchRect.bottom + 1 &&
				rect.bottom <= window.innerHeight + 1;
		};
		return {
			composer: reachable(".request-composer"),
			response: reachable(".response-pane"),
		};
	})()`, &result)); err != nil {
		return err
	}
	if !result.Composer || !result.Response {
		return fmt.Errorf(
			"request workbench reachability = composer %t, response %t",
			result.Composer,
			result.Response,
		)
	}
	return nil
}

func (w *browserWorld) responsiveOpenRequestLibraryFromPalette() error {
	if err := w.shellOpenCommandPalette(); err != nil {
		return err
	}
	if err := w.run(
		chromedp.WaitVisible("#palette-option-sidebar", chromedp.ByQuery),
		chromedp.Click("#palette-option-sidebar", chromedp.ByQuery),
		chromedp.WaitNotPresent("[data-palette-input]", chromedp.ByQuery),
	); err != nil {
		return fmt.Errorf("run request panel command from palette: %w", err)
	}
	return nil
}

func (w *browserWorld) responsivePaletteRequestDrawerIsFocused() error {
	return shellPoll(
		w,
		`(() => {
			const requests = document.querySelector(
				'[data-workspace-view="requests"]',
			);
			const layout = document.querySelector("[data-request-layout]");
			const drawer = document.querySelector("[data-left-panel]");
			const active = document.activeElement;
			return requests?.getAttribute("aria-current") === "page" &&
				layout?.hidden === false &&
				drawer?.getAttribute("aria-modal") === "true" &&
				drawer.getAttribute("aria-hidden") === "false" &&
				drawer.contains(active) &&
				active?.getClientRects().length > 0;
		})()`,
		"palette request panel command did not reveal and focus its drawer",
	)
}

func (w *browserWorld) responsiveFocusDockedRequestLibrary() error {
	var hidden bool
	if err := w.run(chromedp.Evaluate(
		`document.querySelector("[data-left-panel]")?.getAttribute("aria-hidden") === "true"`,
		&hidden,
	)); err != nil {
		return fmt.Errorf("inspect docked request library: %w", err)
	}
	if hidden {
		if err := w.run(chromedp.Click(
			`[data-action="restore-left"]`,
			chromedp.ByQuery,
		)); err != nil {
			return fmt.Errorf("reveal docked request library: %w", err)
		}
		if err := shellPoll(
			w,
			`document.querySelector("[data-left-panel]")?.getAttribute("aria-hidden") === "false"`,
			"docked request library did not open",
		); err != nil {
			return err
		}
	}

	var focused bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const panel = document.querySelector("[data-left-panel]");
		const target = [...(panel?.querySelectorAll(
			'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
		) ?? [])].find((candidate) =>
			candidate.getClientRects().length > 0 &&
			getComputedStyle(candidate).visibility !== "hidden"
		);
		target?.focus();
		return panel?.contains(document.activeElement) === true;
	})()`, &focused)); err != nil {
		return fmt.Errorf("focus docked request library: %w", err)
	}
	if !focused {
		return fmt.Errorf("docked request library has no visible focus target")
	}
	return shellPoll(
		w,
		`document.querySelector("[data-left-panel]")?.contains(document.activeElement) === true`,
		"docked request library did not receive keyboard focus",
	)
}

func (w *browserWorld) responsiveCompactTransitionRestoresFocus() error {
	return shellPoll(
		w,
		`(() => {
			const panel = document.querySelector("[data-left-panel]");
			const restore = document.querySelector(
				'[data-action="restore-left"]',
			);
			return panel?.getAttribute("aria-hidden") === "true" &&
				restore?.hidden === false &&
				restore.getClientRects().length > 0 &&
				document.activeElement === restore;
		})()`,
		"compact transition did not move focus to the request panel restore control",
	)
}

func (w *browserWorld) responsiveHasNoHorizontalOverflow() error {
	var result struct {
		Body     int64 `json:"body"`
		Document int64 `json:"document"`
		Viewport int64 `json:"viewport"`
	}
	if err := w.run(chromedp.Evaluate(`({
		viewport: window.innerWidth,
		document: document.documentElement.scrollWidth,
		body: document.body.scrollWidth,
	})`, &result)); err != nil {
		return err
	}
	if result.Document > result.Viewport+1 || result.Body > result.Viewport+1 {
		return fmt.Errorf(
			"horizontal overflow: viewport %dpx, document %dpx, body %dpx",
			result.Viewport,
			result.Document,
			result.Body,
		)
	}
	return nil
}

func (w *browserWorld) responsiveNavigationItemsAreFullyVisible() error {
	var result struct {
		Count       int    `json:"count"`
		InsideBar   bool   `json:"insideBar"`
		LabelsFit   bool   `json:"labelsFit"`
		BarOverflow bool   `json:"barOverflow"`
		Clipped     string `json:"clipped"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const bar = document.querySelector(".activity-bar");
		const items = [...document.querySelectorAll(".activity-item")];
		const barRect = bar?.getBoundingClientRect();
		return {
			count: items.length,
			insideBar: Boolean(barRect) && items.every((item) => {
				const rect = item.getBoundingClientRect();
				return rect.left >= barRect.left - 1 &&
					rect.right <= barRect.right + 1 &&
					rect.top >= barRect.top - 1 &&
					rect.bottom <= barRect.bottom + 1;
			}),
			labelsFit: items.every((item) => {
				const label = item.querySelector("span:not(.sr-only)");
				return label && label.scrollWidth <= label.clientWidth + 1;
			}),
			barOverflow: Boolean(bar) && bar.scrollWidth > bar.clientWidth + 1,
			clipped: items.map((item) => {
				const label = item.querySelector("span:not(.sr-only)");
				if (!label || label.scrollWidth <= label.clientWidth + 1) return "";
				return (label.textContent?.trim() || "") + ":" +
					label.scrollWidth + "/" + label.clientWidth;
			}).filter(Boolean).join(", "),
		};
	})()`, &result)); err != nil {
		return err
	}
	if result.Count != 7 || !result.InsideBar || !result.LabelsFit || result.BarOverflow {
		return fmt.Errorf("primary navigation is clipped: %+v", result)
	}
	return nil
}

func (w *browserWorld) responsiveTopBarActionsAreReachable() error {
	var result struct {
		Visible       bool `json:"visible"`
		Inside        bool `json:"inside"`
		DesktopHidden bool `json:"desktopHidden"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const controls = [
			document.querySelector('[data-focus="home"]'),
			document.querySelector(".mobile-workspace-context"),
			document.querySelector(".environment-select"),
			document.querySelector('[data-focus="palette"]'),
			document.querySelector('[data-focus="mobile-more"]'),
		].filter(Boolean);
		const desktopActions = [...document.querySelectorAll(
			".topbar-actions > .topbar-desktop-action"
		)];
		const visible = (control) => {
			const rect = control.getBoundingClientRect();
			const style = getComputedStyle(control);
			return rect.width > 0 && rect.height > 0 &&
				style.display !== "none" && style.visibility !== "hidden";
		};
		return {
			visible: controls.length === 5 && controls.every(visible),
			inside: controls.length === 5 && controls.every((control) => {
				const rect = control.getBoundingClientRect();
				return rect.left >= -1 && rect.right <= window.innerWidth + 1;
			}),
			desktopHidden:
				desktopActions.length === 3 && desktopActions.every(
					(control) => !visible(control)
				),
		};
	})()`, &result)); err != nil {
		return err
	}
	if !result.Visible || !result.Inside || !result.DesktopHidden {
		return fmt.Errorf("compact top bar controls are unreachable: %+v", result)
	}
	if err := w.run(
		chromedp.Click(`[data-focus="mobile-more"]`, chromedp.ByQuery),
		chromedp.WaitVisible(`[role="menu"].native-menu`, chromedp.ByQuery),
	); err != nil {
		return fmt.Errorf("open compact top bar action menu: %w", err)
	}
	var globalActionsAvailable bool
	if err := w.run(chromedp.Evaluate(`(() => {
		const items = [...document.querySelectorAll(
			'[role="menu"].native-menu :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]):not(:disabled)'
		)].map((item) => item.textContent?.trim() || "");
		return items.includes("New request") && items.includes("Import OpenAPI");
	})()`, &globalActionsAvailable)); err != nil {
		return err
	}
	if !globalActionsAvailable {
		return fmt.Errorf("compact top bar menu does not expose global actions")
	}
	if err := w.run(chromedp.KeyEvent(kb.Escape)); err != nil {
		return err
	}
	return nil
}

func (w *browserWorld) responsiveControlsAreNamedAndUsable() error {
	var result struct {
		ControlCount int      `json:"controlCount"`
		MissingNames []string `json:"missingNames"`
		ShellTargets int      `json:"shellTargets"`
		SmallTargets []string `json:"smallTargets"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const rendered = (element) => {
			if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return !element.hidden && style.display !== "none" &&
				style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
		};
		const enabled = (element) =>
			!("disabled" in element && element.disabled) &&
			element.getAttribute("aria-disabled") !== "true";
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
				labelledBy || labels ||
				element.getAttribute("alt") ||
				element.getAttribute("title") ||
				element.textContent?.trim() || ""
			).replace(/\s+/g, " ").trim();
		};
		const controls = [...new Set(document.querySelectorAll(
			'button, input:not([type="hidden"]), select, textarea, a[href], summary, [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'
		))].filter((element) => rendered(element) && enabled(element));
		const missingNames = controls
			.filter((element) => !accessibleName(element))
			.map((element) => element.outerHTML.slice(0, 140));

		const shellTargets = [...document.querySelectorAll([
			".topbar .brand",
			".topbar .global-search",
			".topbar .environment-select",
			".topbar .topbar-actions > button",
			".activity-bar .activity-item",
		].join(", "))].filter((element) => rendered(element) && enabled(element));
		const smallTargets = shellTargets.flatMap((element) => {
			const rect = element.getBoundingClientRect();
			if (rect.width >= 40 && rect.height >= 40) return [];
			return [
				(accessibleName(element) || element.className || element.tagName) +
				" (" + Math.round(rect.width) + "x" +
				Math.round(rect.height) + ")",
			];
		});
		return {
			controlCount: controls.length,
			missingNames,
			shellTargets: shellTargets.length,
			smallTargets,
		};
	})()`, &result)); err != nil {
		return err
	}
	if result.ControlCount == 0 || len(result.MissingNames) > 0 ||
		result.ShellTargets == 0 || len(result.SmallTargets) > 0 {
		return fmt.Errorf(
			"accessible control contract failed: %+v",
			result,
		)
	}
	return nil
}

func (w *browserWorld) responsiveResponseUsesPlacement(
	placement string,
) error {
	className := map[string]string{
		"desktop": "response-horizontal",
		"bottom":  "response-vertical",
	}[placement]
	if className == "" {
		return fmt.Errorf("unknown expected response placement %q", placement)
	}
	return shellPoll(
		w,
		fmt.Sprintf(
			`document.querySelector(".request-workbench")?.classList.contains(%q)`,
			className,
		),
		fmt.Sprintf("response does not use %q placement", placement),
	)
}

func (w *browserWorld) responsiveOpenRequestLibraryDrawer() error {
	if err := w.run(
		chromedp.WaitVisible(
			`[data-action="restore-left"]`,
			chromedp.ByQuery,
		),
		chromedp.Click(
			`[data-action="restore-left"]`,
			chromedp.ByQuery,
		),
	); err != nil {
		return fmt.Errorf("open request library drawer: %w", err)
	}
	return shellPoll(
		w,
		`document.querySelector("[data-left-panel]")?.getAttribute("aria-modal") === "true"`,
		"request library did not open as a modal drawer",
	)
}

func (w *browserWorld) responsiveDrawerIsModal() error {
	var result struct {
		Modal          bool `json:"modal"`
		Role           bool `json:"role"`
		TopbarInert    bool `json:"topbarInert"`
		WorkspaceInert bool `json:"workspaceInert"`
		Scrim          bool `json:"scrim"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const drawer = document.querySelector("[data-left-panel]");
		const scrim = document.querySelector(".mobile-panel-scrim");
		return {
			role: drawer?.getAttribute("role") === "dialog",
			modal: drawer?.getAttribute("aria-modal") === "true",
			topbarInert: document.querySelector("[data-topbar]")?.hasAttribute(
				"inert",
			) ?? false,
			workspaceInert: document.querySelector(
				"[data-request-workspace]",
			)?.hasAttribute("inert") ?? false,
			scrim: Boolean(scrim && !scrim.hidden),
		};
	})()`, &result)); err != nil {
		return err
	}
	if !result.Role || !result.Modal || !result.TopbarInert ||
		!result.WorkspaceInert || !result.Scrim {
		return fmt.Errorf(
			"drawer accessibility state = role %t, modal %t, topbar inert %t, workspace inert %t, scrim %t",
			result.Role,
			result.Modal,
			result.TopbarInert,
			result.WorkspaceInert,
			result.Scrim,
		)
	}
	return nil
}

func (w *browserWorld) responsiveFocusIsTrappedInDrawer() error {
	if err := w.run(chromedp.Evaluate(`(() => {
		const drawer = document.querySelector("[data-left-panel]");
		const focusables = [...drawer.querySelectorAll(
			'button:not([disabled]):not([hidden]), input:not([disabled]), ' +
			'select:not([disabled]), textarea:not([disabled]), ' +
			'[tabindex]:not([tabindex="-1"])',
		)].filter((element) => element.getClientRects().length > 0);
		focusables.at(-1)?.focus();
		return focusables.length;
	})()`, nil)); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(kb.Tab)); err != nil {
		return err
	}
	var trapped bool
	if err := w.run(chromedp.Evaluate(
		`document.querySelector("[data-left-panel]")?.contains(document.activeElement) ?? false`,
		&trapped,
	)); err != nil {
		return err
	}
	if !trapped {
		return fmt.Errorf("Tab moved focus outside the modal request drawer")
	}
	if err := w.run(chromedp.KeyEvent(
		kb.Tab,
		chromedp.KeyModifiers(input.ModifierShift),
	)); err != nil {
		return err
	}
	var reverseTrapped bool
	if err := w.run(chromedp.Evaluate(
		`document.querySelector("[data-left-panel]")?.contains(document.activeElement) ?? false`,
		&reverseTrapped,
	)); err != nil {
		return err
	}
	if !reverseTrapped {
		return fmt.Errorf("Shift+Tab moved focus outside the modal request drawer")
	}
	return nil
}

func (w *browserWorld) responsiveCloseDrawerWithEscape() error {
	return w.run(chromedp.KeyEvent(kb.Escape))
}

func (w *browserWorld) responsiveRequestDrawerClosesWithFocus() error {
	return shellPoll(
		w,
		`(() => {
			const drawer = document.querySelector("[data-left-panel]");
			const restore = document.querySelector('[data-action="restore-left"]');
			return drawer?.getAttribute("aria-hidden") === "true" &&
				document.activeElement === restore;
		})()`,
		"request drawer did not close and restore focus",
	)
}

func (w *browserWorld) responsiveDismissContextDrawerWithScrim() error {
	if err := w.run(
		chromedp.Click(
			`[data-action="restore-right"]`,
			chromedp.ByQuery,
		),
	); err != nil {
		return fmt.Errorf("open context drawer: %w", err)
	}
	if err := shellPoll(
		w,
		`document.querySelector("[data-right-panel]")?.getAttribute("aria-modal") === "true"`,
		"context drawer did not become modal",
	); err != nil {
		return err
	}
	var point struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const scrim = document.querySelector(".mobile-panel-scrim");
		const drawer = document.querySelector("[data-right-panel]");
		const scrimRect = scrim?.getBoundingClientRect();
		const drawerRect = drawer?.getBoundingClientRect();
		if (!scrimRect || !drawerRect) return { x: 0, y: 0 };
		return {
			x: scrimRect.left + Math.max(
				8,
				(drawerRect.left - scrimRect.left) / 2,
			),
			y: scrimRect.top + scrimRect.height / 2,
		};
	})()`, &point)); err != nil {
		return err
	}
	if point.X <= 0 || point.Y <= 0 {
		return fmt.Errorf("could not resolve an exposed context scrim point")
	}
	if err := w.run(chromedp.MouseClickXY(point.X, point.Y)); err != nil {
		return fmt.Errorf("dismiss context drawer with scrim: %w", err)
	}
	return nil
}

func (w *browserWorld) responsiveContextDrawerRestoresFocus() error {
	return shellPoll(
		w,
		`(() => {
			const drawer = document.querySelector("[data-right-panel]");
			const restore = document.querySelector('[data-action="restore-right"]');
			return drawer?.getAttribute("aria-hidden") === "true" &&
				document.activeElement === restore;
		})()`,
		"context drawer did not restore focus to its restore control",
	)
}

func (w *browserWorld) responsivePrepareKeyboardNavigation() error {
	if err := w.responsiveCompleteActiveRequest(); err != nil {
		return err
	}
	var firstID string
	if err := w.run(chromedp.Evaluate(
		`document.querySelector('[data-request-tab-button][aria-selected="true"]')?.dataset.tabId ?? ""`,
		&firstID,
	)); err != nil {
		return err
	}
	if firstID == "" {
		return fmt.Errorf("completed request tab has no identifier")
	}
	if err := w.run(
		chromedp.KeyEvent(
			"n",
			chromedp.KeyModifiers(shellPlatformCommandModifier()),
		),
		chromedp.KeyEvent(
			"n",
			chromedp.KeyModifiers(shellPlatformCommandModifier()),
		),
	); err != nil {
		return fmt.Errorf("create multiple request tabs with keyboard: %w", err)
	}
	if err := shellPoll(
		w,
		`document.querySelectorAll("[data-request-tab-button]").length >= 3`,
		"multiple request tabs were not created",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.Evaluate(fmt.Sprintf(`(() => {
		globalThis.__VALIDEX_E2E_KEYBOARD__ = {
			completedTabID: %q,
		};
		document.querySelector(%q)?.click();
		return true;
	})()`, firstID, fmt.Sprintf(
		`[data-request-tab-button][data-tab-id="%s"]`,
		firstID,
	)), nil)); err != nil {
		return err
	}
	return shellPoll(
		w,
		`Boolean(document.querySelector(
			'.response-panel:not(.response-panel-empty)',
		))`,
		"completed response was not retained with multiple tabs",
	)
}

func responsiveRecordNavigationState(
	w *browserWorld,
	key, selector, selectedAttribute, selectedValue string,
) error {
	var recorded bool
	if err := w.run(chromedp.Evaluate(fmt.Sprintf(`(() => {
		const items = [...document.querySelectorAll(%q)];
		const selected = items.filter(
			(item) => item.getAttribute(%q) === %q,
		);
		const tabStops = items.filter((item) => item.tabIndex === 0);
		const state = globalThis.__VALIDEX_E2E_KEYBOARD__ ??= {};
		state.tabOrderOK = (state.tabOrderOK ?? true) &&
			tabStops.length === 1 && selected.length === 1 &&
			tabStops[0] === selected[0];
		state.focusStateOK = (state.focusStateOK ?? true) &&
			selected.length === 1 && document.activeElement === selected[0];
		state[%q] = true;
		return true;
	})()`, selector, selectedAttribute, selectedValue, key), &recorded)); err != nil {
		return err
	}
	if !recorded {
		return fmt.Errorf("could not record %s keyboard navigation state", key)
	}
	return nil
}

func responsiveFocusAfterRenderSettles(
	w *browserWorld,
	selector, description string,
) error {
	return shellPoll(
		w,
		fmt.Sprintf(`(() => {
			const selector = %q;
			const element = document.querySelector(selector);
			if (!(element instanceof HTMLElement)) return false;
			const state = globalThis.__VALIDEX_E2E_STABLE_FOCUS__ ??= {
				selector: "",
				element: null,
				stableSamples: 0,
			};
			if (
				state.selector !== selector ||
				state.element !== element ||
				document.activeElement !== element
			) {
				element.focus({ preventScroll: true });
				state.selector = selector;
				state.element = element;
				state.stableSamples = 0;
				return false;
			}
			state.stableSamples += 1;
			return state.stableSamples >= 3;
		})()`, selector),
		description,
	)
}

func (w *browserWorld) responsiveUseNavigationKeys() error {
	if err := w.run(chromedp.Evaluate(`(() => {
		const state = globalThis.__VALIDEX_E2E_KEYBOARD__ ??= {};
		state.tabOrderOK = true;
		state.focusStateOK = true;
		return true;
	})()`, nil)); err != nil {
		return err
	}
	if err := w.run(chromedp.Focus(
		`[data-workspace-view="requests"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	if err := responsiveFocusAfterRenderSettles(
		w,
		`[data-workspace-view="requests"]`,
		"Requests workspace control did not receive keyboard focus",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(kb.ArrowDown)); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		`document.activeElement?.dataset.workspaceView === "mock"`,
		"workspace ArrowDown key did not move focus",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.Focus(
		`[data-workspace-view="mock"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	if err := responsiveFocusAfterRenderSettles(
		w,
		`[data-workspace-view="mock"]`,
		"Mock workspace control did not retain keyboard focus",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(" ")); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		`document.querySelector('[data-workspace-view="mock"]')?.getAttribute("aria-current") === "page"`,
		"Space did not activate the keyboard-focused workspace",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const state = globalThis.__VALIDEX_E2E_KEYBOARD__ ??= {};
		state.workspaceFocusOK = true;
		state.workspaceSelectedOK =
			document.querySelectorAll(
				'[data-workspace-view][aria-current="page"]',
			).length === 1 &&
			document.querySelector(
				'[data-workspace-view="mock"]',
			)?.getAttribute("aria-current") === "page";
		document.querySelector(
			'[data-workspace-view="requests"]',
		)?.click();
		return true;
	})()`, nil)); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		`document.querySelector('[data-workspace-view="requests"]')?.getAttribute("aria-current") === "page"`,
		"could not return to Requests workspace",
	); err != nil {
		return err
	}

	if err := responsiveFocusAfterRenderSettles(
		w,
		`[data-request-tab-button][aria-selected="true"]`,
		"active request tab did not receive stable keyboard focus",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(kb.ArrowRight)); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		`document.activeElement?.matches(
			'[data-request-tab-button][aria-selected="true"]',
		) ?? false`,
		"request tab keyboard navigation did not move focus and selection",
	); err != nil {
		return err
	}
	if err := responsiveRecordNavigationState(
		w,
		"requestTabsChecked",
		"[data-request-tab-button]",
		"aria-selected",
		"true",
	); err != nil {
		return err
	}

	if err := responsiveFocusAfterRenderSettles(
		w,
		`[data-request-section][aria-selected="true"]`,
		"active request section did not receive stable keyboard focus",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(kb.ArrowRight)); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		`document.activeElement?.matches(
			'[data-request-section][aria-selected="true"]',
		) ?? false`,
		"request section keyboard navigation did not move focus and selection",
	); err != nil {
		return err
	}
	if err := responsiveRecordNavigationState(
		w,
		"requestSectionsChecked",
		"[data-request-section]",
		"aria-selected",
		"true",
	); err != nil {
		return err
	}

	var completedTabID string
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E_KEYBOARD__?.completedTabID ?? ""`,
		&completedTabID,
	)); err != nil {
		return err
	}
	if completedTabID == "" {
		return fmt.Errorf("completed request tab identifier was lost")
	}
	if err := w.run(chromedp.Click(
		fmt.Sprintf(
			`[data-request-tab-button][data-tab-id="%s"]`,
			completedTabID,
		),
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	if err := w.run(chromedp.WaitVisible(
		`[data-response-section][aria-selected="true"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	if err := responsiveFocusAfterRenderSettles(
		w,
		`[data-response-section][aria-selected="true"]`,
		"active response view did not receive stable keyboard focus",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(kb.ArrowRight)); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		`document.activeElement?.matches(
			'[data-response-section][aria-selected="true"]',
		) ?? false`,
		"response view keyboard navigation did not move focus and selection",
	); err != nil {
		return err
	}
	if err := responsiveRecordNavigationState(
		w,
		"responseViewsChecked",
		"[data-response-section]",
		"aria-selected",
		"true",
	); err != nil {
		return err
	}

	// The activity navigation is not a tablist: its roving focus intentionally
	// activates only on Enter, then workspace focus moves to the page heading.
	// Record its single selected/tab-stop invariant after returning to Requests.
	return w.run(chromedp.Evaluate(`(() => {
		const items = [...document.querySelectorAll("[data-workspace-view]")];
		const selected = items.filter(
			(item) => item.getAttribute("aria-current") === "page",
		);
		const tabStops = items.filter((item) => item.tabIndex === 0);
		const state = globalThis.__VALIDEX_E2E_KEYBOARD__ ??= {};
		state.tabOrderOK = (state.tabOrderOK ?? true) &&
			selected.length === 1 && tabStops.length === 1 &&
			selected[0] === tabStops[0];
		return true;
	})()`, nil))
}

func (w *browserWorld) responsiveNavigationHasSingleTabStop() error {
	var result struct {
		Checked bool `json:"checked"`
		OK      bool `json:"ok"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const state = globalThis.__VALIDEX_E2E_KEYBOARD__ ?? {};
		return {
			checked: Boolean(
				state.requestTabsChecked &&
				state.requestSectionsChecked &&
				state.responseViewsChecked,
			),
			ok: state.tabOrderOK === true,
		};
	})()`, &result)); err != nil {
		return err
	}
	if !result.Checked || !result.OK {
		return fmt.Errorf(
			"roving tab-order invariant = checked %t, valid %t",
			result.Checked,
			result.OK,
		)
	}
	return nil
}

func (w *browserWorld) responsiveFocusAndSelectionMoveTogether() error {
	var result struct {
		FocusOK     bool `json:"focusOK"`
		WorkspaceOK bool `json:"workspaceOK"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const state = globalThis.__VALIDEX_E2E_KEYBOARD__ ?? {};
		return {
			focusOK: state.focusStateOK === true,
			workspaceOK:
				state.workspaceFocusOK === true &&
				state.workspaceSelectedOK === true,
		};
	})()`, &result)); err != nil {
		return err
	}
	if !result.FocusOK || !result.WorkspaceOK {
		return fmt.Errorf(
			"keyboard focus/selection invariant = tabs %t, workspace %t",
			result.FocusOK,
			result.WorkspaceOK,
		)
	}
	return nil
}

func (w *browserWorld) responsiveUseRequestShortcuts() error {
	var baseline struct {
		SendCalls int `json:"sendCalls"`
		TabCount  int `json:"tabCount"`
	}
	if err := w.run(chromedp.Evaluate(`({
		sendCalls: globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "SendRequest",
		).length,
		tabCount: document.querySelectorAll(
			"[data-request-tab-button]",
		).length,
	})`, &baseline)); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(
		"n",
		chromedp.KeyModifiers(shellPlatformCommandModifier()),
	)); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		fmt.Sprintf(
			`document.querySelectorAll("[data-request-tab-button]").length === %d`,
			baseline.TabCount+1,
		),
		"new-request shortcut did not create exactly one tab",
	); err != nil {
		return err
	}
	var reopenedID string
	if err := w.run(chromedp.Evaluate(
		`document.querySelector('[data-request-tab-button][aria-selected="true"]')?.dataset.tabId ?? ""`,
		&reopenedID,
	)); err != nil {
		return err
	}
	if reopenedID == "" {
		return fmt.Errorf("new-request shortcut created no active request")
	}
	if err := w.run(
		chromedp.Focus(
			`[data-request-tab-button][aria-selected="true"]`,
			chromedp.ByQuery,
		),
		chromedp.KeyEvent(kb.Delete),
	); err != nil {
		return err
	}
	if err := w.run(
		chromedp.WaitVisible(
			`dialog[open] [data-confirm]`,
			chromedp.ByQuery,
		),
		chromedp.Focus(
			`dialog[open] [data-confirm]`,
			chromedp.ByQuery,
		),
		chromedp.KeyEvent(kb.Enter),
		chromedp.WaitNotPresent("dialog[open]", chromedp.ByQuery),
	); err != nil {
		return fmt.Errorf(
			"confirm closing the new local draft with the keyboard: %w",
			err,
		)
	}
	if err := shellPoll(
		w,
		fmt.Sprintf(
			`!document.querySelector(%q)`,
			fmt.Sprintf(
				`[data-request-tab-button][data-tab-id="%s"]`,
				reopenedID,
			),
		),
		"clean request tab was not closed",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(
		"t",
		chromedp.KeyModifiers(
			shellPlatformCommandModifier(),
			input.ModifierShift,
		),
	)); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		fmt.Sprintf(
			`document.querySelector(%q)?.getAttribute("aria-selected") === "true"`,
			fmt.Sprintf(
				`[data-request-tab-button][data-tab-id="%s"]`,
				reopenedID,
			),
		),
		"reopen-closed-tab shortcut did not restore the same active tab",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.SetValue(
		`[data-request-form] [name="url"]`,
		"https://api.example.test/shortcut",
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		fmt.Sprintf(`(() => {
			const tab = document.querySelector(
				'[data-request-tab-button][aria-selected="true"]',
			);
			return tab?.dataset.tabId === %q &&
				document.querySelector(
					'[data-request-form] [name="url"]',
				)?.value === "https://api.example.test/shortcut";
		})()`, reopenedID),
		"reopened request was not ready for the send shortcut",
	); err != nil {
		return err
	}
	if err := w.run(
		chromedp.Focus(
			`[data-request-form] [name="url"]`,
			chromedp.ByQuery,
		),
		chromedp.KeyEvent(
			kb.Enter,
			chromedp.KeyModifiers(shellPlatformCommandModifier()),
		),
	); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		fmt.Sprintf(`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "SendRequest",
		).length === %d`, baseline.SendCalls+1),
		"send shortcut did not call the native bridge exactly once",
	); err != nil {
		var state struct {
			ActiveTabID string `json:"activeTabID"`
			Focused     string `json:"focused"`
			SendCalls   int    `json:"sendCalls"`
			Running     bool   `json:"running"`
			URL         string `json:"url"`
		}
		if inspectErr := w.run(chromedp.Evaluate(`(() => ({
			activeTabID: document.querySelector(
				'[data-request-tab-button][aria-selected="true"]',
			)?.dataset.tabId ?? "",
			focused:
				document.activeElement?.getAttribute("name") ??
				document.activeElement?.getAttribute("data-action") ??
				document.activeElement?.tagName ?? "",
			sendCalls: globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "SendRequest",
			).length,
			running:
				document.querySelector(
					'[data-request-tab-button][aria-selected="true"]',
				)?.getAttribute("aria-busy") === "true",
			url: document.querySelector(
				'[data-request-form] [name="url"]',
			)?.value ?? "",
		}))()`, &state)); inspectErr != nil {
			return fmt.Errorf("%w; inspect failed: %v", err, inspectErr)
		}
		return fmt.Errorf(
			"%w; calls %d→%d, active tab %q (reopened %q), URL %q, running %t, focus %q",
			err,
			baseline.SendCalls,
			state.SendCalls,
			state.ActiveTabID,
			reopenedID,
			state.URL,
			state.Running,
			state.Focused,
		)
	}
	if err := shellPoll(
		w,
		`Boolean(document.querySelector(
			".response-panel:not(.response-panel-empty)",
		))`,
		"send shortcut did not render its response",
	); err != nil {
		var state struct {
			ActiveTabID string         `json:"activeTabID"`
			LastCall    map[string]any `json:"lastCall"`
			URL         string         `json:"url"`
		}
		if inspectErr := w.run(chromedp.Evaluate(`(() => {
			const calls = globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "SendRequest",
			);
			return {
				activeTabID: document.querySelector(
					'[data-request-tab-button][aria-selected="true"]',
				)?.dataset.tabId ?? "",
				url: document.querySelector(
					'[data-request-form] [name="url"]',
				)?.value ?? "",
				lastCall: calls.at(-1) ?? {},
			};
		})()`, &state)); inspectErr != nil {
			return fmt.Errorf("%w; inspect failed: %v", err, inspectErr)
		}
		return fmt.Errorf(
			"%w; active tab %q (reopened %q), URL %q, last bridge call %#v",
			err,
			state.ActiveTabID,
			reopenedID,
			state.URL,
			state.LastCall,
		)
	}
	if err := w.run(chromedp.KeyEvent(
		"s",
		chromedp.KeyModifiers(shellPlatformCommandModifier()),
	)); err != nil {
		return err
	}
	if err := w.run(chromedp.WaitVisible(
		`dialog[open] [data-save-form]`,
		chromedp.ByQuery,
	)); err != nil {
		return fmt.Errorf("save shortcut did not open the save dialog: %w", err)
	}
	var openDialogs int
	if err := w.run(chromedp.Evaluate(
		`document.querySelectorAll("dialog[open]").length`,
		&openDialogs,
	)); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(kb.Escape)); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		`!document.querySelector("dialog[open]") &&
			!document.querySelector("[data-save-form]")`,
		"save dialog did not close after the shortcut check",
	); err != nil {
		return err
	}
	return w.run(chromedp.Evaluate(fmt.Sprintf(`(() => {
		const state = globalThis.__VALIDEX_E2E_KEYBOARD__ ??= {};
		state.shortcuts = {
			baselineTabs: %d,
			expectedTabs: %d,
			finalTabs: document.querySelectorAll(
				"[data-request-tab-button]",
			).length,
			baselineSendCalls: %d,
			finalSendCalls: globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "SendRequest",
			).length,
			reopenedID: %q,
			reopenedActive:
				document.querySelector(%q)?.getAttribute(
					"aria-selected",
				) === "true",
			openSaveDialogs: %d,
		};
		return true;
	})()`,
		baseline.TabCount,
		baseline.TabCount+1,
		baseline.SendCalls,
		reopenedID,
		fmt.Sprintf(
			`[data-request-tab-button][data-tab-id="%s"]`,
			reopenedID,
		),
		openDialogs,
	), nil))
}

func (w *browserWorld) responsiveShortcutsRunOnce() error {
	var result struct {
		BaselineTabs      int    `json:"baselineTabs"`
		ExpectedTabs      int    `json:"expectedTabs"`
		FinalTabs         int    `json:"finalTabs"`
		BaselineSendCalls int    `json:"baselineSendCalls"`
		FinalSendCalls    int    `json:"finalSendCalls"`
		ReopenedID        string `json:"reopenedID"`
		ReopenedActive    bool   `json:"reopenedActive"`
		OpenSaveDialogs   int    `json:"openSaveDialogs"`
	}
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E_KEYBOARD__?.shortcuts ?? {}`,
		&result,
	)); err != nil {
		return err
	}
	if result.FinalTabs != result.ExpectedTabs ||
		result.FinalSendCalls != result.BaselineSendCalls+1 ||
		result.ReopenedID == "" ||
		!result.ReopenedActive ||
		result.OpenSaveDialogs != 1 {
		return fmt.Errorf(
			"shortcut effects = tabs %d→%d (want %d), send calls %d→%d, reopened %q active %t, save dialogs %d",
			result.BaselineTabs,
			result.FinalTabs,
			result.ExpectedTabs,
			result.BaselineSendCalls,
			result.FinalSendCalls,
			result.ReopenedID,
			result.ReopenedActive,
			result.OpenSaveDialogs,
		)
	}
	return nil
}

func (w *browserWorld) responsivePrepareEditingLayout() error {
	if err := w.responsiveEnsureRequestTab(); err != nil {
		return err
	}
	if err := w.run(chromedp.SetValue(
		`[data-request-form] [name="url"]`,
		"https://api.example.test/editing",
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	return w.shellShowBothRequestPanels()
}

func (w *browserWorld) responsiveOpenAndCancelSaveDialog() error {
	if err := responsiveFocusAfterRenderSettles(
		w,
		`[data-action="save-request"]`,
		"save request trigger did not receive stable keyboard focus",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(kb.Enter)); err != nil {
		return fmt.Errorf("activate save request trigger: %w", err)
	}
	if err := w.run(chromedp.WaitVisible(
		`dialog[open] [data-save-form]`,
		chromedp.ByQuery,
	)); err != nil {
		return fmt.Errorf("open save request dialog: %w", err)
	}
	if err := shellPoll(
		w,
		`document.querySelector("dialog[open]")?.contains(
			document.activeElement,
		) ?? false`,
		"save dialog did not receive focus",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const dialog = document.querySelector("dialog[open]");
		const focusables = [...dialog.querySelectorAll(
			'button:not([disabled]), input:not([disabled]), ' +
			'select:not([disabled]), textarea:not([disabled]), ' +
			'[tabindex]:not([tabindex="-1"])',
		)].filter((element) => element.getClientRects().length > 0);
		focusables.at(-1)?.focus();
		return true;
	})()`, nil)); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(kb.Tab)); err != nil {
		return err
	}
	var trapped bool
	if err := w.run(chromedp.Evaluate(
		`document.querySelector("dialog[open]")?.contains(document.activeElement) ?? false`,
		&trapped,
	)); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(
		kb.Tab,
		chromedp.KeyModifiers(input.ModifierShift),
	)); err != nil {
		return err
	}
	var reverseTrapped bool
	if err := w.run(chromedp.Evaluate(
		`document.querySelector("dialog[open]")?.contains(document.activeElement) ?? false`,
		&reverseTrapped,
	)); err != nil {
		return err
	}
	trapped = trapped && reverseTrapped
	if err := w.run(chromedp.KeyEvent(kb.Escape)); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		`!document.querySelector("dialog[open]") &&
			document.activeElement?.matches(
				'[data-action="save-request"]',
			)`,
		"save dialog did not close and restore focus to its trigger",
	); err != nil {
		return err
	}
	return w.run(chromedp.Evaluate(fmt.Sprintf(
		`globalThis.__VALIDEX_E2E_DIALOG__ = { trapped: %t, returned: %t }`,
		trapped,
		true,
	), nil))
}

func (w *browserWorld) responsiveDialogFocusIsPreserved() error {
	var result struct {
		Returned bool `json:"returned"`
		Trapped  bool `json:"trapped"`
	}
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E_DIALOG__ ?? {}`,
		&result,
	)); err != nil {
		return err
	}
	if !result.Trapped || !result.Returned {
		return fmt.Errorf(
			"save dialog focus = trapped %t, returned %t",
			result.Trapped,
			result.Returned,
		)
	}
	return nil
}

func responsiveResizeSeparator(
	w *browserWorld,
	selector, key, name string,
) error {
	var before struct {
		Max  int    `json:"max"`
		Min  int    `json:"min"`
		Now  int    `json:"now"`
		Text string `json:"text"`
	}
	if err := w.run(chromedp.Evaluate(fmt.Sprintf(`(() => {
		const separator = document.querySelector(%q);
		return {
			min: Number(separator?.getAttribute("aria-valuemin")),
			max: Number(separator?.getAttribute("aria-valuemax")),
			now: Number(separator?.getAttribute("aria-valuenow")),
			text: separator?.getAttribute("aria-valuetext") ?? "",
		};
	})()`, selector), &before)); err != nil {
		return err
	}
	if err := responsiveFocusAfterRenderSettles(
		w,
		selector,
		fmt.Sprintf("%s separator did not receive stable focus", name),
	); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(key)); err != nil {
		return fmt.Errorf("resize %s separator: %w", name, err)
	}
	if err := shellPoll(
		w,
		fmt.Sprintf(`(() => {
			const separator = document.querySelector(%q);
			return separator?.getAttribute("aria-valuenow") !== %q;
		})()`, selector, fmt.Sprint(before.Now)),
		fmt.Sprintf("%s separator value did not update", name),
	); err != nil {
		return err
	}
	var after struct {
		Max   int    `json:"max"`
		Min   int    `json:"min"`
		Now   int    `json:"now"`
		Text  string `json:"text"`
		Value string `json:"value"`
	}
	if err := w.run(chromedp.Evaluate(fmt.Sprintf(`(() => {
		const separator = document.querySelector(%q);
		return {
			min: Number(separator?.getAttribute("aria-valuemin")),
			max: Number(separator?.getAttribute("aria-valuemax")),
			now: Number(separator?.getAttribute("aria-valuenow")),
			text: separator?.getAttribute("aria-valuetext") ?? "",
			value: separator?.getAttribute("aria-valuenow") ?? "",
		};
	})()`, selector), &after)); err != nil {
		return err
	}
	valid := after.Value != "" &&
		after.Now >= after.Min &&
		after.Now <= after.Max &&
		after.Now != before.Now &&
		(after.Text != "" || name != "response")
	if err := w.run(chromedp.Evaluate(fmt.Sprintf(`(() => {
		const state = globalThis.__VALIDEX_E2E_SEPARATOR__ ??= {};
		state[%q] = {
			valid: %t,
			before: %d,
			after: %d,
			min: %d,
			max: %d,
			text: %q,
		};
		return true;
	})()`,
		name,
		valid,
		before.Now,
		after.Now,
		after.Min,
		after.Max,
		after.Text,
	), nil)); err != nil {
		return err
	}
	return nil
}

func (w *browserWorld) responsiveResizePanelsWithKeyboard() error {
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E_SEPARATOR__ = {}`,
		nil,
	)); err != nil {
		return err
	}
	if err := responsiveResizeSeparator(
		w,
		`[data-resizer="left"]`,
		kb.ArrowRight,
		"left",
	); err != nil {
		return err
	}
	if err := responsiveResizeSeparator(
		w,
		`[data-resizer="right"]`,
		kb.ArrowRight,
		"right",
	); err != nil {
		return err
	}
	return responsiveResizeSeparator(
		w,
		`[data-response-resizer]`,
		kb.ArrowLeft,
		"response",
	)
}

func (w *browserWorld) responsiveSeparatorsAnnounceValues() error {
	var result map[string]struct {
		After  int    `json:"after"`
		Before int    `json:"before"`
		Max    int    `json:"max"`
		Min    int    `json:"min"`
		Text   string `json:"text"`
		Valid  bool   `json:"valid"`
	}
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E_SEPARATOR__ ?? {}`,
		&result,
	)); err != nil {
		return err
	}
	for _, name := range []string{"left", "right", "response"} {
		value, ok := result[name]
		if !ok || !value.Valid {
			return fmt.Errorf(
				"%s separator did not announce a bounded update: %+v",
				name,
				value,
			)
		}
	}
	return nil
}

func (w *browserWorld) responsiveOpenAndDismissContextMenu() error {
	var hasCollection bool
	if err := w.run(chromedp.Evaluate(
		`Boolean(document.querySelector(".collection-row"))`,
		&hasCollection,
	)); err != nil {
		return err
	}
	if !hasCollection {
		if err := w.run(
			chromedp.Click(
				`[data-sidebar] [data-action="new-collection"]`,
				chromedp.ByQuery,
			),
			chromedp.WaitVisible(
				`dialog[open] [name="collectionName"]`,
				chromedp.ByQuery,
			),
			chromedp.SetValue(
				`dialog[open] [name="collectionName"]`,
				"Keyboard menu E2E",
				chromedp.ByQuery,
			),
		); err != nil {
			return fmt.Errorf(
				"create a keyboard-addressable collection row: %w",
				err,
			)
		}
		if err := shellPoll(
			w,
			`document.querySelector(
				"dialog[open] [data-create-submit]",
			)?.disabled === false`,
			"new collection form did not become submittable",
		); err != nil {
			return err
		}
		if err := w.run(
			chromedp.Focus(
				`dialog[open] [name="collectionName"]`,
				chromedp.ByQuery,
			),
			chromedp.KeyEvent(kb.Enter),
			chromedp.WaitNotPresent("dialog[open]", chromedp.ByQuery),
		); err != nil {
			return fmt.Errorf("submit new collection with keyboard: %w", err)
		}
		if err := shellPoll(
			w,
			`Boolean(document.querySelector(".collection-row"))`,
			"new collection row did not render",
		); err != nil {
			return err
		}
	}

	var originID string
	if err := responsiveFocusAfterRenderSettles(
		w,
		`.collection-row`,
		"collection row did not receive keyboard focus",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.Evaluate(
		`document.activeElement?.dataset.libraryItemId ?? ""`,
		&originID,
	)); err != nil {
		return err
	}
	if originID == "" {
		return fmt.Errorf("keyboard context-menu origin has no collection ID")
	}
	if err := w.run(chromedp.KeyEvent(
		kb.F10,
		chromedp.KeyModifiers(input.ModifierShift),
	)); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		`Boolean(document.querySelector(
			'[role="menu"] [role="menuitem"]',
		))`,
		"Shift+F10 did not open the collection context menu",
	); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		`document.querySelector('[role="menu"]')?.contains(
			document.activeElement,
		) ?? false`,
		"context menu did not receive keyboard focus",
	); err != nil {
		return err
	}
	if err := w.run(chromedp.KeyEvent(kb.Escape)); err != nil {
		return err
	}
	if err := shellPoll(
		w,
		`!document.querySelector('[role="menu"]')`,
		"Escape did not dismiss the collection context menu",
	); err != nil {
		return err
	}
	var returned bool
	if err := w.run(chromedp.Evaluate(fmt.Sprintf(
		`document.activeElement?.dataset.libraryItemId === %q`,
		originID,
	), &returned)); err != nil {
		return err
	}
	return w.run(chromedp.Evaluate(fmt.Sprintf(
		`globalThis.__VALIDEX_E2E_CONTEXT_MENU__ = { originID: %q, returned: %t }`,
		originID,
		returned,
	), nil))
}

func (w *browserWorld) responsiveContextMenuRestoresFocus() error {
	var result struct {
		OriginID string `json:"originID"`
		Returned bool   `json:"returned"`
	}
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E_CONTEXT_MENU__ ?? {}`,
		&result,
	)); err != nil {
		return err
	}
	if result.OriginID == "" || !result.Returned {
		return fmt.Errorf(
			"context menu focus did not return to %q",
			result.OriginID,
		)
	}
	return nil
}
