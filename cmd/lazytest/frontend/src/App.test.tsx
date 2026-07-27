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
import { App } from "./App";
import { useWorkspaceStore } from "./stores/workspace";

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

describe("LazyTest workspace", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.persist.clearStorage();
    useWorkspaceStore.setState({
      activeEnvironmentID: "development",
      commandPaletteOpen: false,
      runnerOpen: false,
      codeGeneratorOpen: false,
    });
  });

  it("renders a discoverable request workspace", async () => {
    renderApp();
    expect(await screen.findByLabelText("LazyTest home")).toBeVisible();
    expect(screen.getByRole("button", { name: /List users/i })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(screen.getByText("Variables")).toBeVisible();
  });

  it("opens the command palette with the global shortcut", async () => {
    renderApp();
    await screen.findByLabelText("LazyTest home");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(
      await screen.findByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /New request/i })).toBeVisible();
  });

  it("sends the sample request and renders response metadata", async () => {
    renderApp();
    const send = await screen.findByRole("button", { name: "Send" });
    fireEvent.click(send);
    expect(await screen.findByRole("button", { name: /Cancel/i })).toBeVisible();
    await waitFor(
      () => {
        expect(screen.getByText("200 OK")).toBeVisible();
      },
      { timeout: 2_500 },
    );
    expect(screen.getByText("184 ms")).toBeVisible();
    expect(screen.getByText("HTTP/2")).toBeVisible();
  });

  it("opens the three-stage collection runner", async () => {
    renderApp();
    const runner = await screen.findByRole("button", { name: "Runner" });
    fireEvent.click(runner);
    expect(
      await screen.findByRole("dialog", { name: "Collection runner" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Iterations")).toHaveValue(3);
    expect(screen.getByText("Selection")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Iterations"), {
      target: { value: "9999" },
    });
    fireEvent.change(screen.getByLabelText("Concurrency"), {
      target: { value: "9999" },
    });
    expect(screen.getByLabelText("Iterations")).toHaveValue(100);
    expect(screen.getByLabelText("Concurrency")).toHaveValue(50);
    fireEvent.click(screen.getByRole("button", { name: /Start run/i }));
    expect(await screen.findByText(/request tamamlandı/)).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "500",
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.getByRole("dialog", { name: "Collection runner" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Çalışan Runner önce durdurulmalı",
      }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));
    expect(screen.getByRole("button", { name: /Start run/i })).toBeVisible();
  });

  it("generates Java files from the command palette", async () => {
    renderApp();
    await screen.findByLabelText("LazyTest home");
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
    fireEvent.click(screen.getByRole("button", { name: /Regenerate/i }));
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
