import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { backend } from "../lib/backend";
import type { BootstrapData, ImportedEndpoint } from "../lib/types";
import {
  createRequestTab,
  useWorkspaceStore,
} from "../stores/workspace";
import { CommandPalette } from "./CommandPalette";
import { ContextPanel } from "./ContextPanel";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 31,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 31,
      })),
  }),
}));

const emptyBootstrap: BootstrapData = {
  appVersion: "test",
  workspaceId: "validex-workspace",
  workspaceName: "Validex Workspace",
  environments: [
    { id: "none", name: "No Environment", variables: {} },
    {
      id: "local",
      name: "Local",
      variables: { baseUrl: "http://localhost:8080", token: "" },
    },
  ],
  collections: [],
  history: [],
  recentUrls: [],
  onboardingSteps: [],
};

function renderWithProviders(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider>{children}</Tooltip.Provider>
    </QueryClientProvider>,
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

  it("offers a new request without advertising collections or history", () => {
    useWorkspaceStore.setState({ tabs: [], activeTabID: "" });
    renderWithProviders(<Sidebar bootstrap={emptyBootstrap} />);

    expect(screen.getByRole("button", { name: "Requests" })).toBeVisible();
    expect(screen.getByRole("button", { name: "APIs" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Collections" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "History" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New request" }));
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
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

    fireEvent.change(screen.getByRole("textbox", { name: "Search apis" }), {
      target: { value: "resource 9" },
    });
    expect(screen.queryByText("Resource 0")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Resource 9"));

    const state = useWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[1]).toMatchObject({
      id: "openapi:commerce-spec:operation-9",
      url: "{{baseUrl}}/api/v1/resources/9",
      openApi: { specId: "commerce-spec", path: "/resources/9" },
    });
  });

  it("shows only real context views and reveals secret controls when needed", () => {
    const tab = useWorkspaceStore.getState().tabs[0];
    const { rerender } = renderWithProviders(
      <ContextPanel bootstrap={emptyBootstrap} tab={tab} />,
    );

    expect(screen.getByRole("tab", { name: "Variables" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Auth" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Docs" })).not.toBeInTheDocument();
    expect(screen.queryByText("Resolution order")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Secret değerlerini göster" }),
    ).not.toBeInTheDocument();

    useWorkspaceStore.setState({ activeEnvironmentID: "local" });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <Tooltip.Provider>
          <ContextPanel bootstrap={emptyBootstrap} tab={tab} />
        </Tooltip.Provider>
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Secret değerlerini göster" }),
    ).toBeVisible();
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
    expect(screen.getByText("Draft edited")).toBeVisible();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace saved")).not.toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
  });

  it("opens at most eight imported endpoints and reports the actual count", async () => {
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
      "Commerce API · 8 endpoint sekmede açıldı; 10 endpoint APIs bölümünde erişilebilir",
    );
    expect(useWorkspaceStore.getState().tabs).toHaveLength(9);
    expect(
      useWorkspaceStore.getState().latestImportedSpec?.endpoints,
    ).toHaveLength(10);
    expect(useWorkspaceStore.getState().sidebarSection).toBe("apis");
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
      "OpenAPI içe aktarılamadı: native dialog unavailable",
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
    const footer = screen.getByText("9 available commands").closest(
      ".palette-footer",
    );
    expect(footer).not.toHaveTextContent("Navigate");
    expect(footer).not.toHaveTextContent("Open");
  });

  it("reveals bootstrap technical details inside the error screen", async () => {
    vi.spyOn(backend, "bootstrap").mockRejectedValueOnce(
      new Error("bridge initialization failed"),
    );
    renderWithProviders(<App />);

    expect(await screen.findByText("Workspace açılamadı")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Teknik ayrıntı" }));

    await waitFor(() =>
      expect(
        screen.getByText(/Error: bridge initialization failed/),
      ).toBeVisible(),
    );
  });
});
