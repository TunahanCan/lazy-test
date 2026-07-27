import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  FileInput,
  LoaderCircle,
  Plus,
  Power,
  Save,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { backend } from "../lib/backend";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { Button } from "./ui";

interface MockRoute {
  id: string;
  method: string;
  path: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  delayMs: number;
  enabled: boolean;
}

interface EditableRoute extends Omit<MockRoute, "headers"> {
  headersText: string;
}

interface MockHit {
  id: number | string;
  routeId?: string;
  method: string;
  path: string;
  rawQuery?: string;
  status: number;
  matched: boolean;
  pathParams?: Record<string, string>;
  timestamp: string;
  durationMs: number;
}

interface MockServerState {
  running: boolean;
  host: string;
  port: number;
  baseUrl: string;
  routeCount: number;
  enabledCount: number;
  hitCount: number;
  totalHits: number;
  startedAt?: string;
  lastError?: string;
}

interface OperationError {
  title?: string;
  message: string;
  hint?: string;
  technical?: string;
}

interface MockServerSnapshot {
  state: MockServerState;
  routes: MockRoute[];
  hits: MockHit[];
}

type MockOperationResult =
  | (Partial<MockServerSnapshot> & {
      canceled?: boolean;
      error?: string | OperationError;
    })
  | void;

interface ToolIssue {
  title: string;
  message: string;
  hint?: string;
  technical?: string;
}

interface ToolNotice {
  tone: "error" | "success";
  text?: string;
  issue?: ToolIssue;
}

interface MockBackend {
  getMockServer(): Promise<MockServerSnapshot>;
  updateMockRoutes(routes: MockRoute[]): Promise<MockOperationResult>;
  startMockServer(input: {
    port: number;
    enableCors: boolean;
  }): Promise<MockOperationResult>;
  stopMockServer(): Promise<MockOperationResult>;
  clearMockHits(): Promise<MockOperationResult>;
  importMockOpenAPI(): Promise<MockOperationResult>;
}

const mockBackend = backend as unknown as MockBackend;

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const panelStyle = {
  padding: 14,
  gap: 12,
} as const;

function toEditable(route: MockRoute): EditableRoute {
  return {
    ...route,
    headersText: JSON.stringify(route.headers ?? {}, null, 2),
  };
}

function operationError(result: MockOperationResult): ToolIssue | null {
  if (!result?.error) return null;
  if (typeof result.error === "string") {
    return {
      title: "Mock server işlemi tamamlanamadı",
      message: "Masaüstü backend’i işlem sonucunu uygulayamadı.",
      technical: result.error,
    };
  }
  return {
    title: result.error.title || "Mock server işlemi tamamlanamadı",
    message: result.error.message,
    hint: result.error.hint,
    technical: result.error.technical,
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function bridgeIssue(error: unknown, message: string): ToolIssue {
  return {
    title: "Validex backend bağlantısı kesildi",
    message,
    hint: "Masaüstü uygulamasının çalıştığını kontrol edip yeniden deneyin.",
    technical: errorText(error),
  };
}

function isMockSnapshot(
  result: MockOperationResult,
): result is MockServerSnapshot {
  return Boolean(
    result?.state &&
      Array.isArray(result.routes) &&
      Array.isArray(result.hits),
  );
}

function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? value || "—"
    : timestamp.toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}

function createRoute(): EditableRoute {
  const suffix =
    globalThis.crypto?.randomUUID?.().slice(0, 8) ??
    Math.random().toString(36).slice(2, 10);
  return {
    id: `route-${suffix}`,
    method: "GET",
    path: "/example",
    status: 200,
    headersText: '{\n  "Content-Type": "application/json; charset=utf-8"\n}',
    body: '{\n  "message": "Validex mock response"\n}',
    delayMs: 0,
    enabled: true,
  };
}

function parseRoutes(routes: EditableRoute[]): MockRoute[] {
  const ids = new Set<string>();
  const signatures = new Set<string>();

  return routes.map((route, index) => {
    const label = `${index + 1}. route`;
    const id = route.id.trim();
    const method = route.method.trim().toUpperCase();
    const path = route.path.trim();

    if (!id) throw new Error(`${label}: route ID boş olamaz.`);
    if (ids.has(id)) throw new Error(`${label}: “${id}” route ID’si tekrarlanıyor.`);
    ids.add(id);
    if (!method) throw new Error(`${label}: HTTP method seçin.`);
    if (!path.startsWith("/")) throw new Error(`${label}: path “/” ile başlamalı.`);
    const signature = `${method} ${path}`;
    if (signatures.has(signature)) {
      throw new Error(`${label}: ${signature} birden fazla kez tanımlanmış.`);
    }
    signatures.add(signature);
    if (!Number.isInteger(route.status) || route.status < 100 || route.status > 599) {
      throw new Error(`${label}: status 100–599 arasında olmalı.`);
    }
    if (!Number.isInteger(route.delayMs) || route.delayMs < 0 || route.delayMs > 600_000) {
      throw new Error(`${label}: gecikme 0–600000 ms arasında olmalı.`);
    }

    let headers: unknown;
    try {
      headers = JSON.parse(route.headersText.trim() || "{}");
    } catch {
      throw new Error(`${label}: headers geçerli bir JSON object olmalı.`);
    }
    if (!headers || Array.isArray(headers) || typeof headers !== "object") {
      throw new Error(`${label}: headers geçerli bir JSON object olmalı.`);
    }
    for (const [key, value] of Object.entries(headers)) {
      if (!key.trim() || typeof value !== "string") {
        throw new Error(`${label}: header adları ve değerleri string olmalı.`);
      }
    }
    if (route.body.trim()) {
      try {
        JSON.parse(route.body);
      } catch {
        throw new Error(`${label}: response body geçerli JSON olmalı.`);
      }
    }

    return {
      id,
      method,
      path,
      status: route.status,
      headers: headers as Record<string, string>,
      body: route.body,
      delayMs: route.delayMs,
      enabled: route.enabled,
    };
  });
}

export function MockServerLab() {
  const activeRequest = useWorkspaceStore((state) =>
    state.tabs.find((tab) => tab.id === state.activeTabID),
  );
  const [server, setServer] = useState<MockServerState | null>(null);
  const [routes, setRoutes] = useState<EditableRoute[]>([]);
  const [hits, setHits] = useState<MockHit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [port, setPort] = useState(0);
  const [enableCors, setEnableCors] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<ToolNotice | null>(null);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedId) ?? null,
    [routes, selectedId],
  );

  const acceptSnapshot = useCallback(
    (snapshot: MockServerSnapshot, includeRoutes: boolean) => {
      setServer(snapshot.state);
      setHits(snapshot.hits ?? []);
      if (!includeRoutes) return;
      const nextRoutes = (snapshot.routes ?? []).map(toEditable);
      setRoutes(nextRoutes);
      setSelectedId((current) =>
        nextRoutes.some((route) => route.id === current)
          ? current
          : (nextRoutes[0]?.id ?? ""),
      );
      setDirty(false);
    },
    [],
  );

  const refresh = useCallback(
    async (
      includeRoutes: boolean,
      silent = false,
    ): Promise<MockServerSnapshot | undefined> => {
      if (!silent) setBusy("refresh");
      try {
        const snapshot = await mockBackend.getMockServer();
        acceptSnapshot(snapshot, includeRoutes);
        return snapshot;
      } catch (error) {
        if (!silent) {
          setNotice({
            tone: "error",
            issue: bridgeIssue(
              error,
              "Mock server durumu masaüstü backend’inden okunamadı.",
            ),
          });
        }
        return undefined;
      } finally {
        if (!silent) setBusy("");
      }
    },
    [acceptSnapshot],
  );

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    if (!server?.running) return;
    const timer = window.setInterval(() => {
      void refresh(false, true);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [refresh, server?.running]);

  const runOperation = async (
    operation: string,
    action: () => Promise<MockOperationResult>,
    successMessage: string,
    includeRoutes = false,
  ) => {
    setBusy(operation);
    setNotice(null);
    try {
      const result = await action();
      const failure = operationError(result);
      if (failure) {
        setNotice({ tone: "error", issue: failure });
        return;
      }
      if (result?.canceled) return;
      if (isMockSnapshot(result)) {
        acceptSnapshot(result, includeRoutes);
      } else {
        const snapshot = await mockBackend.getMockServer();
        acceptSnapshot(snapshot, includeRoutes);
      }
      setNotice({ tone: "success", text: successMessage });
    } catch (error) {
      setNotice({
        tone: "error",
        issue: bridgeIssue(
          error,
          "Mock server işlemi masaüstü backend’inde tamamlanamadı.",
        ),
      });
    } finally {
      setBusy("");
    }
  };

  const updateSelected = (patch: Partial<EditableRoute>) => {
    if (!selectedRoute) return;
    setRoutes((current) =>
      current.map((route) =>
        route.id === selectedRoute.id ? { ...route, ...patch } : route,
      ),
    );
    setDirty(true);
    setNotice(null);
  };

  const addRoute = () => {
    const route = createRoute();
    setRoutes((current) => [...current, route]);
    setSelectedId(route.id);
    setDirty(true);
    setNotice(null);
  };

  const deleteRoute = () => {
    if (!selectedRoute) return;
    const index = routes.findIndex((route) => route.id === selectedRoute.id);
    const next = routes.filter((route) => route.id !== selectedRoute.id);
    setRoutes(next);
    setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? "");
    setDirty(true);
    setNotice(null);
  };

  const useActiveResponse = () => {
    if (!selectedRoute || !activeRequest?.response) return;
    try {
      JSON.parse(activeRequest.response.body);
    } catch {
      setNotice({
        tone: "error",
        text: "Aktif response JSON değil; mock route body’sine aktarılamadı.",
      });
      return;
    }
    let path = selectedRoute.path;
    try {
      path = new URL(activeRequest.response.resolvedUrl).pathname || "/";
    } catch {
      // Keep the editable route path when the response URL is unavailable.
    }
    updateSelected({
      method: activeRequest.method,
      path,
      status: activeRequest.response.statusCode,
      headersText: JSON.stringify(
        {
          "Content-Type":
            activeRequest.response.contentType || "application/json",
        },
        null,
        2,
      ),
      body: activeRequest.response.body,
    });
    setNotice({
      tone: "success",
      text: `${activeRequest.name} response’u seçili mock route’a aktarıldı. Uygulamak için değişiklikleri kaydedin.`,
    });
  };

  const applyRoutes = async () => {
    let parsed: MockRoute[];
    try {
      parsed = parseRoutes(routes);
    } catch (error) {
      setNotice({
        tone: "error",
        issue: {
          title: "Route doğrulanamadı",
          message: errorText(error),
        },
      });
      return;
    }
    await runOperation(
      "apply",
      () => mockBackend.updateMockRoutes(parsed),
      `${parsed.length} route mock sunucuya uygulandı.`,
      true,
    );
  };

  const importOpenAPI = async () => {
    if (
      dirty &&
      !window.confirm(
        "Uygulanmamış route değişiklikleri OpenAPI içe aktarımıyla değişebilir. Devam edilsin mi?",
      )
    ) {
      return;
    }
    await runOperation(
      "import",
      () => mockBackend.importMockOpenAPI(),
      "OpenAPI response örnekleri mock route’lara dönüştürüldü.",
      true,
    );
  };

  const copyURL = async () => {
    if (!server?.baseUrl) return;
    try {
      await navigator.clipboard.writeText(server.baseUrl);
      setNotice({ tone: "success", text: "Mock server URL’si panoya kopyalandı." });
    } catch {
      setNotice({ tone: "error", text: "Pano kullanılamadı." });
    }
  };

  const isBusy = Boolean(busy);

  return (
    <section className="tool-page" aria-labelledby="mock-server-title">
      <header className="tool-page-header">
        <div>
          <span className="tool-eyebrow">LOCAL · LOOPBACK ONLY</span>
          <h1 id="mock-server-title">Mock Server</h1>
          <p>
            OpenAPI örneklerinden veya kendi route’larınızdan gerçek HTTP yanıtları
            üretin. Sunucu yalnızca <code>127.0.0.1</code> üzerinde dinler; ağınızdaki
            diğer cihazlara açılmaz.
          </p>
        </div>
        <div className="tool-header-meta" aria-live="polite">
          <strong>
            {busy
              ? "İşleniyor…"
              : server?.running
                ? "Çalışıyor"
                : "Durduruldu"}
          </strong>
          <span>
            {busy === "refresh"
              ? "Sunucu durumu okunuyor"
              : server?.running
              ? `${server.enabledCount}/${server.routeCount} route aktif`
              : "Yerel bağlantı"}
          </span>
        </div>
      </header>

      <div
        className="tool-panel"
        style={{
          ...panelStyle,
          marginBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <ShieldCheck size={19} aria-hidden />
        <label style={{ display: "grid", gap: 4, fontSize: 11 }}>
          <span>Port</span>
          <input
            aria-label="Mock server port"
            type="number"
            min={0}
            max={65535}
            value={port}
            disabled={server?.running || isBusy}
            onChange={(event) =>
              setPort(Math.max(0, Math.min(65535, Number(event.target.value) || 0)))
            }
            style={{ width: 100, minHeight: 32 }}
          />
        </label>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontSize: 11,
          }}
        >
          <input
            type="checkbox"
            checked={enableCors}
            disabled={server?.running || isBusy}
            onChange={(event) => setEnableCors(event.target.checked)}
          />
          Browser CORS’a izin ver
        </label>
        <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
          Port 0, boş bir portu otomatik seçer.
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginLeft: "auto",
          }}
        >
          {server?.running && (
            <Button size="sm" variant="ghost" onClick={copyURL}>
              <Clipboard size={13} /> {server.baseUrl}
            </Button>
          )}
          {server?.running ? (
            <Button
              variant="danger"
              disabled={isBusy}
              onClick={() =>
                void runOperation(
                  "stop",
                  () => mockBackend.stopMockServer(),
                  "Mock server durduruldu.",
                )
              }
            >
              <Power size={14} /> Durdur
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={isBusy || dirty}
              title={dirty ? "Önce route değişikliklerini uygulayın." : undefined}
              onClick={() =>
                void runOperation(
                  "start",
                  () => mockBackend.startMockServer({ port, enableCors }),
                  "Mock server loopback adresinde başlatıldı.",
                )
              }
            >
              {busy === "start" ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Power size={14} />
              )}
              Başlat
            </Button>
          )}
        </div>
      </div>

      {dirty && (
        <div className="tool-notice" role="status">
          Route değişiklikleri henüz sunucuya uygulanmadı. Başlatmadan önce
          “Değişiklikleri uygula” düğmesini kullanın.
        </div>
      )}
      {notice && (
        <div
          className={cn("tool-notice", "tool-notice-row", notice.tone)}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.tone === "error" ? (
            <AlertTriangle size={14} aria-hidden />
          ) : (
            <CheckCircle2 size={14} aria-hidden />
          )}
          {notice.issue ? (
            <div className="tool-notice-content">
              <strong>{notice.issue.title}</strong>
              <span>{notice.issue.message}</span>
              {notice.issue.hint && <small>{notice.issue.hint}</small>}
              {notice.issue.technical && (
                <details>
                  <summary>Teknik ayrıntı</summary>
                  <code>{notice.issue.technical}</code>
                </details>
              )}
            </div>
          ) : (
            <span>{notice.text}</span>
          )}
        </div>
      )}
      {server?.lastError && (
        <div className="tool-notice tool-notice-row error" role="alert">
          <AlertTriangle size={14} aria-hidden />
          <div className="tool-notice-content">
            <strong>Mock server son işlemi tamamlayamadı</strong>
            <span>Sunucunun son hata ayrıntısını inceleyin.</span>
            <details>
              <summary>Teknik ayrıntı</summary>
              <code>{server.lastError}</code>
            </details>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 0.72fr) minmax(360px, 1.28fr)",
          gap: 12,
          minHeight: 500,
        }}
      >
        <aside className="tool-panel" aria-label="Mock route listesi">
          <div className="tool-card-header">
            <div>
              <strong>Routes</strong>
              <span>{routes.length} tanım · seçimler bellekte tutulur</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Button size="sm" variant="ghost" onClick={addRoute} disabled={isBusy}>
                <Plus size={13} /> Ekle
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void importOpenAPI()}
                disabled={isBusy}
              >
                <FileInput size={13} /> OpenAPI
              </Button>
            </div>
          </div>

          {routes.length === 0 ? (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                alignContent: "center",
                gap: 8,
                flex: 1,
                padding: 24,
                textAlign: "center",
                color: "var(--text-secondary)",
              }}
            >
              <Server size={25} aria-hidden />
              <strong>Henüz route yok</strong>
              <span style={{ maxWidth: 260, fontSize: 11, lineHeight: 1.5 }}>
                Bir route ekleyin veya OpenAPI dosyasındaki response örneklerini içe
                aktarın.
              </span>
              <Button variant="primary" size="sm" onClick={addRoute}>
                <Plus size={13} /> İlk route’u ekle
              </Button>
            </div>
          ) : (
            <div style={{ overflow: "auto", flex: 1, padding: 7 }}>
              {routes.map((route) => (
                <button
                  type="button"
                  key={route.id}
                  className={cn("collection-row", selectedId === route.id && "active")}
                  onClick={() => setSelectedId(route.id)}
                  style={{
                    display: "grid",
                    width: "100%",
                    gridTemplateColumns: "58px minmax(0, 1fr)",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 3,
                    padding: "8px 9px",
                    textAlign: "left",
                    opacity: route.enabled ? 1 : 0.58,
                  }}
                >
                  <strong style={{ color: "var(--accent)", fontSize: 10 }}>
                    {route.method}
                  </strong>
                  <span
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {route.path}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="tool-card-actions" style={{ justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
              {dirty ? "Uygulanmamış değişiklik var" : "Sunucuyla eşitlendi"}
            </span>
            <Button
              variant="primary"
              size="sm"
              disabled={!dirty || isBusy}
              onClick={() => void applyRoutes()}
            >
              {busy === "apply" ? (
                <LoaderCircle className="spin" size={13} />
              ) : (
                <Save size={13} />
              )}
              Değişiklikleri uygula
            </Button>
          </div>
        </aside>

        <section className="tool-editor-card" aria-label="Seçili mock route">
          {!selectedRoute ? (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                alignContent: "center",
                flex: 1,
                gap: 8,
                color: "var(--text-secondary)",
              }}
            >
              <Server size={24} aria-hidden />
              <strong>Düzenlemek için bir route seçin</strong>
            </div>
          ) : (
            <>
              <div className="tool-card-header">
                <div>
                  <strong>{selectedRoute.method} {selectedRoute.path}</strong>
                  <span>Deterministik HTTP response</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={useActiveResponse}
                    disabled={isBusy || !activeRequest?.response}
                    title={
                      activeRequest?.response
                        ? "Aktif request’in son response’unu bu route’a aktar"
                        : "Aktif request sekmesinde response yok"
                    }
                  >
                    <Clipboard size={13} /> Aktif response
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={deleteRoute}
                    disabled={isBusy}
                  >
                    <Trash2 size={13} /> Sil
                  </Button>
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "110px minmax(160px, 1fr) 90px 110px auto",
                  gap: 9,
                  alignItems: "end",
                  padding: 12,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <label style={{ display: "grid", gap: 5, fontSize: 10 }}>
                  Method
                  <select
                    value={selectedRoute.method}
                    onChange={(event) => updateSelected({ method: event.target.value })}
                  >
                    {methods.map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 5, fontSize: 10 }}>
                  Path
                  <input
                    value={selectedRoute.path}
                    onChange={(event) => updateSelected({ path: event.target.value })}
                    placeholder="/users/{id}"
                    spellCheck={false}
                  />
                </label>
                <label style={{ display: "grid", gap: 5, fontSize: 10 }}>
                  Status
                  <input
                    type="number"
                    min={100}
                    max={599}
                    value={selectedRoute.status}
                    onChange={(event) =>
                      updateSelected({ status: Number(event.target.value) })
                    }
                  />
                </label>
                <label style={{ display: "grid", gap: 5, fontSize: 10 }}>
                  Delay (ms)
                  <input
                    type="number"
                    min={0}
                    max={600000}
                    value={selectedRoute.delayMs}
                    onChange={(event) =>
                      updateSelected({ delayMs: Number(event.target.value) })
                    }
                  />
                </label>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    minHeight: 32,
                    fontSize: 10,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedRoute.enabled}
                    onChange={(event) =>
                      updateSelected({ enabled: event.target.checked })
                    }
                  />
                  Aktif
                </label>
              </div>
              <div
                style={{
                  display: "grid",
                  minHeight: 0,
                  flex: 1,
                  gridTemplateColumns: "minmax(240px, 0.8fr) minmax(280px, 1.2fr)",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    minWidth: 0,
                    minHeight: 0,
                    flexDirection: "column",
                    borderRight: "1px solid var(--border)",
                  }}
                >
                  <span style={{ padding: "9px 12px", fontSize: 10 }}>
                    Headers · JSON object
                  </span>
                  <textarea
                    className="tool-code-input"
                    aria-label="Response headers JSON"
                    value={selectedRoute.headersText}
                    onChange={(event) =>
                      updateSelected({ headersText: event.target.value })
                    }
                    spellCheck={false}
                    style={{ minHeight: 250 }}
                  />
                </label>
                <label
                  style={{
                    display: "flex",
                    minWidth: 0,
                    minHeight: 0,
                    flexDirection: "column",
                  }}
                >
                  <span style={{ padding: "9px 12px", fontSize: 10 }}>
                    Response body · JSON
                  </span>
                  <textarea
                    className="tool-code-input"
                    aria-label="Response body"
                    value={selectedRoute.body}
                    onChange={(event) => updateSelected({ body: event.target.value })}
                    spellCheck={false}
                    style={{ minHeight: 250 }}
                  />
                </label>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="tool-panel" style={{ marginTop: 12 }}>
        <div className="tool-card-header">
          <div>
            <strong>Hit geçmişi</strong>
            <span>
              {server?.totalHits ?? 0} toplam istek · son {hits.length} kayıt gösteriliyor
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={hits.length === 0 || isBusy}
            onClick={() =>
              void runOperation(
                "clear",
                () => mockBackend.clearMockHits(),
                "Hit geçmişi temizlendi.",
              )
            }
          >
            <Trash2 size={13} /> Geçmişi temizle
          </Button>
        </div>
        {hits.length === 0 ? (
          <div
            style={{
              padding: 28,
              textAlign: "center",
              color: "var(--text-secondary)",
              fontSize: 11,
            }}
          >
            Henüz istek alınmadı. Sunucuyu başlatıp yukarıdaki URL’ye bir HTTP
            isteği gönderin.
          </div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 11,
                textAlign: "left",
              }}
            >
              <thead>
                <tr>
                  {["Saat", "Method", "Path", "Route", "Status", "Süre"].map(
                    (column) => (
                      <th
                        key={column}
                        style={{
                          padding: "8px 11px",
                          borderBottom: "1px solid var(--border)",
                          color: "var(--text-muted)",
                          fontWeight: 600,
                        }}
                      >
                        {column}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {hits.map((hit) => (
                  <tr key={hit.id}>
                    <td style={{ padding: "8px 11px" }}>
                      {formatTimestamp(hit.timestamp)}
                    </td>
                    <td style={{ padding: "8px 11px", fontWeight: 650 }}>
                      {hit.method}
                    </td>
                    <td
                      style={{
                        maxWidth: 420,
                        padding: "8px 11px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontFamily: "ui-monospace, monospace",
                      }}
                      title={`${hit.path}${hit.rawQuery ? `?${hit.rawQuery}` : ""}`}
                    >
                      {hit.path}{hit.rawQuery ? `?${hit.rawQuery}` : ""}
                    </td>
                    <td style={{ padding: "8px 11px" }}>
                      {hit.matched ? hit.routeId || "Eşleşti" : "Eşleşmedi"}
                    </td>
                    <td style={{ padding: "8px 11px" }}>{hit.status}</td>
                    <td style={{ padding: "8px 11px" }}>{hit.durationMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
