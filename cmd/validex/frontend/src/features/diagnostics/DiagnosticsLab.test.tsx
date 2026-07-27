import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backend } from "../../lib/backend";
import {
  LocaleProvider,
  localeStorageKey,
  type Locale,
} from "../../i18n";
import type {
  ActuatorInspectResult,
  ActuatorMetricSnapshot,
  EnvironmentCompareResult,
  ResponseEnvelope,
} from "../../lib/types";
import {
  createRequestTab,
  useWorkspaceStore,
} from "../../stores/workspace";
import { DiagnosticsLab } from "./DiagnosticsLab";

function responseEnvelope(
  overrides: Partial<ResponseEnvelope> = {},
): ResponseEnvelope {
  return {
    requestId: "request-diagnostics",
    statusCode: 400,
    status: "400 Bad Request",
    durationMs: 32,
    sizeBytes: 256,
    contentType: "application/problem+json",
    protocol: "HTTP/1.1",
    remoteAddr: "127.0.0.1:8080",
    tls: "",
    traceId: "trace-active-42",
    headers: {
      "Content-Type": ["application/problem+json"],
      "X-Trace-ID": ["trace-active-42"],
    },
    cookies: [],
    body: "{}",
    rawBody: "{}",
    timeline: [],
    resolvedUrl: "http://localhost:8080/api/orders",
    ...overrides,
  };
}

function base64URL(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function renderDiagnostics(locale: Locale = "tr") {
  localStorage.setItem(localeStorageKey, locale);
  return render(
    <LocaleProvider>
      <DiagnosticsLab />
    </LocaleProvider>,
  );
}

describe("DiagnosticsLab", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.persist.clearStorage();
    const tab = createRequestTab({
      id: "diagnostics-request",
      name: "Create order",
    });
    useWorkspaceStore.setState({
      tabs: [tab],
      activeTabID: tab.id,
      activeView: "diagnostics",
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders English chrome and localizes client-side validation", () => {
    renderDiagnostics("en");

    expect(
      screen.getByRole("heading", { name: "Diagnostics" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Analyze API responses, tokens, and runtime data in one workspace.",
      ),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Analyze error" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a response body to analyze.",
    );

    fireEvent.change(
      screen.getByRole("textbox", { name: "Spring error response body" }),
      { target: { value: "not-json" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Analyze error" }),
    );
    expect(screen.getAllByText("HTTP error")).toHaveLength(2);
    expect(
      screen.getByText("The response contains no details."),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "JWT" }));
    fireEvent.change(screen.getByRole("textbox", { name: "JWT token" }), {
      target: { value: "not-a-token" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Decode claims" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "JWT must contain three segments.",
    );
  });

  it("loads the active response and explains ProblemDetail validation fields", () => {
    const response = responseEnvelope({
      body: JSON.stringify({
        type: "https://example.test/problems/validation",
        title: "Validation failed",
        status: 400,
        detail: "Request contains invalid fields",
        errors: [
          {
            field: "email",
            defaultMessage: "must be a well-formed email address",
            rejectedValue: "broken",
          },
        ],
      }),
    });
    const tab = createRequestTab({
      id: "diagnostics-request",
      name: "Create order",
      response,
    });
    useWorkspaceStore.setState({ tabs: [tab], activeTabID: tab.id });

    renderDiagnostics();
    fireEvent.click(
      screen.getByRole("button", { name: "Aktif response’u al" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Hatayı analiz et" }));

    expect(screen.getByText("Validation failed")).toBeVisible();
    expect(screen.getByText("Bean Validation")).toBeVisible();
    expect(screen.getByText("email")).toBeVisible();
    expect(
      screen.getByText("must be a well-formed email address"),
    ).toBeVisible();
    expect(screen.getByText("trace-active-42")).toBeVisible();
    expect(screen.getByText("Tanındı")).toBeVisible();
  });

  it("clears a Spring analysis when status or headers change", () => {
    renderDiagnostics();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Spring error response body" }),
      {
        target: {
          value: JSON.stringify({
            title: "Bad Request",
            status: 400,
            detail: "Invalid payload",
          }),
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Hatayı analiz et" }));
    expect(screen.getByText("Bad Request")).toBeVisible();

    fireEvent.change(screen.getByLabelText("HTTP durumu"), {
      target: { value: "422" },
    });

    expect(screen.getByText("Analiz bekleniyor")).toBeVisible();
    expect(screen.queryByText("Bad Request")).not.toBeInTheDocument();
  });

  it("shows JWT identity claims and clearly warns that the signature is not verified", () => {
    const token = [
      base64URL({ alg: "RS256", typ: "JWT" }),
      base64URL({
        sub: "developer-1",
        iss: "https://issuer.example.test",
        aud: ["validex-api"],
        exp: 4_102_444_800,
        scope: "orders:read orders:write",
        realm_access: { roles: ["backend-developer"] },
      }),
      "not-a-verified-signature",
    ].join(".");

    renderDiagnostics();
    fireEvent.click(screen.getByRole("tab", { name: "JWT" }));
    fireEvent.change(screen.getByRole("textbox", { name: "JWT token" }), {
      target: { value: token },
    });
    fireEvent.click(screen.getByRole("button", { name: "Claim’leri çöz" }));

    expect(
      screen.getByText(/İmza ve token güvenilirliği doğrulanmadı/),
    ).toBeVisible();
    expect(screen.getByText("https://issuer.example.test")).toBeVisible();
    expect(screen.getByText("validex-api")).toBeVisible();
    expect(screen.getByText("backend-developer")).toBeVisible();
    expect(screen.getByText("orders:read")).toBeVisible();
    expect(screen.getByText("orders:write")).toBeVisible();
  });

  it("does not call environment comparison for POST without explicit permission", () => {
    const comparison: EnvironmentCompareResult = {
      method: "POST",
      path: "/api/orders",
      responses: [],
      comparisons: [],
    };
    const compare = vi
      .spyOn(backend, "compareEnvironments")
      .mockResolvedValue(comparison);

    renderDiagnostics();
    fireEvent.click(
      screen.getByRole("tab", { name: "Ortamlar" }),
    );
    const baseURLs = screen.getAllByLabelText("Base URL");
    fireEvent.change(baseURLs[1], {
      target: { value: "http://localhost:8081" },
    });
    fireEvent.change(screen.getByLabelText("Method"), {
      target: { value: "POST" },
    });

    const runButton = screen.getByRole("button", {
      name: "Ortamları karşılaştır",
    });
    expect(runButton).toBeDisabled();
    fireEvent.click(runButton);
    expect(compare).not.toHaveBeenCalled();
  });

  it("marks bounded environment difference lists as incomplete", async () => {
    vi.spyOn(backend, "compareEnvironments").mockResolvedValue({
      method: "GET",
      path: "/actuator/health",
      responses: [],
      comparisons: [
        {
          baseline: "Local",
          candidate: "Test",
          statusMatch: true,
          baselineStatus: 200,
          candidateStatus: 200,
          headerDifferences: ["x-release"],
          headerDifferencesTruncated: true,
          bodyEqual: false,
          bodyMode: "json",
          jsonDifferences: [
            {
              path: "$.release",
              kind: "changed",
              baseline: "local",
              candidate: "test",
            },
          ],
          jsonDifferencesTruncated: true,
        },
      ],
    });

    renderDiagnostics();
    fireEvent.click(screen.getByRole("tab", { name: "Ortamlar" }));
    const baseURLs = screen.getAllByLabelText("Base URL");
    fireEvent.change(baseURLs[1], {
      target: { value: "http://localhost:8081" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Ortamları karşılaştır" }),
    );

    expect(await screen.findByText(/x-release · ilk 1000 fark/)).toBeVisible();
    expect(screen.getByText(/1 · sonuç sınırlandırıldı/)).toBeVisible();
  });

  it("sends the captured Actuator metric snapshot as before on the next request", async () => {
    const baseline: ActuatorMetricSnapshot = {
      capturedAt: "2026-07-27T10:00:00Z",
      metrics: {
        "jvm.threads.live": {
          name: "jvm.threads.live",
          measurements: { VALUE: 12 },
        },
      },
    };
    const firstResult: ActuatorInspectResult = {
      health: {
        status: "UP",
        components: { db: { status: "UP" } },
        data: { status: "UP" },
      },
      metrics: baseline,
      deltas: [],
    };
    const secondResult: ActuatorInspectResult = {
      ...firstResult,
      metrics: {
        capturedAt: "2026-07-27T10:00:10Z",
        metrics: {
          "jvm.threads.live": {
            name: "jvm.threads.live",
            measurements: { VALUE: 15 },
          },
        },
      },
      deltas: [
        {
          metric: "jvm.threads.live",
          statistic: "VALUE",
          before: 12,
          after: 15,
          delta: 3,
          percentChange: 25,
        },
      ],
    };
    const inspect = vi
      .spyOn(backend, "inspectActuator")
      .mockResolvedValueOnce(firstResult)
      .mockResolvedValueOnce(secondResult);

    renderDiagnostics();
    fireEvent.click(screen.getByRole("tab", { name: "Çalışma Zamanı" }));
    fireEvent.click(screen.getByRole("button", { name: "Baseline al" }));

    await waitFor(() => expect(inspect).toHaveBeenCalledTimes(1));
    expect(inspect.mock.calls[0][0].before).toBeUndefined();

    fireEvent.click(
      await screen.findByRole("button", { name: "Yeni snapshot ve delta" }),
    );

    await waitFor(() => expect(inspect).toHaveBeenCalledTimes(2));
    expect(inspect.mock.calls[1][0].before).toEqual(baseline);
    expect(await screen.findByText("25%")).toBeVisible();
  });

  it("ignores a pending runtime result after its input changes", async () => {
    let resolveInspect:
      | ((result: ActuatorInspectResult) => void)
      | undefined;
    const inspect = vi.spyOn(backend, "inspectActuator").mockReturnValueOnce(
      new Promise<ActuatorInspectResult>((resolve) => {
        resolveInspect = resolve;
      }),
    );

    renderDiagnostics();
    fireEvent.click(screen.getByRole("tab", { name: "Çalışma Zamanı" }));
    fireEvent.click(screen.getByRole("button", { name: "Snapshot al" }));
    await waitFor(() => expect(inspect).toHaveBeenCalledOnce());

    fireEvent.change(screen.getByLabelText("Actuator base URL"), {
      target: { value: "http://localhost:9090/actuator" },
    });
    expect(
      await screen.findByText(
        "Girdi veya araç değişti; önceki işlemin sonucu yok sayıldı.",
      ),
    ).toBeVisible();

    await act(async () => {
      resolveInspect?.({
        health: { status: "STALE-UP", components: {}, data: {} },
        metrics: {
          capturedAt: "2026-07-27T16:00:00Z",
          metrics: {},
        },
        deltas: [],
      });
    });

    expect(screen.queryByText("STALE-UP")).not.toBeInTheDocument();
    expect(screen.getByText("Runtime snapshot yok")).toBeVisible();
    expect(screen.getByRole("button", { name: "Snapshot al" })).toBeEnabled();
  });

  it("keeps rejected backend details collapsed behind a friendly message", async () => {
    vi.spyOn(backend, "inspectActuator").mockRejectedValueOnce(
      new Error("native bridge disconnected: inspect actuator"),
    );

    renderDiagnostics();
    fireEvent.click(screen.getByRole("tab", { name: "Çalışma Zamanı" }));
    fireEvent.click(screen.getByRole("button", { name: "Snapshot al" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Validex backend bağlantısı kesildi");
    expect(alert).toHaveTextContent("Runtime snapshot alınamadı.");
    const details = within(alert)
      .getByText("Teknik ayrıntı")
      .closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent(
      "native bridge disconnected: inspect actuator",
    );
  });

  it("sends pasted jstack text to the backend and renders lock findings", async () => {
    const dump = [
      '"http-nio-8080-exec-7" #42',
      "   java.lang.Thread.State: BLOCKED",
      "        at com.validex.orders.OrderService.load(OrderService.java:42)",
    ].join("\n");
    const analyze = vi
      .spyOn(backend, "analyzeThreadDump")
      .mockResolvedValue({
        threadCount: 3,
        stateCounts: { BLOCKED: 1, RUNNABLE: 2 },
        blockedThreads: [
          {
            name: "http-nio-8080-exec-7",
            state: "BLOCKED",
            clues: ["waiting to lock <0x0000000000000042>"],
          },
        ],
        deadlockDetected: true,
        deadlockClues: ["Found one Java-level deadlock:"],
        repeatedStacks: [
          {
            count: 2,
            frames: ["at com.validex.orders.OrderService.load(OrderService.java:42)"],
            threads: ["worker-1", "worker-2"],
          },
        ],
        truncated: false,
      });

    renderDiagnostics();
    fireEvent.click(
      screen.getByRole("tab", { name: "İş Parçacıkları ve Loglar" }),
    );
    fireEvent.change(screen.getByLabelText("JVM thread dump"), {
      target: { value: dump },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Thread’leri analiz et" }),
    );

    await waitFor(() => expect(analyze).toHaveBeenCalledOnce());
    expect(analyze).toHaveBeenCalledWith({ text: dump });
    expect(
      await screen.findByText(/JVM dump içinde açık deadlock işareti bulundu/),
    ).toBeVisible();
    expect(screen.getByText("http-nio-8080-exec-7")).toBeVisible();
    expect(
      screen.getByText("waiting to lock <0x0000000000000042>"),
    ).toBeVisible();
    expect(screen.getByText("2 thread · worker-1, worker-2")).toBeVisible();
    fireEvent.click(
      screen.getByText("Deadlock / lock ipuçları (1)"),
    );
    expect(screen.getByText("Found one Java-level deadlock:")).toBeVisible();
  });

  it("uses the active response trace ID and renders matching log lines", async () => {
    const response = responseEnvelope();
    const tab = createRequestTab({
      id: "diagnostics-request",
      name: "Create order",
      response,
    });
    useWorkspaceStore.setState({ tabs: [tab], activeTabID: tab.id });
    const logText = [
      "2026-07-27 INFO traceId=other request started",
      "2026-07-27 INFO traceId=trace-active-42 request started",
      "2026-07-27 ERROR traceId=trace-active-42 database timeout",
      "2026-07-27 INFO traceId=other request completed",
    ].join("\n");
    const search = vi
      .spyOn(backend, "searchTraceLog")
      .mockResolvedValue({
        query: "trace-active-42",
        matches: [
          {
            lineNumber: 2,
            line: "2026-07-27 INFO traceId=trace-active-42 request started",
          },
          {
            lineNumber: 3,
            line: "2026-07-27 ERROR traceId=trace-active-42 database timeout",
          },
        ],
        scannedLines: 4,
        truncated: false,
      });

    renderDiagnostics();
    fireEvent.click(
      screen.getByRole("tab", { name: "İş Parçacıkları ve Loglar" }),
    );
    fireEvent.click(
      screen.getByRole("tab", { name: "Trace log araması" }),
    );
    fireEvent.change(screen.getByLabelText("Aranacak log metni"), {
      target: { value: logText },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Aktif response ID" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Büyük/küçük harf duyarlı",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Logda ara" }));

    await waitFor(() => expect(search).toHaveBeenCalledOnce());
    expect(search).toHaveBeenCalledWith({
      text: logText,
      query: "trace-active-42",
      caseSensitive: true,
    });
    expect(await screen.findByText("2 eşleşme")).toBeVisible();
    expect(screen.getByText("4 satır tarandı")).toBeVisible();
    expect(
      screen.getByText(
        "2026-07-27 ERROR traceId=trace-active-42 database timeout",
      ),
    ).toBeVisible();
  });

  it("parses endpoint rows and renders a successful coverage report", async () => {
    const coverage = vi
      .spyOn(backend, "analyzeEndpointCoverage")
      .mockResolvedValue({
        totalKnown: 3,
        covered: 2,
        coveragePercent: 66.7,
        endpoints: [
          {
            method: "GET",
            path: "/api/orders",
            hitCount: 4,
            observedPaths: ["/api/orders"],
          },
          {
            method: "GET",
            path: "/api/orders/{id}",
            hitCount: 2,
            observedPaths: ["/api/orders/42"],
          },
          {
            method: "POST",
            path: "/api/orders",
            hitCount: 0,
          },
        ],
      });

    renderDiagnostics();
    fireEvent.click(screen.getByRole("tab", { name: "Kapsama" }));
    fireEvent.change(screen.getByLabelText("Known endpoint listesi"), {
      target: {
        value:
          "GET /api/orders\nGET /api/orders/{id}\nPOST /api/orders",
      },
    });
    fireEvent.change(screen.getByLabelText("Observed call listesi"), {
      target: {
        value: "GET /api/orders [4]\nGET /api/orders/42 [2]",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Coverage’i hesapla" }));

    await waitFor(() => expect(coverage).toHaveBeenCalledTimes(1));
    expect(coverage).toHaveBeenCalledWith({
      known: [
        { method: "GET", path: "/api/orders" },
        { method: "GET", path: "/api/orders/{id}" },
        { method: "POST", path: "/api/orders" },
      ],
      observed: [
        { method: "GET", path: "/api/orders", count: 4 },
        { method: "GET", path: "/api/orders/42", count: 2 },
      ],
    });
    expect(await screen.findByText("66,7%")).toBeVisible();
    const progress = screen.getByRole("progressbar", {
      name: "Endpoint coverage yüzde 66,7",
    });
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "100");
    expect(progress).toHaveAttribute("aria-valuenow", "66.7");
    expect(screen.getByText("/api/orders/{id}")).toBeVisible();
    expect(screen.getByText("Henüz görülmedi")).toBeVisible();
  });
});
