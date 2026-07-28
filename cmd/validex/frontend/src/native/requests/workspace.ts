import {
  Lifecycle,
  announce,
  eventElement,
  formValue,
  html,
  requiredElement,
  setHTML,
  type Disposable,
  type TrustedHTMLFragment,
} from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import {
  confirmDialog,
  openMenu,
  presentDialog,
} from "../../core/overlays.js";
import {
  messages,
  supportedLocales,
} from "../../i18n/messages.js";
import { subscribeLocale, t } from "../../i18n/locale.js";
import { backend } from "../../lib/backend.js";
import {
  HTTP_METHODS,
  isStandardHTTPMethod,
  methodAllowsBody,
} from "../../lib/http.js";
import { requestURLMatchesOpenAPIPath } from "../../lib/openapi.js";
import {
  missingVariables,
  requestURLValidationMessage,
  resolveVariableReferences,
} from "../../lib/schemas.js";
import { isSecretKey } from "../../lib/secrets.js";
import {
  addURLQueryRow,
  parseURLQuery,
  removeURLQueryRow,
  updateURLQueryRow,
} from "../../lib/urlQuery.js";
import type {
  BootstrapData,
  HTTPMethod,
  KeyValue,
  RequestTab,
  WorkspaceView,
} from "../../lib/types.js";
import {
  CurlImportError,
  looksLikeCurlBash,
  parseCurlBash,
  type CurlImportErrorCode,
  type CurlImportWarning,
  type ImportedCurlRequest,
} from "../../features/requests/model/curlImport.js";
import { requestNameFromURL } from "../../features/requests/model/requestName.js";
import {
  collectionLibraryStore,
} from "../../stores/collectionLibrary.js";
import {
  getCollectionLibraryPersistenceSnapshot,
  subscribeCollectionLibraryPersistence,
  waitForCollectionLibraryPersistence,
} from "../../stores/collectionLibraryStorage.js";
import { workspaceStore } from "../../stores/workspace.js";
import {
  cloneRequestDraft,
  isValidRequestVariableName,
  requestDraftMatchesTab,
  requestDraftPatchForFields,
  type RequestDraft,
  type RequestDraftField,
} from "./draft.js";
import {
  clampResponseSize,
  horizontalTabIndexFromKey,
  responseSizeFromKey,
  responseSizeFromPointer,
  responseSizeMaximum,
  responseSizeMinimum,
  writeClipboardText,
  type ResponseSplitPlacement,
} from "./interaction.js";
import { responsePanelMarkup } from "./response.js";

const untitledNames = new Set(
  supportedLocales.map((locale) => messages[locale]["requests.untitled"]),
);

function curlImportErrorMessage(error: unknown): string {
  if (!(error instanceof CurlImportError)) {
    return t("requests.curlImport.error.unknown");
  }
  const keys: Record<CurlImportErrorCode, Parameters<typeof t>[0]> = {
    empty: "requests.curlImport.error.empty",
    too_large: "requests.curlImport.error.tooLarge",
    too_many_tokens: "requests.curlImport.error.tooComplex",
    unterminated_quote: "requests.curlImport.error.quote",
    unsafe_shell: "requests.curlImport.error.unsafeShell",
    not_curl: "requests.curlImport.error.notCurl",
    missing_option_value: "requests.curlImport.error.missingValue",
    unsupported_option: "requests.curlImport.error.unsupportedOption",
    unsupported_binary: "requests.curlImport.error.binary",
    unsupported_file: "requests.curlImport.error.file",
    invalid_header: "requests.curlImport.error.header",
    too_many_headers: "requests.curlImport.error.tooManyHeaders",
    missing_url: "requests.curlImport.error.url",
    multiple_urls: "requests.curlImport.error.multipleURLs",
    unsupported_method: "requests.curlImport.error.method",
    body_too_large: "requests.curlImport.error.bodyTooLarge",
    invalid_form: "requests.curlImport.error.form",
  };
  return t(keys[error.code], {
    detail:
      error.code === "unsupported_option" ||
      error.code === "missing_option_value" ||
      error.code === "unsupported_method"
        ? error.detail
        : "",
  });
}

function curlWarningLabel(warning: CurlImportWarning): string {
  const keys: Record<CurlImportWarning, Parameters<typeof t>[0]> = {
    accept_encoding: "requests.curlImport.warning.acceptEncoding",
    compressed: "requests.curlImport.warning.compressed",
    globoff: "requests.curlImport.warning.globoff",
    http_version: "requests.curlImport.warning.httpVersion",
    path_as_is: "requests.curlImport.warning.pathAsIs",
    redirect_policy: "requests.curlImport.warning.redirect",
    tls_policy: "requests.curlImport.warning.tls",
  };
  return t(keys[warning]);
}

function localizedRequestURLValidationMessage(
  value: string,
): string | undefined {
  const message = requestURLValidationMessage(value);
  if (!message) return;
  const keys: Record<string, Parameters<typeof t>[0]> = {
    "Request URL gerekli.": "requests.validation.urlRequired",
    "URL başında veya sonunda boşluk içeremez.":
      "requests.validation.urlWhitespace",
    "URL açıkça http:// veya https:// ile başlamalı.":
      "requests.validation.urlScheme",
    "Yalnızca HTTP ve HTTPS URL’leri desteklenir.":
      "requests.validation.httpOnly",
    "URL kullanıcı bilgisi içeremez. Kimlik doğrulamayı Headers üzerinden yönetin.":
      "requests.validation.userInfo",
    "URL fragment (#…) içeremez.": "requests.validation.fragment",
    "Geçerli bir HTTP veya HTTPS URL’si girin.":
      "requests.validation.invalidURL",
  };
  const key = keys[message];
  return key ? t(key) : message;
}

function variablesFor(
  bootstrap: BootstrapData,
): {
  environmentID: string;
  environmentName: string;
  values: Record<string, string>;
  overridden: ReadonlySet<string>;
} {
  const state = workspaceStore.getState();
  const environment =
    bootstrap.environments.find(
      (candidate) => candidate.id === state.activeEnvironmentID,
    ) ?? bootstrap.environments[0];
  const environmentID = environment?.id ?? "none";
  const overrides = state.environmentVariables[environmentID] ?? {};
  return {
    environmentID,
    environmentName: environment?.name ?? t("requests.workbench.workspace"),
    values: { ...(environment?.variables ?? {}), ...overrides },
    overridden: new Set(Object.keys(overrides)),
  };
}

function requestVariableResolution(
  tab: RequestTab,
  draft: RequestDraft,
  bootstrap: BootstrapData,
): {
  values: Record<string, string>;
  unresolved: string[];
  resolvedURL: string;
  resolve: (value: string) => string;
} {
  if (tab.literalValues) {
    return {
      values: {},
      unresolved: [],
      resolvedURL: draft.url,
      resolve: (value) => value,
    };
  }
  const values = variablesFor(bootstrap).values;
  return {
    values,
    unresolved: missingVariables(
      [
        draft.url,
        methodAllowsBody(draft.method) ? draft.body : "",
        ...draft.headers
          .filter((header) => header.enabled)
          .map((header) => header.value),
      ].join("\n"),
      values,
    ),
    resolvedURL: resolveVariableReferences(draft.url, values),
    resolve: (value) => resolveVariableReferences(value, values),
  };
}

function requestTabsMarkup(
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
              aria-selected="${tab.id === activeTabID
                ? "true"
                : "false"}"
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

function welcomeMarkup(importing: boolean): TrustedHTMLFragment {
  return html`
    <section class="welcome-workspace-content" aria-labelledby="welcome-title">
      <div class="welcome-hero">
        ${icon("request", 34)}
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
        ${([
          ["json", "braces"],
          ["mock", "mock"],
          ["protocols", "protocols"],
          ["diagnostics", "activity"],
          ["automation", "automation"],
        ] as const).map(
          ([view, iconName]) => {
            const toolLabel = messages[
              document.documentElement.lang === "tr" ? "tr" : "en"
            ][`workspace.${view}.label`];
            return html`
              <button
                type="button"
                class="welcome-tool"
                data-action="open-tool"
                data-view="${view}"
                aria-label="${t("requests.welcome.openTool", {
                  tool: toolLabel,
                })}"
                title="${t("requests.welcome.openTool", {
                  tool: toolLabel,
                })}"
              >
                ${icon(iconName, 19)}
                <span>${toolLabel}</span>
              </button>
            `;
          },
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
        <button
          type="button"
          class="button ghost sm"
          data-action="add-header"
          ${disabled ? "disabled" : ""}
        >
          ${icon("plus", 13)} ${t("requests.editor.headers.add")}
        </button>
      </div>
    </section>
  `;
}

function paramsMarkup(url: string, disabled: boolean): TrustedHTMLFragment {
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
        <button
          type="button"
          class="button ghost sm"
          data-action="add-query"
          ${disabled ? "disabled" : ""}
        >
          ${icon("plus", 13)} ${t("requests.editor.query.add")}
        </button>
      </div>
    </section>
  `;
}

function variablesMarkup(
  bootstrap: BootstrapData,
  disabled: boolean,
  literalValues: boolean,
): TrustedHTMLFragment {
  const variables = variablesFor(bootstrap);
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
        ${entries.map(
          ([key, value]) => {
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
          },
        )}
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
  bootstrap: BootstrapData,
): TrustedHTMLFragment {
  const section = tab.requestSection;
  const queryCount = parseURLQuery(draft.url).length;
  const headerCount = draft.headers.filter(
    (header) => header.enabled && header.key,
  ).length;
  return html`
    <div class="request-editor">
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
                  bootstrap,
                  tab.running,
                  Boolean(tab.literalValues),
                )}
      </div>
    </div>
  `;
}

function workbenchMarkup(
  tab: RequestTab,
  draft: RequestDraft,
  bootstrap: BootstrapData,
  responsePlacement: ResponseSplitPlacement,
  responseSize: number,
  canceling: boolean,
  showURLValidation: boolean,
): TrustedHTMLFragment {
  const resolution = requestVariableResolution(tab, draft, bootstrap);
  const unresolved = resolution.unresolved;
  const validationError =
    unresolved.length === 0
      ? localizedRequestURLValidationMessage(resolution.resolvedURL)
      : undefined;
  const visibleValidationError = showURLValidation
    ? validationError
    : undefined;
  const sendDisabled = unresolved.length > 0 || Boolean(validationError);
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
        aria-busy="${tab.running ? "true" : "false"}"
      >
        <div
          class="request-url-row"
          role="group"
          aria-label="${t("requests.workbench.composer")}"
        >
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
            aria-describedby="${visibleValidationError || unresolved.length > 0
              ? `request-validation-${tab.id}`
              : `request-url-help-${tab.id}`}"
            autocomplete="url"
            autocapitalize="off"
            spellcheck="false"
            ${tab.running ? "disabled" : ""}
          />
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
                  title="${unresolved.length > 0
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
            class="button secondary request-import-button"
            data-action="import-curl"
            title="${t("requests.curlImport.actionLong")}"
            ${tab.running ? "disabled" : ""}
          >
            ${icon("terminal", 14)}
            <span>${t("requests.curlImport.action")}</span>
          </button>
          <button
            type="button"
            class="button secondary"
            data-action="save-request"
            ${tab.running ? "disabled" : ""}
            aria-keyshortcuts="Control+S Meta+S"
            title="${t("requests.workbench.saveShortcut")}"
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
            title="${t("requests.workbench.moreSendOptions")}"
            ${tab.running ? "disabled" : ""}
          >
            ${icon("more", 15)}
          </button>
        </div>
        ${unresolved.length === 0 && !visibleValidationError
          ? html`
              <p
                class="request-url-help"
                id="request-url-help-${tab.id}"
              >
                ${t("requests.workbench.urlHelp")}
              </p>
            `
          : ""}
        ${unresolved.length > 0
          ? html`
              <div
                class="request-validation-message"
                id="request-validation-${tab.id}"
                role="alert"
              >
                ${icon("warning", 14)}
                ${t("requests.workbench.missingVariables", {
                  variables: unresolved.join(", "),
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
        ${editorMarkup(tab, draft, bootstrap)}
      </form>
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
        aria-controls="request-composer-${tab.id} response-pane-${tab.id}"
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
    </section>
  `;
}

function readHeaders(root: HTMLElement, current: readonly KeyValue[]): KeyValue[] {
  return [
    ...root.querySelectorAll<HTMLElement>("[data-header-row]"),
  ].map((row) => {
    const index = Number(row.dataset.headerRow);
    const previous = current[index];
    const value = (field: string) =>
      row.querySelector<HTMLInputElement>(`[data-header-field="${field}"]`)
        ?.value ?? "";
    return {
      id: previous?.id ?? crypto.randomUUID(),
      enabled:
        row.querySelector<HTMLInputElement>('[data-header-field="enabled"]')
          ?.checked ?? true,
      key: value("key"),
      value: value("value"),
      description: value("description"),
      source: previous?.source ?? "Manual",
    };
  });
}

export function mountRequestWorkspace(
  root: HTMLElement,
  bootstrap: BootstrapData,
): Disposable {
  const lifecycle = new Lifecycle();
  const drafts = new Map<string, RequestDraft>();
  const pendingDraftFields = new Map<string, Set<RequestDraftField>>();
  const requestDialogs = new Set<ReturnType<typeof presentDialog>>();
  const urlValidationTouched = new Set<string>();
  const cancelingRequests = new Set<string>();
  const compactResponseMedia =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 900px)")
      : undefined;
  let disposed = false;
  let rendering = false;
  let suppressStoreRender = 0;
  let editorRenderPending = false;
  let draftFlushTimer: number | undefined;
  let queuedRenderTimer: number | undefined;
  let draggedTabID: string | undefined;
  let responseResize:
    | {
        placement: ResponseSplitPlacement;
        startCoordinate: number;
        startSize: number;
        containerExtent: number;
      }
    | undefined;
  let importedNotice = "";
  let importedNoticeTone: "info" | "danger" = "info";
  let importingOpenAPI = false;

  lifecycle.add(() => {
    for (const dialog of requestDialogs) dialog.dispose();
    requestDialogs.clear();
  });

  const activeTab = (): RequestTab | undefined => {
    const state = workspaceStore.getState();
    return state.tabs.find((tab) => tab.id === state.activeTabID);
  };

  const effectiveResponsePlacement = (): ResponseSplitPlacement =>
    workspaceStore.getState().responsePlacement === "horizontal" &&
    !compactResponseMedia?.matches
      ? "horizontal"
      : "vertical";

  const draftFor = (tab: RequestTab): RequestDraft => {
    const existing = drafts.get(tab.id);
    const hasPendingFields = (pendingDraftFields.get(tab.id)?.size ?? 0) > 0;
    if (
      !existing ||
      (!hasPendingFields && !requestDraftMatchesTab(existing, tab))
    ) {
      const next = cloneRequestDraft(tab);
      drafts.set(tab.id, next);
      return next;
    }
    return existing;
  };

  const scheduleDraftFlush = () => {
    if (draftFlushTimer !== undefined) {
      window.clearTimeout(draftFlushTimer);
    }
    draftFlushTimer = window.setTimeout(() => {
      draftFlushTimer = undefined;
      flushPendingDrafts();
    }, 120);
  };

  const markDraftFields = (
    tabID: string,
    fields: readonly RequestDraftField[],
  ) => {
    if (fields.length === 0) return;
    const pending = pendingDraftFields.get(tabID) ?? new Set<RequestDraftField>();
    for (const field of fields) pending.add(field);
    pendingDraftFields.set(tabID, pending);
    scheduleDraftFlush();
  };

  const commitDraftFields = (
    tabID: string,
    draft: RequestDraft,
    fields: ReadonlySet<RequestDraftField>,
  ): boolean => {
    const tab = workspaceStore
      .getState()
      .tabs.find((candidate) => candidate.id === tabID);
    if (!tab) return false;

    const draftPatch = requestDraftPatchForFields(draft, tab, fields);
    if (!draftPatch) return false;
    const patch: Partial<RequestTab> = { ...draftPatch };
    if (draftPatch.method !== undefined) {
      patch.openApi = undefined;
    }

    patch.dirty = true;
    patch.error = false;
    patch.userError = undefined;
    suppressStoreRender += 1;
    try {
      workspaceStore.getState().updateTab(tabID, patch);
    } finally {
      suppressStoreRender -= 1;
    }
    editorRenderPending = true;
    return true;
  };

  function flushPendingDrafts(): boolean {
    if (draftFlushTimer !== undefined) {
      window.clearTimeout(draftFlushTimer);
      draftFlushTimer = undefined;
    }
    const pendingEntries = [...pendingDraftFields.entries()];
    pendingDraftFields.clear();
    let changed = false;
    for (const [tabID, fields] of pendingEntries) {
      const draft = drafts.get(tabID);
      if (draft) changed = commitDraftFields(tabID, draft, fields) || changed;
    }
    return changed;
  }

  const captureDraft = (): RequestDraft | undefined => {
    const tab = activeTab();
    const form = root.querySelector<HTMLFormElement>("[data-request-form]");
    if (!tab || !form || tab.running) return;
    const draft = draftFor(tab);
    const changedFields: RequestDraftField[] = [];
    const method = form.querySelector<HTMLSelectElement>('[name="method"]');
    const url = form.querySelector<HTMLInputElement>('[name="url"]');
    const body = form.querySelector<HTMLTextAreaElement>('[name="body"]');
    if (method && draft.method !== method.value) {
      draft.method = method.value as HTTPMethod;
      changedFields.push("method");
    }
    if (url && draft.url !== url.value) {
      draft.url = url.value;
      changedFields.push("url");
    }
    if (body && draft.body !== body.value) {
      draft.body = body.value;
      changedFields.push("body");
    }
    if (form.querySelector("[data-header-row]")) {
      const headers = readHeaders(root, draft.headers);
      if (JSON.stringify(headers) !== JSON.stringify(draft.headers)) {
        draft.headers = headers;
        changedFields.push("headers");
      }
    }
    markDraftFields(tab.id, changedFields);
    return draft;
  };

  const render = () => {
    if (disposed || rendering) return;
    if (queuedRenderTimer !== undefined) {
      window.clearTimeout(queuedRenderTimer);
      queuedRenderTimer = undefined;
    }
    rendering = true;
    try {
      flushPendingDrafts();
      const state = workspaceStore.getState();
      const tab = state.tabs.find((candidate) => candidate.id === state.activeTabID);
      setHTML(
        root,
        html`
          ${importedNotice
            ? html`
                <div
                  class="tool-notice ${importedNoticeTone}"
                  role="${importedNoticeTone === "danger" ? "alert" : "status"}"
                >
                  ${icon(
                    importedNoticeTone === "danger" ? "error" : "info",
                    15,
                  )}
                  <p>${importedNotice}</p>
                  <button
                    type="button"
                    class="icon-button"
                    data-action="dismiss-import-notice"
                    aria-label="${t("requests.welcome.dismissNotice")}"
                    title="${t("requests.welcome.dismissNotice")}"
                  >
                    ${icon("close", 13)}
                  </button>
                </div>
              `
            : ""}
          ${state.tabs.length > 0
            ? requestTabsMarkup(state.tabs, state.activeTabID)
            : ""}
          ${tab
            ? workbenchMarkup(
                tab,
                draftFor(tab),
                bootstrap,
                effectiveResponsePlacement(),
                state.responseSize,
                cancelingRequests.has(tab.id),
                urlValidationTouched.has(tab.id),
              )
            : welcomeMarkup(importingOpenAPI)}
        `,
      );
      editorRenderPending = false;
    } finally {
      rendering = false;
    }
  };

  const queueRender = () => {
    if (queuedRenderTimer !== undefined) return;
    queuedRenderTimer = window.setTimeout(() => {
      queuedRenderTimer = undefined;
      render();
    }, 0);
  };

  const updateDraftInStore = (
    tab: RequestTab,
    draft: RequestDraft,
    fields: readonly RequestDraftField[],
    rerender: boolean,
  ) => {
    markDraftFields(tab.id, fields);
    if (rerender) {
      render();
    } else {
      flushPendingDrafts();
    }
  };

  const syncSendButton = (tab: RequestTab, draft: RequestDraft) => {
    const resolution = requestVariableResolution(tab, draft, bootstrap);
    const unresolved = resolution.unresolved;
    const validationError =
      unresolved.length === 0
        ? localizedRequestURLValidationMessage(resolution.resolvedURL)
        : undefined;
    const sendButton = root.querySelector<HTMLButtonElement>(
      '[data-request-form] .send-button[type="submit"]',
    );
    if (!sendButton) return;
    sendButton.disabled =
      unresolved.length > 0 || Boolean(validationError);
    sendButton.title =
      unresolved.length > 0
        ? t("requests.workbench.completeVariables")
        : validationError
          ? t("requests.workbench.enterValidURL")
          : t("requests.workbench.sendShortcut");
  };

  const focusElementAfterRender = (id: string) => {
    window.requestAnimationFrame(() => {
      if (!disposed) document.getElementById(id)?.focus();
    });
  };

  const focusSelectorAfterRender = (selector: string) => {
    window.requestAnimationFrame(() => {
      if (!disposed) root.querySelector<HTMLElement>(selector)?.focus();
    });
  };

  const applyResponseSize = (size: number) => {
    const nextSize = clampResponseSize(size);
    if (workspaceStore.getState().responseSize !== nextSize) {
      suppressStoreRender += 1;
      try {
        workspaceStore.getState().setResponseSize(nextSize);
      } finally {
        suppressStoreRender -= 1;
      }
    }
    const workbench = root.querySelector<HTMLElement>(".request-workbench");
    workbench?.style.setProperty("--response-size", `${nextSize}%`);
    const separator =
      root.querySelector<HTMLElement>("[data-response-resizer]");
    separator?.setAttribute("aria-valuenow", String(Math.round(nextSize)));
    separator?.setAttribute(
      "aria-valuetext",
      t("requests.workbench.resizeValue", { value: Math.round(nextSize) }),
    );
  };

  const stopResponseResize = () => {
    responseResize = undefined;
    document.body.classList.remove(
      "response-resizing",
      "response-resizing-row",
      "response-resizing-column",
    );
  };
  lifecycle.add(stopResponseResize);

  const closeTab = async (tabID: string, trigger?: HTMLElement) => {
    const tab = workspaceStore
      .getState()
      .tabs.find((candidate) => candidate.id === tabID);
    if (!tab || tab.running) return;
    let force = false;
    if (tab.dirty) {
      force = await confirmDialog({
        title: t("requests.tabs.closeDraftTitle"),
        description: t("requests.tabs.closeDraftDescription", { name: tab.name }),
        confirmLabel: t("requests.tabs.closeDraft"),
        cancelLabel: t("requests.tabs.cancel"),
        danger: true,
        trigger,
      });
      if (!force) return;
    }
    workspaceStore.getState().closeTab(tabID, force);
    drafts.delete(tabID);
    pendingDraftFields.delete(tabID);
    urlValidationTouched.delete(tabID);
    cancelingRequests.delete(tabID);
    const nextTabID = workspaceStore.getState().activeTabID;
    if (nextTabID) {
      focusElementAfterRender(`request-tab-${nextTabID}`);
    } else {
      focusSelectorAfterRender('[data-action="new-request"]');
    }
  };

  const sendRequest = async (tab: RequestTab, draft: RequestDraft) => {
    const requestTab =
      workspaceStore
        .getState()
        .tabs.find((candidate) => candidate.id === tab.id) ?? tab;
    if (requestTab.running) return;
    cancelingRequests.delete(requestTab.id);
    const sent = cloneRequestDraft(draft);
    const resolution = requestVariableResolution(
      requestTab,
      sent,
      bootstrap,
    );
    const urlError = localizedRequestURLValidationMessage(
      resolution.resolvedURL,
    );
    const unresolved = resolution.unresolved;
    if (urlError || unresolved.length > 0) {
      urlValidationTouched.add(requestTab.id);
      announce(
        urlError ??
          t("requests.workbench.missingVariables", {
            variables: unresolved.join(", "),
          }),
      );
      render();
      return;
    }
    workspaceStore.getState().updateTab(requestTab.id, {
      running: true,
      error: false,
      userError: undefined,
      response: undefined,
      method: sent.method,
      url: sent.url,
      body: sent.body,
      headers: sent.headers.map((header) => ({ ...header })),
      dirty:
        requestTab.dirty || !requestDraftMatchesTab(sent, requestTab),
    });
    try {
      const result = await backend.sendRequest({
        id: requestTab.id,
        name: requestTab.name,
        method: sent.method,
        url: sent.url,
        headers: sent.headers.map(({ id: _id, ...header }) => header),
        body: sent.body,
        variables: resolution.values,
        literalValues: Boolean(requestTab.literalValues),
        timeoutMs: 30_000,
        saveHistory: true,
      });
      if (disposed) return;
      if (result.response) {
        let response = result.response;
        if (requestTab.openApi) {
          if (!requestURLMatchesOpenAPIPath(sent.url, requestTab.openApi.path)) {
            response = {
              ...response,
              contract: {
                available: false,
                ok: false,
                truncated: false,
                method: sent.method,
                path: requestTab.openApi.path,
                findings: [],
                error: {
                  code: "operation_changed",
                  title: t("requests.error.operationChanged.title"),
                  message: t("requests.error.operationChanged.message", {
                    path: requestTab.openApi.path,
                  }),
                  hint: t("requests.error.operationChanged.hint"),
                },
              },
            };
          } else {
            try {
              response = {
                ...response,
                contract: await backend.validateOpenAPIResponse({
                  specId: requestTab.openApi.specId,
                  method: sent.method,
                  path: requestTab.openApi.path,
                  statusCode: response.statusCode,
                  contentType: response.contentType,
                  body: response.rawBody,
                }),
              };
            } catch (error) {
              response = {
                ...response,
                contract: {
                  available: false,
                  ok: false,
                  truncated: false,
                  method: sent.method,
                  path: requestTab.openApi.path,
                  findings: [],
                  error: {
                    code: "contract_check_failed",
                    title: t("requests.error.contractCheck.title"),
                    message: t("requests.error.contractCheck.message"),
                    technical:
                      error instanceof Error ? error.message : String(error),
                  },
                },
              };
            }
          }
        }
        workspaceStore.getState().updateTab(requestTab.id, {
          running: false,
          error: false,
          userError: undefined,
          response,
        });
      } else {
        workspaceStore.getState().updateTab(requestTab.id, {
          running: false,
          error: result.error?.code !== "request_canceled",
          userError:
            result.error ?? {
              code: "empty_response",
              title: t("requests.error.emptyResponse.title"),
              message: t("requests.error.emptyResponse.message"),
              hint: t("requests.error.emptyResponse.hint"),
            },
        });
      }
    } catch (error) {
      workspaceStore.getState().updateTab(requestTab.id, {
        running: false,
        error: true,
        userError: {
          code: "bridge_error",
          title: t("requests.error.bridge.title"),
          message: t("requests.error.bridge.message"),
          hint: t("requests.error.bridge.hint"),
          technical: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      if (cancelingRequests.delete(requestTab.id) && !disposed) {
        queueRender();
      }
    }
  };

  const cancelRequest = async (tab: RequestTab) => {
    if (cancelingRequests.has(tab.id)) return;
    cancelingRequests.add(tab.id);
    render();
    try {
      const canceled = await backend.cancelRequest(tab.id);
      if (!canceled) {
        cancelingRequests.delete(tab.id);
        workspaceStore.getState().updateTab(tab.id, {
          running: false,
          error: true,
          userError: {
            code: "cancel_not_found",
            title: t("requests.error.cancelNotFound.title"),
            message: t("requests.error.cancelNotFound.message"),
            hint: t("requests.error.cancelNotFound.hint"),
          },
        });
      }
    } catch (error) {
      cancelingRequests.delete(tab.id);
      workspaceStore.getState().updateTab(tab.id, {
        running: false,
        error: true,
        userError: {
          code: "cancel_failed",
          title: t("requests.error.cancelFailed.title"),
          message: t("requests.error.cancelFailed.message"),
          hint: t("requests.error.cancelFailed.hint"),
          technical: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  const copyToClipboard = async (
    value: string,
    successMessage: string,
  ): Promise<void> => {
    const writer =
      typeof navigator !== "undefined" && navigator.clipboard?.writeText
        ? (text: string) => navigator.clipboard.writeText(text)
        : undefined;
    const copied = await writeClipboardText(writer, value);
    if (disposed) return;
    announce(copied ? successMessage : t("common.copyFailed"));
  };

  const copyAsCurl = (tab: RequestTab, draft: RequestDraft) => {
    const resolution = requestVariableResolution(tab, draft, bootstrap);
    const unresolved = resolution.unresolved;
    if (unresolved.length > 0) {
      announce(
        t("requests.workbench.missingVariables", {
          variables: unresolved.join(", "),
        }),
      );
      return;
    }
    const urlError = localizedRequestURLValidationMessage(
      resolution.resolvedURL,
    );
    if (urlError) {
      announce(urlError);
      return;
    }
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    const parts = [
      "curl",
      "--request",
      draft.method,
      "--url",
      quote(resolution.resolvedURL),
    ];
    for (const header of draft.headers) {
      if (!header.enabled || !header.key) continue;
      parts.push(
        "--header",
        quote(`${header.key}: ${resolution.resolve(header.value)}`),
      );
    }
    if (methodAllowsBody(draft.method) && draft.body) {
      parts.push(
        "--data-raw",
        quote(resolution.resolve(draft.body)),
      );
    }
    void copyToClipboard(parts.join(" "), t("common.copied"));
  };

  const importedCurlHeaders = (
    request: ImportedCurlRequest,
  ): KeyValue[] =>
    request.headers.map((header) => ({
      id: crypto.randomUUID(),
      enabled: true,
      key: header.key,
      value: header.value,
      description: t("requests.curlImport.headerDescription"),
      source: "Manual",
    }));

  const setCurlImportNotice = (
    request: ImportedCurlRequest,
    headers: readonly KeyValue[],
  ) => {
    const sensitive = headers.filter((header) =>
      isSecretKey(header.key),
    ).length;
    const messages = [
      t("requests.curlImport.imported", {
        count: headers.length,
      }),
    ];
    if (sensitive > 0) {
      messages.push(
        t("requests.curlImport.importedSensitive", {
          count: sensitive,
        }),
      );
    }
    if (request.warnings.length > 0) {
      messages.push(
        t("requests.curlImport.importedWarnings", {
          warnings: request.warnings.map(curlWarningLabel).join(", "),
        }),
      );
    }
    importedNoticeTone = "info";
    importedNotice = messages.join(" ");
    announce(importedNotice);
  };

  const applyCurlImport = (request: ImportedCurlRequest) => {
    const headers = importedCurlHeaders(request);
    const requestSection =
      request.body && methodAllowsBody(request.method)
        ? "body"
        : headers.length > 0
          ? "headers"
          : "params";
    const derivedName =
      requestNameFromURL(request.url) ?? t("requests.untitled");
    setCurlImportNotice(request, headers);

    workspaceStore.getState().openTab({
      name: derivedName,
      method: request.method,
      url: request.url,
      body: request.body,
      headers,
      literalValues: true,
      sessionOnly: true,
      dirty: true,
      error: false,
      requestSection,
      responseSection: "body",
    });
  };

  const openCurlImportDialog = (
    initialSource = "",
    trigger?: HTMLElement,
    initialError?: string,
    initialRequest?: ImportedCurlRequest,
  ) => {
    const dialog = presentDialog(
      html`
        <form
          class="save-request-dialog curl-import-dialog"
          data-curl-import-form
          novalidate
          aria-labelledby="curl-import-title"
        >
          <div class="dialog-header">
            <div>
              <h2 id="curl-import-title">
                ${t("requests.curlImport.title")}
              </h2>
              <p id="curl-import-description">
                ${t("requests.curlImport.description")}
              </p>
            </div>
            <button
              type="button"
              class="icon-button"
              data-dialog-close="cancel"
              aria-label="${t("requests.curlImport.cancel")}"
              title="${t("requests.curlImport.cancel")}"
            >
              ${icon("close", 16)}
            </button>
          </div>
          <div class="curl-import-field">
            <label for="curl-import-source">
              ${t("requests.curlImport.field")}
            </label>
            <textarea
              id="curl-import-source"
              class="curl-import-source"
              name="curlSource"
              required
              spellcheck="false"
              autocapitalize="off"
              autocomplete="off"
              placeholder="${t("requests.curlImport.placeholder")}"
              aria-describedby="curl-import-help curl-import-security"
              aria-errormessage="curl-import-error"
              ${initialError ? 'aria-invalid="true"' : ""}
            >${initialSource}</textarea>
            <small id="curl-import-help">
              ${t("requests.curlImport.help")}
            </small>
          </div>
          <p class="dialog-supporting-text" id="curl-import-security">
            ${icon("warning", 14)}
            <span>${t("requests.curlImport.security")}</span>
          </p>
          <p
            id="curl-import-error"
            class="dialog-field-error"
            data-curl-import-error
            role="alert"
            ${initialError ? "" : "hidden"}
          >
            ${icon("error", 14)}
            <span>${initialError ?? ""}</span>
          </p>
          <div class="dialog-actions">
            <button
              type="button"
              class="button secondary"
              data-dialog-close="cancel"
            >
              ${t("requests.curlImport.cancel")}
            </button>
            <button type="submit" class="button primary">
              ${icon("terminal", 14)}
              ${t("requests.curlImport.confirm")}
            </button>
          </div>
        </form>
      `,
      {
        className: "curl-import-shell",
        trigger,
        initialFocus: '[name="curlSource"]',
        describedBy: "curl-import-description",
      },
    );
    requestDialogs.add(dialog);
    const dialogLifecycle = new Lifecycle();
    void dialog.closed.then(() => {
      dialogLifecycle.dispose();
      requestDialogs.delete(dialog);
    });
    const form = requiredElement<HTMLFormElement>(
      dialog.element,
      "[data-curl-import-form]",
    );
    const textarea = requiredElement<HTMLTextAreaElement>(
      form,
      '[name="curlSource"]',
    );
    const errorBox = requiredElement<HTMLElement>(
      form,
      "[data-curl-import-error]",
    );
    let preparedRequest = initialRequest;
    const showError = (message: string) => {
      const text = errorBox.querySelector<HTMLElement>("span");
      if (text) text.textContent = message;
      errorBox.hidden = false;
      textarea.setAttribute("aria-invalid", "true");
      textarea.focus();
    };
    dialogLifecycle.listen(textarea, "input", () => {
      preparedRequest = undefined;
      textarea.removeAttribute("aria-invalid");
      errorBox.hidden = true;
    });
    dialogLifecycle.listen(form, "submit", (event) => {
      event.preventDefault();
      try {
        const request =
          preparedRequest ?? parseCurlBash(textarea.value);
        applyCurlImport(request);
        dialog.close("import");
        focusSelectorAfterRender('[name="url"]');
      } catch (error) {
        showError(curlImportErrorMessage(error));
      }
    });
  };

  const persistSavedRequest = async (
    tab: RequestTab,
    draft: RequestDraft,
    collectionID: string,
    name: string,
    forceNew: boolean,
  ) => {
    const library = collectionLibraryStore.getState();
    const snapshot = {
      name,
      ...draft,
      literalValues: Boolean(tab.literalValues),
    };
    const requestID = forceNew
      ? library.saveRequest(collectionID, snapshot)
      : library.upsertRequest(
          collectionID,
          snapshot,
          tab.savedRequestId,
        );
    if (!requestID) {
      announce(t("requests.workbench.saveWriteFailed"));
      return false;
    }
    workspaceStore.getState().updateTab(tab.id, {
      savedRequestId: requestID,
      collectionId: collectionID,
      name,
      ...draft,
      literalValues: Boolean(tab.literalValues),
      sessionOnly: false,
      dirty: true,
    });
    const durable = await waitForCollectionLibraryPersistence();
    const persisted = collectionLibraryStore
      .getState()
      .requests.find((request) => request.id === requestID);
    const secretsRemoved =
      Boolean(persisted) &&
      JSON.stringify(persisted?.headers) !== JSON.stringify(draft.headers);
    const currentTab = workspaceStore
      .getState()
      .tabs.find((candidate) => candidate.id === tab.id);
    const unchanged =
      currentTab?.savedRequestId === requestID &&
      currentTab.method === draft.method &&
      currentTab.url === draft.url &&
      currentTab.body === draft.body &&
      JSON.stringify(currentTab.headers) === JSON.stringify(draft.headers);
    if (durable && !secretsRemoved && unchanged) {
      workspaceStore.getState().updateTab(tab.id, { dirty: false });
      announce(t("requests.workbench.saved"));
    } else if (!durable) {
      announce(t("requests.workbench.saveWriteFailed"));
    } else if (secretsRemoved) {
      announce(t("requests.workbench.secretHeadersNotSaved"));
    }
    return true;
  };

  const openRenameDialog = (
    tab: RequestTab,
    trigger?: HTMLElement,
  ) => {
    if (tab.running) {
      announce(t("requests.tabs.cancelBeforeClose"));
      return;
    }
    const dialog = presentDialog(
      html`
        <form
          class="save-request-dialog rename-request-dialog"
          data-rename-form
          aria-labelledby="rename-request-title"
          aria-describedby="rename-request-description"
        >
          <div class="dialog-header">
            <div>
              <h2 id="rename-request-title">
                ${t("requests.tabs.renameTitle")}
              </h2>
              <p id="rename-request-description">
                ${t("requests.tabs.renameDescription")}
              </p>
            </div>
            <button
              type="button"
              class="icon-button"
              data-dialog-close="cancel"
              aria-label="${t("requests.tabs.cancel")}"
              title="${t("requests.tabs.cancel")}"
            >
              ${icon("close", 16)}
            </button>
          </div>
          <label>
            <span>${t("requests.tabs.requestName")}</span>
            <input
              name="requestName"
              required
              maxlength="120"
              value="${tab.name}"
              autocomplete="off"
            />
          </label>
          <div class="dialog-actions">
            <button
              type="button"
              class="button secondary"
              data-dialog-close="cancel"
            >
              ${t("requests.tabs.cancel")}
            </button>
            <button type="submit" class="button primary">
              ${t("requests.tabs.updateName")}
            </button>
          </div>
        </form>
      `,
      { trigger, initialFocus: '[name="requestName"]' },
    );
    requestDialogs.add(dialog);
    const dialogLifecycle = new Lifecycle();
    void dialog.closed.then(() => {
      dialogLifecycle.dispose();
      requestDialogs.delete(dialog);
    });
    const form = requiredElement<HTMLFormElement>(
      dialog.element,
      "[data-rename-form]",
    );
    dialogLifecycle.listen(form, "submit", (event) => {
      event.preventDefault();
      const name = formValue(form, "requestName").trim();
      if (!name) return;
      workspaceStore.getState().updateTab(tab.id, { name, dirty: true });
      dialog.close("rename");
      announce(t("requests.tabs.nameUpdated", { name }));
    });
  };

  const openSaveDialog = async (
    tab: RequestTab,
    draft: RequestDraft,
    forceNew: boolean,
    trigger?: HTMLElement,
  ) => {
    const persistence = getCollectionLibraryPersistenceSnapshot();
    if (
      !persistence.hydrated ||
      persistence.error?.code === "collection_library_conflict"
    ) {
      announce(
        persistence.error?.message ?? t("requests.workbench.saveWriteFailed"),
      );
      return;
    }
    if (tab.savedRequestId && tab.collectionId && !forceNew) {
      await persistSavedRequest(
        tab,
        draft,
        tab.collectionId,
        tab.name,
        false,
      );
      return;
    }
    const collections = collectionLibraryStore.getState().collections;
    const dialog = presentDialog(
      html`
        <form
          class="save-request-dialog"
          data-save-form
          aria-labelledby="save-request-title"
          aria-describedby="save-request-description save-request-help"
        >
          <div class="dialog-header">
            <div>
              <h2 id="save-request-title">
                ${t("requests.workbench.saveDialogTitle")}
              </h2>
              <p id="save-request-description">
                ${t("requests.workbench.saveDialogDescription")}
              </p>
            </div>
            <button
              type="button"
              class="icon-button"
              data-dialog-close="cancel"
              aria-label="${t("requests.workbench.cancelSave")}"
              title="${t("requests.workbench.cancelSave")}"
            >
              ${icon("close", 16)}
            </button>
          </div>
          <label>
            <span>${t("requests.workbench.requestName")}</span>
            <input
              name="requestName"
              required
              maxlength="120"
              value="${tab.name}"
              autocomplete="off"
            />
          </label>
          <label>
            <span>${t("requests.workbench.collection")}</span>
            <select
              name="collectionID"
              aria-describedby="save-request-help save-request-error"
              ${collections.length === 0 ? "disabled" : ""}
            >
              ${collections.length === 0
                ? html`
                    <option value="">
                      ${t("requests.workbench.selectCollection")}
                    </option>
                  `
                : collections.map(
                    (collection) => html`
                      <option
                        value="${collection.id}"
                        ${collection.id === tab.collectionId ? "selected" : ""}
                      >
                        ${collection.name}
                      </option>
                    `,
                  )}
            </select>
          </label>
          <label>
            <span>${t("requests.workbench.newCollectionName")}</span>
            <input
              name="newCollection"
              maxlength="80"
              placeholder="${t("requests.workbench.createNewCollection")}"
              aria-describedby="save-request-help save-request-error"
              autocomplete="off"
            />
          </label>
          <p class="dialog-supporting-text" id="save-request-help">
            ${t("requests.workbench.saveDialogHelp")}
          </p>
          <p
            class="dialog-field-error"
            id="save-request-error"
            role="alert"
            hidden
          >
            ${t("requests.workbench.collectionRequired")}
          </p>
          <div class="dialog-actions">
            <button
              type="button"
              class="button secondary"
              data-dialog-close="cancel"
            >
              ${t("requests.workbench.cancelSave")}
            </button>
            <button type="submit" class="button primary">
              ${t("requests.workbench.confirmSave")}
            </button>
          </div>
        </form>
      `,
      { trigger, initialFocus: '[name="requestName"]' },
    );
    requestDialogs.add(dialog);
    const dialogLifecycle = new Lifecycle();
    void dialog.closed.then(() => {
      dialogLifecycle.dispose();
      requestDialogs.delete(dialog);
    });
    const form = requiredElement<HTMLFormElement>(
      dialog.element,
      "[data-save-form]",
    );
    dialogLifecycle.listen(form, "submit", (event) => {
      event.preventDefault();
      const requestName = formValue(form, "requestName").trim();
      const newCollectionName = formValue(form, "newCollection").trim();
      let collectionID = formValue(form, "collectionID");
      const collectionError = requiredElement<HTMLElement>(
        form,
        "#save-request-error",
      );
      if (newCollectionName) {
        collectionID =
          collectionLibraryStore
            .getState()
            .createCollection(newCollectionName) ?? "";
      }
      if (!requestName) return;
      if (!collectionID) {
        collectionError.hidden = false;
        const collectionInput = form.querySelector<HTMLElement>(
          collections.length === 0
            ? '[name="newCollection"]'
            : '[name="collectionID"]',
        );
        collectionInput?.setAttribute("aria-invalid", "true");
        collectionInput?.focus();
        announce(t("requests.workbench.collectionRequired"));
        return;
      }
      dialog.close("save");
      void persistSavedRequest(
        tab,
        draft,
        collectionID,
        requestName,
        forceNew,
      );
    });
    const clearCollectionError = () => {
      requiredElement<HTMLElement>(
        form,
        "#save-request-error",
      ).hidden = true;
      form
        .querySelectorAll<HTMLElement>('[name="collectionID"], [name="newCollection"]')
        .forEach((element) => element.removeAttribute("aria-invalid"));
    };
    dialogLifecycle.listen(form, "input", clearCollectionError);
    dialogLifecycle.listen(form, "change", clearCollectionError);
  };

  const importOpenAPI = async () => {
    if (importingOpenAPI) return;
    importingOpenAPI = true;
    importedNotice = "";
    render();
    try {
      const result = await backend.importOpenAPI();
      if (result.canceled) return;
      if (result.error) {
        importedNoticeTone = "danger";
        const knownErrors = {
          runtime_unavailable: "requests.openapiImport.runtimeUnavailable",
          file_dialog_failed: "requests.openapiImport.fileDialogFailed",
          invalid_openapi: "requests.openapiImport.invalid",
        } as const;
        const key = knownErrors[
          result.error.code as keyof typeof knownErrors
        ];
        importedNotice = key
          ? t(key)
          : t("requests.openapiImport.failed", {
              details: result.error.message,
            });
      } else {
        workspaceStore.getState().setImportedSpec(result);
        importedNoticeTone = "info";
        importedNotice = t(
          result.endpoints.length === 0
            ? "requests.openapiImport.empty"
            : result.endpoints.length === 1
              ? "requests.openapiImport.loaded.one"
              : "requests.openapiImport.loaded.many",
          { title: result.title, count: result.endpoints.length },
        );
      }
    } catch (error) {
      importedNoticeTone = "danger";
      importedNotice = t("requests.openapiImport.failed", {
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      importingOpenAPI = false;
      render();
    }
  };

  lifecycle.listen(root, "paste", (event) => {
    const target = event.target;
    if (
      !(
        target instanceof HTMLInputElement &&
        target.name === "url" &&
        !target.disabled
      )
    ) {
      return;
    }
    const source = event.clipboardData?.getData("text/plain") ?? "";
    if (!looksLikeCurlBash(source)) return;
    const tab = activeTab();
    if (!tab || tab.running) return;
    event.preventDefault();
    captureDraft();
    flushPendingDrafts();
    try {
      const request = parseCurlBash(source);
      openCurlImportDialog(source, target, undefined, request);
    } catch (error) {
      openCurlImportDialog(
        error instanceof CurlImportError && error.code === "too_large"
          ? ""
          : source,
        target,
        curlImportErrorMessage(error),
      );
    }
  });

  lifecycle.listen(root, "input", (event) => {
    const tab = activeTab();
    if (!tab || tab.running) return;
    const draft = draftFor(tab);
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === "url") {
      if (draft.url !== target.value) {
        draft.url = target.value;
        markDraftFields(tab.id, ["url"]);
      }
    } else if (target instanceof HTMLTextAreaElement && target.name === "body") {
      if (draft.body !== target.value) {
        draft.body = target.value;
        markDraftFields(tab.id, ["body"]);
      }
    } else if (
      target instanceof HTMLInputElement &&
      target.dataset.headerField
    ) {
      const headers = readHeaders(root, draft.headers);
      if (JSON.stringify(headers) !== JSON.stringify(draft.headers)) {
        draft.headers = headers;
        markDraftFields(tab.id, ["headers"]);
      }
    } else if (
      target instanceof HTMLInputElement &&
      target.dataset.queryField
    ) {
      urlValidationTouched.add(tab.id);
      const row = target.closest<HTMLElement>("[data-query-row]");
      if (!row) return;
      const index = Number(row.dataset.queryRow);
      const key =
        row.querySelector<HTMLInputElement>('[data-query-field="key"]')?.value ??
        "";
      const value =
        row.querySelector<HTMLInputElement>('[data-query-field="value"]')
          ?.value ?? "";
      const nextURL = updateURLQueryRow(draft.url, index, { key, value });
      if (nextURL !== draft.url) {
        draft.url = nextURL;
        markDraftFields(tab.id, ["url"]);
      }
    } else if (
      target instanceof HTMLInputElement &&
      target.hasAttribute("data-new-variable-key")
    ) {
      target.removeAttribute("aria-invalid");
      const valueInput = root.querySelector<HTMLInputElement>(
        "[data-new-variable-value]",
      );
      const secret = isSecretKey(target.value.trim());
      if (valueInput) {
        valueInput.type = secret ? "password" : "text";
        valueInput.classList.toggle("secret-value", secret);
        if (secret) {
          valueInput.setAttribute(
            "aria-describedby",
            "request-variables-secret-hint",
          );
        } else {
          valueInput.removeAttribute("aria-describedby");
        }
      }
    }
    syncSendButton(tab, draft);
  });

  lifecycle.listen(root, "change", (event) => {
    const tab = activeTab();
    if (!tab || tab.running) return;
    const draft = draftFor(tab);
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.name === "method") {
      draft.method = target.value as HTTPMethod;
      if (draft.method !== tab.method) {
        updateDraftInStore(tab, draft, ["method"], true);
      }
    } else if (
      target instanceof HTMLInputElement &&
      target.name === "resolveVariables"
    ) {
      const literalValues = !target.checked;
      draft.literalValues = literalValues;
      workspaceStore.getState().updateTab(tab.id, {
        literalValues,
        dirty: true,
        response: undefined,
        error: false,
        userError: undefined,
      });
      announce(
        t(
          literalValues
            ? "requests.editor.variables.literalEnabled"
            : "requests.editor.variables.resolutionEnabled",
        ),
      );
      render();
    } else if (
      target instanceof HTMLInputElement &&
      target.dataset.headerField
    ) {
      const headers = readHeaders(root, draft.headers);
      if (JSON.stringify(headers) !== JSON.stringify(draft.headers)) {
        draft.headers = headers;
        markDraftFields(tab.id, ["headers"]);
      }
    }
  });

  lifecycle.listen(root, "focusout", (event) => {
    const tab = activeTab();
    if (!tab || tab.running) return;
    const draft = draftFor(tab);
    const target = event.target;
    let deriveRequestName = false;
    let validationStateChanged = false;
    if (target instanceof HTMLInputElement && target.name === "url") {
      validationStateChanged = !urlValidationTouched.has(tab.id);
      urlValidationTouched.add(tab.id);
      if (draft.url !== target.value) {
        draft.url = target.value;
        markDraftFields(tab.id, ["url"]);
      }
      deriveRequestName = true;
    } else if (
      target instanceof HTMLTextAreaElement &&
      target.name === "body"
    ) {
      if (draft.body !== target.value) {
        draft.body = target.value;
        markDraftFields(tab.id, ["body"]);
      }
    } else if (
      target instanceof HTMLInputElement &&
      target.dataset.headerField
    ) {
      const headers = readHeaders(root, draft.headers);
      if (JSON.stringify(headers) !== JSON.stringify(draft.headers)) {
        draft.headers = headers;
        markDraftFields(tab.id, ["headers"]);
      }
    } else if (
      target instanceof HTMLInputElement &&
      target.dataset.queryField
    ) {
      urlValidationTouched.add(tab.id);
      const row = target.closest<HTMLElement>("[data-query-row]");
      if (!row) return;
      const index = Number(row.dataset.queryRow);
      const key =
        row.querySelector<HTMLInputElement>('[data-query-field="key"]')?.value ??
        "";
      const value =
        row.querySelector<HTMLInputElement>('[data-query-field="value"]')
          ?.value ?? "";
      draft.url = updateURLQueryRow(draft.url, index, { key, value });
      markDraftFields(tab.id, ["url"]);
    } else if (
      target instanceof HTMLInputElement &&
      target.hasAttribute("data-variable-value")
    ) {
      const row = target.closest<HTMLElement>("[data-variable-row]");
      const key = row?.dataset.variableRow;
      const environmentID = variablesFor(bootstrap).environmentID;
      if (key) {
        const current = variablesFor(bootstrap).values[key];
        if (current !== target.value) {
          suppressStoreRender += 1;
          try {
            workspaceStore
              .getState()
              .setEnvironmentVariable(environmentID, key, target.value);
          } finally {
            suppressStoreRender -= 1;
          }
        }
      }
    }
    let changed = flushPendingDrafts();
    if (deriveRequestName) {
      const currentTab = workspaceStore
        .getState()
        .tabs.find((candidate) => candidate.id === tab.id);
      const nextName = requestNameFromURL(draft.url);
      if (
        currentTab &&
        currentTab.dirty &&
        untitledNames.has(currentTab.name) &&
        nextName &&
        nextName !== currentTab.name
      ) {
        suppressStoreRender += 1;
        try {
          workspaceStore.getState().updateTab(tab.id, { name: nextName });
        } finally {
          suppressStoreRender -= 1;
        }
        changed = true;
      }
    }
    if (changed || editorRenderPending || validationStateChanged) {
      queueRender();
    }
  });

  lifecycle.listen(root, "submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-request-form]")) {
      return;
    }
    event.preventDefault();
    const tab = activeTab();
    if (!tab || tab.running) return;
    urlValidationTouched.add(tab.id);
    captureDraft();
    flushPendingDrafts();
    const currentTab = activeTab();
    if (!currentTab || currentTab.id !== tab.id || currentTab.running) return;
    void sendRequest(currentTab, draftFor(currentTab));
  });

  lifecycle.listen(root, "click", (event) => {
    const target = eventElement<HTMLElement>(event, "[data-action]");
    const action = target?.dataset.action;
    if (!action) return;
    const tab = activeTab();
    if (action === "new-request") {
      captureDraft();
      flushPendingDrafts();
      workspaceStore.getState().openTab({
        name: t("requests.untitled"),
        dirty: true,
      });
      focusSelectorAfterRender('[name="url"]');
    } else if (action === "activate-tab" && target?.dataset.tabId) {
      const targetTabID = target.dataset.tabId;
      captureDraft();
      flushPendingDrafts();
      const targetTab = workspaceStore
        .getState()
        .tabs.find((candidate) => candidate.id === targetTabID);
      if (
        event instanceof MouseEvent &&
        event.detail >= 2 &&
        targetTab &&
        !targetTab.running
      ) {
        openRenameDialog(targetTab, target);
        return;
      }
      if (workspaceStore.getState().activeTabID !== targetTabID) {
        workspaceStore.getState().setActiveTab(targetTabID);
        focusElementAfterRender(`request-tab-${targetTabID}`);
      } else {
        target.focus();
      }
    } else if (action === "close-tab" && target?.dataset.tabId) {
      captureDraft();
      flushPendingDrafts();
      void closeTab(target.dataset.tabId, target);
    } else if (action === "open-tool" && target?.dataset.view) {
      captureDraft();
      flushPendingDrafts();
      workspaceStore
        .getState()
        .setActiveView(target.dataset.view as WorkspaceView);
    } else if (action === "import-curl") {
      captureDraft();
      flushPendingDrafts();
      openCurlImportDialog("", target);
    } else if (action === "import-openapi") {
      void importOpenAPI();
    } else if (action === "dismiss-import-notice") {
      importedNotice = "";
      render();
    } else if (tab) {
      const draft = draftFor(tab);
      if (
        tab.running &&
        action !== "cancel-request" &&
        action !== "copy-response" &&
        action !== "copy-raw-response" &&
        action !== "copy-trace"
      ) {
        return;
      }
      if (action === "cancel-request") {
        void cancelRequest(tab);
      } else if (action === "retry-request") {
        urlValidationTouched.add(tab.id);
        captureDraft();
        flushPendingDrafts();
        const currentTab = activeTab();
        if (currentTab?.id === tab.id && !currentTab.running) {
          void sendRequest(currentTab, draftFor(currentTab));
        }
      } else if (action === "save-request") {
        captureDraft();
        flushPendingDrafts();
        const currentTab = activeTab();
        if (currentTab?.id === tab.id) {
          void openSaveDialog(
            currentTab,
            draftFor(currentTab),
            false,
            target,
          );
        }
      } else if (action === "request-menu") {
        captureDraft();
        flushPendingDrafts();
        const currentTab = activeTab();
        if (!currentTab || currentTab.id !== tab.id) return;
        const currentDraft = draftFor(currentTab);
        openMenu({
          anchor: target,
          restoreFocus: target,
          label: t("requests.workbench.moreSendOptions"),
          entries: [
            {
              label: t("requests.curlImport.actionLong"),
              icon: "terminal",
              action: () => openCurlImportDialog("", target),
            },
            {
              label: t("requests.workbench.copyAsCurl"),
              icon: "copy",
              action: () => copyAsCurl(currentTab, currentDraft),
            },
            {
              label: t("requests.workbench.saveAs"),
              icon: "save",
              action: () => {
                captureDraft();
                flushPendingDrafts();
                const latestTab = activeTab();
                if (!latestTab || latestTab.id !== currentTab.id) return;
                return openSaveDialog(
                  latestTab,
                  draftFor(latestTab),
                  true,
                  target,
                );
              },
            },
          ],
        });
      } else if (action === "add-header") {
        captureDraft();
        draft.headers.push({
          id: crypto.randomUUID(),
          enabled: true,
          key: "",
          value: "",
          description: "",
          source: "Manual",
        });
        updateDraftInStore(tab, draft, ["headers"], true);
        announce(t("requests.editor.headers.added"));
        focusSelectorAfterRender(
          `[data-header-row="${draft.headers.length - 1}"] [data-header-field="key"]`,
        );
      } else if (action === "remove-header") {
        captureDraft();
        const removedIndex = Number(target.dataset.index);
        draft.headers.splice(removedIndex, 1);
        updateDraftInStore(tab, draft, ["headers"], true);
        announce(t("requests.editor.headers.removed"));
        if (draft.headers.length > 0) {
          focusSelectorAfterRender(
            `[data-header-row="${Math.min(
              removedIndex,
              draft.headers.length - 1,
            )}"] [data-header-field="key"]`,
          );
        } else {
          focusSelectorAfterRender('[data-action="add-header"]');
        }
      } else if (action === "format-body" || action === "minify-body") {
        captureDraft();
        try {
          const parsed = JSON.parse(draft.body);
          draft.body =
            action === "format-body"
              ? JSON.stringify(parsed, null, 2)
              : JSON.stringify(parsed);
          updateDraftInStore(tab, draft, ["body"], true);
          announce(
            t(
              action === "format-body"
                ? "requests.editor.body.formatted"
                : "requests.editor.body.minified",
            ),
          );
          focusSelectorAfterRender('[name="body"]');
        } catch {
          announce(
            t(
              action === "format-body"
                ? "requests.editor.body.invalidJSON"
                : "requests.editor.body.minifyFailed",
            ),
          );
        }
      } else if (action === "add-query") {
        captureDraft();
        urlValidationTouched.add(tab.id);
        draft.url = addURLQueryRow(draft.url, { key: "", value: "" });
        updateDraftInStore(tab, draft, ["url"], true);
        announce(t("requests.editor.query.added"));
        const newIndex = parseURLQuery(draft.url).at(-1)?.index;
        if (newIndex !== undefined) {
          focusSelectorAfterRender(
            `[data-query-row="${newIndex}"] [data-query-field="key"]`,
          );
        }
      } else if (action === "remove-query") {
        captureDraft();
        urlValidationTouched.add(tab.id);
        const removedIndex = Number(target.dataset.index);
        draft.url = removeURLQueryRow(
          draft.url,
          removedIndex,
        );
        updateDraftInStore(tab, draft, ["url"], true);
        announce(t("requests.editor.query.removed"));
        const remainingRows = parseURLQuery(draft.url);
        const nextRow =
          remainingRows.find((row) => row.index >= removedIndex) ??
          remainingRows.at(-1);
        if (nextRow) {
          focusSelectorAfterRender(
            `[data-query-row="${nextRow.index}"] [data-query-field="key"]`,
          );
        } else {
          focusSelectorAfterRender('[data-action="add-query"]');
        }
      } else if (action === "add-variable") {
        const keyInput =
          root.querySelector<HTMLInputElement>("[data-new-variable-key]");
        const key = keyInput?.value.trim() ?? "";
        const value =
          root.querySelector<HTMLInputElement>("[data-new-variable-value]")
            ?.value ?? "";
        if (!isValidRequestVariableName(key)) {
          keyInput?.setAttribute("aria-invalid", "true");
          announce(t("requests.editor.variables.invalidName"));
          keyInput?.focus();
          return;
        }
        const variables = variablesFor(bootstrap);
        if (Object.hasOwn(variables.values, key)) {
          keyInput?.setAttribute("aria-invalid", "true");
          announce(t("requests.editor.variables.duplicate"));
          keyInput?.focus();
          return;
        }
        workspaceStore
          .getState()
          .setEnvironmentVariable(variables.environmentID, key, value);
        announce(t("requests.editor.variables.added", { key }));
        focusSelectorAfterRender("[data-new-variable-key]");
      } else if (action === "remove-variable" && target.dataset.key) {
        const key = target.dataset.key;
        workspaceStore
          .getState()
          .removeEnvironmentVariable(
            variablesFor(bootstrap).environmentID,
            key,
          );
        announce(t("requests.editor.variables.overrideRemoved", { key }));
        focusSelectorAfterRender(
          `[data-variable-row="${CSS.escape(key)}"] [data-variable-value]`,
        );
      } else if (
        action === "toggle-variable-secret" &&
        target.dataset.key
      ) {
        const valueInput = target
          .closest<HTMLElement>("[data-variable-row]")
          ?.querySelector<HTMLInputElement>("[data-variable-value]");
        if (!valueInput) return;
        const revealed = valueInput.type === "password";
        valueInput.type = revealed ? "text" : "password";
        target.setAttribute("aria-pressed", String(revealed));
        const label = t(
          revealed
            ? "requests.editor.variables.hideSecret"
            : "requests.editor.variables.showSecret",
          { key: target.dataset.key },
        );
        target.setAttribute("aria-label", label);
        target.setAttribute("title", label);
        const showIcon = target.querySelector<HTMLElement>(
          '[data-secret-icon="show"]',
        );
        const hideIcon = target.querySelector<HTMLElement>(
          '[data-secret-icon="hide"]',
        );
        if (showIcon) showIcon.hidden = revealed;
        if (hideIcon) hideIcon.hidden = !revealed;
        valueInput.focus({ preventScroll: true });
      } else if (action === "copy-response" && tab.response) {
        void copyToClipboard(
          tab.response.body,
          t("requests.response.copied"),
        );
      } else if (action === "copy-raw-response" && tab.response) {
        void copyToClipboard(
          tab.response.rawBody,
          t("requests.response.copied"),
        );
      } else if (action === "copy-trace" && target.dataset.trace) {
        void copyToClipboard(
          target.dataset.trace,
          t("requests.response.traceCopied"),
        );
      }
    }
  });

  lifecycle.listen(root, "click", (event) => {
    const sectionTab = eventElement<HTMLElement>(
      event,
      "[data-request-section]",
    );
    const section = sectionTab?.dataset
      .requestSection as RequestTab["requestSection"] | undefined;
    const tab = activeTab();
    if (section && tab) {
      captureDraft();
      workspaceStore.getState().updateTab(tab.id, { requestSection: section });
      if (sectionTab?.id) focusElementAfterRender(sectionTab.id);
      return;
    }
    const responseTab = eventElement<HTMLElement>(
      event,
      "[data-response-section]",
    );
    const responseSection = responseTab?.dataset
      .responseSection as RequestTab["responseSection"] | undefined;
    if (responseSection && tab) {
      workspaceStore
        .getState()
        .updateTab(tab.id, { responseSection });
      if (responseTab?.id) focusElementAfterRender(responseTab.id);
    }
  });

  const clearTabDragState = () => {
    draggedTabID = undefined;
    for (const tab of root.querySelectorAll<HTMLElement>("[data-request-tab]")) {
      tab.classList.remove("dragging", "drag-target");
    }
  };

  lifecycle.listen(root, "dragstart", (event) => {
    const tabElement = eventElement<HTMLElement>(event, "[data-request-tab]");
    const tabID = tabElement?.dataset.requestTab;
    const tab = workspaceStore
      .getState()
      .tabs.find((candidate) => candidate.id === tabID);
    if (!tabElement || !tabID || !tab || tab.pinned || tab.running) {
      event.preventDefault();
      return;
    }
    draggedTabID = tabID;
    tabElement.classList.add("dragging");
    event.dataTransfer?.setData("text/plain", tabID);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });

  lifecycle.listen(root, "dragover", (event) => {
    const target = eventElement<HTMLElement>(event, "[data-request-tab]");
    if (!draggedTabID || !target?.dataset.requestTab) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    for (const tab of root.querySelectorAll<HTMLElement>("[data-request-tab]")) {
      tab.classList.toggle("drag-target", tab === target);
    }
  });

  lifecycle.listen(root, "drop", (event) => {
    const target = eventElement<HTMLElement>(event, "[data-request-tab]");
    const targetID = target?.dataset.requestTab;
    const sourceID =
      draggedTabID || event.dataTransfer?.getData("text/plain") || undefined;
    if (!sourceID || !targetID) return;
    event.preventDefault();
    captureDraft();
    flushPendingDrafts();
    workspaceStore.getState().reorderTab(sourceID, targetID);
    clearTabDragState();
    focusElementAfterRender(`request-tab-${sourceID}`);
  });
  lifecycle.listen(root, "dragend", clearTabDragState);

  lifecycle.listen(root, "pointerdown", (event) => {
    if (event.button !== 0) return;
    const separator = eventElement<HTMLElement>(
      event,
      "[data-response-resizer]",
    );
    if (!separator) return;
    const workbench = separator.closest<HTMLElement>(".request-workbench");
    if (!workbench) return;
    const placement =
      separator.dataset.responsePlacement === "horizontal"
        ? "horizontal"
        : "vertical";
    const bounds = workbench.getBoundingClientRect();
    const containerExtent =
      placement === "vertical" ? bounds.height : bounds.width;
    if (containerExtent <= 0) return;
    event.preventDefault();
    stopResponseResize();
    separator.focus({ preventScroll: true });
    responseResize = {
      placement,
      startCoordinate:
        placement === "vertical" ? event.clientY : event.clientX,
      startSize: clampResponseSize(workspaceStore.getState().responseSize),
      containerExtent,
    };
    document.body.classList.add(
      "response-resizing",
      placement === "vertical"
        ? "response-resizing-row"
        : "response-resizing-column",
    );
  });

  lifecycle.listen(window, "pointermove", (event) => {
    if (!responseResize) return;
    event.preventDefault();
    const coordinate =
      responseResize.placement === "vertical" ? event.clientY : event.clientX;
    applyResponseSize(
      responseSizeFromPointer(
        responseResize.startSize,
        responseResize.startCoordinate,
        coordinate,
        responseResize.containerExtent,
      ),
    );
  });
  lifecycle.listen(window, "pointerup", stopResponseResize);
  lifecycle.listen(window, "pointercancel", stopResponseResize);
  lifecycle.listen(window, "blur", stopResponseResize);

  lifecycle.listen(root, "keydown", (event) => {
    if (event.isComposing) return;
    const keyTarget = event.target;
    if (
      event.key === "Enter" &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      keyTarget instanceof HTMLInputElement &&
      (keyTarget.hasAttribute("data-new-variable-key") ||
        keyTarget.hasAttribute("data-new-variable-value"))
    ) {
      event.preventDefault();
      root.querySelector<HTMLButtonElement>('[data-action="add-variable"]')
        ?.click();
      return;
    }

    const command = event.metaKey || event.ctrlKey;
    if (command && event.key === "Enter") {
      const tab = activeTab();
      if (!tab || tab.running) return;
      event.preventDefault();
      urlValidationTouched.add(tab.id);
      captureDraft();
      flushPendingDrafts();
      const currentTab = activeTab();
      if (currentTab?.id === tab.id && !currentTab.running) {
        void sendRequest(currentTab, draftFor(currentTab));
      }
      return;
    }

    const separator = eventElement<HTMLElement>(
      event,
      "[data-response-resizer]",
    );
    if (separator) {
      const placement =
        separator.dataset.responsePlacement === "horizontal"
          ? "horizontal"
          : "vertical";
      const nextSize = responseSizeFromKey(
        workspaceStore.getState().responseSize,
        placement,
        event.key,
      );
      if (nextSize === undefined) return;
      event.preventDefault();
      applyResponseSize(nextSize);
      return;
    }

    const requestTab = eventElement<HTMLButtonElement>(
      event,
      "[data-request-tab-button]",
    );
    if (requestTab) {
      const buttons = [
        ...root.querySelectorAll<HTMLButtonElement>(
          "[data-request-tab-button]",
        ),
      ];
      const currentIndex = buttons.indexOf(requestTab);
      const sourceID = requestTab.dataset.tabId;
      if (
        event.altKey &&
        event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        const source = workspaceStore
          .getState()
          .tabs.find((tab) => tab.id === sourceID);
        const targetIndex =
          currentIndex + (event.key === "ArrowLeft" ? -1 : 1);
        const targetID = buttons[targetIndex]?.dataset.tabId;
        if (source && !source.pinned && !source.running && sourceID && targetID) {
          captureDraft();
          flushPendingDrafts();
          workspaceStore.getState().reorderTab(sourceID, targetID);
          focusElementAfterRender(`request-tab-${sourceID}`);
        }
        return;
      }
      if (event.key === "Delete" && sourceID) {
        const source = workspaceStore
          .getState()
          .tabs.find((tab) => tab.id === sourceID);
        if (!source || source.pinned || source.running) return;
        event.preventDefault();
        void closeTab(sourceID, requestTab);
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const nextIndex = horizontalTabIndexFromKey(
        currentIndex,
        buttons.length,
        event.key,
      );
      const targetID =
        nextIndex === undefined ? undefined : buttons[nextIndex]?.dataset.tabId;
      if (!targetID) return;
      event.preventDefault();
      captureDraft();
      flushPendingDrafts();
      workspaceStore.getState().setActiveTab(targetID);
      focusElementAfterRender(`request-tab-${targetID}`);
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const requestSection = eventElement<HTMLButtonElement>(
      event,
      "[data-request-section]",
    );
    if (requestSection) {
      const tabs = [
        ...root.querySelectorAll<HTMLButtonElement>("[data-request-section]"),
      ];
      const nextIndex = horizontalTabIndexFromKey(
        tabs.indexOf(requestSection),
        tabs.length,
        event.key,
      );
      const target = nextIndex === undefined ? undefined : tabs[nextIndex];
      const section = target?.dataset
        .requestSection as RequestTab["requestSection"] | undefined;
      const tab = activeTab();
      if (!target || !section || !tab) return;
      event.preventDefault();
      captureDraft();
      workspaceStore.getState().updateTab(tab.id, { requestSection: section });
      focusElementAfterRender(target.id);
      return;
    }

    const responseSection = eventElement<HTMLButtonElement>(
      event,
      "[data-response-section]",
    );
    if (!responseSection) return;
    const tabs = [
      ...root.querySelectorAll<HTMLButtonElement>("[data-response-section]"),
    ];
    const nextIndex = horizontalTabIndexFromKey(
      tabs.indexOf(responseSection),
      tabs.length,
      event.key,
    );
    const target = nextIndex === undefined ? undefined : tabs[nextIndex];
    const section = target?.dataset
      .responseSection as RequestTab["responseSection"] | undefined;
    const tab = activeTab();
    if (!target || !section || !tab) return;
    event.preventDefault();
    workspaceStore.getState().updateTab(tab.id, { responseSection: section });
    focusElementAfterRender(target.id);
  });

  lifecycle.listen(root, "contextmenu", (event) => {
    const tabElement = eventElement<HTMLElement>(event, "[data-request-tab]");
    if (!tabElement?.dataset.requestTab) return;
    event.preventDefault();
    const tabID = tabElement.dataset.requestTab;
    const tab = workspaceStore
      .getState()
      .tabs.find((candidate) => candidate.id === tabID);
    if (!tab) return;
    const tabButton = tabElement.querySelector<HTMLButtonElement>(
      "[data-request-tab-button]",
    ) ?? undefined;
    openMenu({
      point: { x: event.clientX, y: event.clientY },
      restoreFocus: tabButton,
      label: tab.name,
      entries: [
        {
          label: t("requests.tabs.rename"),
          disabled: tab.running,
          action: () => openRenameDialog(tab, tabButton),
        },
        {
          label: tab.pinned
            ? t("requests.tabs.unpin")
            : t("requests.tabs.pin"),
          icon: "pin",
          disabled: tab.running,
          action: () => workspaceStore.getState().togglePin(tabID),
        },
        {
          label: t("requests.tabs.duplicate"),
          icon: "copy",
          disabled: tab.running,
          action: () =>
            workspaceStore
              .getState()
              .duplicateTab(
                tabID,
                t("requests.tabs.duplicateName", { name: tab.name }),
              ),
        },
        { kind: "separator" },
        {
          label: t("requests.tabs.closeOtherClean"),
          action: () => workspaceStore.getState().closeOtherTabs(tabID),
        },
        {
          label: t("requests.tabs.closeCleanRight"),
          action: () => workspaceStore.getState().closeTabsToRight(tabID),
        },
        {
          label: t("requests.tabs.close"),
          icon: "close",
          danger: true,
          disabled: tab.running || tab.pinned,
          action: () => closeTab(tabID, tabButton),
        },
      ],
    });
  });

  lifecycle.listen(window, "keydown", (event) => {
    const command = event.metaKey || event.ctrlKey;
    if (!command || event.key.toLowerCase() !== "s") return;
    const tab = activeTab();
    if (!tab || tab.running) return;
    event.preventDefault();
    captureDraft();
    flushPendingDrafts();
    const currentTab = activeTab();
    if (currentTab?.id === tab.id) {
      const trigger =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined;
      void openSaveDialog(
        currentTab,
        draftFor(currentTab),
        false,
        trigger,
      );
    }
  });

  lifecycle.listen(window, "pagehide", () => {
    captureDraft();
    flushPendingDrafts();
  });
  lifecycle.listen(document, "visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    captureDraft();
    flushPendingDrafts();
  });

  lifecycle.add(
    workspaceStore.subscribe(() => {
      if (rendering || suppressStoreRender > 0) return;
      render();
    }),
  );
  lifecycle.add(collectionLibraryStore.subscribe(() => render()));
  lifecycle.add(subscribeCollectionLibraryPersistence(() => render()));
  if (compactResponseMedia) {
    const updateResponsePlacement = () => {
      stopResponseResize();
      render();
    };
    compactResponseMedia.addEventListener("change", updateResponsePlacement);
    lifecycle.add(() =>
      compactResponseMedia.removeEventListener(
        "change",
        updateResponsePlacement,
      ),
    );
  }
  lifecycle.add(
    subscribeLocale(() => {
      captureDraft();
      importedNotice = "";
      render();
    }),
  );
  render();

  return {
    dispose() {
      captureDraft();
      flushPendingDrafts();
      disposed = true;
      if (queuedRenderTimer !== undefined) {
        window.clearTimeout(queuedRenderTimer);
        queuedRenderTimer = undefined;
      }
      lifecycle.dispose();
      root.replaceChildren();
    },
  };
}
