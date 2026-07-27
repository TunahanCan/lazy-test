import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Bug,
  CheckCircle2,
  ClipboardPaste,
  FileSearch,
  Gauge,
  KeyRound,
  ListChecks,
  LoaderCircle,
  Network,
  Play,
  Search,
  ServerCog,
  ShieldAlert,
  TerminalSquare,
} from "lucide-react";
import { Button, ToolTabs } from "../../shared/ui";
import { useLocale, useTranslation } from "../../i18n";
import type { Translate } from "../../i18n/LocaleProvider";
import { backend } from "../../lib/backend";
import {
  analyzeJWT,
  analyzeSpringError,
  type JWTAnalysis,
  type SpringErrorAnalysis,
} from "../../lib/developerTools";
import type {
  ActuatorInspectResult,
  ActuatorMetricSnapshot,
  CoverageInput,
  CoverageResult,
  EnvironmentCompareResult,
  LogSearchResult,
  ThreadDumpResult,
} from "../../lib/types";
import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspace";
import {
  bridgeIssue,
  componentStatus,
  defaultMetricNames,
  diagnosticsModes,
  environmentMethods,
  errorText,
  formatEnvironmentDuration,
  formatEpoch,
  formatUnknown,
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
  type DiagnosticsMode,
  type DiagnosticsNotice,
  type PendingOperation,
} from "./model";

const modeIcons: Record<
  DiagnosticsMode,
  ComponentType<{ size?: number; "aria-hidden"?: boolean }>
> = {
  spring: Bug,
  jwt: KeyRound,
  runtime: Gauge,
  environments: ArrowLeftRight,
  "thread-logs": TerminalSquare,
  coverage: ListChecks,
};

function diagnosticsModeLabel(mode: DiagnosticsMode, t: Translate): string {
  const keys = {
    spring: "diagnostics.mode.spring",
    jwt: "diagnostics.mode.jwt",
    runtime: "diagnostics.mode.runtime",
    environments: "diagnostics.mode.environments",
    "thread-logs": "diagnostics.mode.threadLogs",
    coverage: "diagnostics.mode.coverage",
  } as const;
  return t(keys[mode]);
}

function springCategoryLabel(
  category: SpringErrorAnalysis["category"],
  t: Translate,
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
  return t(keys[category]);
}

function environmentChangeLabel(kind: string | undefined, t: Translate) {
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

function Notice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  return (
    <div
      className={cn("tool-notice", "tool-notice-row", tone !== "info" && tone)}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "error" ? (
        <AlertTriangle size={14} aria-hidden />
      ) : tone === "success" ? (
        <CheckCircle2 size={14} aria-hidden />
      ) : (
        <Activity size={14} aria-hidden />
      )}
      {children}
    </div>
  );
}

function EmptyResult({
  icon: Icon = FileSearch,
  title,
  description,
}: {
  icon?: ComponentType<{ size?: number }>;
  title: string;
  description: string;
}) {
  return (
    <div className="tool-empty-result">
      <Icon size={24} aria-hidden />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function BusyIcon({ active }: { active: boolean }) {
  return active ? (
    <LoaderCircle className="spin" size={14} aria-hidden />
  ) : (
    <Play size={14} aria-hidden />
  );
}

function SpringResult({ analysis }: { analysis: SpringErrorAnalysis }) {
  const t = useTranslation();
  const advice = springAdvice(analysis, t);

  return (
    <div className="diagnostics-result-stack">
      <article className="tool-panel diagnostics-panel-padded">
        <div className="diagnostics-summary-row">
          <span className={cn("diagnostics-status", analysis.status >= 500 && "danger")}>
            HTTP {analysis.status || "—"}
          </span>
          <div>
            <strong>{analysis.title}</strong>
            <p>{analysis.detail}</p>
          </div>
        </div>
        <dl className="diagnostics-facts">
          <div>
            <dt>{t("diagnostics.spring.category")}</dt>
            <dd>{springCategoryLabel(analysis.category, t)}</dd>
          </div>
          <div>
            <dt>{t("diagnostics.spring.format")}</dt>
            <dd>
              {analysis.recognized
                ? t("diagnostics.spring.recognized")
                : t("diagnostics.spring.genericResponse")}
            </dd>
          </div>
          <div>
            <dt>{t("diagnostics.spring.traceRequestID")}</dt>
            <dd>{analysis.traceId ?? t("diagnostics.spring.notFound")}</dd>
          </div>
          <div>
            <dt>{t("diagnostics.spring.exception")}</dt>
            <dd>
              {analysis.exception ?? t("diagnostics.spring.exceptionMissing")}
            </dd>
          </div>
          <div>
            <dt>{t("diagnostics.spring.instance")}</dt>
            <dd>{analysis.instance ?? "—"}</dd>
          </div>
        </dl>
      </article>

      {analysis.fieldErrors.length > 0 && (
        <article className="tool-panel">
          <div className="tool-card-header">
            <div>
              <strong>{t("diagnostics.spring.beanValidation")}</strong>
              <span>
                {t("diagnostics.spring.fieldCount", {
                  count: analysis.fieldErrors.length,
                })}
              </span>
            </div>
          </div>
          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table">
              <thead>
                <tr>
                  <th>{t("diagnostics.spring.field")}</th>
                  <th>{t("diagnostics.spring.message")}</th>
                  <th>{t("diagnostics.spring.rejectedValue")}</th>
                </tr>
              </thead>
              <tbody>
                {analysis.fieldErrors.map((item, index) => (
                  <tr key={`${item.field}-${index}`}>
                    <td><code>{item.field}</code></td>
                    <td>{item.message}</td>
                    <td><code>{formatUnknown(item.rejectedValue)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      <article className="tool-panel diagnostics-panel-padded">
        <strong>{t("diagnostics.spring.checklist")}</strong>
        <ul className="diagnostics-advice">
          {advice.map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>
      </article>
    </div>
  );
}

function JWTResult({ analysis }: { analysis: JWTAnalysis }) {
  const { locale, t } = useLocale();
  return (
    <div className="diagnostics-result-stack">
      <Notice tone="info">
        {t("diagnostics.jwt.localWarning")}
      </Notice>
      <article className="tool-panel diagnostics-panel-padded">
        <div className="diagnostics-summary-row">
          {analysis.active ? (
            <CheckCircle2 size={22} color="var(--success)" aria-hidden />
          ) : (
            <ShieldAlert size={22} color="var(--danger)" aria-hidden />
          )}
          <div>
            <strong>
              {analysis.active
                ? t("diagnostics.jwt.active")
                : t("diagnostics.jwt.inactive")}
            </strong>
            <p>
              {analysis.expired
                ? t("diagnostics.jwt.expired")
                : analysis.signaturePresent
                  ? t("diagnostics.jwt.signaturePresent")
                  : t("diagnostics.jwt.signatureMissing")}
            </p>
          </div>
        </div>
        <dl className="diagnostics-facts">
          <div><dt>{t("diagnostics.jwt.algorithm")}</dt><dd>{analysis.algorithm ?? "—"}</dd></div>
          <div><dt>{t("diagnostics.jwt.subject")}</dt><dd>{analysis.subject ?? "—"}</dd></div>
          <div><dt>{t("diagnostics.jwt.issuer")}</dt><dd>{analysis.issuer ?? "—"}</dd></div>
          <div><dt>{t("diagnostics.jwt.audience")}</dt><dd>{analysis.audience.join(", ") || "—"}</dd></div>
          <div><dt>{t("diagnostics.jwt.issuedAt")}</dt><dd>{formatEpoch(analysis.issuedAt, locale)}</dd></div>
          <div><dt>{t("diagnostics.jwt.expires")}</dt><dd>{formatEpoch(analysis.expiresAt, locale)}</dd></div>
          <div><dt>{t("diagnostics.jwt.notBefore")}</dt><dd>{formatEpoch(analysis.notBefore, locale)}</dd></div>
        </dl>
      </article>
      <div className="diagnostics-two-column">
        <article className="tool-panel diagnostics-panel-padded">
          <strong>{t("diagnostics.jwt.roles")}</strong>
          <div className="diagnostics-chip-list">
            {analysis.roles.length > 0
              ? analysis.roles.map((role) => <code key={role}>{role}</code>)
              : <span>{t("diagnostics.jwt.noRoles")}</span>}
          </div>
        </article>
        <article className="tool-panel diagnostics-panel-padded">
          <strong>{t("diagnostics.jwt.scopes")}</strong>
          <div className="diagnostics-chip-list">
            {analysis.scopes.length > 0
              ? analysis.scopes.map((scope) => <code key={scope}>{scope}</code>)
              : <span>{t("diagnostics.jwt.noScopes")}</span>}
          </div>
        </article>
      </div>
      <details className="tool-panel diagnostics-details">
        <summary>{t("diagnostics.jwt.details")}</summary>
        <pre>{JSON.stringify({ header: analysis.header, payload: analysis.payload }, null, 2)}</pre>
      </details>
    </div>
  );
}

function RuntimeResult({
  result,
  baseline,
}: {
  result: ActuatorInspectResult;
  baseline?: ActuatorMetricSnapshot;
}) {
  const { locale, t } = useLocale();
  const snapshot = result.metrics;
  const metrics = Object.entries(snapshot.metrics);
  const deltas = result.deltas;
  const components = Object.entries(result.health?.components ?? {});
  const mappingContexts = Object.keys(
    result.mappings?.contexts ??
      (result.mappings?.data?.contexts as Record<string, unknown> | undefined) ??
      {},
  );

  return (
    <div className="diagnostics-result-stack">
      <div className="diagnostics-runtime-cards">
        <article className="tool-panel diagnostics-panel-padded">
          <span className="tool-eyebrow">
            {t("diagnostics.runtime.healthEyebrow")}
          </span>
          <strong className="diagnostics-big-value">
            {result.health?.status ?? t("diagnostics.runtime.unknown")}
          </strong>
          <span>
            {t("diagnostics.runtime.components", { count: components.length })}
          </span>
        </article>
        <article className="tool-panel diagnostics-panel-padded">
          <span className="tool-eyebrow">
            {t("diagnostics.runtime.metricsEyebrow")}
          </span>
          <strong className="diagnostics-big-value">{metrics.length}</strong>
          <span>
            {snapshot?.capturedAt
              ? new Date(snapshot.capturedAt).toLocaleTimeString(locale)
              : t("diagnostics.runtime.noSnapshotTime")}
          </span>
        </article>
        <article className="tool-panel diagnostics-panel-padded">
          <span className="tool-eyebrow">
            {t("diagnostics.runtime.baselineEyebrow")}
          </span>
          <strong className="diagnostics-big-value">
            {baseline
              ? t("diagnostics.runtime.deltaCount", { count: deltas.length })
              : t("diagnostics.runtime.none")}
          </strong>
          <span>
            {baseline
              ? t("diagnostics.runtime.comparison")
              : t("diagnostics.runtime.baselineHint")}
          </span>
        </article>
        <article className="tool-panel diagnostics-panel-padded">
          <span className="tool-eyebrow">
            {t("diagnostics.runtime.mappingsEyebrow")}
          </span>
          <strong className="diagnostics-big-value">
            {result.mappings
              ? mappingContexts.length
              : t("diagnostics.runtime.disabled")}
          </strong>
          <span>
            {result.mappings
              ? t("diagnostics.runtime.applicationContext")
              : t("diagnostics.runtime.notRequested")}
          </span>
        </article>
      </div>

      {components.length > 0 && (
        <article className="tool-panel">
          <div className="tool-card-header">
            <div>
              <strong>{t("diagnostics.runtime.healthComponents")}</strong>
              <span>{t("diagnostics.runtime.healthDescription")}</span>
            </div>
          </div>
          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table">
              <thead>
                <tr>
                  <th>{t("diagnostics.runtime.component")}</th>
                  <th>{t("diagnostics.runtime.status")}</th>
                </tr>
              </thead>
              <tbody>
                {components.map(([name, value]) => (
                  <tr key={name}>
                    <td><code>{name}</code></td>
                    <td>{componentStatus(value, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {metrics.length > 0 && (
        <article className="tool-panel">
          <div className="tool-card-header">
            <div>
              <strong>{t("diagnostics.runtime.metricSnapshot")}</strong>
              <span>{t("diagnostics.runtime.metricDescription")}</span>
            </div>
          </div>
          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table">
              <thead>
                <tr>
                  <th>{t("diagnostics.runtime.metric")}</th>
                  <th>{t("diagnostics.runtime.statistic")}</th>
                  <th>{t("diagnostics.runtime.value")}</th>
                  <th>{t("diagnostics.runtime.unit")}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.flatMap(([name, sample]) => {
                  const measurements = Object.entries(sample.measurements ?? {});
                  return (measurements.length > 0 ? measurements : [["—", Number.NaN] as const]).map(
                    ([statistic, value]) => (
                      <tr key={`${name}-${statistic}`}>
                        <td title={sample.description}><code>{name}</code></td>
                        <td>{statistic}</td>
                        <td>
                          {Number.isFinite(value)
                            ? value.toLocaleString(locale, {
                                maximumFractionDigits: 3,
                              })
                            : t("diagnostics.runtime.noMeasurement")}
                        </td>
                        <td>{sample.baseUnit ?? "—"}</td>
                      </tr>
                    ),
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {deltas.length > 0 && (
        <article className="tool-panel">
          <div className="tool-card-header">
            <div>
              <strong>{t("diagnostics.runtime.baselineDifference")}</strong>
              <span>
                {t("diagnostics.runtime.baselineDifferenceDescription")}
              </span>
            </div>
          </div>
          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table">
              <thead>
                <tr>
                  <th>{t("diagnostics.runtime.metric")}</th>
                  <th>{t("diagnostics.runtime.before")}</th>
                  <th>{t("diagnostics.runtime.after")}</th>
                  <th>{t("diagnostics.runtime.delta")}</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {deltas.map((delta) => (
                  <tr key={`${delta.metric}-${delta.statistic}`}>
                    <td><code>{delta.metric} · {delta.statistic}</code></td>
                    <td>{delta.before?.toLocaleString(locale) ?? "—"}</td>
                    <td>{delta.after?.toLocaleString(locale) ?? "—"}</td>
                    <td>{delta.delta?.toLocaleString(locale) ?? "—"}</td>
                    <td>
                      {delta.percentChange === undefined
                        ? "—"
                        : `${delta.percentChange.toLocaleString(locale, {
                            maximumFractionDigits: 1,
                          })}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {snapshot?.failures && Object.keys(snapshot.failures).length > 0 && (
        <Notice tone="info">
          {t("diagnostics.runtime.metricFailures", {
            names: Object.keys(snapshot.failures).join(", "),
          })}
        </Notice>
      )}
    </div>
  );
}

function EnvironmentResult({ result }: { result: EnvironmentCompareResult }) {
  const { locale, t } = useLocale();
  const responses = result.responses ?? [];
  const comparisons = result.comparisons ?? [];
  return (
    <div className="diagnostics-result-stack">
      <div className="diagnostics-runtime-cards">
        {responses.map((response, index) => (
          <article
            className="tool-panel diagnostics-panel-padded"
            key={`${response.name}-${index}`}
          >
            <span className="tool-eyebrow">
              {response.name ||
                t("diagnostics.environment.shortLabel", {
                  number: index + 1,
                })}
            </span>
            <strong className="diagnostics-big-value">
              {response.error
                ? t("diagnostics.environment.error")
                : response.statusCode || "—"}
            </strong>
            <span>{formatEnvironmentDuration(response, locale)}</span>
            <small title={response.url}>
              {response.url || t("diagnostics.environment.missingURL")}
            </small>
            {response.truncated && (
              <span>{t("diagnostics.environment.bodyTruncated")}</span>
            )}
            {response.error && <span className="diagnostics-error-text">{response.error}</span>}
          </article>
        ))}
      </div>

      {comparisons.length > 0 ? (
        comparisons.map((comparison, index) => (
          <article className="tool-panel" key={`${comparison.candidate}-${index}`}>
            <div className="tool-card-header">
              <div>
                <strong>
                  {comparison.baseline ||
                    t("diagnostics.environment.defaultBaseline")}{" "}
                  →{" "}
                  {comparison.candidate ||
                    t("diagnostics.environment.defaultCandidate")}
                </strong>
                <span>
                  {t("diagnostics.environment.summary", {
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
                className={cn(
                  "diagnostics-status",
                  (!comparison.statusMatch || !comparison.bodyEqual) && "danger",
                )}
              >
                {comparison.statusMatch && comparison.bodyEqual
                  ? t("diagnostics.environment.matched")
                  : t("diagnostics.environment.hasDifference")}
              </span>
            </div>
            {comparison.error ? (
              <div className="diagnostics-error-text diagnostics-error-block">
                {comparison.error}
              </div>
            ) : (
              <div className="diagnostics-comparison-body">
                <dl className="diagnostics-facts">
                  <div>
                    <dt>{t("diagnostics.environment.status")}</dt>
                    <dd>{comparison.baselineStatus ?? "—"} → {comparison.candidateStatus ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("diagnostics.environment.bodyMode")}</dt>
                    <dd>{comparison.bodyMode ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("diagnostics.environment.headerDifference")}</dt>
                    <dd>
                      {comparison.headerDifferences?.join(", ") ||
                        t("diagnostics.environment.noDifference")}
                      {comparison.headerDifferencesTruncated &&
                        t("diagnostics.environment.firstDifferences")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("diagnostics.environment.jsonDifference")}</dt>
                    <dd>
                      {comparison.jsonDifferences?.length ?? 0}
                      {comparison.jsonDifferencesTruncated &&
                        t("diagnostics.environment.resultsLimited")}
                    </dd>
                  </div>
                </dl>
                {(comparison.jsonDifferences?.length ?? 0) > 0 && (
                  <div className="diagnostics-table-wrap">
                    <table className="diagnostics-table">
                      <thead>
                        <tr>
                          <th>{t("diagnostics.environment.path")}</th>
                          <th>{t("diagnostics.environment.type")}</th>
                          <th>
                            {t("diagnostics.environment.baselineColumn")}
                          </th>
                          <th>
                            {t("diagnostics.environment.environmentColumn")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.jsonDifferences!.map((difference, differenceIndex) => (
                          <tr key={`${difference.path}-${differenceIndex}`}>
                            <td><code>{difference.path ?? "$"}</code></td>
                            <td>
                              {environmentChangeLabel(difference.kind, t)}
                            </td>
                            <td><code>{formatUnknown(difference.baseline)}</code></td>
                            <td><code>{formatUnknown(difference.candidate)}</code></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </article>
        ))
      ) : (
        <EmptyResult
          icon={ArrowLeftRight}
          title={t("diagnostics.environment.emptyTitle")}
          description={t("diagnostics.environment.emptyDescription")}
        />
      )}

      {responses.map((response, index) => (
        <details
          className="tool-panel diagnostics-details"
          key={`body-${response.name}-${index}`}
        >
          <summary>
            {t("diagnostics.environment.responseBody", {
              name:
                response.name ||
                t("diagnostics.environment.legend", { number: index + 1 }),
            })}
          </summary>
          <pre>
            {response.body ||
              response.error ||
              t("diagnostics.environment.emptyBody")}
          </pre>
        </details>
      ))}
    </div>
  );
}

function ThreadDumpResultView({ result }: { result: ThreadDumpResult }) {
  const t = useTranslation();
  const states = Object.entries(result.stateCounts ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return (
    <div className="diagnostics-result-stack">
      {result.deadlockDetected && (
        <Notice tone="error">
          {t("diagnostics.thread.deadlockWarning")}
        </Notice>
      )}
      <div className="diagnostics-runtime-cards">
        <article className="tool-panel diagnostics-panel-padded">
          <span className="tool-eyebrow">
            {t("diagnostics.thread.eyebrow")}
          </span>
          <strong className="diagnostics-big-value">{result.threadCount ?? 0}</strong>
          <span>
            {result.truncated
              ? t("diagnostics.thread.limited")
              : t("diagnostics.thread.complete")}
          </span>
        </article>
        {states.map(([state, count]) => (
          <article
            className="tool-panel diagnostics-panel-padded"
            key={state}
          >
            <span className="tool-eyebrow">{state}</span>
            <strong className="diagnostics-big-value">{count}</strong>
            <span>{t("diagnostics.thread.count")}</span>
          </article>
        ))}
      </div>

      {(result.blockedThreads?.length ?? 0) > 0 && (
        <article className="tool-panel">
          <div className="tool-card-header">
            <div>
              <strong>{t("diagnostics.thread.blockedTitle")}</strong>
              <span>
                {t("diagnostics.thread.findingCount", {
                  count: result.blockedThreads!.length,
                })}
              </span>
            </div>
          </div>
          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table">
              <thead>
                <tr>
                  <th>{t("diagnostics.thread.threadColumn")}</th>
                  <th>{t("diagnostics.thread.stateColumn")}</th>
                  <th>{t("diagnostics.thread.clue")}</th>
                </tr>
              </thead>
              <tbody>
                {result.blockedThreads!.map((thread, index) => (
                  <tr key={`${thread.name}-${index}`}>
                    <td>
                      <code>
                        {thread.name ?? t("diagnostics.thread.unnamed")}
                      </code>
                    </td>
                    <td>{thread.state ?? "UNKNOWN"}</td>
                    <td>
                      <code>
                        {thread.clues?.join(" · ") ||
                          t("diagnostics.thread.noLockDetails")}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {(result.repeatedStacks?.length ?? 0) > 0 && (
        <article className="tool-panel">
          <div className="tool-card-header">
            <div>
              <strong>{t("diagnostics.thread.repeatedTitle")}</strong>
              <span>{t("diagnostics.thread.repeatedDescription")}</span>
            </div>
          </div>
          <div className="diagnostics-stack-groups">
            {result.repeatedStacks!.map((stack, index) => (
              <details key={`${stack.frames?.[0]}-${index}`}>
                <summary>
                  {t("diagnostics.thread.group", {
                    count: stack.count ?? 0,
                    names:
                      stack.threads?.slice(0, 3).join(", ") ||
                      t("diagnostics.thread.unnamed"),
                  })}
                </summary>
                <pre>
                  {stack.frames?.join("\n") ||
                    t("diagnostics.thread.noFrames")}
                </pre>
              </details>
            ))}
          </div>
        </article>
      )}

      {(result.deadlockClues?.length ?? 0) > 0 && (
        <details className="tool-panel diagnostics-details">
          <summary>
            {t("diagnostics.thread.deadlockClues", {
              count: result.deadlockClues!.length,
            })}
          </summary>
          <pre>{result.deadlockClues!.join("\n")}</pre>
        </details>
      )}
    </div>
  );
}

function LogSearchResultView({ result }: { result: LogSearchResult }) {
  const t = useTranslation();
  const matches = result.matches ?? [];
  return (
    <article className="tool-panel">
      <div className="tool-card-header">
        <div>
          <strong>
            {t("diagnostics.log.matchCount", { count: matches.length })}
          </strong>
          <span>
            {t("diagnostics.log.scannedCount", {
              count: result.scannedLines ?? 0,
            })}
          </span>
        </div>
        {result.truncated && (
          <span>{t("diagnostics.thread.limited")}</span>
        )}
      </div>
      {matches.length > 0 ? (
        <div className="diagnostics-log-results">
          {matches.map((match, index) => (
            <div key={`${match.lineNumber}-${index}`}>
              <span>{match.lineNumber ?? "—"}</span>
              <code>{match.line ?? ""}</code>
            </div>
          ))}
        </div>
      ) : (
        <EmptyResult
          icon={Search}
          title={t("diagnostics.log.noMatchTitle")}
          description={t("diagnostics.log.noMatchDescription")}
        />
      )}
    </article>
  );
}

function CoverageResultView({ result }: { result: CoverageResult }) {
  const { locale, t } = useLocale();
  const percentage = result.coveragePercent ?? 0;
  const progressValue = Math.max(0, Math.min(100, percentage));
  return (
    <div className="diagnostics-result-stack">
      <article className="tool-panel diagnostics-coverage-summary diagnostics-panel-padded">
        <div
          className="diagnostics-coverage-ring"
          style={{
            "--diagnostics-coverage": `${progressValue}%`,
          } as CSSProperties}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressValue}
          aria-label={t("diagnostics.coverage.aria", {
            percentage: percentage.toLocaleString(locale, {
              maximumFractionDigits: 1,
            }),
          })}
        >
          <span>
            {percentage.toLocaleString(locale, { maximumFractionDigits: 1 })}%
          </span>
        </div>
        <div>
          <strong>
            {t("diagnostics.coverage.called", {
              covered: result.covered ?? 0,
              total: result.totalKnown ?? 0,
            })}
          </strong>
          <p>{t("diagnostics.coverage.disclaimer")}</p>
        </div>
      </article>

      <article className="tool-panel">
        <div className="tool-card-header">
          <div>
            <strong>{t("diagnostics.coverage.endpoints")}</strong>
            <span>{t("diagnostics.coverage.matchDescription")}</span>
          </div>
        </div>
        <div className="diagnostics-table-wrap">
          <table className="diagnostics-table">
            <thead>
              <tr>
                <th>{t("diagnostics.coverage.method")}</th>
                <th>{t("diagnostics.coverage.path")}</th>
                <th>{t("diagnostics.coverage.hit")}</th>
                <th>{t("diagnostics.coverage.observedPath")}</th>
              </tr>
            </thead>
            <tbody>
              {(result.endpoints ?? []).map((endpoint, index) => (
                <tr key={`${endpoint.method}-${endpoint.path}-${index}`}>
                  <td><code>{endpoint.method ?? "—"}</code></td>
                  <td><code>{endpoint.path ?? "/"}</code></td>
                  <td>{endpoint.hitCount ?? 0}</td>
                  <td>
                    {endpoint.observedPaths?.join(", ") ||
                      t("diagnostics.coverage.notSeen")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {(result.unknownObserved?.length ?? 0) > 0 && (
        <article className="tool-panel">
          <div className="tool-card-header">
            <div>
              <strong>{t("diagnostics.coverage.unknownCalls")}</strong>
              <span>
                {t("diagnostics.coverage.routeCount", {
                  count: result.unknownObserved!.length,
                })}
              </span>
            </div>
          </div>
          <div className="diagnostics-chip-list diagnostics-chip-list-padded">
            {result.unknownObserved!.map((item, index) => (
              <code key={`${item.method}-${item.path}-${index}`}>
                {item.method} {item.path} [{item.count ?? 0}]
              </code>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}

export function DiagnosticsLab() {
  const t = useTranslation();
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabID = useWorkspaceStore((state) => state.activeTabID);
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabID),
    [activeTabID, tabs],
  );
  const activeResponse = activeTab?.response;

  const [mode, setMode] = useState<DiagnosticsMode>("spring");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<DiagnosticsNotice | null>(null);

  const [springBody, setSpringBody] = useState(() => activeResponse?.body ?? "");
  const [springStatus, setSpringStatus] = useState(
    () => activeResponse?.statusCode ?? 400,
  );
  const [springHeaders, setSpringHeaders] = useState(() =>
    responseHeadersText(activeResponse),
  );
  const [springAnalysis, setSpringAnalysis] =
    useState<SpringErrorAnalysis | null>(null);

  const [jwtInput, setJWTInput] = useState("");
  const [jwtAnalysis, setJWTAnalysis] = useState<JWTAnalysis | null>(null);

  const [actuatorURL, setActuatorURL] = useState(
    "http://localhost:8080/actuator",
  );
  const [actuatorHeaders, setActuatorHeaders] = useState("");
  const [actuatorTimeout, setActuatorTimeout] = useState(5_000);
  const [metricNames, setMetricNames] = useState(defaultMetricNames);
  const [includeMappings, setIncludeMappings] = useState(false);
  const [runtimeResult, setRuntimeResult] =
    useState<ActuatorInspectResult | null>(null);
  const [runtimeBaseline, setRuntimeBaseline] =
    useState<ActuatorMetricSnapshot | undefined>();

  const [environmentMethod, setEnvironmentMethod] = useState("GET");
  const [environmentPath, setEnvironmentPath] = useState("/actuator/health");
  const [environmentBody, setEnvironmentBody] = useState("");
  const [environmentHeaders, setEnvironmentHeaders] = useState(
    "Accept: application/json",
  );
  const [environmentTimeout, setEnvironmentTimeout] = useState(8_000);
  const [environmentTargets, setEnvironmentTargets] = useState([
    { name: "Local", baseUrl: "http://localhost:8080" },
    { name: "Test", baseUrl: "" },
    { name: "Staging", baseUrl: "" },
  ]);
  const [environmentIgnorePaths, setEnvironmentIgnorePaths] = useState(
    "$.traceId\n$.timestamp\n$.requestId",
  );
  const [allowUnsafe, setAllowUnsafe] = useState(false);
  const [environmentResult, setEnvironmentResult] =
    useState<EnvironmentCompareResult | null>(null);

  const [threadLogMode, setThreadLogMode] = useState<"thread" | "logs">("thread");
  const [threadDump, setThreadDump] = useState("");
  const [threadResult, setThreadResult] = useState<ThreadDumpResult | null>(null);
  const [logText, setLogText] = useState("");
  const [traceQuery, setTraceQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [logResult, setLogResult] = useState<LogSearchResult | null>(null);

  const [knownEndpoints, setKnownEndpoints] = useState("");
  const [observedCalls, setObservedCalls] = useState("");
  const [coverageResult, setCoverageResult] = useState<CoverageResult | null>(null);

  const asyncInputSignature = useMemo(
    () =>
      JSON.stringify({
        mode,
        actuatorURL,
        actuatorHeaders,
        actuatorTimeout,
        metricNames,
        includeMappings,
        environmentMethod,
        environmentPath,
        environmentBody,
        environmentHeaders,
        environmentTimeout,
        environmentTargets,
        environmentIgnorePaths,
        allowUnsafe,
        threadLogMode,
        threadDump,
        logText,
        traceQuery,
        caseSensitive,
        knownEndpoints,
        observedCalls,
      }),
    [
      actuatorHeaders,
      actuatorTimeout,
      actuatorURL,
      allowUnsafe,
      caseSensitive,
      environmentBody,
      environmentHeaders,
      environmentIgnorePaths,
      environmentMethod,
      environmentPath,
      environmentTargets,
      environmentTimeout,
      includeMappings,
      knownEndpoints,
      logText,
      metricNames,
      mode,
      observedCalls,
      threadDump,
      threadLogMode,
      traceQuery,
    ],
  );
  const latestAsyncInputRef = useRef(asyncInputSignature);
  const previousAsyncInputRef = useRef(asyncInputSignature);
  const operationSequenceRef = useRef(0);
  latestAsyncInputRef.current = asyncInputSignature;

  useEffect(() => {
    if (previousAsyncInputRef.current === asyncInputSignature) return;
    previousAsyncInputRef.current = asyncInputSignature;
    operationSequenceRef.current += 1;
    if (busy) {
      setBusy("");
      setNotice({
        tone: "info",
        text: t("diagnostics.operation.stale"),
      });
    }
  }, [asyncInputSignature, busy, t]);

  const startAsyncOperation = (name: string): PendingOperation => {
    const operation = {
      id: operationSequenceRef.current + 1,
      inputSignature: latestAsyncInputRef.current,
    };
    operationSequenceRef.current = operation.id;
    setBusy(name);
    setNotice(null);
    return operation;
  };
  const isCurrentOperation = (operation: PendingOperation) =>
    operation.id === operationSequenceRef.current &&
    operation.inputSignature === latestAsyncInputRef.current;
  const finishAsyncOperation = (operation: PendingOperation) => {
    if (isCurrentOperation(operation)) setBusy("");
  };

  const clearNotice = () => setNotice(null);
  const clearRuntimeResult = () => {
    setRuntimeResult(null);
    setRuntimeBaseline(undefined);
    clearNotice();
  };
  const clearEnvironmentResult = () => {
    setEnvironmentResult(null);
    clearNotice();
  };

  const loadActiveResponse = () => {
    if (!activeResponse) {
      setNotice({
        tone: "error",
        text: t("diagnostics.spring.noActiveResponse"),
      });
      return;
    }
    setSpringBody(activeResponse.body);
    setSpringStatus(activeResponse.statusCode);
    setSpringHeaders(responseHeadersText(activeResponse));
    setSpringAnalysis(null);
    setNotice({
      tone: "success",
      text: t("diagnostics.spring.responseLoaded", {
        name: activeTab?.name ?? t("diagnostics.spring.activeRequest"),
      }),
    });
  };

  const runSpringAnalysis = () => {
    if (!springBody.trim()) {
      setNotice({
        tone: "error",
        text: t("diagnostics.spring.bodyRequired"),
      });
      return;
    }
    try {
      const headers = parseHeaders(springHeaders, t);
      const normalizedHeaders = Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key, [value]]),
      );
      setSpringAnalysis(
        localizeSpringFallbacks(
          analyzeSpringError(springBody, springStatus, normalizedHeaders),
          springBody,
          t,
        ),
      );
      setNotice({
        tone: "success",
        text: t("diagnostics.spring.success"),
      });
    } catch (error) {
      setSpringAnalysis(null);
      setNotice({ tone: "error", text: errorText(error) });
    }
  };

  const runJWTAnalysis = () => {
    try {
      const analysis = analyzeJWT(jwtInput);
      setJWTAnalysis(analysis);
      setNotice({
        tone: "success",
        text: t("diagnostics.jwt.success"),
      });
    } catch (error) {
      setJWTAnalysis(null);
      setNotice({ tone: "error", text: jwtErrorText(error, t) });
    }
  };

  const inspectRuntime = async (captureBaseline: boolean) => {
    const baseUrl = actuatorURL.trim();
    if (!baseUrl) {
      setNotice({
        tone: "error",
        text: t("diagnostics.runtime.baseURLRequired"),
      });
      return;
    }
    let headers: Record<string, string>;
    const selectedMetrics = parseList(metricNames);
    try {
      headers = parseHeaders(actuatorHeaders, t);
      if (selectedMetrics.length === 0) {
        throw new Error(t("diagnostics.runtime.metricRequired"));
      }
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error) });
      return;
    }
    const operation = startAsyncOperation(
      captureBaseline ? "runtime-baseline" : "runtime",
    );
    try {
      const result = await backend.inspectActuator({
        baseUrl,
        headers,
        timeoutMs: actuatorTimeout,
        metricNames: selectedMetrics,
        includeMappings,
        before: captureBaseline ? undefined : runtimeBaseline,
      });
      if (!isCurrentOperation(operation)) return;
      setRuntimeResult(result);
      const failure = resultIssue(result, t);
      if (failure) {
        setNotice(failure);
        return;
      }
      if (captureBaseline) {
        const snapshot = result.metrics;
        if (!snapshot) {
          setNotice({
            tone: "error",
            text: t("diagnostics.runtime.noBaselineSnapshot"),
          });
          return;
        }
        setRuntimeBaseline(snapshot);
        setNotice({
          tone: "success",
          text: t("diagnostics.runtime.baselineSuccess"),
        });
      } else {
        setNotice({
          tone: "success",
          text: runtimeBaseline
            ? t("diagnostics.runtime.compareSuccess")
            : t("diagnostics.runtime.snapshotSuccess"),
        });
      }
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setNotice(
          bridgeIssue(
            error,
              captureBaseline
              ? t("diagnostics.runtime.baselineFailure")
              : t("diagnostics.runtime.snapshotFailure"),
            t,
          ),
        );
      }
    } finally {
      finishAsyncOperation(operation);
    }
  };

  const compareEnvironments = async () => {
    const targets = environmentTargets
      .map((target) => ({
        name: target.name.trim(),
        baseUrl: target.baseUrl.trim(),
      }))
      .filter((target) => target.baseUrl !== "");
    if (targets.length < 2) {
      setNotice({
        tone: "error",
        text: t("diagnostics.environment.twoRequired"),
      });
      return;
    }
    const unsafe = !isSafeEnvironmentMethod(environmentMethod);
    if (unsafe && !allowUnsafe) {
      setNotice({
        tone: "error",
        text: t("diagnostics.environment.unsafeWarning", {
          method: environmentMethod,
        }),
      });
      return;
    }
    let headers: Record<string, string>;
    try {
      headers = parseHeaders(environmentHeaders, t);
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error) });
      return;
    }
    const operation = startAsyncOperation("environments");
    try {
      const result = await backend.compareEnvironments({
        method: environmentMethod,
        path: environmentPath.trim(),
        headers: Object.fromEntries(
          Object.entries(headers).map(([key, value]) => [key, [value]]),
        ),
        body: environmentBody,
        targets,
        ignoreJsonPaths: parseList(environmentIgnorePaths),
        ignoreHeaders: [],
        allowUnsafe,
        timeoutMs: environmentTimeout,
      });
      if (!isCurrentOperation(operation)) return;
      setEnvironmentResult(result);
      const failure = resultIssue(result, t);
      setNotice(
        failure
          ? failure
          : {
              tone: "success",
              text: t("diagnostics.environment.success", {
                count: targets.length,
              }),
            },
      );
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setNotice(
          bridgeIssue(
            error,
            t("diagnostics.environment.failure"),
            t,
          ),
        );
      }
    } finally {
      finishAsyncOperation(operation);
    }
  };

  const analyzeThreads = async () => {
    if (!threadDump.trim()) {
      setNotice({
        tone: "error",
        text: t("diagnostics.thread.required"),
      });
      return;
    }
    const operation = startAsyncOperation("thread");
    try {
      const result = await backend.analyzeThreadDump({ text: threadDump });
      if (!isCurrentOperation(operation)) return;
      setThreadResult(result);
      const failure = resultIssue(result, t);
      setNotice(
        failure
          ? failure
          : {
              tone: "success",
              text: t("diagnostics.thread.success", {
                count: result.threadCount ?? 0,
              }),
            },
      );
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setNotice(
          bridgeIssue(error, t("diagnostics.thread.failure"), t),
        );
      }
    } finally {
      finishAsyncOperation(operation);
    }
  };

  const searchLogs = async () => {
    if (!logText.trim() || !traceQuery.trim()) {
      setNotice({
        tone: "error",
        text: t("diagnostics.log.required"),
      });
      return;
    }
    const operation = startAsyncOperation("logs");
    try {
      const result = await backend.searchTraceLog({
        text: logText,
        query: traceQuery.trim(),
        caseSensitive,
      });
      if (!isCurrentOperation(operation)) return;
      setLogResult(result);
      const failure = resultIssue(result, t);
      setNotice(
        failure
          ? failure
          : {
              tone: "success",
              text: t("diagnostics.log.success", {
                count: result.matches?.length ?? 0,
              }),
            },
      );
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setNotice(bridgeIssue(error, t("diagnostics.log.failure"), t));
      }
    } finally {
      finishAsyncOperation(operation);
    }
  };

  const analyzeCoverage = async () => {
    let known: CoverageInput["known"];
    let observed: CoverageInput["observed"];
    try {
      known = parseKnownEndpoints(knownEndpoints, t);
      observed = parseObservedCalls(observedCalls, t);
      if (known.length === 0) {
        throw new Error(t("diagnostics.coverage.knownRequired"));
      }
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error) });
      return;
    }
    const operation = startAsyncOperation("coverage");
    try {
      const result = await backend.analyzeEndpointCoverage({
        known,
        observed,
      });
      if (!isCurrentOperation(operation)) return;
      setCoverageResult(result);
      const failure = resultIssue(result, t);
      setNotice(
        failure
          ? failure
          : {
              tone: "success",
              text: t("diagnostics.coverage.success", {
                covered: result.covered ?? 0,
                total: result.totalKnown ?? 0,
              }),
            },
      );
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setNotice(
          bridgeIssue(error, t("diagnostics.coverage.failure"), t),
        );
      }
    } finally {
      finishAsyncOperation(operation);
    }
  };

  const analyzeRecordedCoverage = async () => {
    const operation = startAsyncOperation("coverage-recorded");
    try {
      const result = await backend.analyzeEndpointCoverage({
        known: [],
        observed: [],
      });
      if (!isCurrentOperation(operation)) return;
      setCoverageResult(result);
      const failure = resultIssue(result, t);
      setNotice(
        failure
          ? failure
          : {
              tone: "success",
              text: t("diagnostics.coverage.sessionSuccess", {
                covered: result.covered ?? 0,
                total: result.totalKnown ?? 0,
              }),
            },
      );
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setNotice(
          bridgeIssue(
            error,
            t("diagnostics.coverage.sessionFailure"),
            t,
          ),
        );
      }
    } finally {
      finishAsyncOperation(operation);
    }
  };

  const renderSpring = () => (
    <div className="diagnostics-work-grid">
      <article className="tool-editor-card">
        <div className="tool-card-header">
          <div>
            <strong>{t("diagnostics.spring.responseTitle")}</strong>
            <span>
              {activeResponse
                ? t("diagnostics.spring.activeTab", {
                    name: activeTab?.name ?? "",
                    status: activeResponse.statusCode,
                  })
                : t("diagnostics.spring.inputHint")}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={loadActiveResponse}
            disabled={!activeResponse}
          >
            <ClipboardPaste size={13} />{" "}
            {t("diagnostics.spring.loadActive")}
          </Button>
        </div>
        <textarea
          className="tool-code-input"
          value={springBody}
          onChange={(event) => {
            setSpringBody(event.target.value);
            setSpringAnalysis(null);
            clearNotice();
          }}
          placeholder={'{\n  "type": "about:blank",\n  "title": "Bad Request",\n  "status": 400,\n  "detail": "Validation failed"\n}'}
          spellCheck={false}
          aria-label={t("diagnostics.spring.bodyLabel")}
        />
        <div className="diagnostics-form-strip">
          <label className="diagnostics-field">
            {t("diagnostics.spring.httpStatus")}
            <input
              type="number"
              min={100}
              max={599}
              value={springStatus}
              onChange={(event) => {
                setSpringStatus(Number(event.target.value) || 0);
                setSpringAnalysis(null);
                clearNotice();
              }}
            />
          </label>
          <label className="diagnostics-field diagnostics-field-grow">
            {t("diagnostics.spring.headersLabel")}
            <textarea
              value={springHeaders}
              onChange={(event) => {
                setSpringHeaders(event.target.value);
                setSpringAnalysis(null);
                clearNotice();
              }}
              placeholder="X-Trace-ID: 7f1…"
              rows={2}
            />
          </label>
          <Button variant="primary" onClick={runSpringAnalysis}>
            <Bug size={14} /> {t("diagnostics.spring.analyze")}
          </Button>
        </div>
      </article>
      <div aria-live="polite">
        {springAnalysis ? (
          <SpringResult analysis={springAnalysis} />
        ) : (
          <article className="tool-panel">
            <EmptyResult
              icon={Bug}
              title={t("diagnostics.spring.emptyTitle")}
              description={t("diagnostics.spring.emptyDescription")}
            />
          </article>
        )}
      </div>
    </div>
  );

  const renderJWT = () => (
    <div className="diagnostics-work-grid">
      <article className="tool-editor-card">
        <div className="tool-card-header">
          <div>
            <strong>{t("diagnostics.jwt.inputTitle")}</strong>
            <span>{t("diagnostics.jwt.inputHint")}</span>
          </div>
        </div>
        <textarea
          className="tool-code-input"
          value={jwtInput}
          onChange={(event) => {
            setJWTInput(event.target.value);
            setJWTAnalysis(null);
            clearNotice();
          }}
          placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9…"
          spellCheck={false}
          aria-label={t("diagnostics.jwt.tokenLabel")}
        />
        <div className="tool-card-actions">
          <Button variant="primary" onClick={runJWTAnalysis}>
            <KeyRound size={14} /> {t("diagnostics.jwt.decode")}
          </Button>
        </div>
      </article>
      <div aria-live="polite">
        {jwtAnalysis ? (
          <JWTResult analysis={jwtAnalysis} />
        ) : (
          <article className="tool-panel">
            <EmptyResult
              icon={KeyRound}
              title={t("diagnostics.jwt.emptyTitle")}
              description={t("diagnostics.jwt.emptyDescription")}
            />
          </article>
        )}
      </div>
    </div>
  );

  const renderRuntime = () => (
    <div className="diagnostics-result-stack">
      <article className="tool-panel diagnostics-panel-padded">
        <div className="diagnostics-runtime-form">
          <label className="diagnostics-field diagnostics-field-wide">
            {t("diagnostics.runtime.baseURL")}
            <input
              value={actuatorURL}
              onChange={(event) => {
                setActuatorURL(event.target.value);
                clearRuntimeResult();
              }}
              placeholder="http://localhost:8080/actuator"
            />
          </label>
          <label className="diagnostics-field">
            Timeout (ms)
            <input
              type="number"
              min={1}
              max={30_000}
              value={actuatorTimeout}
              onChange={(event) => {
                setActuatorTimeout(
                  Math.max(1, Math.min(30_000, Number(event.target.value) || 1)),
                );
                clearRuntimeResult();
              }}
            />
          </label>
          <label className="diagnostics-checkbox">
            <input
              type="checkbox"
              checked={includeMappings}
              onChange={(event) => {
                setIncludeMappings(event.target.checked);
                clearRuntimeResult();
              }}
            />
            {t("diagnostics.runtime.includeMappings")}
          </label>
          <label className="diagnostics-field">
            {t("diagnostics.runtime.headers")}
            <textarea
              value={actuatorHeaders}
              onChange={(event) => {
                setActuatorHeaders(event.target.value);
                clearRuntimeResult();
              }}
              placeholder="Authorization: Bearer …"
              rows={5}
            />
          </label>
          <label className="diagnostics-field">
            {t("diagnostics.runtime.metricNames")}
            <textarea
              value={metricNames}
              onChange={(event) => {
                setMetricNames(event.target.value);
                clearRuntimeResult();
              }}
              rows={5}
              spellCheck={false}
            />
          </label>
        </div>
        <div className="diagnostics-action-row">
          <Button
            onClick={() => void inspectRuntime(true)}
            disabled={Boolean(busy)}
          >
            {busy === "runtime-baseline" ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <Gauge size={14} />
            )}
            {t("diagnostics.runtime.captureBaseline")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void inspectRuntime(false)}
            disabled={Boolean(busy)}
          >
            <BusyIcon active={busy === "runtime"} />
            {runtimeBaseline
              ? t("diagnostics.runtime.captureDelta")
              : t("diagnostics.runtime.captureSnapshot")}
          </Button>
          {runtimeBaseline && (
            <Button
              variant="ghost"
              onClick={() => {
                setRuntimeBaseline(undefined);
                setNotice({
                  tone: "info",
                  text: t("diagnostics.runtime.baselineCleared"),
                });
              }}
            >
              {t("diagnostics.runtime.clearBaseline")}
            </Button>
          )}
          <span>
            {t("diagnostics.runtime.readOnlyHint")}
          </span>
        </div>
      </article>
      {runtimeResult ? (
        <RuntimeResult result={runtimeResult} baseline={runtimeBaseline} />
      ) : (
        <article className="tool-panel">
          <EmptyResult
            icon={ServerCog}
            title={t("diagnostics.runtime.emptyTitle")}
            description={t("diagnostics.runtime.emptyDescription")}
          />
        </article>
      )}
    </div>
  );

  const updateEnvironmentTarget = (
    index: number,
    patch: Partial<{ name: string; baseUrl: string }>,
  ) => {
    setEnvironmentTargets((targets) =>
      targets.map((target, targetIndex) =>
        targetIndex === index ? { ...target, ...patch } : target,
      ),
    );
    clearEnvironmentResult();
  };

  const renderEnvironments = () => {
    const unsafe = !isSafeEnvironmentMethod(environmentMethod);
    return (
      <div className="diagnostics-result-stack">
        <article className="tool-panel diagnostics-panel-padded">
          <div className="diagnostics-request-line">
            <label className="diagnostics-field">
              {t("diagnostics.environment.method")}
              <select
                value={environmentMethod}
                onChange={(event) => {
                  setEnvironmentMethod(event.target.value);
                  clearEnvironmentResult();
                  if (isSafeEnvironmentMethod(event.target.value)) {
                    setAllowUnsafe(false);
                  }
                }}
              >
                {environmentMethods.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </label>
            <label className="diagnostics-field diagnostics-field-grow">
              {t("diagnostics.environment.relativePath")}
              <input
                value={environmentPath}
                onChange={(event) => {
                  setEnvironmentPath(event.target.value);
                  clearEnvironmentResult();
                }}
                placeholder="/api/orders?limit=10"
              />
            </label>
            <label className="diagnostics-field">
              Timeout (ms)
              <input
                type="number"
                min={1}
                max={30_000}
                value={environmentTimeout}
                onChange={(event) => {
                  setEnvironmentTimeout(
                    Math.max(1, Math.min(30_000, Number(event.target.value) || 1)),
                  );
                  clearEnvironmentResult();
                }}
              />
            </label>
          </div>
          <div className="diagnostics-target-grid">
            {environmentTargets.map((target, index) => (
              <fieldset key={index}>
                <legend>
                  {t("diagnostics.environment.legend", {
                    number: index + 1,
                  })}
                </legend>
                <label className="diagnostics-field">
                  {t("diagnostics.environment.name")}
                  <input
                    value={target.name}
                    onChange={(event) =>
                      updateEnvironmentTarget(index, { name: event.target.value })
                    }
                  />
                </label>
                <label className="diagnostics-field">
                  {t("diagnostics.environment.baseURL")}
                  <input
                    value={target.baseUrl}
                    onChange={(event) =>
                      updateEnvironmentTarget(index, { baseUrl: event.target.value })
                    }
                    placeholder="https://test.example.com"
                  />
                </label>
              </fieldset>
            ))}
          </div>
          <div className="diagnostics-two-column">
            <label className="diagnostics-field">
              {t("diagnostics.runtime.headers")}
              <textarea
                value={environmentHeaders}
                onChange={(event) => {
                  setEnvironmentHeaders(event.target.value);
                  clearEnvironmentResult();
                }}
                rows={4}
                placeholder="Accept: application/json"
              />
            </label>
            <label className="diagnostics-field">
              {t("diagnostics.environment.ignorePaths")}
              <textarea
                value={environmentIgnorePaths}
                onChange={(event) => {
                  setEnvironmentIgnorePaths(event.target.value);
                  clearEnvironmentResult();
                }}
                rows={4}
                placeholder="$.traceId"
              />
            </label>
          </div>
          <label className="diagnostics-field">
            {t("diagnostics.environment.requestBody")}
            <textarea
              value={environmentBody}
              onChange={(event) => {
                setEnvironmentBody(event.target.value);
                clearEnvironmentResult();
              }}
              rows={6}
              spellCheck={false}
              placeholder={
                isSafeEnvironmentMethod(environmentMethod)
                  ? t("diagnostics.environment.safeBodyHint")
                  : '{\n  "name": "example"\n}'
              }
            />
          </label>
          {unsafe && (
            <Notice tone="info">
              <label className="diagnostics-checkbox">
                <input
                  type="checkbox"
                  checked={allowUnsafe}
                  onChange={(event) => setAllowUnsafe(event.target.checked)}
                />
                {t("diagnostics.environment.unsafeConsent", {
                  method: environmentMethod,
                })}
              </label>
            </Notice>
          )}
          <div className="diagnostics-action-row">
            <Button
              variant="primary"
              onClick={() => void compareEnvironments()}
              disabled={Boolean(busy) || (unsafe && !allowUnsafe)}
            >
              <BusyIcon active={busy === "environments"} />
              {t("diagnostics.environment.compare")}
            </Button>
            <span>{t("diagnostics.environment.baselineHint")}</span>
          </div>
        </article>
        {environmentResult ? (
          <EnvironmentResult result={environmentResult} />
        ) : (
          <article className="tool-panel">
            <EmptyResult
              icon={Network}
              title={t("diagnostics.environment.noResultTitle")}
              description={t("diagnostics.environment.noResultDescription")}
            />
          </article>
        )}
      </div>
    );
  };

  const renderThreadAndLogs = () => (
    <div className="diagnostics-result-stack">
      <ToolTabs
        value={threadLogMode}
        tabs={[
          {
            id: "thread",
            label: t("diagnostics.thread.dumpTab"),
            icon: Activity,
          },
          {
            id: "logs",
            label: t("diagnostics.thread.logTab"),
            icon: Search,
          },
        ]}
        label={t("diagnostics.thread.toolsLabel")}
        idBase="diagnostics-thread-logs"
        className="diagnostics-subtabs"
        onChange={(nextMode) => {
          setThreadLogMode(nextMode);
          clearNotice();
        }}
      />

      {threadLogMode === "thread" ? (
        <div
          className="diagnostics-work-grid"
          id="diagnostics-thread-logs-panel-thread"
          role="tabpanel"
          aria-labelledby="diagnostics-thread-logs-tab-thread"
        >
          <article className="tool-editor-card">
            <div className="tool-card-header">
              <div>
                <strong>{t("diagnostics.thread.dumpTitle")}</strong>
                <span>{t("diagnostics.thread.dumpHint")}</span>
              </div>
            </div>
            <textarea
              className="tool-code-input"
              value={threadDump}
              onChange={(event) => {
                setThreadDump(event.target.value);
                setThreadResult(null);
              }}
              placeholder={'"http-nio-8080-exec-1" #42\n   java.lang.Thread.State: BLOCKED\n        at com.example.OrderService.load(OrderService.java:42)'}
              spellCheck={false}
              aria-label={t("diagnostics.thread.dumpLabel")}
            />
            <div className="tool-card-actions">
              <Button
                variant="primary"
                onClick={() => void analyzeThreads()}
                disabled={Boolean(busy)}
              >
                <BusyIcon active={busy === "thread"} />{" "}
                {t("diagnostics.thread.analyze")}
              </Button>
            </div>
          </article>
          <div>
            {threadResult ? (
              <ThreadDumpResultView result={threadResult} />
            ) : (
              <article className="tool-panel">
                <EmptyResult
                  icon={Activity}
                  title={t("diagnostics.thread.emptyTitle")}
                  description={t("diagnostics.thread.emptyDescription")}
                />
              </article>
            )}
          </div>
        </div>
      ) : (
        <div
          className="diagnostics-work-grid"
          id="diagnostics-thread-logs-panel-logs"
          role="tabpanel"
          aria-labelledby="diagnostics-thread-logs-tab-logs"
        >
          <article className="tool-editor-card">
            <div className="tool-card-header">
              <div>
                <strong>{t("diagnostics.log.title")}</strong>
                <span>{t("diagnostics.log.description")}</span>
              </div>
            </div>
            <textarea
              className="tool-code-input"
              value={logText}
              onChange={(event) => {
                setLogText(event.target.value);
                setLogResult(null);
              }}
              placeholder="2026-07-27 INFO traceId=8f31c1a2d94b request completed"
              spellCheck={false}
              aria-label={t("diagnostics.log.inputLabel")}
            />
            <div className="diagnostics-form-strip">
              <label className="diagnostics-field diagnostics-field-grow">
                {t("diagnostics.log.traceLabel")}
                <input
                  value={traceQuery}
                  onChange={(event) => {
                    setTraceQuery(event.target.value);
                    setLogResult(null);
                    clearNotice();
                  }}
                  placeholder="8f31c1a2d94b"
                />
              </label>
              <label className="diagnostics-checkbox">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(event) => {
                    setCaseSensitive(event.target.checked);
                    setLogResult(null);
                    clearNotice();
                  }}
                />
                {t("diagnostics.log.caseSensitive")}
              </label>
              <Button
                variant="ghost"
                disabled={!activeResponse?.traceId}
                title={
                  activeResponse?.traceId
                    ? t("diagnostics.log.useActiveTitle")
                    : t("diagnostics.log.noActiveTitle")
                }
                onClick={() => setTraceQuery(activeResponse?.traceId ?? "")}
              >
                {t("diagnostics.log.activeResponseID")}
              </Button>
              <Button
                variant="primary"
                onClick={() => void searchLogs()}
                disabled={Boolean(busy)}
              >
                <BusyIcon active={busy === "logs"} />{" "}
                {t("diagnostics.log.search")}
              </Button>
            </div>
          </article>
          <div>
            {logResult ? (
              <LogSearchResultView result={logResult} />
            ) : (
              <article className="tool-panel">
                <EmptyResult
                  icon={Search}
                  title={t("diagnostics.log.emptyTitle")}
                  description={t("diagnostics.log.emptyDescription")}
                />
              </article>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderCoverage = () => (
    <div className="diagnostics-result-stack">
      <div className="diagnostics-work-grid">
        <article className="tool-editor-card">
          <div className="tool-card-header">
            <div>
              <strong>{t("diagnostics.coverage.knownTitle")}</strong>
              <span>{t("diagnostics.coverage.knownDescription")}</span>
            </div>
          </div>
          <textarea
            className="tool-code-input"
            value={knownEndpoints}
            onChange={(event) => {
              setKnownEndpoints(event.target.value);
              setCoverageResult(null);
            }}
            spellCheck={false}
            aria-label={t("diagnostics.coverage.knownLabel")}
          />
        </article>
        <article className="tool-editor-card">
          <div className="tool-card-header">
            <div>
              <strong>{t("diagnostics.coverage.observedTitle")}</strong>
              <span>{t("diagnostics.coverage.observedDescription")}</span>
            </div>
          </div>
          <textarea
            className="tool-code-input"
            value={observedCalls}
            onChange={(event) => {
              setObservedCalls(event.target.value);
              setCoverageResult(null);
            }}
            spellCheck={false}
            aria-label={t("diagnostics.coverage.observedLabel")}
          />
        </article>
      </div>
      <div className="diagnostics-action-row standalone">
        <Button
          onClick={() => void analyzeRecordedCoverage()}
          disabled={Boolean(busy)}
        >
          <BusyIcon active={busy === "coverage-recorded"} />
          {t("diagnostics.coverage.fromSession")}
        </Button>
        <Button
          variant="primary"
          onClick={() => void analyzeCoverage()}
          disabled={Boolean(busy)}
        >
          <BusyIcon active={busy === "coverage"} />{" "}
          {t("diagnostics.coverage.calculate")}
        </Button>
        <span>
          {t("diagnostics.coverage.templateHint")}
        </span>
      </div>
      {coverageResult ? (
        <CoverageResultView result={coverageResult} />
      ) : (
        <article className="tool-panel">
          <EmptyResult
            icon={ListChecks}
            title={t("diagnostics.coverage.emptyTitle")}
            description={t("diagnostics.coverage.emptyDescription")}
          />
        </article>
      )}
    </div>
  );

  return (
    <section className="tool-page diagnostics-lab" aria-labelledby="diagnostics-title">
      <header className="tool-page-header">
        <div>
          <span className="tool-eyebrow">{t("diagnostics.eyebrow")}</span>
          <h1 id="diagnostics-title">{t("diagnostics.title")}</h1>
          <p>{t("diagnostics.description")}</p>
        </div>
        <div className="tool-header-meta">
          <strong>
            {diagnosticsModeLabel(mode, t)}
          </strong>
          <span>
            {busy
              ? t("diagnostics.status.busy")
              : t("diagnostics.status.ready")}
          </span>
        </div>
      </header>

      <ToolTabs
        value={mode}
        tabs={diagnosticsModes.map((id) => ({
          id,
          label: diagnosticsModeLabel(id, t),
          icon: modeIcons[id],
        }))}
        label={t("diagnostics.toolsLabel")}
        idBase="diagnostics"
        className="diagnostics-main-tabs"
        onChange={(nextMode) => {
          setMode(nextMode);
          clearNotice();
        }}
      />

      {notice && (
        <Notice tone={notice.tone}>
          <div className="tool-notice-content">
            {notice.title && <strong>{notice.title}</strong>}
            <span>{notice.text}</span>
            {notice.hint && <small>{notice.hint}</small>}
            {notice.technical && (
              <details>
                <summary>{t("common.technicalDetails")}</summary>
                <code>{notice.technical}</code>
              </details>
            )}
          </div>
        </Notice>
      )}

      <div
        id={`diagnostics-panel-${mode}`}
        role="tabpanel"
        aria-labelledby={`diagnostics-tab-${mode}`}
        aria-busy={Boolean(busy)}
      >
        {mode === "spring"
          ? renderSpring()
          : mode === "jwt"
            ? renderJWT()
            : mode === "runtime"
              ? renderRuntime()
              : mode === "environments"
                ? renderEnvironments()
                : mode === "thread-logs"
                  ? renderThreadAndLogs()
                  : renderCoverage()}
      </div>
    </section>
  );
}
