import { lazy, Suspense, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertTriangle,
  Braces,
  Check,
  Clipboard,
  Clock3,
  FileJson2,
  FileText,
  LoaderCircle,
  Network,
} from "lucide-react";
import type { RequestTab, ResponseEnvelope } from "../lib/types";
import { cn, formatBytes, formatDuration, statusTone } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { CountBadge, EmptyState, StatusMark } from "./ui";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((module) => ({ default: module.default })),
);

const responseSections = [
  { id: "body", label: "Body", icon: Braces },
  { id: "headers", label: "Headers", icon: FileText },
  { id: "cookies", label: "Cookies", icon: FileJson2 },
  { id: "timeline", label: "Timeline", icon: Clock3 },
  { id: "raw", label: "Raw", icon: Network },
] as const;

type ResponseSectionID = (typeof responseSections)[number]["id"];

function EditorFallback() {
  return <div className="editor-loading">Response viewer hazırlanıyor…</div>;
}

function ResponseBody({ response }: { response: ResponseEnvelope }) {
  const [copied, setCopied] = useState(false);
  const copyBody = async () => {
    try {
      await navigator.clipboard?.writeText(response.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="response-body">
      <div className="response-toolbar">
        <span className="response-format-label">
          <Braces size={13} aria-hidden="true" />
          Formatted response
        </span>
        <div className="response-toolbar-actions">
          <button type="button" onClick={() => void copyBody()}>
            {copied ? <Check size={14} /> : <Clipboard size={14} />}
            {copied ? "Copied" : "Copy body"}
          </button>
        </div>
      </div>
      <Suspense fallback={<EditorFallback />}>
        <MonacoEditor
          height="100%"
          language={
            response.contentType.toLowerCase().includes("json") ? "json" : "text"
          }
          value={response.body}
          theme={
            document.documentElement.dataset.theme === "dark" ? "vs-dark" : "light"
          }
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
            lineHeight: 19,
            scrollBeyondLastLine: false,
            wordWrap: "off",
            folding: true,
            lineNumbers: "on",
            renderLineHighlight: "none",
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </Suspense>
    </div>
  );
}

function HeaderTable({ response }: { response: ResponseEnvelope }) {
  const entries = Object.entries(response.headers);
  if (entries.length === 0) {
    return (
      <EmptyState
        title="Bu response header içermiyor"
        description="Sunucudan header döndüğünde burada listelenir."
      />
    );
  }
  return (
    <div className="kv-table response-kv-table">
      <div className="kv-header">
        <span>Header</span>
        <span>Value</span>
      </div>
      {entries.map(([key, values]) =>
        values.map((value, index) => (
          <div className="kv-row" key={`${key}-${index}`}>
            <code>{key}</code>
            <span>{value}</span>
          </div>
        )),
      )}
    </div>
  );
}

function CookieTable({ response }: { response: ResponseEnvelope }) {
  if (response.cookies.length === 0) {
    return (
      <EmptyState
        title="Bu response cookie içermiyor"
        description="Set-Cookie header’ları alındığında güvenlik ve süre bilgileriyle burada listelenir."
      />
    );
  }
  return (
    <div className="kv-table response-kv-table cookie-table">
      <div className="kv-header">
        <span>Cookie</span>
        <span>Value and attributes</span>
      </div>
      {response.cookies.map((cookie, index) => {
        const attributes = [
          cookie.domain && `Domain ${cookie.domain}`,
          cookie.path && `Path ${cookie.path}`,
          cookie.httpOnly && "HttpOnly",
          cookie.secure && "Secure",
          cookie.expires && `Expires ${cookie.expires}`,
        ].filter(Boolean);
        return (
          <div
            className="kv-row"
            key={`${cookie.name}-${cookie.domain}-${cookie.path}-${index}`}
          >
            <code>{cookie.name}</code>
            <span className="cookie-value">
              <span>{cookie.value}</span>
              {attributes.length > 0 && <small>{attributes.join(" · ")}</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Timeline({ response }: { response: ResponseEnvelope }) {
  const total = Math.max(response.durationMs, 1);
  return (
    <div className="timeline">
      <div className="timeline-ruler">
        <span>0 ms</span>
        <span>{formatDuration(total / 2)}</span>
        <span>{formatDuration(total)}</span>
      </div>
      {response.timeline.map((phase) => (
        <div className="timeline-row" key={phase.id}>
          <div className="timeline-label">
            <span>{phase.label}</span>
            <strong>{formatDuration(phase.durationMs)}</strong>
          </div>
          <div className="timeline-track">
            <span
              className={cn(
                "timeline-bar",
                phase.id === "server" && "timeline-bar-slow",
              )}
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    phase.durationMs ? 2 : 0,
                    (phase.durationMs / total) * 100,
                  ),
                )}%`,
              }}
            />
          </div>
          {phase.description && (
            <p className="timeline-description">{phase.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function ResponsePanel({ tab }: { tab: RequestTab }) {
  const updateTab = useWorkspaceStore((state) => state.updateTab);
  const response = tab.response;
  const activeSection: ResponseSectionID = responseSections.some(
    (section) => section.id === tab.responseSection,
  )
    ? (tab.responseSection as ResponseSectionID)
    : "body";
  const headerCount = response
    ? Object.values(response.headers).reduce(
        (count, values) => count + values.length,
        0,
      )
    : 0;
  const tone = response ? statusTone(response.statusCode) : "success";
  const responseTitle = useMemo(
    () => response?.status.replace(/^\d+\s*/, "") || "",
    [response?.status],
  );
  const canceled = tab.userError?.code === "request_canceled";

  return (
    <Tabs.Root
      asChild
      value={activeSection}
      onValueChange={(value) =>
        updateTab(tab.id, {
          responseSection: value as RequestTab["responseSection"],
        })
      }
    >
      <section className="response-panel" aria-label="Response">
        <div className="response-summary" role="status" aria-live="polite">
          <div className="response-summary-primary">
            {response ? (
              <>
                <StatusMark tone={tone}>
                  {response.statusCode} {responseTitle}
                </StatusMark>
                <span className="response-duration">
                  <Clock3 size={13} /> {formatDuration(response.durationMs)}
                </span>
                <span className="response-size">
                  {formatBytes(response.sizeBytes)}
                </span>
                <span className="response-content-type">
                  {response.contentType || "Unknown content type"}
                </span>
                <span className="response-protocol">{response.protocol}</span>
              </>
            ) : tab.running ? (
              <StatusMark tone="warning">
                <LoaderCircle className="spin" size={13} /> Sending…
              </StatusMark>
            ) : tab.userError ? (
              <StatusMark tone={canceled ? "warning" : "danger"}>
                {canceled ? "Canceled" : "Request failed"}
              </StatusMark>
            ) : (
              <span className="response-idle">Response</span>
            )}
          </div>
          {response && (
            <div className="response-summary-secondary">
              {response.remoteAddr && <span>{response.remoteAddr}</span>}
              {response.tls && <span>{response.tls}</span>}
              {response.traceId && (
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(response.traceId)
                  }
                  title="Trace ID’yi kopyala"
                >
                  Trace {response.traceId.slice(0, 10)}
                </button>
              )}
            </div>
          )}
        </div>

        <Tabs.List className="response-tabs" aria-label="Response views">
          {responseSections.map(({ id, label, icon: Icon }) => (
            <Tabs.Trigger key={id} value={id}>
              <Icon size={13} aria-hidden="true" />
              {label}
              {id === "headers" && headerCount > 0 && (
                <CountBadge>{headerCount}</CountBadge>
              )}
              {id === "cookies" && response && response.cookies.length > 0 && (
                <CountBadge>{response.cookies.length}</CountBadge>
              )}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="response-content">
          {tab.running ? (
            <div className="response-loading" role="status">
              <LoaderCircle className="spin" size={22} aria-hidden="true" />
              <strong>Request gönderiliyor…</strong>
              <span>İsterseniz üstteki Cancel düğmesiyle durdurabilirsiniz.</span>
            </div>
          ) : tab.userError ? (
            <div
              className={cn("user-error-card", canceled && "request-canceled")}
              role={canceled ? "status" : "alert"}
            >
              <div className="user-error-icon">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3>{tab.userError.title}</h3>
                <p>{tab.userError.message}</p>
                {tab.userError.hint && <strong>{tab.userError.hint}</strong>}
                {tab.userError.technical && (
                  <details>
                    <summary>Teknik ayrıntı</summary>
                    <code>{tab.userError.technical}</code>
                  </details>
                )}
              </div>
            </div>
          ) : !response ? (
            <EmptyState
              title="Henüz response yok"
              description="Request’i gönderdiğinizde status, süre, body, header ve ayrıntılı zaman çizelgesi burada görünecek."
            />
          ) : (
            <>
              <Tabs.Content value="body" className="response-tab-content">
                <ResponseBody response={response} />
              </Tabs.Content>
              <Tabs.Content value="headers" className="response-tab-content">
                <HeaderTable response={response} />
              </Tabs.Content>
              <Tabs.Content value="cookies" className="response-tab-content">
                <CookieTable response={response} />
              </Tabs.Content>
              <Tabs.Content value="timeline" className="response-tab-content">
                <Timeline response={response} />
              </Tabs.Content>
              <Tabs.Content value="raw" className="response-tab-content">
                <pre className="raw-response">{response.rawBody}</pre>
              </Tabs.Content>
            </>
          )}
        </div>
      </section>
    </Tabs.Root>
  );
}
