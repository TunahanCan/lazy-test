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
  ShieldCheck,
} from "lucide-react";
import { useResolvedTheme } from "../../app/useResolvedTheme";
import {
  useTranslation,
  type TranslationKey,
} from "../../i18n";
import type {
  ContractFinding,
  RequestTab,
  ResponseEnvelope,
  UserError,
} from "../../lib/types";
import {
  cn,
  formatBytes,
  formatDuration,
  statusTone,
} from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspace";
import {
  CountBadge,
  EmptyState,
  StatusMark,
} from "../../shared/ui";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((module) => ({ default: module.default })),
);

const baseResponseSections = [
  { id: "body", labelKey: "requests.response.section.body", icon: Braces },
  {
    id: "headers",
    labelKey: "requests.response.section.headers",
    icon: FileText,
  },
  {
    id: "cookies",
    labelKey: "requests.response.section.cookies",
    icon: FileJson2,
  },
  {
    id: "timeline",
    labelKey: "requests.response.section.timeline",
    icon: Clock3,
  },
  { id: "raw", labelKey: "requests.response.section.raw", icon: Network },
] as const;

type ResponseSectionID = RequestTab["responseSection"];

interface LocalizedErrorKeys {
  title: TranslationKey;
  message: TranslationKey;
  hint?: TranslationKey;
}

const requestErrorKeys: Readonly<
  Partial<Record<string, LocalizedErrorKeys>>
> = {
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
  request_canceled: {
    title: "requests.error.canceled.title",
    message: "requests.error.canceled.message",
    hint: "requests.error.canceled.hint",
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
  empty_response: {
    title: "requests.error.emptyResponse.title",
    message: "requests.error.emptyResponse.message",
    hint: "requests.error.emptyResponse.hint",
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
};

const timelineLabelKeys: Readonly<
  Partial<Record<string, TranslationKey>>
> = {
  preparation: "requests.response.timeline.preparation",
  dns: "requests.response.timeline.dns",
  tcp: "requests.response.timeline.tcp",
  tls: "requests.response.timeline.tls",
  request: "requests.response.timeline.request",
  server: "requests.response.timeline.server",
  download: "requests.response.timeline.download",
};

function EditorFallback() {
  const t = useTranslation();
  return (
    <div className="editor-loading">
      {t("requests.response.viewerLoading")}
    </div>
  );
}

function ResponseBody({ response }: { response: ResponseEnvelope }) {
  const t = useTranslation();
  const resolvedTheme = useResolvedTheme();
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
          {t("requests.response.formatted")}
        </span>
        <div className="response-toolbar-actions">
          <button type="button" onClick={() => void copyBody()}>
            {copied ? <Check size={14} /> : <Clipboard size={14} />}
            {copied
              ? t("requests.response.copied")
              : t("requests.response.copyBody")}
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
          theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
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
  const t = useTranslation();
  const entries = Object.entries(response.headers);
  if (entries.length === 0) {
    return (
      <EmptyState
        title={t("requests.response.noHeaders.title")}
        description={t("requests.response.noHeaders.description")}
      />
    );
  }
  return (
    <div className="kv-table response-kv-table">
      <div className="kv-header">
        <span>{t("requests.response.header")}</span>
        <span>{t("requests.response.value")}</span>
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
  const t = useTranslation();
  if (response.cookies.length === 0) {
    return (
      <EmptyState
        title={t("requests.response.noCookies.title")}
        description={t("requests.response.noCookies.description")}
      />
    );
  }
  return (
    <div className="kv-table response-kv-table cookie-table">
      <div className="kv-header">
        <span>{t("requests.response.cookie")}</span>
        <span>{t("requests.response.valueAndAttributes")}</span>
      </div>
      {response.cookies.map((cookie, index) => {
        const attributes = [
          cookie.domain &&
            t("requests.response.cookie.domain", { value: cookie.domain }),
          cookie.path &&
            t("requests.response.cookie.path", { value: cookie.path }),
          cookie.httpOnly && "HttpOnly",
          cookie.secure && "Secure",
          cookie.expires &&
            t("requests.response.cookie.expires", { value: cookie.expires }),
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

function contractFindingLabelKey(finding: ContractFinding): TranslationKey {
  switch (finding.type) {
    case "missing":
      return "requests.response.finding.missing";
    case "extra":
      return "requests.response.finding.extra";
    case "enum_violation":
      return "requests.response.finding.enum";
    case "type_mismatch":
      return "requests.response.finding.type";
  }
}

function ContractResult({ response }: { response: ResponseEnvelope }) {
  const t = useTranslation();
  const contract = response.contract;
  if (!contract) {
    return (
      <EmptyState
        title={t("requests.response.contract.pending.title")}
        description={t("requests.response.contract.pending.description")}
      />
    );
  }
  if (contract.error) {
    let error = contract.error;
    switch (contract.error.code) {
      case "operation_changed":
        error = {
          ...contract.error,
          title: t("requests.error.operationChanged.title"),
          message: t("requests.error.operationChanged.message", {
            path: contract.path,
          }),
          hint: t("requests.error.operationChanged.hint"),
        };
        break;
      case "contract_check_failed":
        error = {
          ...contract.error,
          title: t("requests.error.contractCheck.title"),
          message: t("requests.error.contractCheck.message"),
        };
        break;
      case "spec_unavailable":
        error = {
          ...contract.error,
          title: t("requests.response.contract.specUnavailable.title"),
          message: t("requests.response.contract.specUnavailable.message"),
          hint: t("requests.response.contract.specUnavailable.hint"),
        };
        break;
      case "response_schema_unavailable":
        error = {
          ...contract.error,
          title: t("requests.response.contract.schemaUnavailable.title"),
          message: t(
            "requests.response.contract.schemaUnavailable.message",
            {
              status: response.statusCode,
              contentType:
                response.contentType ||
                t("requests.response.unknownContentType"),
            },
          ),
          hint: t("requests.response.contract.schemaUnavailable.hint"),
        };
        break;
      case "operation_unavailable":
        error = {
          ...contract.error,
          title: t("requests.response.contract.operationUnavailable.title"),
          message: t(
            "requests.response.contract.operationUnavailable.message",
            { method: contract.method, path: contract.path },
          ),
        };
        break;
    }
    return (
      <div className="contract-state contract-unavailable" role="status">
        <AlertTriangle size={20} aria-hidden="true" />
        <div>
          <strong>{error.title}</strong>
          <p>{error.message}</p>
          {error.hint && <span>{error.hint}</span>}
        </div>
      </div>
    );
  }
  if (contract.ok) {
    return (
      <div className="contract-state contract-ok" role="status">
        <ShieldCheck size={20} aria-hidden="true" />
        <div>
          <strong>{t("requests.response.contract.ok.title")}</strong>
          <p>
            {t("requests.response.contract.ok.description", {
              method: contract.method,
              path: contract.path,
            })}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="contract-findings">
      <div className="contract-state contract-drift" role="alert">
        <AlertTriangle size={20} aria-hidden="true" />
        <div>
          <strong>
            {t(
              contract.findings.length === 1
                ? "requests.response.contract.drift.one"
                : "requests.response.contract.drift.many",
              { count: contract.findings.length },
            )}
            {contract.truncated &&
              ` (${t("requests.response.contract.truncated")})`}
          </strong>
          <p>{t("requests.response.contract.driftDescription")}</p>
        </div>
      </div>
      <div className="contract-table">
        <div className="contract-row contract-header">
          <span>{t("requests.response.contract.jsonPath")}</span>
          <span>{t("requests.response.contract.difference")}</span>
          <span>{t("requests.response.contract.expected")}</span>
          <span>{t("requests.response.contract.actual")}</span>
        </div>
        {contract.findings.map((finding, index) => (
          <div
            className="contract-row"
            key={`${finding.path}-${finding.type}-${index}`}
          >
            <code>{finding.path || "$"}</code>
            <span>{t(contractFindingLabelKey(finding))}</span>
            <span>{finding.expected || finding.allowed?.join(", ") || "—"}</span>
            <span>{finding.actual || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Timeline({ response }: { response: ResponseEnvelope }) {
  const t = useTranslation();
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
            <span>
              {timelineLabelKeys[phase.id]
                ? t(timelineLabelKeys[phase.id]!)
                : phase.label}
            </span>
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
            <p className="timeline-description">
              {phase.id === "request"
                ? t("requests.response.timeline.reused")
                : phase.id === "server"
                  ? t("requests.response.timeline.slow", {
                      percent: Math.round(
                        (phase.durationMs / total) * 100,
                      ),
                    })
                  : phase.description}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function ResponsePanel({ tab }: { tab: RequestTab }) {
  const t = useTranslation();
  const updateTab = useWorkspaceStore((state) => state.updateTab);
  const response = tab.response;
  const responseSections = useMemo(
    () =>
      tab.openApi || response?.contract
        ? [
            ...baseResponseSections,
            {
              id: "contract" as const,
              labelKey: "requests.response.section.contract" as const,
              icon: ShieldCheck,
            },
          ]
        : [...baseResponseSections],
    [response?.contract, tab.openApi],
  );
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
  const userError = useMemo<UserError | undefined>(() => {
    if (!tab.userError) return undefined;
    const keys = requestErrorKeys[tab.userError.code];
    if (!keys) return tab.userError;
    return {
      ...tab.userError,
      title: t(keys.title),
      message: t(keys.message),
      hint: keys.hint ? t(keys.hint) : undefined,
    };
  }, [t, tab.userError]);

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
      <section
        className="response-panel"
        aria-label={t("requests.response.label")}
      >
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
                  {response.contentType ||
                    t("requests.response.unknownContentType")}
                </span>
                <span className="response-protocol">{response.protocol}</span>
              </>
            ) : tab.running ? (
              <StatusMark tone="warning">
                <LoaderCircle className="spin" size={13} />{" "}
                {t("requests.response.sending")}
              </StatusMark>
            ) : tab.userError ? (
              <StatusMark tone={canceled ? "warning" : "danger"}>
                {canceled
                  ? t("requests.response.canceled")
                  : t("requests.response.failed")}
              </StatusMark>
            ) : (
              <span className="response-idle">
                {t("requests.response.label")}
              </span>
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
                  title={t("requests.response.traceCopy")}
                >
                  Trace {response.traceId.slice(0, 10)}
                </button>
              )}
            </div>
          )}
        </div>

        <Tabs.List
          className="response-tabs"
          aria-label={t("requests.response.views")}
        >
          {responseSections.map(({ id, labelKey, icon: Icon }) => (
            <Tabs.Trigger key={id} value={id}>
              <Icon size={13} aria-hidden="true" />
              {t(labelKey)}
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
              <strong>{t("requests.response.loading.title")}</strong>
              <span>{t("requests.response.loading.description")}</span>
            </div>
          ) : userError ? (
            <div
              className={cn("user-error-card", canceled && "request-canceled")}
              role={canceled ? "status" : "alert"}
            >
              <div className="user-error-icon">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3>{userError.title}</h3>
                <p>{userError.message}</p>
                {userError.hint && <strong>{userError.hint}</strong>}
                {userError.technical && (
                  <details>
                    <summary>
                      {t("requests.response.technicalDetails")}
                    </summary>
                    <code>{userError.technical}</code>
                  </details>
                )}
              </div>
            </div>
          ) : !response ? (
            <EmptyState
              title={t("requests.response.empty.title")}
              description={t("requests.response.empty.description")}
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
              <Tabs.Content value="contract" className="response-tab-content">
                <ContractResult response={response} />
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
