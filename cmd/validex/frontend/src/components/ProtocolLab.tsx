import {
  Inbox,
  LoaderCircle,
  MessageSquare,
  Network,
  Play,
  RadioTower,
  Server,
  Square,
} from "lucide-react";
import {
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import { backend } from "../lib/backend";
import { cn } from "../lib/utils";
import { Button } from "./ui";

type ProtocolMode = "sse" | "websocket" | "grpc";

interface UserError {
  title?: string;
  message?: string;
  hint?: string;
  technical?: string;
}

interface ProtocolIssue {
  title: string;
  message: string;
  hint?: string;
  technical?: string;
}

interface ProtocolResult {
  error?: UserError;
}

interface SSEInput {
  operationId: string;
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxEvents: number;
  insecureSkipVerify: boolean;
}

interface SSEEvent {
  event: string;
  id: string;
  data: string;
  retryMillis: number;
  hasRetry: boolean;
}

interface SSEResult extends ProtocolResult {
  statusCode: number;
  headers: Record<string, string | string[]>;
  events: SSEEvent[];
  durationMs: number;
}

interface WebSocketInput {
  operationId: string;
  url: string;
  headers: Record<string, string>;
  subprotocols: string[];
  send: Array<{ type: "text"; data: string; encoding: "utf-8" }>;
  timeoutMs: number;
  maxMessages: number;
  insecureSkipVerify: boolean;
}

interface WebSocketMessage {
  type: "text" | "binary";
  data: string;
  encoding: "utf-8" | "base64";
  sizeBytes: number;
}

interface WebSocketResult extends ProtocolResult {
  statusCode: number;
  headers: Record<string, string | string[]>;
  protocol: string;
  messages: WebSocketMessage[];
  durationMs: number;
}

interface GRPCInput {
  operationId: string;
  address: string;
  metadata: Record<string, string>;
  timeoutMs: number;
  useTLS: boolean;
  serverName: string;
  insecureSkipVerify: boolean;
}

interface GRPCResult extends ProtocolResult {
  services: string[];
  reflectionVersion: string;
  connectionState: string;
  durationMs: number;
}

interface ProtocolBackend {
  runSSE(input: SSEInput): Promise<SSEResult>;
  runWebSocket(input: WebSocketInput): Promise<WebSocketResult>;
  inspectGRPC(input: GRPCInput): Promise<GRPCResult>;
  cancelToolOperation(operationID: string): Promise<boolean>;
}

const protocolBackend = backend as typeof backend & ProtocolBackend;

let protocolOperationSequence = 0;

function createOperationID(mode: ProtocolMode): string {
  protocolOperationSequence += 1;
  return `protocol-${mode}-${Date.now().toString(36)}-${protocolOperationSequence.toString(36)}`;
}

const modes: Array<{
  id: ProtocolMode;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
}> = [
  {
    id: "sse",
    label: "SSE",
    description: "Sunucudan gelen olay akışını okuyun",
    icon: RadioTower,
  },
  {
    id: "websocket",
    label: "WebSocket",
    description: "Mesaj gönderin ve gelen mesajları izleyin",
    icon: MessageSquare,
  },
  {
    id: "grpc",
    label: "gRPC",
    description: "Reflection ile yayınlanan servisleri keşfedin",
    icon: Network,
  },
];

function parseStringMap(raw: string, label: string): Record<string, string> {
  const source = raw.trim();
  if (!source) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${label} geçerli bir JSON nesnesi olmalı.`);
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(`${label} anahtar-değer içeren bir JSON nesnesi olmalı.`);
  }

  const entries = Object.entries(parsed);
  for (const [key, value] of entries) {
    if (!key.trim()) {
      throw new Error(`${label} içinde boş anahtar kullanılamaz.`);
    }
    if (typeof value !== "string") {
      throw new Error(`${label} içindeki “${key}” değeri metin olmalı.`);
    }
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function positiveInteger(
  raw: string,
  label: string,
  maximum: number,
): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${label} 1 ile ${maximum.toLocaleString("tr-TR")} arasında tam sayı olmalı.`);
  }
  return value;
}

function timeoutMilliseconds(raw: string): number {
  return positiveInteger(raw, "Timeout", 600) * 1_000;
}

function validateURL(raw: string, protocols: string[], label: string): string {
  const value = raw.trim();
  if (!value) throw new Error(`${label} adresi gerekli.`);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} adresi geçerli değil.`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${label} adresi ${protocols.join(" veya ")} ile başlamalı.`);
  }
  if (!parsed.hostname) {
    throw new Error(`${label} adresinde sunucu adı eksik.`);
  }
  return value;
}

function validateGRPCAddress(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error("gRPC sunucu adresi gerekli.");
  if (value.includes("://")) {
    throw new Error("gRPC adresini protokol olmadan host:port biçiminde yazın.");
  }
  const match = value.match(/^(?:\[[^\]]+\]|[^:\s]+):(\d+)$/);
  if (!match) {
    throw new Error("gRPC adresi host:port biçiminde olmalı.");
  }
  const port = Number(match[1]);
  if (port < 1 || port > 65_535) {
    throw new Error("gRPC portu 1 ile 65535 arasında olmalı.");
  }
  return value;
}

function usesSecureProtocol(raw: string, protocol: "https:" | "wss:"): boolean {
  try {
    return new URL(raw.trim()).protocol === protocol;
  } catch {
    return false;
  }
}

function issueFrom(value: unknown, bridgeFailure = false): ProtocolIssue {
  if (value instanceof Error) {
    if (bridgeFailure) {
      return {
        title: "Validex backend bağlantısı kesildi",
        message: "Protokol işlemi masaüstü backend’inde tamamlanamadı.",
        hint: "Bağlantı ayarlarını kontrol edip işlemi yeniden deneyin.",
        technical: value.message,
      };
    }
    return {
      title: "Bağlantı tamamlanamadı",
      message: value.message,
    };
  }
  if (value && typeof value === "object") {
    const error = value as UserError;
    return {
      title: error.title || "Bağlantı tamamlanamadı",
      message: error.message || "Backend ayrıntı vermeden işlemi sonlandırdı.",
      hint: error.hint,
      technical: error.technical,
    };
  }
  return {
    title: "Bağlantı tamamlanamadı",
    message: typeof value === "string" ? value : "Bilinmeyen bir hata oluştu.",
  };
}

function durationLabel(durationMs: number): string {
  if (!Number.isFinite(durationMs)) return "—";
  if (durationMs < 1_000) return `${Math.max(0, Math.round(durationMs))} ms`;
  return `${(durationMs / 1_000).toLocaleString("tr-TR", {
    maximumFractionDigits: 2,
  })} sn`;
}

function ProtocolError({ issue }: { issue: ProtocolIssue }) {
  return (
    <div className="tool-notice error protocol-error" role="alert">
      <strong>{issue.title}</strong>
      <span>{issue.message}</span>
      {issue.hint && <span className="protocol-error-hint">{issue.hint}</span>}
      {issue.technical && (
        <details>
          <summary>Teknik ayrıntı</summary>
          <code>{issue.technical}</code>
        </details>
      )}
    </div>
  );
}

function ProtocolEmpty({
  icon: Icon = Inbox,
  title,
  children,
}: {
  icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="tool-empty-result protocol-empty">
      <Icon size={25} aria-hidden />
      <strong>{title}</strong>
      <span>{children}</span>
    </div>
  );
}

function ResultHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="tool-card-header">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
    </div>
  );
}

function ResultMetrics({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="protocol-metrics">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function HeaderDetails({
  headers,
  label,
}: {
  headers: Record<string, string | string[]>;
  label: string;
}) {
  const entries = Object.entries(headers ?? {});
  if (entries.length === 0) return null;

  return (
    <details className="protocol-header-details">
      <summary>
        {label} <span>{entries.length}</span>
      </summary>
      <dl>
        {entries.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function LoadingResult({ label }: { label: string }) {
  return (
    <div className="tool-empty-result protocol-empty" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={25} aria-hidden />
      <strong>{label}</strong>
      <span>Timeout dolana veya sunucu yanıt verene kadar bekleniyor.</span>
    </div>
  );
}

export function ProtocolLab() {
  const [mode, setMode] = useState<ProtocolMode>("sse");
  const [loading, setLoading] = useState<ProtocolMode | null>(null);
  const [activeOperation, setActiveOperation] = useState<{
    id: string;
    mode: ProtocolMode;
  } | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [issue, setIssue] = useState<ProtocolIssue | null>(null);

  const [sseInput, setSSEInput] = useState({
    url: "http://localhost:8080/events",
    headers: "{}",
    timeout: "30",
    maxEvents: "25",
    insecureSkipVerify: false,
  });
  const [sseResult, setSSEResult] = useState<SSEResult | null>(null);

  const [webSocketInput, setWebSocketInput] = useState({
    url: "ws://localhost:8080/ws",
    headers: "{}",
    subprotocols: "",
    message: "",
    timeout: "30",
    maxMessages: "1",
    insecureSkipVerify: false,
  });
  const [webSocketResult, setWebSocketResult] =
    useState<WebSocketResult | null>(null);

  const [grpcInput, setGRPCInput] = useState({
    address: "localhost:9090",
    metadata: "{}",
    timeout: "10",
    useTLS: false,
    serverName: "",
    insecureSkipVerify: false,
  });
  const [grpcResult, setGRPCResult] = useState<GRPCResult | null>(null);

  const runSSE = async (event: FormEvent) => {
    event.preventDefault();
    setIssue(null);
    setSSEResult(null);
    let operationID = "";
    let backendStarted = false;

    try {
      operationID = createOperationID("sse");
      const input: SSEInput = {
        operationId: operationID,
        url: validateURL(sseInput.url, ["http:", "https:"], "SSE"),
        headers: parseStringMap(sseInput.headers, "Header"),
        timeoutMs: timeoutMilliseconds(sseInput.timeout),
        maxEvents: positiveInteger(sseInput.maxEvents, "Olay sınırı", 10_000),
        insecureSkipVerify: sseInput.insecureSkipVerify,
      };
      if (typeof protocolBackend.runSSE !== "function") {
        throw new Error("SSE backend bağlantısı bu sürümde kullanılamıyor.");
      }
      setLoading("sse");
      setActiveOperation({ id: operationID, mode: "sse" });
      backendStarted = true;
      const result = await protocolBackend.runSSE(input);
      if (result.error) {
        if (result.events.length > 0) setSSEResult(result);
        setIssue(issueFrom(result.error));
        return;
      }
      setSSEResult(result);
    } catch (error) {
      setIssue(issueFrom(error, backendStarted));
    } finally {
      setLoading(null);
      setActiveOperation((current) =>
        current?.id === operationID ? null : current,
      );
      setCanceling(false);
    }
  };

  const runWebSocket = async (event: FormEvent) => {
    event.preventDefault();
    setIssue(null);
    setWebSocketResult(null);
    let operationID = "";
    let backendStarted = false;

    try {
      operationID = createOperationID("websocket");
      const message = webSocketInput.message;
      const input: WebSocketInput = {
        operationId: operationID,
        url: validateURL(
          webSocketInput.url,
          ["ws:", "wss:"],
          "WebSocket",
        ),
        headers: parseStringMap(webSocketInput.headers, "Header"),
        subprotocols: webSocketInput.subprotocols
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        send: message
          ? [{ type: "text", data: message, encoding: "utf-8" }]
          : [],
        timeoutMs: timeoutMilliseconds(webSocketInput.timeout),
        maxMessages: positiveInteger(
          webSocketInput.maxMessages,
          "Mesaj sınırı",
          10_000,
        ),
        insecureSkipVerify: webSocketInput.insecureSkipVerify,
      };
      if (typeof protocolBackend.runWebSocket !== "function") {
        throw new Error("WebSocket backend bağlantısı bu sürümde kullanılamıyor.");
      }
      setLoading("websocket");
      setActiveOperation({ id: operationID, mode: "websocket" });
      backendStarted = true;
      const result = await protocolBackend.runWebSocket(input);
      if (result.error) {
        if (result.messages.length > 0) setWebSocketResult(result);
        setIssue(issueFrom(result.error));
        return;
      }
      setWebSocketResult(result);
    } catch (error) {
      setIssue(issueFrom(error, backendStarted));
    } finally {
      setLoading(null);
      setActiveOperation((current) =>
        current?.id === operationID ? null : current,
      );
      setCanceling(false);
    }
  };

  const inspectGRPC = async (event: FormEvent) => {
    event.preventDefault();
    setIssue(null);
    setGRPCResult(null);
    let operationID = "";
    let backendStarted = false;

    try {
      operationID = createOperationID("grpc");
      const input: GRPCInput = {
        operationId: operationID,
        address: validateGRPCAddress(grpcInput.address),
        metadata: parseStringMap(grpcInput.metadata, "Metadata"),
        timeoutMs: timeoutMilliseconds(grpcInput.timeout),
        useTLS: grpcInput.useTLS,
        serverName: grpcInput.useTLS ? grpcInput.serverName.trim() : "",
        insecureSkipVerify:
          grpcInput.useTLS && grpcInput.insecureSkipVerify,
      };
      if (typeof protocolBackend.inspectGRPC !== "function") {
        throw new Error("gRPC backend bağlantısı bu sürümde kullanılamıyor.");
      }
      setLoading("grpc");
      setActiveOperation({ id: operationID, mode: "grpc" });
      backendStarted = true;
      const result = await protocolBackend.inspectGRPC(input);
      if (result.error) {
        if (result.services.length > 0) setGRPCResult(result);
        setIssue(issueFrom(result.error));
        return;
      }
      setGRPCResult(result);
    } catch (error) {
      setIssue(issueFrom(error, backendStarted));
    } finally {
      setLoading(null);
      setActiveOperation((current) =>
        current?.id === operationID ? null : current,
      );
      setCanceling(false);
    }
  };

  const cancelActiveOperation = async () => {
    if (!activeOperation || canceling) return;
    setCanceling(true);

    try {
      if (typeof protocolBackend.cancelToolOperation !== "function") {
        throw new Error("Protokol iptal bağlantısı bu sürümde kullanılamıyor.");
      }
      const accepted = await protocolBackend.cancelToolOperation(
        activeOperation.id,
      );
      if (!accepted) {
        setIssue({
          title: "İşlem durdurulamadı",
          message: "Backend bu operation ID için çalışan bir işlem bulamadı.",
          hint: "İşlem tamamlanmış olabilir. Sonucu bekleyin veya yeniden başlatın.",
        });
        setCanceling(false);
      }
    } catch (error) {
      setIssue(issueFrom(error, true));
      setCanceling(false);
    }
  };

  const busy = loading !== null;
  const activeMode = modes.find((item) => item.id === mode) ?? modes[0];

  return (
    <section className="tool-page protocol-lab" aria-labelledby="protocol-lab-title">
      <header className="tool-page-header">
        <div>
          <span className="tool-eyebrow">LIVE CONNECTIONS · BOUNDED</span>
          <h1 id="protocol-lab-title">Protocol Lab</h1>
          <p>
            SSE akışlarını okuyun, WebSocket mesajlarını izleyin ve gRPC
            reflection servislerini keşfedin.
          </p>
        </div>
        <div className="tool-header-meta">
          <strong>{activeMode.label}</strong>
          <span>{activeMode.description}</span>
        </div>
      </header>

      <nav className="tool-tabs protocol-tabs" aria-label="Protokol araçları">
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={cn(mode === id && "active")}
            disabled={busy}
            onClick={() => {
              setMode(id);
              setIssue(null);
            }}
            aria-current={mode === id ? "page" : undefined}
          >
            <Icon size={14} aria-hidden />
            {label}
            {loading === id && (
              <LoaderCircle className="spin" size={12} aria-label="Çalışıyor" />
            )}
          </button>
        ))}
      </nav>

      {issue && <ProtocolError issue={issue} />}

      {mode === "sse" && (
        <div className="protocol-workspace">
          <form className="tool-panel protocol-form" onSubmit={(event) => void runSSE(event)}>
            <div className="tool-card-header">
              <div>
                <strong>SSE bağlantısı</strong>
                <span>HTTP event-stream endpoint’ine bağlanın</span>
              </div>
              <span className="protocol-method">GET</span>
            </div>
            <div className="protocol-fields">
              <label className="protocol-field protocol-field-wide">
                <span>Event stream URL</span>
                <input
                  type="url"
                  value={sseInput.url}
                  onChange={(event) =>
                    setSSEInput((current) => ({
                      ...current,
                      url: event.target.value,
                      insecureSkipVerify: usesSecureProtocol(
                        event.target.value,
                        "https:",
                      )
                        ? current.insecureSkipVerify
                        : false,
                    }))
                  }
                  placeholder="http://localhost:8080/events"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={busy}
                />
              </label>
              <label className="protocol-field">
                <span>Timeout</span>
                <div className="protocol-unit-input">
                  <input
                    type="number"
                    min="1"
                    max="600"
                    value={sseInput.timeout}
                    onChange={(event) =>
                      setSSEInput((current) => ({
                        ...current,
                        timeout: event.target.value,
                      }))
                    }
                    disabled={busy}
                  />
                  <span>sn</span>
                </div>
              </label>
              <label className="protocol-field">
                <span>En fazla olay</span>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={sseInput.maxEvents}
                  onChange={(event) =>
                    setSSEInput((current) => ({
                      ...current,
                      maxEvents: event.target.value,
                    }))
                  }
                  disabled={busy}
                />
              </label>
              <label className="protocol-field protocol-field-wide">
                <span>Request headers · JSON</span>
                <textarea
                  value={sseInput.headers}
                  onChange={(event) =>
                    setSSEInput((current) => ({
                      ...current,
                      headers: event.target.value,
                    }))
                  }
                  placeholder={'{\n  "Authorization": "Bearer …"\n}'}
                  spellCheck={false}
                  disabled={busy}
                />
                <small>Her header değeri metin olmalı.</small>
              </label>
              <label
                className={cn(
                  "protocol-check protocol-field-wide",
                  !usesSecureProtocol(sseInput.url, "https:") && "disabled",
                )}
              >
                <input
                  type="checkbox"
                  checked={sseInput.insecureSkipVerify}
                  onChange={(event) =>
                    setSSEInput((current) => ({
                      ...current,
                      insecureSkipVerify: event.target.checked,
                    }))
                  }
                  disabled={
                    busy || !usesSecureProtocol(sseInput.url, "https:")
                  }
                />
                <span>
                  <strong>Sertifika doğrulamasını atla</strong>
                  <small>
                    Yalnız yerel, self-signed HTTPS geliştirme sunucularında kullanın.
                  </small>
                </span>
              </label>
            </div>
            <div className="tool-card-actions protocol-actions">
              <Button variant="primary" type="submit" disabled={busy}>
                {loading === "sse" ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Play size={14} />
                )}
                {loading === "sse" ? "Dinleniyor…" : "Akışı dinle"}
              </Button>
              {activeOperation?.mode === "sse" && (
                <Button
                  variant="danger"
                  type="button"
                  disabled={canceling}
                  onClick={() => void cancelActiveOperation()}
                >
                  <Square size={13} fill="currentColor" />
                  {canceling ? "İptal ediliyor…" : "İptal et"}
                </Button>
              )}
              <span>Olay sınırına ulaşıldığında bağlantı kapatılır.</span>
            </div>
          </form>

          <section className="tool-panel protocol-result" aria-label="SSE sonucu">
            <ResultHeader
              title="Olaylar"
              description="Event, ID, retry ve data alanları ayrı gösterilir"
            />
            {loading === "sse" ? (
              <LoadingResult label="SSE akışı bekleniyor" />
            ) : sseResult ? (
              <>
                <ResultMetrics
                  items={[
                    { label: "HTTP", value: sseResult.statusCode },
                    { label: "Süre", value: durationLabel(sseResult.durationMs) },
                    { label: "Olay", value: sseResult.events.length },
                  ]}
                />
                <HeaderDetails headers={sseResult.headers} label="Response headers" />
                {sseResult.events.length > 0 ? (
                  <div className="protocol-table-wrap">
                    <table className="protocol-event-table">
                      <thead>
                        <tr>
                          <th scope="col">#</th>
                          <th scope="col">Event</th>
                          <th scope="col">ID</th>
                          <th scope="col">Retry</th>
                          <th scope="col">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sseResult.events.map((item, index) => (
                          <tr key={`${item.id}-${index}`}>
                            <td>{index + 1}</td>
                            <td><code>{item.event || "message"}</code></td>
                            <td><code>{item.id || "—"}</code></td>
                            <td>
                              {item.hasRetry ? `${item.retryMillis} ms` : "—"}
                            </td>
                            <td><pre>{item.data}</pre></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <ProtocolEmpty icon={RadioTower} title="Akış olay göndermedi">
                    Bağlantı kuruldu ancak stream kapanmadan önce event alınmadı.
                  </ProtocolEmpty>
                )}
              </>
            ) : (
              <ProtocolEmpty icon={RadioTower} title="Henüz bağlantı yok">
                URL ve sınırları belirleyip “Akışı dinle” seçeneğini kullanın.
              </ProtocolEmpty>
            )}
          </section>
        </div>
      )}

      {mode === "websocket" && (
        <div className="protocol-workspace">
          <form
            className="tool-panel protocol-form"
            onSubmit={(event) => void runWebSocket(event)}
          >
            <div className="tool-card-header">
              <div>
                <strong>WebSocket bağlantısı</strong>
                <span>Bağlanın, tek bir text mesaj gönderin ve yanıtları okuyun</span>
              </div>
              <span className="protocol-method">WS</span>
            </div>
            <div className="protocol-fields">
              <label className="protocol-field protocol-field-wide">
                <span>WebSocket URL</span>
                <input
                  type="url"
                  value={webSocketInput.url}
                  onChange={(event) =>
                    setWebSocketInput((current) => ({
                      ...current,
                      url: event.target.value,
                      insecureSkipVerify: usesSecureProtocol(
                        event.target.value,
                        "wss:",
                      )
                        ? current.insecureSkipVerify
                        : false,
                    }))
                  }
                  placeholder="ws://localhost:8080/ws"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={busy}
                />
              </label>
              <label className="protocol-field">
                <span>Timeout</span>
                <div className="protocol-unit-input">
                  <input
                    type="number"
                    min="1"
                    max="600"
                    value={webSocketInput.timeout}
                    onChange={(event) =>
                      setWebSocketInput((current) => ({
                        ...current,
                        timeout: event.target.value,
                      }))
                    }
                    disabled={busy}
                  />
                  <span>sn</span>
                </div>
              </label>
              <label className="protocol-field">
                <span>En fazla mesaj</span>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={webSocketInput.maxMessages}
                  onChange={(event) =>
                    setWebSocketInput((current) => ({
                      ...current,
                      maxMessages: event.target.value,
                    }))
                  }
                  disabled={busy}
                />
              </label>
              <label className="protocol-field protocol-field-wide">
                <span>Subprotocols</span>
                <input
                  value={webSocketInput.subprotocols}
                  onChange={(event) =>
                    setWebSocketInput((current) => ({
                      ...current,
                      subprotocols: event.target.value,
                    }))
                  }
                  placeholder="graphql-transport-ws, validex.v1"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={busy}
                />
                <small>Birden fazlaysa virgülle ayırın.</small>
              </label>
              <label className="protocol-field protocol-field-wide">
                <span>Request headers · JSON</span>
                <textarea
                  value={webSocketInput.headers}
                  onChange={(event) =>
                    setWebSocketInput((current) => ({
                      ...current,
                      headers: event.target.value,
                    }))
                  }
                  placeholder={'{\n  "Authorization": "Bearer …"\n}'}
                  spellCheck={false}
                  disabled={busy}
                />
              </label>
              <label className="protocol-field protocol-field-wide">
                <span>Gönderilecek text mesajı · isteğe bağlı</span>
                <textarea
                  value={webSocketInput.message}
                  onChange={(event) =>
                    setWebSocketInput((current) => ({
                      ...current,
                      message: event.target.value,
                    }))
                  }
                  placeholder={'{"type":"subscribe","topic":"orders"}'}
                  spellCheck={false}
                  disabled={busy}
                />
              </label>
              <label
                className={cn(
                  "protocol-check protocol-field-wide",
                  !usesSecureProtocol(webSocketInput.url, "wss:") &&
                    "disabled",
                )}
              >
                <input
                  type="checkbox"
                  checked={webSocketInput.insecureSkipVerify}
                  onChange={(event) =>
                    setWebSocketInput((current) => ({
                      ...current,
                      insecureSkipVerify: event.target.checked,
                    }))
                  }
                  disabled={
                    busy ||
                    !usesSecureProtocol(webSocketInput.url, "wss:")
                  }
                />
                <span>
                  <strong>Sertifika doğrulamasını atla</strong>
                  <small>
                    Yalnız yerel, self-signed WSS geliştirme sunucularında kullanın.
                  </small>
                </span>
              </label>
            </div>
            <div className="tool-card-actions protocol-actions">
              <Button variant="primary" type="submit" disabled={busy}>
                {loading === "websocket" ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Play size={14} />
                )}
                {loading === "websocket"
                  ? "Mesaj bekleniyor…"
                  : webSocketInput.message
                    ? "Gönder ve dinle"
                    : "Bağlan ve dinle"}
              </Button>
              {activeOperation?.mode === "websocket" && (
                <Button
                  variant="danger"
                  type="button"
                  disabled={canceling}
                  onClick={() => void cancelActiveOperation()}
                >
                  <Square size={13} fill="currentColor" />
                  {canceling ? "İptal ediliyor…" : "İptal et"}
                </Button>
              )}
              <span>Text mesajı boşsa yalnız gelen mesajlar dinlenir.</span>
            </div>
          </form>

          <section className="tool-panel protocol-result" aria-label="WebSocket sonucu">
            <ResultHeader
              title="Handshake ve mesajlar"
              description="Text ve binary mesajlar alınma sırasıyla gösterilir"
            />
            {loading === "websocket" ? (
              <LoadingResult label="WebSocket mesajları bekleniyor" />
            ) : webSocketResult ? (
              <>
                <ResultMetrics
                  items={[
                    { label: "Handshake", value: webSocketResult.statusCode },
                    {
                      label: "Protocol",
                      value: webSocketResult.protocol || "—",
                    },
                    {
                      label: "Süre",
                      value: durationLabel(webSocketResult.durationMs),
                    },
                    { label: "Mesaj", value: webSocketResult.messages.length },
                  ]}
                />
                <HeaderDetails
                  headers={webSocketResult.headers}
                  label="Handshake headers"
                />
                {webSocketResult.messages.length > 0 ? (
                  <ol className="protocol-message-list">
                    {webSocketResult.messages.map((message, index) => (
                      <li key={`${message.type}-${index}`}>
                        <header>
                          <span>#{index + 1}</span>
                          <strong>{message.type}</strong>
                          <small>
                            {message.encoding} ·{" "}
                            {message.sizeBytes.toLocaleString("tr-TR")} B
                          </small>
                        </header>
                        <pre>{message.data}</pre>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ProtocolEmpty icon={MessageSquare} title="Mesaj alınmadı">
                    Handshake tamamlandı ancak bağlantı kapanmadan önce mesaj gelmedi.
                  </ProtocolEmpty>
                )}
              </>
            ) : (
              <ProtocolEmpty icon={MessageSquare} title="Henüz bağlantı yok">
                URL’yi girin; gerekirse mesaj ekleyip bağlantıyı başlatın.
              </ProtocolEmpty>
            )}
          </section>
        </div>
      )}

      {mode === "grpc" && (
        <div className="protocol-workspace">
          <form
            className="tool-panel protocol-form"
            onSubmit={(event) => void inspectGRPC(event)}
          >
            <div className="tool-card-header">
              <div>
                <strong>gRPC service reflection</strong>
                <span>Sunucunun yayınladığı gerçek servis listesini okuyun</span>
              </div>
              <span className="protocol-method">HTTP/2</span>
            </div>
            <div className="protocol-fields">
              <label className="protocol-field protocol-field-wide">
                <span>Sunucu adresi</span>
                <input
                  value={grpcInput.address}
                  onChange={(event) =>
                    setGRPCInput((current) => ({
                      ...current,
                      address: event.target.value,
                    }))
                  }
                  placeholder="localhost:9090"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={busy}
                />
                <small>Protokol eklemeden host:port biçiminde yazın.</small>
              </label>
              <label className="protocol-field">
                <span>Timeout</span>
                <div className="protocol-unit-input">
                  <input
                    type="number"
                    min="1"
                    max="600"
                    value={grpcInput.timeout}
                    onChange={(event) =>
                      setGRPCInput((current) => ({
                        ...current,
                        timeout: event.target.value,
                      }))
                    }
                    disabled={busy}
                  />
                  <span>sn</span>
                </div>
              </label>
              <label className="protocol-check">
                <input
                  type="checkbox"
                  checked={grpcInput.useTLS}
                  onChange={(event) =>
                    setGRPCInput((current) => ({
                      ...current,
                      useTLS: event.target.checked,
                      insecureSkipVerify: event.target.checked
                        ? current.insecureSkipVerify
                        : false,
                    }))
                  }
                  disabled={busy}
                />
                <span>
                  <strong>TLS kullan</strong>
                  <small>Sunucuya şifreli bağlantı kurar.</small>
                </span>
              </label>
              <label className="protocol-field protocol-field-wide">
                <span>TLS server name · isteğe bağlı</span>
                <input
                  value={grpcInput.serverName}
                  onChange={(event) =>
                    setGRPCInput((current) => ({
                      ...current,
                      serverName: event.target.value,
                    }))
                  }
                  placeholder="api.example.com"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={busy || !grpcInput.useTLS}
                />
              </label>
              <label className={cn("protocol-check protocol-field-wide", !grpcInput.useTLS && "disabled")}>
                <input
                  type="checkbox"
                  checked={grpcInput.insecureSkipVerify}
                  onChange={(event) =>
                    setGRPCInput((current) => ({
                      ...current,
                      insecureSkipVerify: event.target.checked,
                    }))
                  }
                  disabled={busy || !grpcInput.useTLS}
                />
                <span>
                  <strong>Sertifika doğrulamasını atla</strong>
                  <small>Yalnız yerel, self-signed geliştirme sunucularında kullanın.</small>
                </span>
              </label>
              <label className="protocol-field protocol-field-wide">
                <span>gRPC metadata · JSON</span>
                <textarea
                  value={grpcInput.metadata}
                  onChange={(event) =>
                    setGRPCInput((current) => ({
                      ...current,
                      metadata: event.target.value,
                    }))
                  }
                  placeholder={'{\n  "authorization": "Bearer …"\n}'}
                  spellCheck={false}
                  disabled={busy}
                />
                <small>Metadata anahtarları backend tarafından lowercase’e çevrilir.</small>
              </label>
            </div>
            <div className="tool-card-actions protocol-actions">
              <Button variant="primary" type="submit" disabled={busy}>
                {loading === "grpc" ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Play size={14} />
                )}
                {loading === "grpc" ? "Servisler okunuyor…" : "Servisleri keşfet"}
              </Button>
              {activeOperation?.mode === "grpc" && (
                <Button
                  variant="danger"
                  type="button"
                  disabled={canceling}
                  onClick={() => void cancelActiveOperation()}
                >
                  <Square size={13} fill="currentColor" />
                  {canceling ? "İptal ediliyor…" : "İptal et"}
                </Button>
              )}
              <span>Sunucuda gRPC server reflection açık olmalı.</span>
            </div>
          </form>

          <section className="tool-panel protocol-result" aria-label="gRPC sonucu">
            <ResultHeader
              title="Reflection servisleri"
              description="Sunucunun bildirdiği servisler alfabetik gösterilir"
            />
            {loading === "grpc" ? (
              <LoadingResult label="gRPC sunucusuna bağlanılıyor" />
            ) : grpcResult ? (
              <>
                <ResultMetrics
                  items={[
                    {
                      label: "Bağlantı",
                      value: grpcResult.connectionState || "—",
                    },
                    {
                      label: "Reflection",
                      value: grpcResult.reflectionVersion || "—",
                    },
                    {
                      label: "Süre",
                      value: durationLabel(grpcResult.durationMs),
                    },
                    { label: "Servis", value: grpcResult.services.length },
                  ]}
                />
                {grpcResult.services.length > 0 ? (
                  <ul className="protocol-service-list">
                    {grpcResult.services.map((service) => (
                      <li key={service}>
                        <Server size={15} aria-hidden />
                        <code>{service}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ProtocolEmpty icon={Server} title="Servis bildirilmedi">
                    Reflection yanıt verdi ancak yayınlanan bir servis bulunamadı.
                  </ProtocolEmpty>
                )}
              </>
            ) : (
              <ProtocolEmpty icon={Network} title="Henüz keşif yapılmadı">
                Sunucu adresini ve bağlantı güvenliğini belirleyip servisleri keşfedin.
              </ProtocolEmpty>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
