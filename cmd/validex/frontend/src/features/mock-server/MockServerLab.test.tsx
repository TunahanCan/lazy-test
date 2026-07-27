import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocaleProvider,
  localeStorageKey,
  type Locale,
} from "../../i18n";
import { backend } from "../../lib/backend";
import type {
  MockRoute,
  MockServerSnapshot,
} from "../../lib/types";
import { MockServerLab } from "./MockServerLab";

function renderLab(locale: Locale = "tr") {
  localStorage.setItem(localeStorageKey, locale);
  return render(
    <LocaleProvider>
      <MockServerLab />
    </LocaleProvider>,
  );
}

const route: MockRoute = {
  id: "get-users",
  method: "GET",
  path: "/users",
  status: 200,
  headers: { "Content-Type": "application/json" },
  body: '{"users":[]}',
  delayMs: 0,
  enabled: true,
};

function snapshot(
  overrides: Partial<MockServerSnapshot> = {},
): MockServerSnapshot {
  return {
    state: {
      running: false,
      host: "127.0.0.1",
      port: 0,
      baseUrl: "",
      routeCount: 1,
      enabledCount: 1,
      hitCount: 0,
      totalHits: 0,
    },
    routes: [route],
    hits: [],
    canceled: false,
    ...overrides,
  };
}

describe("MockServerLab", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(backend, "getMockServer").mockResolvedValue(snapshot());
    vi.spyOn(backend, "updateMockRoutes").mockResolvedValue(snapshot());
    vi.spyOn(backend, "startMockServer").mockResolvedValue(snapshot());
    vi.spyOn(backend, "stopMockServer").mockResolvedValue(snapshot());
    vi.spyOn(backend, "clearMockHits").mockResolvedValue(snapshot());
    vi.spyOn(backend, "importMockOpenAPI").mockResolvedValue(snapshot());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads the first snapshot and explains the loopback-only security boundary", async () => {
    renderLab();

    expect(
      screen.getByText(/diğer cihazlara açılmaz/i),
    ).toBeInTheDocument();
    expect(await screen.findByText("GET /users")).toBeInTheDocument();
    expect(screen.getAllByText("/users")).not.toHaveLength(0);
    expect(backend.getMockServer).toHaveBeenCalledTimes(1);
  });

  it("edits a new route and sends the actual route payload only after Apply", async () => {
    renderLab();
    await screen.findByText("GET /users");

    fireEvent.click(screen.getByRole("button", { name: "Ekle" }));
    fireEvent.change(screen.getByLabelText("Method"), {
      target: { value: "POST" },
    });
    fireEvent.change(screen.getByPlaceholderText("/users/{id}"), {
      target: { value: "/orders/{id}" },
    });
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "202" },
    });
    fireEvent.change(screen.getByLabelText("Delay (ms)"), {
      target: { value: "75" },
    });
    fireEvent.change(screen.getByLabelText("Response headers JSON"), {
      target: { value: '{"Content-Type":"application/json","X-Mock":"yes"}' },
    });
    fireEvent.change(screen.getByLabelText("Response body"), {
      target: { value: '{"accepted":true}' },
    });

    expect(backend.updateMockRoutes).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: /Değişiklikleri uygula/i }),
    );

    await waitFor(() => {
      expect(backend.updateMockRoutes).toHaveBeenCalledWith([
        route,
        {
          id: expect.stringMatching(/^route-/),
          method: "POST",
          path: "/orders/{id}",
          status: 202,
          headers: {
            "Content-Type": "application/json",
            "X-Mock": "yes",
          },
          body: '{"accepted":true}',
          delayMs: 75,
          enabled: true,
        },
      ]);
    });
  });

  it("shows structured backend failures instead of reporting fake success", async () => {
    vi.mocked(backend.updateMockRoutes).mockResolvedValueOnce({
      ...snapshot(),
      error: {
        code: "invalid_mock_routes",
        title: "Route uygulanamadı",
        message: "Aynı method ve path iki kez tanımlandı.",
        hint: "Çakışan route’u silin.",
      },
    });
    renderLab();
    await screen.findByText("GET /users");

    fireEvent.change(screen.getByPlaceholderText("/users/{id}"), {
      target: { value: "/customers" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Değişiklikleri uygula/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Route uygulanamadı");
    expect(alert).toHaveTextContent("Aynı method ve path iki kez tanımlandı.");
    expect(alert).toHaveTextContent("Çakışan route’u silin.");
    expect(screen.queryByText(/route mock sunucuya uygulandı/i)).not.toBeInTheDocument();
  });

  it("rejects an invalid JSON body before calling the native backend", async () => {
    renderLab();
    await screen.findByText("GET /users");

    fireEvent.change(screen.getByLabelText("Response body"), {
      target: { value: "not-json" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Değişiklikleri uygula/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "response body geçerli JSON olmalı",
    );
    expect(backend.updateMockRoutes).not.toHaveBeenCalled();
  });

  it("starts with automatic port selection and the selected CORS setting", async () => {
    renderLab();
    await screen.findByText("GET /users");

    expect(screen.getByLabelText("Mock server port")).toHaveValue(0);
    fireEvent.click(screen.getByLabelText("Browser CORS’a izin ver"));
    fireEvent.click(screen.getByRole("button", { name: "Başlat" }));

    await waitFor(() => {
      expect(backend.startMockServer).toHaveBeenCalledWith({
        port: 0,
        enableCors: true,
      });
    });
    expect(
      await screen.findByText("Mock server loopback adresinde başlatıldı."),
    ).toBeInTheDocument();
    expect(backend.getMockServer).toHaveBeenCalledTimes(1);
  });

  it("does not report success when a post-operation snapshot refresh fails", async () => {
    vi.mocked(backend.getMockServer)
      .mockReset()
      .mockResolvedValueOnce(snapshot())
      .mockRejectedValueOnce(
        new Error("native bridge disconnected: mock snapshot"),
      );
    vi.mocked(backend.updateMockRoutes).mockResolvedValueOnce(
      undefined as never,
    );

    renderLab();
    await screen.findByText("GET /users");
    fireEvent.change(screen.getByPlaceholderText("/users/{id}"), {
      target: { value: "/customers" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Değişiklikleri uygula/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Validex backend bağlantısı kesildi");
    expect(alert).toHaveTextContent(
      "Mock server işlemi masaüstü backend’inde tamamlanamadı.",
    );
    expect(
      screen.queryByText(/route mock sunucuya uygulandı/i),
    ).not.toBeInTheDocument();
    const details = within(alert)
      .getByText("Teknik ayrıntı")
      .closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent(
      "native bridge disconnected: mock snapshot",
    );
  });

  it("clears a real hit snapshot and renders the resulting empty state", async () => {
    const withHit = snapshot({
      state: {
        running: false,
        host: "127.0.0.1",
        port: 0,
        baseUrl: "",
        routeCount: 1,
        enabledCount: 1,
        hitCount: 1,
        totalHits: 1,
      },
      hits: [
        {
          id: 1,
          routeId: "get-users",
          method: "GET",
          path: "/users",
          status: 200,
          matched: true,
          timestamp: "2026-07-27T12:00:00Z",
          durationMs: 3,
        },
      ],
    });
    const cleared = snapshot({ routes: [route] });
    vi.mocked(backend.getMockServer)
      .mockResolvedValueOnce(withHit)
      .mockResolvedValue(cleared);
    vi.mocked(backend.clearMockHits).mockResolvedValueOnce(cleared);

    renderLab();
    expect(await screen.findByText("get-users")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Geçmişi temizle" }),
    );

    await waitFor(() => {
      expect(backend.clearMockHits).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByText(/Henüz istek alınmadı/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Hit geçmişi temizlendi.")).toBeInTheDocument();
  });

  it("renders controls and local route validation in English", async () => {
    vi.mocked(backend.startMockServer).mockResolvedValueOnce({
      ...snapshot(),
      error: {
        code: "mock_start_failed",
        title: "Mock server başlatılamadı",
        message: "port kullanılıyor",
        hint: "Portu kontrol edin.",
      },
    });
    renderLab("en");
    await screen.findByText("GET /users");

    expect(
      screen.getByRole("heading", { level: 1, name: "Mock Server" }),
    ).toBeVisible();
    expect(
      screen.getByText(/not exposed to other devices/i),
    ).toBeVisible();
    expect(screen.getByLabelText("Allow browser CORS")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(
      await screen.findByText("The mock server could not be started."),
    ).toBeVisible();
    expect(
      screen.queryByText("Mock server başlatılamadı"),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Response body"), {
      target: { value: "not-json" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Apply changes" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "response body must be valid JSON",
    );
    expect(backend.updateMockRoutes).not.toHaveBeenCalled();
    expect(screen.queryByText("Değişiklikleri uygula")).not.toBeInTheDocument();
  });
});
