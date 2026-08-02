import {
  Lifecycle,
  eventElement,
  html,
  setHTML,
  type Disposable,
} from "../../core/dom.js";
import { applicationCommands } from "../../app/commands.js";
import { icon } from "../../core/icons.js";
import { subscribeLocale, t } from "../../i18n/locale.js";
import {
  isMaskedSecretValue,
  isSecretKey,
} from "../../lib/secrets.js";
import type { BootstrapData, RequestTab } from "../../lib/types.js";
import { localizedBootstrapEnvironmentName } from "../../lib/bootstrap.js";
import { workspaceStore } from "../../stores/workspace.js";

type ContextView = "variables" | "auth";

const contextViews: readonly ContextView[] = ["variables", "auth"];

function hasMissingVariables(
  value: string,
  variables: Record<string, string>,
): boolean {
  for (const match of value.matchAll(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*}}/g,
  )) {
    const candidate = variables[match[1]];
    if (!candidate || isMaskedSecretValue(candidate)) return true;
  }
  return false;
}

async function copyText(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    input.remove();
  }
}

function activeRequestTab(): RequestTab | undefined {
  const state = workspaceStore.getState();
  return state.tabs.find((tab) => tab.id === state.activeTabID);
}

export function mountContextPanel(
  root: HTMLElement,
  bootstrap: BootstrapData,
): Disposable {
  const lifecycle = new Lifecycle();
  let disposed = false;
  let activeView: ContextView = "variables";
  let showSecrets = false;
  let copyResult: "success" | "error" | undefined;
  let copyResultTimer: number | undefined;

  const maskSensitiveContext = (): void => {
    if (!showSecrets && copyResult === undefined) return;
    showSecrets = false;
    copyResult = undefined;
    if (copyResultTimer !== undefined) {
      window.clearTimeout(copyResultTimer);
      copyResultTimer = undefined;
    }
    render();
  };

  const render = () => {
    if (disposed) return;
    const state = workspaceStore.getState();
    const currentTab = state.tabs.find((tab) => tab.id === state.activeTabID);
    const environment =
      bootstrap.environments.find(
        (item) => item.id === state.activeEnvironmentID,
      ) ?? bootstrap.environments[0];
    const variables = {
      ...(environment?.variables ?? {}),
      ...(environment ? state.environmentVariables[environment.id] : {}),
    };
    const variableEntries = Object.entries(variables);
    const hasSecrets = variableEntries.some(([key]) => isSecretKey(key));
    const authorizationHeader = currentTab?.headers.find(
      (header) => header.key.trim().toLowerCase() === "authorization",
    );
    const authorizationValue = authorizationHeader?.value.trim() ?? "";
    const authorizationReady = Boolean(
        authorizationHeader?.enabled &&
        authorizationValue &&
        authorizationValue.toLowerCase() !== "bearer" &&
        !hasMissingVariables(authorizationHeader.value, variables),
    );
    const authorizationStatus = !currentTab
      ? t("context.noActiveRequest")
      : authorizationReady
        ? t("context.ready")
        : authorizationHeader?.enabled
          ? t("context.authorizationMissing")
          : authorizationHeader
            ? t("context.authorizationDisabled")
            : t("context.noAuth");
    const focused =
      document.activeElement instanceof HTMLElement &&
      root.contains(document.activeElement)
        ? document.activeElement
        : undefined;
    const focusKey = focused?.dataset.focus;

    setHTML(
      root,
      html`
        <aside class="context-panel" aria-label="${t("context.panel")}">
          <div class="context-tabs">
            <div role="tablist" aria-label="${t("context.views")}">
              <button
                type="button"
                id="context-tab-variables"
                role="tab"
                data-context-view="variables"
                data-state="${activeView === "variables"
                  ? "active"
                  : "inactive"}"
                aria-selected="${activeView === "variables"
                  ? "true"
                  : "false"}"
                aria-controls="context-content-variables"
                tabindex="${activeView === "variables" ? "0" : "-1"}"
              >
                ${icon("braces", 14)}
                ${t("context.variables")}
              </button>
              <button
                type="button"
                id="context-tab-auth"
                role="tab"
                data-context-view="auth"
                data-state="${activeView === "auth" ? "active" : "inactive"}"
                aria-selected="${activeView === "auth" ? "true" : "false"}"
                aria-controls="context-content-auth"
                tabindex="${activeView === "auth" ? "0" : "-1"}"
              >
                ${icon(authorizationReady ? "check" : "warning", 14)}
                ${t("context.auth")}
              </button>
            </div>

            <section
              id="context-content-variables"
              class="context-content"
              role="tabpanel"
              aria-labelledby="context-tab-variables"
              ${activeView === "variables" ? "" : "hidden"}
            >
              <div class="context-heading">
                <div>
                  <span>${t("context.activeEnvironment")}</span>
                  <strong>
                    ${!environment || environment.id === "none"
                      ? t("chrome.noEnvironment")
                      : localizedBootstrapEnvironmentName(environment)}
                  </strong>
                </div>
              </div>
              ${variableEntries.length > 0
                ? html`
                    <div class="variable-list" role="list">
                      ${variableEntries.map(([key, value]) => {
                        const secret = isSecretKey(key);
                        return html`
                          <div class="variable-row" role="listitem">
                            <div>
                              <code>{{${key}}}</code>
                              <span
                                class="${secret && !showSecrets
                                  ? "secret-value-masked"
                                  : ""}"
                                aria-label="${secret && !showSecrets
                                  ? t("context.secretHidden")
                                  : value}"
                              >
                                ${secret && !showSecrets
                                  ? "••••••••••••"
                                  : value}
                              </span>
                            </div>
                            <button
                              type="button"
                              class="icon-button"
                              data-action="copy-variable"
                              data-variable-key="${key}"
                              data-focus="copy-variable:${key}"
                              aria-label="${t(
                                secret
                                  ? "context.copyVariableReference"
                                  : "context.copyVariable",
                                { key },
                              )}"
                              title="${t(
                                secret
                                  ? "context.copyVariableReference"
                                  : "context.copyVariable",
                                { key },
                              )}"
                            >
                              ${icon("copy", 13)}
                            </button>
                          </div>
                        `;
                      })}
                    </div>
                  `
                : html`
                    <p class="context-note">${t("context.noVariables")}</p>
                  `}
              ${hasSecrets
                ? html`
                    <button
                      type="button"
                      class="show-secrets"
                      data-action="toggle-secrets"
                      data-focus="toggle-secrets"
                      data-state="${showSecrets ? "revealed" : "masked"}"
                      aria-pressed="${showSecrets ? "true" : "false"}"
                    >
                      ${icon(showSecrets ? "eye-off" : "eye", 14)}
                      ${showSecrets
                        ? t("context.hideSecrets")
                        : t("context.showSecrets")}
                    </button>
                  `
                : ""}
              ${variableEntries.length > 0
                ? html`
                    <p class="context-note">
                      ${t("context.editVariablesHint")}
                    </p>
                  `
                : ""}
              ${copyResult
                ? html`
                    <p
                      class="context-feedback ${copyResult}"
                      role="${copyResult === "error"
                        ? "alert"
                        : "status"}"
                    >
                      ${icon(
                        copyResult === "error" ? "error" : "check",
                        13,
                      )}
                      ${t(
                        copyResult === "error"
                          ? "common.copyFailed"
                          : "common.copied",
                      )}
                    </p>
                  `
                : ""}
            </section>

            <section
              id="context-content-auth"
              class="context-content"
              role="tabpanel"
              aria-labelledby="context-tab-auth"
              ${activeView === "auth" ? "" : "hidden"}
            >
              <div class="context-heading">
                <div>
                  <span>${t("context.requestAuth")}</span>
                  <strong>${authorizationStatus}</strong>
                </div>
                ${authorizationReady
                  ? html`
                      <span class="auth-status ready">
                        ${icon("check", 12)} ${t("context.ready")}
                      </span>
                    `
                  : ""}
              </div>

              ${!currentTab
                ? html`
                    <div class="auth-empty-state no-active-request">
                      ${icon("request", 20)}
                      <strong>${t("context.noActiveRequest")}</strong>
                      <span>${t("context.noActiveRequestDescription")}</span>
                    </div>
                    <button
                      type="button"
                      class="button primary auth-context-action"
                      data-action="new-request"
                      data-focus="auth-action"
                    >
                      ${icon("plus", 14)} ${t("chrome.newRequest")}
                    </button>
                  `
                : authorizationHeader
                ? html`
                    <div class="auth-context-card">
                      ${icon(authorizationReady ? "check" : "warning", 18)}
                      <div>
                        <strong>${t("context.authorizationHeader")}</strong>
                        <span>
                          ${authorizationHeader.enabled
                            ? authorizationReady
                              ? t("context.authEnabledHidden")
                              : t("context.authEnabledIncomplete")
                            : t("context.authDisabledNotSent")}
                        </span>
                        <code>••••••••••••••••</code>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="button auth-context-action"
                      data-action="open-headers"
                      data-focus="auth-action"
                    >
                      ${t("context.editInHeaders")}
                    </button>
                    <p class="context-note">
                      ${t("context.secretNotShown")}
                    </p>
                  `
                : html`
                    <div class="auth-empty-state">
                      ${icon("warning", 20)}
                      <strong>${t("context.noAuth")}</strong>
                      <span>${t("context.noAuthDescription")}</span>
                    </div>
                    <button
                      type="button"
                      class="button primary auth-context-action"
                      data-action="add-authorization"
                      data-focus="auth-action"
                    >
                      ${t("context.addAuthorization")}
                    </button>
                    <p class="context-note">
                      ${t("context.authorizationOptIn")}
                    </p>
                  `}
            </section>
          </div>
        </aside>
      `,
    );
    if (focusKey) {
      const replacement = [
        ...root.querySelectorAll<HTMLElement>("[data-focus]"),
      ].find((element) => element.dataset.focus === focusKey);
      if (replacement && !replacement.matches(":disabled")) {
        replacement.focus({ preventScroll: true });
      }
    }
  };

  const selectView = (view: ContextView, focus = false) => {
    if (view === activeView && !focus) return;
    activeView = view;
    render();
    if (focus) {
      root
        .querySelector<HTMLElement>(`[data-context-view="${view}"]`)
        ?.focus();
    }
  };

  lifecycle.listen(root, "click", async (event) => {
    const viewTarget = eventElement<HTMLElement>(event, "[data-context-view]");
    const view = viewTarget?.dataset.contextView as ContextView | undefined;
    if (view && contextViews.includes(view)) {
      selectView(view);
      return;
    }

    const actionTarget = eventElement<HTMLElement>(event, "[data-action]");
    const action = actionTarget?.dataset.action;
    if (!action) return;
    if (action === "toggle-secrets") {
      showSecrets = !showSecrets;
      copyResult = undefined;
      render();
      return;
    }
    if (action === "copy-variable") {
      const key = actionTarget?.dataset.variableKey;
      if (!key) return;
      const state = workspaceStore.getState();
      const environment =
        bootstrap.environments.find(
          (item) => item.id === state.activeEnvironmentID,
        ) ?? bootstrap.environments[0];
      const variables = {
        ...(environment?.variables ?? {}),
        ...(environment ? state.environmentVariables[environment.id] : {}),
      };
      const value = variables[key];
      if (value === undefined) return;
      const copied = await copyText(
        isSecretKey(key) ? `{{${key}}}` : value,
      );
      if (disposed) return;
      copyResult = copied ? "success" : "error";
      if (copyResultTimer !== undefined) {
        window.clearTimeout(copyResultTimer);
      }
      if (actionTarget.isConnected) {
        actionTarget.focus({ preventScroll: true });
      }
      render();
      copyResultTimer = window.setTimeout(() => {
        copyResult = undefined;
        copyResultTimer = undefined;
        render();
      }, 2500);
      return;
    }
    if (action === "new-request") {
      applicationCommands.openRequestDraft({
        name: t("chrome.untitledRequest"),
      });
      return;
    }
    if (action === "open-headers") {
      const tab = activeRequestTab();
      if (tab) {
        workspaceStore.getState().updateTab(tab.id, {
          requestSection: "headers",
        });
      }
      return;
    }
    if (action !== "add-authorization") return;
    const tab = activeRequestTab();
    if (!tab) return;
    if (
      tab.headers.some(
        (header) => header.key.trim().toLowerCase() === "authorization",
      )
    ) {
      workspaceStore.getState().updateTab(tab.id, {
        requestSection: "headers",
      });
      return;
    }
    workspaceStore.getState().updateTab(tab.id, {
      headers: [
        ...tab.headers,
        {
          id: `header-authorization-${crypto.randomUUID()}`,
          enabled: false,
          key: "Authorization",
          value: "Bearer ",
          description: t("context.userAdded"),
          source: "Manual",
        },
      ],
      requestSection: "headers",
      dirty: true,
      error: false,
      userError: undefined,
    });
  });

  lifecycle.listen(root, "keydown", (event) => {
    const target = eventElement<HTMLElement>(event, "[data-context-view]");
    const current = target?.dataset.contextView as ContextView | undefined;
    if (!current || !contextViews.includes(current)) return;
    const index = contextViews.indexOf(current);
    let next: ContextView | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = contextViews[(index + 1) % contextViews.length];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next =
        contextViews[
          (index - 1 + contextViews.length) % contextViews.length
        ];
    } else if (event.key === "Home") {
      next = contextViews[0];
    } else if (event.key === "End") {
      next = contextViews[contextViews.length - 1];
    }
    if (!next) return;
    event.preventDefault();
    selectView(next, true);
  });

  lifecycle.add(
    workspaceStore.subscribe((state, previous) => {
      if (
        state.activeEnvironmentID !== previous.activeEnvironmentID ||
        (state.activeView !== previous.activeView &&
          state.activeView !== "requests") ||
        (state.rightVisible !== previous.rightVisible && !state.rightVisible)
      ) {
        maskSensitiveContext();
      }
      const activeHeaders = state.tabs.find(
        (tab) => tab.id === state.activeTabID,
      )?.headers;
      const previousActiveHeaders = previous.tabs.find(
        (tab) => tab.id === previous.activeTabID,
      )?.headers;
      if (
        state.activeEnvironmentID !== previous.activeEnvironmentID ||
        state.environmentVariables !== previous.environmentVariables ||
        state.activeTabID !== previous.activeTabID ||
        activeHeaders !== previousActiveHeaders
      ) {
        render();
      }
    }),
  );
  lifecycle.add(subscribeLocale(render));
  lifecycle.listen(window, "blur", maskSensitiveContext);
  const rightPanel = root.closest<HTMLElement>("[data-right-panel]");
  if (rightPanel && typeof MutationObserver !== "undefined") {
    const visibilityObserver = new MutationObserver(() => {
      if (
        rightPanel.hasAttribute("inert") ||
        rightPanel.getAttribute("aria-hidden") === "true"
      ) {
        maskSensitiveContext();
      }
    });
    visibilityObserver.observe(rightPanel, {
      attributes: true,
      attributeFilter: ["aria-hidden", "inert"],
    });
    lifecycle.add(() => visibilityObserver.disconnect());
  }
  render();

  return {
    dispose() {
      disposed = true;
      if (copyResultTimer !== undefined) {
        window.clearTimeout(copyResultTimer);
      }
      lifecycle.dispose();
      root.replaceChildren();
    },
  };
}
