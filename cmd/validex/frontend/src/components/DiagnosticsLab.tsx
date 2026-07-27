import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
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
import { backend } from "../lib/backend";
import {
  analyzeJWT,
  analyzeSpringError,
  type JWTAnalysis,
  type SpringErrorAnalysis,
} from "../lib/developerTools";
import type { ResponseEnvelope, UserError } from "../lib/types";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { Button } from "./ui";

type DiagnosticsMode =
  | "spring"
  | "jwt"
  | "runtime"
  | "environments"
  | "thread-logs"
  | "coverage";

interface DiagnosticsNotice {
  tone: "error" | "success" | "info";
  text: string;
  title?: string;
  hint?: string;
  technical?: string;
}

interface PendingOperation {
  id: number;
  inputSignature: string;
}

interface MetricSample {
  name?: string;
  description?: string;
  baseUnit?: string;
  measurements?: Record<string, number>;
  availableTags?: Array<{ tag: string; values: string[] }>;
}

interface MetricSnapshot {
  capturedAt?: string;
  metrics?: Record<string, MetricSample>;
  failures?: Record<string, string>;
}

interface MetricDelta {
  metric: string;
  statistic: string;
  before?: number;
  after?: number;
  delta?: number;
  percentChange?: number;
}

interface ActuatorResult {
  health?: {
    status?: string;
    components?: Record<string, unknown>;
    groups?: string[];
    data?: Record<string, unknown>;
  };
  mappings?: {
    contexts?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };
  metrics?: MetricSnapshot;
  snapshot?: MetricSnapshot;
  metricSnapshot?: MetricSnapshot;
  deltas?: MetricDelta[];
  metricDeltas?: MetricDelta[];
  error?: UserError | string;
}

interface EnvironmentResponse {
  name?: string;
  url?: string;
  statusCode?: number;
  duration?: number;
  durationMs?: number;
  headers?: Record<string, string[]>;
  body?: string;
  contentType?: string;
  truncated?: boolean;
  error?: string;
}

interface JSONEnvironmentDifference {
  path?: string;
  kind?: string;
  baseline?: unknown;
  candidate?: unknown;
}

interface EnvironmentDiff {
  baseline?: string;
  candidate?: string;
  statusMatch?: boolean;
  baselineStatus?: number;
  candidateStatus?: number;
  headerDifferences?: string[];
  headerDifferencesTruncated?: boolean;
  bodyEqual?: boolean;
  bodyMode?: string;
  jsonDifferences?: JSONEnvironmentDifference[];
  jsonDifferencesTruncated?: boolean;
  error?: string;
}

interface EnvironmentCompareResult {
  method?: string;
  path?: string;
  responses?: EnvironmentResponse[];
  comparisons?: EnvironmentDiff[];
  error?: UserError | string;
}

interface ThreadDumpResult {
  threadCount?: number;
  stateCounts?: Record<string, number>;
  blockedThreads?: Array<{
    name?: string;
    state?: string;
    clues?: string[];
  }>;
  deadlockDetected?: boolean;
  deadlockClues?: string[];
  repeatedStacks?: Array<{
    count?: number;
    frames?: string[];
    threads?: string[];
  }>;
  truncated?: boolean;
  error?: UserError | string;
}

interface LogSearchResult {
  query?: string;
  matches?: Array<{ lineNumber?: number; line?: string }>;
  scannedLines?: number;
  truncated?: boolean;
  error?: UserError | string;
}

interface CoverageResult {
  totalKnown?: number;
  covered?: number;
  coveragePercent?: number;
  endpoints?: Array<{
    method?: string;
    path?: string;
    hitCount?: number;
    observedPaths?: string[];
  }>;
  unknownObserved?: Array<{
    method?: string;
    path?: string;
    count?: number;
  }>;
  error?: UserError | string;
}

interface DiagnosticsBackend {
  inspectActuator(input: {
    baseUrl: string;
    headers: Record<string, string>;
    timeoutMs: number;
    metricNames: string[];
    includeMappings: boolean;
    before?: MetricSnapshot;
  }): Promise<ActuatorResult>;
  compareEnvironments(input: {
    method: string;
    path: string;
    headers: Record<string, string[]>;
    body: string;
    targets: Array<{ name: string; baseUrl: string }>;
    ignoreJsonPaths: string[];
    ignoreHeaders: string[];
    allowUnsafe: boolean;
    timeoutMs: number;
  }): Promise<EnvironmentCompareResult>;
  analyzeThreadDump(input: { text: string }): Promise<ThreadDumpResult>;
  searchTraceLog(input: {
    text: string;
    query: string;
    caseSensitive: boolean;
  }): Promise<LogSearchResult>;
  analyzeEndpointCoverage(input: {
    known: Array<{ method: string; path: string }>;
    observed: Array<{ method: string; path: string; count: number }>;
  }): Promise<CoverageResult>;
}

const diagnosticsBackend = backend as unknown as DiagnosticsBackend;

const modes: Array<{
  id: DiagnosticsMode;
  label: string;
  icon: ComponentType<{ size?: number }>;
}> = [
  { id: "spring", label: "Spring Error", icon: Bug },
  { id: "jwt", label: "JWT", icon: KeyRound },
  { id: "runtime", label: "Runtime", icon: Gauge },
  { id: "environments", label: "Environments", icon: ArrowLeftRight },
  { id: "thread-logs", label: "Thread & Logs", icon: TerminalSquare },
  { id: "coverage", label: "Coverage", icon: ListChecks },
];

const defaultMetricNames = [
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

const panelStyle = {
  padding: 14,
  gap: 12,
} as const;

const fieldStyle = {
  display: "grid",
  gap: 5,
  minWidth: 0,
  color: "var(--text-secondary)",
  fontSize: 10,
  fontWeight: 620,
} as const;

function errorText(error: unknown): string {
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

function resultIssue(
  result: { error?: UserError | string } | null,
): DiagnosticsNotice | null {
  if (!result?.error) return null;
  if (typeof result.error === "string") {
    return {
      tone: "error",
      title: "Diagnostics işlemi tamamlanamadı",
      text: "Masaüstü backend’i işlem sonucunu uygulayamadı.",
      technical: result.error,
    };
  }
  return {
    tone: "error",
    title: result.error.title || "Diagnostics işlemi tamamlanamadı",
    text: result.error.message,
    hint: result.error.hint,
    technical: result.error.technical,
  };
}

function bridgeIssue(error: unknown, message: string): DiagnosticsNotice {
  return {
    tone: "error",
    title: "Validex backend bağlantısı kesildi",
    text: message,
    hint: "Masaüstü uygulamasının çalıştığını kontrol edip yeniden deneyin.",
    technical: errorText(error),
  };
}

function parseHeaders(input: string): Record<string, string> {
  const value = input.trim();
  if (!value) return {};
  if (value.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Headers geçerli bir JSON object değil.");
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Headers bir JSON object olmalı.");
    }
    const headers: Record<string, string> = {};
    for (const [key, item] of Object.entries(parsed)) {
      if (!key.trim() || typeof item !== "string") {
        throw new Error("Header adları ve değerleri metin olmalı.");
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
      throw new Error(`${index + 1}. header satırı “Ad: değer” biçiminde olmalı.`);
    }
    headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  });
  return headers;
}

function parseList(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatUnknown(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatEpoch(value?: number): string {
  if (value === undefined) return "—";
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("tr-TR");
}

function formatDuration(response: EnvironmentResponse): string {
  if (typeof response.durationMs === "number") {
    return `${response.durationMs.toLocaleString("tr-TR")} ms`;
  }
  if (typeof response.duration !== "number") return "—";
  const milliseconds =
    response.duration > 1_000_000
      ? response.duration / 1_000_000
      : response.duration;
  return `${milliseconds.toLocaleString("tr-TR", {
    maximumFractionDigits: 1,
  })} ms`;
}

function metricSnapshot(result: ActuatorResult | null): MetricSnapshot | undefined {
  return result?.metrics ?? result?.snapshot ?? result?.metricSnapshot;
}

function metricDeltas(result: ActuatorResult | null): MetricDelta[] {
  return result?.deltas ?? result?.metricDeltas ?? [];
}

function responseHeadersText(response?: ResponseEnvelope): string {
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
      Object.entries(headers).map(([key, values]) => [key, values.join(", ")]),
    ),
    null,
    2,
  );
}

function componentStatus(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const status = (value as { status?: unknown }).status;
    if (typeof status === "string") return status;
  }
  return "Bilinmiyor";
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
  const suggestions: Record<SpringErrorAnalysis["category"], string[]> = {
    "problem-detail": [
      "type ve instance alanlarını aynı hata ailesindeki yanıtlarla karşılaştırın.",
      "Trace ID varsa log aramasına geçerek aynı isteğin sunucu kaydını bulun.",
    ],
    validation: [
      "Field error listesindeki alan adlarını request body ile karşılaştırın.",
      "DTO üzerindeki Bean Validation constraint ve nullability kurallarını kontrol edin.",
    ],
    unauthorized: [
      "Authorization header’ın gönderildiğini ve token’ın süresinin dolmadığını kontrol edin.",
      "Issuer ve audience değerlerini JWT ekranında inceleyin.",
    ],
    forbidden: [
      "Token içindeki role ve scope değerlerini endpoint yetki kuralıyla karşılaştırın.",
      "Kimlik doğrulama başarılı olsa bile kaynağa erişim izni eksik olabilir.",
    ],
    "not-found": [
      "Base URL, context path ve endpoint methodunu doğrulayın.",
      "Actuator mappings açıksa endpoint’in çalışan serviste kayıtlı olduğunu kontrol edin.",
    ],
    conflict: [
      "Aynı unique alanı veya mevcut kaynak sürümünü kullanan başka kayıt olup olmadığını kontrol edin.",
      "Response detail içindeki domain kuralını request verisiyle karşılaştırın.",
    ],
    "server-error": [
      "Trace ID ile log kaydını bulun; exception ve ilk root-cause satırına odaklanın.",
      "Runtime ekranından thread, heap, GC ve connection pool değerlerini kontrol edin.",
    ],
    "http-error": [
      "Status, response detail ve gönderilen request içeriğini birlikte değerlendirin.",
      "Aynı isteği bilinen çalışan ortamla karşılaştırın.",
    ],
  };
  const statusSuggestions: Record<number, string[]> = {
    400: [
      "Request JSON syntax, Content-Type, alan tipleri ve zorunlu alanları kontrol edin.",
    ],
    401: [
      "Token’ın expiration, issuer ve audience claim’lerini JWT ekranında doğrulayın.",
    ],
    403: [
      "Endpoint’in beklediği role/scope ile token claim’lerini karşılaştırın.",
    ],
    500: [
      "Trace ID ile aynı isteğin loglarını arayın ve Runtime snapshot’ını inceleyin.",
    ],
  };
  const advice = [
    ...suggestions[analysis.category],
    ...(statusSuggestions[analysis.status] ?? []),
  ].filter((item, index, items) => items.indexOf(item) === index);

  return (
    <div className="diagnostics-result-stack">
      <article className="tool-panel" style={panelStyle}>
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
            <dt>Kategori</dt>
            <dd>{analysis.category}</dd>
          </div>
          <div>
            <dt>Spring biçimi</dt>
            <dd>{analysis.recognized ? "Tanındı" : "Genel HTTP response"}</dd>
          </div>
          <div>
            <dt>Trace / Request ID</dt>
            <dd>{analysis.traceId ?? "Bulunamadı"}</dd>
          </div>
          <div>
            <dt>Exception</dt>
            <dd>{analysis.exception ?? "Response içinde yok"}</dd>
          </div>
          <div>
            <dt>Instance</dt>
            <dd>{analysis.instance ?? "—"}</dd>
          </div>
        </dl>
      </article>

      {analysis.fieldErrors.length > 0 && (
        <article className="tool-panel">
          <div className="tool-card-header">
            <div>
              <strong>Bean Validation</strong>
              <span>{analysis.fieldErrors.length} alan hatası ayrıştırıldı</span>
            </div>
          </div>
          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table">
              <thead>
                <tr>
                  <th>Alan</th>
                  <th>Mesaj</th>
                  <th>Reddedilen değer</th>
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

      <article className="tool-panel" style={panelStyle}>
        <strong>Kontrol listesi</strong>
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
  return (
    <div className="diagnostics-result-stack">
      <Notice tone="info">
        Token yalnızca yerel olarak çözüldü. İmza ve token güvenilirliği doğrulanmadı.
      </Notice>
      <article className="tool-panel" style={panelStyle}>
        <div className="diagnostics-summary-row">
          {analysis.active ? (
            <CheckCircle2 size={22} color="var(--success)" aria-hidden />
          ) : (
            <ShieldAlert size={22} color="var(--danger)" aria-hidden />
          )}
          <div>
            <strong>{analysis.active ? "Token zaman aralığında aktif" : "Token aktif değil"}</strong>
            <p>
              {analysis.expired
                ? "Token süresi dolmuş."
                : analysis.signaturePresent
                  ? "Signature bölümü mevcut fakat cryptographic doğrulama yapılmadı."
                  : "Token signature bölümü boş."}
            </p>
          </div>
        </div>
        <dl className="diagnostics-facts">
          <div><dt>Algoritma</dt><dd>{analysis.algorithm ?? "—"}</dd></div>
          <div><dt>Subject</dt><dd>{analysis.subject ?? "—"}</dd></div>
          <div><dt>Issuer</dt><dd>{analysis.issuer ?? "—"}</dd></div>
          <div><dt>Audience</dt><dd>{analysis.audience.join(", ") || "—"}</dd></div>
          <div><dt>Issued at</dt><dd>{formatEpoch(analysis.issuedAt)}</dd></div>
          <div><dt>Expires</dt><dd>{formatEpoch(analysis.expiresAt)}</dd></div>
          <div><dt>Not before</dt><dd>{formatEpoch(analysis.notBefore)}</dd></div>
        </dl>
      </article>
      <div className="diagnostics-two-column">
        <article className="tool-panel" style={panelStyle}>
          <strong>Roles</strong>
          <div className="diagnostics-chip-list">
            {analysis.roles.length > 0
              ? analysis.roles.map((role) => <code key={role}>{role}</code>)
              : <span>Role claim bulunamadı.</span>}
          </div>
        </article>
        <article className="tool-panel" style={panelStyle}>
          <strong>Scopes</strong>
          <div className="diagnostics-chip-list">
            {analysis.scopes.length > 0
              ? analysis.scopes.map((scope) => <code key={scope}>{scope}</code>)
              : <span>Scope claim bulunamadı.</span>}
          </div>
        </article>
      </div>
      <details className="tool-panel diagnostics-details">
        <summary>Header ve payload</summary>
        <pre>{JSON.stringify({ header: analysis.header, payload: analysis.payload }, null, 2)}</pre>
      </details>
    </div>
  );
}

function RuntimeResult({
  result,
  baseline,
}: {
  result: ActuatorResult;
  baseline?: MetricSnapshot;
}) {
  const snapshot = metricSnapshot(result);
  const metrics = Object.entries(snapshot?.metrics ?? {});
  const deltas = metricDeltas(result);
  const components = Object.entries(result.health?.components ?? {});
  const mappingContexts = Object.keys(
    result.mappings?.contexts ??
      (result.mappings?.data?.contexts as Record<string, unknown> | undefined) ??
      {},
  );

  return (
    <div className="diagnostics-result-stack">
      <div className="diagnostics-runtime-cards">
        <article className="tool-panel" style={panelStyle}>
          <span className="tool-eyebrow">HEALTH</span>
          <strong className="diagnostics-big-value">
            {result.health?.status ?? "Bilinmiyor"}
          </strong>
          <span>{components.length} component</span>
        </article>
        <article className="tool-panel" style={panelStyle}>
          <span className="tool-eyebrow">METRICS</span>
          <strong className="diagnostics-big-value">{metrics.length}</strong>
          <span>
            {snapshot?.capturedAt
              ? new Date(snapshot.capturedAt).toLocaleTimeString("tr-TR")
              : "Snapshot zamanı yok"}
          </span>
        </article>
        <article className="tool-panel" style={panelStyle}>
          <span className="tool-eyebrow">BASELINE</span>
          <strong className="diagnostics-big-value">
            {baseline ? `${deltas.length} delta` : "Yok"}
          </strong>
          <span>{baseline ? "Önce / sonra karşılaştırması" : "Baseline alabilirsiniz"}</span>
        </article>
        <article className="tool-panel" style={panelStyle}>
          <span className="tool-eyebrow">MAPPINGS</span>
          <strong className="diagnostics-big-value">
            {result.mappings ? mappingContexts.length : "Kapalı"}
          </strong>
          <span>{result.mappings ? "application context" : "İstenmedi"}</span>
        </article>
      </div>

      {components.length > 0 && (
        <article className="tool-panel">
          <div className="tool-card-header">
            <div>
              <strong>Health components</strong>
              <span>Actuator health ağacının üst seviyesi</span>
            </div>
          </div>
          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table">
              <thead>
                <tr><th>Component</th><th>Status</th></tr>
              </thead>
              <tbody>
                {components.map(([name, value]) => (
                  <tr key={name}>
                    <td><code>{name}</code></td>
                    <td>{componentStatus(value)}</td>
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
              <strong>Metric snapshot</strong>
              <span>Seçili JVM ve dependency metrikleri</span>
            </div>
          </div>
          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table">
              <thead>
                <tr><th>Metric</th><th>Statistic</th><th>Değer</th><th>Birim</th></tr>
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
                            ? value.toLocaleString("tr-TR", { maximumFractionDigits: 3 })
                            : "Ölçüm yok"}
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
              <strong>Baseline farkı</strong>
              <span>İlk snapshot ile son snapshot arasındaki değişim</span>
            </div>
          </div>
          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table">
              <thead>
                <tr><th>Metric</th><th>Önce</th><th>Sonra</th><th>Delta</th><th>%</th></tr>
              </thead>
              <tbody>
                {deltas.map((delta) => (
                  <tr key={`${delta.metric}-${delta.statistic}`}>
                    <td><code>{delta.metric} · {delta.statistic}</code></td>
                    <td>{delta.before?.toLocaleString("tr-TR") ?? "—"}</td>
                    <td>{delta.after?.toLocaleString("tr-TR") ?? "—"}</td>
                    <td>{delta.delta?.toLocaleString("tr-TR") ?? "—"}</td>
                    <td>
                      {delta.percentChange === undefined
                        ? "—"
                        : `${delta.percentChange.toLocaleString("tr-TR", {
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
          Bazı metric endpoint’leri açık değil:{" "}
          {Object.keys(snapshot.failures).join(", ")}
        </Notice>
      )}
    </div>
  );
}

function EnvironmentResult({ result }: { result: EnvironmentCompareResult }) {
  const responses = result.responses ?? [];
  const comparisons = result.comparisons ?? [];
  return (
    <div className="diagnostics-result-stack">
      <div className="diagnostics-runtime-cards">
        {responses.map((response, index) => (
          <article className="tool-panel" style={panelStyle} key={`${response.name}-${index}`}>
            <span className="tool-eyebrow">{response.name || `ENV ${index + 1}`}</span>
            <strong className="diagnostics-big-value">
              {response.error ? "Hata" : response.statusCode || "—"}
            </strong>
            <span>{formatDuration(response)}</span>
            <small title={response.url}>{response.url || "URL yok"}</small>
            {response.truncated && <span>Body boyut sınırında kesildi</span>}
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
                  {comparison.baseline || "Baseline"} → {comparison.candidate || "Environment"}
                </strong>
                <span>
                  Status {comparison.statusMatch ? "aynı" : "farklı"} · Body{" "}
                  {comparison.bodyEqual ? "aynı" : "farklı"}
                </span>
              </div>
              <span
                className={cn(
                  "diagnostics-status",
                  (!comparison.statusMatch || !comparison.bodyEqual) && "danger",
                )}
              >
                {comparison.statusMatch && comparison.bodyEqual ? "Eşleşti" : "Fark var"}
              </span>
            </div>
            {comparison.error ? (
              <div style={{ padding: 14 }} className="diagnostics-error-text">
                {comparison.error}
              </div>
            ) : (
              <div className="diagnostics-comparison-body">
                <dl className="diagnostics-facts">
                  <div>
                    <dt>Status</dt>
                    <dd>{comparison.baselineStatus ?? "—"} → {comparison.candidateStatus ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Body modu</dt>
                    <dd>{comparison.bodyMode ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Header farkı</dt>
                    <dd>
                      {comparison.headerDifferences?.join(", ") || "Yok"}
                      {comparison.headerDifferencesTruncated && " · ilk 1000 fark"}
                    </dd>
                  </div>
                  <div>
                    <dt>JSON farkı</dt>
                    <dd>
                      {comparison.jsonDifferences?.length ?? 0}
                      {comparison.jsonDifferencesTruncated && " · sonuç sınırlandırıldı"}
                    </dd>
                  </div>
                </dl>
                {(comparison.jsonDifferences?.length ?? 0) > 0 && (
                  <div className="diagnostics-table-wrap">
                    <table className="diagnostics-table">
                      <thead>
                        <tr><th>Path</th><th>Tür</th><th>Baseline</th><th>Environment</th></tr>
                      </thead>
                      <tbody>
                        {comparison.jsonDifferences!.map((difference, differenceIndex) => (
                          <tr key={`${difference.path}-${differenceIndex}`}>
                            <td><code>{difference.path ?? "$"}</code></td>
                            <td>{difference.kind ?? "changed"}</td>
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
          title="Karşılaştırma sonucu yok"
          description="En az iki environment için karşılaştırmayı çalıştırın."
        />
      )}

      {responses.map((response, index) => (
        <details
          className="tool-panel diagnostics-details"
          key={`body-${response.name}-${index}`}
        >
          <summary>{response.name || `Environment ${index + 1}`} response body</summary>
          <pre>{response.body || response.error || "Body boş."}</pre>
        </details>
      ))}
    </div>
  );
}

function ThreadDumpResultView({ result }: { result: ThreadDumpResult }) {
  const states = Object.entries(result.stateCounts ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return (
    <div className="diagnostics-result-stack">
      {result.deadlockDetected && (
        <Notice tone="error">
          JVM dump içinde açık deadlock işareti bulundu. İlgili thread ve lock
          zincirlerini hemen inceleyin.
        </Notice>
      )}
      <div className="diagnostics-runtime-cards">
        <article className="tool-panel" style={panelStyle}>
          <span className="tool-eyebrow">THREADS</span>
          <strong className="diagnostics-big-value">{result.threadCount ?? 0}</strong>
          <span>{result.truncated ? "Sonuç sınırlandırıldı" : "Tam analiz"}</span>
        </article>
        {states.map(([state, count]) => (
          <article className="tool-panel" style={panelStyle} key={state}>
            <span className="tool-eyebrow">{state}</span>
            <strong className="diagnostics-big-value">{count}</strong>
            <span>thread</span>
          </article>
        ))}
      </div>

      {(result.blockedThreads?.length ?? 0) > 0 && (
        <article className="tool-panel">
          <div className="tool-card-header">
            <div>
              <strong>Blocked / lock bekleyen thread’ler</strong>
              <span>{result.blockedThreads!.length} bulgu</span>
            </div>
          </div>
          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table">
              <thead><tr><th>Thread</th><th>State</th><th>İpucu</th></tr></thead>
              <tbody>
                {result.blockedThreads!.map((thread, index) => (
                  <tr key={`${thread.name}-${index}`}>
                    <td><code>{thread.name ?? "adsız"}</code></td>
                    <td>{thread.state ?? "UNKNOWN"}</td>
                    <td><code>{thread.clues?.join(" · ") || "Lock detayı yok"}</code></td>
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
              <strong>Tekrar eden stack’ler</strong>
              <span>Benzer işte yığılmış thread grupları</span>
            </div>
          </div>
          <div className="diagnostics-stack-groups">
            {result.repeatedStacks!.map((stack, index) => (
              <details key={`${stack.frames?.[0]}-${index}`}>
                <summary>
                  {stack.count ?? 0} thread · {stack.threads?.slice(0, 3).join(", ") || "adsız"}
                </summary>
                <pre>{stack.frames?.join("\n") || "Stack frame yok"}</pre>
              </details>
            ))}
          </div>
        </article>
      )}

      {(result.deadlockClues?.length ?? 0) > 0 && (
        <details className="tool-panel diagnostics-details">
          <summary>Deadlock / lock ipuçları ({result.deadlockClues!.length})</summary>
          <pre>{result.deadlockClues!.join("\n")}</pre>
        </details>
      )}
    </div>
  );
}

function LogSearchResultView({ result }: { result: LogSearchResult }) {
  const matches = result.matches ?? [];
  return (
    <article className="tool-panel">
      <div className="tool-card-header">
        <div>
          <strong>{matches.length} eşleşme</strong>
          <span>{result.scannedLines ?? 0} satır tarandı</span>
        </div>
        {result.truncated && <span>Sonuç sınırlandırıldı</span>}
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
          title="Eşleşme bulunamadı"
          description="ID’nin tamamını ve büyük/küçük harf ayarını kontrol edin."
        />
      )}
    </article>
  );
}

function CoverageResultView({ result }: { result: CoverageResult }) {
  const percentage = result.coveragePercent ?? 0;
  return (
    <div className="diagnostics-result-stack">
      <article className="tool-panel diagnostics-coverage-summary" style={panelStyle}>
        <div
          className="diagnostics-coverage-ring"
          style={{
            background: `conic-gradient(var(--accent) ${Math.max(0, Math.min(100, percentage))}%, var(--surface-active) 0)`,
          }}
          aria-label={`Endpoint coverage yüzde ${percentage.toFixed(1)}`}
        >
          <span>{percentage.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%</span>
        </div>
        <div>
          <strong>{result.covered ?? 0} / {result.totalKnown ?? 0} endpoint çağrıldı</strong>
          <p>
            Bu oran yalnız sağlanan observed call listesine dayanır; kod coverage
            veya test coverage değildir.
          </p>
        </div>
      </article>

      <article className="tool-panel">
        <div className="tool-card-header">
          <div>
            <strong>Endpoint’ler</strong>
            <span>Known route → observed hit eşleşmesi</span>
          </div>
        </div>
        <div className="diagnostics-table-wrap">
          <table className="diagnostics-table">
            <thead><tr><th>Method</th><th>Path</th><th>Hit</th><th>Observed path</th></tr></thead>
            <tbody>
              {(result.endpoints ?? []).map((endpoint, index) => (
                <tr key={`${endpoint.method}-${endpoint.path}-${index}`}>
                  <td><code>{endpoint.method ?? "—"}</code></td>
                  <td><code>{endpoint.path ?? "/"}</code></td>
                  <td>{endpoint.hitCount ?? 0}</td>
                  <td>{endpoint.observedPaths?.join(", ") || "Henüz görülmedi"}</td>
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
              <strong>Known listesinde olmayan çağrılar</strong>
              <span>{result.unknownObserved!.length} route</span>
            </div>
          </div>
          <div className="diagnostics-chip-list" style={{ padding: 14 }}>
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

function parseKnownEndpoints(input: string): Array<{ method: string; path: string }> {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const match = line.match(/^([A-Za-z-]+)\s+(\S+)$/);
      if (!match) {
        throw new Error(`${index + 1}. known satırı “METHOD /path” biçiminde olmalı.`);
      }
      return { method: match[1].toUpperCase(), path: match[2] };
    });
}

function parseObservedCalls(
  input: string,
): Array<{ method: string; path: string; count: number }> {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const match = line.match(/^([A-Za-z-]+)\s+(\S+?)(?:\s+\[(\d+)])?$/);
      if (!match) {
        throw new Error(
          `${index + 1}. observed satırı “METHOD /path [count]” biçiminde olmalı.`,
        );
      }
      const count = match[3] ? Number(match[3]) : 1;
      if (!Number.isSafeInteger(count) || count < 1) {
        throw new Error(`${index + 1}. observed count pozitif bir tam sayı olmalı.`);
      }
      return { method: match[1].toUpperCase(), path: match[2], count };
    });
}

export function DiagnosticsLab() {
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
  const [runtimeResult, setRuntimeResult] = useState<ActuatorResult | null>(null);
  const [runtimeBaseline, setRuntimeBaseline] =
    useState<MetricSnapshot | undefined>();

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
        text: "Girdi veya araç değişti; önceki işlemin sonucu yok sayıldı.",
      });
    }
  }, [asyncInputSignature, busy]);

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
        text: "Aktif request sekmesinde analiz edilecek bir response yok.",
      });
      return;
    }
    setSpringBody(activeResponse.body);
    setSpringStatus(activeResponse.statusCode);
    setSpringHeaders(responseHeadersText(activeResponse));
    setSpringAnalysis(null);
    setNotice({
      tone: "success",
      text: `${activeTab?.name ?? "Aktif request"} response’u yüklendi.`,
    });
  };

  const runSpringAnalysis = () => {
    if (!springBody.trim()) {
      setNotice({ tone: "error", text: "Analiz için response body girin." });
      return;
    }
    try {
      const headers = parseHeaders(springHeaders);
      const normalizedHeaders = Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key, [value]]),
      );
      setSpringAnalysis(
        analyzeSpringError(springBody, springStatus, normalizedHeaders),
      );
      setNotice({
        tone: "success",
        text: "Spring hata response’u yerel olarak analiz edildi.",
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
        text: "JWT claim’leri yerel olarak çözüldü; signature doğrulanmadı.",
      });
    } catch (error) {
      setJWTAnalysis(null);
      setNotice({ tone: "error", text: errorText(error) });
    }
  };

  const inspectRuntime = async (captureBaseline: boolean) => {
    const baseUrl = actuatorURL.trim();
    if (!baseUrl) {
      setNotice({ tone: "error", text: "Actuator base URL girin." });
      return;
    }
    let headers: Record<string, string>;
    const selectedMetrics = parseList(metricNames);
    try {
      headers = parseHeaders(actuatorHeaders);
      if (selectedMetrics.length === 0) {
        throw new Error("En az bir Actuator metric adı girin.");
      }
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error) });
      return;
    }
    const operation = startAsyncOperation(
      captureBaseline ? "runtime-baseline" : "runtime",
    );
    try {
      const result = await diagnosticsBackend.inspectActuator({
        baseUrl,
        headers,
        timeoutMs: actuatorTimeout,
        metricNames: selectedMetrics,
        includeMappings,
        before: captureBaseline ? undefined : runtimeBaseline,
      });
      if (!isCurrentOperation(operation)) return;
      setRuntimeResult(result);
      const failure = resultIssue(result);
      if (failure) {
        setNotice(failure);
        return;
      }
      if (captureBaseline) {
        const snapshot = metricSnapshot(result);
        if (!snapshot) {
          setNotice({
            tone: "error",
            text: "Actuator yanıtında baseline olarak saklanabilir metric snapshot bulunamadı.",
          });
          return;
        }
        setRuntimeBaseline(snapshot);
        setNotice({
          tone: "success",
          text: "Metric baseline alındı. Serviste işlemi çalıştırıp yeni snapshot alın.",
        });
      } else {
        setNotice({
          tone: "success",
          text: runtimeBaseline
            ? "Runtime snapshot baseline ile karşılaştırıldı."
            : "Runtime snapshot alındı.",
        });
      }
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setNotice(
          bridgeIssue(
            error,
            captureBaseline
              ? "Runtime metric baseline’ı alınamadı."
              : "Runtime snapshot alınamadı.",
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
        text: "Karşılaştırma için en az iki environment base URL girin.",
      });
      return;
    }
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(environmentMethod);
    if (unsafe && !allowUnsafe) {
      setNotice({
        tone: "error",
        text: `${environmentMethod} birden fazla ortamda veri değiştirebilir. Önce açık izin kutusunu işaretleyin.`,
      });
      return;
    }
    let headers: Record<string, string>;
    try {
      headers = parseHeaders(environmentHeaders);
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error) });
      return;
    }
    const operation = startAsyncOperation("environments");
    try {
      const result = await diagnosticsBackend.compareEnvironments({
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
      const failure = resultIssue(result);
      setNotice(
        failure
          ? failure
          : {
              tone: "success",
              text: `${targets.length} environment karşılaştırıldı.`,
            },
      );
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setNotice(
          bridgeIssue(error, "Environment karşılaştırması tamamlanamadı."),
        );
      }
    } finally {
      finishAsyncOperation(operation);
    }
  };

  const analyzeThreads = async () => {
    if (!threadDump.trim()) {
      setNotice({ tone: "error", text: "Analiz için thread dump metni yapıştırın." });
      return;
    }
    const operation = startAsyncOperation("thread");
    try {
      const result = await diagnosticsBackend.analyzeThreadDump({ text: threadDump });
      if (!isCurrentOperation(operation)) return;
      setThreadResult(result);
      const failure = resultIssue(result);
      setNotice(
        failure
          ? failure
          : { tone: "success", text: `${result.threadCount ?? 0} thread analiz edildi.` },
      );
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setNotice(bridgeIssue(error, "Thread dump analizi tamamlanamadı."));
      }
    } finally {
      finishAsyncOperation(operation);
    }
  };

  const searchLogs = async () => {
    if (!logText.trim() || !traceQuery.trim()) {
      setNotice({
        tone: "error",
        text: "Log metnini ve aranacak trace/correlation ID’yi girin.",
      });
      return;
    }
    const operation = startAsyncOperation("logs");
    try {
      const result = await diagnosticsBackend.searchTraceLog({
        text: logText,
        query: traceQuery.trim(),
        caseSensitive,
      });
      if (!isCurrentOperation(operation)) return;
      setLogResult(result);
      const failure = resultIssue(result);
      setNotice(
        failure
          ? failure
          : {
              tone: "success",
              text: `${result.matches?.length ?? 0} log satırı bulundu.`,
            },
      );
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setNotice(bridgeIssue(error, "Trace/correlation ID araması tamamlanamadı."));
      }
    } finally {
      finishAsyncOperation(operation);
    }
  };

  const analyzeCoverage = async () => {
    let known: Array<{ method: string; path: string }>;
    let observed: Array<{ method: string; path: string; count: number }>;
    try {
      known = parseKnownEndpoints(knownEndpoints);
      observed = parseObservedCalls(observedCalls);
      if (known.length === 0) throw new Error("En az bir known endpoint girin.");
    } catch (error) {
      setNotice({ tone: "error", text: errorText(error) });
      return;
    }
    const operation = startAsyncOperation("coverage");
    try {
      const result = await diagnosticsBackend.analyzeEndpointCoverage({
        known,
        observed,
      });
      if (!isCurrentOperation(operation)) return;
      setCoverageResult(result);
      const failure = resultIssue(result);
      setNotice(
        failure
          ? failure
          : {
              tone: "success",
              text: `${result.covered ?? 0}/${result.totalKnown ?? 0} endpoint eşleşti.`,
            },
      );
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setNotice(bridgeIssue(error, "Endpoint coverage analizi tamamlanamadı."));
      }
    } finally {
      finishAsyncOperation(operation);
    }
  };

  const analyzeRecordedCoverage = async () => {
    const operation = startAsyncOperation("coverage-recorded");
    try {
      const result = await diagnosticsBackend.analyzeEndpointCoverage({
        known: [],
        observed: [],
      });
      if (!isCurrentOperation(operation)) return;
      setCoverageResult(result);
      const failure = resultIssue(result);
      setNotice(
        failure
          ? failure
          : {
              tone: "success",
              text: `${result.covered ?? 0}/${result.totalKnown ?? 0} endpoint bu oturumdaki request’lerle eşleşti.`,
            },
      );
    } catch (error) {
      if (isCurrentOperation(operation)) {
        setNotice(
          bridgeIssue(error, "Kaydedilmiş endpoint coverage analizi tamamlanamadı."),
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
            <strong>Spring error response</strong>
            <span>
              {activeResponse
                ? `Aktif sekme: ${activeTab?.name} · HTTP ${activeResponse.statusCode}`
                : "Response yapıştırın veya aktif request’ten alın"}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={loadActiveResponse}
            disabled={!activeResponse}
          >
            <ClipboardPaste size={13} /> Aktif response’u al
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
          aria-label="Spring error response body"
        />
        <div className="diagnostics-form-strip">
          <label style={fieldStyle}>
            HTTP status
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
          <label style={{ ...fieldStyle, flex: 1 }}>
            Response headers
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
            <Bug size={14} /> Hatayı analiz et
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
              title="Analiz bekleniyor"
              description="ProblemDetail, Bean Validation ve 4xx/5xx response’ları okunabilir bir özete dönüştürün."
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
            <strong>JWT input</strong>
            <span>Bearer prefix’i kullanılabilir; token cihazdan çıkmaz</span>
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
          aria-label="JWT token"
        />
        <div className="tool-card-actions">
          <Button variant="primary" onClick={runJWTAnalysis}>
            <KeyRound size={14} /> Claim’leri çöz
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
              title="Token bekleniyor"
              description="Expiration, issuer, audience, role ve scope claim’lerini inceleyin."
            />
          </article>
        )}
      </div>
    </div>
  );

  const renderRuntime = () => (
    <div className="diagnostics-result-stack">
      <article className="tool-panel" style={panelStyle}>
        <div className="diagnostics-runtime-form">
          <label style={{ ...fieldStyle, gridColumn: "span 2" }}>
            Actuator base URL
            <input
              value={actuatorURL}
              onChange={(event) => {
                setActuatorURL(event.target.value);
                clearRuntimeResult();
              }}
              placeholder="http://localhost:8080/actuator"
            />
          </label>
          <label style={fieldStyle}>
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
            Mappings’i de oku
          </label>
          <label style={fieldStyle}>
            Headers
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
          <label style={fieldStyle}>
            Metric isimleri
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
            Baseline al
          </Button>
          <Button
            variant="primary"
            onClick={() => void inspectRuntime(false)}
            disabled={Boolean(busy)}
          >
            <BusyIcon active={busy === "runtime"} />
            {runtimeBaseline ? "Yeni snapshot ve delta" : "Snapshot al"}
          </Button>
          {runtimeBaseline && (
            <Button
              variant="ghost"
              onClick={() => {
                setRuntimeBaseline(undefined);
                setNotice({ tone: "info", text: "Runtime baseline temizlendi." });
              }}
            >
              Baseline’ı temizle
            </Button>
          )}
          <span>
            Actuator çağrıları salt okunurdur. Header değerleri çalışma alanına kaydedilmez.
          </span>
        </div>
      </article>
      {runtimeResult ? (
        <RuntimeResult result={runtimeResult} baseline={runtimeBaseline} />
      ) : (
        <article className="tool-panel">
          <EmptyResult
            icon={ServerCog}
            title="Runtime snapshot yok"
            description="Health, JVM, GC, Hikari ve messaging metriklerini çalışan servisten okuyun."
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
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(environmentMethod);
    return (
      <div className="diagnostics-result-stack">
        <article className="tool-panel" style={panelStyle}>
          <div className="diagnostics-request-line">
            <label style={fieldStyle}>
              Method
              <select
                value={environmentMethod}
                onChange={(event) => {
                  setEnvironmentMethod(event.target.value);
                  clearEnvironmentResult();
                  if (["GET", "HEAD", "OPTIONS"].includes(event.target.value)) {
                    setAllowUnsafe(false);
                  }
                }}
              >
                {["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].map(
                  (method) => <option key={method}>{method}</option>,
                )}
              </select>
            </label>
            <label style={{ ...fieldStyle, flex: 1 }}>
              Relative path
              <input
                value={environmentPath}
                onChange={(event) => {
                  setEnvironmentPath(event.target.value);
                  clearEnvironmentResult();
                }}
                placeholder="/api/orders?limit=10"
              />
            </label>
            <label style={fieldStyle}>
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
                <legend>Environment {index + 1}</legend>
                <label style={fieldStyle}>
                  Ad
                  <input
                    value={target.name}
                    onChange={(event) =>
                      updateEnvironmentTarget(index, { name: event.target.value })
                    }
                  />
                </label>
                <label style={fieldStyle}>
                  Base URL
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
            <label style={fieldStyle}>
              Headers
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
            <label style={fieldStyle}>
              Ignore JSONPath’leri
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
          <label style={fieldStyle}>
            Request body
            <textarea
              value={environmentBody}
              onChange={(event) => {
                setEnvironmentBody(event.target.value);
                clearEnvironmentResult();
              }}
              rows={6}
              spellCheck={false}
              placeholder={
                ["GET", "HEAD", "OPTIONS"].includes(environmentMethod)
                  ? "Bu method için genellikle boş bırakılır."
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
                {environmentMethod} isteğini doldurulmuş tüm environment’lara
                göndermeye açıkça izin veriyorum.
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
              Environment’ları karşılaştır
            </Button>
            <span>İlk environment baseline olarak kullanılır.</span>
          </div>
        </article>
        {environmentResult ? (
          <EnvironmentResult result={environmentResult} />
        ) : (
          <article className="tool-panel">
            <EmptyResult
              icon={Network}
              title="Environment sonucu yok"
              description="Aynı request’in status, header ve JSON farklarını yan yana inceleyin."
            />
          </article>
        )}
      </div>
    );
  };

  const renderThreadAndLogs = () => (
    <div className="diagnostics-result-stack">
      <nav className="tool-tabs diagnostics-subtabs" aria-label="Thread ve log araçları">
        <button
          type="button"
          className={cn(threadLogMode === "thread" && "active")}
          onClick={() => {
            setThreadLogMode("thread");
            clearNotice();
          }}
          aria-current={threadLogMode === "thread" ? "page" : undefined}
        >
          <Activity size={14} /> Thread dump
        </button>
        <button
          type="button"
          className={cn(threadLogMode === "logs" && "active")}
          onClick={() => {
            setThreadLogMode("logs");
            clearNotice();
          }}
          aria-current={threadLogMode === "logs" ? "page" : undefined}
        >
          <Search size={14} /> Trace log search
        </button>
      </nav>

      {threadLogMode === "thread" ? (
        <div className="diagnostics-work-grid">
          <article className="tool-editor-card">
            <div className="tool-card-header">
              <div>
                <strong>JVM thread dump</strong>
                <span>jstack biçimindeki metin dump’ını yapıştırın</span>
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
              aria-label="JVM thread dump"
            />
            <div className="tool-card-actions">
              <Button
                variant="primary"
                onClick={() => void analyzeThreads()}
                disabled={Boolean(busy)}
              >
                <BusyIcon active={busy === "thread"} /> Thread’leri analiz et
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
                  title="Thread analizi bekleniyor"
                  description="Blocked thread, deadlock ipucu ve tekrar eden stack’leri bulun."
                />
              </article>
            )}
          </div>
        </div>
      ) : (
        <div className="diagnostics-work-grid">
          <article className="tool-editor-card">
            <div className="tool-card-header">
              <div>
                <strong>Uygulama logu</strong>
                <span>Arama yalnız yapıştırılan metinde ve cihazda çalışır</span>
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
              aria-label="Aranacak log metni"
            />
            <div className="diagnostics-form-strip">
              <label style={{ ...fieldStyle, flex: 1 }}>
                Trace / correlation ID
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
                Büyük/küçük harf duyarlı
              </label>
              <Button
                variant="ghost"
                disabled={!activeResponse?.traceId}
                title={
                  activeResponse?.traceId
                    ? "Aktif request response’undaki trace ID’yi kullan"
                    : "Aktif response’ta trace ID yok"
                }
                onClick={() => setTraceQuery(activeResponse?.traceId ?? "")}
              >
                Aktif response ID
              </Button>
              <Button
                variant="primary"
                onClick={() => void searchLogs()}
                disabled={Boolean(busy)}
              >
                <BusyIcon active={busy === "logs"} /> Logda ara
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
                  title="Log araması bekleniyor"
                  description="Response’taki trace veya correlation ID ile ilgili log satırlarını bulun."
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
              <strong>Known endpoints</strong>
              <span>Her satır: METHOD /path</span>
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
            aria-label="Known endpoint listesi"
          />
        </article>
        <article className="tool-editor-card">
          <div className="tool-card-header">
            <div>
              <strong>Observed calls</strong>
              <span>Her satır: METHOD /path [count]</span>
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
            aria-label="Observed call listesi"
          />
        </article>
      </div>
      <div className="diagnostics-action-row standalone">
        <Button
          onClick={() => void analyzeRecordedCoverage()}
          disabled={Boolean(busy)}
        >
          <BusyIcon active={busy === "coverage-recorded"} />
          Bu oturumdan hesapla
        </Button>
        <Button
          variant="primary"
          onClick={() => void analyzeCoverage()}
          disabled={Boolean(busy)}
        >
          <BusyIcon active={busy === "coverage"} /> Coverage’i hesapla
        </Button>
        <span>
          <code>{"{id}"}</code>, <code>*</code> ve <code>**</code> route
          template’leri concrete çağrılarla eşleştirilir.
        </span>
      </div>
      {coverageResult ? (
        <CoverageResultView result={coverageResult} />
      ) : (
        <article className="tool-panel">
          <EmptyResult
            icon={ListChecks}
            title="Coverage sonucu yok"
            description="OpenAPI’den bilinen endpoint’leri bu oturumdaki request’lerle eşleştirin veya listeleri elle girin."
          />
        </article>
      )}
    </div>
  );

  return (
    <section className="tool-page diagnostics-lab" aria-labelledby="diagnostics-title">
      <header className="tool-page-header">
        <div>
          <span className="tool-eyebrow">SPRING BOOT · RUNTIME INSPECTION</span>
          <h1 id="diagnostics-title">Diagnostics</h1>
          <p>
            API response, token ve çalışma zamanı verilerini tek yerde analiz edin.
          </p>
        </div>
        <div className="tool-header-meta">
          <strong>{modes.find((item) => item.id === mode)?.label}</strong>
          <span>{busy ? "İşlem sürüyor…" : "Hazır"}</span>
        </div>
      </header>

      <nav className="tool-tabs diagnostics-main-tabs" aria-label="Diagnostics araçları">
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={cn(mode === id && "active")}
            onClick={() => {
              setMode(id);
              clearNotice();
            }}
            aria-current={mode === id ? "page" : undefined}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </nav>

      {notice && (
        <Notice tone={notice.tone}>
          <div className="tool-notice-content">
            {notice.title && <strong>{notice.title}</strong>}
            <span>{notice.text}</span>
            {notice.hint && <small>{notice.hint}</small>}
            {notice.technical && (
              <details>
                <summary>Teknik ayrıntı</summary>
                <code>{notice.technical}</code>
              </details>
            )}
          </div>
        </Notice>
      )}

      <div aria-busy={Boolean(busy)}>
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
