import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { App } from "./App";
import { backend } from "./lib/backend";
import {
  createRequestTab,
  useWorkspaceStore,
} from "./stores/workspace";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: { value?: string }) => (
    <textarea aria-label="Generated code" value={value} readOnly />
  ),
}));

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider>
        <App />
      </Tooltip.Provider>
    </QueryClientProvider>,
  );
}

describe("Validex workspace", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.persist.clearStorage();
    const tab = createRequestTab({ id: "request-under-test" });
    useWorkspaceStore.setState({
      activeEnvironmentID: "none",
      environmentVariables: {},
      tabs: [tab],
      activeTabID: tab.id,
      recentlyClosed: [],
      commandPaletteOpen: false,
      runnerOpen: false,
      codeGeneratorOpen: false,
    });
  });

  it("renders a discoverable request workspace", async () => {
    renderApp();
    expect(await screen.findByLabelText("Validex home")).toBeVisible();
    expect(
      screen.getByRole("tab", { name: /Untitled request/i }),
    ).toBeVisible();
    expect(screen.getByLabelText("Request URL")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(screen.getAllByRole("tab", { name: "Variables" })).not.toHaveLength(0);
  });

  it("starts with a focused welcome screen when there are no requests", async () => {
    useWorkspaceStore.setState({ tabs: [], activeTabID: "" });
    renderApp();

    expect(
      await screen.findByRole("heading", {
        name: "API çalışmalarınızı tek bir yerde toplayın.",
      }),
    ).toBeVisible();
    const welcome = screen.getByRole("main");
    expect(
      within(welcome).getByRole("button", { name: "New request" }),
    ).toBeVisible();
    expect(
      within(welcome).getByRole("button", { name: "Import OpenAPI" }),
    ).toBeVisible();
    expect(screen.queryByRole("tablist", { name: "Open requests" })).not.toBeInTheDocument();
    expect(document.querySelectorAll("main")).toHaveLength(1);
  });

  it("opens the command palette with the global shortcut", async () => {
    renderApp();
    await screen.findByLabelText("Validex home");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(
      await screen.findByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /New request/i })).toBeVisible();
  });

  it("edits and normalizes the URL without accidental form submits", async () => {
    const sendSpy = vi.spyOn(backend, "sendRequest");
    renderApp();
    const url = await screen.findByLabelText("Request URL");

    fireEvent.change(url, { target: { value: "api.example.com/users" } });
    expect(url).toHaveValue("api.example.com/users");

    const methodButton = screen.getByRole("button", {
      name: "HTTP method seç",
    });
    expect(methodButton).toHaveAttribute("type", "button");
    fireEvent.click(methodButton);
    expect(sendSpy).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.getByRole("button", { name: "Diğer gönderme seçenekleri" }),
    ).toHaveAttribute("type", "button");

    fireEvent.blur(url);
    expect(url).toHaveValue("https://api.example.com/users");

    const send = screen.getByRole("button", { name: "Send" });
    fireEvent.click(send);
    expect(await screen.findByRole("button", { name: /Cancel/i })).toBeVisible();
    expect(url).toBeDisabled();
    await waitFor(
      () => {
        expect(screen.getByText("200 OK")).toBeVisible();
      },
      { timeout: 2_500 },
    );
    expect(screen.getByText("184 ms")).toBeVisible();
    expect(screen.getByText("HTTP/2")).toBeVisible();
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://api.example.com/users" }),
    );
  });

  it("recovers from a rejected native request and clears stale errors on edit", async () => {
    vi.spyOn(backend, "sendRequest").mockRejectedValueOnce(
      new Error("native bridge disconnected"),
    );
    renderApp();
    const url = await screen.findByLabelText("Request URL");
    fireEvent.change(url, { target: { value: "http://localhost:8080/health" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Backend bağlantısı koptu")).toBeVisible();
    expect(
      useWorkspaceStore.getState().tabs[0].running,
    ).toBe(false);

    fireEvent.change(url, {
      target: { value: "http://localhost:8081/health" },
    });
    expect(screen.queryByText("Backend bağlantısı koptu")).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().tabs[0].error).toBe(false);
  });

  it("stops running when cancel cannot find the native request", async () => {
    vi.spyOn(backend, "sendRequest").mockImplementation(
      () => new Promise(() => undefined),
    );
    vi.spyOn(backend, "cancelRequest").mockResolvedValueOnce(false);
    renderApp();
    const url = await screen.findByLabelText("Request URL");
    fireEvent.change(url, { target: { value: "https://example.test/slow" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Çalışan request bulunamadı")).toBeVisible();
    expect(useWorkspaceStore.getState().tabs[0].running).toBe(false);
  });

  it("clears an older response before a failed retry", async () => {
    renderApp();
    const url = await screen.findByLabelText("Request URL");
    fireEvent.change(url, { target: { value: "https://example.test/first" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("200 OK", {}, { timeout: 2_500 })).toBeVisible();

    vi.spyOn(backend, "sendRequest").mockRejectedValueOnce(
      new Error("retry failed"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Backend bağlantısı koptu")).toBeVisible();
    expect(screen.queryByText("200 OK")).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().tabs[0].response).toBeUndefined();
  });

  it("sends edited environment variables to the backend", async () => {
    useWorkspaceStore.setState({ activeEnvironmentID: "local" });
    const sendSpy = vi.spyOn(backend, "sendRequest");
    renderApp();

    const baseURL = await screen.findByLabelText("baseUrl variable değeri");
    fireEvent.change(baseURL, { target: { value: "127.0.0.1:18081" } });
    const url = screen.getByLabelText("Request URL");
    fireEvent.change(url, { target: { value: "{{baseUrl}}/health" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sendSpy).toHaveBeenCalled());
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "{{baseUrl}}/health",
        variables: expect.objectContaining({
          baseUrl: "127.0.0.1:18081",
        }),
      }),
    );
  });

  it("adds JSON Content-Type for a JSON request body", async () => {
    const tab = createRequestTab({
      id: "json-request",
      method: "POST",
      url: "https://example.test/users",
      body: '{"name":"Ada"}',
    });
    useWorkspaceStore.setState({
      tabs: [tab],
      activeTabID: tab.id,
    });
    const sendSpy = vi.spyOn(backend, "sendRequest").mockResolvedValueOnce({
      error: {
        code: "request_canceled",
        title: "Test tamamlandı",
        message: "Test transportu çağrıldı.",
      },
    });
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Send" }));
    await waitFor(() => expect(sendSpy).toHaveBeenCalled());

    expect(sendSpy.mock.calls[0][0].headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enabled: true,
          key: "Content-Type",
          value: "application/json",
        }),
      ]),
    );
    expect(
      useWorkspaceStore
        .getState()
        .tabs[0].headers.some((header) => header.key === "Content-Type"),
    ).toBe(false);
  });

  it("generates Java files from the command palette", async () => {
    renderApp();
    await screen.findByLabelText("Validex home");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.click(
      await screen.findByRole("button", { name: /Generate Java test/i }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Generate Java test" }),
    ).toBeVisible();
    expect(screen.getByRole("tab", { name: "Test class" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      (await screen.findByLabelText("Generated code") as HTMLTextAreaElement)
        .value,
    ).toContain("io.restassured");

    fireEvent.change(screen.getByLabelText("Framework"), {
      target: { value: "mockmvc" },
    });
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Generated code") as HTMLTextAreaElement).value,
      ).toContain("MockMvc");
    });
    expect(
      screen.getByRole("button", { name: /Export to project folder/i }),
    ).toBeEnabled();
  });
});
