package e2e

import (
	"os"
	"strings"
	"testing"

	"github.com/cucumber/godog"
)

func TestFeatures(t *testing.T) {
	harness := newTestHarness(t)
	defer func() {
		if err := harness.close(); err != nil {
			t.Errorf("close Cucumber browser harness: %v", err)
		}
	}()
	world := newBrowserWorld(harness)

	tags := strings.TrimSpace(os.Getenv("VALIDEX_E2E_TAGS"))

	suite := godog.TestSuite{
		Name: "validex-browser-acceptance",
		ScenarioInitializer: func(context *godog.ScenarioContext) {
			context.Before(world.beforeScenario)
			context.After(world.afterScenario)
			registerCommonSteps(context, world)
			registerSmokeSteps(context, world)
			registerShellSteps(context, world)
			registerRequestSteps(context, world)
			registerRequestContractCancellationSteps(context, world)
			registerRequestActionSteps(context, world)
			registerCollectionSteps(context, world)
			registerMockSteps(context, world)
			registerJSONSteps(context, world)
			registerDiagnosticsSteps(context, world)
			registerProtocolAutomationSteps(context, world)
			registerResponsiveSteps(context, world)
			registerStorageResilienceSteps(context, world)
			registerAuxiliaryActionSteps(context, world)
			registerSecondaryUISteps(context, world)
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"features"},
			Strict:   true,
			Tags:     tags,
			TestingT: t,
		},
	}
	if status := suite.Run(); status != 0 {
		t.Fatalf("Cucumber browser suite failed with status %d", status)
	}
}
