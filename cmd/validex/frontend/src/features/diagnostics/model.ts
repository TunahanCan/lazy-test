import {
  DeveloperToolError,
  type SpringErrorAnalysis,
} from "../../lib/developerTools.js";
import type { Locale, TranslationKey } from "../../i18n/messages.js";
import type { Translate } from "../../i18n/locale.js";
import type {
  CoverageInput,
  EnvironmentCompareResult,
  NetworkReport,
  ResponseEnvelope,
  UserError,
} from "../../lib/types.js";
import {
  hasLocalizedUserError,
  localizeUserError,
  userErrorTechnicalDetails,
} from "../../lib/userErrors.js";

export type DiagnosticsMode =
  | "spring"
  | "jwt"
  | "runtime"
  | "environments"
  | "thread-logs"
  | "coverage";

export type DiagnosticsWorkspaceMode = DiagnosticsMode | "performance";

export interface URLPerformanceSample {
  number: number;
  statusCode: number;
  durationMs: number;
  dnsDurationMs: number;
  requestDurationMs: number;
  redirectCount: number;
  method: string;
  usedGetFallback: boolean;
  success: boolean;
  error?: string;
  failureCategory?: string;
  finalURL: string;
}

export interface URLPerformanceSummary {
  samples: URLPerformanceSample[];
  durationValuesMs: number[];
  durationValueCursor: number;
  completedSamples: number;
  successfulSamples: number;
  failedSamples: number;
  fastestMs: number;
  averageMs: number;
  durationM2: number;
  slowestMs: number;
  totalDurationMs: number;
  elapsedTimeMs?: number;
  totalDNSDurationMs: number;
  totalRequestDurationMs: number;
  redirectedSamples: number;
  fallbackSamples: number;
  statusCounts: Record<string, number>;
}

export interface URLPerformanceStatistics {
  medianMs: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  standardDeviationMs: number;
  errorRate: number;
  throughputPerSecond: number;
  averageDNSMs: number;
  averageRequestMs: number;
  percentileSampleCount: number;
  percentilesTruncated: boolean;
}

export interface DiagnosticsNotice {
  tone: "error" | "success" | "info";
  text: string;
  title?: string;
  hint?: string;
  technical?: string;
}

export interface PendingOperation {
  id: number;
  inputSignature: string;
}

export const diagnosticsModes: readonly DiagnosticsMode[] = [
  "spring",
  "jwt",
  "runtime",
  "environments",
  "thread-logs",
  "coverage",
];

export const urlPerformanceLimits = {
  minimumSamples: 1,
  maximumSamples: 1_000,
  largeRunConfirmationSamples: 100,
  minimumTimeoutMs: 1,
  retainedSampleDetails: 250,
  retainedPercentileSamples: 20_000,
  maximumRepresentableTimeoutMs: 9_223_372_036_854,
} as const;

const followedRedirectStatusCodes = new Set([301, 302, 303, 307, 308]);

export const defaultMetricNames = [
  "jvm.memory.used",
  "jvm.memory.max",
  "jvm.threads.live",
  "jvm.threads.blocked",
  "jvm.gc.pause",
  "hikaricp.connections.active",
  "hikaricp.connections.idle",
  "hikaricp.connections.pending",
  "lettuce.command.completion",
  "kafka.consumer.fetch.manager.records.lag.max",
  "rabbitmq.consumed",
  "rabbitmq.published",
].join("\n");

export const environmentMethods = [
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;

const safeEnvironmentMethods: readonly string[] = ["GET", "HEAD", "OPTIONS"];

interface TranslatedDiagnosticsError {
  message: TranslationKey;
  hint: TranslationKey;
}

const translatedDiagnosticsErrors: Readonly<
  Record<string, TranslatedDiagnosticsError>
> = {
  invalid_input: {
    message: "diagnostics.error.invalidInputMessage",
    hint: "diagnostics.error.invalidInputHint",
  },
  unsafe_method: {
    message: "diagnostics.error.unsafeMethodMessage",
    hint: "diagnostics.error.unsafeMethodHint",
  },
  request_failed: {
    message: "diagnostics.error.requestFailedMessage",
    hint: "diagnostics.error.requestFailedHint",
  },
  response_too_large: {
    message: "diagnostics.error.responseTooLargeMessage",
    hint: "diagnostics.error.responseTooLargeHint",
  },
  invalid_response: {
    message: "diagnostics.error.invalidResponseMessage",
    hint: "diagnostics.error.invalidResponseHint",
  },
  limit_exceeded: {
    message: "diagnostics.error.limitExceededMessage",
    hint: "diagnostics.error.limitExceededHint",
  },
  diagnostic_failed: {
    message: "diagnostics.error.diagnosticFailedMessage",
    hint: "diagnostics.error.operationHint",
  },
  coverage_spec_missing: {
    message: "diagnostics.error.coverageSpecMissingMessage",
    hint: "diagnostics.error.coverageSpecMissingHint",
  },
  network_operation_invalid: {
    message: "diagnostics.error.networkOperationInvalidMessage",
    hint: "diagnostics.error.invalidInputHint",
  },
  network_inspection_failed: {
    message: "diagnostics.error.networkInspectionFailedMessage",
    hint: "diagnostics.error.networkInspectionFailedHint",
  },
  tool_timeout: {
    message: "diagnostics.error.toolTimeoutMessage",
    hint: "diagnostics.error.networkInspectionFailedHint",
  },
  tool_canceled: {
    message: "diagnostics.error.toolCanceledMessage",
    hint: "diagnostics.error.operationHint",
  },
};

export function isSafeEnvironmentMethod(method: string): boolean {
  return safeEnvironmentMethods.includes(method);
}

export function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as Partial<UserError>;
    const text = [candidate.title, candidate.message, candidate.hint]
      .filter(Boolean)
      .join(" · ");
    if (text) return text;
  }
  return error instanceof Error ? error.message : String(error);
}

function structuredErrorDetails(error: Partial<UserError>): string | undefined {
  return userErrorTechnicalDetails(error);
}

export function resultIssue(
  result: { error?: UserError | string } | null,
  t: Translate,
  fallback?: {
    title: TranslationKey;
    message: TranslationKey;
    hint: TranslationKey;
  },
): DiagnosticsNotice | null {
  if (!result?.error) return null;
  const fallbackTitle = fallback?.title ?? "diagnostics.error.operationTitle";
  const fallbackMessage =
    fallback?.message ?? "diagnostics.error.operationMessage";
  const fallbackHint = fallback?.hint ?? "diagnostics.error.operationHint";
  if (typeof result.error === "string") {
    return {
      tone: "error",
      title: t(fallbackTitle),
      text: t(fallbackMessage),
      ...(fallback ? { hint: t(fallbackHint) } : {}),
      technical: result.error,
    };
  }
  if (hasLocalizedUserError(result.error)) {
    const localized = localizeUserError(result.error, t);
    return {
      tone: "error",
      title: localized.title,
      text: localized.message,
      hint: localized.hint,
      technical: userErrorTechnicalDetails(result.error),
    };
  }
  if (result.error.code === "backend_unavailable") {
    return {
      tone: "error",
      title: t("diagnostics.error.bridgeTitle"),
      text: t(fallbackMessage),
      hint: t("diagnostics.error.bridgeHint"),
      technical: result.error.technical,
    };
  }
  const translated = translatedDiagnosticsErrors[result.error.code];
  return {
    tone: "error",
    title: t(fallbackTitle),
    text: translated
      ? t(translated.message)
      : t(fallbackMessage),
    hint: translated
      ? t(translated.hint)
      : t(fallbackHint),
    technical: translated
      ? result.error.technical
      : structuredErrorDetails(result.error),
  };
}

export function bridgeIssue(
  error: unknown,
  message: string,
  t: Translate,
): DiagnosticsNotice {
  return {
    tone: "error",
    title: t("diagnostics.error.bridgeTitle"),
    text: message,
    hint: t("diagnostics.error.bridgeHint"),
    technical: errorText(error),
  };
}

export function parseHeaders(
  input: string,
  t: Translate,
): Record<string, string> {
  const value = input.trim();
  if (!value) return {};
  if (value.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(t("diagnostics.error.headersJSON"));
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error(t("diagnostics.error.headersObject"));
    }
    const headers: Record<string, string> = {};
    for (const [key, item] of Object.entries(parsed)) {
      if (!key.trim() || typeof item !== "string") {
        throw new Error(t("diagnostics.error.headersText"));
      }
      headers[key.trim()] = item;
    }
    return headers;
  }
  const headers: Record<string, string> = {};
  value.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const separator = line.indexOf(":");
    if (separator < 1) {
      throw new Error(
        t("diagnostics.error.headerLine", { line: index + 1 }),
      );
    }
    headers[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .trim();
  });
  return headers;
}

export function parseList(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateURLPerformanceTarget(
  input: string,
  t: Translate,
): string {
  const value = input.trim();
  if (!value) {
    throw new Error(t("diagnostics.performance.urlRequired"));
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(t("diagnostics.performance.urlInvalid"));
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(t("diagnostics.performance.urlProtocol"));
  }
  if (!parsed.hostname) {
    throw new Error(t("diagnostics.performance.urlInvalid"));
  }
  if (parsed.username || parsed.password) {
    throw new Error(t("diagnostics.performance.urlCredentials"));
  }
  if (parsed.hash || value.includes("#")) {
    throw new Error(t("diagnostics.performance.urlFragment"));
  }
  return value;
}

export function validateURLPerformanceOptions(
  sampleCount: number,
  timeoutMs: number,
  t: Translate,
): void {
  if (
    !Number.isSafeInteger(sampleCount) ||
    sampleCount < urlPerformanceLimits.minimumSamples ||
    sampleCount > urlPerformanceLimits.maximumSamples
  ) {
    throw new Error(
      t("diagnostics.performance.sampleRange", {
        max: urlPerformanceLimits.maximumSamples,
      }),
    );
  }
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < urlPerformanceLimits.minimumTimeoutMs ||
    timeoutMs > urlPerformanceLimits.maximumRepresentableTimeoutMs
  ) {
    throw new Error(t("diagnostics.performance.timeoutRange"));
  }
}

export function appendURLPerformanceReport(
  summary: URLPerformanceSummary | undefined,
  report: NetworkReport,
  error?: string,
  failureCategory?: string,
): URLPerformanceSummary {
  const durationMs = Math.max(0, report.totalDurationMs);
  const completedSamples = (summary?.completedSamples ?? 0) + 1;
  const statusCode = report.finalStatusCode ?? 0;
  const success = !error && statusCode >= 200 && statusCode < 400;
  const dnsLookups = report.dnsLookups ?? [];
  const hops = report.hops ?? [];
  const dnsDurationMs = dnsLookups.reduce(
    (total, lookup) => total + Math.max(0, lookup.durationMs),
    0,
  );
  const requestDurationMs = hops.reduce(
    (total, hop) => total + Math.max(0, hop.durationMs),
    0,
  );
  const redirectCount = hops.filter(
    (hop) =>
      followedRedirectStatusCodes.has(hop.statusCode) &&
      Boolean(hop.location?.trim()),
  ).length;
  const sample: URLPerformanceSample = {
    number: completedSamples,
    statusCode,
    durationMs,
    dnsDurationMs,
    requestDurationMs,
    redirectCount,
    method: hops.at(-1)?.method ?? "HEAD",
    usedGetFallback: report.usedGetFallback,
    success,
    ...(error ? { error } : {}),
    ...(failureCategory ? { failureCategory } : {}),
    finalURL: report.finalUrl ?? report.inputUrl,
  };
  const samples = [...(summary?.samples ?? []), sample].slice(
    -urlPerformanceLimits.retainedSampleDetails,
  );
  const statusKey =
    statusCode > 0
      ? String(statusCode)
      : (failureCategory ?? "network-error");
  const statusCounts = {
    ...(summary?.statusCounts ?? {}),
    [statusKey]: (summary?.statusCounts[statusKey] ?? 0) + 1,
  };

  if (!summary) {
    return {
      samples,
      durationValuesMs: [durationMs],
      durationValueCursor: 0,
      completedSamples,
      successfulSamples: success ? 1 : 0,
      failedSamples: success ? 0 : 1,
      fastestMs: durationMs,
      averageMs: durationMs,
      durationM2: 0,
      slowestMs: durationMs,
      totalDurationMs: durationMs,
      totalDNSDurationMs: dnsDurationMs,
      totalRequestDurationMs: requestDurationMs,
      redirectedSamples: redirectCount > 0 ? 1 : 0,
      fallbackSamples: report.usedGetFallback ? 1 : 0,
      statusCounts,
    };
  }

  const durationValuesMs = [...summary.durationValuesMs];
  let durationValueCursor = summary.durationValueCursor;
  if (
    durationValuesMs.length <
    urlPerformanceLimits.retainedPercentileSamples
  ) {
    durationValuesMs.push(durationMs);
  } else {
    durationValuesMs[durationValueCursor] = durationMs;
    durationValueCursor =
      (durationValueCursor + 1) %
      urlPerformanceLimits.retainedPercentileSamples;
  }

  return {
    samples,
    durationValuesMs,
    durationValueCursor,
    completedSamples,
    successfulSamples: summary.successfulSamples + (success ? 1 : 0),
    failedSamples: summary.failedSamples + (success ? 0 : 1),
    fastestMs: Math.min(summary.fastestMs, durationMs),
    averageMs:
      summary.averageMs +
      (durationMs - summary.averageMs) / completedSamples,
    durationM2:
      summary.durationM2 +
      (durationMs - summary.averageMs) *
        (durationMs -
          (summary.averageMs +
            (durationMs - summary.averageMs) / completedSamples)),
    slowestMs: Math.max(summary.slowestMs, durationMs),
    totalDurationMs: summary.totalDurationMs + durationMs,
    ...(summary.elapsedTimeMs === undefined
      ? {}
      : { elapsedTimeMs: summary.elapsedTimeMs }),
    totalDNSDurationMs: summary.totalDNSDurationMs + dnsDurationMs,
    totalRequestDurationMs:
      summary.totalRequestDurationMs + requestDurationMs,
    redirectedSamples:
      summary.redirectedSamples + (redirectCount > 0 ? 1 : 0),
    fallbackSamples:
      summary.fallbackSamples + (report.usedGetFallback ? 1 : 0),
    statusCounts,
  };
}

export function summarizeURLPerformance(
  reports: readonly NetworkReport[],
): URLPerformanceSummary | undefined {
  return reports.reduce<URLPerformanceSummary | undefined>(
    (summary, report) => appendURLPerformanceReport(summary, report),
    undefined,
  );
}

function percentile(sortedValues: readonly number[], value: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;
  const position = (sortedValues.length - 1) * value;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex] ?? 0;
  const upper = sortedValues[upperIndex] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

export function urlPerformanceStatistics(
  summary: URLPerformanceSummary,
): URLPerformanceStatistics {
  const values = [...summary.durationValuesMs].sort(
    (left, right) => left - right,
  );
  const variance =
    summary.completedSamples > 0
      ? summary.durationM2 / summary.completedSamples
      : 0;
  return {
    medianMs: percentile(values, 0.5),
    p90Ms: percentile(values, 0.9),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    standardDeviationMs: Math.sqrt(variance),
    errorRate:
      summary.completedSamples > 0
        ? (summary.failedSamples / summary.completedSamples) * 100
        : 0,
    throughputPerSecond:
      (summary.elapsedTimeMs ?? summary.totalDurationMs) > 0
        ? (summary.completedSamples * 1_000) /
          (summary.elapsedTimeMs ?? summary.totalDurationMs)
        : 0,
    averageDNSMs:
      summary.completedSamples > 0
        ? summary.totalDNSDurationMs / summary.completedSamples
        : 0,
    averageRequestMs:
      summary.completedSamples > 0
        ? summary.totalRequestDurationMs / summary.completedSamples
        : 0,
    percentileSampleCount: values.length,
    percentilesTruncated: values.length < summary.completedSamples,
  };
}

export function formatURLPerformanceDuration(
  durationMs: number,
  locale: Locale,
): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "—";
  if (durationMs < 1) return "< 1 ms";
  return `${durationMs.toLocaleString(locale, {
    maximumFractionDigits: 1,
  })} ms`;
}

export function formatUnknown(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatEpoch(value: number | undefined, locale: Locale): string {
  if (value === undefined) return "—";
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString(locale);
}

export function formatEnvironmentDuration(
  response: EnvironmentCompareResult["responses"][number],
  locale: Locale,
): string {
  return `${response.durationMs.toLocaleString(locale)} ms`;
}

export function responseHeadersText(response?: ResponseEnvelope): string {
  if (!response) return "";
  const headers = { ...response.headers };
  if (
    response.traceId &&
    !Object.keys(headers).some((key) =>
      ["x-trace-id", "x-request-id", "traceparent"].includes(key.toLowerCase()),
    )
  ) {
    headers["X-Trace-ID"] = [response.traceId];
  }
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(headers).map(([key, values]) => [
        key,
        values.join(", "),
      ]),
    ),
    null,
    2,
  );
}

export function componentStatus(value: unknown, t: Translate): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const status = (value as { status?: unknown }).status;
    if (typeof status === "string") return status;
  }
  return t("diagnostics.runtime.unknown");
}

const springSuggestionKeys: Record<
  SpringErrorAnalysis["category"],
  readonly [
    | "diagnostics.spring.advice.problemDetail.1"
    | "diagnostics.spring.advice.validation.1"
    | "diagnostics.spring.advice.unauthorized.1"
    | "diagnostics.spring.advice.forbidden.1"
    | "diagnostics.spring.advice.notFound.1"
    | "diagnostics.spring.advice.conflict.1"
    | "diagnostics.spring.advice.serverError.1"
    | "diagnostics.spring.advice.httpError.1",
    | "diagnostics.spring.advice.problemDetail.2"
    | "diagnostics.spring.advice.validation.2"
    | "diagnostics.spring.advice.unauthorized.2"
    | "diagnostics.spring.advice.forbidden.2"
    | "diagnostics.spring.advice.notFound.2"
    | "diagnostics.spring.advice.conflict.2"
    | "diagnostics.spring.advice.serverError.2"
    | "diagnostics.spring.advice.httpError.2",
  ]
> = {
  "problem-detail": [
    "diagnostics.spring.advice.problemDetail.1",
    "diagnostics.spring.advice.problemDetail.2",
  ],
  validation: [
    "diagnostics.spring.advice.validation.1",
    "diagnostics.spring.advice.validation.2",
  ],
  unauthorized: [
    "diagnostics.spring.advice.unauthorized.1",
    "diagnostics.spring.advice.unauthorized.2",
  ],
  forbidden: [
    "diagnostics.spring.advice.forbidden.1",
    "diagnostics.spring.advice.forbidden.2",
  ],
  "not-found": [
    "diagnostics.spring.advice.notFound.1",
    "diagnostics.spring.advice.notFound.2",
  ],
  conflict: [
    "diagnostics.spring.advice.conflict.1",
    "diagnostics.spring.advice.conflict.2",
  ],
  "server-error": [
    "diagnostics.spring.advice.serverError.1",
    "diagnostics.spring.advice.serverError.2",
  ],
  "http-error": [
    "diagnostics.spring.advice.httpError.1",
    "diagnostics.spring.advice.httpError.2",
  ],
};

const springStatusSuggestionKeys = {
  400: "diagnostics.spring.advice.status400",
  401: "diagnostics.spring.advice.status401",
  403: "diagnostics.spring.advice.status403",
  500: "diagnostics.spring.advice.status500",
} as const;

export function springAdvice(
  analysis: SpringErrorAnalysis,
  t: Translate,
): string[] {
  const statusKey =
    springStatusSuggestionKeys[
      analysis.status as keyof typeof springStatusSuggestionKeys
    ];
  return [
    ...springSuggestionKeys[analysis.category].map((key) => t(key)),
    ...(statusKey ? [t(statusKey)] : []),
  ].filter((item, index, items) => items.indexOf(item) === index);
}

export function jwtErrorText(error: unknown, t: Translate): string {
  if (error instanceof DeveloperToolError) {
    if (error.code === "jwt.threeParts") {
      return t("diagnostics.jwt.threeParts");
    }
    if (error.code === "jwt.invalidBase64") {
      return t("diagnostics.jwt.invalidBase64");
    }
    if (error.code === "jwt.invalidJSON") {
      return t("diagnostics.jwt.invalidJSON");
    }
  }
  return errorText(error);
}

export function localizeSpringFallbacks(
  analysis: SpringErrorAnalysis,
  rawBody: string,
  t: Translate,
): SpringErrorAnalysis {
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid response bodies are still useful for status-based diagnostics.
  }
  const hasText = (...names: string[]) =>
    names.some(
      (name) => typeof body[name] === "string" && body[name].trim() !== "",
    );
  const titleKeys = {
    "problem-detail": "diagnostics.spring.defaultTitle.problemDetail",
    validation: "diagnostics.spring.defaultTitle.validation",
    unauthorized: "diagnostics.spring.defaultTitle.unauthorized",
    forbidden: "diagnostics.spring.defaultTitle.forbidden",
    "not-found": "diagnostics.spring.defaultTitle.notFound",
    conflict: "diagnostics.spring.defaultTitle.conflict",
    "server-error": "diagnostics.spring.defaultTitle.serverError",
    "http-error": "diagnostics.spring.defaultTitle.httpError",
  } as const;
  return {
    ...analysis,
    title: hasText("title", "error")
      ? analysis.title
      : t(titleKeys[analysis.category]),
    detail: hasText("detail", "message", "error_description")
      ? analysis.detail
      : t("diagnostics.spring.noDetails"),
  };
}

export function parseKnownEndpoints(
  input: string,
  t: Translate,
): CoverageInput["known"] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const match = line.match(/^([A-Za-z-]+)\s+(\S+)$/);
      if (!match) {
        throw new Error(
          t("diagnostics.error.knownLine", { line: index + 1 }),
        );
      }
      return { method: match[1].toUpperCase(), path: match[2] };
    });
}

export function parseObservedCalls(
  input: string,
  t: Translate,
): CoverageInput["observed"] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const match = line.match(/^([A-Za-z-]+)\s+(\S+?)(?:\s+\[(\d+)])?$/);
      if (!match) {
        throw new Error(
          t("diagnostics.error.observedLine", { line: index + 1 }),
        );
      }
      const count = match[3] ? Number(match[3]) : 1;
      if (!Number.isSafeInteger(count) || count < 1) {
        throw new Error(
          t("diagnostics.error.observedCount", { line: index + 1 }),
        );
      }
      return { method: match[1].toUpperCase(), path: match[2], count };
    });
}
