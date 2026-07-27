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
import { Button, ToolTabs } from "../../shared/ui";
import { useLocale, useTranslation } from "../../i18n";
import type { Translate } from "../../i18n/LocaleProvider";
import { backend } from "../../lib/backend";
import type {
  GRPCInput,
  GRPCResult,
  SSEInput,
  SSEResult,
  WebSocketInput,
  WebSocketResult,
} from "../../lib/types";
import { cn } from "../../lib/utils";
import {
  createOperationID,
  durationLabel,
  issueFrom,
  parseStringMap,
  positiveInteger,
  protocolModes,
  timeoutMilliseconds,
  usesSecureProtocol,
  validateGRPCAddress,
  validateURL,
  type ProtocolIssue,
  type ProtocolMode,
} from "./model";

const modeIcons: Record<
  ProtocolMode,
  ComponentType<{ size?: number; "aria-hidden"?: boolean }>
> = {
  sse: RadioTower,
  websocket: MessageSquare,
  grpc: Network,
};

function protocolModeLabel(mode: ProtocolMode): string {
  return mode === "sse" ? "SSE" : mode === "websocket" ? "WebSocket" : "gRPC";
}

function protocolModeDescription(
  mode: ProtocolMode,
  t: Translate,
): string {
  const keys = {
    sse: "protocol.mode.sseDescription",
    websocket: "protocol.mode.websocketDescription",
    grpc: "protocol.mode.grpcDescription",
  } as const;
  return t(keys[mode]);
}

function ProtocolError({ issue }: { issue: ProtocolIssue }) {
  const t = useTranslation();
  return (
    <div className="tool-notice error protocol-error" role="alert">
      <strong>{issue.title}</strong>
      <span>{issue.message}</span>
      {issue.hint && <span className="protocol-error-hint">{issue.hint}</span>}
      {issue.technical && (
        <details>
          <summary>{t("common.technicalDetails")}</summary>
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
  const t = useTranslation();
  return (
    <div className="tool-empty-result protocol-empty" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={25} aria-hidden />
      <strong>{label}</strong>
      <span>{t("protocol.waiting")}</span>
    </div>
  );
}

export function ProtocolLab() {
  const { locale, t } = useLocale();
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
        url: validateURL(sseInput.url, ["http:", "https:"], "SSE", t),
        headers: parseStringMap(
          sseInput.headers,
          t("protocol.label.header"),
          t,
        ),
        timeoutMs: timeoutMilliseconds(sseInput.timeout, t, locale),
        maxEvents: positiveInteger(
          sseInput.maxEvents,
          t("protocol.label.eventLimit"),
          10_000,
          t,
          locale,
        ),
        insecureSkipVerify: sseInput.insecureSkipVerify,
      };
      setLoading("sse");
      setActiveOperation({ id: operationID, mode: "sse" });
      backendStarted = true;
      const result = await backend.runSSE(input);
      if (result.error) {
        if (result.events.length > 0) setSSEResult(result);
        setIssue(issueFrom(result.error, t));
        return;
      }
      setSSEResult(result);
    } catch (error) {
      setIssue(issueFrom(error, t, backendStarted));
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
          t,
        ),
        headers: parseStringMap(
          webSocketInput.headers,
          t("protocol.label.header"),
          t,
        ),
        subprotocols: webSocketInput.subprotocols
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        send: message
          ? [{ type: "text", data: message, encoding: "utf-8" }]
          : [],
        timeoutMs: timeoutMilliseconds(webSocketInput.timeout, t, locale),
        maxMessages: positiveInteger(
          webSocketInput.maxMessages,
          t("protocol.label.messageLimit"),
          10_000,
          t,
          locale,
        ),
        insecureSkipVerify: webSocketInput.insecureSkipVerify,
      };
      setLoading("websocket");
      setActiveOperation({ id: operationID, mode: "websocket" });
      backendStarted = true;
      const result = await backend.runWebSocket(input);
      if (result.error) {
        if (result.messages.length > 0) setWebSocketResult(result);
        setIssue(issueFrom(result.error, t));
        return;
      }
      setWebSocketResult(result);
    } catch (error) {
      setIssue(issueFrom(error, t, backendStarted));
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
        address: validateGRPCAddress(grpcInput.address, t),
        metadata: parseStringMap(
          grpcInput.metadata,
          t("protocol.label.metadata"),
          t,
        ),
        timeoutMs: timeoutMilliseconds(grpcInput.timeout, t, locale),
        useTLS: grpcInput.useTLS,
        serverName: grpcInput.useTLS ? grpcInput.serverName.trim() : "",
        insecureSkipVerify:
          grpcInput.useTLS && grpcInput.insecureSkipVerify,
      };
      setLoading("grpc");
      setActiveOperation({ id: operationID, mode: "grpc" });
      backendStarted = true;
      const result = await backend.inspectGRPC(input);
      if (result.error) {
        if (result.services.length > 0) setGRPCResult(result);
        setIssue(issueFrom(result.error, t));
        return;
      }
      setGRPCResult(result);
    } catch (error) {
      setIssue(issueFrom(error, t, backendStarted));
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
      const accepted = await backend.cancelToolOperation(activeOperation.id);
      if (!accepted) {
        setIssue({
          title: t("protocol.cancelRejectedTitle"),
          message: t("protocol.cancelRejectedMessage"),
          hint: t("protocol.cancelRejectedHint"),
        });
        setCanceling(false);
      }
    } catch (error) {
      setIssue(issueFrom(error, t, true));
      setCanceling(false);
    }
  };

  const busy = loading !== null;
  return (
    <section className="tool-page protocol-lab" aria-labelledby="protocol-lab-title">
      <header className="tool-page-header">
        <div>
          <span className="tool-eyebrow">{t("protocol.eyebrow")}</span>
          <h1 id="protocol-lab-title">{t("protocol.title")}</h1>
          <p>{t("protocol.description")}</p>
        </div>
        <div className="tool-header-meta">
          <strong>{protocolModeLabel(mode)}</strong>
          <span>{protocolModeDescription(mode, t)}</span>
        </div>
      </header>

      <ToolTabs
        value={mode}
        tabs={protocolModes.map((id) => ({
          id,
          label: protocolModeLabel(id),
          description: protocolModeDescription(id, t),
          icon: modeIcons[id],
        }))}
        label={t("protocol.toolsLabel")}
        idBase="protocol"
        disabled={busy}
        className="protocol-tabs"
        onChange={(nextMode) => {
          setMode(nextMode);
          setIssue(null);
        }}
      />

      {issue && <ProtocolError issue={issue} />}

      {mode === "sse" && (
        <div
          className="protocol-workspace"
          id="protocol-panel-sse"
          role="tabpanel"
          aria-labelledby="protocol-tab-sse"
        >
          <form className="tool-panel protocol-form" onSubmit={(event) => void runSSE(event)}>
            <div className="tool-card-header">
              <div>
                <strong>{t("protocol.sse.connection")}</strong>
                <span>{t("protocol.sse.connectionDescription")}</span>
              </div>
              <span className="protocol-method">GET</span>
            </div>
            <div className="protocol-fields">
              <label className="protocol-field protocol-field-wide">
                <span>{t("protocol.sse.url")}</span>
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
                <span>{t("protocol.label.timeout")}</span>
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
                  <span>{t("protocol.unit.seconds")}</span>
                </div>
              </label>
              <label className="protocol-field">
                <span>{t("protocol.sse.maxEvents")}</span>
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
                <span>{t("protocol.headers")}</span>
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
                <small>{t("protocol.headersHint")}</small>
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
                  <strong>{t("protocol.skipCertificate")}</strong>
                  <small>{t("protocol.sse.certificateHint")}</small>
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
                {loading === "sse"
                  ? t("protocol.sse.listening")
                  : t("protocol.sse.listen")}
              </Button>
              {activeOperation?.mode === "sse" && (
                <Button
                  variant="danger"
                  type="button"
                  disabled={canceling}
                  onClick={() => void cancelActiveOperation()}
                >
                  <Square size={13} fill="currentColor" />
                  {canceling
                    ? t("protocol.canceling")
                    : t("protocol.cancel")}
                </Button>
              )}
              <span>{t("protocol.sse.limitHint")}</span>
            </div>
          </form>

          <section
            className="tool-panel protocol-result"
            aria-label={t("protocol.sse.resultLabel")}
          >
            <ResultHeader
              title={t("protocol.sse.events")}
              description={t("protocol.sse.resultDescription")}
            />
            {loading === "sse" ? (
              <LoadingResult label={t("protocol.sse.loading")} />
            ) : sseResult ? (
              <>
                <ResultMetrics
                  items={[
                    { label: "HTTP", value: sseResult.statusCode },
                    {
                      label: t("protocol.metric.duration"),
                      value: durationLabel(sseResult.durationMs, locale, t),
                    },
                    {
                      label: t("protocol.metric.event"),
                      value: sseResult.events.length,
                    },
                  ]}
                />
                <HeaderDetails
                  headers={sseResult.headers}
                  label={t("protocol.responseHeaders")}
                />
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
                  <ProtocolEmpty
                    icon={RadioTower}
                    title={t("protocol.sse.emptyStreamTitle")}
                  >
                    {t("protocol.sse.emptyStreamDescription")}
                  </ProtocolEmpty>
                )}
              </>
            ) : (
              <ProtocolEmpty
                icon={RadioTower}
                title={t("protocol.noConnectionTitle")}
              >
                {t("protocol.sse.noConnectionDescription")}
              </ProtocolEmpty>
            )}
          </section>
        </div>
      )}

      {mode === "websocket" && (
        <div
          className="protocol-workspace"
          id="protocol-panel-websocket"
          role="tabpanel"
          aria-labelledby="protocol-tab-websocket"
        >
          <form
            className="tool-panel protocol-form"
            onSubmit={(event) => void runWebSocket(event)}
          >
            <div className="tool-card-header">
              <div>
                <strong>{t("protocol.websocket.connection")}</strong>
                <span>{t("protocol.websocket.connectionDescription")}</span>
              </div>
              <span className="protocol-method">WS</span>
            </div>
            <div className="protocol-fields">
              <label className="protocol-field protocol-field-wide">
                <span>{t("protocol.websocket.url")}</span>
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
                <span>{t("protocol.label.timeout")}</span>
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
                  <span>{t("protocol.unit.seconds")}</span>
                </div>
              </label>
              <label className="protocol-field">
                <span>{t("protocol.websocket.maxMessages")}</span>
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
                <span>{t("protocol.websocket.subprotocols")}</span>
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
                <small>{t("protocol.websocket.subprotocolsHint")}</small>
              </label>
              <label className="protocol-field protocol-field-wide">
                <span>{t("protocol.headers")}</span>
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
                <span>{t("protocol.websocket.message")}</span>
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
                  <strong>{t("protocol.skipCertificate")}</strong>
                  <small>{t("protocol.websocket.certificateHint")}</small>
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
                  ? t("protocol.websocket.waiting")
                  : webSocketInput.message
                    ? t("protocol.websocket.sendListen")
                    : t("protocol.websocket.connectListen")}
              </Button>
              {activeOperation?.mode === "websocket" && (
                <Button
                  variant="danger"
                  type="button"
                  disabled={canceling}
                  onClick={() => void cancelActiveOperation()}
                >
                  <Square size={13} fill="currentColor" />
                  {canceling
                    ? t("protocol.canceling")
                    : t("protocol.cancel")}
                </Button>
              )}
              <span>{t("protocol.websocket.listenHint")}</span>
            </div>
          </form>

          <section
            className="tool-panel protocol-result"
            aria-label={t("protocol.websocket.resultLabel")}
          >
            <ResultHeader
              title={t("protocol.websocket.resultTitle")}
              description={t("protocol.websocket.resultDescription")}
            />
            {loading === "websocket" ? (
              <LoadingResult label={t("protocol.websocket.loading")} />
            ) : webSocketResult ? (
              <>
                <ResultMetrics
                  items={[
                    { label: "Handshake", value: webSocketResult.statusCode },
                    {
                      label: t("protocol.websocket.protocol"),
                      value: webSocketResult.protocol || "—",
                    },
                    {
                      label: t("protocol.metric.duration"),
                      value: durationLabel(
                        webSocketResult.durationMs,
                        locale,
                        t,
                      ),
                    },
                    {
                      label: t("protocol.metric.message"),
                      value: webSocketResult.messages.length,
                    },
                  ]}
                />
                <HeaderDetails
                  headers={webSocketResult.headers}
                  label={t("protocol.websocket.handshakeHeaders")}
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
                            {message.sizeBytes.toLocaleString(locale)} B
                          </small>
                        </header>
                        <pre>{message.data}</pre>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ProtocolEmpty
                    icon={MessageSquare}
                    title={t("protocol.websocket.noMessagesTitle")}
                  >
                    {t("protocol.websocket.noMessagesDescription")}
                  </ProtocolEmpty>
                )}
              </>
            ) : (
              <ProtocolEmpty
                icon={MessageSquare}
                title={t("protocol.noConnectionTitle")}
              >
                {t("protocol.websocket.noConnectionDescription")}
              </ProtocolEmpty>
            )}
          </section>
        </div>
      )}

      {mode === "grpc" && (
        <div
          className="protocol-workspace"
          id="protocol-panel-grpc"
          role="tabpanel"
          aria-labelledby="protocol-tab-grpc"
        >
          <form
            className="tool-panel protocol-form"
            onSubmit={(event) => void inspectGRPC(event)}
          >
            <div className="tool-card-header">
              <div>
                <strong>{t("protocol.grpc.connection")}</strong>
                <span>{t("protocol.grpc.connectionDescription")}</span>
              </div>
              <span className="protocol-method">HTTP/2</span>
            </div>
            <div className="protocol-fields">
              <label className="protocol-field protocol-field-wide">
                <span>{t("protocol.grpc.address")}</span>
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
                <small>{t("protocol.grpc.addressHint")}</small>
              </label>
              <label className="protocol-field">
                <span>{t("protocol.label.timeout")}</span>
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
                  <span>{t("protocol.unit.seconds")}</span>
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
                  <strong>{t("protocol.grpc.useTLS")}</strong>
                  <small>{t("protocol.grpc.tlsHint")}</small>
                </span>
              </label>
              <label className="protocol-field protocol-field-wide">
                <span>{t("protocol.grpc.serverName")}</span>
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
                  <strong>{t("protocol.skipCertificate")}</strong>
                  <small>{t("protocol.grpc.certificateHint")}</small>
                </span>
              </label>
              <label className="protocol-field protocol-field-wide">
                <span>{t("protocol.grpc.metadata")}</span>
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
                <small>{t("protocol.grpc.metadataHint")}</small>
              </label>
            </div>
            <div className="tool-card-actions protocol-actions">
              <Button variant="primary" type="submit" disabled={busy}>
                {loading === "grpc" ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Play size={14} />
                )}
                {loading === "grpc"
                  ? t("protocol.grpc.reading")
                  : t("protocol.grpc.discover")}
              </Button>
              {activeOperation?.mode === "grpc" && (
                <Button
                  variant="danger"
                  type="button"
                  disabled={canceling}
                  onClick={() => void cancelActiveOperation()}
                >
                  <Square size={13} fill="currentColor" />
                  {canceling
                    ? t("protocol.canceling")
                    : t("protocol.cancel")}
                </Button>
              )}
              <span>{t("protocol.grpc.reflectionHint")}</span>
            </div>
          </form>

          <section
            className="tool-panel protocol-result"
            aria-label={t("protocol.grpc.resultLabel")}
          >
            <ResultHeader
              title={t("protocol.grpc.resultTitle")}
              description={t("protocol.grpc.resultDescription")}
            />
            {loading === "grpc" ? (
              <LoadingResult label={t("protocol.grpc.loading")} />
            ) : grpcResult ? (
              <>
                <ResultMetrics
                  items={[
                    {
                      label: t("protocol.metric.connection"),
                      value: grpcResult.connectionState || "—",
                    },
                    {
                      label: t("protocol.grpc.reflection"),
                      value: grpcResult.reflectionVersion || "—",
                    },
                    {
                      label: t("protocol.metric.duration"),
                      value: durationLabel(grpcResult.durationMs, locale, t),
                    },
                    {
                      label: t("protocol.metric.service"),
                      value: grpcResult.services.length,
                    },
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
                  <ProtocolEmpty
                    icon={Server}
                    title={t("protocol.grpc.noServicesTitle")}
                  >
                    {t("protocol.grpc.noServicesDescription")}
                  </ProtocolEmpty>
                )}
              </>
            ) : (
              <ProtocolEmpty
                icon={Network}
                title={t("protocol.grpc.noDiscoveryTitle")}
              >
                {t("protocol.grpc.noDiscoveryDescription")}
              </ProtocolEmpty>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
