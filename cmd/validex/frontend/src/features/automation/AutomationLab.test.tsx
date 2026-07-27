import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocaleProvider,
  localeStorageKey,
  type Locale,
} from "../../i18n";
import { backend } from "../../lib/backend";
import { AutomationLab } from "./AutomationLab";

function renderLab(locale: Locale = "tr") {
  localStorage.setItem(localeStorageKey, locale);
  return render(
    <LocaleProvider>
      <AutomationLab />
    </LocaleProvider>,
  );
}

function expectInvalidWithDescription(control: HTMLElement) {
  expect(control).toHaveAttribute("aria-invalid", "true");
  const descriptionID = control.getAttribute("aria-describedby");
  expect(descriptionID).toBeTruthy();
  expect(document.getElementById(descriptionID!)).toHaveTextContent(/\S/);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AutomationLab", () => {
  it("runs the same collection definition through the backend adapter", async () => {
    const runCollection = vi.spyOn(backend, "runCollection").mockResolvedValue({
      report: {
        name: "Local smoke",
        startedAt: "2026-07-27T10:00:00Z",
        durationMs: 24,
        passed: 1,
        failed: 0,
        results: [
          {
            id: "health",
            name: "Actuator health",
            method: "GET",
            url: "http://localhost:8080/actuator/health",
            statusCode: 200,
            headers: {},
            body: "{\"status\":\"UP\"}",
            durationMs: 24,
            passed: true,
            assertions: [
              {
                assertion: {
                  id: "health-status",
                  name: "HTTP 200",
                  target: "status",
                  operator: "equals",
                  expected: 200,
                },
                actual: 200,
                passed: true,
              },
            ],
          },
        ],
      },
    });
    renderLab();

    expect(
      screen.getByRole("heading", { level: 2, name: "Collection JSON" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Collection’ı çalıştır/i }),
    );

    await screen.findByText("Collection ve tüm assertion’lar başarılı.");
    expect(runCollection).toHaveBeenCalledOnce();
    expect(runCollection.mock.calls[0][0]).toMatchObject({
      variables: {},
    });
    expect(runCollection.mock.calls[0][0].definition).toContain(
      '"target": "status"',
    );
    expect(screen.getByText("Actuator health")).toBeInTheDocument();
    expect(
      screen.getByRole("article", {
        name: "Başarılı request: Actuator health",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Başarılı assertion:", { selector: ".sr-only" }),
    ).toBeInTheDocument();
  });

  it("associates runner validation errors with the invalid editor", async () => {
    const runCollection = vi.spyOn(backend, "runCollection");
    renderLab();
    const variables = screen.getByLabelText(
      "Runtime variable override JSON",
    );

    fireEvent.change(variables, { target: { value: "[]" } });
    fireEvent.click(
      screen.getByRole("button", { name: /Collection’ı çalıştır/i }),
    );

    await waitFor(() => expectInvalidWithDescription(variables));
    expect(runCollection).not.toHaveBeenCalled();
  });

  it("locks collection editors while a run is pending", async () => {
    vi.spyOn(backend, "runCollection").mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof backend.runCollection>>>(
          () => {},
        ),
    );
    renderLab();
    const collection = screen.getByLabelText("Collection JSON");
    const variables = screen.getByLabelText(
      "Runtime variable override JSON",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Collection’ı çalıştır/i }),
    );

    await screen.findByRole("button", { name: "Durdur" });
    expect(collection).toBeDisabled();
    expect(variables).toBeDisabled();
  });

  it("validates and submits a DNS/redirect analysis", async () => {
    const analyzeNetwork = vi
      .spyOn(backend, "analyzeNetwork")
      .mockResolvedValue({
        report: {
          inputUrl: "https://example.test/",
          dnsLookups: [
            { host: "example.test", ips: ["127.0.0.1"], durationMs: 2 },
          ],
          hops: [
            {
              url: "https://example.test/",
              method: "HEAD",
              statusCode: 200,
              location: "",
              durationMs: 8,
            },
          ],
          finalUrl: "https://example.test/",
          finalStatusCode: 200,
          totalDurationMs: 10,
          usedGetFallback: false,
        },
      });
    renderLab();
    fireEvent.click(screen.getByRole("tab", { name: "DNS ve Yönlendirme" }));
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ağı analiz et" }));

    await screen.findByText("DNS ve redirect analizi tamamlandı.");
    expect(analyzeNetwork).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.test/",
        timeoutMs: 15_000,
        maxRedirects: 10,
      }),
    );
    expect(screen.getByText("127.0.0.1")).toBeInTheDocument();
  });

  it("uses constrained network fields and locks them while analysis runs", async () => {
    vi.spyOn(backend, "analyzeNetwork").mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof backend.analyzeNetwork>>>(
          () => {},
        ),
    );
    renderLab();
    fireEvent.click(screen.getByRole("tab", { name: "DNS ve Yönlendirme" }));
    const url = screen.getByLabelText("URL");
    const timeout = screen.getByLabelText("Timeout (s)");
    const redirects = screen.getByLabelText("Redirect sınırı");
    const insecureTLS = screen.getByRole("checkbox", {
      name: /Self-signed TLS sertifikasına izin ver/,
    });

    expect(url).toHaveAttribute("type", "url");
    expect(url).toBeRequired();
    expect(timeout).toHaveAttribute("type", "number");
    expect(timeout).toHaveAttribute("min", "1");
    expect(timeout).toHaveAttribute("max", "300");
    expect(timeout).toBeRequired();
    expect(redirects).toHaveAttribute("type", "number");
    expect(redirects).toHaveAttribute("min", "1");
    expect(redirects).toHaveAttribute("max", "50");
    expect(redirects).toBeRequired();

    fireEvent.click(screen.getByRole("button", { name: "Ağı analiz et" }));

    await screen.findByRole("button", { name: "Durdur" });
    expect(url).toBeDisabled();
    expect(timeout).toBeDisabled();
    expect(redirects).toBeDisabled();
    expect(insecureTLS).toBeDisabled();
  });

  it("associates network validation errors with the invalid input", async () => {
    const analyzeNetwork = vi.spyOn(backend, "analyzeNetwork");
    renderLab();
    fireEvent.click(screen.getByRole("tab", { name: "DNS ve Yönlendirme" }));
    const timeout = screen.getByLabelText("Timeout (s)");

    fireEvent.change(timeout, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Ağı analiz et" }));

    await waitFor(() => expectInvalidWithDescription(timeout));
    expect(analyzeNetwork).not.toHaveBeenCalled();
  });

  it("shows structured OpenAPI lint findings", async () => {
    vi.spyOn(backend, "lintOpenAPI").mockResolvedValue({
      path: "/tmp/openapi.yaml",
      canceled: false,
      report: {
        summary: {
          paths: 1,
          operations: 1,
          total: 1,
          errors: 0,
          warnings: 1,
          infos: 0,
        },
        truncated: false,
        issues: [
          {
            code: "operation.operation_id.missing",
            severity: "warning",
            path: "#/paths/~1users/get/operationId",
            message: "GET /users işlemi operationId tanımlamıyor.",
          },
        ],
      },
    });
    renderLab();
    fireEvent.click(screen.getByRole("tab", { name: "OpenAPI Denetimi" }));
    fireEvent.click(screen.getByRole("button", { name: "Dosya seç ve tara" }));

    await waitFor(() =>
      expect(
        screen.getByText("operation.operation_id.missing"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Uyarı:", { selector: ".sr-only" }),
    ).toBeInTheDocument();
    expect(screen.getByText("/tmp/openapi.yaml")).toBeInTheDocument();
  });

  it("keeps the current lint result when the file picker is canceled", async () => {
    const lintOpenAPI = vi
      .spyOn(backend, "lintOpenAPI")
      .mockResolvedValueOnce({
        path: "/tmp/openapi.yaml",
        canceled: false,
        report: {
          summary: {
            paths: 1,
            operations: 1,
            total: 1,
            errors: 0,
            warnings: 1,
            infos: 0,
          },
          truncated: false,
          issues: [
            {
              code: "operation.summary.missing",
              severity: "warning",
              path: "#/paths/~1users/get/summary",
              message: "GET /users işlemi summary tanımlamıyor.",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        path: "",
        canceled: true,
      });
    renderLab();
    fireEvent.click(screen.getByRole("tab", { name: "OpenAPI Denetimi" }));
    fireEvent.click(screen.getByRole("button", { name: "Dosya seç ve tara" }));
    await screen.findByText("operation.summary.missing");

    fireEvent.click(screen.getByRole("button", { name: "Dosya seç ve tara" }));

    await waitFor(() => expect(lintOpenAPI).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByText("OpenAPI belgesi taranıyor"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("operation.summary.missing")).toBeInTheDocument();
    expect(screen.getByText("/tmp/openapi.yaml")).toBeInTheDocument();
  });

  it("renders runner, network, lint, validation, and CLI help in English", async () => {
    const analyzeNetwork = vi.spyOn(backend, "analyzeNetwork");
    vi.spyOn(backend, "runCollection").mockResolvedValue({
      error: {
        code: "collection_invalid",
        title: "Collection çalıştırılamadı",
        message: "Collection JSON tanımı geçerli değil.",
        hint: "JSON yapısını kontrol edin.",
      },
    });
    vi.spyOn(backend, "lintOpenAPI").mockResolvedValue({
      path: "/tmp/openapi.yaml",
      canceled: false,
      report: {
        summary: {
          paths: 1,
          operations: 1,
          total: 1,
          errors: 0,
          warnings: 1,
          infos: 0,
        },
        truncated: false,
        issues: [
          {
            code: "operation.summary.missing",
            severity: "warning",
            path: "#/paths/~1users/get/summary",
            message: "GET /users işlemi summary tanımlamıyor.",
            hint: "İşlemin amacını anlatan kısa bir summary ekleyin.",
          },
        ],
      },
    });
    renderLab("en");

    expect(
      screen.getByRole("heading", { level: 1, name: "Automation" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Run collection" }),
    ).toBeVisible();
    expect(
      screen.getByText("Use the same tools from the headless CLI"),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Run collection" }),
    );
    expect(
      await screen.findByText(
        "The collection JSON definition is not valid.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText("Collection JSON tanımı geçerli değil."),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("tab", { name: "DNS & Redirect" }),
    );
    expect(screen.getByText("Network target")).toBeVisible();
    const timeout = screen.getByLabelText("Timeout (s)");
    fireEvent.change(timeout, { target: { value: "0" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Analyze network" }),
    );

    await waitFor(() => expectInvalidWithDescription(timeout));
    expect(
      document.getElementById(
        timeout.getAttribute("aria-describedby")!,
      ),
    ).toHaveTextContent(
      "Timeout must be an integer between 1 and 300.",
    );
    expect(analyzeNetwork).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("tab", { name: "OpenAPI Lint" }),
    );
    expect(
      screen.getByRole("button", { name: "Select file and scan" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Select file and scan" }),
    );
    expect(
      await screen.findByText(
        "This operation does not define a short summary.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Add a short sentence that explains the operation's purpose.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Ağı analiz et")).not.toBeInTheDocument();
  });
});
