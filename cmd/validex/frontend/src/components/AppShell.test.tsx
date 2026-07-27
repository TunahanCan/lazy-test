import * as Tooltip from "@radix-ui/react-tooltip";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toolWorkspaceDefinitions } from "../app/workspaceRegistry";
import { translate } from "../i18n";
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
  return render(
    <Tooltip.Provider>
      <AppShell bootstrap={bootstrap} />
    </Tooltip.Provider>,
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
      activeView: "requests",
      commandPaletteOpen: false,
      sidebarSection: "requests",
      latestImportedSpec: undefined,
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
      name: "Resize request panel",
    });
    const rightSeparator = screen.getByRole("separator", {
      name: "Resize context panel",
    });

    expect(useWorkspaceStore.getState().leftWidth).toBe(440);
    expect(useWorkspaceStore.getState().rightWidth).toBe(440);
    expect(leftSeparator).toHaveAttribute("tabindex", "0");
    expect(leftSeparator).toHaveAttribute("aria-controls", "request-panel");
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

  it("uses dismissible panel drawers on compact screens", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const { container } = renderShell();

    await waitFor(() => {
      expect(
        (container.querySelector(".workspace-layout") as HTMLElement).style
          .gridTemplateColumns,
      ).toBe("0px 0px minmax(0px, 1fr) 0px 0px");
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Show request panel" }),
    );
    expect(
      screen.getByRole("button", { name: "Close request panel" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close side panel" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Close request panel" }),
    );
    expect(
      screen.queryByRole("button", { name: "Close request panel" }),
    ).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().leftVisible).toBe(true);
  });

  it("keeps the response vertically readable on compact screens", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const tab = createRequestTab({ id: "compact-horizontal" });
    useWorkspaceStore.setState({
      tabs: [tab],
      activeTabID: tab.id,
      responsePlacement: "horizontal",
    });
    const { container } = renderShell();

    await waitFor(() => {
      expect(container.querySelector(".workspace-layout")).toHaveClass(
        "compact-layout",
      );
    });
    expect(container.querySelector(".request-workbench")).not.toHaveClass(
      "response-horizontal",
    );
    expect(
      screen.getByRole("separator", {
        name: "Resize request and response areas",
      }),
    ).toHaveAttribute("aria-orientation", "horizontal");
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
      "Couldn’t import OpenAPI: file dialog unavailable",
    );
  });

  it("leaves the workspace unchanged when OpenAPI selection is canceled", async () => {
    const importOpenAPI = vi
      .spyOn(backend, "importOpenAPI")
      .mockResolvedValueOnce({
        specId: "",
        path: "",
        title: "",
        version: "",
        baseUrl: "",
        endpoints: [],
        canceled: true,
      });
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Import OpenAPI" }));

    await waitFor(() => expect(importOpenAPI).toHaveBeenCalledOnce());
    expect(useWorkspaceStore.getState().latestImportedSpec).toBeUndefined();
    expect(useWorkspaceStore.getState().tabs).toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("loads every welcome-screen endpoint into the API browser without opening tabs", async () => {
    const endpoints = Array.from({ length: 10 }, (_, index) => ({
      id: `operation-${index}`,
      method: "GET" as const,
      path: `/resources/${index}`,
      summary: `Resource ${index}`,
      tags: ["resources"],
    }));
    vi.spyOn(backend, "importOpenAPI").mockResolvedValueOnce({
      specId: "commerce-spec",
      path: "/tmp/openapi.yaml",
      title: "Commerce API",
      version: "1.0.0",
      baseUrl: "https://api.example.test",
      endpoints,
      canceled: false,
    });
    useWorkspaceStore.setState({ leftVisible: false });
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Import OpenAPI" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Commerce API · 10 endpoints loaded. Open them from the APIs section.",
    );
    await waitFor(() =>
      expect(useWorkspaceStore.getState().latestImportedSpec?.endpoints).toHaveLength(
        10,
      ),
    );
    const state = useWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(0);
    expect(state.sidebarSection).toBe("apis");
    expect(state.leftVisible).toBe(true);
  });

  it("launches every quick tool from the workspace registry", () => {
    renderShell();

    const quickTools = screen.getByRole("region", { name: "Quick tools" });
    expect(within(quickTools).getAllByRole("button")).toHaveLength(
      toolWorkspaceDefinitions.length,
    );

    for (const definition of toolWorkspaceDefinitions) {
      const label = translate("en", definition.labelKey);
      const description = translate("en", definition.descriptionKey);
      const launch = within(quickTools).getByRole("button", {
        name: `Open ${label}`,
      });
      expect(launch).toHaveTextContent(label);
      expect(launch).toHaveTextContent(description);

      launch.focus();
      expect(launch).toHaveFocus();
      fireEvent.click(launch);
      expect(useWorkspaceStore.getState().activeView).toBe(definition.id);

      fireEvent.click(screen.getByRole("button", { name: "Requests" }));
      expect(useWorkspaceStore.getState().activeView).toBe("requests");
    }
  });

  it("loads developer workspaces on demand and returns to requests", async () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "JSON Lab" }));
    expect(
      await screen.findByRole("heading", { name: "JSON Lab" }),
    ).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "JSON input" }), {
      target: { value: '{"preserved":true}' },
    });

    fireEvent.click(screen.getByRole("button", { name: "Requests" }));
    expect(
      await screen.findByRole("heading", {
        name: "Bring all your API work into one place.",
      }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "JSON Lab" }));
    expect(
      await screen.findByRole("textbox", { name: "JSON input" }),
    ).toHaveValue('{"preserved":true}');
  });
});
