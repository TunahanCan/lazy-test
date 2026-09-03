package e2e

import (
	"fmt"

	"github.com/chromedp/chromedp"
	"github.com/cucumber/godog"
)

func registerSmokeSteps(context *godog.ScenarioContext, world *browserWorld) {
	context.Step(
		`^Validex is open with the deterministic bridge$`,
		world.openPage,
	)
	context.Step(
		`^the application shell is ready$`,
		world.applicationShellIsReady,
	)
	context.Step(
		`^all workspace navigation entries are rendered$`,
		world.allWorkspaceEntriesAreRendered,
	)
	context.Step(
		`^the getting started guide contains three actionable steps$`,
		world.gettingStartedGuideContainsThreeSteps,
	)
	context.Step(
		`^I select the "([^"]+)" workspace$`,
		world.selectWorkspace,
	)
	context.Step(
		`^the "([^"]+)" workspace is active and visible$`,
		world.workspaceIsActiveAndVisible,
	)
	context.Step(
		`^I cancel unknown request and tool operation identifiers$`,
		world.cancelUnknownOperationIdentifiers,
	)
	context.Step(
		`^neither unknown operation is reported as canceled$`,
		world.unknownOperationIdentifiersAreNotCanceled,
	)
}

func (w *browserWorld) applicationShellIsReady() error {
	var ready bool
	if err := w.run(chromedp.Evaluate(
		`Boolean(
			document.querySelector(".app-shell") &&
			document.querySelector(".topbar") &&
			document.querySelector(".statusbar")
		)`,
		&ready,
	)); err != nil {
		return err
	}
	if !ready {
		return fmt.Errorf("application shell chrome is incomplete")
	}
	return nil
}

func (w *browserWorld) allWorkspaceEntriesAreRendered() error {
	var count int
	if err := w.run(
		chromedp.Evaluate(
			`document.querySelectorAll("[data-workspace-view]").length`,
			&count,
		),
	); err != nil {
		return err
	}
	if count != 7 {
		return fmt.Errorf("workspace navigation entries = %d, want 7", count)
	}
	return nil
}

func (w *browserWorld) gettingStartedGuideContainsThreeSteps() error {
	var result struct {
		Count     int  `json:"count"`
		AllNamed  bool `json:"allNamed"`
		AllGuided bool `json:"allGuided"`
	}
	if err := w.run(
		chromedp.WaitVisible(".welcome-guide", chromedp.ByQuery),
		chromedp.Evaluate(`(() => {
			const steps = [...document.querySelectorAll(".welcome-guide li")];
			return {
				count: steps.length,
				allNamed: steps.every((step) =>
					Boolean(step.querySelector("strong")?.textContent?.trim())
				),
				allGuided: steps.every((step) =>
					Boolean(step.querySelector("p")?.textContent?.trim())
				),
			};
		})()`, &result),
	); err != nil {
		return err
	}
	if result.Count != 3 || !result.AllNamed || !result.AllGuided {
		return fmt.Errorf("getting started guide is incomplete: %+v", result)
	}
	return nil
}

func (w *browserWorld) selectWorkspace(workspace string) error {
	selector := fmt.Sprintf(`[data-workspace-view="%s"]`, workspace)
	return w.run(
		chromedp.WaitVisible(selector, chromedp.ByQuery),
		chromedp.Click(selector, chromedp.ByQuery),
	)
}

func (w *browserWorld) workspaceIsActiveAndVisible(workspace string) error {
	navigation := fmt.Sprintf(`[data-workspace-view="%s"]`, workspace)
	host := `[data-request-layout]`
	if workspace != "requests" {
		host = fmt.Sprintf(`[data-tool-view="%s"]`, workspace)
	}
	var selected string
	var hidden bool
	if err := w.run(
		chromedp.WaitVisible(host, chromedp.ByQuery),
		chromedp.AttributeValue(navigation, "aria-current", &selected, nil),
		chromedp.Evaluate(
			fmt.Sprintf(`document.querySelector(%q).hidden`, host),
			&hidden,
		),
	); err != nil {
		return err
	}
	if selected != "page" {
		return fmt.Errorf(
			"workspace %q aria-current = %q, want page",
			workspace,
			selected,
		)
	}
	if hidden {
		return fmt.Errorf("workspace %q host is hidden", workspace)
	}
	return nil
}

func (w *browserWorld) cancelUnknownOperationIdentifiers() error {
	return w.run(chromedp.Evaluate(`Promise.all([
		globalThis.canbridge.Bridge.CancelRequest("missing-request"),
		globalThis.canbridge.Bridge.CancelToolOperation("missing-tool"),
	]).then(([requestCanceled, toolCanceled]) => {
		globalThis.__VALIDEX_E2E_CANCEL_CONTRACT__ = {
			requestCanceled,
			toolCanceled,
		};
		return true;
	})`, nil))
}

func (w *browserWorld) unknownOperationIdentifiersAreNotCanceled() error {
	var result struct {
		RequestCanceled bool `json:"requestCanceled"`
		ToolCanceled    bool `json:"toolCanceled"`
	}
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E_CANCEL_CONTRACT__ ?? {}`,
		&result,
	)); err != nil {
		return err
	}
	if result.RequestCanceled || result.ToolCanceled {
		return fmt.Errorf(
			"unknown cancellation result = request %t, tool %t; want both false",
			result.RequestCanceled,
			result.ToolCanceled,
		)
	}
	return nil
}
