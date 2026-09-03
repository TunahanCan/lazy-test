import {
  Lifecycle,
  html,
  setHTML,
  type Disposable,
  type TrustedHTMLFragment,
} from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import { confirmDialog } from "../../core/overlays.js";
import {
  getLocale,
  subscribeLocale,
  t,
} from "../../i18n/locale.js";
import { backend } from "../../lib/backend.js";
import type {
  MockHit,
  MockRoute,
  MockServerSnapshot,
  MockServerState,
} from "../../lib/types.js";
import { workspaceStore } from "../../stores/workspace.js";
import {
  bridgeIssue,
  createRouteDraft,
  errorText,
  formatTimestamp,
  isMockSnapshot,
  mockHTTPMethods,
  operationError,
  parseMockServerPort,
  parseRoutes,
  toEditableRoute,
  type EditableRoute,
  type MockOperationResult,
  type ToolNotice,
} from "../../features/mock-server/model.js";
import { copyText } from "../clipboard.js";
import { setWorkspaceBusy } from "../chrome/workspaceActivity.js";

const mockPollIntervalMs = 1_500;
const mockPollTimeoutMs = 5_000;

const buttonClass = (
  variant: "primary" | "secondary" | "ghost" | "danger" = "secondary",
  size: "sm" | "md" = "md",
): string => `button button-${variant} button-${size}`;

function disabledAttribute(disabled: boolean): string {
  return disabled ? "disabled" : "";
}

function checkedAttribute(checked: boolean): string {
  return checked ? "checked" : "";
}

function noticeMarkup(notice: ToolNotice | null): TrustedHTMLFragment {
  if (!notice) return html``;
  return html`
    <div
      class="tool-notice tool-notice-row ${notice.tone}"
      role="${notice.tone === "error" ? "alert" : "status"}"
      aria-live="${notice.tone === "error" ? "assertive" : "polite"}"
    >
      ${icon(notice.tone === "error" ? "warning" : "check", 14)}
      ${notice.issue
        ? html`
            <div class="tool-notice-content">
              <strong>${notice.issue.title}</strong>
              <span>${notice.issue.message}</span>
              ${notice.issue.hint
                ? html`<small>${notice.issue.hint}</small>`
                : ""}
              ${notice.issue.technical
                ? html`
                    <details data-details-state="operation-error">
                      <summary>${t("mock.technicalDetails")}</summary>
                      <code>${notice.issue.technical}</code>
                    </details>
                  `
                : ""}
            </div>
          `
        : html`<span>${notice.text ?? ""}</span>`}
    </div>
  `;
}

/**
 * Mounts the dependency-free Mock Server workspace into an existing host.
 *
 * The returned disposable owns DOM listeners, locale/store subscriptions, and
 * the running-server polling timer. Backend operations already in flight are
 * allowed to finish, but their results are ignored after disposal.
 */
export function mountMockServerLab(root: HTMLElement): Disposable {
  const lifecycle = new Lifecycle();
  let disposed = false;
  let server: MockServerState | null = null;
  let routes: EditableRoute[] = [];
  let hits: MockHit[] = [];
  let selectedID = "";
  let portMode: "auto" | "manual" = "auto";
  let manualPort = "4010";
  let enableCors = false;
  let dirty = false;
  let busy = "refresh";
  setWorkspaceBusy("mock", true);
  let notice: ToolNotice | null = null;
  let routeRevision = 0;
  let snapshotRequest = 0;
  let pollingTimer: number | undefined;
  let silentRefreshGeneration = 0;
  let silentRefreshInFlight: number | undefined;
  let silentRenderPending = false;
  let compositionDepth = 0;
  let pendingFocusKeys: string[] = [];

  const selectedRoute = (): EditableRoute | null =>
    routes.find((route) => route.id === selectedID) ?? null;

  const parsedManualPort = (): number | null => {
    return parseMockServerPort(manualPort);
  };

  const activeRequest = () => {
    const state = workspaceStore.getState();
    return state.tabs.find((tab) => tab.id === state.activeTabID);
  };

  const clearPolling = (): void => {
    if (pollingTimer === undefined) return;
    window.clearInterval(pollingTimer);
    pollingTimer = undefined;
  };

  const renderNoticeArea = (): TrustedHTMLFragment => html`
    ${dirty
      ? html`
          <div
            class="tool-notice tool-notice-row warning"
            role="status"
          >
            ${icon("warning", 14)}
            <span>${t("mock.dirtyNotice")}</span>
          </div>
        `
      : ""}
    ${noticeMarkup(notice)}
    ${server?.lastError
      ? html`
          <div class="tool-notice tool-notice-row error" role="alert">
            ${icon("warning", 14)}
            <div class="tool-notice-content">
              <strong>${t("mock.lastError.title")}</strong>
              <span>${t("mock.lastError.description")}</span>
              <details data-details-state="server-error">
                <summary>${t("mock.technicalDetails")}</summary>
                <code>${server.lastError}</code>
              </details>
            </div>
          </div>
        `
      : ""}
  `;

  const renderRouteList = (): TrustedHTMLFragment => {
    const isBusy = Boolean(busy);
    if (routes.length === 0) {
      return html`
        <div class="mock-route-empty">
          ${icon("mock", 25)}
          <strong>${t("mock.routes.empty.title")}</strong>
          <span class="mock-route-empty-description">
            ${t("mock.routes.empty.description")}
          </span>
          <div class="mock-route-empty-actions">
            <button
              type="button"
              class="${buttonClass("primary", "sm")}"
              data-action="add-route"
              data-focus="action:add-first"
              ${disabledAttribute(isBusy)}
            >
              ${icon("plus", 13)} ${t("mock.action.addFirst")}
            </button>
            <button
              type="button"
              class="${buttonClass("secondary", "sm")}"
              data-action="import-openapi"
              data-focus="action:import-empty"
              ${disabledAttribute(isBusy)}
            >
              ${icon("import", 13)} ${t("mock.action.importOpenAPI")}
            </button>
          </div>
        </div>
      `;
    }
    return html`
      <div
        class="mock-route-list"
        role="listbox"
        aria-label="${t("mock.routes.aria")}"
      >
        ${routes.map(
          (route) => html`
            <button
              type="button"
              class="collection-row mock-route-row${selectedID === route.id
                ? " active"
                : ""}${route.enabled ? "" : " disabled"}"
              role="option"
              aria-selected="${selectedID === route.id
                ? "true"
                : "false"}"
              tabindex="${selectedID === route.id ? "0" : "-1"}"
              aria-label="${route.method} ${route.path} · ${t(
                route.enabled
                  ? "mock.route.enabled"
                  : "mock.route.disabled",
              )}"
              data-route-id="${route.id}"
              data-focus="route:${route.id}"
            >
              <strong class="mock-route-method">${route.method}</strong>
              <span class="mock-route-path">${route.path}</span>
            </button>
          `,
        )}
      </div>
    `;
  };

  const renderRouteEditor = (): TrustedHTMLFragment => {
    const route = selectedRoute();
    const isBusy = Boolean(busy);
    const request = activeRequest();
    if (!route) {
      return html`
        <div class="mock-route-editor-empty">
          ${icon("mock", 24)}
          <strong>${t("mock.editor.empty")}</strong>
          <span>${t("mock.editor.emptyDescription")}</span>
        </div>
      `;
    }
    return html`
      <div class="tool-card-header">
        <div>
          <h2>${route.method} ${route.path}</h2>
          <span>${t("mock.editor.description")}</span>
        </div>
        <div class="mock-route-header-actions">
          <button
            type="button"
            class="${buttonClass("ghost", "sm")}"
            data-action="use-active-response"
            data-focus="action:active-response"
            title="${request?.response
              ? t("mock.editor.useResponse")
              : t("mock.editor.noResponse")}"
            ${disabledAttribute(isBusy || !request?.response)}
          >
            ${icon("copy", 13)} ${t("mock.action.activeResponse")}
          </button>
          <button
            type="button"
            class="${buttonClass("danger", "sm")}"
            data-action="delete-route"
            data-focus="action:delete"
            ${disabledAttribute(isBusy)}
          >
            ${icon("trash", 13)} ${t("mock.action.delete")}
          </button>
        </div>
      </div>
      <div class="mock-route-fields">
        <label class="mock-route-field">
          ${t("mock.field.method")}
          <select
            data-field="method"
            data-focus="field:method"
            ${disabledAttribute(isBusy)}
          >
            ${mockHTTPMethods.map(
              (method: string) => html`
                <option ${method === route.method ? "selected" : ""}>
                  ${method}
                </option>
              `,
            )}
          </select>
        </label>
        <label class="mock-route-field">
          ${t("mock.field.path")}
          <input
            value="${route.path}"
            data-field="path"
            data-focus="field:path"
            placeholder="/users/{id}"
            spellcheck="false"
            required
            aria-describedby="mock-route-path-help"
            ${disabledAttribute(isBusy)}
          />
          <small id="mock-route-path-help">${t("mock.field.pathHint")}</small>
        </label>
        <label class="mock-route-field">
          ${t("mock.field.status")}
          <input
            type="number"
            min="200"
            max="599"
            value="${route.status}"
            data-field="status"
            data-focus="field:status"
            ${disabledAttribute(isBusy)}
          />
        </label>
        <label class="mock-route-field">
          ${t("mock.field.delay")}
          <input
            type="number"
            min="0"
            max="600000"
            value="${route.delayMs}"
            data-field="delay"
            data-focus="field:delay"
            ${disabledAttribute(isBusy)}
          />
        </label>
        <label class="mock-route-enabled">
          <input
            type="checkbox"
            data-field="enabled"
            data-focus="field:enabled"
            ${checkedAttribute(route.enabled)}
            ${disabledAttribute(isBusy)}
          />
          ${t("mock.field.enabled")}
        </label>
      </div>
      <div class="mock-route-response-editors">
        <label
          class="mock-route-response-editor mock-route-response-editor-headers"
        >
          <span class="mock-route-response-label">
            ${t("mock.field.headers")}
          </span>
          <textarea
            class="tool-code-input mock-route-code-input"
            aria-label="${t("mock.field.headersAria")}"
            aria-describedby="mock-route-headers-help"
            data-field="headers"
            data-focus="field:headers"
            spellcheck="false"
            ${disabledAttribute(isBusy)}
          >${route.headersText}</textarea>
          <small id="mock-route-headers-help">
            ${t("mock.field.headersHint")}
          </small>
        </label>
        <label class="mock-route-response-editor">
          <span class="mock-route-response-label">
            ${t("mock.field.body")}
          </span>
          <textarea
            class="tool-code-input mock-route-code-input"
            aria-label="${t("mock.field.bodyAria")}"
            aria-describedby="mock-route-body-help"
            data-field="body"
            data-focus="field:body"
            spellcheck="false"
            ${disabledAttribute(isBusy)}
          >${route.body}</textarea>
          <small id="mock-route-body-help">${t("mock.field.bodyHint")}</small>
        </label>
      </div>
    `;
  };

  const renderHits = (): TrustedHTMLFragment => {
    if (hits.length === 0) {
      return html`
        <div class="mock-hit-empty" role="status">${t("mock.hits.empty")}</div>
      `;
    }
    return html`
      <div class="mock-hit-table-wrap">
        <table class="mock-hit-table">
          <caption class="sr-only">${t("mock.hits.title")}</caption>
          <thead>
            <tr>
              ${[
                t("mock.hits.column.time"),
                t("mock.hits.column.method"),
                t("mock.hits.column.path"),
                t("mock.hits.column.route"),
                t("mock.hits.column.status"),
                t("mock.hits.column.duration"),
              ].map((column) => html`<th scope="col">${column}</th>`)}
            </tr>
          </thead>
          <tbody>
            ${hits.map((hit) => {
              const path = `${hit.path}${
                hit.rawQuery ? `?${hit.rawQuery}` : ""
              }`;
              return html`
                <tr>
                  <td>${formatTimestamp(hit.timestamp, getLocale())}</td>
                  <td class="mock-hit-method">${hit.method}</td>
                  <td class="mock-hit-path" title="${path}">${path}</td>
                  <td>
                    ${hit.matched
                      ? hit.routeId || t("mock.hits.matched")
                      : t("mock.hits.notMatched")}
                  </td>
                  <td>${hit.status}</td>
                  <td>${hit.durationMs} ms</td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>
    `;
  };

  const pageMarkup = (): TrustedHTMLFragment => {
    const isBusy = Boolean(busy);
    const portLocked = Boolean(server?.running) || isBusy;
    const manualPortValid = parsedManualPort() !== null;
    return html`
      <section
        class="tool-page mock-server-page"
        aria-labelledby="mock-server-title"
        aria-busy="${isBusy ? "true" : "false"}"
      >
        <header class="tool-page-header">
          <div>
            <span class="tool-eyebrow">${t("mock.eyebrow")}</span>
            <h1 id="mock-server-title">${t("mock.title")}</h1>
            <p>
              ${t("mock.description.before")} <code>127.0.0.1</code>
              ${t("mock.description.after")}
            </p>
          </div>
          <div
            class="tool-header-meta"
            role="status"
            aria-live="polite"
          >
            <strong>
              ${busy
                ? t("mock.state.processing")
                : server?.running
                  ? t("mock.state.running")
                  : t("mock.state.stopped")}
            </strong>
            <span>
              ${busy === "refresh"
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

        <div
          class="tool-panel mock-server-controls"
          aria-label="${t("mock.server.controls")}"
        >
          <span
            class="mock-server-state-indicator ${busy
              ? "is-busy"
              : server?.running
                ? "is-running"
                : "is-stopped"}"
            role="img"
            aria-label="${busy
              ? t("mock.state.processing")
              : server?.running
                ? t("mock.state.running")
                : t("mock.state.stopped")}"
            title="${busy
              ? t("mock.state.processing")
              : server?.running
                ? t("mock.state.running")
                : t("mock.state.stopped")}"
          >
            ${icon(
              busy ? "spinner" : server?.running ? "check" : "stop",
              16,
              busy ? "spin" : "",
            )}
          </span>
          <div class="mock-server-port-field">
            <span>${t("mock.port")}</span>
            <div
              class="mock-server-port-mode"
              role="group"
              aria-label="${t("mock.portModeAria")}"
            >
              <button
                type="button"
                class="${portMode === "auto" ? "active" : ""}"
                data-action="port-auto"
                data-focus="action:port-auto"
                aria-pressed="${portMode === "auto" ? "true" : "false"}"
                ${disabledAttribute(portLocked)}
              >
                ${t("mock.portAuto")}
              </button>
              <button
                type="button"
                class="${portMode === "manual" ? "active" : ""}"
                data-action="port-manual"
                data-focus="action:port-manual"
                aria-pressed="${portMode === "manual" ? "true" : "false"}"
                ${disabledAttribute(portLocked)}
              >
                ${t("mock.portManual")}
              </button>
            </div>
          </div>
          ${portMode === "manual"
            ? html`
                <label class="mock-server-manual-port">
                  <span>${t("mock.portNumber")}</span>
                  <input
                    class="mock-server-port-input"
                    aria-label="${t("mock.portAria")}"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    max="65535"
                    step="1"
                    value="${manualPort}"
                    data-field="port"
                    data-focus="field:port"
                    aria-describedby="mock-server-port-help"
                    aria-invalid="${manualPortValid ? "false" : "true"}"
                    ${disabledAttribute(portLocked)}
                  />
                </label>
              `
            : ""}
          <label class="mock-server-cors-toggle">
            <input
              type="checkbox"
              data-field="cors"
              data-focus="field:cors"
              ${checkedAttribute(enableCors)}
              ${disabledAttribute(Boolean(server?.running) || isBusy)}
            />
            ${t("mock.cors")}
          </label>
          <span class="mock-server-port-hint" id="mock-server-port-help">
            ${portMode === "auto"
              ? t("mock.portHintAuto")
              : manualPortValid
                ? t("mock.portHintManual")
                : t("mock.portInvalid")}
          </span>
          <div class="mock-server-controls-actions">
            ${server?.running
              ? html`
                  <button
                    type="button"
                    class="${buttonClass("ghost", "sm")}"
                    data-action="copy-url"
                    data-focus="action:copy-url"
                    aria-label="${t("mock.copy.urlAria", {
                      url: server.baseUrl,
                    })}"
                  >
                    ${icon("copy", 13)} ${server.baseUrl}
                  </button>
                `
              : ""}
            ${server?.running
              ? html`
                  <button
                    type="button"
                    class="${buttonClass("danger")}"
                    data-action="stop"
                    data-focus="action:stop"
                    ${disabledAttribute(isBusy)}
                  >
                    ${icon("stop", 14)} ${t("mock.action.stop")}
                  </button>
                `
              : html`
                  <button
                    type="button"
                    class="${buttonClass("primary")}"
                    data-action="start"
                    data-focus="action:start"
                    title="${dirty
                      ? t("mock.startBlocked")
                      : portMode === "manual" && !manualPortValid
                        ? t("mock.portInvalid")
                        : ""}"
                    ${disabledAttribute(
                      isBusy ||
                        dirty ||
                        (portMode === "manual" && !manualPortValid),
                    )}
                  >
                    ${icon(
                      busy === "start" ? "spinner" : "play",
                      14,
                      busy === "start" ? "spin" : "",
                    )}
                    ${t("mock.action.start")}
                  </button>
                `}
          </div>
        </div>

        ${renderNoticeArea()}

        <div class="mock-server-workspace${routes.length === 0 ? " is-empty" : ""}">
          <aside class="tool-panel" aria-label="${t("mock.routes.aria")}">
            <div class="tool-card-header">
              <div>
                <h2>${t("mock.routes.title")}</h2>
                <span>${t("mock.routes.count", { count: routes.length })}</span>
              </div>
              ${routes.length > 0
                ? html`
                    <div class="mock-route-header-actions">
                      <button
                        type="button"
                        class="${buttonClass("ghost", "sm")}"
                        data-action="add-route"
                        data-focus="action:add"
                        ${disabledAttribute(isBusy)}
                      >
                        ${icon("plus", 13)} ${t("mock.action.add")}
                      </button>
                      <button
                        type="button"
                        class="${buttonClass("ghost", "sm")}"
                        data-action="import-openapi"
                        data-focus="action:import"
                        ${disabledAttribute(isBusy)}
                      >
                        ${icon("import", 13)} ${t("mock.action.importOpenAPI")}
                      </button>
                    </div>
                  `
                : ""}
            </div>
            ${renderRouteList()}
          </aside>

          ${routes.length > 0
            ? html`
                <section
                  class="tool-editor-card"
                  aria-label="${t("mock.editor.aria")}"
                >
                  ${renderRouteEditor()}
                </section>
                <div class="tool-card-actions mock-route-footer">
                  <span class="mock-route-sync-status">
                    ${dirty ? t("mock.routes.dirty") : t("mock.routes.synced")}
                  </span>
                  <button
                    type="button"
                    class="${buttonClass("primary", "sm")}"
                    data-action="apply-routes"
                    data-focus="action:apply"
                    ${disabledAttribute(!dirty || isBusy)}
                  >
                    ${icon(
                      busy === "apply" ? "spinner" : "save",
                      13,
                      busy === "apply" ? "spin" : "",
                    )}
                    ${t("mock.action.apply")}
                  </button>
                </div>
              `
            : ""}
        </div>

        ${routes.length > 0 || hits.length > 0 || server?.running
          ? html`<section class="tool-panel mock-hit-panel">
          <div class="tool-card-header">
            <div>
              <h2>${t("mock.hits.title")}</h2>
              <span>
                ${t("mock.hits.summary", {
                  total: server?.totalHits ?? 0,
                  visible: hits.length,
                })}
              </span>
            </div>
            <button
              type="button"
              class="${buttonClass("ghost", "sm")}"
              data-action="clear-hits"
              data-focus="action:clear-hits"
              ${disabledAttribute(hits.length === 0 || isBusy)}
            >
              ${icon("trash", 13)} ${t("mock.action.clearHistory")}
            </button>
          </div>
          ${renderHits()}
        </section>`
          : ""}
      </section>
    `;
  };

  const render = (): void => {
    if (disposed) return;
    silentRenderPending = false;
    const pageScrollTop =
      root.querySelector<HTMLElement>(".mock-server-page")
        ?.scrollTop ?? 0;
    const openDetails = new Set(
      [
        ...root.querySelectorAll<HTMLDetailsElement>(
          "details[data-details-state][open]",
        ),
      ]
        .map((details) => details.dataset.detailsState)
        .filter((key): key is string => Boolean(key)),
    );
    const active =
      document.activeElement instanceof HTMLElement &&
      root.contains(document.activeElement)
        ? document.activeElement
        : undefined;
    const focusKey = active?.dataset.focus;
    const focusKeys =
      pendingFocusKeys.length > 0
        ? pendingFocusKeys
        : focusKey
          ? [focusKey]
          : [];
    const selection =
      active instanceof HTMLTextAreaElement ||
      (active instanceof HTMLInputElement &&
        ["text", "search", "url", "tel", "password", "email"].includes(
          active.type,
        ))
        ? {
            start: active.selectionStart,
            end: active.selectionEnd,
            direction: active.selectionDirection,
            scrollTop: active.scrollTop,
            scrollLeft: active.scrollLeft,
          }
        : undefined;

    setHTML(root, pageMarkup());
    compositionDepth = 0;
    const renderedPage =
      root.querySelector<HTMLElement>(".mock-server-page");
    if (renderedPage && pageScrollTop > 0) {
      renderedPage.scrollTop = pageScrollTop;
    }
    for (const details of root.querySelectorAll<HTMLDetailsElement>(
      "details[data-details-state]",
    )) {
      details.open = openDetails.has(details.dataset.detailsState ?? "");
    }

    if (focusKeys.length === 0) return;
    const focusableElements = [
      ...root.querySelectorAll<HTMLElement>("[data-focus]"),
    ];
    const replacement = focusKeys
      .map((key) =>
        focusableElements.find(
          (element) =>
            element.dataset.focus === key && !element.matches(":disabled"),
        ),
      )
      .find((element): element is HTMLElement => Boolean(element));
    if (!replacement || replacement.matches(":disabled")) return;
    pendingFocusKeys = [];
    replacement.focus({ preventScroll: true });
    if (
      selection &&
      (replacement instanceof HTMLInputElement ||
        replacement instanceof HTMLTextAreaElement)
    ) {
      replacement.setSelectionRange(
        selection.start,
        selection.end,
        selection.direction ?? undefined,
      );
      replacement.scrollTop = selection.scrollTop;
      replacement.scrollLeft = selection.scrollLeft;
    }
  };

  const activeEditor = (): boolean => {
    if (compositionDepth > 0) return true;
    const active = document.activeElement;
    return (
      active instanceof HTMLElement &&
      root.contains(active) &&
      (active instanceof HTMLInputElement ||
        active instanceof HTMLSelectElement ||
        active instanceof HTMLTextAreaElement ||
        active.isContentEditable)
    );
  };

  const renderSilentSnapshot = (): void => {
    if (activeEditor()) {
      silentRenderPending = true;
      return;
    }
    silentRenderPending = false;
    render();
  };

  const flushSilentRender = (): void => {
    if (
      disposed ||
      !silentRenderPending ||
      activeEditor() ||
      Boolean(busy)
    ) {
      return;
    }
    silentRenderPending = false;
    render();
  };

  const invalidateSilentRefresh = (): void => {
    silentRefreshGeneration += 1;
    silentRefreshInFlight = undefined;
    silentRenderPending = false;
  };

  const readSilentSnapshot = async (): Promise<
    | { kind: "snapshot"; snapshot: MockServerSnapshot }
    | { kind: "error"; error: unknown }
    | { kind: "timeout" }
  > => {
    let timeoutID: number | undefined;
    const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
      timeoutID = window.setTimeout(
        () => resolve({ kind: "timeout" }),
        mockPollTimeoutMs,
      );
    });
    const request = backend.getMockServer().then(
      (snapshot) => ({ kind: "snapshot" as const, snapshot }),
      (error: unknown) => ({ kind: "error" as const, error }),
    );
    const result = await Promise.race([request, timeout]);
    if (timeoutID !== undefined) window.clearTimeout(timeoutID);
    return result;
  };

  const syncPolling = (): void => {
    if (!server?.running) {
      clearPolling();
      return;
    }
    if (pollingTimer !== undefined) return;
    pollingTimer = window.setInterval(() => {
      void refresh(false, true);
    }, mockPollIntervalMs);
  };

  const acceptSnapshot = (
    snapshot: MockServerSnapshot,
    includeRoutes: boolean,
    expectedRouteRevision = routeRevision,
    expectedSnapshotRequest = snapshotRequest,
  ): boolean => {
    if (disposed || expectedSnapshotRequest !== snapshotRequest) return false;
    server = snapshot.state;
    hits = snapshot.hits ?? [];
    if (
      includeRoutes &&
      expectedRouteRevision === routeRevision
    ) {
      routes = (snapshot.routes ?? []).map(toEditableRoute);
      if (!routes.some((route) => route.id === selectedID)) {
        selectedID = routes[0]?.id ?? "";
      }
      dirty = false;
    }
    syncPolling();
    return true;
  };

  async function refresh(
    includeRoutes: boolean,
    silent = false,
  ): Promise<MockServerSnapshot | undefined> {
    if (silent) {
      if (busy || silentRefreshInFlight !== undefined) {
        return undefined;
      }
      const generation = ++silentRefreshGeneration;
      silentRefreshInFlight = generation;
      const expectedRouteRevision = routeRevision;
      const expectedSnapshotRequest = ++snapshotRequest;
      try {
        const result = await readSilentSnapshot();
        if (
          disposed ||
          generation !== silentRefreshGeneration ||
          silentRefreshInFlight !== generation
        ) {
          return undefined;
        }
        if (result.kind !== "snapshot") return undefined;
        const accepted = acceptSnapshot(
          result.snapshot,
          includeRoutes,
          expectedRouteRevision,
          expectedSnapshotRequest,
        );
        if (accepted) renderSilentSnapshot();
        return accepted ? result.snapshot : undefined;
      } finally {
        if (silentRefreshInFlight === generation) {
          silentRefreshInFlight = undefined;
        }
      }
    }

    invalidateSilentRefresh();
    const expectedRouteRevision = routeRevision;
    const expectedSnapshotRequest = ++snapshotRequest;
    busy = "refresh";
    setWorkspaceBusy("mock", true);
    render();
    try {
      const snapshot = await backend.getMockServer();
      if (disposed) return undefined;
      acceptSnapshot(
        snapshot,
        includeRoutes,
        expectedRouteRevision,
        expectedSnapshotRequest,
      );
      return snapshot;
    } catch (error) {
      if (!disposed) {
        notice = {
          tone: "error",
          issue: bridgeIssue(error, t("mock.refresh.failed"), t),
        };
      }
      return undefined;
    } finally {
      if (!disposed) {
        busy = "";
        setWorkspaceBusy("mock", false);
        render();
      }
    }
  }

  const runOperation = async (
    operation: string,
    action: () => Promise<MockOperationResult>,
    successMessage: string,
    includeRoutes = false,
  ): Promise<void> => {
    invalidateSilentRefresh();
    clearPolling();
    pendingFocusKeys =
      operation === "start"
        ? ["action:stop", "action:start"]
        : operation === "stop"
          ? ["action:start", "action:stop"]
          : operation === "apply" || operation === "import"
            ? ["field:path", "action:add-first", "action:add"]
            : operation === "clear"
              ? ["action:clear-hits", "action:stop", "action:start"]
              : [];
    const expectedRouteRevision = routeRevision;
    const expectedSnapshotRequest = ++snapshotRequest;
    busy = operation;
    setWorkspaceBusy("mock", true);
    notice = null;
    render();
    try {
      const result = await action();
      if (disposed) return;
      const failure = operationError(result, t);
      if (failure) {
        notice = { tone: "error", issue: failure };
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
        if (disposed) return;
        acceptSnapshot(
          snapshot,
          includeRoutes,
          expectedRouteRevision,
          expectedSnapshotRequest,
        );
      }
      notice = { tone: "success", text: successMessage };
    } catch (error) {
      if (!disposed) {
        notice = {
          tone: "error",
          issue: bridgeIssue(error, t("mock.operation.failed"), t),
        };
      }
    } finally {
      if (!disposed) {
        busy = "";
        setWorkspaceBusy("mock", false);
        syncPolling();
        render();
      }
    }
  };

  const updateSelected = (
    patch: Partial<EditableRoute>,
    deferRender = false,
  ): void => {
    const route = selectedRoute();
    if (!route) return;
    const changed = Object.entries(patch).some(
      ([key, value]) => route[key as keyof EditableRoute] !== value,
    );
    if (!changed) return;
    routes = routes.map((candidate) =>
      candidate.id === route.id ? { ...candidate, ...patch } : candidate,
    );
    routeRevision += 1;
    dirty = true;
    notice = null;
    if (!deferRender) {
      render();
      return;
    }
    silentRenderPending = true;
    const status = root.querySelector<HTMLElement>(
      ".mock-route-sync-status",
    );
    if (status) status.textContent = t("mock.routes.dirty");
    const apply = root.querySelector<HTMLButtonElement>(
      '[data-action="apply-routes"]',
    );
    if (apply) apply.disabled = Boolean(busy);
  };

  const addRoute = (): void => {
    const route = createRouteDraft();
    routes = [...routes, route];
    selectedID = route.id;
    routeRevision += 1;
    dirty = true;
    notice = null;
    render();
  };

  const deleteRoute = async (trigger: HTMLElement): Promise<void> => {
    const route = selectedRoute();
    if (!route) return;
    const confirmed = await confirmDialog({
      title: t("mock.delete.title"),
      description: t("mock.delete.description", {
        method: route.method,
        path: route.path,
      }),
      confirmLabel: t("mock.delete.confirm"),
      cancelLabel: t("sidebar.cancel"),
      danger: true,
      trigger,
    });
    if (!confirmed || disposed) return;
    const index = routes.findIndex((candidate) => candidate.id === route.id);
    routes = routes.filter((candidate) => candidate.id !== route.id);
    selectedID = routes[Math.min(index, routes.length - 1)]?.id ?? "";
    pendingFocusKeys = selectedID
      ? [`route:${selectedID}`, "field:path"]
      : ["action:add-first", "action:add"];
    routeRevision += 1;
    dirty = true;
    notice = null;
    render();
  };

  const useActiveResponse = (): void => {
    const route = selectedRoute();
    const request = activeRequest();
    if (!route || !request?.response) return;
    try {
      JSON.parse(request.response.body);
    } catch {
      notice = {
        tone: "error",
        text: t("mock.activeResponse.invalid"),
      };
      render();
      return;
    }
    let path = route.path;
    try {
      path = new URL(request.response.resolvedUrl).pathname || "/";
    } catch {
      // Keep the editable route path when the response URL is unavailable.
    }
    routes = routes.map((candidate) =>
      candidate.id === route.id
        ? {
            ...candidate,
            method: request.method,
            path,
            status: request.response!.statusCode,
            headersText: JSON.stringify(
              {
                "Content-Type":
                  request.response!.contentType || "application/json",
              },
              null,
              2,
            ),
            body: request.response!.body,
          }
        : candidate,
    );
    routeRevision += 1;
    dirty = true;
    notice = {
      tone: "success",
      text: t("mock.activeResponse.copied", { name: request.name }),
    };
    render();
  };

  const applyRoutes = async (): Promise<void> => {
    let parsed: MockRoute[];
    try {
      parsed = parseRoutes(routes, t);
    } catch (error) {
      notice = {
        tone: "error",
        issue: {
          title: t("mock.routes.invalid.title"),
          message: errorText(error),
        },
      };
      render();
      return;
    }
    await runOperation(
      "apply",
      () => backend.updateMockRoutes(parsed),
      t("mock.routes.applied", { count: parsed.length }),
      true,
    );
  };

  const importOpenAPI = async (trigger: HTMLElement): Promise<void> => {
    if (
      dirty &&
      !(await confirmDialog({
        title: "OpenAPI",
        description: t("mock.import.confirm"),
        confirmLabel: "OpenAPI",
        cancelLabel: t("sidebar.cancel"),
        trigger,
      }))
    ) {
      return;
    }
    if (disposed) return;
    await runOperation(
      "import",
      () => backend.importMockOpenAPI(),
      t("mock.import.success"),
      true,
    );
  };

  const copyURL = async (): Promise<void> => {
    if (!server?.baseUrl) return;
    try {
      if (!(await copyText(server.baseUrl))) {
        throw new Error("Clipboard unavailable");
      }
      if (!disposed) {
        notice = { tone: "success", text: t("mock.copy.success") };
      }
    } catch {
      if (!disposed) {
        notice = { tone: "error", text: t("mock.copy.failed") };
      }
    }
    render();
  };

  const syncPortValidationUI = (): void => {
    if (portMode !== "manual") return;
    const valid = parsedManualPort() !== null;
    root
      .querySelector<HTMLInputElement>('[data-field="port"]')
      ?.setAttribute("aria-invalid", valid ? "false" : "true");
    const hint = root.querySelector<HTMLElement>("#mock-server-port-help");
    if (hint) {
      hint.textContent = t(
        valid ? "mock.portHintManual" : "mock.portInvalid",
      );
    }
    const start = root.querySelector<HTMLButtonElement>(
      '[data-action="start"]',
    );
    if (start) {
      start.disabled = Boolean(busy) || dirty || !valid;
      start.title = dirty
        ? t("mock.startBlocked")
        : valid
          ? ""
          : t("mock.portInvalid");
    }
  };

  const handleField = (
    target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    deferRender = false,
  ): void => {
    switch (target.dataset.field) {
      case "port":
        manualPort = target.value;
        syncPortValidationUI();
        break;
      case "cors":
        enableCors = (target as HTMLInputElement).checked;
        render();
        break;
      case "method":
        updateSelected({ method: target.value });
        break;
      case "path":
        updateSelected({ path: target.value });
        break;
      case "status":
        updateSelected({ status: Number(target.value) });
        break;
      case "delay":
        updateSelected({ delayMs: Number(target.value) });
        break;
      case "enabled":
        updateSelected({ enabled: (target as HTMLInputElement).checked });
        break;
      case "headers":
        updateSelected({ headersText: target.value }, deferRender);
        break;
      case "body":
        updateSelected({ body: target.value }, deferRender);
        break;
    }
  };

  lifecycle.listen(root, "click", (event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-action], [data-route-id]")
        : null;
    if (!target || !root.contains(target)) return;
    if (target instanceof HTMLButtonElement && target.disabled) return;
    const routeID = target.dataset.routeId;
    if (routeID) {
      selectedID = routeID;
      render();
      return;
    }
    switch (target.dataset.action) {
      case "port-auto":
        portMode = "auto";
        notice = null;
        render();
        break;
      case "port-manual":
        portMode = "manual";
        notice = null;
        render();
        requestAnimationFrame(() => {
          root
            .querySelector<HTMLInputElement>('[data-focus="field:port"]')
            ?.select();
        });
        break;
      case "add-route":
        addRoute();
        break;
      case "delete-route":
        void deleteRoute(target);
        break;
      case "use-active-response":
        useActiveResponse();
        break;
      case "apply-routes":
        void applyRoutes();
        break;
      case "import-openapi":
        void importOpenAPI(target);
        break;
      case "copy-url":
        void copyURL();
        break;
      case "start":
        {
          const requestedPort =
            portMode === "manual" ? parsedManualPort() : 0;
          if (requestedPort === null) {
            notice = {
              tone: "error",
              issue: {
                title: t("mock.portInvalidTitle"),
                message: t("mock.portInvalid"),
              },
            };
            render();
            break;
          }
          void runOperation(
            "start",
            () =>
              backend.startMockServer({
                port: requestedPort,
                enableCors,
              }),
            t("mock.start.success"),
          );
        }
        break;
      case "stop":
        void runOperation(
          "stop",
          () => backend.stopMockServer(),
          t("mock.stop.success"),
        );
        break;
      case "clear-hits":
        void runOperation(
          "clear",
          () => backend.clearMockHits(),
          t("mock.history.cleared"),
        );
        break;
    }
  });

  lifecycle.listen(root, "keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-route-id]")
        : null;
    if (!target || !root.contains(target)) return;
    const current = routes.findIndex(
      (route) => route.id === target.dataset.routeId,
    );
    if (current < 0) return;
    event.preventDefault();
    let next = current;
    if (event.key === "ArrowDown") next = (current + 1) % routes.length;
    if (event.key === "ArrowUp") {
      next = (current - 1 + routes.length) % routes.length;
    }
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = routes.length - 1;
    const nextRoute = routes[next];
    if (!nextRoute) return;
    selectedID = nextRoute.id;
    render();
    root
      .querySelector<HTMLElement>(`[data-route-id="${nextRoute.id}"]`)
      ?.focus();
  });

  const fieldListener = (event: Event): void => {
    const target = event.target;
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) ||
      !target.dataset.field
    ) {
      return;
    }
    const deferRender =
      target instanceof HTMLTextAreaElement ||
      (event instanceof InputEvent && event.isComposing) ||
      compositionDepth > 0;
    handleField(target, deferRender);
  };
  lifecycle.listen(root, "compositionstart", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      root.contains(target) &&
      target.hasAttribute("data-field")
    ) {
      compositionDepth += 1;
    }
  });
  lifecycle.listen(root, "compositionend", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      root.contains(target) &&
      target.hasAttribute("data-field")
    ) {
      compositionDepth = Math.max(0, compositionDepth - 1);
      window.requestAnimationFrame(flushSilentRender);
    }
  });
  lifecycle.listen(root, "focusout", (event) => {
    const next = (event as FocusEvent).relatedTarget;
    if (
      next instanceof HTMLElement &&
      root.contains(next)
    ) {
      return;
    }
    window.requestAnimationFrame(flushSilentRender);
  });
  lifecycle.listen(root, "input", fieldListener);
  lifecycle.listen(root, "change", fieldListener);
  lifecycle.add(
    subscribeLocale(() => {
      notice = null;
      render();
    }),
  );
  lifecycle.add(workspaceStore.subscribe(render));
  lifecycle.add(() => {
    setWorkspaceBusy("mock", false);
    disposed = true;
    invalidateSilentRefresh();
    clearPolling();
    root.replaceChildren();
  });

  render();
  void refresh(true);

  return lifecycle;
}
