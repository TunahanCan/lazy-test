import * as Tooltip from "@radix-ui/react-tooltip";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { LocaleProvider, localeStorageKey } from "../i18n";
import { backend } from "../lib/backend";
import type { BootstrapData, ImportedEndpoint } from "../lib/types";
import { useCollectionLibraryStore } from "../stores/collectionLibrary";
import {
  createRequestTab,
  useWorkspaceStore,
} from "../stores/workspace";
import { CommandPalette } from "./CommandPalette";
import { ContextPanel } from "./ContextPanel";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";

const emptyBootstrap: BootstrapData = {
  appVersion: "test",
  workspaceId: "validex-workspace",
  workspaceName: "Validex Workspace",
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
};

function renderWithProviders(children: ReactNode) {
  return render(
    <LocaleProvider>
      <Tooltip.Provider>{children}</Tooltip.Provider>
    </LocaleProvider>,
  );
}

function importedEndpoints(count: number): ImportedEndpoint[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `operation-${index}`,
    method: "GET",
    path: `/resources/${index}`,
    summary: `Resource ${index}`,
    tags: ["resources"],
  }));
}

describe("workspace chrome simplification", () => {
  beforeEach(() => {
    localStorage.clear();
    useCollectionLibraryStore.setState({
      collections: [],
      requests: [],
      expandedCollectionIds: [],
    });
    const tab = createRequestTab({ id: "workspace-chrome-test" });
    useWorkspaceStore.setState({
      activeEnvironmentID: "none",
      environmentVariables: {},
      tabs: [tab],
      activeTabID: tab.id,
      recentlyClosed: [],
      activeView: "requests",
      sidebarSection: "requests",
      latestImportedSpec: undefined,
      commandPaletteOpen: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("offers a persistent collection library without synthetic history", () => {
    useWorkspaceStore.setState({ tabs: [], activeTabID: "" });
    renderWithProviders(<Sidebar bootstrap={emptyBootstrap} />);

    expect(screen.getByRole("button", { name: "Collections" })).toBeVisible();
    expect(screen.getByRole("button", { name: "APIs" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "History" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", {
        name: "Search collections and requests",
      }),
    ).toBeVisible();

    fireEvent.click(
      screen.getAllByRole("button", { name: "New collection" })[0],
    );
    fireEvent.change(screen.getByLabelText("Collection name"), {
      target: { value: "Payments API" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create collection" }),
    );
    expect(useCollectionLibraryStore.getState().collections[0].name).toBe(
      "Payments API",
    );
  });

  it("makes every imported OpenAPI endpoint searchable and openable", () => {
    useWorkspaceStore.getState().setImportedSpec({
      specId: "commerce-spec",
      path: "/tmp/openapi.yaml",
      title: "Commerce API",
      version: "1.0.0",
      baseUrl: "/api/v1",
      endpoints: importedEndpoints(10),
      canceled: false,
    });
    renderWithProviders(<Sidebar bootstrap={emptyBootstrap} />);

    expect(screen.getByText("Resource 0")).toBeVisible();
    expect(screen.getByText("Resource 9")).toBeVisible();

    fireEvent.change(screen.getByRole("textbox", { name: "Search APIs" }), {
      target: { value: "resource 9" },
    });
    expect(screen.queryByText("Resource 0")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Resource 9"));

    const state = useWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[1]).toMatchObject({
      id: "openapi:commerce-spec:operation-9",
      url: "{{baseUrl}}/api/v1/resources/9",
      headers: [],
      openApi: { specId: "commerce-spec", path: "/resources/9" },
    });
  });

  it("opens a saved request from its collection without copying runtime state", () => {
    const collectionId =
      useCollectionLibraryStore.getState().createCollection("Payments API")!;
    const requestId = useCollectionLibraryStore.getState().saveRequest(
      collectionId,
      {
        name: "List payments",
        method: "GET",
        url: "https://api.example.test/payments",
        headers: [],
        body: "",
      },
    )!;
    renderWithProviders(<Sidebar bootstrap={emptyBootstrap} />);

    fireEvent.click(screen.getByText("List payments"));

    const opened = useWorkspaceStore
      .getState()
      .tabs.find((tab) => tab.savedRequestId === requestId);
    expect(opened).toMatchObject({
      collectionId,
      name: "List payments",
      url: "https://api.example.test/payments",
      dirty: false,
      running: false,
    });
    expect(opened?.response).toBeUndefined();
  });

  it("opens the original request after a saved tab is relinked by Save As", () => {
    const collectionId =
      useCollectionLibraryStore.getState().createCollection("Orders API")!;
    const oldRequestId = useCollectionLibraryStore.getState().saveRequest(
      collectionId,
      {
        name: "Original order request",
        method: "GET",
        url: "https://api.example.test/orders",
        headers: [],
        body: "",
      },
    )!;
    const newRequestId = useCollectionLibraryStore.getState().saveRequest(
      collectionId,
      {
        name: "Copied order request",
        method: "POST",
        url: "https://api.example.test/orders",
        headers: [],
        body: "{}",
      },
    )!;
    const relinkedTab = createRequestTab({
      id: `saved-request:${oldRequestId}`,
      savedRequestId: newRequestId,
      collectionId,
      name: "Copied order request",
      method: "POST",
      dirty: false,
    });
    useWorkspaceStore.setState({
      tabs: [relinkedTab],
      activeTabID: relinkedTab.id,
    });
    renderWithProviders(<Sidebar bootstrap={emptyBootstrap} />);

    fireEvent.click(screen.getByText("Original order request"));

    const state = useWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(
      state.tabs.find((tab) => tab.savedRequestId === oldRequestId),
    ).toMatchObject({
      name: "Original order request",
      method: "GET",
    });
    expect(
      state.tabs.find((tab) => tab.savedRequestId === newRequestId),
    ).toBe(relinkedTab);
  });

  it("keeps Auth explicit, disabled by default, and secret-safe", async () => {
    const tab = useWorkspaceStore.getState().tabs[0];
    const { rerender } = renderWithProviders(
      <ContextPanel bootstrap={emptyBootstrap} tab={tab} />,
    );

    expect(screen.getByRole("tab", { name: "Variables" })).toBeVisible();
    const authTab = screen.getByRole("tab", { name: "Auth" });
    expect(authTab).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Docs" })).not.toBeInTheDocument();
    expect(screen.queryByText("Resolution order")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show secret values" }),
    ).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().tabs[0].headers).toEqual([]);

    fireEvent.mouseDown(authTab, { button: 0, ctrlKey: false });
    expect(useWorkspaceStore.getState().tabs[0].headers).toEqual([]);
    expect(screen.getAllByText("No Auth")).not.toHaveLength(0);

    const addAuthorization = screen.getByRole("button", {
      name: "Add Authorization header",
    });
    fireEvent.click(addAuthorization);
    fireEvent.click(addAuthorization);

    await waitFor(() => {
      const current = useWorkspaceStore.getState().tabs[0];
      expect(current.headers).toHaveLength(1);
      expect(current.headers[0]).toMatchObject({
        enabled: false,
        key: "Authorization",
        value: "Bearer ",
        description: "Added by user",
        source: "Manual",
      });
      expect(current.requestSection).toBe("headers");
    });
    expect(screen.getByText("Authorization disabled")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Edit in Headers" }),
    ).toBeVisible();
    expect(screen.queryByText("Bearer ")).not.toBeInTheDocument();

    useWorkspaceStore.getState().updateTab(tab.id, {
      headers: [
        {
          ...useWorkspaceStore.getState().tabs[0].headers[0],
          enabled: true,
          value: "Bearer top-secret",
        },
      ],
    });
    await waitFor(() =>
      expect(screen.getAllByText("Ready")).not.toHaveLength(0),
    );
    expect(screen.queryByText("top-secret")).not.toBeInTheDocument();

    useWorkspaceStore.setState({ activeEnvironmentID: "local" });
    rerender(
      <Tooltip.Provider>
        <ContextPanel bootstrap={emptyBootstrap} tab={tab} />
      </Tooltip.Provider>,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Variables" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText("{{baseUrl}}")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Show secret values" }),
    ).not.toBeInTheDocument();
  });

  it("reports real tab state instead of synthetic connection and git state", () => {
    const dirty = createRequestTab({ id: "dirty", dirty: true });
    const running = createRequestTab({ id: "running", running: true });
    const failed = createRequestTab({ id: "failed", error: true });
    useWorkspaceStore.setState({
      tabs: [dirty, running, failed],
      activeTabID: dirty.id,
    });

    renderWithProviders(<StatusBar bootstrap={emptyBootstrap} />);

    expect(screen.getByText("3 open requests")).toBeVisible();
    expect(screen.getByText("1 running")).toBeVisible();
    expect(screen.getByText("1 failed")).toBeVisible();
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace saved")).not.toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
  });

  it("loads imported endpoints into the API browser without opening tabs", async () => {
    vi.spyOn(backend, "importOpenAPI").mockResolvedValueOnce({
      specId: "commerce-spec",
      path: "/tmp/openapi.yaml",
      title: "Commerce API",
      version: "1.0.0",
      baseUrl: "https://api.example.test",
      endpoints: importedEndpoints(10),
      canceled: false,
    });
    renderWithProviders(<TopBar bootstrap={emptyBootstrap} />);

    expect(screen.getByText("Search commands…")).toBeVisible();
    fireEvent.pointerDown(screen.getByRole("button", { name: /New/i }), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Import OpenAPI" }),
    );

    expect(
      await screen.findByRole("status", undefined, { timeout: 2_000 }),
    ).toHaveTextContent(
      "Commerce API · 10 endpoints loaded. Open them from the APIs section.",
    );
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(
      useWorkspaceStore.getState().latestImportedSpec?.endpoints,
    ).toHaveLength(10);
    expect(useWorkspaceStore.getState().sidebarSection).toBe("apis");

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows rejected imports as an accessible alert", async () => {
    vi.spyOn(backend, "importOpenAPI").mockRejectedValueOnce(
      new Error("native dialog unavailable"),
    );
    renderWithProviders(<TopBar bootstrap={emptyBootstrap} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: /New/i }), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Import OpenAPI" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t import OpenAPI: native dialog unavailable",
    );
  });

  it("keeps the command palette limited to implemented commands", async () => {
    useWorkspaceStore.setState({ commandPaletteOpen: true });
    renderWithProviders(<CommandPalette bootstrap={emptyBootstrap} />);

    expect(
      await screen.findByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
    expect(screen.queryByText("Import OpenAPI")).not.toBeInTheDocument();
    expect(screen.queryByText("Open history")).not.toBeInTheDocument();
    expect(screen.queryByText("Open collections")).not.toBeInTheDocument();
    expect(screen.queryByText("workspace items indexed")).not.toBeInTheDocument();
    const footer = screen.getByText("10 available commands").closest(
      ".palette-footer",
    );
    expect(footer).not.toHaveTextContent("Navigate");
    expect(footer).not.toHaveTextContent("Open");

    const search = screen.getByRole("combobox", {
      name: "Search command palette",
    });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options.every((option) => option.tabIndex === -1)).toBe(true);
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Command palette" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("reveals bootstrap technical details inside the error screen", async () => {
    vi.spyOn(backend, "bootstrap").mockRejectedValue(
      new Error("bridge initialization failed"),
    );
    renderWithProviders(<App />);

    expect(await screen.findByText("Couldn’t open workspace")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));

    await waitFor(() =>
      expect(
        screen.getByText(/Error: bridge initialization failed/),
      ).toBeVisible(),
    );
  });

  it("switches the full chrome language from settings and persists it", async () => {
    renderWithProviders(<TopBar bootstrap={emptyBootstrap} />);

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Layout and settings" }),
      {
        button: 0,
        ctrlKey: false,
        pointerType: "mouse",
      },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Türkçe/ }),
    );

    expect(screen.getByText("Komutlarda ara…")).toBeVisible();
    await waitFor(() => {
      expect(localStorage.getItem(localeStorageKey)).toBe("tr");
      expect(document.documentElement.lang).toBe("tr");
    });
  });
});
