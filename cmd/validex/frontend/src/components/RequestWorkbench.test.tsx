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
import type { BootstrapData, RequestTab } from "../lib/types";
import {
  createRequestTab,
  useWorkspaceStore,
} from "../stores/workspace";
import { RequestWorkbench } from "./RequestWorkbench";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: { value?: string }) => (
    <textarea aria-label="Editor" value={value} readOnly />
  ),
}));

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

function renderWorkbench(tab: RequestTab) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useWorkspaceStore.setState({
    activeEnvironmentID: "none",
    environmentVariables: {},
    tabs: [tab],
    activeTabID: tab.id,
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider>
        <RequestWorkbench tab={tab} bootstrap={bootstrap} />
      </Tooltip.Provider>
    </QueryClientProvider>,
  );
}

describe("RequestWorkbench", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("checks variables in URL, enabled headers, and body before sending", async () => {
    const tab = createRequestTab({
      id: "variable-request",
      method: "POST",
      url: "https://example.test/{{path}}",
      body: '{"id":"{{id}}"}',
      headers: [
        {
          id: "token-header",
          enabled: true,
          key: "X-Token",
          value: "{{token}}",
          source: "Manual",
        },
      ],
    });
    renderWorkbench(tab);

    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("{{id}}");
    expect(screen.getByRole("alert")).toHaveTextContent("{{path}}");
    expect(screen.getByRole("alert")).toHaveTextContent("{{token}}");

    for (const [key, value] of [
      ["id", "42"],
      ["path", "users"],
      ["token", "secret"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
      fireEvent.change(screen.getByLabelText("Yeni variable adı"), {
        target: { value: key },
      });
      fireEvent.change(screen.getByLabelText("Yeni variable değeri"), {
        target: { value },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    }

    await waitFor(() => expect(send).toBeEnabled());
  });

  it("generates a resolved and shell-escaped cURL command", async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const tab = createRequestTab({
      id: "curl-request",
      method: "POST",
      url: "https://example.test/users/{{id}}",
      body: '{"note":"Bob\'s"}',
      headers: [
        {
          id: "name-header",
          enabled: true,
          key: "X-Name",
          value: "Ada's",
          source: "Manual",
        },
      ],
    });
    useWorkspaceStore.setState({
      environmentVariables: { none: { id: "O'Reilly" } },
    });
    renderWorkbench(tab);
    useWorkspaceStore.getState().setEnvironmentVariable("none", "id", "O'Reilly");

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Diğer gönderme seçenekleri" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Copy as cURL/i }),
    );

    expect(writeText).toHaveBeenCalledOnce();
    const command = String(writeText.mock.calls[0][0]);
    expect(command).toContain("curl --request POST");
    expect(command).toContain(`O'\\''Reilly`);
    expect(command).toContain(`Ada'\\''s`);
    expect(command).toContain(`Bob'\\''s`);
    expect(command).toContain("Content-Type: application/json");
  });

  it("gives every header field an accessible name", () => {
    const tab = createRequestTab({
      id: "headers-request",
      requestSection: "headers",
    });
    renderWorkbench(tab);
    const requestTabs = screen.getByRole("tablist", {
      name: "Request settings",
    });
    expect(
      within(requestTabs).getByRole("tab", { name: /Headers/i }),
    ).toHaveAttribute("aria-selected", "true");

    expect(screen.getByLabelText("1. header etkin")).toBeVisible();
    expect(screen.getByLabelText("1. header adı")).toBeVisible();
    expect(screen.getByLabelText("1. header değeri")).toBeVisible();
  });
});
