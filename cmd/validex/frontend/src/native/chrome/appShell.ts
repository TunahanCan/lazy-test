import {
  Lifecycle,
  eventElement,
  html,
  requiredElement,
  setHTML,
  type Disposable,
} from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import { closeActiveMenu } from "../../core/overlays.js";
import { subscribeLocale, t } from "../../i18n/locale.js";
import { backend } from "../../lib/backend.js";
import type {
  BootstrapData,
  RequestTab,
  WorkspaceView,
} from "../../lib/types.js";
import {
  collectionLibraryStore,
} from "../../stores/collectionLibrary.js";
import {
  getCollectionLibraryPersistenceSnapshot,
  subscribeCollectionLibraryPersistence,
} from "../../stores/collectionLibraryStorage.js";
import { workspaceStore } from "../../stores/workspace.js";
import { mountAutomationLab } from "../features/automation.js";
import { mountJSONLab } from "../features/json-lab.js";
import { mountProtocolLab } from "../features/protocol-lab.js";
import { mountRequestWorkspace } from "../requests/workspace.js";
import { workspaceDefinition } from "../workspaces.js";
import { mountActivityBar } from "./activityBar.js";
import { mountCommandPalette } from "./commandPalette.js";
import { mountContextPanel } from "./contextPanel.js";
import {
  clamp,
  fitPanelWidths,
  horizontalCenterMinWidth,
  panelCompactThresholdWidth,
  panelKeyboardStep,
  panelMaxWidth,
  panelMinWidth,
  panelResizerWidth,
  verticalCenterMinWidth,
} from "./layout.js";
import { mountSidebar } from "./sidebar.js";
import { mountStatusBar } from "./statusBar.js";
import { mountTopBar } from "./topBar.js";

type ToolView = Exclude<WorkspaceView, "requests">;
type ToolMount = (root: HTMLElement) => Disposable;

const toolMounts: Record<ToolView, () => Promise<ToolMount>> = {
  mock: async () => {
    const module = await import("../features/mockServer.js");
    return module.mountMockServerLab;
  },
  json: async () => mountJSONLab,
  diagnostics: async () => {
    const module = await import("../features/diagnostics.js");
    return module.mountDiagnosticsLab;
  },
  protocols: async () => mountProtocolLab,
  automation: async () => mountAutomationLab,
};

function savedLinks() {
  return collectionLibraryStore.getState().requests.map(
    ({
      id,
      collectionId,
      literalValues,
      name,
      method,
      url,
      headers,
      body,
    }) => ({
      id,
      collectionId,
      literalValues,
      name,
      method,
      url,
      headers,
      body,
    }),
  );
}

export function mountAppShell(
  root: HTMLElement,
  bootstrap: BootstrapData,
): Disposable {
  const lifecycle = new Lifecycle();
  const toolControllers = new Map<ToolView, Disposable>();
  const mountingTools = new Map<ToolView, Promise<void>>();
  let disposed = false;
  let compactPanel: "left" | "right" | null = null;
  let workspaceWidth = window.innerWidth;
  let previousView: WorkspaceView | undefined;
  let stopActiveResize: (() => void) | undefined;

  setHTML(
    root,
    html`
      <div class="app-shell">
        <div data-topbar></div>
        <div class="application-body">
          <div data-activity></div>
          ${(["mock", "json", "diagnostics", "protocols", "automation"] as const).map(
            (view) => html`
              <main
                id="workspace-view-${view}"
                class="tool-workspace"
                data-tool-view="${view}"
                aria-label="${t(workspaceDefinition(view).labelKey)}"
                hidden
                aria-hidden="true"
              >
                <div
                  class="tool-workspace-loading"
                  role="status"
                  aria-live="polite"
                >
                  ${icon("spinner", 22, "spin")}
                  <span>${t("shell.workspacePreparing")}</span>
                </div>
              </main>
            `,
          )}
          <main
            id="workspace-view-requests"
            class="workspace-layout"
            data-request-layout
            aria-label="${t(workspaceDefinition("requests").labelKey)}"
          >
            <button
              type="button"
              class="mobile-panel-scrim"
              data-action="close-compact"
              aria-label="${t("shell.closeSidePanel")}"
              hidden
            ></button>
            <div
              id="request-panel"
              class="panel-slot request-panel-slot"
              data-left-panel
            >
              <button
                type="button"
                class="icon-button mobile-panel-close"
                data-action="close-compact"
                aria-label="${t("shell.closeRequestPanel")}"
                hidden
              >
                ${icon("close", 15)}
              </button>
              <div data-sidebar></div>
            </div>
            <div
              class="panel-resizer panel-resizer-left"
              data-resizer="left"
              role="separator"
              tabindex="0"
              aria-orientation="vertical"
              aria-label="${t("shell.resizeRequestPanel")}"
              aria-controls="request-panel"
            ><span></span></div>
            <div class="center-workspace" data-request-workspace></div>
            <div
              class="panel-resizer panel-resizer-right"
              data-resizer="right"
              role="separator"
              tabindex="0"
              aria-orientation="vertical"
              aria-label="${t("shell.resizeContextPanel")}"
              aria-controls="context-panel"
            ><span></span></div>
            <div
              id="context-panel"
              class="panel-slot context-panel-slot"
              data-right-panel
            >
              <button
                type="button"
                class="icon-button mobile-panel-close"
                data-action="close-compact"
                aria-label="${t("shell.closeContextPanel")}"
                hidden
              >
                ${icon("close", 15)}
              </button>
              <div data-context></div>
            </div>
            <button
              type="button"
              class="icon-button panel-restore panel-restore-left"
              data-action="restore-left"
              aria-label="${t("shell.showRequestPanel")}"
              aria-controls="request-panel"
              hidden
            >
              ${icon("panel-left", 15)}
            </button>
            <button
              type="button"
              class="icon-button panel-restore panel-restore-right"
              data-action="restore-right"
              aria-label="${t("shell.showContextPanel")}"
              aria-controls="context-panel"
              hidden
            >
              ${icon("panel-right", 15)}
            </button>
          </main>
        </div>
        <div data-status></div>
        <div data-palette></div>
      </div>
    `,
  );

  const requestLayout = requiredElement<HTMLElement>(
    root,
    "[data-request-layout]",
  );
  const leftPanel = requiredElement<HTMLElement>(root, "[data-left-panel]");
  const rightPanel = requiredElement<HTMLElement>(root, "[data-right-panel]");
  const leftResizer = requiredElement<HTMLElement>(
    root,
    '[data-resizer="left"]',
  );
  const rightResizer = requiredElement<HTMLElement>(
    root,
    '[data-resizer="right"]',
  );
  const leftRestore = requiredElement<HTMLButtonElement>(
    root,
    '[data-action="restore-left"]',
  );
  const rightRestore = requiredElement<HTMLButtonElement>(
    root,
    '[data-action="restore-right"]',
  );
  const scrim = requiredElement<HTMLButtonElement>(
    root,
    ".mobile-panel-scrim",
  );
  const compactCloseButtons = [
    ...root.querySelectorAll<HTMLButtonElement>(".mobile-panel-close"),
  ];

  lifecycle.child(
    mountTopBar(requiredElement(root, "[data-topbar]"), bootstrap),
  );
  lifecycle.child(mountActivityBar(requiredElement(root, "[data-activity]")));
  lifecycle.child(
    mountSidebar(requiredElement(root, "[data-sidebar]"), bootstrap),
  );
  lifecycle.child(
    mountContextPanel(requiredElement(root, "[data-context]"), bootstrap),
  );
  lifecycle.child(
    mountRequestWorkspace(
      requiredElement(root, "[data-request-workspace]"),
      bootstrap,
    ),
  );
  lifecycle.child(
    mountStatusBar(requiredElement(root, "[data-status]"), bootstrap),
  );
  lifecycle.child(
    mountCommandPalette(requiredElement(root, "[data-palette]"), bootstrap),
  );

  const layoutState = () => {
    const state = workspaceStore.getState();
    const requestedCenterMinWidth =
      state.responsePlacement === "horizontal"
        ? horizontalCenterMinWidth
        : verticalCenterMinWidth;
    const requestedPanelCount =
      Number(state.leftVisible) + Number(state.rightVisible);
    const requestedMinimum =
      requestedCenterMinWidth +
      requestedPanelCount *
        (panelCompactThresholdWidth + panelResizerWidth);
    const compact =
      workspaceWidth <= 720 || workspaceWidth < requestedMinimum;
    const leftVisible = compact
      ? compactPanel === "left"
      : state.leftVisible;
    const rightVisible = compact
      ? compactPanel === "right"
      : state.rightVisible;
    const centerMinimum = compact ? 0 : requestedCenterMinWidth;
    const fitted = fitPanelWidths(
      workspaceWidth,
      centerMinimum,
      leftVisible,
      rightVisible,
      state.leftWidth,
      state.rightWidth,
    );
    return {
      state,
      compact,
      leftVisible,
      rightVisible,
      centerMinimum,
      fitted,
    };
  };

  const panelBounds = (side: "left" | "right") => {
    const layout = layoutState();
    const other =
      side === "left" ? layout.fitted.right : layout.fitted.left;
    const count =
      Number(layout.leftVisible) + Number(layout.rightVisible);
    const available = Math.max(
      0,
      workspaceWidth -
        layout.centerMinimum -
        count * panelResizerWidth -
        other,
    );
    const maximum = Math.min(panelMaxWidth, Math.floor(available));
    return { min: Math.min(panelMinWidth, maximum), max: maximum };
  };

  const setPanelWidth = (side: "left" | "right", width: number) => {
    const layout = layoutState();
    const state = workspaceStore.getState();
    if (side === "left") {
      if (state.rightVisible && state.rightWidth !== layout.fitted.right) {
        state.setRightWidth(layout.fitted.right);
      }
      state.setLeftWidth(width);
    } else {
      if (state.leftVisible && state.leftWidth !== layout.fitted.left) {
        state.setLeftWidth(layout.fitted.left);
      }
      state.setRightWidth(width);
    }
  };

  const updateLayout = () => {
    const layout = layoutState();
    requestLayout.classList.toggle("compact-layout", layout.compact);
    requestLayout.style.gridTemplateColumns = [
      layout.leftVisible
        ? `${layout.fitted.left}px 4px`
        : "0px 0px",
      `minmax(${layout.centerMinimum}px, 1fr)`,
      layout.rightVisible
        ? `4px ${layout.fitted.right}px`
        : "0px 0px",
    ].join(" ");
    leftPanel.classList.toggle("panel-hidden", !layout.leftVisible);
    rightPanel.classList.toggle("panel-hidden", !layout.rightVisible);
    leftPanel.toggleAttribute("inert", !layout.leftVisible);
    rightPanel.toggleAttribute("inert", !layout.rightVisible);
    leftPanel.setAttribute("aria-hidden", String(!layout.leftVisible));
    rightPanel.setAttribute("aria-hidden", String(!layout.rightVisible));
    leftResizer.classList.toggle("panel-hidden", !layout.leftVisible);
    rightResizer.classList.toggle("panel-hidden", !layout.rightVisible);
    leftResizer.toggleAttribute("inert", !layout.leftVisible);
    rightResizer.toggleAttribute("inert", !layout.rightVisible);
    leftResizer.tabIndex = layout.leftVisible ? 0 : -1;
    rightResizer.tabIndex = layout.rightVisible ? 0 : -1;
    leftResizer.setAttribute("aria-hidden", String(!layout.leftVisible));
    rightResizer.setAttribute("aria-hidden", String(!layout.rightVisible));
    leftRestore.hidden = layout.leftVisible;
    rightRestore.hidden = layout.rightVisible;
    leftRestore.setAttribute("aria-expanded", String(layout.leftVisible));
    rightRestore.setAttribute("aria-expanded", String(layout.rightVisible));
    scrim.hidden = !layout.compact || compactPanel === null;
    if (compactCloseButtons[0]) {
      compactCloseButtons[0].hidden =
        !layout.compact || compactPanel !== "left";
    }
    if (compactCloseButtons[1]) {
      compactCloseButtons[1].hidden =
        !layout.compact || compactPanel !== "right";
    }
    const leftBounds = panelBounds("left");
    const rightBounds = panelBounds("right");
    for (const [resizer, bounds, value] of [
      [leftResizer, leftBounds, layout.fitted.left],
      [rightResizer, rightBounds, layout.fitted.right],
    ] as const) {
      resizer.setAttribute("aria-valuemin", String(bounds.min));
      resizer.setAttribute("aria-valuemax", String(bounds.max));
      resizer.setAttribute("aria-valuenow", String(value));
    }
  };

  const focusViewHeading = (view: WorkspaceView) => {
    window.requestAnimationFrame(() => {
      if (disposed || workspaceStore.getState().activeView !== view) return;
      const visible = root.querySelector<HTMLElement>(
        view === "requests"
          ? ".workspace-layout:not([hidden]) h1"
          : `.tool-workspace[data-tool-view="${view}"]:not([hidden]) h1`,
      );
      if (!visible) return;
      visible.tabIndex = -1;
      visible.focus({ preventScroll: true });
    });
  };

  const renderToolLoading = (host: HTMLElement) => {
    setHTML(
      host,
      html`
        <div
          class="tool-workspace-loading"
          role="status"
          aria-live="polite"
        >
          ${icon("spinner", 22, "spin")}
          <span>${t("shell.workspacePreparing")}</span>
        </div>
      `,
    );
  };

  const ensureTool = (view: ToolView): Promise<void> => {
    if (toolControllers.has(view)) return Promise.resolve();
    const pending = mountingTools.get(view);
    if (pending) return pending;
    const operation = (async () => {
      const host = requiredElement<HTMLElement>(
        root,
        `[data-tool-view="${view}"]`,
      );
      try {
        const mount = await toolMounts[view]();
        if (disposed) return;
        host.replaceChildren();
        toolControllers.set(view, mount(host));
      } catch {
        if (disposed) return;
        setHTML(
          host,
          html`
            <section class="tool-page tool-workspace-error" role="alert">
              <h1 data-tool-load-error-title>
                ${t("shell.toolLoadFailed.title")}
              </h1>
              <p data-tool-load-error-message>
                ${t("shell.toolLoadFailed.message")}
              </p>
              <button
                type="button"
                class="button secondary"
                data-retry-tool="${view}"
                data-tool-load-error-retry
              >
                ${t("shell.toolLoadFailed.retry")}
              </button>
            </section>
          `,
        );
      }
    })().finally(() => mountingTools.delete(view));
    mountingTools.set(view, operation);
    return operation;
  };

  const updateView = () => {
    const view = workspaceStore.getState().activeView;
    const changed = view !== previousView;
    requestLayout.hidden = view !== "requests";
    requestLayout.setAttribute("aria-hidden", String(view !== "requests"));
    for (const host of root.querySelectorAll<HTMLElement>("[data-tool-view]")) {
      const active = host.dataset.toolView === view;
      host.hidden = !active;
      host.setAttribute("aria-hidden", String(!active));
    }
    if (view !== "requests" && changed) {
      void ensureTool(view).then(() => focusViewHeading(view));
    }
    if (changed) {
      previousView = view;
      if (view === "requests") focusViewHeading(view);
    }
  };

  const startResize = (side: "left" | "right", event: PointerEvent) => {
    event.preventDefault();
    stopActiveResize?.();
    const layout = layoutState();
    const startX = event.clientX;
    const start =
      side === "left" ? layout.fitted.left : layout.fitted.right;
    const bounds = panelBounds(side);
    document.body.classList.add("resizing");
    const move = (moveEvent: PointerEvent) => {
      const delta =
        side === "left"
          ? moveEvent.clientX - startX
          : startX - moveEvent.clientX;
      setPanelWidth(side, clamp(start + delta, bounds.min, bounds.max));
    };
    const stop = () => {
      document.body.classList.remove("resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
      if (stopActiveResize === stop) stopActiveResize = undefined;
    };
    stopActiveResize = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
  };
  lifecycle.add(() => stopActiveResize?.());

  lifecycle.listen(root, "click", (event) => {
    const retry = eventElement<HTMLElement>(event, "[data-retry-tool]");
    const view = retry?.dataset.retryTool as ToolView | undefined;
    if (!view || !(view in toolMounts)) return;
    const host = requiredElement<HTMLElement>(
      root,
      `[data-tool-view="${view}"]`,
    );
    renderToolLoading(host);
    void ensureTool(view).then(() => focusViewHeading(view));
  });

  lifecycle.listen(requestLayout, "pointerdown", (event) => {
    const resizer = eventElement<HTMLElement>(event, "[data-resizer]");
    if (resizer?.dataset.resizer) {
      startResize(resizer.dataset.resizer as "left" | "right", event);
    }
  });
  lifecycle.listen(requestLayout, "keydown", (event) => {
    const resizer = eventElement<HTMLElement>(event, "[data-resizer]");
    const side = resizer?.dataset.resizer as "left" | "right" | undefined;
    if (!side) return;
    const bounds = panelBounds(side);
    const layout = layoutState();
    const current =
      side === "left" ? layout.fitted.left : layout.fitted.right;
    const direction = side === "left" ? 1 : -1;
    let next: number | undefined;
    if (event.key === "Home") next = bounds.min;
    if (event.key === "End") next = bounds.max;
    if (event.key === "ArrowLeft") {
      next = current - panelKeyboardStep * direction;
    }
    if (event.key === "ArrowRight") {
      next = current + panelKeyboardStep * direction;
    }
    if (next === undefined) return;
    event.preventDefault();
    setPanelWidth(side, clamp(next, bounds.min, bounds.max));
  });
  lifecycle.listen(requestLayout, "click", (event) => {
    const action = eventElement<HTMLElement>(event, "[data-action]")?.dataset
      .action;
    if (action === "close-compact") {
      const closedSide = compactPanel;
      compactPanel = null;
      updateLayout();
      const restore = closedSide === "right" ? rightRestore : leftRestore;
      window.requestAnimationFrame(() => {
        if (!disposed && !restore.hidden) restore.focus();
      });
    } else if (action === "restore-left") {
      const layout = layoutState();
      if (layout.compact) compactPanel = "left";
      else workspaceStore.getState().toggleLeft();
      updateLayout();
      window.requestAnimationFrame(() => {
        if (disposed) return;
        (layout.compact ? compactCloseButtons[0] : leftResizer)?.focus();
      });
    } else if (action === "restore-right") {
      const layout = layoutState();
      if (layout.compact) compactPanel = "right";
      else workspaceStore.getState().toggleRight();
      updateLayout();
      window.requestAnimationFrame(() => {
        if (disposed) return;
        (layout.compact ? compactCloseButtons[1] : rightResizer)?.focus();
      });
    }
  });

  lifecycle.listen(window, "keydown", (event) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape" && compactPanel) {
      event.preventDefault();
      const closedSide = compactPanel;
      compactPanel = null;
      updateLayout();
      const restore = closedSide === "right" ? rightRestore : leftRestore;
      window.requestAnimationFrame(() => {
        if (!disposed && !restore.hidden) restore.focus();
      });
      return;
    }
    const command = event.metaKey || event.ctrlKey;
    const state = workspaceStore.getState();
    if (command && event.key.toLowerCase() === "k") {
      event.preventDefault();
      state.setCommandPaletteOpen(true);
    } else if (command && event.key.toLowerCase() === "n") {
      event.preventDefault();
      state.openTab({ name: t("chrome.untitledRequest"), dirty: true });
    } else if (command && event.shiftKey && event.key.toLowerCase() === "t") {
      event.preventDefault();
      state.reopenClosedTab();
    } else if (event.key === "Escape") {
      closeActiveMenu();
      const tab = state.tabs.find(
        (candidate) => candidate.id === state.activeTabID,
      );
      if (
        tab?.running &&
        !document.querySelector('[role="dialog"], [role="menu"]')
      ) {
        event.preventDefault();
        void cancelActiveRequest(tab);
      }
    }
  });

  const cancelActiveRequest = async (tab: RequestTab) => {
    try {
      const canceled = await backend.cancelRequest(tab.id);
      if (!canceled) {
        workspaceStore.getState().updateTab(tab.id, {
          running: false,
          error: true,
          userError: {
            code: "cancel_not_found",
            title: t("shell.cancelNotFound.title"),
            message: t("shell.cancelNotFound.message"),
            hint: t("shell.cancelNotFound.hint"),
          },
        });
      }
    } catch (error) {
      workspaceStore.getState().updateTab(tab.id, {
        running: false,
        error: true,
        userError: {
          code: "cancel_failed",
          title: t("shell.cancelFailed.title"),
          message: t("shell.cancelFailed.message"),
          hint: t("shell.cancelFailed.hint"),
          technical: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  const measure = () => {
    workspaceWidth = requestLayout.clientWidth || window.innerWidth;
    updateLayout();
  };
  lifecycle.listen(window, "resize", measure);
  const observer =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(measure);
  observer?.observe(requestLayout);
  if (observer) lifecycle.add(() => observer.disconnect());

  const reconcile = () => {
    if (!getCollectionLibraryPersistenceSnapshot().hydrated) return;
    workspaceStore.getState().reconcileSavedRequestLinks(savedLinks());
  };
  lifecycle.add(
    workspaceStore.subscribe(() => {
      updateView();
      updateLayout();
    }),
  );
  lifecycle.add(collectionLibraryStore.subscribe(reconcile));
  lifecycle.add(
    subscribeCollectionLibraryPersistence(() => {
      reconcile();
      updateLayout();
    }),
  );
  lifecycle.add(
    subscribeLocale(() => {
      const labels = [
        [scrim, "shell.closeSidePanel"],
        [leftResizer, "shell.resizeRequestPanel"],
        [rightResizer, "shell.resizeContextPanel"],
        [leftRestore, "shell.showRequestPanel"],
        [rightRestore, "shell.showContextPanel"],
      ] as const;
      for (const [element, key] of labels) {
        element.setAttribute("aria-label", t(key));
      }
      compactCloseButtons[0]?.setAttribute(
        "aria-label",
        t("shell.closeRequestPanel"),
      );
      compactCloseButtons[1]?.setAttribute(
        "aria-label",
        t("shell.closeContextPanel"),
      );
      for (const loading of root.querySelectorAll<HTMLElement>(
        ".tool-workspace-loading span",
      )) {
        loading.textContent = t("shell.workspacePreparing");
      }
      for (const title of root.querySelectorAll<HTMLElement>(
        "[data-tool-load-error-title]",
      )) {
        title.textContent = t("shell.toolLoadFailed.title");
      }
      for (const message of root.querySelectorAll<HTMLElement>(
        "[data-tool-load-error-message]",
      )) {
        message.textContent = t("shell.toolLoadFailed.message");
      }
      for (const retry of root.querySelectorAll<HTMLElement>(
        "[data-tool-load-error-retry]",
      )) {
        retry.textContent = t("shell.toolLoadFailed.retry");
      }
      requestLayout.setAttribute(
        "aria-label",
        t(workspaceDefinition("requests").labelKey),
      );
      for (const host of root.querySelectorAll<HTMLElement>(
        "[data-tool-view]",
      )) {
        const view = host.dataset.toolView as ToolView | undefined;
        if (view && view in toolMounts) {
          host.setAttribute(
            "aria-label",
            t(workspaceDefinition(view).labelKey),
          );
        }
      }
    }),
  );
  reconcile();
  measure();
  updateView();

  return {
    dispose() {
      disposed = true;
      observer?.disconnect();
      for (const controller of toolControllers.values()) controller.dispose();
      lifecycle.dispose();
      root.replaceChildren();
    },
  };
}
