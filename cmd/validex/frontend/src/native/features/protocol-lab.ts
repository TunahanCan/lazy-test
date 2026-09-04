import {
  delegate,
  html,
  Lifecycle,
  optionalElement,
  setHTML,
  type Disposable,
  type TrustedHTMLFragment,
} from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import {
  getLocale,
  subscribeLocale,
  t,
} from "../../i18n/locale.js";
import { backend } from "../../lib/backend.js";
import type { SSEInput, SSEResult } from "../../lib/types.js";
import {
  createOperationID,
  durationLabel,
  issueFrom,
  parseStringMap,
  positiveInteger,
  timeoutMilliseconds,
  usesSecureProtocol,
  validateURL,
  type ProtocolIssue,
} from "../../features/protocols/model.js";
import { createWorkspaceActivityScope } from "../chrome/workspaceActivity.js";

interface SSEFormState {
  url: string;
  headers: string;
  timeout: string;
  maxEvents: string;
  insecureSkipVerify: boolean;
}

interface ProtocolLabState {
  loading: boolean;
  activeOperationID: string;
  canceling: boolean;
  issue: ProtocolIssue | null;
  input: SSEFormState;
  result: SSEResult | null;
}

function protocolError(issue: ProtocolIssue | null): TrustedHTMLFragment {
  if (!issue) return html``;
  return html`
    <div
      class="tool-notice tool-notice-row error protocol-error"
      role="alert"
      aria-live="assertive"
    >
      ${icon("warning", 16)}
      <div class="tool-notice-content">
        <strong>${issue.title}</strong>
        <span>${issue.message}</span>
        ${issue.hint
          ? html`<small class="protocol-error-hint">${issue.hint}</small>`
          : null}
        ${issue.technical
          ? html`
              <details>
                <summary>${t("common.technicalDetails")}</summary>
                <code>${issue.technical}</code>
              </details>
            `
          : null}
      </div>
    </div>
  `;
}

function protocolEmpty(
  title: string,
  description: string,
): TrustedHTMLFragment {
  return html`
    <div class="tool-empty-result protocol-empty" role="group">
      ${icon("protocols", 25)}
      <strong>${title}</strong>
      <span>${description}</span>
    </div>
  `;
}

function resultHeader(): TrustedHTMLFragment {
  return html`
    <div class="tool-card-header">
      <div>
        <h2 id="protocol-results-title">${t("protocol.sse.events")}</h2>
        <span>${t("protocol.sse.resultDescription")}</span>
      </div>
    </div>
  `;
}

function resultMetrics(result: SSEResult): TrustedHTMLFragment {
  return html`
    <dl class="protocol-metrics">
      <div>
        <dt>HTTP</dt>
        <dd>${result.statusCode}</dd>
      </div>
      <div>
        <dt>${t("protocol.metric.duration")}</dt>
        <dd>${durationLabel(result.durationMs, getLocale(), t)}</dd>
      </div>
      <div>
        <dt>${t("protocol.metric.event")}</dt>
        <dd>${result.events.length}</dd>
      </div>
    </dl>
  `;
}

function headerDetails(
  headers: Record<string, string | string[]>,
): TrustedHTMLFragment {
  const entries = Object.entries(headers ?? {});
  if (entries.length === 0) return html``;
  return html`
    <details class="protocol-header-details">
      <summary>
        ${t("protocol.responseHeaders")} <span>${entries.length}</span>
      </summary>
      <dl>
        ${entries.map(
          ([name, value]) => html`
            <div>
              <dt>${name}</dt>
              <dd>${Array.isArray(value) ? value.join(", ") : String(value)}</dd>
            </div>
          `,
        )}
      </dl>
    </details>
  `;
}

function eventTable(result: SSEResult): TrustedHTMLFragment {
  if (result.events.length === 0) {
    return protocolEmpty(
      t("protocol.sse.emptyStreamTitle"),
      t("protocol.sse.emptyStreamDescription"),
    );
  }
  return html`
    <div class="protocol-table-wrap">
      <table class="protocol-event-table">
        <caption class="sr-only">${t("protocol.sse.eventTable")}</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">${t("protocol.sse.column.event")}</th>
            <th scope="col">${t("protocol.sse.column.id")}</th>
            <th scope="col">${t("protocol.sse.column.retry")}</th>
            <th scope="col">${t("protocol.sse.column.data")}</th>
          </tr>
        </thead>
        <tbody>
          ${result.events.map(
            (item, index) => html`
              <tr>
                <td>${index + 1}</td>
                <td><code>${item.event || "message"}</code></td>
                <td><code>${item.id || "—"}</code></td>
                <td>${item.hasRetry ? `${item.retryMillis} ms` : "—"}</td>
                <td><pre>${item.data}</pre></td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `;
}

function resultContent(state: ProtocolLabState): TrustedHTMLFragment {
  if (state.loading) {
    return html`
      <div
        class="tool-empty-result protocol-empty"
        role="status"
        aria-live="polite"
        tabindex="-1"
        data-protocol-focus="progress"
      >
        ${icon("spinner", 25, "spin")}
        <strong>${t("protocol.sse.loading")}</strong>
        <span>${t("protocol.waiting")}</span>
      </div>
    `;
  }
  if (!state.result) {
    return protocolEmpty(
      t("protocol.noConnectionTitle"),
      t("protocol.sse.noConnectionDescription"),
    );
  }
  return html`
    <div
      class="${state.issue
        ? "tool-notice tool-notice-row warning"
        : "tool-success-card"} protocol-result-summary"
      role="status"
    >
      ${icon(state.issue ? "warning" : "check", 17)}
      <span>
        ${t(
          state.issue
            ? "protocol.sse.partialResult"
            : "protocol.sse.completed",
          {
            count: state.result.events.length,
            status: state.result.statusCode,
          },
        )}
      </span>
    </div>
    ${resultMetrics(state.result)}
    ${headerDetails(state.result.headers)}
    ${eventTable(state.result)}
  `;
}

function renderPage(root: HTMLElement, state: ProtocolLabState): void {
  const secure = usesSecureProtocol(state.input.url, "https:");
  const busy = state.loading;
  setHTML(
    root,
    html`
      <section
        class="tool-page protocol-lab"
        aria-labelledby="protocol-lab-title"
      >
        <header class="tool-page-header">
          <div>
            <span class="tool-eyebrow">${t("protocol.eyebrow")}</span>
            <h1 id="protocol-lab-title">${t("protocol.title")}</h1>
            <p>${t("protocol.description")}</p>
          </div>
        </header>

        <div data-protocol-slot="issue">${protocolError(state.issue)}</div>

        <div class="protocol-workspace">
          <form
            class="tool-panel protocol-form"
            data-protocol-form
            aria-busy="${busy ? "true" : "false"}"
          >
            <div class="tool-card-header">
              <div>
                <strong>${t("protocol.sse.connection")}</strong>
                <span>${t("protocol.sse.connectionDescription")}</span>
              </div>
              <span class="protocol-method">GET</span>
            </div>

            <div class="protocol-fields">
              <label class="protocol-field protocol-field-wide">
                <span>${t("protocol.sse.url")}</span>
                <input
                  type="url"
                  name="url"
                  data-protocol-control="url"
                  value="${state.input.url}"
                  placeholder="http://localhost:8080/events"
                  autocapitalize="none"
                  autocorrect="off"
                  spellcheck="false"
                  autocomplete="url"
                  required
                  aria-describedby="protocol-sse-url-help"
                  ${busy ? html`disabled` : null}
                />
                <small id="protocol-sse-url-help">
                  ${t("protocol.sse.urlHelp")}
                </small>
              </label>

              <label class="protocol-field">
                <span>${t("protocol.label.timeout")}</span>
                <div class="protocol-unit-input">
                  <input
                    type="number"
                    name="timeout"
                    data-protocol-control="timeout"
                    min="1"
                    max="600"
                    value="${state.input.timeout}"
                    aria-describedby="protocol-sse-timeout-help"
                    ${busy ? html`disabled` : null}
                  />
                  <span>${t("protocol.unit.seconds")}</span>
                </div>
                <small id="protocol-sse-timeout-help">
                  ${t("protocol.sse.timeoutHelp")}
                </small>
              </label>

              <label class="protocol-field">
                <span>${t("protocol.sse.maxEvents")}</span>
                <input
                  type="number"
                  name="maxEvents"
                  data-protocol-control="maxEvents"
                  min="1"
                  max="10000"
                  value="${state.input.maxEvents}"
                  aria-describedby="protocol-sse-event-limit-help"
                  ${busy ? html`disabled` : null}
                />
                <small id="protocol-sse-event-limit-help">
                  ${t("protocol.sse.eventLimitHelp")}
                </small>
              </label>

              <label class="protocol-field protocol-field-wide">
                <span>${t("protocol.headers")}</span>
                <textarea
                  name="headers"
                  data-protocol-control="headers"
                  placeholder='{
  "Authorization": "Bearer …"
}'
                  spellcheck="false"
                  aria-describedby="protocol-sse-headers-help"
                  ${busy ? html`disabled` : null}
                >${state.input.headers}</textarea>
                <small id="protocol-sse-headers-help">
                  ${t("protocol.headersHint")}
                </small>
              </label>

              <label
                class="protocol-check protocol-field-wide ${secure
                  ? ""
                  : "disabled"}"
                data-protocol-certificate
              >
                <input
                  type="checkbox"
                  name="insecureSkipVerify"
                  data-protocol-control="insecureSkipVerify"
                  ${state.input.insecureSkipVerify ? html`checked` : null}
                  ${busy || !secure ? html`disabled` : null}
                />
                <span>
                  <strong>${t("protocol.skipCertificate")}</strong>
                  <small>${t("protocol.sse.certificateHint")}</small>
                </span>
              </label>
            </div>

            <div class="tool-card-actions protocol-actions">
              <button
                type="submit"
                class="button button-primary button-md"
                data-protocol-focus="listen"
                ${busy ? html`disabled` : null}
              >
                ${icon(state.loading ? "spinner" : "play", 14, state.loading ? "spin" : "")}
                ${state.loading
                  ? t("protocol.sse.listening")
                  : t("protocol.sse.listen")}
              </button>
              ${state.activeOperationID
                ? html`
                    <button
                      type="button"
                      class="button button-danger button-md"
                      data-protocol-action="cancel"
                      data-protocol-focus="cancel"
                      ${state.canceling ? html`disabled` : null}
                    >
                      ${icon("stop", 13)}
                      ${state.canceling
                        ? t("protocol.canceling")
                        : t("protocol.cancel")}
                    </button>
                  `
                : null}
              <span>${t("protocol.sse.limitHint")}</span>
            </div>
          </form>

          <section
            class="tool-panel protocol-result"
            aria-labelledby="protocol-results-title"
            aria-busy="${busy ? "true" : "false"}"
          >
            ${resultHeader()}
            <div data-protocol-slot="result" style="display: contents">
              ${resultContent(state)}
            </div>
          </section>
        </div>
      </section>
    `,
  );
}

export function mountProtocolLab(root: HTMLElement): Disposable {
  const lifecycle = new Lifecycle();
  const activityScope = lifecycle.child(
    createWorkspaceActivityScope("protocols"),
  );
  const state: ProtocolLabState = {
    loading: false,
    activeOperationID: "",
    canceling: false,
    issue: null,
    input: {
      url: "http://localhost:8080/events",
      headers: "{}",
      timeout: "30",
      maxEvents: "25",
      insecureSkipVerify: false,
    },
    result: null,
  };
  let disposed = false;

  const handleControl = (event: Event) => {
    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      return;
    }
    const control = element.dataset.protocolControl;
    if (!control) return;

    if (control === "url") {
      state.input.url = element.value;
      const secure = usesSecureProtocol(element.value, "https:");
      if (!secure) state.input.insecureSkipVerify = false;
      const checkbox = optionalElement<HTMLInputElement>(
        root,
        '[data-protocol-control="insecureSkipVerify"]',
      );
      if (checkbox) {
        checkbox.checked = state.input.insecureSkipVerify;
        checkbox.disabled = state.loading || !secure;
      }
      optionalElement<HTMLElement>(
        root,
        "[data-protocol-certificate]",
      )?.classList.toggle("disabled", !secure);
      return;
    }
    if (control === "headers") state.input.headers = element.value;
    if (control === "timeout") state.input.timeout = element.value;
    if (control === "maxEvents") state.input.maxEvents = element.value;
    if (
      control === "insecureSkipVerify" &&
      element instanceof HTMLInputElement
    ) {
      state.input.insecureSkipVerify = element.checked;
    }
  };

  const runSSE = async () => {
    state.issue = null;
    state.result = null;
    let operationID = "";
    let backendStarted = false;
    let activity: ReturnType<typeof activityScope.begin> | undefined;

    try {
      operationID = createOperationID();
      const input: SSEInput = {
        operationId: operationID,
        url: validateURL(state.input.url, ["http:", "https:"], "SSE", t),
        headers: parseStringMap(
          state.input.headers,
          t("protocol.label.header"),
          t,
        ),
        timeoutMs: timeoutMilliseconds(state.input.timeout, t, getLocale()),
        maxEvents: positiveInteger(
          state.input.maxEvents,
          t("protocol.label.eventLimit"),
          10_000,
          t,
          getLocale(),
        ),
        insecureSkipVerify: state.input.insecureSkipVerify,
      };
      state.loading = true;
      state.activeOperationID = operationID;
      activity = activityScope.begin();
      backendStarted = true;
      renderPage(root, state);
      optionalElement<HTMLButtonElement>(
        root,
        '[data-protocol-focus="cancel"]',
      )?.focus();

      const result = await backend.runSSE(input);
      if (disposed) return;
      if (result.error) {
        if (result.events.length > 0) state.result = result;
        state.issue = issueFrom(result.error, t);
        return;
      }
      state.result = result;
    } catch (error) {
      if (disposed) return;
      state.issue = issueFrom(error, t, backendStarted);
    } finally {
      activity?.dispose();
      if (!disposed) {
        state.loading = false;
        if (state.activeOperationID === operationID) {
          state.activeOperationID = "";
        }
        state.canceling = false;
        renderPage(root, state);
        optionalElement<HTMLButtonElement>(
          root,
          '[data-protocol-focus="listen"]',
        )?.focus();
      }
    }
  };

  const cancelActiveOperation = async () => {
    if (!state.activeOperationID || state.canceling) return;
    state.canceling = true;
    const operationID = state.activeOperationID;
    renderPage(root, state);
    optionalElement<HTMLElement>(
      root,
      '[data-protocol-focus="progress"]',
    )?.focus();

    try {
      const accepted = await backend.cancelToolOperation(operationID);
      if (disposed || state.activeOperationID !== operationID) return;
      if (!accepted) {
        state.issue = {
          title: t("protocol.cancelRejectedTitle"),
          message: t("protocol.cancelRejectedMessage"),
          hint: t("protocol.cancelRejectedHint"),
        };
        state.canceling = false;
        renderPage(root, state);
      }
    } catch (error) {
      if (disposed || state.activeOperationID !== operationID) return;
      state.issue = issueFrom(error, t, true);
      state.canceling = false;
      renderPage(root, state);
    }
  };

  lifecycle.listen(root, "input", handleControl);
  lifecycle.listen(root, "change", handleControl);
  lifecycle.listen(root, "submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-protocol-form]")) {
      return;
    }
    event.preventDefault();
    if (!state.loading) void runSSE();
  });
  delegate(
    lifecycle,
    root,
    "click",
    '[data-protocol-action="cancel"]',
    () => {
      void cancelActiveOperation();
    },
  );

  lifecycle.add(
    subscribeLocale(() => {
      state.issue = null;
      renderPage(root, state);
    }),
  );
  lifecycle.add(() => {
    disposed = true;
    root.replaceChildren();
  });

  renderPage(root, state);
  return lifecycle;
}
