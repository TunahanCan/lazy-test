import { applicationCommands } from "../../app/commands.js";
import {
  Lifecycle,
  announce,
  eventElement,
  formValue,
  html,
  requiredElement,
  setHTML,
  type Disposable,
} from "../../core/dom.js";
import {
  FEEDBACK_TONE,
  notify,
} from "../../core/feedback.js";
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
import { methodAllowsBody } from "../../lib/http.js";
import { requestURLMatchesOpenAPIPath } from "../../lib/openapi.js";
import {
  missingVariables,
  REQUEST_URL_VALIDATION_CODE,
  requestURLValidationCode,
  resolveVariableReferences,
  type RequestURLValidationCode,
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
import {
  workspaceStore,
  type WorkspaceState,
} from "../../stores/workspace.js";
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
import {
  requestTabsMarkup,
  welcomeMarkup,
  workbenchMarkup,
} from "./presentation.js";
import { workspaceDefinitions } from "../workspaces.js";

const untitledNames = new Set(
  supportedLocales.map((locale) => messages[locale]["requests.untitled"]),
);

const REQUEST_FEEDBACK_DURATION_MS = {
  ACTION_REQUIRED: 7_000,
} as const;

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
  const code = requestURLValidationCode(value);
  if (!code) return;
  const keys: Record<
    RequestURLValidationCode,
    Parameters<typeof t>[0]
  > = {
    [REQUEST_URL_VALIDATION_CODE.REQUIRED]:
      "requests.validation.urlRequired",
    [REQUEST_URL_VALIDATION_CODE.WHITESPACE]:
      "requests.validation.urlWhitespace",
    [REQUEST_URL_VALIDATION_CODE.SCHEME]:
      "requests.validation.urlScheme",
    [REQUEST_URL_VALIDATION_CODE.HTTP_ONLY]:
      "requests.validation.httpOnly",
    [REQUEST_URL_VALIDATION_CODE.USER_INFO]:
      "requests.validation.userInfo",
    [REQUEST_URL_VALIDATION_CODE.FRAGMENT]:
      "requests.validation.fragment",
    [REQUEST_URL_VALIDATION_CODE.INVALID]:
      "requests.validation.invalidURL",
  };
  return t(keys[code]);
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

function requestPresentationChanged(
  state: WorkspaceState,
  previous: WorkspaceState,
): boolean {
  return (
    state.tabs !== previous.tabs ||
    state.activeTabID !== previous.activeTabID ||
    state.activeEnvironmentID !== previous.activeEnvironmentID ||
    state.environmentVariables !== previous.environmentVariables ||
    state.responseSize !== previous.responseSize ||
    state.responsePlacement !== previous.responsePlacement
  );
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
  const requestOperationTokens = new Map<string, symbol>();
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
  let submitGuard = false;
  let submitGuardTimer: number | undefined;
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
  let newVariableDraft = {
    environmentID: variablesFor(bootstrap).environmentID,
    key: "",
    value: "",
  };

  lifecycle.add(() => {
    for (const dialog of requestDialogs) dialog.dispose();
    requestDialogs.clear();
  });

  const activeTab = (): RequestTab | undefined => {
    const state = workspaceStore.getState();
    return state.tabs.find((tab) => tab.id === state.activeTabID);
  };

  const canMutateCollectionLibrary = (): boolean => {
    const persistence = getCollectionLibraryPersistenceSnapshot();
    if (
      persistence.hydrated &&
      persistence.error?.code !== "collection_library_conflict"
    ) {
      return true;
    }
    notify({
      message:
        persistence.error?.message ??
        t("requests.workbench.saveWriteFailed"),
      tone: FEEDBACK_TONE.ERROR,
      durationMs: REQUEST_FEEDBACK_DURATION_MS.ACTION_REQUIRED,
    });
    return false;
  };

  const beginRequestOperation = (requestID: string): symbol => {
    const token = Symbol(requestID);
    requestOperationTokens.set(requestID, token);
    return token;
  };

  const invalidateRequestOperation = (requestID: string): void => {
    requestOperationTokens.set(requestID, Symbol(requestID));
  };

  const retireRequestRuntime = (requestID: string): void => {
    // Tokens are unique for the lifetime of this workspace. Deleting a closed
    // tab's token invalidates its pending work, while a deterministic tab ID
    // can safely be opened again with a different token.
    requestOperationTokens.delete(requestID);
    drafts.delete(requestID);
    pendingDraftFields.delete(requestID);
    urlValidationTouched.delete(requestID);
    cancelingRequests.delete(requestID);
  };

  const captureVisibleVariableValues = (): boolean => {
    const variables = variablesFor(bootstrap);
    const updates = [
      ...root.querySelectorAll<HTMLInputElement>("[data-variable-value]"),
    ].flatMap((input) => {
      const key = input.closest<HTMLElement>("[data-variable-row]")?.dataset
        .variableRow;
      return key && variables.values[key] !== input.value
        ? [{ key, value: input.value }]
        : [];
    });
    if (updates.length === 0) return false;
    suppressStoreRender += 1;
    try {
      for (const { key, value } of updates) {
        workspaceStore
          .getState()
          .setEnvironmentVariable(variables.environmentID, key, value);
      }
    } finally {
      suppressStoreRender -= 1;
    }
    return true;
  };

  const effectiveResponsePlacement = (): ResponseSplitPlacement =>
    workspaceStore.getState().responsePlacement === "horizontal" &&
    !compactResponseMedia?.matches
      ? "horizontal"
      : "vertical";

  const focusSelectorFor = (element: HTMLElement): string | undefined => {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const contextualSelector = (
      rowAttribute: string,
      fieldAttribute: string,
    ): string | undefined => {
      const row = element.closest<HTMLElement>(`[${rowAttribute}]`);
      const rowValue = row?.getAttribute(rowAttribute);
      const fieldValue = element.getAttribute(fieldAttribute);
      return rowValue !== null &&
        rowValue !== undefined &&
        fieldValue !== null
        ? `[${rowAttribute}="${CSS.escape(rowValue)}"] [${fieldAttribute}="${CSS.escape(fieldValue)}"]`
        : undefined;
    };
    for (const [rowAttribute, fieldAttribute] of [
      ["data-header-row", "data-header-field"],
      ["data-query-row", "data-query-field"],
    ] as const) {
      const selector = contextualSelector(rowAttribute, fieldAttribute);
      if (selector) return selector;
    }
    const variableRow = element.closest<HTMLElement>("[data-variable-row]");
    const variableKey = variableRow?.dataset.variableRow;
    if (variableKey) {
      if (element.hasAttribute("data-variable-value")) {
        return `[data-variable-row="${CSS.escape(variableKey)}"] [data-variable-value]`;
      }
      const action = element.dataset.action;
      if (action) {
        return `[data-variable-row="${CSS.escape(variableKey)}"] [data-action="${CSS.escape(action)}"]`;
      }
    }
    if (element.hasAttribute("data-new-variable-key")) {
      return "[data-new-variable-key]";
    }
    if (element.hasAttribute("data-new-variable-value")) {
      return "[data-new-variable-value]";
    }
    if (
      element instanceof HTMLButtonElement &&
      element.matches('.send-button[type="submit"]')
    ) {
      return '[data-request-form] .send-button[type="submit"]';
    }
    const name = element.getAttribute("name");
    if (name) return `[name="${CSS.escape(name)}"]`;
    for (const attribute of [
      "data-request-section",
      "data-response-tab",
      "data-response-view",
      "data-action",
    ]) {
      const value = element.getAttribute(attribute);
      if (value !== null) {
        return `[${attribute}="${CSS.escape(value)}"]`;
      }
    }
    return undefined;
  };

  const captureFocusedControl = ():
    | {
        selector: string;
        selection?: {
          start: number | null;
          end: number | null;
          direction?: "forward" | "backward" | "none" | null;
        };
      }
    | undefined => {
    const active =
      document.activeElement instanceof HTMLElement &&
      root.contains(document.activeElement)
        ? document.activeElement
        : undefined;
    if (!active) return undefined;
    const selector = focusSelectorFor(active);
    if (!selector) return undefined;
    const selection =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
        ? {
            start: active.selectionStart,
            end: active.selectionEnd,
            direction: active.selectionDirection,
          }
        : undefined;
    return { selector, selection };
  };

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
    if (fields.includes("method") || fields.includes("url")) {
      // Invalidate before the buffered store flush. A validator promise can
      // settle in the same task as an input event, well before the 120 ms
      // draft timer commits the operation change.
      invalidateRequestOperation(tabID);
    }
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
    captureVisibleVariableValues();
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
    const focusedControl = captureFocusedControl();
    try {
      flushPendingDrafts();
      const state = workspaceStore.getState();
      const tab = state.tabs.find((candidate) => candidate.id === state.activeTabID);
      const draft = tab ? draftFor(tab) : undefined;
      const variables = variablesFor(bootstrap);
      const collectionPersistence =
        getCollectionLibraryPersistenceSnapshot();
      const collectionSaveDisabled =
        !collectionPersistence.hydrated ||
        collectionPersistence.error?.code ===
          "collection_library_conflict";
      if (variables.environmentID !== newVariableDraft.environmentID) {
        newVariableDraft = {
          environmentID: variables.environmentID,
          key: "",
          value: "",
        };
      }
      const variableResolution =
        tab && draft
          ? requestVariableResolution(tab, draft, bootstrap)
          : undefined;
      const validationError =
        variableResolution && variableResolution.unresolved.length === 0
          ? localizedRequestURLValidationMessage(
              variableResolution.resolvedURL,
            )
          : undefined;
      const welcomeTools = workspaceDefinitions
        .filter((definition) => definition.id !== "requests")
        .map((definition) => ({
          view: definition.id,
          label: t(definition.labelKey),
          icon: definition.icon,
        }));
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
          ${tab && draft && variableResolution
            ? workbenchMarkup({
                tab,
                draft,
                variables,
                responsePlacement: effectiveResponsePlacement(),
                responseSize: state.responseSize,
                canceling: cancelingRequests.has(tab.id),
                collectionSaveDisabled,
                unresolvedVariables: variableResolution.unresolved,
                validationError,
                showURLValidation: urlValidationTouched.has(tab.id),
              })
            : welcomeMarkup(importingOpenAPI, welcomeTools)}
        `,
      );
      const newVariableKey =
        root.querySelector<HTMLInputElement>("[data-new-variable-key]");
      const newVariableValue =
        root.querySelector<HTMLInputElement>("[data-new-variable-value]");
      if (newVariableKey) newVariableKey.value = newVariableDraft.key;
      if (newVariableValue) {
        newVariableValue.value = newVariableDraft.value;
        const secret = isSecretKey(newVariableDraft.key.trim());
        newVariableValue.type = secret ? "password" : "text";
        newVariableValue.classList.toggle("secret-value", secret);
        if (secret) {
          newVariableValue.setAttribute(
            "aria-describedby",
            "request-variables-secret-hint",
          );
        } else {
          newVariableValue.removeAttribute("aria-describedby");
        }
      }
      if (focusedControl) {
        const replacement = root.querySelector<HTMLElement>(
          focusedControl.selector,
        );
        if (replacement && !replacement.matches(":disabled")) {
          replacement.focus({ preventScroll: true });
          if (
            focusedControl.selection &&
            (replacement instanceof HTMLInputElement ||
              replacement instanceof HTMLTextAreaElement) &&
            focusedControl.selection.start !== null &&
            focusedControl.selection.end !== null
          ) {
            replacement.setSelectionRange(
              focusedControl.selection.start,
              focusedControl.selection.end,
              focusedControl.selection.direction ?? undefined,
            );
          }
        }
      }
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

  const focusSelectorAfterRender = (...selectors: string[]) => {
    window.requestAnimationFrame(() => {
      if (disposed) return;
      for (const selector of selectors) {
        const target = root.querySelector<HTMLElement>(selector);
        if (target && !target.matches(":disabled")) {
          target.focus();
          return;
        }
      }
    });
  };

  const focusRequestSendIfFocusWasLost = (requestID: string): void => {
    window.requestAnimationFrame(() => {
      if (
        disposed ||
        document.activeElement !== document.body ||
        workspaceStore.getState().activeTabID !== requestID
      ) {
        return;
      }
      root
        .querySelector<HTMLButtonElement>(
          '[data-request-form] .send-button[type="submit"]',
        )
        ?.focus({ preventScroll: true });
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
    const operationToken = beginRequestOperation(requestTab.id);
    const operationIsCurrent = () =>
      requestOperationTokens.get(requestTab.id) === operationToken;
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
    focusSelectorAfterRender('[data-action="cancel-request"]');
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
      if (disposed || !operationIsCurrent()) return;
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
            workspaceStore.getState().updateTab(requestTab.id, {
              running: false,
              error: false,
              userError: undefined,
              response,
            });
            focusRequestSendIfFocusWasLost(requestTab.id);
            try {
              const contract = await backend.validateOpenAPIResponse({
                specId: requestTab.openApi.specId,
                method: sent.method,
                path: requestTab.openApi.path,
                statusCode: response.statusCode,
                contentType: response.contentType,
                body: response.rawBody,
                bodyEncoding: response.bodyEncoding ?? "utf8",
              });
              if (disposed || !operationIsCurrent()) return;
              response = { ...response, contract };
            } catch (error) {
              if (disposed || !operationIsCurrent()) return;
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
        if (!operationIsCurrent()) return;
        workspaceStore.getState().updateTab(requestTab.id, {
          running: false,
          error: false,
          userError: undefined,
          response,
        });
        focusRequestSendIfFocusWasLost(requestTab.id);
      } else {
        if (!operationIsCurrent()) return;
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
        focusRequestSendIfFocusWasLost(requestTab.id);
      }
    } catch (error) {
      if (!operationIsCurrent()) return;
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
      focusRequestSendIfFocusWasLost(requestTab.id);
    } finally {
      if (
        operationIsCurrent() &&
        cancelingRequests.delete(requestTab.id) &&
        !disposed
      ) {
        queueRender();
      }
    }
  };

  const cancelRequest = async (tab: RequestTab) => {
    if (cancelingRequests.has(tab.id)) return;
    const operationToken = requestOperationTokens.get(tab.id);
    const cancellationIsCurrent = (): boolean => {
      const current = workspaceStore
        .getState()
        .tabs.find((candidate) => candidate.id === tab.id);
      return (
        current?.running === true &&
        requestOperationTokens.get(tab.id) === operationToken
      );
    };
    cancelingRequests.add(tab.id);
    render();
    try {
      const canceled = await backend.cancelRequest(tab.id);
      if (disposed || !cancellationIsCurrent()) return;
      if (!canceled) {
        cancelingRequests.delete(tab.id);
        invalidateRequestOperation(tab.id);
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
        focusRequestSendIfFocusWasLost(tab.id);
      }
    } catch (error) {
      if (disposed || !cancellationIsCurrent()) return;
      cancelingRequests.delete(tab.id);
      invalidateRequestOperation(tab.id);
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
      focusRequestSendIfFocusWasLost(tab.id);
    }
  };

  lifecycle.add(
    applicationCommands.registerActiveRequestCanceler((requestID) => {
      const tab = workspaceStore
        .getState()
        .tabs.find((candidate) => candidate.id === requestID);
      if (tab?.running) void cancelRequest(tab);
    }),
  );

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
    notify({
      message: copied ? successMessage : t("common.copyFailed"),
      tone: copied ? FEEDBACK_TONE.SUCCESS : FEEDBACK_TONE.ERROR,
    });
  };

  const copyAsCurl = (tab: RequestTab, draft: RequestDraft) => {
    const resolution = requestVariableResolution(tab, draft, bootstrap);
    const unresolved = resolution.unresolved;
    if (unresolved.length > 0) {
      notify({
        message: t("requests.workbench.missingVariables", {
          variables: unresolved.join(", "),
        }),
        tone: FEEDBACK_TONE.WARNING,
        durationMs: REQUEST_FEEDBACK_DURATION_MS.ACTION_REQUIRED,
      });
      return;
    }
    const urlError = localizedRequestURLValidationMessage(
      resolution.resolvedURL,
    );
    if (urlError) {
      notify({
        message: urlError,
        tone: FEEDBACK_TONE.WARNING,
        durationMs: REQUEST_FEEDBACK_DURATION_MS.ACTION_REQUIRED,
      });
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
    const collectionName =
      library.collections.find((collection) => collection.id === collectionID)
        ?.name ?? t("requests.workbench.collection");
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
      notify({
        message: t("requests.workbench.saveWriteFailed"),
        tone: FEEDBACK_TONE.ERROR,
        durationMs: REQUEST_FEEDBACK_DURATION_MS.ACTION_REQUIRED,
      });
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
      notify({
        message: t("requests.workbench.savedTo", {
          collection: collectionName,
        }),
        tone: FEEDBACK_TONE.SUCCESS,
      });
    } else if (!durable) {
      notify({
        message: t("requests.workbench.saveWriteFailed"),
        tone: FEEDBACK_TONE.ERROR,
        durationMs: REQUEST_FEEDBACK_DURATION_MS.ACTION_REQUIRED,
      });
    } else if (secretsRemoved) {
      notify({
        message: t("requests.workbench.secretHeadersNotSaved"),
        tone: FEEDBACK_TONE.WARNING,
        durationMs: REQUEST_FEEDBACK_DURATION_MS.ACTION_REQUIRED,
      });
    }
    return true;
  };

  const openRenameDialog = (
    tab: RequestTab,
    trigger?: HTMLElement,
  ) => {
    if (tab.running) {
      notify({
        message: t("requests.tabs.cancelBeforeClose"),
        tone: FEEDBACK_TONE.WARNING,
      });
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
    if (!canMutateCollectionLibrary()) return;
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
    const hasCollections = collections.length > 0;
    const collectionRequiredMessage = t(
      hasCollections
        ? "requests.workbench.collectionRequired"
        : "requests.workbench.firstCollectionRequired",
    );
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
          ${hasCollections
            ? html`
                <label>
                  <span>${t("requests.workbench.collection")}</span>
                  <select
                    name="collectionID"
                    aria-describedby="save-request-help save-request-error"
                  >
                    ${collections.map(
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
              `
            : ""}
          <label>
            <span>
              ${t(
                hasCollections
                  ? "requests.workbench.newCollectionName"
                  : "requests.workbench.firstCollectionName",
              )}
            </span>
            <input
              name="newCollection"
              maxlength="80"
              placeholder="${t(
                hasCollections
                  ? "requests.workbench.createNewCollection"
                  : "requests.workbench.createFirstCollection",
              )}"
              aria-describedby="save-request-help save-request-error"
              autocomplete="off"
            />
          </label>
          <p class="dialog-supporting-text" id="save-request-help">
            ${t(
              hasCollections
                ? "requests.workbench.saveDialogHelp"
                : "requests.workbench.saveDialogFirstCollectionHelp",
            )}
          </p>
          <p
            class="dialog-field-error"
            id="save-request-error"
            role="alert"
            hidden
          >
            ${collectionRequiredMessage}
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
      if (!canMutateCollectionLibrary()) {
        dialog.close("conflict");
        return;
      }
      const requestName = formValue(form, "requestName").trim();
      const newCollectionName = formValue(form, "newCollection").trim();
      let collectionID = formValue(form, "collectionID");
      const collectionError = requiredElement<HTMLElement>(
        form,
        "#save-request-error",
      );
      if (!requestName) return;
      if (newCollectionName) {
        collectionID =
          collectionLibraryStore
            .getState()
            .createCollection(newCollectionName) ?? "";
      }
      if (!collectionID) {
        collectionError.hidden = false;
        const collectionInput = form.querySelector<HTMLElement>(
          !hasCollections
            ? '[name="newCollection"]'
            : '[name="collectionID"]',
        );
        collectionInput?.setAttribute("aria-invalid", "true");
        collectionInput?.focus();
        announce(collectionRequiredMessage);
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
      const result = await applicationCommands.importOpenAPI();
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
    if (target instanceof HTMLSelectElement && target.name === "method") {
      if (draft.method !== target.value) {
        draft.method = target.value as HTTPMethod;
        markDraftFields(tab.id, ["method"]);
      }
    } else if (target instanceof HTMLInputElement && target.name === "url") {
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
      target.hasAttribute("data-variable-value")
    ) {
      const key = target.closest<HTMLElement>("[data-variable-row]")?.dataset
        .variableRow;
      const variables = variablesFor(bootstrap);
      if (key && variables.values[key] !== target.value) {
        suppressStoreRender += 1;
        try {
          workspaceStore
            .getState()
            .setEnvironmentVariable(
              variables.environmentID,
              key,
              target.value,
            );
        } finally {
          suppressStoreRender -= 1;
        }
      }
    } else if (
      target instanceof HTMLInputElement &&
      target.hasAttribute("data-new-variable-key")
    ) {
      newVariableDraft.key = target.value;
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
    } else if (
      target instanceof HTMLInputElement &&
      target.hasAttribute("data-new-variable-value")
    ) {
      newVariableDraft.value = target.value;
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
    if (submitGuard) return;
    // A modified Enter can produce both the explicit requestSubmit() below and
    // an implicit form submit in some WebView/browser event pipelines. Keep
    // one user activation to one request even when the native bridge resolves
    // before the implicit default action is delivered.
    submitGuard = true;
    if (submitGuardTimer !== undefined) {
      window.clearTimeout(submitGuardTimer);
    }
    submitGuardTimer = window.setTimeout(() => {
      submitGuard = false;
      submitGuardTimer = undefined;
    }, 0);
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
      applicationCommands.openRequestDraft({
        name: t("requests.untitled"),
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
              action: () => {
                copyAsCurl(currentTab, currentDraft);
                focusSelectorAfterRender('[data-action="request-menu"]');
              },
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
          notify({
            message: t(
              action === "format-body"
                ? "requests.editor.body.formatted"
                : "requests.editor.body.minified",
            ),
            tone: FEEDBACK_TONE.SUCCESS,
          });
          focusSelectorAfterRender('[name="body"]');
        } catch {
          notify({
            message: t(
              action === "format-body"
                ? "requests.editor.body.invalidJSON"
                : "requests.editor.body.minifyFailed",
            ),
            tone: FEEDBACK_TONE.ERROR,
          });
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
          notify({
            message: t("requests.editor.variables.invalidName"),
            tone: FEEDBACK_TONE.WARNING,
          });
          keyInput?.focus();
          return;
        }
        const variables = variablesFor(bootstrap);
        if (Object.hasOwn(variables.values, key)) {
          keyInput?.setAttribute("aria-invalid", "true");
          notify({
            message: t("requests.editor.variables.duplicate"),
            tone: FEEDBACK_TONE.WARNING,
          });
          keyInput?.focus();
          return;
        }
        newVariableDraft = {
          environmentID: variables.environmentID,
          key: "",
          value: "",
        };
        workspaceStore
          .getState()
          .setEnvironmentVariable(variables.environmentID, key, value);
        notify({
          message: t("requests.editor.variables.added", { key }),
          tone: FEEDBACK_TONE.SUCCESS,
        });
        focusSelectorAfterRender("[data-new-variable-key]");
      } else if (action === "remove-variable" && target.dataset.key) {
        const key = target.dataset.key;
        const keys = Object.keys(variablesFor(bootstrap).values);
        const removedIndex = keys.indexOf(key);
        const fallbackKey =
          keys[removedIndex + 1] ?? keys[removedIndex - 1];
        workspaceStore
          .getState()
          .removeEnvironmentVariable(
            variablesFor(bootstrap).environmentID,
            key,
          );
        notify(t("requests.editor.variables.overrideRemoved", { key }));
        focusSelectorAfterRender(
          `[data-variable-row="${CSS.escape(key)}"] [data-variable-value]`,
          ...(fallbackKey
            ? [
                `[data-variable-row="${CSS.escape(fallbackKey)}"] [data-variable-value]`,
              ]
            : []),
          "[data-new-variable-key]",
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
      // Keep pointer and keyboard sends on the same form-submit path. Calling
      // sendRequest here as well as handling the browser's implicit submit can
      // dispatch twice when a fast bridge response clears `running` before the
      // default action is processed.
      root
        .querySelector<HTMLFormElement>("[data-request-form]")
        ?.requestSubmit();
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
          action: () => {
            workspaceStore.getState().togglePin(tabID);
            focusElementAfterRender(`request-tab-${tabID}`);
          },
        },
        {
          label: t("requests.tabs.duplicate"),
          icon: "copy",
          disabled: tab.running,
          action: () => {
            workspaceStore
              .getState()
              .duplicateTab(
                tabID,
                t("requests.tabs.duplicateName", { name: tab.name }),
              );
            const duplicateID = workspaceStore.getState().activeTabID;
            if (duplicateID) {
              focusElementAfterRender(`request-tab-${duplicateID}`);
            }
          },
        },
        { kind: "separator" },
        {
          label: t("requests.tabs.closeOtherClean"),
          action: () => {
            workspaceStore.getState().closeOtherTabs(tabID);
            focusElementAfterRender(`request-tab-${tabID}`);
          },
        },
        {
          label: t("requests.tabs.closeCleanRight"),
          action: () => {
            workspaceStore.getState().closeTabsToRight(tabID);
            focusElementAfterRender(`request-tab-${tabID}`);
          },
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
    if (event.defaultPrevented || event.isComposing) return;
    const command = event.metaKey || event.ctrlKey;
    if (!command || event.key.toLowerCase() !== "s") return;
    const state = workspaceStore.getState();
    if (
      state.activeView !== "requests" ||
      document.querySelector(
        'dialog[open], [role="dialog"], [role="menu"]',
      )
    ) {
      return;
    }
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
    workspaceStore.subscribe((state, previous) => {
      const remainingTabIDs = new Set(state.tabs.map((tab) => tab.id));
      for (const tab of previous.tabs) {
        if (!remainingTabIDs.has(tab.id)) retireRequestRuntime(tab.id);
      }
      if (rendering || suppressStoreRender > 0) return;
      if (!requestPresentationChanged(state, previous)) return;
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
      if (submitGuardTimer !== undefined) {
        window.clearTimeout(submitGuardTimer);
        submitGuardTimer = undefined;
      }
      lifecycle.dispose();
      root.replaceChildren();
    },
  };
}
