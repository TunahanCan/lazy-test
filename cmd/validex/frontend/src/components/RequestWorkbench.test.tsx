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
import { backend } from "../lib/backend";
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
  useWorkspaceStore.setState({
    activeEnvironmentID: "none",
    environmentVariables: {},
    tabs: [tab],
    activeTabID: tab.id,
  });
  return render(
    <Tooltip.Provider>
      <RequestWorkbench tab={tab} bootstrap={bootstrap} />
    </Tooltip.Provider>,
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
    expect(command).not.toContain("Content-Type");
    expect(useWorkspaceStore.getState().tabs[0].url).toBe(
      "https://example.test/users/{{id}}",
    );
  });

  it("starts without headers and gives manually added fields accessible names", () => {
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
    expect(
      within(requestTabs).queryByRole("tab", { name: /Authorization/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Header eklenmedi. Validex request’e otomatik header eklemez.",
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Add header" }));
    expect(screen.getByLabelText("1. header etkin")).toBeVisible();
    expect(screen.getByLabelText("1. header adı")).toBeVisible();
    expect(screen.getByLabelText("1. header değeri")).toBeVisible();
  });

  it("derives ordered duplicate, blank, encoded, and template query rows from the URL", () => {
    const rawURL =
      "https://example.test/search?tag=java&tag=spring%20boot&empty=&flag&scope={{scope}}";
    const tab = createRequestTab({
      id: "query-request",
      url: rawURL,
    });
    renderWorkbench(tab);

    expect(
      screen.getByRole("tab", { name: "Params, 5 query parameters" }),
    ).toBeVisible();
    expect(screen.getByLabelText("1. query param adı")).toHaveValue("tag");
    expect(screen.getByLabelText("1. query param değeri")).toHaveValue("java");
    expect(screen.getByLabelText("2. query param adı")).toHaveValue("tag");
    expect(screen.getByLabelText("2. query param değeri")).toHaveValue(
      "spring boot",
    );
    expect(screen.getByLabelText("3. query param değeri")).toHaveValue("");
    expect(screen.getByLabelText("4. query param değeri")).toHaveValue("");
    expect(screen.getByLabelText("5. query param değeri")).toHaveValue(
      "{{scope}}",
    );
    expect(screen.getAllByText("URL’den algılandı")).toHaveLength(5);
    expect(screen.getByLabelText("Request URL")).toHaveValue(rawURL);
    expect(useWorkspaceStore.getState().tabs[0].url).toBe(rawURL);
  });

  it("edits, removes, and adds query rows by patching only the URL query", () => {
    const tab = createRequestTab({
      id: "query-edit-request",
      url: "https://example.test/search?tag=spring%20boot&tag={{scope}}&empty=",
    });
    renderWorkbench(tab);

    fireEvent.change(screen.getByLabelText("1. query param değeri"), {
      target: { value: "Spring & Java" },
    });
    expect(screen.getByLabelText("Request URL")).toHaveValue(
      "https://example.test/search?tag=Spring%20%26%20Java&tag={{scope}}&empty=",
    );

    fireEvent.click(screen.getByRole("button", { name: "2. query paramı sil" }));
    expect(screen.getByLabelText("Request URL")).toHaveValue(
      "https://example.test/search?tag=Spring%20%26%20Java&empty=",
    );

    fireEvent.click(screen.getByRole("button", { name: "Param ekle" }));
    fireEvent.change(screen.getByLabelText("Yeni query param adı"), {
      target: { value: "include details" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ekle" }));

    const expectedURL =
      "https://example.test/search?tag=Spring%20%26%20Java&empty=&include%20details=";
    expect(screen.getByLabelText("Request URL")).toHaveValue(expectedURL);
    expect(useWorkspaceStore.getState().tabs[0].url).toBe(expectedURL);
    expect(
      screen.getByRole("tab", { name: "Params, 3 query parameters" }),
    ).toBeVisible();
  });

  it("keeps an invalid schemeless URL unchanged and blocks sending it", () => {
    const send = vi.spyOn(backend, "sendRequest");
    const tab = createRequestTab({
      id: "strict-url-request",
      url: "api.example.test/orders?limit=10",
    });
    renderWorkbench(tab);

    const url = screen.getByLabelText("Request URL");
    fireEvent.blur(url);

    expect(url).toHaveValue("api.example.test/orders?limit=10");
    expect(useWorkspaceStore.getState().tabs[0].url).toBe(
      "api.example.test/orders?limit=10",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "URL açıkça http:// veya https:// ile başlamalı.",
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not compare an edited URL against the imported operation", async () => {
    vi.spyOn(backend, "sendRequest").mockResolvedValueOnce({
      response: {
        requestId: "imported-request",
        statusCode: 200,
        status: "200 OK",
        durationMs: 12,
        sizeBytes: 9,
        contentType: "application/json",
        protocol: "HTTP/1.1",
        remoteAddr: "127.0.0.1:8080",
        tls: "",
        traceId: "",
        headers: { "content-type": ["application/json"] },
        cookies: [],
        body: '{\n  "id": 42\n}',
        rawBody: '{"id":42}',
        timeline: [],
        resolvedUrl: "https://api.example.test/customers/42",
      },
    });
    const validate = vi.spyOn(backend, "validateOpenAPIResponse");
    const tab = createRequestTab({
      id: "imported-request",
      url: "https://api.example.test/orders/42",
      openApi: { specId: "orders", path: "/orders/{id}" },
    });
    renderWorkbench(tab);

    fireEvent.change(screen.getByLabelText("Request URL"), {
      target: { value: "https://api.example.test/customers/42" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(
        useWorkspaceStore.getState().tabs[0].response?.contract?.error?.title,
      ).toBe("Request OpenAPI operation’dan ayrıldı");
    });
    expect(validate).not.toHaveBeenCalled();
  });

  it("clears imported contract metadata when the HTTP method changes", async () => {
    const tab = createRequestTab({
      id: "imported-method-request",
      method: "GET",
      url: "https://api.example.test/orders",
      openApi: { specId: "orders", path: "/orders" },
    });
    renderWorkbench(tab);

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "HTTP method seç" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: /POST/i }));

    expect(useWorkspaceStore.getState().tabs[0].method).toBe("POST");
    expect(useWorkspaceStore.getState().tabs[0].openApi).toBeUndefined();
  });
});
