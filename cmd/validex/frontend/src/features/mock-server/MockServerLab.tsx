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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslation } from "../../i18n";
import { Button } from "../../shared/ui";
import { backend } from "../../lib/backend";
import type {
  MockHit,
  MockRoute,
  MockServerSnapshot,
  MockServerState,
} from "../../lib/types";
import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspace";
import {
  bridgeIssue,
  createRouteDraft,
  errorText,
  formatTimestamp,
  isMockSnapshot,
  mockHTTPMethods,
  operationError,
  parseRoutes,
  toEditableRoute,
  type EditableRoute,
  type MockOperationResult,
  type ToolNotice,
} from "./model";

export function MockServerLab() {
  const t = useTranslation();
  const { locale } = useLocale();
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
  const routeRevision = useRef(0);
  const routeSnapshotRequest = useRef(0);
  const initialRefreshStarted = useRef(false);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedId) ?? null,
    [routes, selectedId],
  );

  const acceptSnapshot = useCallback(
    (
      snapshot: MockServerSnapshot,
      includeRoutes: boolean,
      expectedRouteRevision = routeRevision.current,
      expectedSnapshotRequest = routeSnapshotRequest.current,
    ) => {
      setServer(snapshot.state);
      setHits(snapshot.hits ?? []);
      if (
        !includeRoutes ||
        expectedRouteRevision !== routeRevision.current ||
        expectedSnapshotRequest !== routeSnapshotRequest.current
      ) {
        return;
      }
      const nextRoutes = (snapshot.routes ?? []).map(toEditableRoute);
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
      const expectedRouteRevision = routeRevision.current;
      const expectedSnapshotRequest = includeRoutes
        ? ++routeSnapshotRequest.current
        : routeSnapshotRequest.current;
      if (!silent) setBusy("refresh");
      try {
        const snapshot = await backend.getMockServer();
        acceptSnapshot(
          snapshot,
          includeRoutes,
          expectedRouteRevision,
          expectedSnapshotRequest,
        );
        return snapshot;
      } catch (error) {
        if (!silent) {
          setNotice({
            tone: "error",
            issue: bridgeIssue(
              error,
              t("mock.refresh.failed"),
              t,
            ),
          });
        }
        return undefined;
      } finally {
        if (!silent) setBusy("");
      }
    },
    [acceptSnapshot, t],
  );

  useEffect(() => {
    if (initialRefreshStarted.current) return;
    initialRefreshStarted.current = true;
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
    const expectedRouteRevision = routeRevision.current;
    const expectedSnapshotRequest = includeRoutes
      ? ++routeSnapshotRequest.current
      : routeSnapshotRequest.current;
    setBusy(operation);
    setNotice(null);
    try {
      const result = await action();
      const failure = operationError(result, t);
      if (failure) {
        setNotice({ tone: "error", issue: failure });
        return;
      }
      if (result?.canceled) return;
      if (isMockSnapshot(result)) {
        acceptSnapshot(
          result,
          includeRoutes,
          expectedRouteRevision,
          expectedSnapshotRequest,
        );
      } else {
        const snapshot = await backend.getMockServer();
        acceptSnapshot(
          snapshot,
          includeRoutes,
          expectedRouteRevision,
          expectedSnapshotRequest,
        );
      }
      setNotice({ tone: "success", text: successMessage });
    } catch (error) {
      setNotice({
        tone: "error",
        issue: bridgeIssue(
          error,
          t("mock.operation.failed"),
          t,
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
    routeRevision.current += 1;
    setDirty(true);
    setNotice(null);
  };

  const addRoute = () => {
    const route = createRouteDraft();
    setRoutes((current) => [...current, route]);
    setSelectedId(route.id);
    routeRevision.current += 1;
    setDirty(true);
    setNotice(null);
  };

  const deleteRoute = () => {
    if (!selectedRoute) return;
    const index = routes.findIndex((route) => route.id === selectedRoute.id);
    const next = routes.filter((route) => route.id !== selectedRoute.id);
    setRoutes(next);
    setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? "");
    routeRevision.current += 1;
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
        text: t("mock.activeResponse.invalid"),
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
      text: t("mock.activeResponse.copied", {
        name: activeRequest.name,
      }),
    });
  };

  const applyRoutes = async () => {
    let parsed: MockRoute[];
    try {
      parsed = parseRoutes(routes, t);
    } catch (error) {
      setNotice({
        tone: "error",
        issue: {
          title: t("mock.routes.invalid.title"),
          message: errorText(error),
        },
      });
      return;
    }
    await runOperation(
      "apply",
      () => backend.updateMockRoutes(parsed),
      t("mock.routes.applied", { count: parsed.length }),
      true,
    );
  };

  const importOpenAPI = async () => {
    if (
      dirty &&
      !window.confirm(t("mock.import.confirm"))
    ) {
      return;
    }
    await runOperation(
      "import",
      () => backend.importMockOpenAPI(),
      t("mock.import.success"),
      true,
    );
  };

  const copyURL = async () => {
    if (!server?.baseUrl) return;
    try {
      await navigator.clipboard.writeText(server.baseUrl);
      setNotice({ tone: "success", text: t("mock.copy.success") });
    } catch {
      setNotice({ tone: "error", text: t("mock.copy.failed") });
    }
  };

  const isBusy = Boolean(busy);

  return (
    <section className="tool-page" aria-labelledby="mock-server-title">
      <header className="tool-page-header">
        <div>
          <span className="tool-eyebrow">{t("mock.eyebrow")}</span>
          <h1 id="mock-server-title">{t("mock.title")}</h1>
          <p>
            {t("mock.description.before")}{" "}
            <code>127.0.0.1</code> {t("mock.description.after")}
          </p>
        </div>
        <div className="tool-header-meta" aria-live="polite">
          <strong>
            {busy
              ? t("mock.state.processing")
              : server?.running
                ? t("mock.state.running")
                : t("mock.state.stopped")}
          </strong>
          <span>
            {busy === "refresh"
              ? t("mock.state.refreshing")
              : server?.running
                ? t("mock.state.activeRoutes", {
                    enabled: server.enabledCount,
                    total: server.routeCount,
                  })
                : t("mock.state.localConnection")}
          </span>
        </div>
      </header>

      <div className="tool-panel mock-server-controls">
        <ShieldCheck size={19} aria-hidden />
        <label className="mock-server-port-field">
          <span>{t("mock.port")}</span>
          <input
            className="mock-server-port-input"
            aria-label={t("mock.portAria")}
            type="number"
            min={0}
            max={65535}
            value={port}
            disabled={server?.running || isBusy}
            onChange={(event) =>
              setPort(Math.max(0, Math.min(65535, Number(event.target.value) || 0)))
            }
          />
        </label>
        <label className="mock-server-cors-toggle">
          <input
            type="checkbox"
            checked={enableCors}
            disabled={server?.running || isBusy}
            onChange={(event) => setEnableCors(event.target.checked)}
          />
          {t("mock.cors")}
        </label>
        <span className="mock-server-port-hint">
          {t("mock.portHint")}
        </span>
        <div className="mock-server-controls-actions">
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
                  () => backend.stopMockServer(),
                  t("mock.stop.success"),
                )
              }
            >
              <Power size={14} /> {t("mock.action.stop")}
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={isBusy || dirty}
              title={dirty ? t("mock.startBlocked") : undefined}
              onClick={() =>
                void runOperation(
                  "start",
                  () => backend.startMockServer({ port, enableCors }),
                  t("mock.start.success"),
                )
              }
            >
              {busy === "start" ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Power size={14} />
              )}
              {t("mock.action.start")}
            </Button>
          )}
        </div>
      </div>

      {dirty && (
        <div className="tool-notice" role="status">
          {t("mock.dirtyNotice")}
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
                  <summary>{t("mock.technicalDetails")}</summary>
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
            <strong>{t("mock.lastError.title")}</strong>
            <span>{t("mock.lastError.description")}</span>
            <details>
              <summary>{t("mock.technicalDetails")}</summary>
              <code>{server.lastError}</code>
            </details>
          </div>
        </div>
      )}

      <div className="mock-server-workspace">
        <aside
          className="tool-panel"
          aria-label={t("mock.routes.aria")}
        >
          <div className="tool-card-header">
            <div>
              <strong>{t("mock.routes.title")}</strong>
              <span>
                {t("mock.routes.count", { count: routes.length })}
              </span>
            </div>
            <div className="mock-route-header-actions">
              <Button size="sm" variant="ghost" onClick={addRoute} disabled={isBusy}>
                <Plus size={13} /> {t("mock.action.add")}
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
            <div className="mock-route-empty">
              <Server size={25} aria-hidden />
              <strong>{t("mock.routes.empty.title")}</strong>
              <span className="mock-route-empty-description">
                {t("mock.routes.empty.description")}
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={addRoute}
                disabled={isBusy}
              >
                <Plus size={13} /> {t("mock.action.addFirst")}
              </Button>
            </div>
          ) : (
            <div className="mock-route-list">
              {routes.map((route) => (
                <button
                  type="button"
                  key={route.id}
                  className={cn(
                    "collection-row",
                    "mock-route-row",
                    selectedId === route.id && "active",
                    !route.enabled && "disabled",
                  )}
                  aria-pressed={selectedId === route.id}
                  onClick={() => setSelectedId(route.id)}
                >
                  <strong className="mock-route-method">
                    {route.method}
                  </strong>
                  <span className="mock-route-path">
                    {route.path}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="tool-card-actions mock-route-footer">
            <span className="mock-route-sync-status">
              {dirty
                ? t("mock.routes.dirty")
                : t("mock.routes.synced")}
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
              {t("mock.action.apply")}
            </Button>
          </div>
        </aside>

        <section
          className="tool-editor-card"
          aria-label={t("mock.editor.aria")}
        >
          {!selectedRoute ? (
            <div className="mock-route-editor-empty">
              <Server size={24} aria-hidden />
              <strong>{t("mock.editor.empty")}</strong>
            </div>
          ) : (
            <>
              <div className="tool-card-header">
                <div>
                  <strong>{selectedRoute.method} {selectedRoute.path}</strong>
                  <span>{t("mock.editor.description")}</span>
                </div>
                <div className="mock-route-header-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={useActiveResponse}
                    disabled={isBusy || !activeRequest?.response}
                    title={
                      activeRequest?.response
                        ? t("mock.editor.useResponse")
                        : t("mock.editor.noResponse")
                    }
                  >
                    <Clipboard size={13} />{" "}
                    {t("mock.action.activeResponse")}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={deleteRoute}
                    disabled={isBusy}
                  >
                    <Trash2 size={13} /> {t("mock.action.delete")}
                  </Button>
                </div>
              </div>
              <div className="mock-route-fields">
                <label className="mock-route-field">
                  {t("mock.field.method")}
                  <select
                    value={selectedRoute.method}
                    disabled={isBusy}
                    onChange={(event) => updateSelected({ method: event.target.value })}
                  >
                    {mockHTTPMethods.map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                </label>
                <label className="mock-route-field">
                  {t("mock.field.path")}
                  <input
                    value={selectedRoute.path}
                    disabled={isBusy}
                    onChange={(event) => updateSelected({ path: event.target.value })}
                    placeholder="/users/{id}"
                    spellCheck={false}
                  />
                </label>
                <label className="mock-route-field">
                  {t("mock.field.status")}
                  <input
                    type="number"
                    min={200}
                    max={599}
                    value={selectedRoute.status}
                    disabled={isBusy}
                    onChange={(event) =>
                      updateSelected({ status: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="mock-route-field">
                  {t("mock.field.delay")}
                  <input
                    type="number"
                    min={0}
                    max={600000}
                    value={selectedRoute.delayMs}
                    disabled={isBusy}
                    onChange={(event) =>
                      updateSelected({ delayMs: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="mock-route-enabled">
                  <input
                    type="checkbox"
                    checked={selectedRoute.enabled}
                    disabled={isBusy}
                    onChange={(event) =>
                      updateSelected({ enabled: event.target.checked })
                    }
                  />
                  {t("mock.field.enabled")}
                </label>
              </div>
              <div className="mock-route-response-editors">
                <label className="mock-route-response-editor mock-route-response-editor-headers">
                  <span className="mock-route-response-label">
                    {t("mock.field.headers")}
                  </span>
                  <textarea
                    className="tool-code-input mock-route-code-input"
                    aria-label={t("mock.field.headersAria")}
                    value={selectedRoute.headersText}
                    disabled={isBusy}
                    onChange={(event) =>
                      updateSelected({ headersText: event.target.value })
                    }
                    spellCheck={false}
                  />
                </label>
                <label className="mock-route-response-editor">
                  <span className="mock-route-response-label">
                    {t("mock.field.body")}
                  </span>
                  <textarea
                    className="tool-code-input mock-route-code-input"
                    aria-label={t("mock.field.bodyAria")}
                    value={selectedRoute.body}
                    disabled={isBusy}
                    onChange={(event) => updateSelected({ body: event.target.value })}
                    spellCheck={false}
                  />
                </label>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="tool-panel mock-hit-panel">
        <div className="tool-card-header">
          <div>
            <strong>{t("mock.hits.title")}</strong>
            <span>
              {t("mock.hits.summary", {
                total: server?.totalHits ?? 0,
                visible: hits.length,
              })}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={hits.length === 0 || isBusy}
            onClick={() =>
              void runOperation(
                "clear",
                () => backend.clearMockHits(),
                t("mock.history.cleared"),
              )
            }
          >
            <Trash2 size={13} /> {t("mock.action.clearHistory")}
          </Button>
        </div>
        {hits.length === 0 ? (
          <div className="mock-hit-empty">
            {t("mock.hits.empty")}
          </div>
        ) : (
          <div className="mock-hit-table-wrap">
            <table className="mock-hit-table">
              <thead>
                <tr>
                  {[
                    t("mock.hits.column.time"),
                    t("mock.hits.column.method"),
                    t("mock.hits.column.path"),
                    t("mock.hits.column.route"),
                    t("mock.hits.column.status"),
                    t("mock.hits.column.duration"),
                  ].map(
                    (column) => (
                      <th key={column}>
                        {column}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {hits.map((hit) => (
                  <tr key={hit.id}>
                    <td>
                      {formatTimestamp(hit.timestamp, locale)}
                    </td>
                    <td className="mock-hit-method">
                      {hit.method}
                    </td>
                    <td
                      className="mock-hit-path"
                      title={`${hit.path}${hit.rawQuery ? `?${hit.rawQuery}` : ""}`}
                    >
                      {hit.path}{hit.rawQuery ? `?${hit.rawQuery}` : ""}
                    </td>
                    <td>
                      {hit.matched
                        ? hit.routeId || t("mock.hits.matched")
                        : t("mock.hits.notMatched")}
                    </td>
                    <td>{hit.status}</td>
                    <td>{hit.durationMs} ms</td>
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
