import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BootstrapData } from "../lib/types";
import { useWorkspaceStore } from "../stores/workspace";
import { RunnerDialog } from "./RunnerDialog";

const emptyBootstrap: BootstrapData = {
  appVersion: "test",
  workspaceId: "empty",
  workspaceName: "Empty workspace",
  environments: [{ id: "local", name: "Local", variables: {} }],
  collections: [
    {
      id: "empty-collection",
      kind: "collection",
      name: "Empty collection",
      depth: 0,
    },
  ],
  history: [],
  recentUrls: [],
  onboardingSteps: [],
};

describe("Collection runner guards", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      runnerOpen: true,
      activeEnvironmentID: "local",
    });
  });
  afterEach(cleanup);

  it("does not start an empty collection", async () => {
    render(
      <Tooltip.Provider>
        <RunnerDialog bootstrap={emptyBootstrap} />
      </Tooltip.Provider>,
    );

    expect(
      await screen.findByText(/çalıştırılabilir request yok/i),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /Start run/i })).toBeDisabled();
    expect(screen.getByText("total requests").parentElement).toHaveTextContent(
      "0 total requests",
    );
  });
});
