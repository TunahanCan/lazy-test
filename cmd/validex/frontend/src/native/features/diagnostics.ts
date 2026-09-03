import {
  delegate,
  eventElement,
  html,
  Lifecycle,
  optionalElement,
  setHTML,
  type Disposable,
  type TrustedHTMLFragment,
} from "../../core/dom.js";
import { icon, type IconName } from "../../core/icons.js";
import {
  presentDialog,
  type DialogHandle,
} from "../../core/overlays.js";
import {
  getLocale,
  subscribeLocale,
  t,
  type Translate,
} from "../../i18n/locale.js";
import { backend } from "../../lib/backend.js";
import {
  analyzeJWT,
  analyzeSpringError,
  type JWTAnalysis,
  type SpringErrorAnalysis,
} from "../../lib/developerTools.js";
import type {
  ActuatorInspectResult,
  ActuatorMetricSnapshot,
  CoverageInput,
  CoverageResult,
  EnvironmentCompareResult,
  LogSearchResult,
  NetworkInspectResult,
  ThreadDumpResult,
} from "../../lib/types.js";
import { workspaceStore } from "../../stores/workspace.js";
import {
  appendURLPerformanceReport,
  bridgeIssue,
  componentStatus,
  defaultMetricNames,
  diagnosticsModes,
  environmentMethods,
  errorText,
  formatEnvironmentDuration,
  formatEpoch,
  formatUnknown,
  formatURLPerformanceDuration,
  isSafeEnvironmentMethod,
  jwtErrorText,
  localizeSpringFallbacks,
  parseHeaders,
  parseKnownEndpoints,
  parseList,
  parseObservedCalls,
  responseHeadersText,
  resultIssue,
  springAdvice,
  urlPerformanceLimits,
  urlPerformanceStatistics,
  validateURLPerformanceOptions,
  validateURLPerformanceTarget,
  type DiagnosticsMode,
  type DiagnosticsNotice,
  type DiagnosticsWorkspaceMode,
  type PendingOperation,
  type URLPerformanceSummary,
} from "../../features/diagnostics/model.js";
import {
  emptyToolResult,
  toolPageHeader,
} from "../tool.js";
import { setWorkspaceBusy } from "../chrome/workspaceActivity.js";

type ThreadLogMode = "thread" | "logs";

interface EnvironmentTarget {
  name: string;
  baseUrl: string;
}

interface DiagnosticsState {
  mode: DiagnosticsWorkspaceMode;
  busy: string;
  notice: DiagnosticsNotice | null;
  springBody: string;
  springStatus: number;
  springHeaders: string;
  springAnalysis: SpringErrorAnalysis | null;
  jwtInput: string;
  jwtAnalysis: JWTAnalysis | null;
  actuatorURL: string;
  actuatorHeaders: string;
  actuatorTimeout: number;
  metricNames: string;
  includeMappings: boolean;
  runtimeResult: ActuatorInspectResult | null;
  runtimeBaseline: ActuatorMetricSnapshot | undefined;
  performanceURL: string;
  performanceTimeout: number;
  performanceSampleCount: number;
  performanceResult: URLPerformanceSummary | null;
  performanceCompletedSamples: number;
  performanceCanceling: boolean;
  environmentMethod: string;
  environmentPath: string;
  environmentBody: string;
  environmentHeaders: string;
  environmentTimeout: number;
  environmentTargets: EnvironmentTarget[];
  environmentIgnorePaths: string;
  allowUnsafe: boolean;
  environmentResult: EnvironmentCompareResult | null;
  threadLogMode: ThreadLogMode;
  threadDump: string;
  threadResult: ThreadDumpResult | null;
  logText: string;
  traceQuery: string;
  caseSensitive: boolean;
  logResult: LogSearchResult | null;
  knownEndpoints: string;
  observedCalls: string;
  coverageResult: CoverageResult | null;
}

interface ModeDefinition {
  id: DiagnosticsMode;
  label: string;
  description: string;
  icon: IconName;
}

const modeIcons: Record<DiagnosticsWorkspaceMode, IconName> = {
  spring: "warning",
  jwt: "eye",
  runtime: "activity",
  performance: "automation",
  environments: "refresh",
  "thread-logs": "terminal",
  coverage: "check",
};

function diagnosticsModeLabel(
  mode: DiagnosticsWorkspaceMode,
  translate: Translate = t,
): string {
  const keys = {
    spring: "diagnostics.mode.spring",
    jwt: "diagnostics.mode.jwt",
    runtime: "diagnostics.mode.runtime",
    performance: "diagnostics.mode.performance",
    environments: "diagnostics.mode.environments",
    "thread-logs": "diagnostics.mode.threadLogs",
    coverage: "diagnostics.mode.coverage",
  } as const;
  return translate(keys[mode]);
}

function diagnosticsModeDescription(
  mode: DiagnosticsWorkspaceMode,
  translate: Translate = t,
): string {
  const keys = {
    spring: "diagnostics.mode.springDescription",
    jwt: "diagnostics.mode.jwtDescription",
    runtime: "diagnostics.mode.runtimeDescription",
    performance: "diagnostics.mode.performanceDescription",
    environments: "diagnostics.mode.environmentsDescription",
    "thread-logs": "diagnostics.mode.threadLogsDescription",
    coverage: "diagnostics.mode.coverageDescription",
  } as const;
  return translate(keys[mode]);
}

function modeDefinitions(): readonly ModeDefinition[] {
  return diagnosticsModes.map((id) => ({
    id,
    label: diagnosticsModeLabel(id),
    description: diagnosticsModeDescription(id),
    icon: modeIcons[id],
  }));
}

function springCategoryLabel(
  category: SpringErrorAnalysis["category"],
  translate: Translate = t,
): string {
  const keys = {
    "problem-detail": "diagnostics.spring.category.problemDetail",
    validation: "diagnostics.spring.category.validation",
    unauthorized: "diagnostics.spring.category.unauthorized",
    forbidden: "diagnostics.spring.category.forbidden",
    "not-found": "diagnostics.spring.category.notFound",
    conflict: "diagnostics.spring.category.conflict",
    "server-error": "diagnostics.spring.category.serverError",
    "http-error": "diagnostics.spring.category.httpError",
  } as const;
  return translate(keys[category]);
}

function environmentChangeLabel(kind: string | undefined): string {
  const keys = {
    added: "diagnostics.environment.change.added",
    removed: "diagnostics.environment.change.removed",
    changed: "diagnostics.environment.change.changed",
    type: "diagnostics.environment.change.type",
  } as const;
  return kind && kind in keys
    ? t(keys[kind as keyof typeof keys])
    : kind ?? t("diagnostics.environment.change.changed");
}

function button(
  label: string,
  action: string,
  options: {
    variant?: "primary" | "secondary" | "ghost";
    icon?: IconName;
    busy?: boolean;
    disabled?: boolean;
    title?: string;
  } = {},
): TrustedHTMLFragment {
  const iconName = options.busy ? "spinner" : options.icon;
  return html`
    <button
      type="button"
      class="button button-${options.variant ?? "secondary"} button-md"
      data-diagnostics-action="${action}"
      aria-busy="${options.busy ? "true" : "false"}"
      ${options.disabled ? "disabled" : ""}
      ${options.title ? html`title="${options.title}"` : ""}
    >
      ${iconName ? icon(iconName, 14, options.busy ? "spin" : "") : ""}
      ${label}
    </button>
  `;
}

function cardHeader(
  title: string,
  description: string,
  actions: TrustedHTMLFragment = html``,
): TrustedHTMLFragment {
  return html`
    <div class="tool-card-header">
      <div>
        <h2>${title}</h2>
        <span>${description}</span>
      </div>
      ${actions}
    </div>
  `;
}

function diagnosticsNotice(
  notice: DiagnosticsNotice | null,
): TrustedHTMLFragment {
  if (!notice) return html``;
  const iconName =
    notice.tone === "error"
      ? "warning"
      : notice.tone === "success"
        ? "check"
        : "activity";
  return html`
    <div
      class="tool-notice tool-notice-row ${notice.tone}"
      role="${notice.tone === "error" ? "alert" : "status"}"
      aria-live="${notice.tone === "error" ? "assertive" : "polite"}"
    >
      ${icon(iconName, 14)}
      <div class="tool-notice-content">
        ${notice.title ? html`<strong>${notice.title}</strong>` : ""}
        <span>${notice.text}</span>
        ${notice.hint ? html`<small>${notice.hint}</small>` : ""}
        ${notice.technical
          ? html`
              <details>
                <summary>${t("common.technicalDetails")}</summary>
                <code>${notice.technical}</code>
              </details>
            `
          : ""}
      </div>
    </div>
  `;
}

function emptyPanel(
  iconName: IconName,
  title: string,
  description: string,
): TrustedHTMLFragment {
  return html`
    <article class="tool-panel">
      ${emptyToolResult(iconName, title, description)}
    </article>
  `;
}

function mainTabs(state: DiagnosticsState): TrustedHTMLFragment {
  return html`
    <div
      class="tool-tabs diagnostics-main-tabs"
      role="tablist"
      aria-label="${t("diagnostics.toolsLabel")}"
    >
      ${modeDefinitions().map(
        (mode) => html`
          <button
            type="button"
            id="diagnostics-tab-${mode.id}"
            class="${state.mode === mode.id ? "active" : ""}"
            role="tab"
            data-diagnostics-mode="${mode.id}"
            aria-selected="${state.mode === mode.id
              ? "true"
              : "false"}"
            aria-controls="diagnostics-panel-${mode.id}"
            tabindex="${state.mode === mode.id ? 0 : -1}"
          >
            ${icon(mode.icon, 15)}
            <span>${mode.label}</span>
          </button>
        `,
      )}
    </div>
    ${modeDefinitions()
      .filter((mode) => mode.id !== state.mode)
      .map(
        (mode) => html`
          <div
            id="diagnostics-panel-${mode.id}"
            role="tabpanel"
            aria-labelledby="diagnostics-tab-${mode.id}"
            hidden
          ></div>
        `,
      )}
  `;
}

function modeGuidance(state: DiagnosticsState): TrustedHTMLFragment {
  const mode = modeDefinitions().find((item) => item.id === state.mode);
  if (!mode) return html``;
  return html`
    <p class="tool-mode-guidance">${mode.description}</p>
  `;
}

function springResult(analysis: SpringErrorAnalysis): TrustedHTMLFragment {
  const advice = springAdvice(analysis, t);
  return html`
    <div class="diagnostics-result-stack">
      <article class="tool-panel diagnostics-panel-padded">
        <div class="diagnostics-summary-row">
          <span
            class="diagnostics-status ${analysis.status >= 500 ? "danger" : ""}"
          >
            HTTP ${analysis.status || "—"}
          </span>
          <div>
            <strong>${analysis.title}</strong>
            <p>${analysis.detail}</p>
          </div>
        </div>
        <dl class="diagnostics-facts">
          <div>
            <dt>${t("diagnostics.spring.category")}</dt>
            <dd>${springCategoryLabel(analysis.category)}</dd>
          </div>
          <div>
            <dt>${t("diagnostics.spring.format")}</dt>
            <dd>
              ${analysis.recognized
                ? t("diagnostics.spring.recognized")
                : t("diagnostics.spring.genericResponse")}
            </dd>
          </div>
          <div>
            <dt>${t("diagnostics.spring.traceRequestID")}</dt>
            <dd>${analysis.traceId ?? t("diagnostics.spring.notFound")}</dd>
          </div>
          <div>
            <dt>${t("diagnostics.spring.exception")}</dt>
            <dd>
              ${analysis.exception ??
              t("diagnostics.spring.exceptionMissing")}
            </dd>
          </div>
          <div>
            <dt>${t("diagnostics.spring.instance")}</dt>
            <dd>${analysis.instance ?? "—"}</dd>
          </div>
        </dl>
      </article>

      ${analysis.fieldErrors.length > 0
        ? html`
            <article class="tool-panel">
              ${cardHeader(
                t("diagnostics.spring.beanValidation"),
                t("diagnostics.spring.fieldCount", {
                  count: analysis.fieldErrors.length,
                }),
              )}
              <div class="diagnostics-table-wrap">
                <table class="diagnostics-table">
                  <thead>
                    <tr>
                      <th scope="col">${t("diagnostics.spring.field")}</th>
                      <th scope="col">${t("diagnostics.spring.message")}</th>
                      <th scope="col">
                        ${t("diagnostics.spring.rejectedValue")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    ${analysis.fieldErrors.map(
                      (item) => html`
                        <tr>
                          <td><code>${item.field}</code></td>
                          <td>${item.message}</td>
                          <td>
                            <code>${formatUnknown(item.rejectedValue)}</code>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          `
        : ""}

      <article class="tool-panel diagnostics-panel-padded">
        <strong>${t("diagnostics.spring.checklist")}</strong>
        <ul class="diagnostics-advice">
          ${advice.map((suggestion) => html`<li>${suggestion}</li>`)}
        </ul>
      </article>
    </div>
  `;
}

function jwtResult(analysis: JWTAnalysis): TrustedHTMLFragment {
  return html`
    <div class="diagnostics-result-stack">
      ${diagnosticsNotice({
        tone: "info",
        text: t("diagnostics.jwt.localWarning"),
      })}
      <article class="tool-panel diagnostics-panel-padded">
        <div class="diagnostics-summary-row">
          ${icon(analysis.active ? "check" : "warning", 22)}
          <div>
            <strong>
              ${analysis.active
                ? t("diagnostics.jwt.active")
                : t("diagnostics.jwt.inactive")}
            </strong>
            <p>
              ${analysis.expired
                ? t("diagnostics.jwt.expired")
                : analysis.signaturePresent
                  ? t("diagnostics.jwt.signaturePresent")
                  : t("diagnostics.jwt.signatureMissing")}
            </p>
          </div>
        </div>
        <dl class="diagnostics-facts">
          <div>
            <dt>${t("diagnostics.jwt.algorithm")}</dt>
            <dd>${analysis.algorithm ?? "—"}</dd>
          </div>
          <div>
            <dt>${t("diagnostics.jwt.subject")}</dt>
            <dd>${analysis.subject ?? "—"}</dd>
          </div>
          <div>
            <dt>${t("diagnostics.jwt.issuer")}</dt>
            <dd>${analysis.issuer ?? "—"}</dd>
          </div>
          <div>
            <dt>${t("diagnostics.jwt.audience")}</dt>
            <dd>${analysis.audience.join(", ") || "—"}</dd>
          </div>
          <div>
            <dt>${t("diagnostics.jwt.issuedAt")}</dt>
            <dd>${formatEpoch(analysis.issuedAt, getLocale())}</dd>
          </div>
          <div>
            <dt>${t("diagnostics.jwt.expires")}</dt>
            <dd>${formatEpoch(analysis.expiresAt, getLocale())}</dd>
          </div>
          <div>
            <dt>${t("diagnostics.jwt.notBefore")}</dt>
            <dd>${formatEpoch(analysis.notBefore, getLocale())}</dd>
          </div>
        </dl>
      </article>
      <div class="diagnostics-two-column">
        <article class="tool-panel diagnostics-panel-padded">
          <strong>${t("diagnostics.jwt.roles")}</strong>
          <div class="diagnostics-chip-list">
            ${analysis.roles.length > 0
              ? analysis.roles.map((role) => html`<code>${role}</code>`)
              : html`<span>${t("diagnostics.jwt.noRoles")}</span>`}
          </div>
        </article>
        <article class="tool-panel diagnostics-panel-padded">
          <strong>${t("diagnostics.jwt.scopes")}</strong>
          <div class="diagnostics-chip-list">
            ${analysis.scopes.length > 0
              ? analysis.scopes.map((scope) => html`<code>${scope}</code>`)
              : html`<span>${t("diagnostics.jwt.noScopes")}</span>`}
          </div>
        </article>
      </div>
      <details class="tool-panel diagnostics-details">
        <summary>${t("diagnostics.jwt.details")}</summary>
        <pre>${JSON.stringify(
          { header: analysis.header, payload: analysis.payload },
          null,
          2,
        )}</pre>
      </details>
    </div>
  `;
}

function runtimeResult(
  result: ActuatorInspectResult,
  baseline?: ActuatorMetricSnapshot,
): TrustedHTMLFragment {
  const snapshot = result.metrics;
  const metrics = Object.entries(snapshot.metrics);
  const deltas = result.deltas;
  const components = Object.entries(result.health?.components ?? {});
  const mappingContexts = Object.keys(
    result.mappings?.contexts ??
      (result.mappings?.data.contexts as Record<string, unknown> | undefined) ??
      {},
  );
  const locale = getLocale();
  return html`
    <div class="diagnostics-result-stack">
      <div class="diagnostics-runtime-cards">
        <article class="tool-panel diagnostics-panel-padded">
          <span class="tool-eyebrow">
            ${t("diagnostics.runtime.healthEyebrow")}
          </span>
          <strong class="diagnostics-big-value">
            ${result.health?.status ?? t("diagnostics.runtime.unknown")}
          </strong>
          <span>
            ${t("diagnostics.runtime.components", {
              count: components.length,
            })}
          </span>
        </article>
        <article class="tool-panel diagnostics-panel-padded">
          <span class="tool-eyebrow">
            ${t("diagnostics.runtime.metricsEyebrow")}
          </span>
          <strong class="diagnostics-big-value">${metrics.length}</strong>
          <span>
            ${snapshot.capturedAt
              ? new Date(snapshot.capturedAt).toLocaleTimeString(locale)
              : t("diagnostics.runtime.noSnapshotTime")}
          </span>
        </article>
        <article class="tool-panel diagnostics-panel-padded">
          <span class="tool-eyebrow">
            ${t("diagnostics.runtime.baselineEyebrow")}
          </span>
          <strong class="diagnostics-big-value">
            ${baseline
              ? t("diagnostics.runtime.deltaCount", {
                  count: deltas.length,
                })
              : t("diagnostics.runtime.none")}
          </strong>
          <span>
            ${baseline
              ? t("diagnostics.runtime.comparison")
              : t("diagnostics.runtime.baselineHint")}
          </span>
        </article>
        <article class="tool-panel diagnostics-panel-padded">
          <span class="tool-eyebrow">
            ${t("diagnostics.runtime.mappingsEyebrow")}
          </span>
          <strong class="diagnostics-big-value">
            ${result.mappings
              ? mappingContexts.length
              : t("diagnostics.runtime.disabled")}
          </strong>
          <span>
            ${result.mappings
              ? t("diagnostics.runtime.applicationContext")
              : t("diagnostics.runtime.notRequested")}
          </span>
        </article>
      </div>

      ${components.length > 0
        ? html`
            <article class="tool-panel">
              ${cardHeader(
                t("diagnostics.runtime.healthComponents"),
                t("diagnostics.runtime.healthDescription"),
              )}
              <div class="diagnostics-table-wrap">
                <table class="diagnostics-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        ${t("diagnostics.runtime.component")}
                      </th>
                      <th scope="col">
                        ${t("diagnostics.runtime.status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    ${components.map(
                      ([name, value]) => html`
                        <tr>
                          <td><code>${name}</code></td>
                          <td>${componentStatus(value, t)}</td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          `
        : ""}

      ${metrics.length > 0
        ? html`
            <article class="tool-panel">
              ${cardHeader(
                t("diagnostics.runtime.metricSnapshot"),
                t("diagnostics.runtime.metricDescription"),
              )}
              <div class="diagnostics-table-wrap">
                <table class="diagnostics-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        ${t("diagnostics.runtime.metric")}
                      </th>
                      <th scope="col">
                        ${t("diagnostics.runtime.statistic")}
                      </th>
                      <th scope="col">
                        ${t("diagnostics.runtime.value")}
                      </th>
                      <th scope="col">
                        ${t("diagnostics.runtime.unit")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    ${metrics.flatMap(([name, sample]) => {
                      const measurements = Object.entries(
                        sample.measurements ?? {},
                      );
                      const rows =
                        measurements.length > 0
                          ? measurements
                          : ([["—", Number.NaN]] as Array<[string, number]>);
                      return rows.map(
                        ([statistic, value]) => html`
                          <tr>
                            <td title="${sample.description ?? ""}">
                              <code>${name}</code>
                            </td>
                            <td>${statistic}</td>
                            <td>
                              ${Number.isFinite(value)
                                ? value.toLocaleString(locale, {
                                    maximumFractionDigits: 3,
                                  })
                                : t("diagnostics.runtime.noMeasurement")}
                            </td>
                            <td>${sample.baseUnit ?? "—"}</td>
                          </tr>
                        `,
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          `
        : ""}

      ${deltas.length > 0
        ? html`
            <article class="tool-panel">
              ${cardHeader(
                t("diagnostics.runtime.baselineDifference"),
                t("diagnostics.runtime.baselineDifferenceDescription"),
              )}
              <div class="diagnostics-table-wrap">
                <table class="diagnostics-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        ${t("diagnostics.runtime.metric")}
                      </th>
                      <th scope="col">
                        ${t("diagnostics.runtime.before")}
                      </th>
                      <th scope="col">
                        ${t("diagnostics.runtime.after")}
                      </th>
                      <th scope="col">
                        ${t("diagnostics.runtime.delta")}
                      </th>
                      <th scope="col">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${deltas.map(
                      (delta) => html`
                        <tr>
                          <td>
                            <code>
                              ${delta.metric} · ${delta.statistic}
                            </code>
                          </td>
                          <td>
                            ${delta.before?.toLocaleString(locale) ?? "—"}
                          </td>
                          <td>
                            ${delta.after?.toLocaleString(locale) ?? "—"}
                          </td>
                          <td>
                            ${delta.delta?.toLocaleString(locale) ?? "—"}
                          </td>
                          <td>
                            ${delta.percentChange === undefined
                              ? "—"
                              : `${delta.percentChange.toLocaleString(locale, {
                                  maximumFractionDigits: 1,
                                })}%`}
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          `
        : ""}

      ${snapshot.failures && Object.keys(snapshot.failures).length > 0
        ? diagnosticsNotice({
            tone: "info",
            text: t("diagnostics.runtime.metricFailures", {
              names: Object.keys(snapshot.failures).join(", "),
            }),
          })
        : ""}
    </div>
  `;
}

function performanceResult(
  result: URLPerformanceSummary,
): TrustedHTMLFragment {
  const locale = getLocale();
  const statistics = urlPerformanceStatistics(result);
  const formatNumber = (value: number, maximumFractionDigits = 2) =>
    value.toLocaleString(locale, { maximumFractionDigits });
  const sampleDetailLabel =
    result.samples.length < result.completedSamples
      ? t("diagnostics.performance.retainedSamples", {
          shown: result.samples.length,
          total: result.completedSamples,
        })
      : t("diagnostics.performance.durationScale");
  const metricCards = [
    {
      label: t("diagnostics.performance.average"),
      value: formatURLPerformanceDuration(result.averageMs, locale),
      primary: true,
    },
    {
      label: t("diagnostics.performance.p95"),
      value: formatURLPerformanceDuration(statistics.p95Ms, locale),
      primary: false,
    },
    {
      label: t("diagnostics.performance.errorRate"),
      value: `${formatNumber(statistics.errorRate)}%`,
      primary: false,
    },
    {
      label: t("diagnostics.performance.throughput"),
      value: t("diagnostics.performance.requestsPerSecond", {
        value: formatNumber(statistics.throughputPerSecond),
      }),
      primary: false,
    },
    {
      label: t("diagnostics.performance.completedSamples"),
      value: result.completedSamples.toLocaleString(locale),
      primary: false,
    },
  ];
  const percentiles = [
    ["P50", statistics.medianMs],
    ["P90", statistics.p90Ms],
    ["P95", statistics.p95Ms],
    ["P99", statistics.p99Ms],
  ] as const;
  const statusLabel = (status: string) => {
    if (/^\d+$/.test(status)) return `HTTP ${status}`;
    if (status === "network-error") {
      return t("diagnostics.performance.networkError");
    }
    return t("diagnostics.performance.errorCode", { code: status });
  };
  const statusEntries = Object.entries(result.statusCounts).sort(
    ([left], [right]) => {
      const leftIsHTTP = /^\d+$/.test(left);
      const rightIsHTTP = /^\d+$/.test(right);
      if (leftIsHTTP && rightIsHTTP) return Number(left) - Number(right);
      if (leftIsHTTP) return -1;
      if (rightIsHTTP) return 1;
      return left.localeCompare(right, locale);
    },
  );
  const percentileScope = statistics.percentilesTruncated
    ? t("diagnostics.performance.percentileScopeLimited", {
        shown: statistics.percentileSampleCount,
        total: result.completedSamples,
      })
    : t("diagnostics.performance.percentileScopeAll", {
        count: statistics.percentileSampleCount,
      });

  return html`
    <section
      class="diagnostics-performance-result"
      aria-labelledby="diagnostics-performance-result-title"
    >
      <header class="diagnostics-performance-result-header">
        <div>
          <h2 id="diagnostics-performance-result-title">
            ${t("diagnostics.performance.aggregateTitle")}
          </h2>
          <p>${t("diagnostics.performance.resultDescription")}</p>
        </div>
      </header>

      <div
        class="diagnostics-runtime-cards diagnostics-performance-cards"
        aria-label="${t("diagnostics.performance.metricsLabel")}"
      >
        ${metricCards.map(
          (summary) => html`
            <article class="${summary.primary ? "is-primary" : ""}">
              <span class="tool-eyebrow">${summary.label}</span>
              <strong class="diagnostics-big-value">
                ${summary.value}
              </strong>
            </article>
          `,
        )}
      </div>

      <div class="diagnostics-performance-analysis-grid">
        <section
          class="diagnostics-performance-analysis-card"
          aria-labelledby="diagnostics-performance-percentiles-title"
        >
          <header>
            <div>
              <h3 id="diagnostics-performance-percentiles-title">
                ${t("diagnostics.performance.percentilesTitle")}
              </h3>
              <p>${percentileScope}</p>
            </div>
          </header>
          <div class="diagnostics-performance-percentiles">
            ${percentiles.map(([label, value]) => {
              const ratio =
                result.slowestMs > 0
                  ? Math.max(3, Math.min(100, (value / result.slowestMs) * 100))
                  : 100;
              return html`
                <div>
                  <strong>${label}</strong>
                  <span aria-hidden="true">
                    <i style="width: ${ratio.toFixed(1)}%"></i>
                  </span>
                  <code>${formatURLPerformanceDuration(value, locale)}</code>
                </div>
              `;
            })}
          </div>
        </section>

        <section
          class="diagnostics-performance-analysis-card"
          aria-labelledby="diagnostics-performance-run-title"
        >
          <header>
            <div>
              <h3 id="diagnostics-performance-run-title">
                ${t("diagnostics.performance.runSummaryTitle")}
              </h3>
              <p>${t("diagnostics.performance.runSummaryDescription")}</p>
            </div>
          </header>
          <dl class="diagnostics-performance-facts">
            <div>
              <dt>${t("diagnostics.performance.successfulSamples")}</dt>
              <dd>${result.successfulSamples.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>${t("diagnostics.performance.failedSamples")}</dt>
              <dd>${result.failedSamples.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>${t("diagnostics.performance.standardDeviation")}</dt>
              <dd>${formatURLPerformanceDuration(
                statistics.standardDeviationMs,
                locale,
              )}</dd>
            </div>
            <div>
              <dt>${t("diagnostics.performance.totalDuration")}</dt>
              <dd>${formatURLPerformanceDuration(
                result.elapsedTimeMs ?? result.totalDurationMs,
                locale,
              )}</dd>
            </div>
            <div>
              <dt>${t("diagnostics.performance.averageDNS")}</dt>
              <dd>${formatURLPerformanceDuration(
                statistics.averageDNSMs,
                locale,
              )}</dd>
            </div>
            <div>
              <dt>${t("diagnostics.performance.averageRequest")}</dt>
              <dd>${formatURLPerformanceDuration(
                statistics.averageRequestMs,
                locale,
              )}</dd>
            </div>
            <div>
              <dt>${t("diagnostics.performance.redirectedSamples")}</dt>
              <dd>${result.redirectedSamples.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>${t("diagnostics.performance.fallbackSamples")}</dt>
              <dd>${result.fallbackSamples.toLocaleString(locale)}</dd>
            </div>
          </dl>
          <div class="diagnostics-performance-statuses">
            <strong>${t("diagnostics.performance.statusDistribution")}</strong>
            <div>
              ${statusEntries.map(
                ([status, count]) => html`
                  <span>
                    ${statusLabel(status)}
                    <strong>${count.toLocaleString(locale)}</strong>
                  </span>
                `,
              )}
            </div>
          </div>
        </section>
      </div>

      <section
        class="diagnostics-performance-aggregate"
        aria-labelledby="diagnostics-performance-aggregate-title"
      >
        <header>
          <h3 id="diagnostics-performance-aggregate-title">
            ${t("diagnostics.performance.aggregateReport")}
          </h3>
          <span>
            ${t("diagnostics.performance.aggregateHint", {
              scope: percentileScope,
            })}
          </span>
        </header>
        <div class="diagnostics-table-wrap">
          <table class="diagnostics-table">
            <thead>
              <tr>
                <th scope="col">${t("diagnostics.performance.label")}</th>
                <th scope="col">
                  ${t("diagnostics.performance.sampleCount")}
                </th>
                <th scope="col">${t("diagnostics.performance.average")}</th>
                <th scope="col">${t("diagnostics.performance.median")}</th>
                <th scope="col">P90</th>
                <th scope="col">P95</th>
                <th scope="col">P99</th>
                <th scope="col">${t("diagnostics.performance.fastest")}</th>
                <th scope="col">${t("diagnostics.performance.slowest")}</th>
                <th scope="col">${t("diagnostics.performance.deviationShort")}</th>
                <th scope="col">${t("diagnostics.performance.errorRate")}</th>
                <th scope="col">${t("diagnostics.performance.throughput")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th
                  scope="row"
                  data-label="${t("diagnostics.performance.label")}"
                >${t("diagnostics.performance.totalLabel")}</th>
                <td data-label="${t("diagnostics.performance.sampleCount")}">
                  ${result.completedSamples.toLocaleString(locale)}
                </td>
                <td data-label="${t("diagnostics.performance.average")}">${formatURLPerformanceDuration(
                  result.averageMs,
                  locale,
                )}</td>
                <td data-label="${t("diagnostics.performance.median")}">${formatURLPerformanceDuration(
                  statistics.medianMs,
                  locale,
                )}</td>
                <td data-label="P90">${formatURLPerformanceDuration(
                  statistics.p90Ms,
                  locale,
                )}</td>
                <td data-label="P95">${formatURLPerformanceDuration(
                  statistics.p95Ms,
                  locale,
                )}</td>
                <td data-label="P99">${formatURLPerformanceDuration(
                  statistics.p99Ms,
                  locale,
                )}</td>
                <td data-label="${t("diagnostics.performance.fastest")}">${formatURLPerformanceDuration(
                  result.fastestMs,
                  locale,
                )}</td>
                <td data-label="${t("diagnostics.performance.slowest")}">${formatURLPerformanceDuration(
                  result.slowestMs,
                  locale,
                )}</td>
                <td data-label="${t("diagnostics.performance.deviationShort")}">${formatURLPerformanceDuration(
                  statistics.standardDeviationMs,
                  locale,
                )}</td>
                <td data-label="${t("diagnostics.performance.errorRate")}">
                  ${formatNumber(statistics.errorRate)}%
                </td>
                <td data-label="${t("diagnostics.performance.throughput")}">
                  ${t("diagnostics.performance.requestsPerSecond", {
                    value: formatNumber(statistics.throughputPerSecond),
                  })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        class="diagnostics-performance-samples"
        aria-labelledby="diagnostics-performance-samples-title"
      >
        <header>
          <h3 id="diagnostics-performance-samples-title">
            ${t("diagnostics.performance.sampleBreakdown")}
          </h3>
          <span>${sampleDetailLabel}</span>
        </header>
        <div class="diagnostics-table-wrap">
          <table class="diagnostics-table">
            <thead>
              <tr>
                <th scope="col">${t("diagnostics.performance.sample")}</th>
                <th scope="col">${t("diagnostics.performance.status")}</th>
                <th scope="col">${t("diagnostics.performance.duration")}</th>
                <th scope="col">${t("diagnostics.performance.dns")}</th>
                <th scope="col">${t("diagnostics.performance.requestTime")}</th>
                <th scope="col">${t("diagnostics.performance.redirects")}</th>
                <th scope="col">${t("diagnostics.performance.method")}</th>
                <th scope="col">${t("diagnostics.performance.finalURL")}</th>
              </tr>
            </thead>
            <tbody>
              ${result.samples.map((sample) => {
                const ratio =
                  result.slowestMs > 0
                    ? Math.max(
                        4,
                        Math.min(
                          100,
                          (sample.durationMs / result.slowestMs) * 100,
                        ),
                      )
                    : 100;
                const statusClass =
                  sample.success
                    ? "is-success"
                    : sample.statusCode >= 400 && sample.statusCode < 500
                      ? "is-warning"
                      : "is-error";
                return html`
                  <tr>
                    <td
                      data-label="${t("diagnostics.performance.sample")}"
                      data-performance-field="sample"
                    >${sample.number.toLocaleString(locale)}</td>
                    <td
                      data-label="${t("diagnostics.performance.status")}"
                      data-performance-field="status"
                    >
                      <span
                        class="diagnostics-status ${statusClass}"
                        title="${sample.error ?? ""}"
                      >
                        ${sample.statusCode > 0
                          ? `HTTP ${sample.statusCode}`
                          : statusLabel(
                              sample.failureCategory ?? "network-error",
                            )}
                      </span>
                    </td>
                    <td
                      data-label="${t("diagnostics.performance.duration")}"
                      data-performance-field="duration"
                    >
                      <div class="diagnostics-performance-duration">
                        <strong>
                          ${formatURLPerformanceDuration(
                            sample.durationMs,
                            locale,
                          )}
                        </strong>
                        <span aria-hidden="true">
                          <i style="width: ${ratio.toFixed(1)}%"></i>
                        </span>
                      </div>
                    </td>
                    <td
                      data-label="${t("diagnostics.performance.dns")}"
                      data-performance-field="dns"
                    >${formatURLPerformanceDuration(
                      sample.dnsDurationMs,
                      locale,
                    )}</td>
                    <td
                      data-label="${t("diagnostics.performance.requestTime")}"
                      data-performance-field="request"
                    >${formatURLPerformanceDuration(
                      sample.requestDurationMs,
                      locale,
                    )}</td>
                    <td
                      data-label="${t("diagnostics.performance.redirects")}"
                      data-performance-field="redirects"
                    >${sample.redirectCount.toLocaleString(locale)}</td>
                    <td
                      data-label="${t("diagnostics.performance.method")}"
                      data-performance-field="method"
                    >
                      <code>
                        ${sample.usedGetFallback
                          ? t("diagnostics.performance.headToGet")
                          : sample.method}
                      </code>
                    </td>
                    <td
                      data-label="${t("diagnostics.performance.finalURL")}"
                      data-performance-field="url"
                    >
                      <code title="${sample.finalURL}">
                        ${sample.finalURL}
                      </code>
                      ${sample.error
                        ? html`
                            <small class="diagnostics-performance-sample-error">
                              ${sample.error}
                            </small>
                          `
                        : ""}
                    </td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function environmentResult(
  result: EnvironmentCompareResult,
): TrustedHTMLFragment {
  const responses = result.responses ?? [];
  const comparisons = result.comparisons ?? [];
  return html`
    <div class="diagnostics-result-stack">
      <div class="diagnostics-runtime-cards">
        ${responses.map(
          (response, index) => html`
            <article class="tool-panel diagnostics-panel-padded">
              <span class="tool-eyebrow">
                ${response.name ||
                t("diagnostics.environment.shortLabel", {
                  number: index + 1,
                })}
              </span>
              <strong class="diagnostics-big-value">
                ${response.error
                  ? t("diagnostics.environment.error")
                  : response.statusCode || "—"}
              </strong>
              <span>
                ${formatEnvironmentDuration(response, getLocale())}
              </span>
              <small title="${response.url}">
                ${response.url ||
                t("diagnostics.environment.missingURL")}
              </small>
              ${response.truncated
                ? html`<span>
                    ${t("diagnostics.environment.bodyTruncated")}
                  </span>`
                : ""}
              ${response.error
                ? html`<span class="diagnostics-error-text">
                    ${response.error}
                  </span>`
                : ""}
            </article>
          `,
        )}
      </div>

      ${comparisons.length > 0
        ? comparisons.map(
            (comparison) => html`
              <article class="tool-panel">
                <div class="tool-card-header">
                  <div>
                    <strong>
                      ${comparison.baseline ||
                      t("diagnostics.environment.defaultBaseline")}
                      →
                      ${comparison.candidate ||
                      t("diagnostics.environment.defaultCandidate")}
                    </strong>
                    <span>
                      ${t("diagnostics.environment.summary", {
                        status: comparison.statusMatch
                          ? t("diagnostics.environment.same")
                          : t("diagnostics.environment.different"),
                        body: comparison.bodyEqual
                          ? t("diagnostics.environment.same")
                          : t("diagnostics.environment.different"),
                      })}
                    </span>
                  </div>
                  <span
                    class="diagnostics-status ${!comparison.statusMatch ||
                    !comparison.bodyEqual
                      ? "danger"
                      : ""}"
                  >
                    ${comparison.statusMatch && comparison.bodyEqual
                      ? t("diagnostics.environment.matched")
                      : t("diagnostics.environment.hasDifference")}
                  </span>
                </div>
                ${comparison.error
                  ? html`
                      <div
                        class="diagnostics-error-text diagnostics-error-block"
                      >
                        ${comparison.error}
                      </div>
                    `
                  : html`
                      <div class="diagnostics-comparison-body">
                        <dl class="diagnostics-facts">
                          <div>
                            <dt>
                              ${t("diagnostics.environment.status")}
                            </dt>
                            <dd>
                              ${comparison.baselineStatus ?? "—"} →
                              ${comparison.candidateStatus ?? "—"}
                            </dd>
                          </div>
                          <div>
                            <dt>
                              ${t("diagnostics.environment.bodyMode")}
                            </dt>
                            <dd>${comparison.bodyMode ?? "—"}</dd>
                          </div>
                          <div>
                            <dt>
                              ${t(
                                "diagnostics.environment.headerDifference",
                              )}
                            </dt>
                            <dd>
                              ${comparison.headerDifferences?.join(", ") ||
                              t("diagnostics.environment.noDifference")}
                              ${comparison.headerDifferencesTruncated
                                ? t(
                                    "diagnostics.environment.firstDifferences",
                                  )
                                : ""}
                            </dd>
                          </div>
                          <div>
                            <dt>
                              ${t(
                                "diagnostics.environment.jsonDifference",
                              )}
                            </dt>
                            <dd>
                              ${comparison.jsonDifferences?.length ?? 0}
                              ${comparison.jsonDifferencesTruncated
                                ? t(
                                    "diagnostics.environment.resultsLimited",
                                  )
                                : ""}
                            </dd>
                          </div>
                        </dl>
                        ${(comparison.jsonDifferences?.length ?? 0) > 0
                          ? html`
                              <div class="diagnostics-table-wrap">
                                <table class="diagnostics-table">
                                  <thead>
                                    <tr>
                                      <th scope="col">
                                        ${t(
                                          "diagnostics.environment.path",
                                        )}
                                      </th>
                                      <th scope="col">
                                        ${t(
                                          "diagnostics.environment.type",
                                        )}
                                      </th>
                                      <th scope="col">
                                        ${t(
                                          "diagnostics.environment.baselineColumn",
                                        )}
                                      </th>
                                      <th scope="col">
                                        ${t(
                                          "diagnostics.environment.environmentColumn",
                                        )}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    ${comparison.jsonDifferences?.map(
                                      (difference) => html`
                                        <tr>
                                          <td>
                                            <code>
                                              ${difference.path ?? "$"}
                                            </code>
                                          </td>
                                          <td>
                                            ${environmentChangeLabel(
                                              difference.kind,
                                            )}
                                          </td>
                                          <td>
                                            <code>
                                              ${formatUnknown(
                                                difference.baseline,
                                              )}
                                            </code>
                                          </td>
                                          <td>
                                            <code>
                                              ${formatUnknown(
                                                difference.candidate,
                                              )}
                                            </code>
                                          </td>
                                        </tr>
                                      `,
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            `
                          : ""}
                      </div>
                    `}
              </article>
            `,
          )
        : emptyPanel(
            "refresh",
            t("diagnostics.environment.emptyTitle"),
            t("diagnostics.environment.emptyDescription"),
          )}

      ${responses.map(
        (response, index) => html`
          <details class="tool-panel diagnostics-details">
            <summary>
              ${t("diagnostics.environment.responseBody", {
                name:
                  response.name ||
                  t("diagnostics.environment.legend", {
                    number: index + 1,
                  }),
              })}
            </summary>
            <pre>${response.body ||
            response.error ||
            t("diagnostics.environment.emptyBody")}</pre>
          </details>
        `,
      )}
    </div>
  `;
}

function threadDumpResult(result: ThreadDumpResult): TrustedHTMLFragment {
  const states = Object.entries(result.stateCounts ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return html`
    <div class="diagnostics-result-stack">
      ${result.deadlockDetected
        ? diagnosticsNotice({
            tone: "error",
            text: t("diagnostics.thread.deadlockWarning"),
          })
        : ""}
      <div class="diagnostics-runtime-cards">
        <article class="tool-panel diagnostics-panel-padded">
          <span class="tool-eyebrow">
            ${t("diagnostics.thread.eyebrow")}
          </span>
          <strong class="diagnostics-big-value">
            ${result.threadCount ?? 0}
          </strong>
          <span>
            ${result.truncated
              ? t("diagnostics.thread.limited")
              : t("diagnostics.thread.complete")}
          </span>
        </article>
        ${states.map(
          ([threadState, count]) => html`
            <article class="tool-panel diagnostics-panel-padded">
              <span class="tool-eyebrow">${threadState}</span>
              <strong class="diagnostics-big-value">${count}</strong>
              <span>${t("diagnostics.thread.count")}</span>
            </article>
          `,
        )}
      </div>

      ${(result.blockedThreads?.length ?? 0) > 0
        ? html`
            <article class="tool-panel">
              ${cardHeader(
                t("diagnostics.thread.blockedTitle"),
                t("diagnostics.thread.findingCount", {
                  count: result.blockedThreads?.length ?? 0,
                }),
              )}
              <div class="diagnostics-table-wrap">
                <table class="diagnostics-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        ${t("diagnostics.thread.threadColumn")}
                      </th>
                      <th scope="col">
                        ${t("diagnostics.thread.stateColumn")}
                      </th>
                      <th scope="col">
                        ${t("diagnostics.thread.clue")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    ${result.blockedThreads?.map(
                      (thread) => html`
                        <tr>
                          <td>
                            <code>
                              ${thread.name ||
                              t("diagnostics.thread.unnamed")}
                            </code>
                          </td>
                          <td>${thread.state || "UNKNOWN"}</td>
                          <td>
                            <code>
                              ${thread.clues?.join(" · ") ||
                              t("diagnostics.thread.noLockDetails")}
                            </code>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          `
        : ""}

      ${(result.repeatedStacks?.length ?? 0) > 0
        ? html`
            <article class="tool-panel">
              ${cardHeader(
                t("diagnostics.thread.repeatedTitle"),
                t("diagnostics.thread.repeatedDescription"),
              )}
              <div class="diagnostics-stack-groups">
                ${result.repeatedStacks?.map(
                  (stack) => html`
                    <details>
                      <summary>
                        ${t("diagnostics.thread.group", {
                          count: stack.count ?? 0,
                          names:
                            stack.threads?.slice(0, 3).join(", ") ||
                            t("diagnostics.thread.unnamed"),
                        })}
                      </summary>
                      <pre>${stack.frames?.join("\n") ||
                      t("diagnostics.thread.noFrames")}</pre>
                    </details>
                  `,
                )}
              </div>
            </article>
          `
        : ""}

      ${(result.deadlockClues?.length ?? 0) > 0
        ? html`
            <details class="tool-panel diagnostics-details">
              <summary>
                ${t("diagnostics.thread.deadlockClues", {
                  count: result.deadlockClues?.length ?? 0,
                })}
              </summary>
              <pre>${result.deadlockClues?.join("\n") ?? ""}</pre>
            </details>
          `
        : ""}
    </div>
  `;
}

function logSearchResult(result: LogSearchResult): TrustedHTMLFragment {
  const matches = result.matches ?? [];
  return html`
    <article class="tool-panel">
      <div class="tool-card-header">
        <div>
          <strong>
            ${t("diagnostics.log.matchCount", { count: matches.length })}
          </strong>
          <span>
            ${t("diagnostics.log.scannedCount", {
              count: result.scannedLines ?? 0,
            })}
          </span>
        </div>
        ${result.truncated
          ? html`<span>${t("diagnostics.thread.limited")}</span>`
          : ""}
      </div>
      ${matches.length > 0
        ? html`
            <div class="diagnostics-log-results">
              ${matches.map(
                (match) => html`
                  <div>
                    <span>${match.lineNumber ?? "—"}</span>
                    <code>${match.line ?? ""}</code>
                  </div>
                `,
              )}
            </div>
          `
        : emptyToolResult(
            "search",
            t("diagnostics.log.noMatchTitle"),
            t("diagnostics.log.noMatchDescription"),
          )}
    </article>
  `;
}

function coverageResult(result: CoverageResult): TrustedHTMLFragment {
  const percentage = result.coveragePercent ?? 0;
  const progressValue = Math.max(0, Math.min(100, percentage));
  const localizedPercentage = percentage.toLocaleString(getLocale(), {
    maximumFractionDigits: 1,
  });
  return html`
    <div class="diagnostics-result-stack">
      <article
        class="tool-panel diagnostics-coverage-summary diagnostics-panel-padded"
      >
        <div
          class="diagnostics-coverage-ring"
          style="--diagnostics-coverage: ${progressValue}%"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${progressValue}"
          aria-label="${t("diagnostics.coverage.aria", {
            percentage: localizedPercentage,
          })}"
        >
          <span>${localizedPercentage}%</span>
        </div>
        <div>
          <strong>
            ${t("diagnostics.coverage.called", {
              covered: result.covered ?? 0,
              total: result.totalKnown ?? 0,
            })}
          </strong>
          <p>${t("diagnostics.coverage.disclaimer")}</p>
        </div>
      </article>

      <article class="tool-panel">
        ${cardHeader(
          t("diagnostics.coverage.endpoints"),
          t("diagnostics.coverage.matchDescription"),
        )}
        <div class="diagnostics-table-wrap">
          <table class="diagnostics-table">
            <thead>
              <tr>
                <th scope="col">${t("diagnostics.coverage.method")}</th>
                <th scope="col">${t("diagnostics.coverage.path")}</th>
                <th scope="col">${t("diagnostics.coverage.hit")}</th>
                <th scope="col">
                  ${t("diagnostics.coverage.observedPath")}
                </th>
              </tr>
            </thead>
            <tbody>
              ${(result.endpoints ?? []).map(
                (endpoint) => html`
                  <tr>
                    <td><code>${endpoint.method ?? "—"}</code></td>
                    <td><code>${endpoint.path ?? "/"}</code></td>
                    <td>${endpoint.hitCount ?? 0}</td>
                    <td>
                      ${endpoint.observedPaths?.join(", ") ||
                      t("diagnostics.coverage.notSeen")}${endpoint.observedPathsTruncated
                        ? " …"
                        : ""}
                    </td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>
      </article>

      ${(result.unknownObserved?.length ?? 0) > 0
        ? html`
            <article class="tool-panel">
              ${cardHeader(
                t("diagnostics.coverage.unknownCalls"),
                t("diagnostics.coverage.routeCount", {
                  count: result.unknownObserved?.length ?? 0,
                }),
              )}
              <div
                class="diagnostics-chip-list diagnostics-chip-list-padded"
              >
                ${result.unknownObserved?.map(
                  (item) => html`
                    <code>
                      ${item.method} ${item.path} [${item.count ?? 0}]
                    </code>
                  `,
                )}
              </div>
            </article>
          `
        : ""}
    </div>
  `;
}

function activeRequest() {
  const workspace = workspaceStore.getState();
  return workspace.tabs.find((tab) => tab.id === workspace.activeTabID);
}

function springPanel(state: DiagnosticsState): TrustedHTMLFragment {
  const activeTab = activeRequest();
  const activeResponse = activeTab?.response;
  return html`
    <div class="diagnostics-work-grid">
      <article class="tool-editor-card diagnostics-spring-input">
        ${cardHeader(
          t("diagnostics.spring.responseTitle"),
          activeResponse
            ? t("diagnostics.spring.activeTab", {
                name: activeTab?.name ?? "",
                status: activeResponse.statusCode,
              })
            : t("diagnostics.spring.inputHint"),
          button(t("diagnostics.spring.loadActive"), "load-active-response", {
            variant: "ghost",
            icon: "copy",
            disabled: !activeResponse,
          }),
        )}
        <div class="diagnostics-form-strip">
          <label class="diagnostics-field">
            ${t("diagnostics.spring.httpStatus")}
            <input
              type="number"
              min="100"
              max="599"
              value="${state.springStatus}"
              data-diagnostics-control="spring-status"
            />
          </label>
          <label class="diagnostics-field diagnostics-field-grow">
            ${t("diagnostics.spring.headersLabel")}
            <textarea
              rows="2"
              placeholder="X-Trace-ID: 7f1…"
              data-diagnostics-control="spring-headers"
            >${state.springHeaders}</textarea>
          </label>
          ${button(t("diagnostics.spring.analyze"), "analyze-spring", {
            variant: "primary",
            icon: "warning",
          })}
        </div>
        <textarea
          class="tool-code-input"
          data-diagnostics-control="spring-body"
          placeholder="${'{\n  "type": "about:blank",\n  "title": "Bad Request",\n  "status": 400,\n  "detail": "Validation failed"\n}'}"
          spellcheck="false"
          aria-label="${t("diagnostics.spring.bodyLabel")}"
        >${state.springBody}</textarea>
      </article>
      <div>
        ${state.springAnalysis
          ? springResult(state.springAnalysis)
          : emptyPanel(
              "warning",
              t("diagnostics.spring.emptyTitle"),
              t("diagnostics.spring.emptyDescription"),
            )}
      </div>
    </div>
  `;
}

function jwtPanel(state: DiagnosticsState): TrustedHTMLFragment {
  return html`
    <div class="diagnostics-work-grid">
      <article class="tool-editor-card">
        ${cardHeader(
          t("diagnostics.jwt.inputTitle"),
          t("diagnostics.jwt.inputHint"),
        )}
        <textarea
          class="tool-code-input"
          data-diagnostics-control="jwt-input"
          placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9…"
          spellcheck="false"
          aria-label="${t("diagnostics.jwt.tokenLabel")}"
        >${state.jwtInput}</textarea>
        <div class="tool-card-actions">
          ${button(t("diagnostics.jwt.decode"), "analyze-jwt", {
            variant: "primary",
            icon: "eye",
          })}
        </div>
      </article>
      <div>
        ${state.jwtAnalysis
          ? jwtResult(state.jwtAnalysis)
          : emptyPanel(
              "eye",
              t("diagnostics.jwt.emptyTitle"),
              t("diagnostics.jwt.emptyDescription"),
            )}
      </div>
    </div>
  `;
}

function runtimePanel(state: DiagnosticsState): TrustedHTMLFragment {
  const busy = Boolean(state.busy);
  return html`
    <div class="diagnostics-result-stack">
      <article class="tool-panel diagnostics-panel-padded">
        <div class="diagnostics-runtime-form">
          <label class="diagnostics-field diagnostics-field-wide">
            ${t("diagnostics.runtime.baseURL")}
            <input
              type="url"
              value="${state.actuatorURL}"
              data-diagnostics-control="actuator-url"
              placeholder="http://localhost:8080/actuator"
              autocomplete="url"
              required
            />
          </label>
          <label class="diagnostics-field">
            ${t("diagnostics.field.timeoutMilliseconds")}
            <input
              type="number"
              min="1"
              max="30000"
              value="${state.actuatorTimeout}"
              data-diagnostics-control="actuator-timeout"
            />
          </label>
          <label class="diagnostics-checkbox">
            <input
              type="checkbox"
              data-diagnostics-control="include-mappings"
              ${state.includeMappings ? "checked" : ""}
            />
            ${t("diagnostics.runtime.includeMappings")}
          </label>
          <label class="diagnostics-field">
            ${t("diagnostics.runtime.headers")}
            <textarea
              rows="5"
              data-diagnostics-control="actuator-headers"
              placeholder="Authorization: Bearer …"
            >${state.actuatorHeaders}</textarea>
          </label>
          <label class="diagnostics-field">
            ${t("diagnostics.runtime.metricNames")}
            <textarea
              rows="5"
              spellcheck="false"
              data-diagnostics-control="metric-names"
            >${state.metricNames}</textarea>
          </label>
        </div>
        <div class="diagnostics-action-row">
          ${button(
            t("diagnostics.runtime.captureBaseline"),
            "runtime-baseline",
            {
              icon: "activity",
              busy: state.busy === "runtime-baseline",
              disabled: busy,
            },
          )}
          ${button(
            state.runtimeBaseline
              ? t("diagnostics.runtime.captureDelta")
              : t("diagnostics.runtime.captureSnapshot"),
            "runtime-snapshot",
            {
              variant: "primary",
              icon: "play",
              busy: state.busy === "runtime",
              disabled: busy,
            },
          )}
          ${state.runtimeBaseline
            ? button(
                t("diagnostics.runtime.clearBaseline"),
                "clear-runtime-baseline",
                { variant: "ghost" },
              )
            : ""}
          <span>${t("diagnostics.runtime.readOnlyHint")}</span>
        </div>
      </article>
      ${state.runtimeResult
        ? runtimeResult(state.runtimeResult, state.runtimeBaseline)
        : emptyPanel(
            "activity",
            t("diagnostics.runtime.emptyTitle"),
            t("diagnostics.runtime.emptyDescription"),
          )}
    </div>
  `;
}

function performancePanel(state: DiagnosticsState): TrustedHTMLFragment {
  const running = state.busy === "performance";
  const stopping = running && state.performanceCanceling;
  return html`
    <div class="diagnostics-result-stack diagnostics-performance-workspace">
      <section
        class="diagnostics-performance-console"
        aria-labelledby="diagnostics-performance-target-title"
        aria-busy="${running ? "true" : "false"}"
      >
        <header class="diagnostics-performance-console-header">
          <div>
            <h2 id="diagnostics-performance-target-title">
              ${t("diagnostics.performance.targetTitle")}
            </h2>
            <p>${t("diagnostics.performance.targetDescription")}</p>
          </div>
          <div
            class="diagnostics-performance-method"
            title="${t("diagnostics.performance.urlHelp")}"
          >
            ${icon("request", 15)}
            <span>${t("diagnostics.performance.methodLabel")}</span>
            <strong>${t("diagnostics.performance.methodValue")}</strong>
          </div>
        </header>

        <div class="diagnostics-performance-url-row">
          <label class="diagnostics-field diagnostics-performance-url-field">
            <span>${t("diagnostics.performance.url")}</span>
            <input
              type="url"
              value="${state.performanceURL}"
              data-diagnostics-control="performance-url"
              placeholder="https://api.example.test/health"
              aria-describedby="diagnostics-performance-url-help"
              autocomplete="url"
              required
              ${state.busy ? "disabled" : ""}
            />
            <small id="diagnostics-performance-url-help" class="sr-only">
              ${t("diagnostics.performance.urlHelp")}
            </small>
          </label>
          <div class="diagnostics-performance-primary-action">
            ${running
              ? button(
                  stopping
                    ? t("diagnostics.performance.stopping")
                    : t("diagnostics.performance.stop"),
                  "performance-stop",
                  {
                    variant: "secondary",
                    icon: "stop",
                    disabled: stopping,
                  },
                )
              : button(
                  t("diagnostics.performance.run"),
                  "performance-run",
                  {
                    variant: "primary",
                    icon: "play",
                    disabled: Boolean(state.busy),
                  },
                )}
          </div>
        </div>

        <div class="diagnostics-performance-settings">
          <div class="diagnostics-performance-settings-fields">
            <label class="diagnostics-field">
              <span>${t("diagnostics.performance.samples")}</span>
              <span class="diagnostics-performance-unit-input">
                <input
                  type="number"
                  min="${urlPerformanceLimits.minimumSamples}"
                  max="${urlPerformanceLimits.maximumSamples}"
                  step="1"
                  value="${state.performanceSampleCount}"
                  data-diagnostics-control="performance-samples"
                  ${state.busy ? "disabled" : ""}
                />
                <span aria-hidden="true">
                  ${t("diagnostics.performance.samplesUnit")}
                </span>
              </span>
            </label>
            <label class="diagnostics-field">
              <span>${t("diagnostics.performance.timeout")}</span>
              <span class="diagnostics-performance-unit-input">
                <input
                  type="number"
                  min="${urlPerformanceLimits.minimumTimeoutMs}"
                  step="1"
                  value="${state.performanceTimeout}"
                  data-diagnostics-control="performance-timeout"
                  aria-describedby="diagnostics-performance-timeout-unit"
                  ${state.busy ? "disabled" : ""}
                />
                <span aria-hidden="true">ms</span>
                <span
                  id="diagnostics-performance-timeout-unit"
                  class="sr-only"
                >
                  ${t("diagnostics.performance.timeoutUnit")}
                </span>
              </span>
            </label>
          </div>
          <p class="diagnostics-performance-safety">
            ${icon("info", 14)}
            <span>${t("diagnostics.performance.safetyHint")}</span>
          </p>
        </div>
        ${running
          ? html`
              <div
                class="diagnostics-performance-progress"
                aria-live="polite"
              >
                <div>
                  <span>${t("diagnostics.performance.progress")}</span>
                  <strong data-performance-progress-label>
                    ${t("diagnostics.performance.progressValue", {
                      completed: state.performanceCompletedSamples,
                      total: state.performanceSampleCount,
                    })}
                  </strong>
                </div>
                <progress
                  data-performance-progress
                  value="${state.performanceCompletedSamples}"
                  max="${state.performanceSampleCount}"
                  aria-label="${t("diagnostics.performance.progress")}">
                </progress>
              </div>
            `
          : ""}
      </section>
      ${state.performanceResult
        ? performanceResult(state.performanceResult)
        : html`
            <section class="diagnostics-performance-empty">
              ${emptyToolResult(
                "activity",
                t("diagnostics.performance.emptyTitle"),
                t("diagnostics.performance.emptyDescription"),
              )}
            </section>
          `}
    </div>
  `;
}

function environmentPanel(state: DiagnosticsState): TrustedHTMLFragment {
  const unsafe = !isSafeEnvironmentMethod(state.environmentMethod);
  return html`
    <div class="diagnostics-result-stack">
      <article class="tool-panel diagnostics-panel-padded">
        <div class="diagnostics-request-line">
          <label class="diagnostics-field">
            ${t("diagnostics.environment.method")}
            <select data-diagnostics-control="environment-method">
              ${environmentMethods.map(
                (method) => html`
                  <option
                    value="${method}"
                    ${method === state.environmentMethod ? "selected" : ""}
                  >
                    ${method}
                  </option>
                `,
              )}
            </select>
          </label>
          <label class="diagnostics-field diagnostics-field-grow">
            ${t("diagnostics.environment.relativePath")}
            <input
              value="${state.environmentPath}"
              data-diagnostics-control="environment-path"
              placeholder="/api/orders?limit=10"
              required
            />
          </label>
          <label class="diagnostics-field">
            ${t("diagnostics.field.timeoutMilliseconds")}
            <input
              type="number"
              min="1"
              max="30000"
              value="${state.environmentTimeout}"
              data-diagnostics-control="environment-timeout"
            />
          </label>
        </div>
        <div class="diagnostics-target-grid">
          ${state.environmentTargets.map(
            (target, index) => html`
              <fieldset>
                <legend>
                  ${t("diagnostics.environment.legend", {
                    number: index + 1,
                  })}
                </legend>
                <label class="diagnostics-field">
                  ${t("diagnostics.environment.name")}
                  <input
                    value="${target.name}"
                    autocomplete="off"
                    data-diagnostics-control="environment-target"
                    data-target-index="${index}"
                    data-target-field="name"
                  />
                </label>
                <label class="diagnostics-field">
                  ${t("diagnostics.environment.baseURL")}
                  <input
                    type="url"
                    value="${target.baseUrl}"
                    autocomplete="url"
                    data-diagnostics-control="environment-target"
                    data-target-index="${index}"
                    data-target-field="baseUrl"
                    placeholder="https://test.example.com"
                  />
                </label>
              </fieldset>
            `,
          )}
        </div>
        <div class="diagnostics-two-column">
          <label class="diagnostics-field">
            ${t("diagnostics.runtime.headers")}
            <textarea
              rows="4"
              data-diagnostics-control="environment-headers"
              placeholder="Accept: application/json"
            >${state.environmentHeaders}</textarea>
          </label>
          <label class="diagnostics-field">
            ${t("diagnostics.environment.ignorePaths")}
            <textarea
              rows="4"
              data-diagnostics-control="environment-ignore-paths"
              placeholder="$.traceId"
            >${state.environmentIgnorePaths}</textarea>
          </label>
        </div>
        <label class="diagnostics-field">
          ${t("diagnostics.environment.requestBody")}
          <textarea
            rows="6"
            spellcheck="false"
            data-diagnostics-control="environment-body"
            placeholder="${isSafeEnvironmentMethod(state.environmentMethod)
              ? t("diagnostics.environment.safeBodyHint")
              : '{\n  "name": "example"\n}'}"
          >${state.environmentBody}</textarea>
        </label>
        ${unsafe
          ? html`
              <div
                class="tool-notice tool-notice-row info"
                role="status"
              >
                ${icon("activity", 14)}
                <label class="diagnostics-checkbox">
                  <input
                    type="checkbox"
                    data-diagnostics-control="allow-unsafe"
                    ${state.allowUnsafe ? "checked" : ""}
                  />
                  ${t("diagnostics.environment.unsafeConsent", {
                    method: state.environmentMethod,
                  })}
                </label>
              </div>
            `
          : ""}
        <div class="diagnostics-action-row">
          ${button(
            t("diagnostics.environment.compare"),
            "compare-environments",
            {
              variant: "primary",
              icon: "refresh",
              busy: state.busy === "environments",
              disabled:
                Boolean(state.busy) || (unsafe && !state.allowUnsafe),
            },
          )}
          <span>${t("diagnostics.environment.baselineHint")}</span>
        </div>
      </article>
      ${state.environmentResult
        ? environmentResult(state.environmentResult)
        : emptyPanel(
            "refresh",
            t("diagnostics.environment.noResultTitle"),
            t("diagnostics.environment.noResultDescription"),
          )}
    </div>
  `;
}

function threadTabs(state: DiagnosticsState): TrustedHTMLFragment {
  const tabs: readonly {
    id: ThreadLogMode;
    label: string;
    icon: IconName;
  }[] = [
    {
      id: "thread",
      label: t("diagnostics.thread.dumpTab"),
      icon: "activity",
    },
    {
      id: "logs",
      label: t("diagnostics.thread.logTab"),
      icon: "search",
    },
  ];
  return html`
    <div
      class="tool-tabs diagnostics-subtabs"
      role="tablist"
      aria-label="${t("diagnostics.thread.toolsLabel")}"
    >
      ${tabs.map(
        (tab) => html`
          <button
            type="button"
            id="diagnostics-thread-logs-tab-${tab.id}"
            class="${state.threadLogMode === tab.id ? "active" : ""}"
            role="tab"
            data-diagnostics-thread-mode="${tab.id}"
            aria-selected="${state.threadLogMode === tab.id
              ? "true"
              : "false"}"
            aria-controls="diagnostics-thread-logs-panel-${tab.id}"
            tabindex="${state.threadLogMode === tab.id ? 0 : -1}"
          >
            ${icon(tab.icon, 15)}
            <span>${tab.label}</span>
          </button>
        `,
      )}
    </div>
    ${tabs
      .filter((tab) => tab.id !== state.threadLogMode)
      .map(
        (tab) => html`
          <div
            id="diagnostics-thread-logs-panel-${tab.id}"
            role="tabpanel"
            aria-labelledby="diagnostics-thread-logs-tab-${tab.id}"
            hidden
          ></div>
        `,
      )}
  `;
}

function threadAndLogsPanel(
  state: DiagnosticsState,
): TrustedHTMLFragment {
  const activeResponse = activeRequest()?.response;
  return html`
    <div class="diagnostics-result-stack">
      ${threadTabs(state)}
      ${state.threadLogMode === "thread"
        ? html`
            <div
              class="diagnostics-work-grid"
              id="diagnostics-thread-logs-panel-thread"
              role="tabpanel"
              aria-labelledby="diagnostics-thread-logs-tab-thread"
            >
              <article class="tool-editor-card">
                ${cardHeader(
                  t("diagnostics.thread.dumpTitle"),
                  t("diagnostics.thread.dumpHint"),
                )}
                <textarea
                  class="tool-code-input"
                  data-diagnostics-control="thread-dump"
                  placeholder="${'"http-nio-8080-exec-1" #42\n   java.lang.Thread.State: BLOCKED\n        at com.example.OrderService.load(OrderService.java:42)'}"
                  spellcheck="false"
                  aria-label="${t("diagnostics.thread.dumpLabel")}"
                >${state.threadDump}</textarea>
                <div class="tool-card-actions">
                  ${button(
                    t("diagnostics.thread.analyze"),
                    "analyze-threads",
                    {
                      variant: "primary",
                      icon: "play",
                      busy: state.busy === "thread",
                      disabled: Boolean(state.busy),
                    },
                  )}
                </div>
              </article>
              <div>
                ${state.threadResult
                  ? threadDumpResult(state.threadResult)
                  : emptyPanel(
                      "activity",
                      t("diagnostics.thread.emptyTitle"),
                      t("diagnostics.thread.emptyDescription"),
                    )}
              </div>
            </div>
          `
        : html`
            <div
              class="diagnostics-work-grid"
              id="diagnostics-thread-logs-panel-logs"
              role="tabpanel"
              aria-labelledby="diagnostics-thread-logs-tab-logs"
            >
              <article class="tool-editor-card">
                ${cardHeader(
                  t("diagnostics.log.title"),
                  t("diagnostics.log.description"),
                )}
                <textarea
                  class="tool-code-input"
                  data-diagnostics-control="log-text"
                  placeholder="2026-07-27 INFO traceId=8f31c1a2d94b request completed"
                  spellcheck="false"
                  aria-label="${t("diagnostics.log.inputLabel")}"
                >${state.logText}</textarea>
                <div class="diagnostics-form-strip">
                  <label
                    class="diagnostics-field diagnostics-field-grow"
                  >
                    ${t("diagnostics.log.traceLabel")}
                    <input
                      value="${state.traceQuery}"
                      data-diagnostics-control="trace-query"
                      placeholder="8f31c1a2d94b"
                    />
                  </label>
                  <label class="diagnostics-checkbox">
                    <input
                      type="checkbox"
                      data-diagnostics-control="case-sensitive"
                      ${state.caseSensitive ? "checked" : ""}
                    />
                    ${t("diagnostics.log.caseSensitive")}
                  </label>
                  ${button(
                    t("diagnostics.log.activeResponseID"),
                    "use-active-trace",
                    {
                      variant: "ghost",
                      disabled: !activeResponse?.traceId,
                      title: activeResponse?.traceId
                        ? t("diagnostics.log.useActiveTitle")
                        : t("diagnostics.log.noActiveTitle"),
                    },
                  )}
                  ${button(t("diagnostics.log.search"), "search-logs", {
                    variant: "primary",
                    icon: "search",
                    busy: state.busy === "logs",
                    disabled: Boolean(state.busy),
                  })}
                </div>
              </article>
              <div>
                ${state.logResult
                  ? logSearchResult(state.logResult)
                  : emptyPanel(
                      "search",
                      t("diagnostics.log.emptyTitle"),
                      t("diagnostics.log.emptyDescription"),
                    )}
              </div>
            </div>
          `}
    </div>
  `;
}

function coveragePanel(state: DiagnosticsState): TrustedHTMLFragment {
  return html`
    <div class="diagnostics-result-stack">
      <div class="diagnostics-work-grid">
        <article class="tool-editor-card">
          ${cardHeader(
            t("diagnostics.coverage.knownTitle"),
            t("diagnostics.coverage.knownDescription"),
          )}
          <textarea
            class="tool-code-input"
            data-diagnostics-control="known-endpoints"
            spellcheck="false"
            aria-label="${t("diagnostics.coverage.knownLabel")}"
          >${state.knownEndpoints}</textarea>
        </article>
        <article class="tool-editor-card">
          ${cardHeader(
            t("diagnostics.coverage.observedTitle"),
            t("diagnostics.coverage.observedDescription"),
          )}
          <textarea
            class="tool-code-input"
            data-diagnostics-control="observed-calls"
            spellcheck="false"
            aria-label="${t("diagnostics.coverage.observedLabel")}"
          >${state.observedCalls}</textarea>
        </article>
      </div>
      <div class="diagnostics-action-row standalone">
        ${button(
          t("diagnostics.coverage.fromSession"),
          "coverage-recorded",
          {
            icon: "activity",
            busy: state.busy === "coverage-recorded",
            disabled: Boolean(state.busy),
          },
        )}
        ${button(
          t("diagnostics.coverage.calculate"),
          "coverage-calculate",
          {
            variant: "primary",
            icon: "play",
            busy: state.busy === "coverage",
            disabled: Boolean(state.busy),
          },
        )}
        <span>${t("diagnostics.coverage.templateHint")}</span>
      </div>
      ${state.coverageResult
        ? coverageResult(state.coverageResult)
        : emptyPanel(
            "check",
            t("diagnostics.coverage.emptyTitle"),
            t("diagnostics.coverage.emptyDescription"),
          )}
    </div>
  `;
}

function pageMarkup(
  state: DiagnosticsState,
  standalonePerformance: boolean,
): TrustedHTMLFragment {
  const titleID = standalonePerformance
    ? "performance-title"
    : "diagnostics-title";
  return html`
    <section
      class="tool-page diagnostics-lab ${standalonePerformance
        ? "performance-lab"
        : ""}"
      aria-labelledby="${titleID}"
    >
      ${toolPageHeader({
        id: titleID,
        eyebrow: standalonePerformance
          ? t("diagnostics.performance.eyebrow")
          : t("diagnostics.eyebrow"),
        title: standalonePerformance
          ? t("workspace.performance.label")
          : t("diagnostics.title"),
        description: standalonePerformance
          ? t("diagnostics.performance.workspaceDescription")
          : t("diagnostics.description"),
        meta: html`
          <strong>
            ${standalonePerformance
              ? t("diagnostics.performance.benchmarkType")
              : diagnosticsModeLabel(state.mode)}
          </strong>
          <span>
            ${state.busy
              ? t("diagnostics.status.busy")
              : t("diagnostics.status.ready")}
          </span>
        `,
      })}
      ${standalonePerformance ? "" : mainTabs(state)}
      ${standalonePerformance ? "" : modeGuidance(state)}
      ${state.busy
        ? html`
            <div
              class="tool-notice tool-notice-row info diagnostics-progress"
              role="status"
              aria-live="polite"
            >
              ${icon("spinner", 14, "spin")}
              <div class="tool-notice-content">
                <strong>${t("diagnostics.status.busy")}</strong>
                <span>${t("diagnostics.status.busyDetail")}</span>
              </div>
            </div>
          `
        : ""}
      <div data-diagnostics-slot="notice">
        ${diagnosticsNotice(state.notice)}
      </div>
      <div
        id="diagnostics-panel-${state.mode}"
        role="${standalonePerformance ? "group" : "tabpanel"}"
        aria-labelledby="${standalonePerformance
          ? titleID
          : `diagnostics-tab-${state.mode}`}"
        aria-busy="${state.busy ? "true" : "false"}"
      >
        ${state.mode === "spring"
          ? springPanel(state)
          : state.mode === "jwt"
            ? jwtPanel(state)
            : state.mode === "runtime"
              ? runtimePanel(state)
              : state.mode === "performance"
                ? performancePanel(state)
                : state.mode === "environments"
                  ? environmentPanel(state)
                  : state.mode === "thread-logs"
                    ? threadAndLogsPanel(state)
                    : coveragePanel(state)}
      </div>
    </section>
  `;
}

function asyncInputSignature(state: DiagnosticsState): string {
  return JSON.stringify({
    mode: state.mode,
    actuatorURL: state.actuatorURL,
    actuatorHeaders: state.actuatorHeaders,
    actuatorTimeout: state.actuatorTimeout,
    metricNames: state.metricNames,
    includeMappings: state.includeMappings,
    performanceURL: state.performanceURL,
    performanceTimeout: state.performanceTimeout,
    performanceSampleCount: state.performanceSampleCount,
    environmentMethod: state.environmentMethod,
    environmentPath: state.environmentPath,
    environmentBody: state.environmentBody,
    environmentHeaders: state.environmentHeaders,
    environmentTimeout: state.environmentTimeout,
    environmentTargets: state.environmentTargets,
    environmentIgnorePaths: state.environmentIgnorePaths,
    allowUnsafe: state.allowUnsafe,
    threadLogMode: state.threadLogMode,
    threadDump: state.threadDump,
    logText: state.logText,
    traceQuery: state.traceQuery,
    caseSensitive: state.caseSensitive,
    knownEndpoints: state.knownEndpoints,
    observedCalls: state.observedCalls,
  });
}

/**
 * Mounts the dependency-free diagnostics workspace.
 *
 * Pending native calls are guarded by a sequence and input signature. Changing
 * a relevant input or disposing the controller invalidates the call so a late
 * backend response can never repopulate stale UI.
 */
function mountDiagnosticsWorkspace(
  root: HTMLElement,
  initialMode: DiagnosticsWorkspaceMode,
): Disposable {
  const lifecycle = new Lifecycle();
  const activityView = initialMode === "performance"
    ? "performance"
    : "diagnostics";
  const initialTab = activeRequest();
  const initialResponse = initialTab?.response;
  const state: DiagnosticsState = {
    mode: initialMode,
    busy: "",
    notice: null,
    springBody: initialResponse?.body ?? "",
    springStatus: initialResponse?.statusCode ?? 400,
    springHeaders: responseHeadersText(initialResponse),
    springAnalysis: null,
    jwtInput: "",
    jwtAnalysis: null,
    actuatorURL: "http://localhost:8080/actuator",
    actuatorHeaders: "",
    actuatorTimeout: 5_000,
    metricNames: defaultMetricNames,
    includeMappings: false,
    runtimeResult: null,
    runtimeBaseline: undefined,
    performanceURL: "http://localhost:8080/actuator/health",
    performanceTimeout: 5_000,
    performanceSampleCount: 3,
    performanceResult: null,
    performanceCompletedSamples: 0,
    performanceCanceling: false,
    environmentMethod: "GET",
    environmentPath: "/actuator/health",
    environmentBody: "",
    environmentHeaders: "Accept: application/json",
    environmentTimeout: 8_000,
    environmentTargets: [
      {
        name: t("diagnostics.environment.defaultName.local"),
        baseUrl: "http://localhost:8080",
      },
      { name: t("diagnostics.environment.defaultName.test"), baseUrl: "" },
      {
        name: t("diagnostics.environment.defaultName.staging"),
        baseUrl: "",
      },
    ],
    environmentIgnorePaths: "$.traceId\n$.timestamp\n$.requestId",
    allowUnsafe: false,
    environmentResult: null,
    threadLogMode: "thread",
    threadDump: "",
    threadResult: null,
    logText: "",
    traceQuery: "",
    caseSensitive: false,
    logResult: null,
    knownEndpoints: "",
    observedCalls: "",
    coverageResult: null,
  };
  let defaultEnvironmentNames = state.environmentTargets.map(
    (target) => target.name,
  );
  let disposed = false;
  let operationSequence = 0;
  let performanceOperationSequence = 0;
  let activePerformanceOperationID: string | undefined;
  let pendingPerformanceCancellationID: string | undefined;
  let performanceRunStartedAt: number | undefined;
  let performanceConfirmationDialog: DialogHandle | undefined;
  let pendingFocus:
    | {
        kind: "control" | "action" | "mode" | "thread-mode";
        value: string;
        selection?: {
          start: number | null;
          end: number | null;
          direction: "forward" | "backward" | "none" | null;
        };
      }
    | undefined;

  const render = () => {
    if (disposed) return;
    const active =
      document.activeElement instanceof HTMLElement &&
      root.contains(document.activeElement)
        ? document.activeElement
        : undefined;
    const focusKey = active?.dataset.diagnosticsControl
      ? {
          kind: "control" as const,
          value: [
            active.dataset.diagnosticsControl,
            active.dataset.targetIndex,
            active.dataset.targetField,
          ]
            .filter(Boolean)
            .join(":"),
        }
      : active?.dataset.diagnosticsAction
        ? {
            kind: "action" as const,
            value: active.dataset.diagnosticsAction,
          }
        : active?.dataset.diagnosticsMode
          ? {
              kind: "mode" as const,
              value: active.dataset.diagnosticsMode,
            }
          : active?.dataset.diagnosticsThreadMode
            ? {
                kind: "thread-mode" as const,
                value: active.dataset.diagnosticsThreadMode,
              }
            : undefined;
    if (focusKey) {
      pendingFocus = {
        ...focusKey,
        ...(active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLInputElement &&
          ["text", "search", "url", "tel", "password", "email"].includes(
            active.type,
          ))
          ? {
              selection: {
                start: active.selectionStart,
                end: active.selectionEnd,
                direction: active.selectionDirection,
              },
            }
          : {}),
      };
    }

    setHTML(root, pageMarkup(state, initialMode === "performance"));

    const restore = focusKey ? pendingFocus : state.busy ? undefined : pendingFocus;
    if (!restore) return;
    const candidates = root.querySelectorAll<HTMLElement>(
      [
        "[data-diagnostics-control]",
        "[data-diagnostics-action]",
        "[data-diagnostics-mode]",
        "[data-diagnostics-thread-mode]",
      ].join(","),
    );
    const replacement = [...candidates].find((element) => {
      if (restore.kind === "control") {
        return (
          [
            element.dataset.diagnosticsControl,
            element.dataset.targetIndex,
            element.dataset.targetField,
          ]
            .filter(Boolean)
            .join(":") === restore.value
        );
      }
      if (restore.kind === "action") {
        return element.dataset.diagnosticsAction === restore.value;
      }
      if (restore.kind === "mode") {
        return element.dataset.diagnosticsMode === restore.value;
      }
      return element.dataset.diagnosticsThreadMode === restore.value;
    });
    if (!replacement || replacement.matches(":disabled")) return;
    replacement.focus({ preventScroll: true });
    if (
      restore.selection &&
      (replacement instanceof HTMLInputElement ||
        replacement instanceof HTMLTextAreaElement)
    ) {
      replacement.setSelectionRange(
        restore.selection.start,
        restore.selection.end,
        restore.selection.direction ?? undefined,
      );
    }
    pendingFocus = undefined;
  };

  const cancelActivePerformanceOperation = () => {
    const operationID = activePerformanceOperationID;
    if (!operationID) return;
    activePerformanceOperationID = undefined;
    void backend.cancelToolOperation(operationID).catch(() => {
      // Invalidation already detached the UI; cancellation is best effort.
    });
  };

  const nextPerformanceOperationID = (): string => {
    performanceOperationSequence += 1;
    return `diagnostics-performance-${Date.now().toString(36)}-${performanceOperationSequence.toString(36)}`;
  };

  const invalidatePendingOperation = (): boolean => {
    const invalidatedPerformance = state.busy === "performance";
    if (
      invalidatedPerformance &&
      state.performanceResult &&
      performanceRunStartedAt !== undefined
    ) {
      state.performanceResult = {
        ...state.performanceResult,
        elapsedTimeMs: Math.max(
          0,
          window.performance.now() - performanceRunStartedAt,
        ),
      };
    }
    operationSequence += 1;
    cancelActivePerformanceOperation();
    pendingPerformanceCancellationID = undefined;
    state.performanceCanceling = false;
    if (invalidatedPerformance) performanceRunStartedAt = undefined;
    if (!state.busy) return false;
    state.busy = "";
    setWorkspaceBusy(activityView, false);
    state.notice = {
      tone: "info",
      text: t("diagnostics.operation.stale"),
    };
    return true;
  };

  const startOperation = (name: string): PendingOperation => {
    operationSequence += 1;
    const operation = {
      id: operationSequence,
      inputSignature: asyncInputSignature(state),
    };
    state.busy = name;
    setWorkspaceBusy(activityView, true);
    state.notice = null;
    render();
    return operation;
  };

  const isCurrentOperation = (operation: PendingOperation): boolean =>
    !disposed &&
    operation.id === operationSequence &&
    operation.inputSignature === asyncInputSignature(state);

  const finishOperation = (operation: PendingOperation) => {
    if (!isCurrentOperation(operation)) return;
    state.busy = "";
    setWorkspaceBusy(activityView, false);
    render();
  };

  const showValidationError = (message: string) => {
    state.notice = { tone: "error", text: message };
    render();
  };

  const confirmLargePerformanceRun = async (
    sampleCount: number,
  ): Promise<boolean> => {
    if (
      sampleCount <= urlPerformanceLimits.largeRunConfirmationSamples
    ) {
      return true;
    }
    const trigger = root.querySelector<HTMLElement>(
      '[data-diagnostics-action="performance-run"]',
    ) ?? undefined;
    performanceConfirmationDialog?.dispose();
    const dialog = presentDialog(
      html`
        <div class="dialog-header performance-confirmation-header">
          <span class="dialog-icon" aria-hidden="true">
            ${icon("warning", 17)}
          </span>
          <div>
            <h2>${t("diagnostics.performance.confirmLargeRun.title")}</h2>
            <p id="performance-large-run-description">
              ${t("diagnostics.performance.confirmLargeRun.description", {
                count: sampleCount,
              })}
            </p>
          </div>
        </div>
        <div class="performance-confirmation-note">
          ${icon("info", 15)}
          <span>${t("diagnostics.performance.confirmLargeRun.hint")}</span>
        </div>
        <div class="dialog-actions">
          <button
            type="button"
            class="button button-secondary button-md"
            data-dialog-close="cancel"
            data-performance-confirm-cancel
          >
            ${t("sidebar.cancel")}
          </button>
          <button
            type="button"
            class="button button-primary button-md"
            data-dialog-close="run"
            data-performance-confirm-run
          >
            ${icon("play", 14)}
            ${t("diagnostics.performance.confirmLargeRun.confirm", {
              count: sampleCount,
            })}
          </button>
        </div>
      `,
      {
        className: "performance-confirmation-dialog",
        trigger,
        initialFocus: "[data-performance-confirm-cancel]",
        describedBy: "performance-large-run-description",
      },
    );
    performanceConfirmationDialog = dialog;
    const choice = await dialog.closed;
    if (performanceConfirmationDialog === dialog) {
      performanceConfirmationDialog = undefined;
    }
    return !disposed && choice === "run";
  };

  const updatePerformanceProgress = () => {
    const progress = optionalElement<HTMLProgressElement>(
      root,
      "[data-performance-progress]",
    );
    if (progress) {
      progress.value = state.performanceCompletedSamples;
    }
    const label = optionalElement<HTMLElement>(
      root,
      "[data-performance-progress-label]",
    );
    if (label) {
      label.textContent = t("diagnostics.performance.progressValue", {
        completed: state.performanceCompletedSamples,
        total: state.performanceSampleCount,
      });
    }
  };

  const performanceElapsedTime = (): number | undefined =>
    performanceRunStartedAt === undefined
      ? undefined
      : Math.max(0, window.performance.now() - performanceRunStartedAt);

  const recordCurrentPerformanceElapsedTime = () => {
    const elapsedTimeMs = performanceElapsedTime();
    if (!state.performanceResult || elapsedTimeMs === undefined) return;
    state.performanceResult = {
      ...state.performanceResult,
      elapsedTimeMs,
    };
  };

  const loadActiveResponse = () => {
    const tab = activeRequest();
    const response = tab?.response;
    if (!response) {
      showValidationError(t("diagnostics.spring.noActiveResponse"));
      return;
    }
    state.springBody = response.body;
    state.springStatus = response.statusCode;
    state.springHeaders = responseHeadersText(response);
    state.springAnalysis = null;
    state.notice = {
      tone: "success",
      text: t("diagnostics.spring.responseLoaded", {
        name: tab?.name ?? t("diagnostics.spring.activeRequest"),
      }),
    };
    render();
  };

  const runSpringAnalysis = () => {
    if (!state.springBody.trim()) {
      showValidationError(t("diagnostics.spring.bodyRequired"));
      return;
    }
    try {
      const headers = parseHeaders(state.springHeaders, t);
      const normalizedHeaders = Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key, [value]]),
      );
      state.springAnalysis = localizeSpringFallbacks(
        analyzeSpringError(
          state.springBody,
          state.springStatus,
          normalizedHeaders,
        ),
        state.springBody,
        t,
      );
      state.notice = {
        tone: "success",
        text: t("diagnostics.spring.success"),
      };
    } catch (error) {
      state.springAnalysis = null;
      state.notice = { tone: "error", text: errorText(error) };
    }
    render();
  };

  const runJWTAnalysis = () => {
    try {
      state.jwtAnalysis = analyzeJWT(state.jwtInput);
      state.notice = {
        tone: "success",
        text: t("diagnostics.jwt.success"),
      };
    } catch (error) {
      state.jwtAnalysis = null;
      state.notice = {
        tone: "error",
        text: jwtErrorText(error, t),
      };
    }
    render();
  };

  const inspectRuntime = async (captureBaseline: boolean) => {
    const baseUrl = state.actuatorURL.trim();
    if (!baseUrl) {
      showValidationError(t("diagnostics.runtime.baseURLRequired"));
      return;
    }
    let headers: Record<string, string>;
    const selectedMetrics = parseList(state.metricNames);
    try {
      headers = parseHeaders(state.actuatorHeaders, t);
      if (selectedMetrics.length === 0) {
        throw new Error(t("diagnostics.runtime.metricRequired"));
      }
    } catch (error) {
      showValidationError(errorText(error));
      return;
    }
    const operation = startOperation(
      captureBaseline ? "runtime-baseline" : "runtime",
    );
    try {
      const result = await backend.inspectActuator({
        baseUrl,
        headers,
        timeoutMs: state.actuatorTimeout,
        metricNames: selectedMetrics,
        includeMappings: state.includeMappings,
        ...(!captureBaseline && state.runtimeBaseline
          ? { before: state.runtimeBaseline }
          : {}),
      });
      if (!isCurrentOperation(operation)) return;
      state.runtimeResult = result;
      const failure = resultIssue(result, t);
      if (failure) {
        state.notice = failure;
        return;
      }
      if (captureBaseline) {
        const snapshot = result.metrics;
        if (!snapshot) {
          state.notice = {
            tone: "error",
            text: t("diagnostics.runtime.noBaselineSnapshot"),
          };
          return;
        }
        state.runtimeBaseline = snapshot;
        state.notice = {
          tone: "success",
          text: t("diagnostics.runtime.baselineSuccess"),
        };
      } else {
        state.notice = {
          tone: "success",
          text: state.runtimeBaseline
            ? t("diagnostics.runtime.compareSuccess")
            : t("diagnostics.runtime.snapshotSuccess"),
        };
      }
    } catch (error) {
      if (isCurrentOperation(operation)) {
        state.notice = bridgeIssue(
          error,
          captureBaseline
            ? t("diagnostics.runtime.baselineFailure")
            : t("diagnostics.runtime.snapshotFailure"),
          t,
        );
      }
    } finally {
      finishOperation(operation);
    }
  };

  const runURLPerformanceTest = async () => {
    let targetURL: string;
    const sampleCount = state.performanceSampleCount;
    const timeoutMs = state.performanceTimeout;
    try {
      targetURL = validateURLPerformanceTarget(state.performanceURL, t);
      validateURLPerformanceOptions(sampleCount, timeoutMs, t);
    } catch (error) {
      showValidationError(errorText(error));
      return;
    }
    if (!(await confirmLargePerformanceRun(sampleCount))) return;

    state.performanceResult = null;
    state.performanceCompletedSamples = 0;
    state.performanceCanceling = false;
    const operation = startOperation("performance");
    performanceRunStartedAt = window.performance.now();
    let summary: URLPerformanceSummary | undefined;
    const recordReport = (
      report: NonNullable<NetworkInspectResult["report"]>,
      error?: string,
      failureCategory?: string,
    ) => {
      summary = appendURLPerformanceReport(
        summary,
        report,
        error,
        failureCategory,
      );
      state.performanceResult = summary;
      state.performanceCompletedSamples = summary.completedSamples;
      updatePerformanceProgress();
    };
    const recordElapsedTime = () => {
      const elapsedTimeMs = performanceElapsedTime();
      if (!summary || elapsedTimeMs === undefined) return;
      summary = {
        ...summary,
        elapsedTimeMs,
      };
      state.performanceResult = summary;
    };
    try {
      for (let index = 0; index < sampleCount; index += 1) {
        if (!isCurrentOperation(operation)) return;
        const operationID = nextPerformanceOperationID();
        activePerformanceOperationID = operationID;
        let result: NetworkInspectResult;
        try {
          result = await backend.analyzeNetwork({
            operationId: operationID,
            url: targetURL,
            timeoutMs,
            maxRedirects: 5,
            insecureSkipVerify: false,
          });
        } finally {
          if (activePerformanceOperationID === operationID) {
            activePerformanceOperationID = undefined;
          }
        }
        if (!isCurrentOperation(operation)) return;
        const toolCanceled =
          typeof result.error !== "string" &&
          result.error?.code === "tool_canceled";
        const failure = toolCanceled
          ? null
          : resultIssue(result, t, {
              title: "diagnostics.performance.errorTitle",
              message: "diagnostics.performance.failure",
              hint: "diagnostics.performance.errorHint",
            });
        const failureCategory =
          result.error && typeof result.error !== "string"
            ? result.error.code
            : result.error
              ? "network-error"
              : "no-http-response";
        const sampleFailureText = failure
          ? [...new Set([failure.text, failure.technical].filter(Boolean))].join(
              " · ",
            )
          : t("diagnostics.performance.sampleFailure");
        if (
          pendingPerformanceCancellationID === operationID ||
          toolCanceled
        ) {
          if (!toolCanceled && result.report) {
            const sampleFailed = failure || !result.report.finalStatusCode;
            recordReport(
              result.report,
              sampleFailed ? sampleFailureText : undefined,
              sampleFailed ? failureCategory : undefined,
            );
          }
          recordElapsedTime();
          pendingPerformanceCancellationID = undefined;
          state.performanceCanceling = false;
          invalidatePendingOperation();
          state.notice = {
            tone: "info",
            text: t("diagnostics.performance.canceled"),
          };
          render();
          return;
        }
        if (!result.report) {
          recordElapsedTime();
          state.performanceResult = summary ?? null;
          state.notice =
            failure ?? {
              tone: "error",
              title: t("diagnostics.performance.errorTitle"),
              text: t("diagnostics.performance.failure"),
              hint: t("diagnostics.performance.errorHint"),
            };
          return;
        }
        if (failure || !result.report.finalStatusCode) {
          recordReport(
            result.report,
            sampleFailureText,
            failureCategory,
          );
          continue;
        }
        recordReport(result.report);
      }

      if (!isCurrentOperation(operation)) return;
      recordElapsedTime();
      state.performanceResult = summary ?? null;
      state.notice = summary?.failedSamples
        ? {
            tone: "info",
            text: t("diagnostics.performance.completedWithErrors", {
              count: summary.completedSamples,
              failed: summary.failedSamples,
            }),
          }
        : {
            tone: "success",
            text: t("diagnostics.performance.success", {
              count: summary?.completedSamples ?? 0,
            }),
          };
    } catch (error) {
      if (isCurrentOperation(operation)) {
        recordElapsedTime();
        state.performanceResult = summary ?? null;
        state.notice = bridgeIssue(
          error,
          t("diagnostics.performance.failure"),
          t,
        );
      }
    } finally {
      if (isCurrentOperation(operation)) {
        pendingPerformanceCancellationID = undefined;
        state.performanceCanceling = false;
        performanceRunStartedAt = undefined;
      }
      finishOperation(operation);
    }
  };

  const stopURLPerformanceTest = async () => {
    const operationID = activePerformanceOperationID;
    if (
      state.busy !== "performance" ||
      state.performanceCanceling ||
      !operationID
    ) {
      return;
    }
    pendingPerformanceCancellationID = operationID;
    state.performanceCanceling = true;
    state.notice = null;
    render();
    try {
      const accepted = await backend.cancelToolOperation(operationID);
      if (
        disposed ||
        state.busy !== "performance" ||
        pendingPerformanceCancellationID !== operationID ||
        activePerformanceOperationID !== operationID
      ) {
        return;
      }
      if (!accepted) {
        pendingPerformanceCancellationID = undefined;
        state.performanceCanceling = false;
        recordCurrentPerformanceElapsedTime();
        state.notice = {
          tone: "error",
          title: t("diagnostics.performance.cancelRejectedTitle"),
          text: t("diagnostics.performance.cancelRejectedMessage"),
          hint: t("diagnostics.performance.cancelRejectedHint"),
        };
        render();
        return;
      }
      recordCurrentPerformanceElapsedTime();
      activePerformanceOperationID = undefined;
      pendingPerformanceCancellationID = undefined;
      state.performanceCanceling = false;
      invalidatePendingOperation();
      state.notice = {
        tone: "info",
        text: t("diagnostics.performance.canceled"),
      };
      render();
    } catch (error) {
      if (
        disposed ||
        state.busy !== "performance" ||
        pendingPerformanceCancellationID !== operationID ||
        activePerformanceOperationID !== operationID
      ) {
        return;
      }
      pendingPerformanceCancellationID = undefined;
      state.performanceCanceling = false;
      recordCurrentPerformanceElapsedTime();
      state.notice = bridgeIssue(
        error,
        t("diagnostics.performance.cancelFailure"),
        t,
      );
      render();
    }
  };

  const compareEnvironments = async () => {
    const targets = state.environmentTargets
      .map((target) => ({
        name: target.name.trim(),
        baseUrl: target.baseUrl.trim(),
      }))
      .filter((target) => target.baseUrl !== "");
    if (targets.length < 2) {
      showValidationError(t("diagnostics.environment.twoRequired"));
      return;
    }
    const unsafe = !isSafeEnvironmentMethod(state.environmentMethod);
    if (unsafe && !state.allowUnsafe) {
      showValidationError(
        t("diagnostics.environment.unsafeWarning", {
          method: state.environmentMethod,
        }),
      );
      return;
    }
    let headers: Record<string, string>;
    try {
      headers = parseHeaders(state.environmentHeaders, t);
    } catch (error) {
      showValidationError(errorText(error));
      return;
    }
    const operation = startOperation("environments");
    try {
      const result = await backend.compareEnvironments({
        method: state.environmentMethod,
        path: state.environmentPath.trim(),
        headers: Object.fromEntries(
          Object.entries(headers).map(([key, value]) => [key, [value]]),
        ),
        body: state.environmentBody,
        targets,
        ignoreJsonPaths: parseList(state.environmentIgnorePaths),
        ignoreHeaders: [],
        allowUnsafe: state.allowUnsafe,
        timeoutMs: state.environmentTimeout,
      });
      if (!isCurrentOperation(operation)) return;
      state.environmentResult = result;
      state.notice =
        resultIssue(result, t) ?? {
          tone: "success",
          text: t("diagnostics.environment.success", {
            count: targets.length,
          }),
        };
    } catch (error) {
      if (isCurrentOperation(operation)) {
        state.notice = bridgeIssue(
          error,
          t("diagnostics.environment.failure"),
          t,
        );
      }
    } finally {
      finishOperation(operation);
    }
  };

  const analyzeThreads = async () => {
    if (!state.threadDump.trim()) {
      showValidationError(t("diagnostics.thread.required"));
      return;
    }
    const operation = startOperation("thread");
    try {
      const result = await backend.analyzeThreadDump({
        text: state.threadDump,
      });
      if (!isCurrentOperation(operation)) return;
      state.threadResult = result;
      state.notice =
        resultIssue(result, t) ?? {
          tone: "success",
          text: t("diagnostics.thread.success", {
            count: result.threadCount ?? 0,
          }),
        };
    } catch (error) {
      if (isCurrentOperation(operation)) {
        state.notice = bridgeIssue(
          error,
          t("diagnostics.thread.failure"),
          t,
        );
      }
    } finally {
      finishOperation(operation);
    }
  };

  const searchLogs = async () => {
    if (!state.logText.trim() || !state.traceQuery.trim()) {
      showValidationError(t("diagnostics.log.required"));
      return;
    }
    const operation = startOperation("logs");
    try {
      const result = await backend.searchTraceLog({
        text: state.logText,
        query: state.traceQuery.trim(),
        caseSensitive: state.caseSensitive,
      });
      if (!isCurrentOperation(operation)) return;
      state.logResult = result;
      state.notice =
        resultIssue(result, t) ?? {
          tone: "success",
          text: t("diagnostics.log.success", {
            count: result.matches?.length ?? 0,
          }),
        };
    } catch (error) {
      if (isCurrentOperation(operation)) {
        state.notice = bridgeIssue(
          error,
          t("diagnostics.log.failure"),
          t,
        );
      }
    } finally {
      finishOperation(operation);
    }
  };

  const analyzeCoverage = async () => {
    let known: CoverageInput["known"];
    let observed: CoverageInput["observed"];
    try {
      known = parseKnownEndpoints(state.knownEndpoints, t);
      observed = parseObservedCalls(state.observedCalls, t);
      if (known.length === 0) {
        throw new Error(t("diagnostics.coverage.knownRequired"));
      }
    } catch (error) {
      showValidationError(errorText(error));
      return;
    }
    const operation = startOperation("coverage");
    try {
      const result = await backend.analyzeEndpointCoverage({
        known,
        observed,
      });
      if (!isCurrentOperation(operation)) return;
      state.coverageResult = result;
      state.notice =
        resultIssue(result, t) ?? {
          tone: "success",
          text: t("diagnostics.coverage.success", {
            covered: result.covered ?? 0,
            total: result.totalKnown ?? 0,
          }),
        };
    } catch (error) {
      if (isCurrentOperation(operation)) {
        state.notice = bridgeIssue(
          error,
          t("diagnostics.coverage.failure"),
          t,
        );
      }
    } finally {
      finishOperation(operation);
    }
  };

  const analyzeRecordedCoverage = async () => {
    const operation = startOperation("coverage-recorded");
    try {
      const result = await backend.analyzeEndpointCoverage({
        known: [],
        observed: [],
      });
      if (!isCurrentOperation(operation)) return;
      state.coverageResult = result;
      state.notice =
        resultIssue(result, t) ?? {
          tone: "success",
          text: t("diagnostics.coverage.sessionSuccess", {
            covered: result.covered ?? 0,
            total: result.totalKnown ?? 0,
          }),
        };
    } catch (error) {
      if (isCurrentOperation(operation)) {
        state.notice = bridgeIssue(
          error,
          t("diagnostics.coverage.sessionFailure"),
          t,
        );
      }
    } finally {
      finishOperation(operation);
    }
  };

  const selectMode = (mode: DiagnosticsMode, focus = false) => {
    if (mode !== state.mode) {
      const stale = invalidatePendingOperation();
      state.mode = mode;
      if (!stale) state.notice = null;
      render();
    }
    if (focus) {
      optionalElement<HTMLButtonElement>(
        root,
        `[data-diagnostics-mode="${mode}"]`,
      )?.focus();
    }
  };

  const selectThreadMode = (mode: ThreadLogMode, focus = false) => {
    if (mode !== state.threadLogMode) {
      const stale = invalidatePendingOperation();
      state.threadLogMode = mode;
      if (!stale) state.notice = null;
      render();
    }
    if (focus) {
      optionalElement<HTMLButtonElement>(
        root,
        `[data-diagnostics-thread-mode="${mode}"]`,
      )?.focus();
    }
  };

  const clearRuntimeInputResult = (): boolean => {
    const changed = Boolean(
      state.runtimeResult || state.runtimeBaseline || state.notice || state.busy,
    );
    state.runtimeResult = null;
    state.runtimeBaseline = undefined;
    state.notice = null;
    return invalidatePendingOperation() || changed;
  };

  const clearPerformanceInputResult = (): boolean => {
    const changed = Boolean(
      state.performanceResult ||
        state.performanceCompletedSamples ||
        state.notice ||
        state.busy,
    );
    state.performanceResult = null;
    state.performanceCompletedSamples = 0;
    state.notice = null;
    return invalidatePendingOperation() || changed;
  };

  const clearEnvironmentInputResult = (): boolean => {
    const changed = Boolean(
      state.environmentResult || state.notice || state.busy,
    );
    state.environmentResult = null;
    state.notice = null;
    return invalidatePendingOperation() || changed;
  };

  const clearThreadInputResult = (): boolean => {
    const changed = Boolean(state.threadResult || state.notice || state.busy);
    state.threadResult = null;
    state.notice = null;
    return invalidatePendingOperation() || changed;
  };

  const clearLogInputResult = (): boolean => {
    const changed = Boolean(state.logResult || state.notice || state.busy);
    state.logResult = null;
    state.notice = null;
    return invalidatePendingOperation() || changed;
  };

  const clearCoverageInputResult = (): boolean => {
    const changed = Boolean(state.coverageResult || state.notice || state.busy);
    state.coverageResult = null;
    state.notice = null;
    return invalidatePendingOperation() || changed;
  };

  const handleControl = (event: Event) => {
    const element = event.target;
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      )
    ) {
      return;
    }
    const control = element.dataset.diagnosticsControl;
    if (!control) return;
    let shouldRender = false;

    switch (control) {
      case "spring-body":
        shouldRender = Boolean(state.springAnalysis || state.notice);
        state.springBody = element.value;
        state.springAnalysis = null;
        state.notice = null;
        break;
      case "spring-status":
        shouldRender = Boolean(state.springAnalysis || state.notice);
        state.springStatus = Number(element.value) || 0;
        state.springAnalysis = null;
        state.notice = null;
        break;
      case "spring-headers":
        shouldRender = Boolean(state.springAnalysis || state.notice);
        state.springHeaders = element.value;
        state.springAnalysis = null;
        state.notice = null;
        break;
      case "jwt-input":
        shouldRender = Boolean(state.jwtAnalysis || state.notice);
        state.jwtInput = element.value;
        state.jwtAnalysis = null;
        state.notice = null;
        break;
      case "actuator-url":
        state.actuatorURL = element.value;
        shouldRender = clearRuntimeInputResult();
        break;
      case "actuator-headers":
        state.actuatorHeaders = element.value;
        shouldRender = clearRuntimeInputResult();
        break;
      case "actuator-timeout": {
        const timeout = Math.max(
          1,
          Math.min(30_000, Number(element.value) || 1),
        );
        state.actuatorTimeout = timeout;
        element.value = String(timeout);
        shouldRender = clearRuntimeInputResult();
        break;
      }
      case "metric-names":
        state.metricNames = element.value;
        shouldRender = clearRuntimeInputResult();
        break;
      case "include-mappings":
        if (element instanceof HTMLInputElement) {
          state.includeMappings = element.checked;
          shouldRender = clearRuntimeInputResult();
        }
        break;
      case "performance-url":
        state.performanceURL = element.value;
        shouldRender = clearPerformanceInputResult();
        break;
      case "performance-timeout": {
        const timeout = Number(element.value);
        state.performanceTimeout = Number.isFinite(timeout) ? timeout : 0;
        shouldRender = clearPerformanceInputResult();
        break;
      }
      case "performance-samples": {
        const samples = Number(element.value);
        state.performanceSampleCount = Number.isFinite(samples) ? samples : 0;
        shouldRender = clearPerformanceInputResult();
        break;
      }
      case "environment-method":
        state.environmentMethod = element.value;
        if (isSafeEnvironmentMethod(element.value)) {
          state.allowUnsafe = false;
        }
        clearEnvironmentInputResult();
        shouldRender = true;
        break;
      case "environment-path":
        state.environmentPath = element.value;
        shouldRender = clearEnvironmentInputResult();
        break;
      case "environment-body":
        state.environmentBody = element.value;
        shouldRender = clearEnvironmentInputResult();
        break;
      case "environment-headers":
        state.environmentHeaders = element.value;
        shouldRender = clearEnvironmentInputResult();
        break;
      case "environment-ignore-paths":
        state.environmentIgnorePaths = element.value;
        shouldRender = clearEnvironmentInputResult();
        break;
      case "environment-timeout": {
        const timeout = Math.max(
          1,
          Math.min(30_000, Number(element.value) || 1),
        );
        state.environmentTimeout = timeout;
        element.value = String(timeout);
        shouldRender = clearEnvironmentInputResult();
        break;
      }
      case "environment-target": {
        const index = Number(element.dataset.targetIndex);
        const field = element.dataset.targetField;
        const target = state.environmentTargets[index];
        if (target && (field === "name" || field === "baseUrl")) {
          target[field] = element.value;
          shouldRender = clearEnvironmentInputResult();
        }
        break;
      }
      case "allow-unsafe":
        if (element instanceof HTMLInputElement) {
          state.allowUnsafe = element.checked;
          clearEnvironmentInputResult();
          shouldRender = true;
        }
        break;
      case "thread-dump":
        state.threadDump = element.value;
        shouldRender = clearThreadInputResult();
        break;
      case "log-text":
        state.logText = element.value;
        shouldRender = clearLogInputResult();
        break;
      case "trace-query":
        state.traceQuery = element.value;
        shouldRender = clearLogInputResult();
        break;
      case "case-sensitive":
        if (element instanceof HTMLInputElement) {
          state.caseSensitive = element.checked;
          shouldRender = clearLogInputResult();
        }
        break;
      case "known-endpoints":
        state.knownEndpoints = element.value;
        shouldRender = clearCoverageInputResult();
        break;
      case "observed-calls":
        state.observedCalls = element.value;
        shouldRender = clearCoverageInputResult();
        break;
    }
    if (shouldRender) render();
  };

  lifecycle.listen(root, "input", handleControl);
  lifecycle.listen(root, "change", handleControl);

  delegate(
    lifecycle,
    root,
    "click",
    "[data-diagnostics-mode]",
    (_event, element) => {
      const mode = element.dataset.diagnosticsMode as
        | DiagnosticsMode
        | undefined;
      if (mode && diagnosticsModes.includes(mode)) selectMode(mode);
    },
  );

  delegate(
    lifecycle,
    root,
    "keydown",
    "[data-diagnostics-mode]",
    (event, element) => {
      const modes = modeDefinitions();
      const current = modes.findIndex(
        (item) => item.id === element.dataset.diagnosticsMode,
      );
      if (current < 0) return;
      let next: number | undefined;
      if (event.key === "ArrowRight") next = (current + 1) % modes.length;
      if (event.key === "ArrowLeft") {
        next = (current - 1 + modes.length) % modes.length;
      }
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = modes.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      const nextMode = modes[next];
      if (nextMode) selectMode(nextMode.id, true);
    },
  );

  delegate(
    lifecycle,
    root,
    "click",
    "[data-diagnostics-thread-mode]",
    (_event, element) => {
      const mode = element.dataset.diagnosticsThreadMode as
        | ThreadLogMode
        | undefined;
      if (mode === "thread" || mode === "logs") selectThreadMode(mode);
    },
  );

  delegate(
    lifecycle,
    root,
    "keydown",
    "[data-diagnostics-thread-mode]",
    (event, element) => {
      const modes: readonly ThreadLogMode[] = ["thread", "logs"];
      const current = modes.indexOf(
        element.dataset.diagnosticsThreadMode as ThreadLogMode,
      );
      if (current < 0) return;
      let next: number | undefined;
      if (event.key === "ArrowRight") next = (current + 1) % modes.length;
      if (event.key === "ArrowLeft") {
        next = (current - 1 + modes.length) % modes.length;
      }
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = modes.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      const nextMode = modes[next];
      if (nextMode) selectThreadMode(nextMode, true);
    },
  );

  lifecycle.listen(root, "click", (event) => {
    const action = eventElement<HTMLElement>(
      event,
      "[data-diagnostics-action]",
    )?.dataset.diagnosticsAction;
    switch (action) {
      case "load-active-response":
        loadActiveResponse();
        break;
      case "analyze-spring":
        runSpringAnalysis();
        break;
      case "analyze-jwt":
        runJWTAnalysis();
        break;
      case "runtime-baseline":
        void inspectRuntime(true);
        break;
      case "runtime-snapshot":
        void inspectRuntime(false);
        break;
      case "clear-runtime-baseline":
        state.runtimeBaseline = undefined;
        state.notice = {
          tone: "info",
          text: t("diagnostics.runtime.baselineCleared"),
        };
        render();
        break;
      case "performance-run":
        void runURLPerformanceTest();
        break;
      case "performance-stop":
        void stopURLPerformanceTest();
        break;
      case "compare-environments":
        void compareEnvironments();
        break;
      case "analyze-threads":
        void analyzeThreads();
        break;
      case "use-active-trace":
        state.traceQuery = activeRequest()?.response?.traceId ?? "";
        state.logResult = null;
        state.notice = null;
        invalidatePendingOperation();
        render();
        break;
      case "search-logs":
        void searchLogs();
        break;
      case "coverage-recorded":
        void analyzeRecordedCoverage();
        break;
      case "coverage-calculate":
        void analyzeCoverage();
        break;
    }
  });

  lifecycle.add(
    subscribeLocale(() => {
      const stale = invalidatePendingOperation();
      if (!stale) state.notice = null;
      const nextDefaultEnvironmentNames = [
        t("diagnostics.environment.defaultName.local"),
        t("diagnostics.environment.defaultName.test"),
        t("diagnostics.environment.defaultName.staging"),
      ];
      state.environmentTargets = state.environmentTargets.map(
        (target, index) => ({
          ...target,
          name:
            target.name === defaultEnvironmentNames[index]
              ? (nextDefaultEnvironmentNames[index] ?? target.name)
              : target.name,
        }),
      );
      defaultEnvironmentNames = nextDefaultEnvironmentNames;
      if (state.springAnalysis && state.springBody.trim()) {
        try {
          const headers = parseHeaders(state.springHeaders, t);
          const normalizedHeaders = Object.fromEntries(
            Object.entries(headers).map(([key, value]) => [key, [value]]),
          );
          state.springAnalysis = localizeSpringFallbacks(
            analyzeSpringError(
              state.springBody,
              state.springStatus,
              normalizedHeaders,
            ),
            state.springBody,
            t,
          );
        } catch {
          state.springAnalysis = null;
        }
      }
      render();
    }),
  );
  lifecycle.add(
    workspaceStore.subscribe(() => {
      render();
    }),
  );
  lifecycle.add(() => {
    setWorkspaceBusy(activityView, false);
    performanceConfirmationDialog?.dispose();
    performanceConfirmationDialog = undefined;
    cancelActivePerformanceOperation();
    disposed = true;
    operationSequence += 1;
    root.replaceChildren();
  });

  render();
  return lifecycle;
}

export function mountDiagnosticsLab(root: HTMLElement): Disposable {
  return mountDiagnosticsWorkspace(root, "spring");
}

export function mountPerformanceLab(root: HTMLElement): Disposable {
  return mountDiagnosticsWorkspace(root, "performance");
}
