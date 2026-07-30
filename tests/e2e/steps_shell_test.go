package e2e

import (
	"fmt"
	"runtime"
	"strings"
	"time"

	"github.com/chromedp/cdproto/input"
	"github.com/chromedp/chromedp"
	"github.com/chromedp/chromedp/kb"
	"github.com/cucumber/godog"
)

var shellWorkspaceIDs = map[string]string{
	"Requests":    "requests",
	"Mock":        "mock",
	"JSON":        "json",
	"Diagnostics": "diagnostics",
	"Protocols":   "protocols",
	"Automation":  "automation",
}

func shellPlatformCommandModifier() input.Modifier {
	if runtime.GOOS == "darwin" {
		return input.ModifierMeta
	}
	return input.ModifierCtrl
}

func registerShellSteps(context *godog.ScenarioContext, world *browserWorld) {
	context.Step(
		`^I open the "([^"]+)" workspace from the activity navigation$`,
		world.shellOpenWorkspace,
	)
	context.Step(
		`^the "([^"]+)" workspace is the only active workspace$`,
		world.shellWorkspaceIsOnlyActive,
	)
	context.Step(
		`^the "([^"]+)" workspace heading is visible$`,
		world.shellWorkspaceHeadingIsVisible,
	)
	context.Step(
		`^I open the command palette with the platform shortcut$`,
		world.shellOpenCommandPalette,
	)
	context.Step(
		`^I search the command palette for "([^"]+)"$`,
		world.shellSearchCommandPalette,
	)
	context.Step(
		`^the matching command count and selected command are announced$`,
		world.shellPaletteSelectionIsAnnounced,
	)
	context.Step(
		`^I run the selected command with the keyboard$`,
		world.shellRunSelectedPaletteCommand,
	)
	context.Step(
		`^the "([^"]+)" workspace is active$`,
		world.shellWorkspaceIsActive,
	)
	context.Step(
		`^focus moves to the JSON workspace heading$`,
		world.shellFocusIsOnJSONHeading,
	)
	context.Step(
		`^both request side panels are visible$`,
		world.shellShowBothRequestPanels,
	)
	context.Step(
		`^I hide the request library from layout settings$`,
		world.shellHideRequestLibrary,
	)
	context.Step(
		`^the request library is hidden and its restore control is visible$`,
		world.shellRequestLibraryIsHidden,
	)
	context.Step(
		`^I move the response panel using layout settings$`,
		world.shellMoveResponsePanel,
	)
	context.Step(
		`^the response panel uses the alternate desktop placement$`,
		world.shellResponseUsesAlternatePlacement,
	)
	context.Step(
		`^I reset the workspace layout$`,
		world.shellResetWorkspaceLayout,
	)
	context.Step(
		`^the default spacious request layout is restored$`,
		world.shellDefaultLayoutIsRestored,
	)
	context.Step(
		`^I select the "([^"]+)" theme from layout settings$`,
		world.shellSelectTheme,
	)
	context.Step(
		`^the persisted theme preference is "([^"]+)"$`,
		world.shellThemeIsPersisted,
	)
	context.Step(
		`^the application uses the expected "([^"]+)" color scheme$`,
		world.shellExpectedColorSchemeIsUsed,
	)
	context.Step(
		`^application bootstrap fails with technical details$`,
		world.shellConfigureBootstrapFailure,
	)
	context.Step(
		`^I launch Validex$`,
		world.shellLaunchWithBootstrapFailure,
	)
	context.Step(
		`^a bootstrap error with retry and details actions is shown$`,
		world.shellBootstrapErrorActionsAreShown,
	)
	context.Step(
		`^I reveal the bootstrap technical details$`,
		world.shellRevealBootstrapDetails,
	)
	context.Step(
		`^the bridge failure details are visible$`,
		world.shellBootstrapDetailsAreVisible,
	)
	context.Step(
		`^the next bootstrap attempt succeeds$`,
		world.shellConfigureBootstrapSuccess,
	)
	context.Step(
		`^I retry application bootstrap$`,
		world.shellRetryBootstrap,
	)
	context.Step(
		`^the application shell becomes ready$`,
		world.applicationShellIsReady,
	)
	context.Step(
		`^the bootstrap error is no longer present$`,
		world.shellBootstrapErrorIsGone,
	)
}

func shellWorkspaceID(workspace string) (string, error) {
	id := shellWorkspaceIDs[workspace]
	if id == "" {
		return "", fmt.Errorf("unknown workspace %q", workspace)
	}
	return id, nil
}

func shellPoll(world *browserWorld, expression, description string) error {
	var ready bool
	if err := world.run(chromedp.Poll(
		expression,
		&ready,
		chromedp.WithPollingInterval(25*time.Millisecond),
		chromedp.WithPollingTimeout(8*time.Second),
	)); err != nil {
		return fmt.Errorf("%s: %w", description, err)
	}
	if !ready {
		return fmt.Errorf("%s", description)
	}
	return nil
}

func shellVisibleExpression(selector string) string {
	return fmt.Sprintf(`(() => {
		const element = document.querySelector(%q);
		if (!element || element.hidden) return false;
		const style = getComputedStyle(element);
		const rect = element.getBoundingClientRect();
		return style.display !== "none" && style.visibility !== "hidden" &&
			rect.width > 0 && rect.height > 0;
	})()`, selector)
}

func (w *browserWorld) shellOpenWorkspace(workspace string) error {
	id, err := shellWorkspaceID(workspace)
	if err != nil {
		return err
	}
	selector := fmt.Sprintf(`[data-workspace-view="%s"]`, id)
	if err := w.run(
		chromedp.WaitVisible(selector, chromedp.ByQuery),
		chromedp.Click(selector, chromedp.ByQuery),
	); err != nil {
		return fmt.Errorf("open %s workspace: %w", workspace, err)
	}
	host := `[data-request-layout]`
	if id != "requests" {
		host = fmt.Sprintf(`[data-tool-view="%s"]`, id)
	}
	return shellPoll(
		w,
		shellVisibleExpression(host),
		fmt.Sprintf("%s workspace did not become visible", workspace),
	)
}

func (w *browserWorld) shellWorkspaceIsOnlyActive(workspace string) error {
	id, err := shellWorkspaceID(workspace)
	if err != nil {
		return err
	}
	var result struct {
		Active string `json:"active"`
		Count  int    `json:"count"`
	}
	if err := w.run(chromedp.Evaluate(fmt.Sprintf(`(() => {
		const active = [
			...document.querySelectorAll(
				'[data-workspace-view][aria-current="page"]',
			),
		];
		return {
			count: active.length,
			active: active[0]?.dataset.workspaceView ?? "",
		};
	})()`), &result)); err != nil {
		return err
	}
	if result.Count != 1 || result.Active != id {
		return fmt.Errorf(
			"active workspace state = count %d, id %q; want one %q",
			result.Count,
			result.Active,
			id,
		)
	}
	return nil
}

func (w *browserWorld) shellWorkspaceHeadingIsVisible(
	expectedHeading string,
) error {
	if err := shellPoll(
		w,
		`(() => {
			const id = document.querySelector(
				'[data-workspace-view][aria-current="page"]',
			)?.dataset.workspaceView;
			const host = id === "requests"
				? document.querySelector("[data-request-layout]")
				: document.querySelector('[data-tool-view="' + id + '"]');
			const heading = host?.querySelector("h1");
			const rect = heading?.getBoundingClientRect();
			return Boolean(
				heading && rect && rect.width > 0 && rect.height > 0 &&
					getComputedStyle(heading).visibility !== "hidden",
			);
		})()`,
		"active workspace did not expose a visible h1 heading",
	); err != nil {
		return err
	}
	var result struct {
		Heading string `json:"heading"`
		Label   string `json:"label"`
		Visible bool   `json:"visible"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const navigation = document.querySelector(
			'[data-workspace-view][aria-current="page"]',
		);
		const id = navigation?.dataset.workspaceView;
		const host = id === "requests"
			? document.querySelector("[data-request-layout]")
			: document.querySelector('[data-tool-view="' + id + '"]');
		const heading = host?.querySelector("h1");
		const rect = heading?.getBoundingClientRect();
		return {
			heading: heading?.textContent?.trim() ?? "",
			label: host?.getAttribute("aria-label") ?? "",
			visible: Boolean(
				heading && rect && rect.width > 0 && rect.height > 0 &&
				getComputedStyle(heading).visibility !== "hidden",
			),
		};
	})()`, &result)); err != nil {
		return err
	}
	if !result.Visible {
		return fmt.Errorf("active workspace does not expose a visible h1 heading")
	}
	if result.Heading != expectedHeading && result.Label != expectedHeading {
		return fmt.Errorf(
			"workspace heading = %q (label %q), want %q",
			result.Heading,
			result.Label,
			expectedHeading,
		)
	}
	return nil
}

func (w *browserWorld) shellHasNoFrontendError() error {
	if errorsFound := w.errors(); len(errorsFound) > 0 {
		return fmt.Errorf(
			"uncaught frontend errors:\n%s",
			strings.Join(errorsFound, "\n"),
		)
	}
	return nil
}

func (w *browserWorld) shellOpenCommandPalette() error {
	if err := w.run(
		chromedp.KeyEvent(
			"k",
			chromedp.KeyModifiers(shellPlatformCommandModifier()),
		),
		chromedp.WaitVisible("[data-palette-input]", chromedp.ByQuery),
	); err != nil {
		return fmt.Errorf("open command palette with Control+K: %w", err)
	}
	return nil
}

func (w *browserWorld) shellSearchCommandPalette(query string) error {
	return w.run(
		chromedp.Focus("[data-palette-input]", chromedp.ByQuery),
		chromedp.SetValue("[data-palette-input]", query, chromedp.ByQuery),
		chromedp.WaitVisible(
			`[data-palette-results] [role="option"]`,
			chromedp.ByQuery,
		),
	)
}

func (w *browserWorld) shellPaletteSelectionIsAnnounced() error {
	var result struct {
		Count            int    `json:"count"`
		Selected         int    `json:"selected"`
		ActiveDescendant string `json:"activeDescendant"`
		Footer           string `json:"footer"`
		FooterRole       string `json:"footerRole"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const input = document.querySelector("[data-palette-input]");
		const options = [
			...document.querySelectorAll(
				'[data-palette-results] [role="option"]',
			),
		];
		const footer = document.querySelector("[data-palette-footer]");
		return {
			count: options.length,
			selected: options.filter(
				(option) => option.getAttribute("aria-selected") === "true",
			).length,
			activeDescendant: input?.getAttribute("aria-activedescendant") ?? "",
			footer: footer?.textContent?.trim() ?? "",
			footerRole: footer?.getAttribute("role") ?? "",
		};
	})()`, &result)); err != nil {
		return err
	}
	if result.Count < 1 || result.Selected != 1 {
		return fmt.Errorf(
			"palette has %d matches and %d selected; want at least one and exactly one",
			result.Count,
			result.Selected,
		)
	}
	if result.ActiveDescendant == "" {
		return fmt.Errorf("palette combobox does not announce its selected option")
	}
	if result.FooterRole != "status" || result.Footer == "" {
		return fmt.Errorf(
			"palette result count is not exposed through a populated status region",
		)
	}
	return nil
}

func (w *browserWorld) shellRunSelectedPaletteCommand() error {
	return w.run(
		chromedp.Focus("[data-palette-input]", chromedp.ByQuery),
		chromedp.KeyEvent(kb.Enter),
		chromedp.WaitNotPresent("[data-palette-input]", chromedp.ByQuery),
	)
}

func (w *browserWorld) shellWorkspaceIsActive(workspace string) error {
	id, err := shellWorkspaceID(workspace)
	if err != nil {
		return err
	}
	return shellPoll(
		w,
		fmt.Sprintf(
			`document.querySelector(%q)?.getAttribute("aria-current") === "page"`,
			fmt.Sprintf(`[data-workspace-view="%s"]`, id),
		),
		fmt.Sprintf("%s workspace is not active", workspace),
	)
}

func (w *browserWorld) shellFocusIsOnJSONHeading() error {
	return shellPoll(
		w,
		`(() => {
			const heading = document.querySelector(
				'[data-tool-view="json"]:not([hidden]) h1',
			);
			return Boolean(heading && document.activeElement === heading);
		})()`,
		"focus did not move to the JSON workspace heading",
	)
}

func (w *browserWorld) shellShowBothRequestPanels() error {
	if err := w.run(chromedp.Evaluate(`(() => {
		const left = document.querySelector("[data-left-panel]");
		const right = document.querySelector("[data-right-panel]");
		if (left?.getAttribute("aria-hidden") === "true") {
			document.querySelector('[data-action="restore-left"]')?.click();
		}
		if (right?.getAttribute("aria-hidden") === "true") {
			document.querySelector('[data-action="restore-right"]')?.click();
		}
		return true;
	})()`, nil)); err != nil {
		return err
	}
	return shellPoll(
		w,
		`document.querySelector("[data-left-panel]")?.getAttribute("aria-hidden") === "false" &&
		 document.querySelector("[data-right-panel]")?.getAttribute("aria-hidden") === "false"`,
		"both request side panels did not become visible",
	)
}

func (w *browserWorld) shellOpenSettings() error {
	return w.run(
		chromedp.Click(`[data-action="settings"]`, chromedp.ByQuery),
		chromedp.WaitVisible(`[role="menu"]`, chromedp.ByQuery),
	)
}

func (w *browserWorld) shellClickMenuItem(label string) error {
	var clicked bool
	if err := w.run(chromedp.Evaluate(fmt.Sprintf(`(() => {
		const expected = %q.toLocaleLowerCase();
		const item = [...document.querySelectorAll('[role="menuitem"]')]
			.find((candidate) =>
				candidate.textContent?.trim().toLocaleLowerCase().includes(expected),
			);
		if (!item) return false;
		item.click();
		return true;
	})()`, label), &clicked)); err != nil {
		return err
	}
	if !clicked {
		return fmt.Errorf("settings menu item containing %q was not found", label)
	}
	return nil
}

func (w *browserWorld) shellHideRequestLibrary() error {
	if err := w.shellOpenSettings(); err != nil {
		return err
	}
	return w.shellClickMenuItem("request panel")
}

func (w *browserWorld) shellRequestLibraryIsHidden() error {
	return shellPoll(
		w,
		`(() => {
			const panel = document.querySelector("[data-left-panel]");
			const restore = document.querySelector('[data-action="restore-left"]');
			if (!panel || !restore) return false;
			const rect = restore.getBoundingClientRect();
			return panel.getAttribute("aria-hidden") === "true" &&
				!restore.hidden && rect.width > 0 && rect.height > 0;
		})()`,
		"request library was not hidden with a visible restore control",
	)
}

func (w *browserWorld) shellMoveResponsePanel() error {
	var hasWorkbench bool
	if err := w.run(chromedp.Evaluate(
		`Boolean(document.querySelector(".request-workbench"))`,
		&hasWorkbench,
	)); err != nil {
		return err
	}
	if !hasWorkbench {
		if err := w.run(
			chromedp.Click(`[data-action="new-request"]`, chromedp.ByQuery),
			chromedp.WaitVisible(".request-workbench", chromedp.ByQuery),
		); err != nil {
			return fmt.Errorf(
				"open a request before checking response placement: %w",
				err,
			)
		}
	}
	var before string
	if err := w.run(chromedp.Evaluate(
		`document.querySelector(".request-workbench")?.className ?? ""`,
		&before,
	)); err != nil {
		return err
	}
	if err := w.run(chromedp.Evaluate(fmt.Sprintf(
		`globalThis.__VALIDEX_E2E_SHELL__ = { responseClassBefore: %q }`,
		before,
	), nil)); err != nil {
		return err
	}
	if err := w.shellOpenSettings(); err != nil {
		return err
	}
	return w.shellClickMenuItem("response:")
}

func (w *browserWorld) shellResponseUsesAlternatePlacement() error {
	return shellPoll(
		w,
		`(() => {
			const before =
				globalThis.__VALIDEX_E2E_SHELL__?.responseClassBefore ?? "";
			const current =
				document.querySelector(".request-workbench")?.className ?? "";
			return current.includes("response-") && current !== before;
		})()`,
		"response panel placement did not change",
	)
}

func (w *browserWorld) shellResetWorkspaceLayout() error {
	if err := w.shellOpenSettings(); err != nil {
		return err
	}
	return w.shellClickMenuItem("reset layout")
}

func (w *browserWorld) shellDefaultLayoutIsRestored() error {
	return shellPoll(
		w,
		`(() => {
			const left = document.querySelector("[data-left-panel]");
			const right = document.querySelector("[data-right-panel]");
			const workbench = document.querySelector(".request-workbench");
			return left?.getAttribute("aria-hidden") === "false" &&
				right?.getAttribute("aria-hidden") === "true" &&
				workbench?.classList.contains("response-horizontal");
		})()`,
		"default request workspace layout was not restored",
	)
}

func (w *browserWorld) shellSelectTheme(theme string) error {
	labels := map[string]string{
		"system": "system theme",
		"light":  "light theme",
		"dark":   "dark theme",
	}
	label := labels[theme]
	if label == "" {
		return fmt.Errorf("unsupported theme %q", theme)
	}
	if err := w.shellOpenSettings(); err != nil {
		return err
	}
	return w.shellClickMenuItem(label)
}

func (w *browserWorld) shellThemeIsPersisted(theme string) error {
	var persisted string
	if err := w.run(chromedp.Evaluate(`(() => {
		const raw = localStorage.getItem(
			"validex:workspace:validex-workspace",
		);
		if (!raw) return "";
		const parsed = JSON.parse(raw);
		return parsed?.state?.theme ?? parsed?.theme ?? "";
	})()`, &persisted)); err != nil {
		return err
	}
	if persisted != theme {
		return fmt.Errorf("persisted theme = %q, want %q", persisted, theme)
	}
	return nil
}

func (w *browserWorld) shellExpectedColorSchemeIsUsed(theme string) error {
	var result struct {
		Dataset  string `json:"dataset"`
		Expected string `json:"expected"`
		Inline   string `json:"inline"`
		Computed string `json:"computed"`
	}
	if err := w.run(chromedp.Evaluate(fmt.Sprintf(`(() => {
		const preference = %q;
		const expected = preference === "system"
			? (matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light")
			: preference;
		return {
			expected,
			dataset: document.documentElement.dataset.theme ?? "",
			inline: document.documentElement.style.colorScheme ?? "",
			computed: getComputedStyle(document.documentElement).colorScheme,
		};
	})()`, theme), &result)); err != nil {
		return err
	}
	if result.Dataset != result.Expected || result.Inline != result.Expected {
		return fmt.Errorf(
			"resolved theme = dataset %q, inline scheme %q; want %q (computed %q)",
			result.Dataset,
			result.Inline,
			result.Expected,
			result.Computed,
		)
	}
	return nil
}

func (w *browserWorld) shellConfigureBootstrapFailure() error {
	w.closePage()
	const detail = "E2E bridge failure: bootstrap payload unavailable"
	w.initialConfig = map[string]any{
		"overrides": map[string]any{
			"Bootstrap": []any{
				map[string]any{"__reject": detail},
				map[string]any{"__reject": detail},
			},
		},
	}
	return nil
}

func (w *browserWorld) shellLaunchWithBootstrapFailure() error {
	if err := w.openPageUntil(
		chromedp.WaitVisible(
			`[data-startup-action="retry"]`,
			chromedp.ByQuery,
		),
	); err != nil {
		return fmt.Errorf("launch Validex into bootstrap recovery state: %w", err)
	}
	return nil
}

func (w *browserWorld) shellBootstrapErrorActionsAreShown() error {
	var result struct {
		Alert   bool `json:"alert"`
		Retry   bool `json:"retry"`
		Details bool `json:"details"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const visible = (element) => {
			const rect = element?.getBoundingClientRect();
			return Boolean(element && rect && rect.width > 0 && rect.height > 0);
		};
		return {
			alert: visible(document.querySelector('[role="alert"]')),
			retry: visible(document.querySelector(
				'[data-startup-action="retry"]',
			)),
			details: visible(document.querySelector(
				'[data-startup-action="details"]',
			)),
		};
	})()`, &result)); err != nil {
		return err
	}
	if !result.Alert || !result.Retry || !result.Details {
		return fmt.Errorf(
			"bootstrap recovery UI = alert %t, retry %t, details %t",
			result.Alert,
			result.Retry,
			result.Details,
		)
	}
	return nil
}

func (w *browserWorld) shellRevealBootstrapDetails() error {
	return w.run(
		chromedp.Click(
			`[data-startup-action="details"]`,
			chromedp.ByQuery,
		),
	)
}

func (w *browserWorld) shellBootstrapDetailsAreVisible() error {
	var content string
	if err := w.run(chromedp.Text(
		`[role="alert"]`,
		&content,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	if !strings.Contains(content, "E2E bridge failure") ||
		!strings.Contains(content, "bootstrap payload unavailable") {
		return fmt.Errorf("bootstrap technical details are missing: %q", content)
	}
	return nil
}

func (w *browserWorld) shellConfigureBootstrapSuccess() error {
	return w.run(chromedp.Evaluate(`globalThis.__VALIDEX_E2E__.configure({
		overrides: {
			Bootstrap: {
				appVersion: "0.2.0-e2e",
				workspaceId: "validex-e2e",
				workspaceName: "Recovered E2E Workspace",
				environments: [
					{ id: "none", name: "No Environment", variables: {} },
					{
						id: "local",
						name: "Local",
						variables: { baseUrl: "http://localhost:8080" },
					},
				],
				collections: [],
				history: [],
				recentUrls: [],
				onboardingSteps: [],
			},
		},
	})`, nil))
}

func (w *browserWorld) shellRetryBootstrap() error {
	if err := w.run(
		chromedp.Click(
			`[data-startup-action="retry"]`,
			chromedp.ByQuery,
		),
		chromedp.WaitVisible("[data-activity]", chromedp.ByQuery),
		chromedp.WaitReady("[data-workspace-view]", chromedp.ByQuery),
	); err != nil {
		return fmt.Errorf("retry application bootstrap: %w", err)
	}
	return nil
}

func (w *browserWorld) shellBootstrapErrorIsGone() error {
	var present bool
	if err := w.run(chromedp.Evaluate(
		`Boolean(document.querySelector('[data-startup-action="retry"], [role="alert"]'))`,
		&present,
	)); err != nil {
		return err
	}
	if present {
		return fmt.Errorf("bootstrap error UI remains after successful retry")
	}
	return nil
}
