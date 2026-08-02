import {
  delegate,
  html,
  Lifecycle,
  optionalElement,
  requiredElement,
  setHTML,
  type Disposable,
  type TrustedHTMLFragment,
} from "../../core/dom.js";
import { icon, type IconName } from "../../core/icons.js";
import {
  getLocale,
  subscribeLocale,
  t,
  type Translate,
} from "../../i18n/locale.js";
import {
  compareJSON,
  DeveloperToolError,
  formatJSON,
  inferJSONSchema,
  javaDTOToJSONExample,
  minifyJSON,
  queryJSONPath,
  sortJSON,
  type JSONDifference,
} from "../../lib/developerTools.js";
import {
  inputGroupForMode,
  type JSONInputGroup,
  type JSONMode,
} from "../../features/json-lab/model.js";

interface JSONNotice {
  tone: "error" | "success";
  text: string;
}

interface JSONLabState {
  mode: JSONMode;
  inputs: Record<JSONInputGroup, string>;
  compareInput: string;
  ignorePaths: string;
  path: string;
  result: string;
  differences: JSONDifference[] | null;
  notice: JSONNotice | null;
  copied: boolean;
}

interface JSONModeDefinition {
  id: JSONMode;
  label: string;
  description: string;
  icon: IconName;
}

function modeDefinitions(): readonly JSONModeDefinition[] {
  return [
    {
      id: "format",
      label: t("json.tab.format"),
      description: t("json.mode.format.description"),
      icon: "braces",
    },
    {
      id: "diff",
      label: t("json.tab.diff"),
      description: t("json.mode.diff.description"),
      icon: "code",
    },
    {
      id: "query",
      label: t("json.tab.query"),
      description: t("json.mode.query.description"),
      icon: "search",
    },
    {
      id: "schema",
      label: t("json.tab.schema"),
      description: t("json.mode.schema.description"),
      icon: "braces",
    },
    {
      id: "dto",
      label: t("json.tab.dto"),
      description: t("json.mode.dto.description"),
      icon: "code",
    },
  ];
}

function printable(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? "—";
}

function localizedJSONError(error: unknown, translate: Translate): string {
  if (error instanceof DeveloperToolError) {
    switch (error.code) {
      case "json.empty":
        return translate("json.error.empty");
      case "json.invalid":
        return translate("json.error.invalid", {
          details: error.params.details ?? "",
        });
      case "jsonpath.root":
        return translate("json.error.pathRoot");
      case "jsonpath.unsupported":
        return translate("json.error.pathUnsupported");
      case "jsonpath.missing":
        return translate("json.error.pathMissing", {
          path: error.params.path ?? "",
        });
      case "dto.empty":
        return translate("json.error.dtoEmpty");
      case "dto.unsupported":
        return translate("json.error.dtoUnsupported");
    }
  }
  return error instanceof Error ? error.message : String(error);
}

function toolNotice(notice: JSONNotice | null): TrustedHTMLFragment {
  if (!notice) return html``;
  const error = notice.tone === "error";
  return html`
    <div
      class="tool-notice tool-notice-row ${notice.tone}"
      role="${error ? "alert" : "status"}"
      aria-live="${error ? "assertive" : "polite"}"
    >
      ${icon(error ? "warning" : "check", 16)}
      <div class="tool-notice-content">
        <span>${notice.text}</span>
      </div>
    </div>
  `;
}

function differenceList(
  differences: JSONDifference[] | null,
): TrustedHTMLFragment {
  if (differences === null) return html``;
  if (differences.length === 0) {
    return html`
      <div class="tool-success-card" role="status">
        ${icon("check", 17)}
        <span>${t("json.difference.same")}</span>
      </div>
    `;
  }

  const kindLabels: Record<JSONDifference["kind"], string> = {
    added: t("json.difference.added"),
    removed: t("json.difference.removed"),
    changed: t("json.difference.changed"),
    type: t("json.difference.type"),
  };
  return html`
    <div
      class="json-difference-list"
      aria-label="${t("json.difference.aria")}"
      role="list"
    >
      ${differences.map(
        (item) => html`
          <article class="json-difference ${item.kind}" role="listitem">
            <header>
              <code>${item.path}</code>
              <span>${kindLabels[item.kind]}</span>
            </header>
            <div>
              <code>
                <span class="sr-only">${t("json.difference.before")}: </span>
                ${printable(item.left)}
              </code>
              <span aria-hidden="true">→</span>
              <code>
                <span class="sr-only">${t("json.difference.after")}: </span>
                ${printable(item.right)}
              </code>
            </div>
          </article>
        `,
      )}
    </div>
  `;
}

function resultContent(result: string): TrustedHTMLFragment {
  if (result) {
    return html`
      <textarea
        class="tool-code-input"
        readonly
        aria-label="${t("json.result.aria")}"
      >${result}</textarea>
    `;
  }
  return html`
    <div class="tool-empty-result">
      ${icon("braces", 24)}
      <strong>${t("json.result.empty.title")}</strong>
      <span>${t("json.result.empty.description")}</span>
    </div>
  `;
}

function inputCard(
  state: JSONLabState,
  input: string,
): TrustedHTMLFragment {
  const dto = state.mode === "dto";
  const title =
    state.mode === "diff"
      ? t("json.input.source")
      : dto
        ? t("json.input.dto")
        : t("json.input.json");
  const description = dto
    ? t("json.input.dtoDescription")
    : t("json.input.jsonDescription");
  const placeholder = dto
    ? "public record UserResponse(UUID id, String name, boolean active) {}"
    : '{\n  "id": 42,\n  "status": "ACTIVE"\n}';
  const inputLabel = dto ? t("json.input.dto") : t("json.input.json");

  let actions = html``;
  if (state.mode === "format") {
    actions = html`
      <div class="tool-card-actions">
        <button
          type="button"
          class="button button-primary button-md"
          data-json-action="format"
        >
          ${icon("braces", 14)} ${t("json.action.format")}
        </button>
        <button
          type="button"
          class="button button-secondary button-md"
          data-json-action="minify"
        >
          ${t("json.action.minify")}
        </button>
        <button
          type="button"
          class="button button-secondary button-md"
          data-json-action="sort"
        >
          ${t("json.action.sort")}
        </button>
      </div>
    `;
  } else if (state.mode === "query") {
    actions = html`
      <div class="tool-inline-action">
        <label>
          JSONPath
          <input
            data-json-control="path"
            value="${state.path}"
            placeholder="$.users[0].name"
            aria-describedby="json-path-help"
          />
          <small id="json-path-help">${t("json.query.pathHelp")}</small>
        </label>
        <button
          type="button"
          class="button button-primary button-md"
          data-json-action="query"
        >
          ${icon("search", 14)} ${t("json.action.query")}
        </button>
      </div>
    `;
  } else if (state.mode === "schema") {
    actions = html`
      <div class="tool-card-actions">
        <button
          type="button"
          class="button button-primary button-md"
          data-json-action="schema"
        >
          ${icon("braces", 14)} ${t("json.action.schema")}
        </button>
      </div>
    `;
  } else if (state.mode === "dto") {
    actions = html`
      <div class="tool-card-actions">
        <button
          type="button"
          class="button button-primary button-md"
          data-json-action="dto"
        >
          ${icon("code", 14)} ${t("json.action.mock")}
        </button>
        <span>${t("json.dto.hint")}</span>
      </div>
    `;
  }

  return html`
    <div class="tool-editor-card">
      <header class="tool-card-header">
        <div>
          <h2>${title}</h2>
          <span>${description}</span>
        </div>
        <button
          type="button"
          class="button button-ghost button-sm"
          data-json-action="clear"
          ${input ? "" : "disabled"}
        >
          ${icon("trash", 13)} ${t("json.action.clear")}
        </button>
      </header>
      <textarea
        class="tool-code-input"
        data-json-control="source"
        placeholder="${placeholder}"
        spellcheck="false"
        aria-label="${inputLabel}"
        aria-describedby="json-mode-guidance"
      >${input}</textarea>
      ${actions}
    </div>
  `;
}

function secondaryCard(state: JSONLabState): TrustedHTMLFragment {
  if (state.mode === "diff") {
    return html`
      <div class="tool-editor-card">
        <header class="tool-card-header">
          <div>
            <h2>${t("json.diff.target")}</h2>
            <span>${t("json.diff.targetDescription")}</span>
          </div>
        </header>
        <textarea
          class="tool-code-input"
          data-json-control="compare"
          placeholder='{
  "id": 42,
  "status": "DISABLED"
}'
          spellcheck="false"
          aria-label="${t("json.diff.targetAria")}"
        >${state.compareInput}</textarea>
        <div class="tool-diff-options">
          <label>
            ${t("json.diff.ignore")}
            <textarea
              data-json-control="ignore"
              aria-label="${t("json.diff.ignoreAria")}"
              aria-describedby="json-diff-ignore-help"
            >${state.ignorePaths}</textarea>
            <small id="json-diff-ignore-help">
              ${t("json.diff.ignoreHelp")}
            </small>
          </label>
          <button
            type="button"
            class="button button-primary button-md"
            data-json-action="compare"
          >
            ${icon("code", 14)} ${t("json.action.compare")}
          </button>
        </div>
      </div>
    `;
  }

  return html`
    <div class="tool-editor-card result-card">
      <header class="tool-card-header">
        <div>
          <h2>${t("json.result.title")}</h2>
          <span>${t("json.result.description")}</span>
        </div>
        <button
          type="button"
          class="button button-ghost button-sm"
          data-json-action="copy"
          aria-live="polite"
          ${state.result ? null : html`disabled`}
        >
          ${icon(state.copied ? "check" : "copy", 13)}
          ${state.copied ? t("json.copy.copied") : t("json.copy.action")}
        </button>
      </header>
      <div data-json-slot="result" style="display: contents">
        ${resultContent(state.result)}
      </div>
    </div>
  `;
}

function renderPage(root: HTMLElement, state: JSONLabState): void {
  const input = state.inputs[inputGroupForMode(state.mode)];
  const inputSize = new Blob([input]).size.toLocaleString(
    getLocale() === "tr" ? "tr-TR" : "en-US",
  );
  const tabs = modeDefinitions();
  const activeMode = tabs.find((tab) => tab.id === state.mode) ?? tabs[0];

  setHTML(
    root,
    html`
      <section
        class="tool-page"
        aria-labelledby="json-lab-title"
      >
        <header class="tool-page-header">
          <div>
            <span class="tool-eyebrow">${t("json.eyebrow")}</span>
            <h1 id="json-lab-title">${t("json.title")}</h1>
            <p>${t("json.description")}</p>
          </div>
          <div class="tool-header-meta">
            <strong data-json-slot="size">${inputSize} B</strong>
            <span>${t("json.meta.private")}</span>
          </div>
        </header>

        <div
          class="tool-tabs"
          role="tablist"
          aria-label="${t("json.tabs.label")}"
        >
          ${tabs.map(
            (tab) => html`
              <button
                type="button"
                role="tab"
                id="json-lab-tab-${tab.id}"
                class="${state.mode === tab.id ? "active" : ""}"
                data-json-mode="${tab.id}"
                aria-selected="${state.mode === tab.id
                  ? "true"
                  : "false"}"
                aria-controls="json-lab-panel-${tab.id}"
                tabindex="${state.mode === tab.id ? 0 : -1}"
              >
                ${icon(tab.icon, 15)}
                ${tab.label}
              </button>
            `,
          )}
        </div>
        ${tabs
          .filter((tab) => tab.id !== state.mode)
          .map(
            (tab) => html`
              <div
                id="json-lab-panel-${tab.id}"
                role="tabpanel"
                aria-labelledby="json-lab-tab-${tab.id}"
                hidden
              ></div>
            `,
          )}

        <p class="tool-mode-guidance" id="json-mode-guidance">
          ${activeMode.description}
        </p>

        <div data-json-slot="notice">${toolNotice(state.notice)}</div>

        <div
          class="json-lab-grid ${state.mode === "diff" ? "json-diff-mode" : ""}"
          id="json-lab-panel-${state.mode}"
          role="tabpanel"
          aria-labelledby="json-lab-tab-${state.mode}"
        >
          ${inputCard(state, input)}
          ${secondaryCard(state)}
        </div>

        <div data-json-slot="differences">
          ${state.mode === "diff" ? differenceList(state.differences) : null}
        </div>
      </section>
    `,
  );
}

function updateDerivedRegions(root: HTMLElement, state: JSONLabState): void {
  const notice = requiredElement<HTMLElement>(
    root,
    '[data-json-slot="notice"]',
  );
  setHTML(notice, toolNotice(state.notice));

  const differences = requiredElement<HTMLElement>(
    root,
    '[data-json-slot="differences"]',
  );
  setHTML(
    differences,
    state.mode === "diff" ? differenceList(state.differences) : html``,
  );

  const result = optionalElement<HTMLElement>(
    root,
    '[data-json-slot="result"]',
  );
  if (result) setHTML(result, resultContent(state.result));

  const copy = optionalElement<HTMLButtonElement>(
    root,
    '[data-json-action="copy"]',
  );
  if (copy) {
    copy.disabled = !state.result;
    setHTML(
      copy,
      html`
        ${icon(state.copied ? "check" : "copy", 13)}
        ${state.copied ? t("json.copy.copied") : t("json.copy.action")}
      `,
    );
  }
}

function updateInputSize(root: HTMLElement, state: JSONLabState): void {
  const size = optionalElement<HTMLElement>(root, '[data-json-slot="size"]');
  const input = state.inputs[inputGroupForMode(state.mode)];
  if (size) {
    size.textContent = `${new Blob([input]).size.toLocaleString(
      getLocale() === "tr" ? "tr-TR" : "en-US",
    )} B`;
  }
  const clear = optionalElement<HTMLButtonElement>(
    root,
    '[data-json-action="clear"]',
  );
  if (clear) clear.disabled = !input;
}

export function mountJSONLab(root: HTMLElement): Disposable {
  const lifecycle = new Lifecycle();
  const state: JSONLabState = {
    mode: "format",
    inputs: {
      json: "",
      diff: "",
      dto: "",
    },
    compareInput: "",
    ignorePaths: "$.traceId\n$.timestamp",
    path: "$",
    result: "",
    differences: null,
    notice: null,
    copied: false,
  };
  let copiedTimer: number | undefined;

  const resetCopied = () => {
    state.copied = false;
    if (copiedTimer !== undefined) {
      window.clearTimeout(copiedTimer);
      copiedTimer = undefined;
    }
  };

  const clearDerived = () => {
    state.result = "";
    state.differences = null;
    state.notice = null;
    resetCopied();
  };

  const selectMode = (mode: JSONMode, focus = false) => {
    state.mode = mode;
    clearDerived();
    renderPage(root, state);
    if (focus) {
      const active = optionalElement<HTMLButtonElement>(
        root,
        `[data-json-mode="${mode}"]`,
      );
      active?.focus();
      active?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
  };

  const run = (operation: () => string, success: string) => {
    resetCopied();
    try {
      state.result = operation();
      state.notice = { tone: "success", text: success };
    } catch (error) {
      state.notice = {
        tone: "error",
        text: localizedJSONError(error, t),
      };
    }
    updateDerivedRegions(root, state);
  };

  const compare = () => {
    resetCopied();
    try {
      const ignored = state.ignorePaths
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      state.differences = compareJSON(
        state.inputs.diff,
        state.compareInput,
        ignored,
      );
      state.notice = {
        tone: "success",
        text:
          state.differences.length === 0
            ? t("json.notice.noDifference")
            : t("json.notice.differences", {
                count: state.differences.length,
              }),
      };
    } catch (error) {
      state.differences = null;
      state.notice = {
        tone: "error",
        text: localizedJSONError(error, t),
      };
    }
    updateDerivedRegions(root, state);
  };

  const copyResult = async () => {
    if (!state.result) return;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(state.result);
      state.copied = true;
      updateDerivedRegions(root, state);
      if (copiedTimer !== undefined) window.clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => {
        copiedTimer = undefined;
        state.copied = false;
        updateDerivedRegions(root, state);
      }, 1_600);
    } catch {
      state.notice = { tone: "error", text: t("json.copy.failed") };
      updateDerivedRegions(root, state);
    }
  };

  const handleControl = (event: Event) => {
    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      return;
    }
    const control = element.dataset.jsonControl;
    if (!control) return;

    if (control === "source") {
      state.inputs[inputGroupForMode(state.mode)] = element.value;
      clearDerived();
      updateInputSize(root, state);
    } else if (control === "compare") {
      state.compareInput = element.value;
      clearDerived();
    } else if (control === "ignore") {
      state.ignorePaths = element.value;
      clearDerived();
    } else if (control === "path") {
      state.path = element.value;
      clearDerived();
    }
    updateDerivedRegions(root, state);
  };

  lifecycle.listen(root, "input", handleControl);
  lifecycle.listen(root, "change", handleControl);

  delegate(lifecycle, root, "click", "[data-json-mode]", (_event, element) => {
    const mode = element.dataset.jsonMode as JSONMode | undefined;
    if (mode) selectMode(mode, true);
  });

  delegate(lifecycle, root, "keydown", "[data-json-mode]", (event, element) => {
    const tabs = modeDefinitions();
    const current = tabs.findIndex(
      (tab) => tab.id === element.dataset.jsonMode,
    );
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
    selectMode(tabs[next].id, true);
  });

  delegate(lifecycle, root, "click", "[data-json-action]", (_event, element) => {
    const action = element.dataset.jsonAction;
    const input = state.inputs[inputGroupForMode(state.mode)];
    switch (action) {
      case "clear": {
        state.inputs[inputGroupForMode(state.mode)] = "";
        clearDerived();
        const source = optionalElement<HTMLTextAreaElement>(
          root,
          '[data-json-control="source"]',
        );
        if (source) source.value = "";
        updateInputSize(root, state);
        updateDerivedRegions(root, state);
        source?.focus({ preventScroll: true });
        break;
      }
      case "format":
        run(() => formatJSON(input), t("json.notice.formatted"));
        break;
      case "minify":
        run(() => minifyJSON(input), t("json.notice.minified"));
        break;
      case "sort":
        run(() => sortJSON(input), t("json.notice.sorted"));
        break;
      case "query":
        run(
          () => JSON.stringify(queryJSONPath(input, state.path), null, 2),
          t("json.notice.queryReady"),
        );
        break;
      case "schema":
        run(() => inferJSONSchema(input), t("json.notice.schemaCreated"));
        break;
      case "dto":
        run(() => javaDTOToJSONExample(input), t("json.notice.dtoCreated"));
        break;
      case "compare":
        compare();
        break;
      case "copy":
        void copyResult();
        break;
    }
  });

  lifecycle.add(
    subscribeLocale(() => {
      state.notice = null;
      renderPage(root, state);
    }),
  );
  lifecycle.add(() => {
    if (copiedTimer !== undefined) window.clearTimeout(copiedTimer);
    root.replaceChildren();
  });

  renderPage(root, state);
  return lifecycle;
}
