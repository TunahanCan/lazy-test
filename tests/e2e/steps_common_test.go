package e2e

import (
	"fmt"
	"strings"

	"github.com/cucumber/godog"
)

func registerCommonSteps(context *godog.ScenarioContext, world *browserWorld) {
	context.Step(
		`^Validex is running with a deterministic native bridge$`,
		world.openPage,
	)
	context.Step(
		`^I am in the "([^"]+)" workspace$`,
		world.openNamedWorkspace,
	)
}

func (w *browserWorld) openNamedWorkspace(label string) error {
	workspace, ok := map[string]string{
		"requests":    "requests",
		"mock":        "mock",
		"json":        "json",
		"diagnostics": "diagnostics",
		"performance": "performance",
		"protocols":   "protocols",
		"automation":  "automation",
	}[strings.ToLower(strings.TrimSpace(label))]
	if !ok {
		return fmt.Errorf("unknown workspace %q", label)
	}
	if err := w.selectWorkspace(workspace); err != nil {
		return fmt.Errorf("open %q workspace: %w", label, err)
	}
	return w.workspaceIsActiveAndVisible(workspace)
}
