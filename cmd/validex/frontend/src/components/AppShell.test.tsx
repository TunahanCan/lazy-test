import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backend } from "../lib/backend";
import type { BootstrapData } from "../lib/types";
import {
  createRequestTab,
  useWorkspaceStore,
} from "../stores/workspace";
import { AppShell } from "./AppShell";

const bootstrap: BootstrapData = {
  appVersion: "test",
  workspaceId: "validex-workspace",
  workspaceName: "Validex Workspace",
  environments: [{ id: "none", name: "No Environment", variables: {} }],
  collections: [],
  history: [],
  recentUrls: [],
  onboardingSteps: [],
};

const originalInnerWidth = window.innerWidth;

function renderShell() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider>
        <AppShell bootstrap={bootstrap} />
      </Tooltip.Provider>
    </QueryClientProvider>,
  );
}

describe("AppShell keyboard and layout guards", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.persist.clearStorage();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1080,
    });
    useWorkspaceStore.setState({
      tabs: [],
      activeTabID: "",
      recentlyClosed: [],
      leftVisible: true,
      rightVisible: true,
      leftWidth: 440,
      rightWidth: 440,
      responsePlacement: "vertical",
      commandPaletteOpen: false,
      runnerOpen: false,
      codeGeneratorOpen: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("fits both side panels and exposes keyboard-operable separators", async () => {
    const { container } = renderShell();
    const leftSeparator = screen.getByRole("separator", {
      name: "Collection panelini yeniden boyutlandır",
    });
    const rightSeparator = screen.getByRole("separator", {
      name: "Context panelini yeniden boyutlandır",
    });

    expect(useWorkspaceStore.getState().leftWidth).toBe(440);
    expect(useWorkspaceStore.getState().rightWidth).toBe(440);
    expect(leftSeparator).toHaveAttribute("tabindex", "0");
    expect(leftSeparator).toHaveAttribute("aria-controls", "collection-panel");
    expect(leftSeparator).toHaveAttribute("aria-valuemin", "210");
    expect(leftSeparator).toHaveAttribute("aria-valuemax", "296");
    expect(leftSeparator).toHaveAttribute("aria-valuenow", "296");
    expect(rightSeparator).toHaveAttribute("aria-controls", "context-panel");
    expect(
      (container.querySelector(".workspace-layout") as HTMLElement).style
        .gridTemplateColumns,
    ).toBe("296px 4px minmax(480px, 1fr) 4px 296px");

    fireEvent.keyDown(leftSeparator, { key: "ArrowLeft" });
    await waitFor(() => {
      expect(useWorkspaceStore.getState().leftWidth).toBe(280);
      expect(useWorkspaceStore.getState().rightWidth).toBe(296);
      expect(leftSeparator).toHaveAttribute("aria-valuenow", "280");
    });
  });

  it("preserves the wider center area required by horizontal responses", async () => {
    useWorkspaceStore.setState({ responsePlacement: "horizontal" });
    const { container } = renderShell();

    await waitFor(() => {
      expect(
        (container.querySelector(".workspace-layout") as HTMLElement).style
          .gridTemplateColumns,
      ).toBe("206px 4px minmax(660px, 1fr) 4px 206px");
    });
  });

  it("does not cancel a running request while a dialog is open", async () => {
    const runningTab = createRequestTab({
      id: "running-request",
      name: "Running request",
      running: true,
    });
    useWorkspaceStore.setState({
      tabs: [runningTab],
      activeTabID: runningTab.id,
      rightVisible: false,
      leftWidth: 264,
    });
    const cancel = vi.spyOn(backend, "cancelRequest").mockResolvedValue(true);
    renderShell();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);

    fireEvent.keyDown(window, { key: "Escape" });
    await Promise.resolve();
    expect(cancel).not.toHaveBeenCalled();

    dialog.remove();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(runningTab.id));
  });

  it("shows native import failures on the welcome screen", async () => {
    vi.spyOn(backend, "importOpenAPI").mockRejectedValueOnce(
      new Error("file dialog unavailable"),
    );
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Import OpenAPI" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "OpenAPI içe aktarılamadı: file dialog unavailable",
    );
  });
});
