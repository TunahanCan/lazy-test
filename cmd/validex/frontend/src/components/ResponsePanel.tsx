import { lazy, Suspense, useMemo, useState } from "react";
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Clock3,
  FileJson2,
  FileText,
  Network,
  Plus,
  Search,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import type { RequestTab, ResponseEnvelope } from "../lib/types";
import {
  cn,
  formatBytes,
  formatDuration,
  statusTone,
} from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { Button, CountBadge, EmptyState, StatusMark } from "./ui";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((module) => ({ default: module.default })),
);

const responseSections = [
  { id: "body", label: "Body", icon: Braces },
  { id: "headers", label: "Headers", icon: FileText },
  { id: "cookies", label: "Cookies", icon: FileJson2 },
  { id: "assertions", label: "Assertions", icon: CheckCircle2 },
  { id: "timeline", label: "Timeline", icon: Clock3 },
  { id: "contract", label: "Contract", icon: ShieldCheck },
  { id: "console", label: "Console", icon: TerminalSquare },
  { id: "raw", label: "Raw", icon: Network },
] as const;

function EditorFallback() {
  return <div className="editor-loading">Response viewer hazırlanıyor…</div>;
}

function ResponseBody({ response }: { response: ResponseEnvelope }) {
  const [mode, setMode] = useState<"pretty" | "raw" | "preview">("pretty");
  return (
    <div className="response-body">
      <div className="response-toolbar">
        <div className="segmented">
          {(["pretty", "raw", "preview"] as const).map((item) => (
            <button
              key={item}
              className={cn(mode === item && "active")}
              onClick={() => setMode(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <div className="response-toolbar-actions">
          <button>
            <Search size={14} /> Find
          </button>
          <button
            onClick={() =>
              void navigator.clipboard?.writeText(
                mode === "raw" ? response.rawBody : response.body,
              )
            }
          >
            <Clipboard size={14} /> Copy
          </button>
        </div>
      </div>
      <Suspense fallback={<EditorFallback />}>
        <MonacoEditor
          height="100%"
          language={
            response.contentType.toLowerCase().includes("json") ? "json" : "text"
          }
          value={mode === "raw" ? response.rawBody : response.body}
          theme={
            document.documentElement.dataset.theme === "dark" ? "vs-dark" : "light"
          }
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
            lineHeight: 19,
            scrollBeyondLastLine: false,
            wordWrap: mode === "preview" ? "on" : "off",
            folding: true,
            lineNumbers: mode === "preview" ? "off" : "on",
            renderLineHighlight: "none",
            padding: { top: 12, bottom: 12 },
          }}
        />
      </Suspense>
    </div>
  );
}

function HeaderTable({ response }: { response: ResponseEnvelope }) {
  const entries = Object.entries(response.headers);
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

function Timeline({ response }: { response: ResponseEnvelope }) {
  const max = Math.max(...response.timeline.map((phase) => phase.durationMs), 1);
  return (
    <div className="timeline">
      <div className="timeline-ruler">
        <span>0 ms</span>
        <span>{formatDuration(response.durationMs / 2)}</span>
        <span>{formatDuration(response.durationMs)}</span>
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
                width: `${Math.max(phase.durationMs ? 2 : 0, (phase.durationMs / max) * 100)}%`,
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

export function ResponsePanel({
  tab,
  response,
}: {
  tab: RequestTab;
  response?: ResponseEnvelope | null;
}) {
  const updateTab = useWorkspaceStore((state) => state.updateTab);
  const activeSection = tab.responseSection;
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

  return (
    <section className="response-panel" aria-label="Response">
      <div className="response-summary">
        <div className="response-summary-primary">
          {response ? (
            <>
              <StatusMark tone={tone}>
                {response.statusCode} {responseTitle}
              </StatusMark>
              <span>
                <Clock3 size={13} /> {formatDuration(response.durationMs)}
              </span>
              <span>{formatBytes(response.sizeBytes)}</span>
              <span>{response.contentType || "Unknown content type"}</span>
              <span>{response.protocol}</span>
            </>
          ) : tab.userError ? (
            <StatusMark tone="danger">Request failed</StatusMark>
          ) : (
            <span className="response-idle">Response</span>
          )}
        </div>
        {response && (
          <div className="response-summary-secondary">
            <span>{response.tls}</span>
            {response.traceId && (
              <button
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

      <div className="response-tabs" role="tablist" aria-label="Response views">
        {responseSections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeSection === id}
            className={cn(activeSection === id && "active")}
            onClick={() => updateTab(tab.id, { responseSection: id })}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
            {id === "headers" && headerCount > 0 && (
              <CountBadge>{headerCount}</CountBadge>
            )}
            {id === "cookies" && response && response.cookies.length > 0 && (
              <CountBadge>{response.cookies.length}</CountBadge>
            )}
          </button>
        ))}
        <button className="response-more" aria-label="Daha fazla response görünümü">
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="response-content">
        {tab.userError ? (
          <div className="user-error-card" role="alert">
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
        ) : activeSection === "body" ? (
          <ResponseBody response={response} />
        ) : activeSection === "headers" ? (
          <HeaderTable response={response} />
        ) : activeSection === "cookies" ? (
          response.cookies.length ? (
            <div className="kv-table response-kv-table">
              {response.cookies.map((cookie) => (
                <div className="kv-row" key={cookie.name}>
                  <code>{cookie.name}</code>
                  <span>{cookie.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Bu response cookie içermiyor"
              description="Set-Cookie header’ları alındığında güvenlik ve süre bilgileriyle burada listelenir."
            />
          )
        ) : activeSection === "timeline" ? (
          <Timeline response={response} />
        ) : activeSection === "raw" ? (
          <pre className="raw-response">{response.rawBody}</pre>
        ) : activeSection === "assertions" ? (
          <EmptyState
            icon="new"
            title="Assertion ekleyin"
            description="Status, süre veya JSON alanlarını doğrulayarak request’i tekrarlanabilir bir teste dönüştürün."
            primaryLabel="Add assertion"
          />
        ) : activeSection === "contract" ? (
          <EmptyState
            title="Contract doğrulaması çalıştırılmadı"
            description="Bu response’u bağlı OpenAPI schema’sı ile karşılaştırarak eksik, fazla veya hatalı tipleri bulun."
            primaryLabel="Validate contract"
          />
        ) : (
          <div className="console-empty">
            <TerminalSquare size={18} />
            <span>Bu request için console kaydı yok.</span>
            <Button size="sm" variant="ghost">
              <Plus size={13} /> Add script
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
