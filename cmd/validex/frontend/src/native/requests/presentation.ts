import {
  html,
  type TrustedHTMLFragment,
} from "../../core/dom.js";
import { icon, type IconName } from "../../core/icons.js";
import { t } from "../../i18n/locale.js";
import {
  HTTP_METHODS,
  isStandardHTTPMethod,
  methodAllowsBody,
} from "../../lib/http.js";
import { isSecretKey } from "../../lib/secrets.js";
import { parseURLQuery } from "../../lib/urlQuery.js";
import type {
  KeyValue,
  RequestTab,
  WorkspaceView,
} from "../../lib/types.js";
import type { RequestDraft } from "./draft.js";
import {
  clampResponseSize,
  responseSizeMaximum,
  responseSizeMinimum,
  type ResponseSplitPlacement,
} from "./interaction.js";
import { responsePanelMarkup } from "./response.js";

export interface RequestWelcomeTool {
  view: WorkspaceView;
  label: string;
  description: string;
  icon: IconName;
}

export interface RequestVariablesPresentation {
  environmentName: string;
  values: Readonly<Record<string, string>>;
  overridden: ReadonlySet<string>;
}

export interface RequestWorkbenchPresentation {
  tab: RequestTab;
  draft: RequestDraft;
  variables: RequestVariablesPresentation;
  responsePlacement: ResponseSplitPlacement;
  responseSize: number;
  canceling: boolean;
  collectionSaveDisabled: boolean;
  unresolvedVariables: readonly string[];
  validationError?: string;
  showURLValidation: boolean;
}

export interface RequestRenderState {
  tabs: readonly RequestTab[];
  activeTabID: string;
  activeEnvironmentID: string;
  environmentVariables: Readonly<Record<string, Readonly<Record<string, string>>>>;
  responseSize: number;
  responsePlacement: string;
}

export type RequestRenderScope = "none" | "tabs" | "full";

export function requestRenderScope(
  state: RequestRenderState,
  previous: RequestRenderState,
): RequestRenderScope {
  const presentationChanged =
    state.tabs !== previous.tabs ||
    state.activeTabID !== previous.activeTabID ||
    state.activeEnvironmentID !== previous.activeEnvironmentID ||
    state.environmentVariables !== previous.environmentVariables ||
    state.responseSize !== previous.responseSize ||
    state.responsePlacement !== previous.responsePlacement;
  if (!presentationChanged) return "none";

  const sameTabOrder =
    state.tabs.length === previous.tabs.length &&
    state.tabs.every((tab, index) => tab.id === previous.tabs[index]?.id);
  const active = state.tabs.find((tab) => tab.id === state.activeTabID);
  const previousActive = previous.tabs.find(
    (tab) => tab.id === previous.activeTabID,
  );
  if (
    state.tabs !== previous.tabs &&
    sameTabOrder &&
    state.activeTabID === previous.activeTabID &&
    active !== undefined &&
    active === previousActive &&
    state.activeEnvironmentID === previous.activeEnvironmentID &&
    state.environmentVariables === previous.environmentVariables &&
    state.responseSize === previous.responseSize &&
    state.responsePlacement === previous.responsePlacement
  ) {
    return "tabs";
  }
  return "full";
}

export function requestTabItemsMarkup(
  tabs: readonly RequestTab[],
  activeTabID: string,
): TrustedHTMLFragment {
  return html`
    ${tabs.map((tab, index) => {
      const reorderable = !tab.pinned && !tab.running;
      const accessibleName = [
        tab.method,
        tab.name,
        tab.pinned ? t("requests.tabs.pinned") : "",
        tab.dirty ? t("requests.tabs.localDraft") : "",
        tab.running ? t("requests.tabs.running") : "",
        tab.error && !tab.running ? t("requests.tabs.error") : "",
      ]
        .filter(Boolean)
        .join(", ");
      const shortcuts = [
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        !tab.pinned && !tab.running ? "Delete" : "",
        reorderable && index > 0 ? "Alt+Shift+ArrowLeft" : "",
        reorderable && index < tabs.length - 1
          ? "Alt+Shift+ArrowRight"
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      return html`
        <div
          class="request-tab${tab.id === activeTabID ? " active" : ""}${
            tab.pinned ? " pinned" : ""
          }"
          role="presentation"
          data-request-tab="${tab.id}"
        >
          <button
            type="button"
            class="request-tab-main"
            id="request-tab-${tab.id}"
            role="tab"
            data-action="activate-tab"
            data-tab-id="${tab.id}"
            data-request-tab-button
            aria-label="${accessibleName}"
            aria-selected="${tab.id === activeTabID ? "true" : "false"}"
            aria-controls="request-panel-${tab.id}"
            aria-keyshortcuts="${shortcuts}"
            title="${t("requests.tabs.renameNamed", {
              name: tab.name,
            })} · ${t("requests.tabs.renameHint")}"
            tabindex="${tab.id === activeTabID ? "0" : "-1"}"
            draggable="${reorderable}"
          >
            ${tab.pinned ? icon("pin", 11, "tab-pin") : ""}
            <code class="method method-${tab.method.toLowerCase()}">
              ${tab.method}
            </code>
            <span>${tab.name}</span>
            ${tab.running
              ? icon("spinner", 12, "spin")
              : tab.error
                ? icon("error", 12)
                : tab.dirty
                  ? html`<span class="dirty-dot" aria-hidden="true"></span>`
                  : ""}
          </button>
          ${tab.pinned
            ? ""
            : html`
                <button
                  type="button"
                  class="icon-button request-tab-close"
                  data-action="close-tab"
                  data-tab-id="${tab.id}"
                  aria-label="${t("requests.tabs.closeNamed", {
                    name: tab.name,
                  })}"
                  title="${tab.running
                    ? t("requests.tabs.cancelBeforeClose")
                    : t("requests.tabs.closeNamed", { name: tab.name })}"
                  tabindex="-1"
                  ${tab.running ? "disabled" : ""}
                >
                  ${icon("close", 12)}
                </button>
              `}
        </div>
      `;
    })}
    <button
      type="button"
      class="icon-button request-tab-new"
      data-action="new-request"
      aria-label="${t("requests.tabs.new")}"
      title="${t("requests.tabs.new")}"
    >
      ${icon("plus", 14)}
    </button>
  `;
}

export function requestTabsMarkup(
  tabs: readonly RequestTab[],
  activeTabID: string,
): TrustedHTMLFragment {
  return html`
    <div
      class="request-tabs"
      role="tablist"
      aria-orientation="horizontal"
      aria-label="${t("requests.tabs.openRequests")}"
    >
      ${requestTabItemsMarkup(tabs, activeTabID)}
    </div>
    ${tabs
      .filter((tab) => tab.id !== activeTabID)
      .map(
        (tab) => html`
          <div
            id="request-panel-${tab.id}"
            role="tabpanel"
            aria-labelledby="request-tab-${tab.id}"
            hidden
          ></div>
        `,
      )}
  `;
}

export function welcomeMarkup(
  importing: boolean,
  tools: readonly RequestWelcomeTool[],
  onboardingSteps: readonly string[],
): TrustedHTMLFragment {
  const guideSteps =
    onboardingSteps.length > 0
      ? onboardingSteps
      : [
          t("backend.bootstrap.onboarding.sendRequest"),
          t("backend.bootstrap.onboarding.reviewContract"),
          t("backend.bootstrap.onboarding.startMockServer"),
        ];
  const guideDescriptionKeys = [
    "requests.welcome.guideStepRequest",
    "requests.welcome.guideStepContract",
    "requests.welcome.guideStepMock",
  ] as const;
  return html`
    <section class="welcome-workspace-content" aria-labelledby="welcome-title">
      <div class="welcome-intro-grid">
        <div class="welcome-hero">
          <div class="welcome-hero-mark">${icon("request", 30)}</div>
          <span class="tool-eyebrow">${t("requests.welcome.eyebrow")}</span>
          <h1 id="welcome-title">${t("requests.welcome.title")}</h1>
          <p>${t("requests.welcome.description")}</p>
          <div class="welcome-actions">
            <button
              type="button"
              class="button primary"
              data-action="new-request"
            >
              ${icon("plus", 14)} ${t("requests.welcome.newRequest")}
            </button>
            <button
              type="button"
              class="button secondary"
              data-action="import-curl"
            >
              ${icon("terminal", 14)} ${t("requests.curlImport.actionLong")}
            </button>
            <button
              type="button"
              class="button secondary"
              data-action="import-openapi"
              aria-busy="${importing ? "true" : "false"}"
              ${importing ? "disabled" : ""}
            >
              ${importing
                ? icon("spinner", 14, "spin")
                : icon("import", 14)}
              ${importing
                ? t("requests.welcome.importing")
                : t("requests.welcome.importOpenAPI")}
            </button>
          </div>
          <div
            class="welcome-trust"
            aria-label="${t("requests.welcome.trustLabel")}"
          >
            <span>${icon("check", 13)} ${t("requests.welcome.localFirst")}</span>
            <span>${icon("check", 13)} ${t("requests.welcome.noAccount")}</span>
          </div>
        </div>
        <aside class="welcome-guide" aria-labelledby="welcome-guide-title">
          <header>
            <span class="welcome-guide-icon">${icon("workspace", 19)}</span>
            <div>
              <span>${t("requests.welcome.guideEyebrow")}</span>
              <h2 id="welcome-guide-title">${t("requests.welcome.guideTitle")}</h2>
            </div>
          </header>
          <ol>
            ${guideSteps.slice(0, 3).map(
              (step, index) => html`
                <li>
                  <span class="welcome-step-number">${index + 1}</span>
                  <div>
                    <strong>${step}</strong>
                    <p>${t(
                      guideDescriptionKeys[index] ?? guideDescriptionKeys[0],
                    )}</p>
                  </div>
                </li>
              `,
            )}
          </ol>
        </aside>
      </div>
      <section
        class="welcome-quick-tools"
        aria-labelledby="welcome-quick-tools-title"
        aria-describedby="welcome-quick-tools-description"
      >
        <header class="welcome-quick-tools-header">
          <h2 id="welcome-quick-tools-title">
            ${t("requests.welcome.quickTools")}
          </h2>
          <p id="welcome-quick-tools-description">
            ${t("requests.welcome.quickToolsDescription")}
          </p>
        </header>
        ${tools.map(
          (tool) => html`
            <button
              type="button"
              class="welcome-tool"
              data-action="open-tool"
              data-view="${tool.view}"
              aria-label="${t("requests.welcome.openTool", {
                tool: tool.label,
              })}"
              title="${t("requests.welcome.openTool", {
                tool: tool.label,
              })}"
            >
              <span class="welcome-tool-icon">${icon(tool.icon, 19)}</span>
              <span class="welcome-tool-copy">
                <strong>${tool.label}</strong>
                <small>${tool.description}</small>
              </span>
              ${icon("chevron-right", 15, "welcome-tool-chevron")}
            </button>
          `,
        )}
      </section>
    </section>
  `;
}

function headersMarkup(
  headers: readonly KeyValue[],
  disabled: boolean,
): TrustedHTMLFragment {
  return html`
    <section
      class="editor-section request-headers-section"
      aria-labelledby="request-headers-title"
    >
      <header class="section-intro compact">
        <div>
          <h2 id="request-headers-title">
            ${t("requests.editor.headers.title")}
          </h2>
          <p>${t("requests.editor.headers.description")}</p>
        </div>
        <button
          type="button"
          class="button ghost sm"
          data-action="add-header"
          ${disabled ? "disabled" : ""}
        >
          ${icon("plus", 13)} ${t("requests.editor.headers.add")}
        </button>
      </header>
      <div
        class="kv-editor request-headers-editor"
        aria-label="${t("requests.editor.headers.title")}"
      >
        <div class="kv-header">
          <span class="sr-only">
            ${t("requests.editor.headers.title")}
          </span>
          <span>${t("requests.editor.column.key")}</span>
          <span>${t("requests.editor.column.value")}</span>
          <span>
            ${t("requests.editor.column.description")}
          </span>
          <span class="sr-only">
            ${t("requests.editor.headers.delete")}
          </span>
        </div>
        ${headers.length === 0
          ? html`
              <div class="editor-empty-state" role="status">
                ${icon("info", 16)}
                <p>${t("requests.editor.headers.empty")}</p>
              </div>
            `
          : ""}
        ${headers.map(
          (header, index) => html`
            <div
              class="kv-row"
              data-header-row="${index}"
            >
              <label class="checkbox-cell">
                <input
                  type="checkbox"
                  data-header-field="enabled"
                  ${header.enabled ? "checked" : ""}
                  ${disabled ? "disabled" : ""}
                  aria-label="${t("requests.editor.headers.enabledAt", {
                    index: index + 1,
                  })}"
                />
              </label>
              <input
                value="${header.key}"
                data-header-field="key"
                placeholder="${t("requests.editor.headers.namePlaceholder")}"
                ${disabled ? "disabled" : ""}
                aria-label="${t("requests.editor.headers.nameAt", {
                  index: index + 1,
                })}"
              />
              <input
                value="${header.value}"
                data-header-field="value"
                placeholder="${t("requests.editor.headers.valuePlaceholder")}"
                ${disabled ? "disabled" : ""}
                aria-label="${t("requests.editor.headers.valueAt", {
                  index: index + 1,
                })}"
              />
              <input
                value="${header.description ?? ""}"
                data-header-field="description"
                placeholder="${t(
                  "requests.editor.headers.descriptionPlaceholder",
                )}"
                ${disabled ? "disabled" : ""}
                aria-label="${t("requests.editor.headers.descriptionAt", {
                  index: index + 1,
                })}"
              />
              <button
                type="button"
                class="icon-button"
                data-action="remove-header"
                data-index="${index}"
                ${disabled ? "disabled" : ""}
                aria-label="${t("requests.editor.headers.delete")}"
              >
                ${icon("trash", 13)}
              </button>
            </div>
          `,
        )}
      </div>
    </section>
  `;
}

function paramsMarkup(
  url: string,
  disabled: boolean,
): TrustedHTMLFragment {
  const rows = parseURLQuery(url);
  return html`
    <section
      class="editor-section query-params-section"
      aria-labelledby="query-params-title"
    >
      <header class="section-intro compact">
        <div>
          <h2 id="query-params-title">${t("requests.editor.query.title")}</h2>
          <p>${t("requests.editor.query.description")}</p>
        </div>
        <button
          type="button"
          class="button ghost sm"
          data-action="add-query"
          ${disabled ? "disabled" : ""}
        >
          ${icon("plus", 13)} ${t("requests.editor.query.add")}
        </button>
      </header>
      <div
        class="kv-editor query-params-editor"
        aria-label="${t("requests.editor.query.label")}"
      >
        <div class="kv-header">
          <span>${t("requests.editor.column.key")}</span>
          <span>${t("requests.editor.column.value")}</span>
          <span class="sr-only">
            ${t("requests.editor.query.deleteAt", { index: "" })}
          </span>
        </div>
        ${rows.length === 0
          ? html`
              <div class="editor-empty-state" role="status">
                ${icon("info", 16)}
                <p>${t("requests.editor.query.empty")}</p>
              </div>
            `
          : ""}
        ${rows.map(
          (row) => html`
            <div class="kv-row" data-query-row="${row.index}">
              <input
                value="${row.key}"
                data-query-field="key"
                placeholder="${t("requests.editor.query.namePlaceholder")}"
                ${disabled ? "disabled" : ""}
                aria-label="${t("requests.editor.query.nameAt", {
                  index: row.index + 1,
                })}"
              />
              <input
                value="${row.value}"
                data-query-field="value"
                placeholder="${t("requests.editor.query.newValue")}"
                ${disabled ? "disabled" : ""}
                aria-label="${t("requests.editor.query.valueAt", {
                  index: row.index + 1,
                })}"
              />
              <button
                type="button"
                class="icon-button"
                data-action="remove-query"
                data-index="${row.index}"
                ${disabled ? "disabled" : ""}
                aria-label="${t("requests.editor.query.deleteAt", {
                  index: row.index + 1,
                })}"
              >
                ${icon("trash", 13)}
              </button>
            </div>
          `,
        )}
      </div>
    </section>
  `;
}

function variablesMarkup(
  variables: RequestVariablesPresentation,
  disabled: boolean,
  literalValues: boolean,
): TrustedHTMLFragment {
  const entries = Object.entries(variables.values);
  const scope = t("requests.editor.variables.scope", {
    name: variables.environmentName,
  });
  return html`
    <section
      class="variables-editor editor-section"
      aria-labelledby="request-variables-title"
      aria-describedby="request-variables-description"
    >
      <header class="section-intro">
        <div>
          <h2 id="request-variables-title">
            ${t("requests.editor.variables.title", { scope })}
          </h2>
          <p id="request-variables-description">
            ${t("requests.editor.variables.description")}
          </p>
        </div>
      </header>
      <p class="editor-supporting-text" id="request-variables-secret-hint">
        ${icon("info", 14)}
        ${t("requests.editor.variables.secretHint")}
      </p>
      <label class="variable-resolution-mode">
        <input
          type="checkbox"
          name="resolveVariables"
          ${literalValues ? "" : "checked"}
          ${disabled ? "disabled" : ""}
        />
        <span>
          <strong>${t("requests.editor.variables.resolve")}</strong>
          <small>${t("requests.editor.variables.resolveDescription")}</small>
        </span>
      </label>
      <div class="kv-editor">
        <div class="kv-header">
          <span>${t("requests.editor.column.key")}</span>
          <span>${t("requests.editor.column.value")}</span>
          <span></span>
        </div>
        ${entries.length === 0
          ? html`
              <div class="editor-empty-state" role="status">
                ${icon("workspace", 16)}
                <p>${t("requests.editor.variables.empty")}</p>
              </div>
            `
          : ""}
        ${entries.map(([key, value]) => {
          const secret = isSecretKey(key);
          const overridden = variables.overridden.has(key);
          return html`
            <div class="kv-row" data-variable-row="${key}">
              <div class="variable-key-cell">
                <code>${key}</code>
                <small class="variable-meta">
                  ${secret
                    ? t("requests.editor.type.secret")
                    : t("requests.editor.type.string")}
                  ·
                  ${overridden
                    ? t("requests.editor.source.override", { scope })
                    : t("requests.editor.source.default")}
                </small>
              </div>
              <div class="variable-value-control">
                <input
                  type="${secret ? "password" : "text"}"
                  class="${secret ? "secret-value" : ""}"
                  value="${value}"
                  data-variable-value
                  autocomplete="off"
                  spellcheck="false"
                  ${disabled ? "disabled" : ""}
                  aria-label="${t("requests.editor.variables.value", { key })}"
                  aria-describedby="${secret
                    ? "request-variables-secret-hint"
                    : ""}"
                />
                ${secret
                  ? html`
                      <button
                        type="button"
                        class="icon-button variable-secret-toggle"
                        data-action="toggle-variable-secret"
                        data-key="${key}"
                        aria-label="${t(
                          "requests.editor.variables.showSecret",
                          { key },
                        )}"
                        title="${t("requests.editor.variables.showSecret", {
                          key,
                        })}"
                        aria-pressed="false"
                        ${disabled ? "disabled" : ""}
                      >
                        <span data-secret-icon="show">${icon("eye", 14)}</span>
                        <span data-secret-icon="hide" hidden>
                          ${icon("eye-off", 14)}
                        </span>
                      </button>
                    `
                  : ""}
              </div>
              <button
                type="button"
                class="icon-button"
                data-action="remove-variable"
                data-key="${key}"
                aria-label="${t("requests.editor.variables.removeOverride", {
                  key,
                })}"
                ${overridden && !disabled ? "" : "disabled"}
                title="${overridden
                  ? t("requests.editor.variables.removeOverride", { key })
                  : t("requests.editor.variables.environmentDefault")}"
              >
                ${icon("trash", 13)}
              </button>
            </div>
          `;
        })}
        <div class="kv-row variable-new-row">
          <input
            data-new-variable-key
            placeholder="${t("requests.editor.variables.newName")}"
            aria-label="${t("requests.editor.variables.newName")}"
            autocomplete="off"
            spellcheck="false"
            ${disabled ? "disabled" : ""}
          />
          <input
            data-new-variable-value
            placeholder="${t("requests.editor.variables.newValue")}"
            aria-label="${t("requests.editor.variables.newValue")}"
            autocomplete="off"
            spellcheck="false"
            ${disabled ? "disabled" : ""}
          />
          <button
            type="button"
            class="button ghost sm"
            data-action="add-variable"
            ${disabled ? "disabled" : ""}
            aria-label="${t("requests.editor.variables.confirmAdd")}"
            title="${t("requests.editor.variables.add")}"
          >
            ${icon("plus", 13)}
            <span>${t("requests.editor.variables.confirmAdd")}</span>
          </button>
        </div>
      </div>
    </section>
  `;
}

function editorMarkup(
  tab: RequestTab,
  draft: RequestDraft,
  variables: RequestVariablesPresentation,
): TrustedHTMLFragment {
  const section = tab.requestSection;
  const queryCount = parseURLQuery(draft.url).length;
  const headerCount = draft.headers.filter(
    (header) => header.enabled && header.key,
  ).length;
  return html`
    <div class="request-editor" id="request-editor-${tab.id}">
      <div
        class="request-section-tabs"
        role="tablist"
        aria-orientation="horizontal"
        aria-label="${t("requests.workbench.settings")}"
      >
        ${([
          ["params", "search", queryCount],
          ["headers", "code", headerCount],
          ["body", "braces", 0],
          ["variables", "workspace", 0],
        ] as const).map(
          ([id, iconName, count]) => {
            const label = t(`requests.workbench.section.${id}`);
            const countLabel =
              id === "params" && count > 0
                ? t(
                    count === 1
                      ? "requests.workbench.queryCount.one"
                      : "requests.workbench.queryCount.many",
                    { count },
                  )
                : id === "headers" && count > 0
                  ? t(
                      count === 1
                        ? "requests.workbench.headerCount.one"
                        : "requests.workbench.headerCount.many",
                      { count },
                    )
                  : label;
            return html`
              <button
                type="button"
                role="tab"
                id="request-section-tab-${tab.id}-${id}"
                data-request-section="${id}"
                data-state="${section === id ? "active" : "inactive"}"
                aria-label="${countLabel}"
                aria-selected="${section === id ? "true" : "false"}"
                aria-controls="request-section-panel-${tab.id}"
                tabindex="${section === id ? "0" : "-1"}"
                title="${countLabel}"
              >
                ${icon(iconName, 13)}
                ${label}
                ${count > 0
                  ? html`<span class="count-badge" aria-hidden="true">${count}</span>`
                  : ""}
              </button>
            `;
          },
        )}
      </div>
      <div
        class="request-section-content"
        id="request-section-panel-${tab.id}"
        role="tabpanel"
        aria-labelledby="request-section-tab-${tab.id}-${section}"
        tabindex="0"
      >
        ${section === "params"
          ? paramsMarkup(draft.url, tab.running)
          : section === "headers"
            ? headersMarkup(draft.headers, tab.running)
            : section === "body"
              ? methodAllowsBody(draft.method)
                ? html`
                    <section
                      class="body-editor editor-section"
                      aria-labelledby="request-body-title-${tab.id}"
                      aria-describedby="request-body-description-${tab.id}"
                    >
                      <header class="section-intro compact">
                        <div>
                          <h2 id="request-body-title-${tab.id}">
                            ${t("requests.editor.body.title")}
                          </h2>
                          <p id="request-body-description-${tab.id}">
                            ${t("requests.editor.body.description")}
                          </p>
                        </div>
                      </header>
                      <div class="body-editor-toolbar">
                        <button
                          type="button"
                          class="button ghost sm"
                          data-action="format-body"
                          title="${t("requests.editor.body.format")}"
                          ${tab.running ? "disabled" : ""}
                        >
                          ${t("requests.editor.body.format")}
                        </button>
                        <button
                          type="button"
                          class="button ghost sm"
                          data-action="minify-body"
                          title="${t("requests.editor.body.minify")}"
                          ${tab.running ? "disabled" : ""}
                        >
                          ${t("requests.editor.body.minify")}
                        </button>
                      </div>
                      <textarea
                        class="code-editor native-code-editor"
                        name="body"
                        spellcheck="false"
                        placeholder="${t("requests.editor.body.placeholder")}"
                        aria-label="${t("requests.editor.body.title")}"
                        aria-describedby="request-body-description-${tab.id}"
                        ${tab.running ? "disabled" : ""}
                      >${draft.body}</textarea>
                    </section>
                  `
                : html`
                    <div class="empty-state body-unavailable" role="status">
                      ${icon("info", 18)}
                      <div>
                        <strong>
                          ${t("requests.workbench.bodyUnavailable", {
                            method: draft.method,
                          })}
                        </strong>
                      </div>
                    </div>
                  `
              : variablesMarkup(
                  variables,
                  tab.running,
                  Boolean(tab.literalValues),
                )}
      </div>
    </div>
  `;
}

export function workbenchMarkup({
  tab,
  draft,
  variables,
  responsePlacement,
  responseSize,
  canceling,
  collectionSaveDisabled,
  unresolvedVariables,
  validationError,
  showURLValidation,
}: RequestWorkbenchPresentation): TrustedHTMLFragment {
  const visibleValidationError = showURLValidation
    ? validationError
    : undefined;
  const sendDisabled =
    unresolvedVariables.length > 0 || Boolean(validationError);
  const normalizedResponseSize = clampResponseSize(responseSize);

  return html`
    <section
      class="request-workbench response-${responsePlacement}"
      id="request-panel-${tab.id}"
      role="tabpanel"
      aria-labelledby="request-tab-${tab.id}"
      style="--response-size: ${normalizedResponseSize}%"
    >
      <h1 id="request-title-${tab.id}" class="sr-only">${tab.name}</h1>
      <form
        class="request-composer"
        id="request-composer-${tab.id}"
        data-request-form
        data-request-form-tab="${tab.id}"
        aria-busy="${tab.running ? "true" : "false"}"
      >
        <div
          class="request-url-row"
          role="group"
          aria-label="${t("requests.workbench.composer")}"
        >
          <div class="request-target">
            <select
              name="method"
              class="method-select method-${isStandardHTTPMethod(draft.method)
                ? draft.method.toLowerCase()
                : "custom"}"
              aria-label="${t("requests.editor.method.select")}"
              ${tab.running ? "disabled" : ""}
            >
              ${isStandardHTTPMethod(draft.method)
                ? ""
                : html`
                    <option value="${draft.method}" selected>
                      ${draft.method}
                    </option>
                  `}
              ${HTTP_METHODS.map(
                (method) => html`
                  <option value="${method}" ${method === draft.method ? "selected" : ""}>
                    ${method}
                  </option>
                `,
              )}
            </select>
            <input
              name="url"
              class="request-url-input"
              value="${draft.url}"
              placeholder="${t("requests.workbench.urlPlaceholder")}"
              aria-label="${t("requests.workbench.url")}"
              aria-invalid="${visibleValidationError ? "true" : "false"}"
              aria-describedby="${visibleValidationError ||
              unresolvedVariables.length > 0
                ? `request-validation-${tab.id}`
                : `request-url-help-${tab.id}`}"
              autocomplete="url"
              autocapitalize="off"
              spellcheck="false"
              ${tab.running ? "disabled" : ""}
            />
          </div>
          ${tab.running
            ? html`
                <button
                  type="button"
                  class="button danger send-button"
                  data-action="cancel-request"
                  aria-busy="${canceling ? "true" : "false"}"
                  ${canceling ? "disabled" : ""}
                  title="${canceling
                    ? t("requests.workbench.canceling")
                    : t("requests.workbench.cancel")}"
                >
                  ${canceling
                    ? icon("spinner", 14, "spin")
                    : icon("stop", 14)}
                  ${canceling
                    ? t("requests.workbench.canceling")
                    : t("requests.workbench.cancel")}
                </button>
              `
            : html`
                <button
                  type="submit"
                  class="button primary send-button"
                  ${sendDisabled ? "disabled" : ""}
                  aria-keyshortcuts="Control+Enter Meta+Enter"
                  title="${unresolvedVariables.length > 0
                    ? t("requests.workbench.completeVariables")
                    : validationError
                      ? t("requests.workbench.enterValidURL")
                      : t("requests.workbench.sendShortcut")}"
                >
                  ${icon("request", 14)} ${t("requests.workbench.send")}
                </button>
              `}
          <button
            type="button"
            class="button secondary"
            data-action="save-request"
            ${tab.running || collectionSaveDisabled ? "disabled" : ""}
            aria-keyshortcuts="Control+S Meta+S"
            title="${collectionSaveDisabled
              ? t("requests.workbench.saveUnavailable")
              : t("requests.workbench.saveShortcut")}"
          >
            ${icon("save", 14)}
            ${tab.savedRequestId
              ? t("requests.workbench.save")
              : t("requests.workbench.saveRequest")}
          </button>
          <button
            type="button"
            class="icon-button"
            data-action="request-menu"
            aria-label="${t("requests.workbench.moreSendOptions")}"
            aria-haspopup="menu"
            aria-expanded="false"
            title="${t("requests.workbench.moreSendOptions")}"
            ${tab.running ? "disabled" : ""}
          >
            ${icon("more", 15)}
          </button>
        </div>
        ${unresolvedVariables.length === 0 && !visibleValidationError
          ? html`
              <p
                class="request-url-help"
                id="request-url-help-${tab.id}"
              >
                ${t("requests.workbench.urlHelp")}
              </p>
            `
          : ""}
        ${unresolvedVariables.length > 0
          ? html`
              <div
                class="request-validation-message"
                id="request-validation-${tab.id}"
                role="alert"
              >
                ${icon("warning", 14)}
                ${t("requests.workbench.missingVariables", {
                  variables: unresolvedVariables.join(", "),
                })}
              </div>
            `
          : visibleValidationError
            ? html`
                <div
                  class="request-validation-message"
                  id="request-validation-${tab.id}"
                  role="alert"
                >
                  ${icon("warning", 14)} ${visibleValidationError}
                </div>
              `
            : ""}
        <div class="request-response-split">
          ${editorMarkup(tab, draft, variables)}
          <p class="sr-only" id="response-resize-help-${tab.id}">
            ${t("requests.workbench.resizeInstructions")}
          </p>
          <div
            class="response-resizer"
            data-response-resizer
            data-response-placement="${responsePlacement}"
            role="separator"
            tabindex="0"
            aria-orientation="${responsePlacement === "vertical"
              ? "horizontal"
              : "vertical"}"
            aria-label="${t("requests.workbench.resize")}"
            aria-describedby="response-resize-help-${tab.id}"
            aria-controls="request-editor-${tab.id} response-pane-${tab.id}"
            aria-valuemin="${responseSizeMinimum}"
            aria-valuemax="${responseSizeMaximum}"
            aria-valuenow="${Math.round(normalizedResponseSize)}"
            aria-valuetext="${t("requests.workbench.resizeValue", {
              value: Math.round(normalizedResponseSize),
            })}"
            title="${t("requests.workbench.resizeInstructions")}"
          >
            <span></span>
          </div>
          <div
            class="response-pane"
            id="response-pane-${tab.id}"
            aria-busy="${tab.running ? "true" : "false"}"
          >
            ${responsePanelMarkup(tab)}
          </div>
        </div>
      </form>
    </section>
  `;
}
