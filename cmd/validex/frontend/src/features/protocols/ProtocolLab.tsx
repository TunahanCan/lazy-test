import {
  Inbox,
  LoaderCircle,
  Play,
  RadioTower,
  Square,
} from "lucide-react";
import {
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "../../shared/ui";
import { useLocale, useTranslation } from "../../i18n";
import { backend } from "../../lib/backend";
import type { SSEInput, SSEResult } from "../../lib/types";
import { cn } from "../../lib/utils";
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
} from "./model";

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
  const [loading, setLoading] = useState(false);
  const [activeOperationID, setActiveOperationID] = useState("");
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

  const runSSE = async (event: FormEvent) => {
    event.preventDefault();
    setIssue(null);
    setSSEResult(null);
    let operationID = "";
    let backendStarted = false;

    try {
      operationID = createOperationID();
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
      setLoading(true);
      setActiveOperationID(operationID);
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
      setLoading(false);
      setActiveOperationID((current) =>
        current === operationID ? "" : current,
      );
      setCanceling(false);
    }
  };

  const cancelActiveOperation = async () => {
    if (!activeOperationID || canceling) return;
    setCanceling(true);

    try {
      const accepted = await backend.cancelToolOperation(activeOperationID);
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

  const busy = loading;
  return (
    <section
      className="tool-page protocol-lab"
      aria-labelledby="protocol-lab-title"
    >
      <header className="tool-page-header">
        <div>
          <span className="tool-eyebrow">{t("protocol.eyebrow")}</span>
          <h1 id="protocol-lab-title">{t("protocol.title")}</h1>
          <p>{t("protocol.description")}</p>
        </div>
      </header>

      {issue && <ProtocolError issue={issue} />}

      <div className="protocol-workspace">
        <form
          className="tool-panel protocol-form"
          onSubmit={(event) => void runSSE(event)}
        >
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
              {loading ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Play size={14} />
              )}
              {loading
                ? t("protocol.sse.listening")
                : t("protocol.sse.listen")}
            </Button>
            {activeOperationID && (
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
          {loading ? (
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
                          <td>
                            <code>{item.event || "message"}</code>
                          </td>
                          <td>
                            <code>{item.id || "—"}</code>
                          </td>
                          <td>
                            {item.hasRetry ? `${item.retryMillis} ms` : "—"}
                          </td>
                          <td>
                            <pre>{item.data}</pre>
                          </td>
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
    </section>
  );
}
