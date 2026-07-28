import {
  Lifecycle,
  eventElement,
  html,
  setHTML,
  type Disposable,
} from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import {
  openMenu,
  type OpenOverlay,
} from "../../core/overlays.js";
import { applicationCommands } from "../../app/commands.js";
import {
  getLocale,
  setLocale,
  subscribeLocale,
  t,
} from "../../i18n/locale.js";
import type { BootstrapData, ThemePreference } from "../../lib/types.js";
import { workspaceStore } from "../../stores/workspace.js";

export function mountTopBar(
  root: HTMLElement,
  bootstrap: BootstrapData,
): Disposable {
  const lifecycle = new Lifecycle();
  let disposed = false;
  let activeSettingsMenu: OpenOverlay | undefined;
  let importPending = false;
  let notice: { tone: "success" | "error"; message: string } | undefined;
  let rendering = false;

  const render = () => {
    if (disposed || rendering) return;
    rendering = true;
    const state = workspaceStore.getState();
    const focused =
      document.activeElement instanceof HTMLElement &&
      root.contains(document.activeElement)
        ? document.activeElement
        : undefined;
    const focusKey = focused?.dataset.focus;
    try {
      setHTML(
        root,
        html`
          <header class="topbar">
            <button
              type="button"
              class="brand"
              data-action="home"
              data-focus="home"
              aria-label="${t("chrome.validexHome")}"
              title="${t("chrome.validexHome")}"
            >
              <img
                class="brand-mark"
                src="./appicon.svg"
                width="36"
                height="36"
                alt=""
                aria-hidden="true"
              />
              <strong>Validex</strong>
            </button>
            <span class="topbar-divider"></span>
            <div class="workspace-identity">
              <span>${t("chrome.workspace")}</span>
              <strong>${bootstrap.workspaceName}</strong>
            </div>
            <label class="environment-select">
              <span>${t("chrome.environment")}</span>
              <select
                data-environment
                data-focus="environment"
                aria-label="${t("chrome.environment")}"
                title="${t("chrome.environment")}"
                ${bootstrap.environments.length === 0 ? "disabled" : ""}
              >
                ${bootstrap.environments.length > 0
                  ? bootstrap.environments.map(
                      (environment) => html`
                        <option
                          value="${environment.id}"
                          ${environment.id === state.activeEnvironmentID
                            ? "selected"
                            : ""}
                        >
                          ${environment.name}
                        </option>
                      `,
                    )
                  : html`
                      <option value="none" selected>
                        ${t("chrome.noEnvironment")}
                      </option>
                    `}
              </select>
            </label>
            <button
              type="button"
              class="global-search"
              data-action="palette"
              data-focus="palette"
              aria-label="${t("chrome.openCommandPalette")}"
              aria-keyshortcuts="Meta+K Control+K"
              title="${t("chrome.openCommandPalette")}"
            >
              ${icon("search", 14)}
              <span>${t("chrome.searchCommands")}</span>
              <kbd>⌘/Ctrl K</kbd>
            </button>
            <div class="topbar-actions">
              <button
                type="button"
                class="button primary"
                data-action="new-request"
                data-focus="new-request"
                aria-keyshortcuts="Meta+N Control+N"
                title="${t("chrome.newRequestShortcut")}"
              >
                ${icon("plus", 14)} ${t("chrome.newRequest")}
              </button>
              <button
                type="button"
                class="icon-button"
                data-action="import"
                data-focus="import"
                aria-label="${t("chrome.importOpenAPI")}"
                aria-busy="${importPending ? "true" : "false"}"
                title="${importPending
                  ? t("chrome.importOpenAPIPending")
                  : t("chrome.importOpenAPI")}"
                ${importPending ? "disabled" : ""}
              >
                ${icon(importPending ? "spinner" : "import", 15, importPending ? "spin" : "")}
              </button>
              <button
                type="button"
                class="icon-button"
                data-action="settings"
                data-focus="settings"
                aria-label="${t("chrome.layoutAndSettings")}"
                aria-haspopup="menu"
                title="${t("chrome.layoutAndSettings")}"
              >
                ${icon("settings", 16)}
              </button>
            </div>
          </header>
          ${notice
            ? html`
                <div
                  class="toast topbar-notice ${notice.tone}"
                  role="${notice.tone === "error" ? "alert" : "status"}"
                  aria-live="${notice.tone === "error"
                    ? "assertive"
                    : "polite"}"
                  aria-atomic="true"
                >
                  ${icon(notice.tone === "error" ? "error" : "check", 15)}
                  <span>${notice.message}</span>
                  <button
                    type="button"
                    class="icon-button"
                    data-action="dismiss-notice"
                    data-focus="dismiss-notice"
                    aria-label="${t("chrome.dismissNotification")}"
                    title="${t("chrome.dismissNotification")}"
                  >
                    ${icon("close", 13)}
                  </button>
                </div>
              `
            : ""}
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
    } finally {
      rendering = false;
    }
  };

  const importOpenAPI = async () => {
    if (importPending) return;
    const restoreImportFocus =
      document.activeElement instanceof HTMLElement &&
      document.activeElement.matches('[data-focus="import"]');
    importPending = true;
    notice = undefined;
    render();
    try {
      const result = await applicationCommands.importOpenAPI();
      if (disposed) return;
      if (result.canceled) return;
      if (result.error) {
        const knownErrors = {
          runtime_unavailable: "requests.openapiImport.runtimeUnavailable",
          file_dialog_failed: "requests.openapiImport.fileDialogFailed",
          invalid_openapi: "requests.openapiImport.invalid",
        } as const;
        const key =
          knownErrors[result.error.code as keyof typeof knownErrors];
        notice = {
          tone: "error",
          message: key
            ? t(key)
            : t("requests.openapiImport.failed", {
                details: result.error.message,
              }),
        };
      } else {
        notice = {
          tone: "success",
          message: t(
            result.endpoints.length === 1
              ? "chrome.importSuccess.one"
              : "chrome.importSuccess.many",
            {
              title: result.title,
              version: result.version,
              count: result.endpoints.length,
            },
          ),
        };
      }
    } catch {
      if (disposed) return;
      notice = {
        tone: "error",
        message: t("requests.openapiImport.unexpected"),
      };
    } finally {
      importPending = false;
      if (disposed) return;
      render();
      if (restoreImportFocus) {
        root
          .querySelector<HTMLElement>('[data-focus="import"]')
          ?.focus({ preventScroll: true });
      }
    }
  };

  lifecycle.listen(root, "change", (event) => {
    const select = event.target;
    if (select instanceof HTMLSelectElement && select.matches("[data-environment]")) {
      workspaceStore.getState().setEnvironment(select.value);
    }
  });
  lifecycle.listen(root, "click", (event) => {
    const target = eventElement<HTMLElement>(event, "[data-action]");
    const action = target?.dataset.action;
    if (!action) return;
    if (action === "home") {
      workspaceStore.getState().setActiveView("requests");
    } else if (action === "palette") {
      workspaceStore.getState().setCommandPaletteOpen(true);
    } else if (action === "new-request") {
      applicationCommands.openRequestDraft({
        name: t("chrome.untitledRequest"),
      });
    } else if (action === "import") {
      void importOpenAPI();
    } else if (action === "dismiss-notice") {
      notice = undefined;
      render();
      root
        .querySelector<HTMLElement>('[data-focus="import"]')
        ?.focus({ preventScroll: true });
    } else if (action === "settings" && target) {
      const state = workspaceStore.getState();
      const restoreSettingsFocus = () => {
        window.requestAnimationFrame(() => {
          root
            .querySelector<HTMLElement>('[data-focus="settings"]')
            ?.focus({ preventScroll: true });
        });
      };
      const setTheme = (theme: ThemePreference) => {
        workspaceStore.getState().setTheme(theme);
        restoreSettingsFocus();
      };
      activeSettingsMenu?.dispose();
      activeSettingsMenu = openMenu({
        anchor: target,
        align: "end",
        restoreFocus: target,
        label: t("chrome.layoutAndSettings"),
        entries: [
          ...(state.activeView === "requests"
            ? [
                {
                  label: t("chrome.toggleRequestPanel"),
                  icon: "panel-left" as const,
                  action: () => {
                    workspaceStore.getState().toggleLeft();
                    restoreSettingsFocus();
                  },
                },
                {
                  label: t("chrome.toggleContextPanel"),
                  icon: "panel-right" as const,
                  action: () => {
                    workspaceStore.getState().toggleRight();
                    restoreSettingsFocus();
                  },
                },
                {
                  label: t("chrome.response", {
                    placement:
                      state.responsePlacement === "vertical"
                        ? t("chrome.responseRight")
                        : t("chrome.responseBottom"),
                  }),
                  action: () => {
                    workspaceStore
                      .getState()
                      .setResponsePlacement(
                        state.responsePlacement === "vertical"
                          ? "horizontal"
                          : "vertical",
                      );
                    restoreSettingsFocus();
                  },
                },
                {
                  label: t("chrome.resetLayout"),
                  icon: "refresh" as const,
                  action: () => {
                    workspaceStore.getState().resetLayout();
                    restoreSettingsFocus();
                  },
                },
                { kind: "separator" as const },
              ]
            : []),
          {
            label: t("chrome.themeSystem"),
            icon: "settings",
            action: () => setTheme("system"),
          },
          {
            label: t("chrome.themeLight"),
            icon: "sun",
            action: () => setTheme("light"),
          },
          {
            label: t("chrome.themeDark"),
            icon: "moon",
            action: () => setTheme("dark"),
          },
          { kind: "separator" },
          {
            label: "Türkçe",
            icon: "language",
            disabled: getLocale() === "tr",
            action: () => {
              setLocale("tr");
              restoreSettingsFocus();
            },
          },
          {
            label: "English",
            icon: "language",
            disabled: getLocale() === "en",
            action: () => {
              setLocale("en");
              restoreSettingsFocus();
            },
          },
        ],
      });
    }
  });

  const importListener = () => void importOpenAPI();
  window.addEventListener("validex:import-openapi", importListener);
  lifecycle.add(() =>
    window.removeEventListener("validex:import-openapi", importListener),
  );
  lifecycle.add(
    workspaceStore.subscribe((state, previous) => {
      if (
        state.activeEnvironmentID !== previous.activeEnvironmentID
      ) {
        render();
      }
    }),
  );
  lifecycle.add(
    subscribeLocale(() => {
      activeSettingsMenu?.dispose();
      activeSettingsMenu = undefined;
      notice = undefined;
      render();
    }),
  );
  render();
  return {
    dispose() {
      disposed = true;
      activeSettingsMenu?.dispose();
      lifecycle.dispose();
      root.replaceChildren();
    },
  };
}
