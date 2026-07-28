import { html, type TrustedHTMLFragment } from "../../core/dom.js";
import { icon, type IconName } from "../../core/icons.js";
import { t } from "../../i18n/locale.js";
import type {
  ContractFinding,
  RequestTab,
  ResponseEnvelope,
  UserError,
} from "../../lib/types.js";
import {
  formatBytes,
  formatDuration,
  statusTone,
} from "../../lib/utils.js";

type ResponseSection = RequestTab["responseSection"];

const baseSections: readonly {
  id: ResponseSection;
  key:
    | "requests.response.section.body"
    | "requests.response.section.headers"
    | "requests.response.section.cookies"
    | "requests.response.section.timeline"
    | "requests.response.section.raw";
  icon: IconName;
}[] = [
  {
    id: "body",
    key: "requests.response.section.body",
    icon: "braces",
  },
  {
    id: "headers",
    key: "requests.response.section.headers",
    icon: "code",
  },
  {
    id: "cookies",
    key: "requests.response.section.cookies",
    icon: "collection",
  },
  {
    id: "timeline",
    key: "requests.response.section.timeline",
    icon: "history",
  },
  {
    id: "raw",
    key: "requests.response.section.raw",
    icon: "terminal",
  },
];

function localizedError(error: UserError): UserError {
  const keys: Record<
    string,
    {
      title: Parameters<typeof t>[0];
      message: Parameters<typeof t>[0];
      hint?: Parameters<typeof t>[0];
    }
  > = {
    request_canceled: {
      title: "requests.error.canceled.title",
      message: "requests.error.canceled.message",
      hint: "requests.error.canceled.hint",
    },
    cancel_not_found: {
      title: "requests.error.cancelNotFound.title",
      message: "requests.error.cancelNotFound.message",
      hint: "requests.error.cancelNotFound.hint",
    },
    cancel_failed: {
      title: "requests.error.cancelFailed.title",
      message: "requests.error.cancelFailed.message",
      hint: "requests.error.cancelFailed.hint",
    },
    bridge_error: {
      title: "requests.error.bridge.title",
      message: "requests.error.bridge.message",
      hint: "requests.error.bridge.hint",
    },
    backend_unavailable: {
      title: "requests.error.bridge.title",
      message: "requests.error.bridge.message",
      hint: "requests.error.bridge.hint",
    },
    empty_response: {
      title: "requests.error.emptyResponse.title",
      message: "requests.error.emptyResponse.message",
      hint: "requests.error.emptyResponse.hint",
    },
    invalid_request: {
      title: "requests.error.invalidRequest.title",
      message: "requests.error.invalidRequest.message",
      hint: "requests.error.invalidRequest.hint",
    },
    missing_variables: {
      title: "requests.error.missingVariables.title",
      message: "requests.error.missingVariables.message",
      hint: "requests.error.missingVariables.hint",
    },
    request_already_running: {
      title: "requests.error.alreadyRunning.title",
      message: "requests.error.alreadyRunning.message",
      hint: "requests.error.alreadyRunning.hint",
    },
    request_timeout: {
      title: "requests.error.timeout.title",
      message: "requests.error.timeout.message",
      hint: "requests.error.timeout.hint",
    },
    network_error: {
      title: "requests.error.network.title",
      message: "requests.error.network.message",
      hint: "requests.error.network.hint",
    },
    request_failed: {
      title: "requests.error.failed.title",
      message: "requests.error.failed.message",
      hint: "requests.error.failed.hint",
    },
    response_read_failed: {
      title: "requests.error.responseRead.title",
      message: "requests.error.responseRead.message",
      hint: "requests.error.responseRead.hint",
    },
    response_too_large: {
      title: "requests.error.responseTooLarge.title",
      message: "requests.error.responseTooLarge.message",
      hint: "requests.error.responseTooLarge.hint",
    },
    response_headers_too_large: {
      title: "requests.error.responseHeadersTooLarge.title",
      message: "requests.error.responseHeadersTooLarge.message",
      hint: "requests.error.responseHeadersTooLarge.hint",
    },
  };
  const mapped = keys[error.code];
  if (!mapped) return error;
  return {
    ...error,
    title: t(mapped.title),
    message: t(mapped.message),
    hint: mapped.hint ? t(mapped.hint) : undefined,
  };
}

function emptyState(title: string, description: string): TrustedHTMLFragment {
  return html`
    <div class="empty-state response-empty-state" role="status">
      <div class="empty-state-icon" aria-hidden="true">${icon("info", 20)}</div>
      <div>
        <strong>${title}</strong>
        <p>${description}</p>
      </div>
    </div>
  `;
}

function headerTable(response: ResponseEnvelope): TrustedHTMLFragment {
  const entries = Object.entries(response.headers).flatMap(([key, values]) =>
    values.map((value) => ({ key, value })),
  );
  if (entries.length === 0) {
    return emptyState(
      t("requests.response.noHeaders.title"),
      t("requests.response.noHeaders.description"),
    );
  }
  return html`
    <div
      class="kv-table response-kv-table"
      role="table"
      aria-label="${t("requests.response.section.headers")}"
    >
      <div class="kv-header" role="row">
        <span role="columnheader">${t("requests.response.header")}</span>
        <span role="columnheader">${t("requests.response.value")}</span>
      </div>
      ${entries.map(
        ({ key, value }) => html`
          <div class="kv-row" role="row">
            <code role="cell">${key}</code>
            <span role="cell">${value}</span>
          </div>
        `,
      )}
    </div>
  `;
}

function cookieTable(response: ResponseEnvelope): TrustedHTMLFragment {
  if (response.cookies.length === 0) {
    return emptyState(
      t("requests.response.noCookies.title"),
      t("requests.response.noCookies.description"),
    );
  }
  return html`
    <div
      class="kv-table response-kv-table cookie-table"
      role="table"
      aria-label="${t("requests.response.section.cookies")}"
    >
      <div class="kv-header" role="row">
        <span role="columnheader">${t("requests.response.cookie")}</span>
        <span role="columnheader">
          ${t("requests.response.valueAndAttributes")}
        </span>
      </div>
      ${response.cookies.map((cookie) => {
        const attributes = [
          cookie.domain &&
            t("requests.response.cookie.domain", { value: cookie.domain }),
          cookie.path &&
            t("requests.response.cookie.path", { value: cookie.path }),
          cookie.httpOnly && "HttpOnly",
          cookie.secure && "Secure",
          cookie.expires &&
            t("requests.response.cookie.expires", { value: cookie.expires }),
        ].filter((value): value is string => Boolean(value));
        return html`
          <div class="kv-row" role="row">
            <code role="cell">${cookie.name}</code>
            <span class="cookie-value" role="cell">
              <span>${cookie.value}</span>
              ${attributes.length > 0
                ? html`<small>${attributes.join(" · ")}</small>`
                : ""}
            </span>
          </div>
        `;
      })}
    </div>
  `;
}

function timeline(response: ResponseEnvelope): TrustedHTMLFragment {
  if (response.timeline.length === 0) {
    return emptyState(
      t("requests.response.section.timeline"),
      t("requests.response.timeline.empty"),
    );
  }
  const total = Math.max(response.durationMs, 1);
  const labelKeys: Record<string, Parameters<typeof t>[0]> = {
    preparation: "requests.response.timeline.preparation",
    dns: "requests.response.timeline.dns",
    tcp: "requests.response.timeline.tcp",
    tls: "requests.response.timeline.tls",
    request: "requests.response.timeline.request",
    server: "requests.response.timeline.server",
    download: "requests.response.timeline.download",
  };
  return html`
    <div
      class="timeline"
      aria-label="${t("requests.response.section.timeline")}"
    >
      <div class="timeline-ruler">
        <span>0 ms</span>
        <span>${formatDuration(total / 2)}</span>
        <span>${formatDuration(total)}</span>
      </div>
      ${response.timeline.map((phase) => {
        const labelKey = labelKeys[phase.id];
        const label = labelKey ? t(labelKey) : phase.label;
        const description =
          phase.id === "request" && phase.description
            ? t("requests.response.timeline.reused")
            : phase.id === "server" && phase.description
              ? t("requests.response.timeline.slow", {
                  percent: Math.round(phase.percent),
                })
              : phase.description;
        const width = Math.min(
          100,
          Math.max(phase.durationMs ? 2 : 0, (phase.durationMs / total) * 100),
        );
        return html`
          <div class="timeline-row">
            <div class="timeline-label">
              <span>${label}</span>
              <strong>${formatDuration(phase.durationMs)}</strong>
            </div>
            <div class="timeline-track" aria-hidden="true">
              <span
                class="timeline-bar${phase.id === "server"
                  ? " timeline-bar-slow"
                  : ""}"
                style="width:${width}%"
              ></span>
            </div>
            ${description
              ? html`<p class="timeline-description">${description}</p>`
              : ""}
          </div>
        `;
      })}
    </div>
  `;
}

function findingLabel(finding: ContractFinding): string {
  const keys = {
    missing: "requests.response.finding.missing",
    extra: "requests.response.finding.extra",
    enum_violation: "requests.response.finding.enum",
    type_mismatch: "requests.response.finding.type",
  } as const;
  return t(keys[finding.type]);
}

function localizedContractError(
  response: ResponseEnvelope,
  contract: NonNullable<ResponseEnvelope["contract"]>,
): UserError | undefined {
  const error = contract.error;
  if (!error) return;
  switch (error.code) {
    case "spec_unavailable":
      return {
        ...error,
        title: t("requests.response.contract.specUnavailable.title"),
        message: t("requests.response.contract.specUnavailable.message"),
        hint: t("requests.response.contract.specUnavailable.hint"),
      };
    case "response_schema_unavailable":
      return {
        ...error,
        title: t("requests.response.contract.schemaUnavailable.title"),
        message: t("requests.response.contract.schemaUnavailable.message", {
          status: response.statusCode,
          contentType:
            response.contentType ||
            t("requests.response.unknownContentType"),
        }),
        hint: t("requests.response.contract.schemaUnavailable.hint"),
      };
    case "operation_unavailable":
      return {
        ...error,
        title: t("requests.response.contract.operationUnavailable.title"),
        message: t("requests.response.contract.operationUnavailable.message", {
          method: contract.method,
          path: contract.path,
        }),
      };
    case "operation_changed":
      return {
        ...error,
        title: t("requests.error.operationChanged.title"),
        message: t("requests.error.operationChanged.message", {
          path: contract.path,
        }),
        hint: t("requests.error.operationChanged.hint"),
      };
    case "contract_check_failed":
      return {
        ...error,
        title: t("requests.error.contractCheck.title"),
        message: t("requests.error.contractCheck.message"),
      };
    default:
      return error;
  }
}

function contractResult(response: ResponseEnvelope): TrustedHTMLFragment {
  const contract = response.contract;
  if (!contract) {
    return emptyState(
      t("requests.response.contract.pending.title"),
      t("requests.response.contract.pending.description"),
    );
  }
  if (contract.error) {
    const error = localizedContractError(response, contract) ?? contract.error;
    return html`
      <div class="contract-state contract-unavailable" role="status">
        ${icon("warning", 20)}
        <div>
          <strong>${error.title}</strong>
          <p>${error.message}</p>
          ${error.hint
            ? html`<span>${error.hint}</span>`
            : ""}
          ${error.technical
            ? html`
                <details>
                  <summary>${t("requests.response.technicalDetails")}</summary>
                  <code>${error.technical}</code>
                </details>
              `
            : ""}
        </div>
      </div>
    `;
  }
  if (contract.ok) {
    return html`
      <div class="contract-state contract-ok" role="status">
        ${icon("check", 20)}
        <div>
          <strong>${t("requests.response.contract.ok.title")}</strong>
          <p>
            ${t("requests.response.contract.ok.description", {
              method: contract.method,
              path: contract.path,
            })}
          </p>
        </div>
      </div>
    `;
  }
  return html`
    <div class="contract-findings">
      <div class="contract-state contract-drift" role="alert">
        ${icon("warning", 20)}
        <div>
          <strong>
            ${t(
              contract.findings.length === 1
                ? "requests.response.contract.drift.one"
                : "requests.response.contract.drift.many",
              { count: contract.findings.length },
            )}
          </strong>
          <p>${t("requests.response.contract.driftDescription")}</p>
        </div>
      </div>
      ${contract.truncated
        ? html`
            <div class="contract-truncated-notice" role="status">
              ${icon("info", 16)}
              <span>
                ${t("requests.response.contract.truncatedDescription")}
              </span>
            </div>
          `
        : ""}
      <div
        class="contract-table"
        role="table"
        aria-label="${t("requests.response.section.contract")}"
      >
        <div class="contract-row contract-header" role="row">
          <span role="columnheader">
            ${t("requests.response.contract.jsonPath")}
          </span>
          <span role="columnheader">
            ${t("requests.response.contract.difference")}
          </span>
          <span role="columnheader">
            ${t("requests.response.contract.expected")}
          </span>
          <span role="columnheader">
            ${t("requests.response.contract.actual")}
          </span>
        </div>
        ${contract.findings.map(
          (finding) => html`
            <div class="contract-row" role="row">
              <code role="cell">${finding.path || "$"}</code>
              <span role="cell">${findingLabel(finding)}</span>
              <span role="cell">
                ${finding.expected || finding.allowed?.join(", ") || "—"}
              </span>
              <span role="cell">${finding.actual || "—"}</span>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function responseContent(
  tab: RequestTab,
  active: ResponseSection,
): TrustedHTMLFragment {
  if (tab.running) {
    return html`
      <div class="response-loading" role="status" aria-live="polite">
        ${icon("spinner", 22, "spin")}
        <strong>${t("requests.response.loading.title")}</strong>
        <span>${t("requests.response.loading.description")}</span>
      </div>
    `;
  }
  if (tab.userError) {
    const userError = localizedError(tab.userError);
    const canceled = userError.code === "request_canceled";
    return html`
      <div
        class="user-error-card${canceled ? " request-canceled" : ""}"
        role="${canceled ? "status" : "alert"}"
      >
        <div class="user-error-icon">${icon("warning", 20)}</div>
        <div>
          <h3>${userError.title}</h3>
          <p>${userError.message}</p>
          ${userError.hint ? html`<strong>${userError.hint}</strong>` : ""}
          ${userError.technical
            ? html`
                <details>
                  <summary>
                    ${t("requests.response.technicalDetails")}
                  </summary>
                  <code>${userError.technical}</code>
                </details>
              `
            : ""}
          <div class="user-error-actions">
            <button
              type="button"
              class="button secondary sm"
              data-action="retry-request"
            >
              ${icon("request", 13)} ${t("requests.response.tryAgain")}
            </button>
          </div>
        </div>
      </div>
    `;
  }
  const response = tab.response;
  if (!response) {
    return emptyState(
      t("requests.response.empty.title"),
      t("requests.response.empty.description"),
    );
  }
  switch (active) {
    case "headers":
      return headerTable(response);
    case "cookies":
      return cookieTable(response);
    case "timeline":
      return timeline(response);
    case "contract":
      return contractResult(response);
    case "raw":
      return response.rawBody
        ? html`
            <div class="response-body-editor">
              <div class="response-body-actions">
                <button
                  type="button"
                  class="button ghost sm"
                  data-action="copy-raw-response"
                  title="${t("requests.response.copyRaw")}"
                >
                  ${icon("copy", 13)} ${t("requests.response.copyRaw")}
                </button>
              </div>
              <pre class="raw-response" tabindex="0">${response.rawBody}</pre>
            </div>
          `
        : emptyState(
            t("requests.response.rawEmpty.title"),
            t("requests.response.rawEmpty.description"),
          );
    case "body":
    default:
      return response.body
        ? html`
            <div class="response-body-editor">
              <div class="response-body-actions">
                <button
                  type="button"
                  class="button ghost sm"
                  data-action="copy-response"
                  title="${t("requests.response.copyBody")}"
                >
                  ${icon("copy", 13)} ${t("requests.response.copyBody")}
                </button>
              </div>
              <pre class="raw-response response-body" tabindex="0">${response.body}</pre>
            </div>
          `
        : emptyState(
            t("requests.response.rawEmpty.title"),
            t("requests.response.rawEmpty.description"),
          );
  }
}

export function responsePanelMarkup(tab: RequestTab): TrustedHTMLFragment {
  const response = tab.response;
  if (!response) {
    return html`
      <section
        class="response-panel response-panel-empty"
        aria-label="${t("requests.response.label")}"
        aria-busy="${tab.running ? "true" : "false"}"
      >
        <div
          class="response-content response-content-empty"
          aria-live="polite"
          aria-busy="${tab.running ? "true" : "false"}"
        >
          ${responseContent(tab, "body")}
        </div>
      </section>
    `;
  }

  const sections = tab.openApi || response.contract
    ? [
        ...baseSections,
        {
          id: "contract" as const,
          key: "requests.response.section.contract" as const,
          icon: "check" as const,
        },
      ]
    : [...baseSections];
  const active = sections.some((section) => section.id === tab.responseSection)
    ? tab.responseSection
    : "body";
  const headerCount = Object.values(response.headers).reduce(
    (count, values) => count + values.length,
    0,
  );
  const responseTitle = response.status.replace(/^\d+\s*/, "") || "";
  const tone = statusTone(response.statusCode);

  return html`
    <section
      class="response-panel"
      aria-label="${t("requests.response.label")}"
      aria-busy="${tab.running ? "true" : "false"}"
    >
      <div class="response-summary" role="status" aria-live="polite">
        <div class="response-summary-primary">
          <span
            class="status-mark ${tone}"
            aria-label="${t("requests.response.status", {
              value: response.status,
            })}"
          >
            ${response.statusCode} ${responseTitle}
          </span>
          <span
            class="response-duration"
            aria-label="${t("requests.response.duration", {
              value: formatDuration(response.durationMs),
            })}"
          >
            ${formatDuration(response.durationMs)}
          </span>
          <span
            class="response-size"
            aria-label="${t("requests.response.size", {
              value: formatBytes(response.sizeBytes),
            })}"
          >
            ${formatBytes(response.sizeBytes)}
          </span>
          <span
            class="response-content-type"
            aria-label="${t("requests.response.contentType", {
              value:
                response.contentType ||
                t("requests.response.unknownContentType"),
            })}"
          >
            ${response.contentType ||
            t("requests.response.unknownContentType")}
          </span>
          <span
            class="response-protocol"
            aria-label="${t("requests.response.protocol", {
              value: response.protocol,
            })}"
          >
            ${response.protocol}
          </span>
        </div>
        <div class="response-summary-secondary">
          ${response.remoteAddr
            ? html`
                <span
                  aria-label="${t("requests.response.remoteAddress", {
                    value: response.remoteAddr,
                  })}"
                  title="${t("requests.response.remoteAddress", {
                    value: response.remoteAddr,
                  })}"
                >
                  ${response.remoteAddr}
                </span>
              `
            : ""}
          ${response.tls
            ? html`
                <span
                  aria-label="${t("requests.response.tlsVersion", {
                    value: response.tls,
                  })}"
                  title="${t("requests.response.tlsVersion", {
                    value: response.tls,
                  })}"
                >
                  ${response.tls}
                </span>
              `
            : ""}
          ${response.traceId
            ? html`
                <button
                  type="button"
                  data-action="copy-trace"
                  data-trace="${response.traceId}"
                  aria-label="${t("requests.response.traceCopy")}"
                  title="${t("requests.response.traceCopy")}"
                >
                  ${t("requests.response.traceShort", {
                    value: response.traceId.slice(0, 10),
                  })}
                </button>
              `
            : ""}
        </div>
      </div>
      <div
        class="response-tabs"
        role="tablist"
        aria-orientation="horizontal"
        aria-label="${t("requests.response.views")}"
      >
        ${sections.map((section) => {
          const count =
            section.id === "headers"
              ? headerCount
              : section.id === "cookies"
                ? (response?.cookies.length ?? 0)
                : 0;
          return html`
            <button
              type="button"
              role="tab"
              id="response-tab-${tab.id}-${section.id}"
              data-response-section="${section.id}"
              data-state="${section.id === active ? "active" : "inactive"}"
              aria-selected="${section.id === active
                ? "true"
                : "false"}"
              aria-controls="response-section-panel-${tab.id}"
              tabindex="${section.id === active ? "0" : "-1"}"
              title="${t(section.key)}"
            >
              ${icon(section.icon, 13)}
              ${t(section.key)}
              ${count > 0 ? html`<span class="count-badge">${count}</span>` : ""}
            </button>
          `;
        })}
      </div>
      <div
        class="response-content"
        id="response-section-panel-${tab.id}"
        role="tabpanel"
        aria-labelledby="response-tab-${tab.id}-${active}"
        tabindex="0"
        aria-busy="${tab.running ? "true" : "false"}"
      >
        ${responseContent(tab, active)}
      </div>
    </section>
  `;
}
