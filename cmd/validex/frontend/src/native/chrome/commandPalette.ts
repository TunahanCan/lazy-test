import {
  Lifecycle,
  eventElement,
  html,
  requiredElement,
  setHTML,
  type Disposable,
} from "../../core/dom.js";
import { applicationCommands } from "../../app/commands.js";
import { icon, type IconName } from "../../core/icons.js";
import { presentDialog, type DialogHandle } from "../../core/overlays.js";
import { getLocale, subscribeLocale, t } from "../../i18n/locale.js";
import type { BootstrapData } from "../../lib/types.js";
import { localizedBootstrapWorkspaceName } from "../../lib/bootstrap.js";
import { fuzzyMatch } from "../../lib/utils.js";
import { workspaceStore } from "../../stores/workspace.js";
import { workspaceDefinitions } from "../workspaces.js";
import type { WorkspaceLayoutCommands } from "./workspaceLayoutCommands.js";

interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  keywords: string;
  icon: IconName;
  run(): void;
}

function commands(
  bootstrap: BootstrapData,
  layoutCommands: WorkspaceLayoutCommands,
): PaletteCommand[] {
  const state = workspaceStore.getState();
  const runRequestLayoutCommand = (command: () => void): void => {
    workspaceStore.getState().setActiveView("requests");
    window.requestAnimationFrame(() => {
      if (workspaceStore.getState().activeView === "requests") {
        command();
      }
    });
  };
  const workspaceCommands = workspaceDefinitions.map((definition) => ({
    id: `workspace-${definition.id}`,
    label:
      definition.id === "requests"
        ? t("palette.openRequests")
        : t("palette.openWorkspace", {
            workspace: t(definition.labelKey),
          }),
    group:
      definition.id === "requests"
        ? t("palette.group.navigate")
        : t("palette.group.developerTools"),
    keywords: `${definition.keywords} ${t(definition.descriptionKey)}`,
    icon: definition.icon,
    run: () => state.setActiveView(definition.id),
  }));
  const output: PaletteCommand[] = [
    {
      id: "new-request",
      label: t("chrome.newRequest"),
      group: t("palette.group.create"),
      keywords: "new request create",
      icon: "plus",
      run: () =>
        applicationCommands.openRequestDraft({
          name: t("chrome.untitledRequest"),
        }),
    },
    {
      id: "import-openapi",
      label: t("chrome.importOpenAPI"),
      group: t("palette.group.create"),
      keywords: "import openapi swagger specification içe aktar",
      icon: "import",
      run: () =>
        window.dispatchEvent(new CustomEvent("validex:import-openapi")),
    },
    ...workspaceCommands,
    {
      id: "theme",
      label:
        state.theme === "dark"
          ? t("palette.useLightTheme")
          : t("palette.useDarkTheme"),
      group: t("palette.group.appearance"),
      keywords: "theme dark light appearance",
      icon: state.theme === "dark" ? "sun" : "moon",
      run: () =>
        workspaceStore
          .getState()
          .setTheme(state.theme === "dark" ? "light" : "dark"),
    },
    {
      id: "sidebar",
      label: t("palette.toggleRequestPanel"),
      group: t("palette.group.appearance"),
      keywords: "sidebar panel layout",
      icon: "panel-left",
      run: () =>
        runRequestLayoutCommand(() => layoutCommands.togglePanel("left")),
    },
    {
      id: "context-panel",
      label: t("chrome.toggleContextPanel"),
      group: t("palette.group.appearance"),
      keywords: "context authorization variables panel bağlam değişken",
      icon: "panel-right",
      run: () =>
        runRequestLayoutCommand(() => layoutCommands.togglePanel("right")),
    },
    {
      id: "reset-layout",
      label: t("palette.resetPanelLayout"),
      group: t("palette.group.appearance"),
      keywords: "reset layout panels",
      icon: "refresh",
      run: () => runRequestLayoutCommand(() => layoutCommands.resetLayout()),
    },
  ];
  if (state.latestImportedSpec) {
    output.push({
      id: "open-imported",
      label: t("palette.openImportedAPIs"),
      group: t("palette.group.navigate"),
      keywords: `${state.latestImportedSpec.title} openapi api`,
      icon: "import",
      run: () => {
        const current = workspaceStore.getState();
        current.setActiveView("requests");
        current.setSidebarSection("apis");
      },
    });
  }
  void bootstrap;
  return output;
}

export function mountCommandPalette(
  root: HTMLElement,
  bootstrap: BootstrapData,
  layoutCommands: WorkspaceLayoutCommands,
): Disposable {
  const lifecycle = new Lifecycle();
  let dialog: DialogHandle | undefined;
  let dialogLifecycle: Lifecycle | undefined;
  let query = "";
  let selectedIndex = 0;

  const close = () => {
    dialog?.close("cancel");
    dialog = undefined;
    dialogLifecycle?.dispose();
    dialogLifecycle = undefined;
    query = "";
    selectedIndex = 0;
    workspaceStore.getState().setCommandPaletteOpen(false);
  };

  const filtered = () => {
    const all = commands(bootstrap, layoutCommands);
    return all.filter((command) =>
      fuzzyMatch(
        `${command.label} ${command.group} ${command.keywords}`,
        query,
        getLocale(),
      ),
    );
  };

  const renderResults = () => {
    if (!dialog) return;
    const list = requiredElement<HTMLElement>(
      dialog.element,
      "[data-palette-results]",
    );
    const matches = filtered();
    if (selectedIndex >= matches.length) selectedIndex = 0;
    setHTML(
      list,
      html`
        ${matches.length === 0
          ? html`
              <div class="palette-empty">
                ${icon("search", 20)}
                <span>${t("palette.noResult", { query })}</span>
              </div>
            `
          : matches.map(
              (command, index) => html`
                <button
                  type="button"
                  id="palette-option-${command.id}"
                  class="palette-option"
                  role="option"
                  tabindex="-1"
                  aria-selected="${index === selectedIndex
                    ? "true"
                    : "false"}"
                  data-state="${index === selectedIndex
                    ? "selected"
                    : "idle"}"
                  data-command-index="${index}"
                >
                  ${icon(command.icon, 16)}
                  <span>
                    <strong>${command.label}</strong>
                    <small>${command.group}</small>
                  </span>
                </button>
              `,
            )}
      `,
    );
    const input = dialog.element.querySelector<HTMLInputElement>(
      "[data-palette-input]",
    );
    const selected = matches[selectedIndex];
    if (selected) {
      input?.setAttribute(
        "aria-activedescendant",
        `palette-option-${selected.id}`,
      );
      dialog.element
        .querySelector<HTMLElement>(`#palette-option-${selected.id}`)
        ?.scrollIntoView?.({ block: "nearest" });
    } else {
      input?.removeAttribute("aria-activedescendant");
    }
    const footer = dialog.element.querySelector<HTMLElement>(
      "[data-palette-footer]",
    );
    if (footer) {
      footer.textContent = t(
        matches.length === 1
          ? "palette.available.one"
          : "palette.available.many",
        { count: matches.length },
      );
    }
  };

  const runSelected = (index = selectedIndex) => {
    const command = filtered()[index];
    if (!command) return;
    close();
    command.run();
  };

  const open = () => {
    if (dialog) return;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    dialog = presentDialog(
      html`
        <div class="command-palette-shell">
          <h2 class="sr-only">${t("palette.title")}</h2>
          <p class="sr-only">${t("palette.description")}</p>
          <div class="palette-search">
            ${icon("search", 16)}
            <input
              data-palette-input
              role="combobox"
              type="search"
              aria-controls="palette-results"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-label="${t("palette.searchAria")}"
              autocomplete="off"
              spellcheck="false"
              placeholder="${t("palette.search", {
                workspace: localizedBootstrapWorkspaceName(bootstrap),
              })}"
              value="${query}"
            />
            <kbd>Esc</kbd>
          </div>
          <div
            id="palette-results"
            class="palette-results"
            data-palette-results
            role="listbox"
            aria-label="${t("palette.results")}"
          ></div>
          <footer
            class="palette-footer command-palette-summary"
            data-palette-footer
            role="status"
            aria-live="polite"
            aria-atomic="true"
          ></footer>
        </div>
      `,
      {
        className: "command-palette",
        trigger,
        initialFocus: "[data-palette-input]",
      },
    );
    const current = dialog;
    void current.closed.then(() => {
      if (dialog !== current) return;
      dialog = undefined;
      dialogLifecycle?.dispose();
      dialogLifecycle = undefined;
      if (workspaceStore.getState().commandPaletteOpen) {
        workspaceStore.getState().setCommandPaletteOpen(false);
      }
    });
    const scope = new Lifecycle();
    dialogLifecycle = scope;
    scope.listen(current.element, "input", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      query = input.value;
      selectedIndex = 0;
      renderResults();
    });
    scope.listen(current.element, "keydown", (event) => {
      const matches = filtered();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectedIndex = matches.length
          ? (selectedIndex + 1) % matches.length
          : 0;
        renderResults();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectedIndex = matches.length
          ? (selectedIndex - 1 + matches.length) % matches.length
          : 0;
        renderResults();
      } else if (event.key === "Home" && matches.length) {
        event.preventDefault();
        selectedIndex = 0;
        renderResults();
      } else if (event.key === "End" && matches.length) {
        event.preventDefault();
        selectedIndex = matches.length - 1;
        renderResults();
      } else if (event.key === "Enter") {
        event.preventDefault();
        runSelected();
      }
    });
    scope.listen(current.element, "pointermove", (event) => {
      const option = eventElement<HTMLElement>(
        event,
        "[data-command-index]",
      );
      if (!option) return;
      const nextIndex = Number(option.dataset.commandIndex);
      if (nextIndex === selectedIndex) return;
      selectedIndex = nextIndex;
      renderResults();
    });
    scope.listen(current.element, "click", (event) => {
      const option = eventElement<HTMLElement>(
        event,
        "[data-command-index]",
      );
      if (option) runSelected(Number(option.dataset.commandIndex));
    });
    renderResults();
  };

  lifecycle.add(
    workspaceStore.subscribe((state, previous) => {
      if (
        state.commandPaletteOpen === previous.commandPaletteOpen &&
        !state.commandPaletteOpen
      ) {
        return;
      }
      if (state.commandPaletteOpen) open();
      else if (dialog) close();
    }),
  );
  lifecycle.add(
    subscribeLocale(() => {
      if (!dialog) return;
      close();
      workspaceStore.getState().setCommandPaletteOpen(true);
    }),
  );
  root.hidden = true;
  if (workspaceStore.getState().commandPaletteOpen) open();
  return {
    dispose() {
      close();
      lifecycle.dispose();
    },
  };
}
