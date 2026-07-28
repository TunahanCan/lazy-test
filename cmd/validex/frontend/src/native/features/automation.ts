import {
  Lifecycle,
  eventElement,
  formValue,
  html,
  setHTML,
  type Disposable,
  type TrustedHTMLFragment,
} from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import { t, subscribeLocale } from "../../i18n/locale.js";
import type { TranslationKey } from "../../i18n/messages.js";
import { backend } from "../../lib/backend.js";
import type {
  CollectionRequestResult,
  CollectionRunReport,
  NetworkReport,
  OpenAPILintIssue,
  OpenAPILintReport,
  UserError,
} from "../../lib/types.js";
import {
  automationOperationID,
  durationLabel,
  parseVariables,
  positiveInteger,
  printable,
  sampleCollection,
  type AutomationMode,
} from "../../features/automation/model.js";
import { savedCollectionRunnerDefinition } from "../../features/automation/savedCollectionRunner.js";
import {
  collectionLibraryStore,
  selectOrderedCollections,
  selectOrderedRequests,
} from "../../stores/collectionLibrary.js";
import {
  emptyToolResult,
  noticeMarkup,
  summaryMarkup,
  toolCardHeader,
  toolPageHeader,
  toolTabs,
  type ToolNotice,
} from "../tool.js";

interface AutomationState {
  mode: AutomationMode;
  notice: ToolNotice | null;
  collection: string;
  savedCollectionID: string;
  variables: string;
  runnerReport: CollectionRunReport | null;
  runnerOperation: string;
  networkURL: string;
  networkTimeout: string;
  maxRedirects: string;
  insecureSkipVerify: boolean;
  networkReport: NetworkReport | null;
  networkOperation: string;
  lintReport: OpenAPILintReport | null;
  lintPath: string;
  lintPending: boolean;
}

interface SavedCollectionOption {
  id: string;
  name: string;
  requestCount: number;
}

const knownRunnerFailureCodes = new Set([
  "invalid_request",
  "missing_variables",
  "request_body_too_large",
  "response_body_too_large",
  "response_headers_too_large",
  "unsupported_content_encoding",
  "too_many_content_encodings",
  "response_decode_failed",
  "request_timeout",
  "request_canceled",
  "send_failed",
]);

const knownLintIssueCodes = new Set([
  "document.too_large",
  "document.parse",
  "document.invalid",
  "operation.operation_id.missing",
  "operation.operation_id.duplicate",
  "operation.summary.missing",
  "operation.tags.missing",
  "operation.responses.missing",
  "operation.responses.2xx_missing",
  "response.json.schema_missing",
  "response.json.example_missing",
]);

function localizedRunnerFailure(
  failure: NonNullable<CollectionRequestResult["failure"]>,
): { message: string; hint?: string } {
  if (!knownRunnerFailureCodes.has(failure.code)) {
    return { message: failure.message, hint: failure.hint };
  }
  return {
    message: t(
      `automation.runner.failure.${failure.code}` as TranslationKey,
    ),
    hint: t("automation.runner.failure.hint"),
  };
}

function localizedLintIssue(
  issue: OpenAPILintIssue,
): { message: string; hint?: string } {
  if (!knownLintIssueCodes.has(issue.code)) {
    return { message: issue.message, hint: issue.hint };
  }
  return {
    message: t(`automation.lint.issue.${issue.code}` as TranslationKey),
    hint: issue.hint
      ? t(`automation.lint.hint.${issue.code}` as TranslationKey)
      : undefined,
  };
}

function errorNotice(error: unknown, fallback: string): ToolNotice {
  if (error && typeof error === "object") {
    const candidate = error as Partial<UserError> & { message?: unknown };
    return {
      tone: "error",
      title: candidate.title,
      message:
        typeof candidate.message === "string" ? candidate.message : fallback,
      hint: candidate.hint,
      technical: candidate.technical,
    };
  }
  return {
    tone: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}

function requestResultMarkup(
  request: CollectionRequestResult,
): TrustedHTMLFragment {
  const failure = request.failure
    ? localizedRunnerFailure(request.failure)
    : undefined;
  return html`
    <article
      class="automation-request-result ${request.passed ? "passed" : "failed"}"
      aria-label="${t(
        request.passed
          ? "automation.runner.requestAria.passed"
          : "automation.runner.requestAria.failed",
        { name: request.name || request.url },
      )}"
    >
      <header>
        ${icon(request.passed ? "check" : "error", 16)}
        <code>${request.method}</code>
        <strong>${request.name || request.url}</strong>
        <span>${request.statusCode || t("automation.status.error")}</span>
        <small>${durationLabel(request.durationMs)}</small>
      </header>
      <code class="automation-request-url">${request.url}</code>
      ${failure
        ? noticeMarkup({
            tone: "error",
            title: request.failure?.code,
            message: failure.message,
            hint: failure.hint,
          })
        : ""}
      ${request.assertions.length > 0
        ? html`
            <ul class="automation-assertions">
              ${request.assertions.map(
                (assertion) => html`
                  <li class="${assertion.passed ? "passed" : "failed"}">
                    ${icon(assertion.passed ? "check" : "warning", 14)}
                    <span>
                      <strong>
                        <span class="sr-only">
                          ${t(
                            assertion.passed
                              ? "automation.runner.assertionAria.passed"
                              : "automation.runner.assertionAria.failed",
                          )}
                        </span>
                        ${assertion.assertion.name ||
                        assertion.assertion.target}
                      </strong>
                      <small>
                        ${assertion.error
                          ? t("automation.runner.assertionError", {
                              details: assertion.error,
                            })
                          : assertion.passed
                            ? `${assertion.assertion.operator} · ${printable(
                                assertion.actual,
                              )}`
                            : t("automation.runner.assertionMismatch", {
                                expected: printable(
                                  assertion.assertion.expected,
                                ),
                                actual: printable(assertion.actual),
                              })}
                      </small>
                    </span>
                  </li>
                `,
              )}
            </ul>
          `
        : ""}
    </article>
  `;
}

function runnerResultMarkup(
  report: CollectionRunReport | null,
): TrustedHTMLFragment {
  if (!report) {
    return emptyToolResult(
      "automation",
      t("automation.runner.empty.title"),
      t("automation.runner.empty.description"),
    );
  }
  return html`
    ${summaryMarkup([
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
    ])}
    <div
      class="automation-result-list"
      aria-label="${t("automation.runner.results")}"
    >
      ${report.results.map(requestResultMarkup)}
    </div>
  `;
}

function networkResultMarkup(report: NetworkReport | null): TrustedHTMLFragment {
  if (!report) {
    return emptyToolResult(
      "activity",
      t("automation.network.empty.title"),
      t("automation.network.empty.description"),
    );
  }
  return html`
    ${summaryMarkup([
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
    ])}
    <div class="automation-network-results">
      <section>
        <h2>${t("automation.network.dns.title")}</h2>
        ${report.dnsLookups.length === 0
          ? html`<p>${t("automation.network.dns.empty")}</p>`
          : html`
              <ul>
                ${report.dnsLookups.map(
                  (lookup) => html`
                    <li>
                      <span>
                        <strong>${lookup.host}</strong>
                        <small>${durationLabel(lookup.durationMs)}</small>
                      </span>
                      <code>
                        ${lookup.ips.join(", ") ||
                        t("automation.network.dns.noIP")}
                      </code>
                    </li>
                  `,
                )}
              </ul>
            `}
      </section>
      <section>
        <h2>${t("automation.network.redirect.title")}</h2>
        ${report.hops.length === 0
          ? html`<p class="tool-empty-inline">
              ${t("automation.network.redirect.empty")}
            </p>`
          : html`
              <ol>
                ${report.hops.map(
                  (hop) => html`
                    <li>
                      <span>
                        <code>${hop.method}</code>
                        <strong>${hop.statusCode}</strong>
                        <small>${durationLabel(hop.durationMs)}</small>
                      </span>
                      <code>${hop.url}</code>
                      ${hop.location
                        ? html`<small>→ ${hop.location}</small>`
                        : ""}
                    </li>
                  `,
                )}
              </ol>
            `}
        <div class="automation-final-url">
          <strong>${t("automation.network.finalURL")}</strong>
          <code>${report.finalUrl || report.inputUrl}</code>
        </div>
      </section>
    </div>
  `;
}

function lintResultMarkup(
  report: OpenAPILintReport | null,
): TrustedHTMLFragment {
  if (!report) {
    return emptyToolResult(
      "search",
      t("automation.lint.empty.title"),
      t("automation.lint.empty.description"),
    );
  }
  return html`
    ${summaryMarkup([
      {
        label: t("automation.lint.summary.operations"),
        value: report.summary.operations,
      },
      { label: t("automation.status.error"), value: report.summary.errors },
      { label: t("automation.status.warning"), value: report.summary.warnings },
      { label: t("automation.status.info"), value: report.summary.infos },
    ])}
    ${report.issues.length === 0
      ? html`
          <div
            class="tool-success-card automation-success"
            role="status"
          >
            ${icon("check", 17)}
            <span>${t("automation.lint.success")}</span>
          </div>
        `
      : html`
          <ul
            class="automation-lint-list"
            aria-label="${t("automation.lint.results")}"
          >
            ${report.issues.map((issue) => {
              const localized = localizedLintIssue(issue);
              return html`
                <li class="${issue.severity}">
                  ${icon(
                    issue.severity === "error"
                      ? "error"
                      : issue.severity === "warning"
                        ? "warning"
                        : "info",
                    15,
                  )}
                  <div>
                    <header>
                      <strong>${issue.code}</strong>
                      <code>${issue.path}</code>
                    </header>
                    <p>${localized.message}</p>
                    ${localized.hint
                      ? html`<small>${localized.hint}</small>`
                      : ""}
                  </div>
                </li>
              `;
            })}
          </ul>
        `}
    ${report.truncated
      ? noticeMarkup({
          tone: "info",
          message: t("automation.lint.truncated"),
        })
      : ""}
  `;
}

function runnerPanel(
  state: AutomationState,
  savedCollections: readonly SavedCollectionOption[],
): TrustedHTMLFragment {
  const selectedCollectionAvailable = savedCollections.some(
    (collection) => collection.id === state.savedCollectionID,
  );
  return html`
    <div
      class="automation-grid"
      id="automation-panel-runner"
      role="tabpanel"
      aria-labelledby="automation-tab-runner"
    >
      <form
        class="tool-editor-card"
        data-form="runner"
        aria-busy="${state.runnerOperation ? "true" : "false"}"
      >
        ${toolCardHeader(
          t("automation.runner.editor.title"),
          t("automation.runner.editor.description"),
          html`
            <button
              type="button"
              class="button button-ghost button-sm"
              data-action="runner-sample"
              ${state.runnerOperation ? "disabled" : ""}
            >
              ${t("automation.runner.loadSample")}
            </button>
          `,
        )}
        <div class="automation-saved-collection">
          <label for="automation-saved-collection">
            <span>${t("automation.runner.savedCollection.label")}</span>
            <select
              id="automation-saved-collection"
              data-runner-saved-collection
              aria-describedby="automation-saved-collection-help"
              ${savedCollections.length === 0 || state.runnerOperation
                ? "disabled"
                : ""}
            >
              <option
                value=""
                ${selectedCollectionAvailable ? "" : "selected"}
              >
                ${t(
                  savedCollections.length === 0
                    ? "automation.runner.savedCollection.emptyOption"
                    : "automation.runner.savedCollection.placeholder",
                )}
              </option>
              ${savedCollections.map(
                (collection) => html`
                  <option
                    value="${collection.id}"
                    ${collection.id === state.savedCollectionID
                      ? "selected"
                      : ""}
                  >
                    ${t("automation.runner.savedCollection.option", {
                      name: collection.name,
                      count: collection.requestCount,
                    })}
                  </option>
                `,
              )}
            </select>
          </label>
          <button
            type="button"
            class="button button-secondary button-sm"
            data-action="runner-load-saved"
            ${!selectedCollectionAvailable || state.runnerOperation
              ? "disabled"
              : ""}
          >
            ${icon("collection", 14)}
            ${t("automation.runner.savedCollection.load")}
          </button>
          <small id="automation-saved-collection-help">
            ${t(
              savedCollections.length === 0
                ? "automation.runner.savedCollection.emptyHelp"
                : "automation.runner.savedCollection.help",
            )}
          </small>
        </div>
        <textarea
          class="tool-code-input automation-collection-input"
          name="collection"
          spellcheck="false"
          required
          aria-label="${t("automation.runner.editor.title")}"
          aria-describedby="automation-runner-collection-help"
          ${state.runnerOperation ? "disabled" : ""}
        >${state.collection}</textarea>
        <small id="automation-runner-collection-help" class="tool-field-help">
          ${t("automation.runner.collectionHelp")}
        </small>
        <label class="automation-variable-input">
          <span>${t("automation.runner.variables")}</span>
          <textarea
            name="variables"
            spellcheck="false"
            aria-describedby="automation-runner-variables-help"
            ${state.runnerOperation ? "disabled" : ""}
          >${state.variables}</textarea>
          <small id="automation-runner-variables-help">
            ${t("automation.runner.variablesHelp")}
          </small>
        </label>
        <div class="tool-card-actions automation-actions">
          ${state.runnerOperation
            ? html`
                <button
                  type="button"
                  class="button button-danger button-md"
                  data-action="runner-stop"
                  data-focus="runner-stop"
                >
                  ${icon("stop", 13)} ${t("automation.action.stop")}
                </button>
              `
            : html`
                <button
                  type="submit"
                  class="button button-primary button-md"
                  data-focus="runner-run"
                >
                  ${icon("play", 14)} ${t("automation.runner.run")}
                </button>
              `}
          <span>${t("automation.runner.constraints")}</span>
        </div>
      </form>
      <section
        class="tool-panel automation-result-panel"
        aria-busy="${state.runnerOperation ? "true" : "false"}"
      >
        ${toolCardHeader(
          state.runnerReport?.name ||
            t("automation.runner.result.title"),
          state.runnerOperation
            ? t("automation.runner.result.runningDescription")
            : t("automation.runner.result.description"),
        )}
        ${state.runnerOperation
          ? emptyToolResult(
              "spinner",
              t("automation.runner.running.title"),
              t("automation.runner.running.description"),
              true,
            )
          : runnerResultMarkup(state.runnerReport)}
      </section>
    </div>
  `;
}

function networkPanel(state: AutomationState): TrustedHTMLFragment {
  return html`
    <div
      class="automation-grid"
      id="automation-panel-network"
      role="tabpanel"
      aria-labelledby="automation-tab-network"
    >
      <form
        class="tool-panel automation-form"
        data-form="network"
        aria-busy="${state.networkOperation ? "true" : "false"}"
        novalidate
      >
        ${toolCardHeader(
          t("automation.network.target.title"),
          t("automation.network.target.description"),
        )}
        <div class="automation-fields">
          <label class="automation-field automation-field-wide">
            <span>URL</span>
            <input
              name="url"
              type="url"
              required
              value="${state.networkURL}"
              placeholder="https://api.example.com/health"
              aria-describedby="automation-network-url-help"
            />
            <small id="automation-network-url-help">
              ${t("automation.network.urlHelp")}
            </small>
          </label>
          <label class="automation-field">
            <span>${t("automation.network.timeout")}</span>
            <input
              name="timeout"
              type="number"
              min="1"
              max="300"
              step="1"
              value="${state.networkTimeout}"
              aria-describedby="automation-network-timeout-help"
            />
            <small id="automation-network-timeout-help">
              ${t("automation.network.timeoutHelp")}
            </small>
          </label>
          <label class="automation-field">
            <span>${t("automation.network.redirectLimit")}</span>
            <input
              name="maxRedirects"
              type="number"
              min="1"
              max="50"
              step="1"
              value="${state.maxRedirects}"
              aria-describedby="automation-network-redirect-help"
            />
            <small id="automation-network-redirect-help">
              ${t("automation.network.redirectHelp")}
            </small>
          </label>
          <label class="protocol-check automation-field-wide">
            <input
              name="insecure"
              type="checkbox"
              ${state.insecureSkipVerify ? "checked" : ""}
            />
            <span>
              <strong>${t("automation.network.allowSelfSigned")}</strong>
              <small>${t("automation.network.allowSelfSignedHint")}</small>
            </span>
          </label>
        </div>
        <div class="tool-card-actions automation-actions">
          ${state.networkOperation
            ? html`
                <button
                  type="button"
                  class="button button-danger button-md"
                  data-action="network-stop"
                  data-focus="network-stop"
                >
                  ${icon("stop", 13)} ${t("automation.action.stop")}
                </button>
              `
            : html`
                <button
                  type="submit"
                  class="button button-primary button-md"
                  data-focus="network-run"
                >
                  ${icon("activity", 14)} ${t("automation.network.analyze")}
                </button>
              `}
        </div>
      </form>
      <section
        class="tool-panel automation-result-panel"
        aria-busy="${state.networkOperation ? "true" : "false"}"
      >
        ${toolCardHeader(
          t("automation.network.result.title"),
          t("automation.network.result.description"),
        )}
        ${state.networkOperation
          ? emptyToolResult(
              "spinner",
              t("automation.network.running.title"),
              t("automation.network.running.description"),
              true,
            )
          : networkResultMarkup(state.networkReport)}
      </section>
    </div>
  `;
}

function lintPanel(state: AutomationState): TrustedHTMLFragment {
  return html`
    <div
      class="automation-grid automation-lint-grid"
      id="automation-panel-openapi"
      role="tabpanel"
      aria-labelledby="automation-tab-openapi"
    >
      <section
        class="tool-panel automation-form"
        aria-busy="${state.lintPending ? "true" : "false"}"
      >
        ${toolCardHeader(
          t("automation.lint.document.title"),
          t("automation.lint.document.description"),
        )}
        <div class="automation-lint-intro">
          ${icon("search", 30)}
          <h2>${t("automation.lint.intro.title")}</h2>
          <p>${t("automation.lint.intro.description")}</p>
          <button
            type="button"
            class="button button-primary button-md"
            data-action="lint"
            data-focus="lint"
            ${state.lintPending ? "disabled" : ""}
          >
            ${icon(state.lintPending ? "spinner" : "search", 14, state.lintPending ? "spin" : "")}
            ${t("automation.lint.select")}
          </button>
          ${state.lintPath ? html`<code>${state.lintPath}</code>` : ""}
        </div>
      </section>
      <section
        class="tool-panel automation-result-panel"
        aria-busy="${state.lintPending ? "true" : "false"}"
      >
        ${toolCardHeader(
          t("automation.lint.result.title"),
          t("automation.lint.result.description"),
        )}
        ${state.lintPending
          ? emptyToolResult(
              "spinner",
              t("automation.lint.running"),
              undefined,
              true,
            )
          : lintResultMarkup(state.lintReport)}
      </section>
    </div>
  `;
}

export function mountAutomationLab(root: HTMLElement): Disposable {
  const lifecycle = new Lifecycle();
  let disposed = false;
  const state: AutomationState = {
    mode: "runner",
    notice: null,
    collection: sampleCollection,
    savedCollectionID: "",
    variables: "{}",
    runnerReport: null,
    runnerOperation: "",
    networkURL: "http://localhost:8080",
    networkTimeout: "15",
    maxRedirects: "10",
    insecureSkipVerify: false,
    networkReport: null,
    networkOperation: "",
    lintReport: null,
    lintPath: "",
    lintPending: false,
  };

  const captureVisibleForm = () => {
    const runner = root.querySelector<HTMLFormElement>('[data-form="runner"]');
    if (runner) {
      state.collection = formValue(runner, "collection");
      state.variables = formValue(runner, "variables");
    }
    const network = root.querySelector<HTMLFormElement>('[data-form="network"]');
    if (network) {
      state.networkURL = formValue(network, "url");
      state.networkTimeout = formValue(network, "timeout");
      state.maxRedirects = formValue(network, "maxRedirects");
      state.insecureSkipVerify =
        network.querySelector<HTMLInputElement>('[name="insecure"]')?.checked ??
        false;
    }
  };

  const render = () => {
    if (disposed) return;
    const library = collectionLibraryStore.getState();
    const savedCollections = selectOrderedCollections(library).map(
      (collection) => ({
        id: collection.id,
        name: collection.name,
        requestCount: selectOrderedRequests(
          library,
          collection.id,
        ).length,
      }),
    );
    setHTML(
      root,
      html`
        <section
          class="tool-page automation-page"
          aria-labelledby="automation-title"
        >
          ${toolPageHeader({
            id: "automation-title",
            eyebrow: t("automation.eyebrow"),
            title: t("automation.title"),
            description: t("automation.description"),
            meta: html`
              <strong>validex-cli</strong>
              <span>${t("automation.meta.noDependency")}</span>
            `,
          })}
          ${toolTabs(
            [
              {
                id: "runner",
                label: t("automation.tab.runner"),
                icon: "automation",
              },
              {
                id: "network",
                label: t("automation.tab.network"),
                icon: "activity",
              },
              {
                id: "openapi",
                label: t("automation.tab.openapi"),
                icon: "search",
              },
            ],
            state.mode,
            t("automation.tabs.label"),
            "automation",
            Boolean(
              state.runnerOperation ||
                state.networkOperation ||
                state.lintPending,
            ),
          )}
          ${noticeMarkup(state.notice)}
          ${state.mode === "runner"
            ? runnerPanel(state, savedCollections)
            : state.mode === "network"
              ? networkPanel(state)
              : lintPanel(state)}
          <details class="automation-cli-help">
            <summary>
              ${icon("terminal", 14)} ${t("automation.cli.summary")}
            </summary>
            <pre><code>validex-cli run --file collection.json
validex-cli inspect --url https://api.example.com
validex-cli lint --file openapi.yaml</code></pre>
          </details>
        </section>
      `,
    );
  };

  const loadSavedCollection = () => {
    captureVisibleForm();
    const selected =
      root.querySelector<HTMLSelectElement>(
        "[data-runner-saved-collection]",
      )?.value ?? state.savedCollectionID;
    state.savedCollectionID = selected;
    const library = collectionLibraryStore.getState();
    const collection = library.collections.find(
      (candidate) => candidate.id === selected,
    );
    if (!collection) {
      state.savedCollectionID = "";
      state.notice = {
        tone: "warning",
        message: t("automation.runner.savedCollection.missing"),
      };
      render();
      root
        .querySelector<HTMLSelectElement>(
          "[data-runner-saved-collection]",
        )
        ?.focus();
      return;
    }
    const requests = selectOrderedRequests(library, collection.id);
    state.collection = savedCollectionRunnerDefinition(
      collection,
      requests,
    );
    state.runnerReport = null;
    state.notice = {
      tone: "success",
      message: t("automation.runner.savedCollection.loaded", {
        name: collection.name,
        count: requests.length,
      }),
    };
    render();
    root
      .querySelector<HTMLTextAreaElement>('[name="collection"]')
      ?.focus();
  };

  lifecycle.listen(root, "click", (event) => {
    const tab = eventElement<HTMLElement>(event, '[role="tab"][data-tab]');
    if (tab?.dataset.tab) {
      captureVisibleForm();
      state.mode = tab.dataset.tab as AutomationMode;
      state.notice = null;
      render();
      window.requestAnimationFrame(() => {
        root
          .querySelector<HTMLElement>(
            `[role="tab"][data-tab="${state.mode}"]`,
          )
          ?.focus();
      });
      return;
    }
    const action = eventElement<HTMLElement>(event, "[data-action]")?.dataset
      .action;
    if (action === "runner-sample") {
      state.collection = sampleCollection;
      state.savedCollectionID = "";
      const textarea =
        root.querySelector<HTMLTextAreaElement>('[name="collection"]');
      if (textarea) textarea.value = sampleCollection;
    } else if (action === "runner-load-saved") {
      loadSavedCollection();
    } else if (action === "runner-stop") {
      void backend.cancelToolOperation(state.runnerOperation);
    } else if (action === "network-stop") {
      void backend.cancelToolOperation(state.networkOperation);
    } else if (action === "lint") {
      void lintOpenAPI();
    }
  });

  lifecycle.listen(root, "change", (event) => {
    const selector = eventElement<HTMLSelectElement>(
      event,
      "[data-runner-saved-collection]",
    );
    if (!selector) return;
    state.savedCollectionID = selector.value;
    const loadButton = root.querySelector<HTMLButtonElement>(
      '[data-action="runner-load-saved"]',
    );
    if (loadButton) loadButton.disabled = selector.value === "";
  });

  lifecycle.listen(root, "keydown", (event) => {
    const tab = eventElement<HTMLElement>(event, '[role="tab"][data-tab]');
    if (!tab || tab.matches(":disabled")) return;
    const tabs: readonly AutomationMode[] = ["runner", "network", "openapi"];
    const current = tabs.indexOf(tab.dataset.tab as AutomationMode);
    if (current < 0) return;
    let next: number | undefined;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    if (event.key === "ArrowLeft") {
      next = (current - 1 + tabs.length) % tabs.length;
    }
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    captureVisibleForm();
    state.mode = tabs[next];
    state.notice = null;
    render();
    root
      .querySelector<HTMLElement>(`[role="tab"][data-tab="${state.mode}"]`)
      ?.focus();
  });

  lifecycle.listen(root, "submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.form === "runner") void runCollection(form);
    if (form.dataset.form === "network") void analyzeNetwork(form);
  });

  const runCollection = async (form: HTMLFormElement) => {
    state.collection = formValue(form, "collection");
    state.variables = formValue(form, "variables");
    state.notice = null;
    state.runnerReport = null;
    const operationID = automationOperationID("collection");
    try {
      JSON.parse(state.collection);
      const variables = parseVariables(state.variables, t);
      state.runnerOperation = operationID;
      render();
      root
        .querySelector<HTMLElement>('[data-focus="runner-stop"]')
        ?.focus();
      const result = await backend.runCollection({
        operationId: operationID,
        definition: state.collection,
        variables,
      });
      if (disposed) return;
      state.runnerReport = result.report ?? null;
      if (result.error) {
        state.notice = errorNotice(
          result.error,
          t("automation.runner.failedFallback"),
        );
      } else {
        const failed = result.report?.failed ?? 0;
        state.notice = {
          tone: failed === 0 ? "success" : "error",
          message:
            failed === 0
              ? t("automation.runner.success")
              : t("automation.runner.failureCount", { count: failed }),
        };
      }
    } catch (error) {
      state.notice =
        error instanceof SyntaxError
          ? {
              tone: "error",
              message: t("automation.validation.collectionJSON", {
                details: error.message,
              }),
            }
          : errorNotice(error, t("automation.runner.failedFallback"));
    } finally {
      if (!disposed) {
        state.runnerOperation = "";
        render();
        root
          .querySelector<HTMLElement>('[data-focus="runner-run"]')
          ?.focus();
      }
    }
  };

  const analyzeNetwork = async (form: HTMLFormElement) => {
    state.networkURL = formValue(form, "url");
    state.networkTimeout = formValue(form, "timeout");
    state.maxRedirects = formValue(form, "maxRedirects");
    state.insecureSkipVerify =
      form.querySelector<HTMLInputElement>('[name="insecure"]')?.checked ?? false;
    state.notice = null;
    state.networkReport = null;
    const operationID = automationOperationID("network");
    try {
      const url = new URL(state.networkURL);
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error(t("automation.network.urlProtocol"));
      }
      const timeout = positiveInteger(
        state.networkTimeout,
        t("automation.network.timeout"),
        300,
        t,
      );
      const redirects = positiveInteger(
        state.maxRedirects,
        t("automation.network.redirectLimit"),
        50,
        t,
      );
      state.networkOperation = operationID;
      render();
      root
        .querySelector<HTMLElement>('[data-focus="network-stop"]')
        ?.focus();
      const result = await backend.analyzeNetwork({
        operationId: operationID,
        url: url.toString(),
        timeoutMs: timeout * 1000,
        maxRedirects: redirects,
        insecureSkipVerify: state.insecureSkipVerify,
      });
      if (disposed) return;
      state.networkReport = result.report ?? null;
      state.notice = result.error
        ? errorNotice(result.error, t("automation.network.failedFallback"))
        : { tone: "success", message: t("automation.network.success") };
    } catch (error) {
      state.notice = errorNotice(
        error,
        error instanceof TypeError
          ? t("automation.validation.url")
          : t("automation.network.failedFallback"),
      );
    } finally {
      if (!disposed) {
        state.networkOperation = "";
        render();
        root
          .querySelector<HTMLElement>('[data-focus="network-run"]')
          ?.focus();
      }
    }
  };

  const lintOpenAPI = async () => {
    state.notice = null;
    state.lintPending = true;
    render();
    try {
      const result = await backend.lintOpenAPI();
      if (disposed || result.canceled) return;
      state.lintPath = result.path;
      state.lintReport = result.report ?? null;
      if (result.error) {
        state.notice = errorNotice(
          result.error,
          t("automation.lint.failedFallback"),
        );
      } else {
        const errors = result.report?.summary.errors ?? 0;
        const warnings = result.report?.summary.warnings ?? 0;
        state.notice = {
          tone: errors > 0 ? "error" : "success",
          message: t("automation.lint.summary", { errors, warnings }),
        };
      }
    } catch (error) {
      state.notice = errorNotice(error, t("automation.lint.failedFallback"));
    } finally {
      if (!disposed) {
      state.lintPending = false;
      render();
      root.querySelector<HTMLElement>('[data-focus="lint"]')?.focus();
      }
    }
  };

  lifecycle.add(subscribeLocale(() => {
    captureVisibleForm();
    state.notice = null;
    render();
  }));
  lifecycle.add(
    collectionLibraryStore.subscribe(() => {
      captureVisibleForm();
      if (
        state.savedCollectionID &&
        !collectionLibraryStore
          .getState()
          .collections.some(
            (collection) => collection.id === state.savedCollectionID,
          )
      ) {
        state.savedCollectionID = "";
      }
      render();
    }),
  );
  render();
  return {
    dispose() {
      disposed = true;
      lifecycle.dispose();
      root.replaceChildren();
    },
  };
}
