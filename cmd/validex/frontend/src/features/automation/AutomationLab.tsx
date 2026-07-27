import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  FileSearch,
  ListChecks,
  LoaderCircle,
  Network,
  Play,
  Route,
  Square,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "../../i18n";
import type { Translate } from "../../i18n/LocaleProvider";
import { backend } from "../../lib/backend";
import type {
  CollectionRequestResult,
  CollectionRunReport,
  NetworkReport,
  OpenAPILintReport,
  UserError,
} from "../../lib/types";
import {
  Button,
  ToolCardHeader,
  ToolNotice,
  ToolPage,
  ToolTabs,
} from "../../shared/ui";
import {
  automationOperationID,
  durationLabel,
  parseVariables,
  positiveInteger,
  printable,
  sampleCollection,
  type AutomationMode,
} from "./model";

interface Notice {
  tone: "success" | "error" | "info";
  title?: string;
  message: string;
  hint?: string;
  technical?: string;
}

type RunnerField = "collection" | "variables";
type NetworkField = "url" | "timeout" | "maxRedirects";

const lintIssueTranslations = {
  "document.too_large": {
    message: "automation.lint.issue.document.too_large",
    hint: "automation.lint.hint.document.too_large",
  },
  "document.parse": {
    message: "automation.lint.issue.document.parse",
    hint: "automation.lint.hint.document.parse",
  },
  "document.invalid": {
    message: "automation.lint.issue.document.invalid",
    hint: "automation.lint.hint.document.invalid",
  },
  "operation.operation_id.missing": {
    message: "automation.lint.issue.operation.operation_id.missing",
    hint: "automation.lint.hint.operation.operation_id.missing",
  },
  "operation.operation_id.duplicate": {
    message: "automation.lint.issue.operation.operation_id.duplicate",
    hint: "automation.lint.hint.operation.operation_id.duplicate",
  },
  "operation.summary.missing": {
    message: "automation.lint.issue.operation.summary.missing",
    hint: "automation.lint.hint.operation.summary.missing",
  },
  "operation.tags.missing": {
    message: "automation.lint.issue.operation.tags.missing",
    hint: "automation.lint.hint.operation.tags.missing",
  },
  "operation.responses.missing": {
    message: "automation.lint.issue.operation.responses.missing",
    hint: "automation.lint.hint.operation.responses.missing",
  },
  "operation.responses.2xx_missing": {
    message: "automation.lint.issue.operation.responses.2xx_missing",
    hint: "automation.lint.hint.operation.responses.2xx_missing",
  },
  "response.json.schema_missing": {
    message: "automation.lint.issue.response.json.schema_missing",
    hint: "automation.lint.hint.response.json.schema_missing",
  },
  "response.json.example_missing": {
    message: "automation.lint.issue.response.json.example_missing",
    hint: "automation.lint.hint.response.json.example_missing",
  },
} as const;

const automationErrorTranslations = {
  backend_unavailable: {
    title: "automation.error.operation.title",
    message: "automation.error.runtime",
    hint: "automation.error.hint.native",
  },
  collection_operation_invalid: {
    title: "automation.error.collection.title",
    message: "automation.error.operationInvalid",
    hint: "automation.error.hint.operationID",
  },
  collection_invalid: {
    title: "automation.error.collection.title",
    message: "automation.error.collectionInvalid",
    hint: "automation.error.hint.collection",
  },
  collection_run_failed: {
    title: "automation.error.collection.title",
    message: "automation.error.collectionRun",
    hint: "automation.error.hint.target",
  },
  network_operation_invalid: {
    title: "automation.error.network.title",
    message: "automation.error.networkStart",
    hint: "automation.error.hint.operationID",
  },
  network_inspection_failed: {
    title: "automation.error.network.title",
    message: "automation.error.networkRun",
    hint: "automation.error.hint.target",
  },
  runtime_unavailable: {
    title: "automation.error.openapi.title",
    message: "automation.error.runtime",
    hint: "automation.error.hint.native",
  },
  file_dialog_failed: {
    title: "automation.error.openapi.title",
    message: "automation.error.fileDialog",
    hint: "automation.error.hint.fileDialog",
  },
  openapi_lint_failed: {
    title: "automation.error.openapi.title",
    message: "automation.error.openapiRead",
    hint: "automation.error.hint.file",
  },
  tool_canceled: {
    title: "automation.error.operation.title",
    message: "automation.error.canceled",
  },
  tool_timeout: {
    title: "automation.error.operation.title",
    message: "automation.error.timeout",
    hint: "automation.error.hint.timeout",
  },
} as const;

const runnerFailureTranslations = {
  invalid_request: "automation.runner.failure.invalid_request",
  missing_variables: "automation.runner.failure.missing_variables",
  request_body_too_large:
    "automation.runner.failure.request_body_too_large",
  response_body_too_large:
    "automation.runner.failure.response_body_too_large",
  response_headers_too_large:
    "automation.runner.failure.response_headers_too_large",
  request_timeout: "automation.runner.failure.request_timeout",
  request_canceled: "automation.runner.failure.request_canceled",
  send_failed: "automation.runner.failure.send_failed",
} as const;

function noticeFrom(
  error: unknown,
  fallback: string,
  t: Translate,
): Notice {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const userError = error as Partial<UserError>;
    const translation = automationErrorTranslations[
      userError.code as keyof typeof automationErrorTranslations
    ];
    if (translation) {
      return {
        tone: "error",
        title: t(translation.title),
        message: t(translation.message),
        hint: "hint" in translation
          ? t(translation.hint)
          : undefined,
        technical: userError.technical,
      };
    }
    return {
      tone: "error",
      title: userError.title,
      message: error.message,
      hint: userError.hint,
      technical: userError.technical,
    };
  }
  return {
    tone: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}

function Summary({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="automation-summary">
      {items.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RunnerResult({ report }: { report: CollectionRunReport | null }) {
  const t = useTranslation();
  if (!report) {
    return (
      <div className="tool-empty-result automation-empty">
        <ListChecks size={25} aria-hidden />
        <strong>{t("automation.runner.empty.title")}</strong>
        <span>{t("automation.runner.empty.description")}</span>
      </div>
    );
  }
  return (
    <>
      <Summary
        items={[
          {
            label: t("automation.runner.summary.requests"),
            value: report.results.length,
          },
          { label: t("automation.status.passed"), value: report.passed },
          { label: t("automation.status.failed"), value: report.failed },
          {
            label: t("automation.duration.total"),
            value: durationLabel(report.durationMs),
          },
        ]}
      />
      <div
        className="automation-result-list"
        aria-label={t("automation.runner.results")}
      >
        {report.results.map((request, index) => (
          <RequestRunResult
            key={request.id || `${request.method}-${request.url}-${index}`}
            request={request}
          />
        ))}
      </div>
    </>
  );
}

function RequestRunResult({
  request,
}: {
  request: CollectionRequestResult;
}) {
  const t = useTranslation();
  const Icon = request.passed ? CheckCircle2 : XCircle;
  const requestName = request.name || request.url;
  const failureTranslation = request.failure
    ? runnerFailureTranslations[
        request.failure.code as keyof typeof runnerFailureTranslations
      ]
    : undefined;
  return (
    <article
      className={`automation-request-result ${
        request.passed ? "passed" : "failed"
      }`}
      aria-label={t(
        request.passed
          ? "automation.runner.requestAria.passed"
          : "automation.runner.requestAria.failed",
        { name: requestName },
      )}
    >
      <header>
        <Icon size={16} aria-hidden />
        <code>{request.method}</code>
        <strong>{request.name || request.url}</strong>
        <span>{request.statusCode || "ERR"}</span>
        <small>{durationLabel(request.durationMs)}</small>
      </header>
      <code className="automation-request-url">{request.url}</code>
      {request.failure && (
        <ToolNotice
          tone="error"
          title={request.failure.code}
          hint={
            failureTranslation
              ? t("automation.runner.failure.hint")
              : request.failure.hint
          }
          technical={
            failureTranslation
              ? [request.failure.message, request.failure.hint]
                  .filter(Boolean)
                  .join(" ")
              : undefined
          }
        >
          {failureTranslation
            ? t(failureTranslation)
            : request.failure.message}
        </ToolNotice>
      )}
      {request.assertions.length > 0 && (
        <ul className="automation-assertions">
          {request.assertions.map((assertion, index) => (
            <li
              key={assertion.assertion.id || `${assertion.assertion.name}-${index}`}
              className={assertion.passed ? "passed" : "failed"}
            >
              {assertion.passed ? (
                <CheckCircle2 size={14} aria-hidden />
              ) : (
                <AlertTriangle size={14} aria-hidden />
              )}
              <span>
                <span className="sr-only">
                  {assertion.passed
                    ? t("automation.runner.assertionAria.passed")
                    : t("automation.runner.assertionAria.failed")}
                </span>
                <strong>
                  {assertion.assertion.name || assertion.assertion.target}
                </strong>
                <small>
                  {assertion.error
                    ? t("automation.runner.assertionError", {
                        details: assertion.error,
                      })
                    : assertion.message
                      ? t("automation.runner.assertionMismatch", {
                          expected: printable(
                            assertion.assertion.expected,
                          ),
                          actual: printable(assertion.actual),
                        })
                      : `${assertion.assertion.operator} · ${printable(
                          assertion.actual,
                        )}`}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function NetworkResult({ report }: { report: NetworkReport | null }) {
  const t = useTranslation();
  if (!report) {
    return (
      <div className="tool-empty-result automation-empty">
        <Network size={25} aria-hidden />
        <strong>{t("automation.network.empty.title")}</strong>
        <span>{t("automation.network.empty.description")}</span>
      </div>
    );
  }
  return (
    <>
      <Summary
        items={[
          {
            label: t("automation.network.summary.dnsHosts"),
            value: report.dnsLookups.length,
          },
          {
            label: t("automation.network.summary.httpSteps"),
            value: report.hops.length,
          },
          {
            label: t("automation.network.summary.finalStatus"),
            value: report.finalStatusCode || "—",
          },
          {
            label: t("automation.duration.total"),
            value: durationLabel(report.totalDurationMs),
          },
        ]}
      />
      <div className="automation-network-results">
        <section>
          <h2>{t("automation.network.dns.title")}</h2>
          {report.dnsLookups.length === 0 ? (
            <p>{t("automation.network.dns.empty")}</p>
          ) : (
            <ul>
              {report.dnsLookups.map((lookup) => (
                <li key={lookup.host}>
                  <span>
                    <strong>{lookup.host}</strong>
                    <small>{durationLabel(lookup.durationMs)}</small>
                  </span>
                  <code>
                    {lookup.ips.join(", ") ||
                      t("automation.network.dns.noIP")}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2>{t("automation.network.redirect.title")}</h2>
          <ol>
            {report.hops.map((hop, index) => (
              <li key={`${hop.url}-${index}`}>
                <span>
                  <code>{hop.method}</code>
                  <strong>{hop.statusCode}</strong>
                  <small>{durationLabel(hop.durationMs)}</small>
                </span>
                <code>{hop.url}</code>
                {hop.location && <small>→ {hop.location}</small>}
              </li>
            ))}
          </ol>
          <div className="automation-final-url">
            <strong>{t("automation.network.finalURL")}</strong>
            <code>{report.finalUrl || report.inputUrl}</code>
          </div>
        </section>
      </div>
    </>
  );
}

function LintResult({ report }: { report: OpenAPILintReport | null }) {
  const t = useTranslation();
  if (!report) {
    return (
      <div className="tool-empty-result automation-empty">
        <FileSearch size={25} aria-hidden />
        <strong>{t("automation.lint.empty.title")}</strong>
        <span>{t("automation.lint.empty.description")}</span>
      </div>
    );
  }
  return (
    <>
      <Summary
        items={[
          {
            label: t("automation.lint.summary.operations"),
            value: report.summary.operations,
          },
          {
            label: t("automation.status.error"),
            value: report.summary.errors,
          },
          {
            label: t("automation.status.warning"),
            value: report.summary.warnings,
          },
          {
            label: t("automation.status.info"),
            value: report.summary.infos,
          },
        ]}
      />
      {report.issues.length === 0 ? (
        <div className="tool-success-card automation-success">
          <CheckCircle2 size={17} aria-hidden />
          <span>{t("automation.lint.success")}</span>
        </div>
      ) : (
        <ul
          className="automation-lint-list"
          aria-label={t("automation.lint.results")}
        >
          {report.issues.map((issue, index) => {
            const Icon =
              issue.severity === "error"
                ? XCircle
                : issue.severity === "warning"
                  ? AlertTriangle
                  : CircleDot;
            const severityLabel =
              issue.severity === "error"
                ? t("automation.status.error")
                : issue.severity === "warning"
                  ? t("automation.status.warning")
                  : t("automation.status.info");
            const issueTranslation = lintIssueTranslations[
              issue.code as keyof typeof lintIssueTranslations
            ];
            return (
              <li
                key={`${issue.code}-${issue.path}-${index}`}
                className={issue.severity}
              >
                <Icon size={15} aria-hidden />
                <div>
                  <header>
                    <span className="sr-only">{severityLabel}: </span>
                    <strong>{issue.code}</strong>
                    <code>{issue.path}</code>
                  </header>
                  <p>
                    {issueTranslation
                      ? t(issueTranslation.message)
                      : issue.message}
                  </p>
                  {issue.hint && (
                    <small>
                      {issueTranslation
                        ? t(issueTranslation.hint)
                        : issue.hint}
                    </small>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {report.truncated && (
        <ToolNotice>
          {t("automation.lint.truncated")}
        </ToolNotice>
      )}
    </>
  );
}

export function AutomationLab() {
  const t = useTranslation();
  const modes = [
    {
      id: "runner",
      label: t("automation.tab.runner"),
      icon: ListChecks,
    },
    {
      id: "network",
      label: t("automation.tab.network"),
      icon: Route,
    },
    {
      id: "openapi",
      label: t("automation.tab.openapi"),
      icon: FileSearch,
    },
  ] as const;
  const [mode, setMode] = useState<AutomationMode>("runner");
  const [notice, setNotice] = useState<Notice | null>(null);

  const [collection, setCollection] = useState(sampleCollection);
  const [variables, setVariables] = useState("{}");
  const [runnerReport, setRunnerReport] =
    useState<CollectionRunReport | null>(null);
  const [runnerOperation, setRunnerOperation] = useState("");
  const [runnerFieldErrors, setRunnerFieldErrors] = useState<
    Partial<Record<RunnerField, string>>
  >({});

  const [networkURL, setNetworkURL] = useState("http://localhost:8080");
  const [networkTimeout, setNetworkTimeout] = useState("15");
  const [maxRedirects, setMaxRedirects] = useState("10");
  const [insecureSkipVerify, setInsecureSkipVerify] = useState(false);
  const [networkReport, setNetworkReport] = useState<NetworkReport | null>(null);
  const [networkOperation, setNetworkOperation] = useState("");
  const [networkFieldErrors, setNetworkFieldErrors] = useState<
    Partial<Record<NetworkField, string>>
  >({});

  const [lintReport, setLintReport] = useState<OpenAPILintReport | null>(null);
  const [lintPath, setLintPath] = useState("");
  const [lintPending, setLintPending] = useState(false);

  const runCollection = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setRunnerReport(null);
    setRunnerFieldErrors({});
    const operationID = automationOperationID("collection");
    let validationField: RunnerField | undefined = "collection";
    try {
      JSON.parse(collection);
      validationField = "variables";
      const inputVariables = parseVariables(variables, t);
      validationField = undefined;
      setRunnerOperation(operationID);
      const result = await backend.runCollection({
        operationId: operationID,
        definition: collection,
        variables: inputVariables,
      });
      if (result.report) setRunnerReport(result.report);
      if (result.error) {
        setNotice(
          noticeFrom(
            result.error,
            t("automation.runner.failedFallback"),
            t,
          ),
        );
        return;
      }
      const failed = result.report?.failed ?? 0;
      setNotice({
        tone: failed === 0 ? "success" : "error",
        message:
          failed === 0
            ? t("automation.runner.success")
            : t("automation.runner.failureCount", { count: failed }),
      });
    } catch (error) {
      const nextNotice =
        error instanceof SyntaxError && validationField
          ? {
              tone: "error" as const,
              message: t(
                validationField === "collection"
                  ? "automation.validation.collectionJSON"
                  : "automation.validation.variablesJSON",
                { details: error.message },
              ),
            }
          : noticeFrom(
              error,
              t("automation.runner.failedFallback"),
              t,
            );
      if (validationField) {
        setRunnerFieldErrors({ [validationField]: nextNotice.message });
      }
      setNotice(nextNotice);
    } finally {
      setRunnerOperation("");
    }
  };

  const analyzeNetwork = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setNetworkReport(null);
    setNetworkFieldErrors({});
    const operationID = automationOperationID("network");
    let validationField: NetworkField | undefined = "url";
    try {
      const parsedURL = new URL(networkURL);
      if (parsedURL.protocol !== "http:" && parsedURL.protocol !== "https:") {
        throw new Error(t("automation.network.urlProtocol"));
      }
      validationField = "timeout";
      const timeoutSeconds = positiveInteger(
        networkTimeout,
        "Timeout",
        300,
        t,
      );
      validationField = "maxRedirects";
      const redirectLimit = positiveInteger(
        maxRedirects,
        t("automation.network.redirectLimit"),
        50,
        t,
      );
      validationField = undefined;
      setNetworkOperation(operationID);
      const result = await backend.analyzeNetwork({
        operationId: operationID,
        url: parsedURL.toString(),
        timeoutMs: timeoutSeconds * 1000,
        maxRedirects: redirectLimit,
        insecureSkipVerify,
      });
      if (result.report) setNetworkReport(result.report);
      if (result.error) {
        setNotice(
          noticeFrom(
            result.error,
            t("automation.network.failedFallback"),
            t,
          ),
        );
        return;
      }
      setNotice({
        tone: "success",
        message: t("automation.network.success"),
      });
    } catch (error) {
      const nextNotice =
        validationField === "url" &&
        error instanceof TypeError
          ? {
              tone: "error" as const,
              message: t("automation.validation.url"),
            }
          : noticeFrom(
              error,
              t("automation.network.failedFallback"),
              t,
            );
      if (validationField) {
        setNetworkFieldErrors({ [validationField]: nextNotice.message });
      }
      setNotice(nextNotice);
    } finally {
      setNetworkOperation("");
    }
  };

  const lintOpenAPI = async () => {
    setNotice(null);
    setLintPending(true);
    try {
      const result = await backend.lintOpenAPI();
      if (result.canceled) return;
      setLintPath(result.path);
      setLintReport(result.report ?? null);
      if (result.error) {
        setNotice(
          noticeFrom(
            result.error,
            t("automation.lint.failedFallback"),
            t,
          ),
        );
        return;
      }
      const errors = result.report?.summary.errors ?? 0;
      const warnings = result.report?.summary.warnings ?? 0;
      setNotice({
        tone: errors > 0 ? "error" : "success",
        message: t("automation.lint.summary", { errors, warnings }),
      });
    } catch (error) {
      setNotice(
        noticeFrom(error, t("automation.lint.failedFallback"), t),
      );
    } finally {
      setLintPending(false);
    }
  };

  const cancel = async (operationID: string) => {
    if (!operationID) return;
    await backend.cancelToolOperation(operationID);
  };

  return (
    <ToolPage
      labelledBy="automation-title"
      eyebrow={t("automation.eyebrow")}
      title={t("automation.title")}
      description={t("automation.description")}
      meta={
        <>
          <strong>validex-cli</strong>
          <span>{t("automation.meta.noDependency")}</span>
        </>
      }
    >
      <ToolTabs
        value={mode}
        tabs={modes}
        label={t("automation.tabs.label")}
        idBase="automation"
        disabled={Boolean(runnerOperation || networkOperation || lintPending)}
        onChange={(next) => {
          setMode(next);
          setNotice(null);
        }}
      />

      {notice && (
        <ToolNotice
          tone={notice.tone}
          title={notice.title}
          hint={notice.hint}
          technical={notice.technical}
        >
          {notice.message}
        </ToolNotice>
      )}

      {mode === "runner" && (
        <div
          className="automation-grid"
          id="automation-panel-runner"
          role="tabpanel"
          aria-labelledby="automation-tab-runner"
        >
          <form
            className="tool-editor-card"
            onSubmit={runCollection}
            aria-busy={Boolean(runnerOperation)}
          >
            <ToolCardHeader
              title={t("automation.runner.editor.title")}
              description={t("automation.runner.editor.description")}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(runnerOperation)}
                  onClick={() => {
                    setCollection(sampleCollection);
                    setRunnerFieldErrors((current) => ({
                      ...current,
                      collection: undefined,
                    }));
                  }}
                >
                  {t("automation.runner.loadSample")}
                </Button>
              }
            />
            <textarea
              className="tool-code-input automation-collection-input"
              value={collection}
              onChange={(event) => {
                setCollection(event.target.value);
                setRunnerFieldErrors((current) => ({
                  ...current,
                  collection: undefined,
                }));
              }}
              disabled={Boolean(runnerOperation)}
              spellCheck={false}
              aria-label={t("automation.runner.editor.title")}
              aria-invalid={runnerFieldErrors.collection ? true : undefined}
              aria-describedby={
                runnerFieldErrors.collection
                  ? "automation-collection-error"
                  : undefined
              }
            />
            {runnerFieldErrors.collection && (
              <span id="automation-collection-error" className="sr-only">
                {runnerFieldErrors.collection}
              </span>
            )}
            <label className="automation-variable-input">
              <span>{t("automation.runner.variables")}</span>
              <textarea
                value={variables}
                onChange={(event) => {
                  setVariables(event.target.value);
                  setRunnerFieldErrors((current) => ({
                    ...current,
                    variables: undefined,
                  }));
                }}
                disabled={Boolean(runnerOperation)}
                spellCheck={false}
                aria-invalid={runnerFieldErrors.variables ? true : undefined}
                aria-describedby={
                  runnerFieldErrors.variables
                    ? "automation-variables-error"
                    : undefined
                }
              />
              {runnerFieldErrors.variables && (
                <span id="automation-variables-error" className="sr-only">
                  {runnerFieldErrors.variables}
                </span>
              )}
            </label>
            <div className="tool-card-actions automation-actions">
              {runnerOperation ? (
                <Button
                  variant="danger"
                  onClick={() => void cancel(runnerOperation)}
                >
                  <Square size={13} aria-hidden />{" "}
                  {t("automation.action.stop")}
                </Button>
              ) : (
                <Button variant="primary" type="submit">
                  <Play size={14} aria-hidden />{" "}
                  {t("automation.runner.run")}
                </Button>
              )}
              <span>{t("automation.runner.constraints")}</span>
            </div>
          </form>
          <section className="tool-panel automation-result-panel">
            <ToolCardHeader
              title={
                runnerReport?.name ||
                t("automation.runner.result.title")
              }
              description={
                runnerOperation
                  ? t(
                      "automation.runner.result.runningDescription",
                    )
                  : t("automation.runner.result.description")
              }
            />
            {runnerOperation ? (
              <div className="tool-empty-result automation-empty" role="status">
                <LoaderCircle className="spin" size={25} aria-hidden />
                <strong>{t("automation.runner.running.title")}</strong>
                <span>
                  {t("automation.runner.running.description")}
                </span>
              </div>
            ) : (
              <RunnerResult report={runnerReport} />
            )}
          </section>
        </div>
      )}

      {mode === "network" && (
        <div
          className="automation-grid"
          id="automation-panel-network"
          role="tabpanel"
          aria-labelledby="automation-tab-network"
        >
          <form
            className="tool-panel automation-form"
            onSubmit={analyzeNetwork}
            noValidate
            aria-busy={Boolean(networkOperation)}
          >
            <ToolCardHeader
              title={t("automation.network.target.title")}
              description={t(
                "automation.network.target.description",
              )}
            />
            <div className="automation-fields">
              <label className="automation-field automation-field-wide">
                <span>URL</span>
                <input
                  type="url"
                  required
                  value={networkURL}
                  onChange={(event) => {
                    setNetworkURL(event.target.value);
                    setNetworkFieldErrors((current) => ({
                      ...current,
                      url: undefined,
                    }));
                  }}
                  disabled={Boolean(networkOperation)}
                  placeholder="https://api.example.com/health"
                  aria-invalid={networkFieldErrors.url ? true : undefined}
                  aria-describedby={
                    networkFieldErrors.url
                      ? "automation-network-url-error"
                      : undefined
                  }
                />
                {networkFieldErrors.url && (
                  <span id="automation-network-url-error" className="sr-only">
                    {networkFieldErrors.url}
                  </span>
                )}
              </label>
              <label className="automation-field">
                <span>{t("automation.network.timeout")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  required
                  min={1}
                  max={300}
                  step={1}
                  value={networkTimeout}
                  onChange={(event) => {
                    setNetworkTimeout(event.target.value);
                    setNetworkFieldErrors((current) => ({
                      ...current,
                      timeout: undefined,
                    }));
                  }}
                  disabled={Boolean(networkOperation)}
                  aria-invalid={networkFieldErrors.timeout ? true : undefined}
                  aria-describedby={
                    networkFieldErrors.timeout
                      ? "automation-network-timeout-error"
                      : undefined
                  }
                />
                {networkFieldErrors.timeout && (
                  <span
                    id="automation-network-timeout-error"
                    className="sr-only"
                  >
                    {networkFieldErrors.timeout}
                  </span>
                )}
              </label>
              <label className="automation-field">
                <span>{t("automation.network.redirectLimit")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  required
                  min={1}
                  max={50}
                  step={1}
                  value={maxRedirects}
                  onChange={(event) => {
                    setMaxRedirects(event.target.value);
                    setNetworkFieldErrors((current) => ({
                      ...current,
                      maxRedirects: undefined,
                    }));
                  }}
                  disabled={Boolean(networkOperation)}
                  aria-invalid={
                    networkFieldErrors.maxRedirects ? true : undefined
                  }
                  aria-describedby={
                    networkFieldErrors.maxRedirects
                      ? "automation-network-redirect-error"
                      : undefined
                  }
                />
                {networkFieldErrors.maxRedirects && (
                  <span
                    id="automation-network-redirect-error"
                    className="sr-only"
                  >
                    {networkFieldErrors.maxRedirects}
                  </span>
                )}
              </label>
              <label className="protocol-check automation-field-wide">
                <input
                  type="checkbox"
                  checked={insecureSkipVerify}
                  disabled={Boolean(networkOperation)}
                  onChange={(event) => setInsecureSkipVerify(event.target.checked)}
                />
                <span>
                  <strong>
                    {t("automation.network.allowSelfSigned")}
                  </strong>
                  <small>
                    {t("automation.network.allowSelfSignedHint")}
                  </small>
                </span>
              </label>
            </div>
            <div className="tool-card-actions automation-actions">
              {networkOperation ? (
                <Button
                  variant="danger"
                  onClick={() => void cancel(networkOperation)}
                >
                  <Square size={13} aria-hidden />{" "}
                  {t("automation.action.stop")}
                </Button>
              ) : (
                <Button variant="primary" type="submit">
                  <Network size={14} aria-hidden />{" "}
                  {t("automation.network.analyze")}
                </Button>
              )}
            </div>
          </form>
          <section className="tool-panel automation-result-panel">
            <ToolCardHeader
              title={t("automation.network.result.title")}
              description={t("automation.network.result.description")}
            />
            {networkOperation ? (
              <div className="tool-empty-result automation-empty" role="status">
                <LoaderCircle className="spin" size={25} aria-hidden />
                <strong>{t("automation.network.running.title")}</strong>
                <span>
                  {t("automation.network.running.description")}
                </span>
              </div>
            ) : (
              <NetworkResult report={networkReport} />
            )}
          </section>
        </div>
      )}

      {mode === "openapi" && (
        <div
          className="automation-grid automation-lint-grid"
          id="automation-panel-openapi"
          role="tabpanel"
          aria-labelledby="automation-tab-openapi"
        >
          <section className="tool-panel automation-form">
            <ToolCardHeader
              title={t("automation.lint.document.title")}
              description={t(
                "automation.lint.document.description",
              )}
            />
            <div className="automation-lint-intro">
              <FileSearch size={30} aria-hidden />
              <h2>{t("automation.lint.intro.title")}</h2>
              <p>{t("automation.lint.intro.description")}</p>
              <Button
                variant="primary"
                disabled={lintPending}
                onClick={() => void lintOpenAPI()}
              >
                {lintPending ? (
                  <LoaderCircle className="spin" size={14} aria-hidden />
                ) : (
                  <FileSearch size={14} aria-hidden />
                )}
                {t("automation.lint.select")}
              </Button>
              {lintPath && <code>{lintPath}</code>}
            </div>
          </section>
          <section className="tool-panel automation-result-panel">
            <ToolCardHeader
              title={t("automation.lint.result.title")}
              description={t("automation.lint.result.description")}
            />
            {lintPending ? (
              <div className="tool-empty-result automation-empty" role="status">
                <LoaderCircle className="spin" size={25} aria-hidden />
                <strong>{t("automation.lint.running")}</strong>
              </div>
            ) : (
              <LintResult report={lintReport} />
            )}
          </section>
        </div>
      )}

      <details className="automation-cli-help">
        <summary>
          <TerminalSquare size={14} aria-hidden />{" "}
          {t("automation.cli.summary")}
        </summary>
        <pre>
          <code>{`validex-cli run --file collection.json
validex-cli inspect --url https://api.example.com
validex-cli lint --file openapi.yaml`}</code>
        </pre>
      </details>
    </ToolPage>
  );
}
