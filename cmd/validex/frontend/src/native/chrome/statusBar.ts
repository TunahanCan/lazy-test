import {
  Lifecycle,
  html,
  setHTML,
  type Disposable,
} from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import { subscribeLocale, t } from "../../i18n/locale.js";
import type { BootstrapData } from "../../lib/types.js";
import {
  COLLECTION_LIBRARY_PERSISTENCE_PHASE,
  getCollectionLibraryPersistenceSnapshot,
  subscribeCollectionLibraryPersistence,
} from "../../stores/collectionLibraryStorage.js";
import { workspaceStore } from "../../stores/workspace.js";
import { workspaceDefinition } from "../workspaces.js";
import {
  subscribeWorkspaceActivity,
  workspaceIsBusy,
} from "./workspaceActivity.js";

export function mountStatusBar(
  root: HTMLElement,
  bootstrap: BootstrapData,
): Disposable {
  const lifecycle = new Lifecycle();
  let lastSignature = "";

  const render = (force = false) => {
    const state = workspaceStore.getState();
    const persistence = getCollectionLibraryPersistenceSnapshot();
    const requestViewActive = state.activeView === "requests";
    const activeWorkspace = requestViewActive
      ? undefined
      : workspaceDefinition(state.activeView);
    const activeWorkspaceBusy = activeWorkspace
      ? workspaceIsBusy(activeWorkspace.id)
      : false;
    const active = state.tabs.find((tab) => tab.id === state.activeTabID);
    const runningCount = state.tabs.filter((tab) => tab.running).length;
    const failedCount = state.tabs.filter(
      (tab) => tab.error && !tab.running,
    ).length;
    const activeStatus = active?.running
      ? t("status.requestRunning")
      : persistence.phase === COLLECTION_LIBRARY_PERSISTENCE_PHASE.SAVING
        ? t("status.collectionSaving")
        : persistence.phase === COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR
          ? t(
              persistence.operation === "read"
                ? "status.collectionLoadFailed"
                : "status.collectionSaveFailed",
            )
          : active?.error
            ? t("status.requestFailed")
            : active?.dirty
              ? t("status.draftSaved")
              : active?.response
                ? t("status.responseReceived", {
                    status: active.response.statusCode,
                  })
                : active?.savedRequestId
                  ? t("status.savedRequest")
                  : active
                    ? t("status.requestReady")
                    : t("status.noActiveRequest");
    const tone = active?.running
      ? "progress"
      : persistence.phase === COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR ||
          active?.error
        ? "error"
        : active?.dirty
          ? "draft"
          : active?.response
            ? "success"
            : "neutral";
    const signature = requestViewActive
      ? JSON.stringify([
          state.activeView,
          state.tabs.length,
          runningCount,
          failedCount,
          state.activeTabID,
          active?.running,
          active?.error,
          active?.dirty,
          active?.response?.statusCode,
          Boolean(active?.savedRequestId),
          persistence.phase,
          persistence.operation,
        ])
      : JSON.stringify([state.activeView, activeWorkspaceBusy]);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;

    setHTML(
      root,
      html`
        <footer
          class="statusbar"
          aria-label="${t("status.barLabel")}"
        >
          <div class="statusbar-summary">
            ${activeWorkspace
              ? html`
                  <span data-workspace-view="${activeWorkspace.id}">
                    ${icon(activeWorkspace.icon, 12)}
                    ${t(activeWorkspace.labelKey)}
                  </span>
                `
              : html`
                  <span>
                    ${icon("collection", 12)}
                    ${t(
                      state.tabs.length === 1
                        ? "status.openRequest.one"
                        : "status.openRequest.many",
                      { count: state.tabs.length },
                    )}
                  </span>
                  ${runningCount > 0
                    ? html`
                        <span>
                          ${icon("spinner", 12, "spin")}
                          ${t(
                            runningCount === 1
                              ? "status.running.one"
                              : "status.running.many",
                            { count: runningCount },
                          )}
                        </span>
                      `
                    : ""}
                  ${failedCount > 0
                    ? html`
                        <span>
                          ${icon("error", 12)}
                          ${t(
                            failedCount === 1
                              ? "status.failed.one"
                              : "status.failed.many",
                            { count: failedCount },
                          )}
                        </span>
                      `
                    : ""}
                `}
          </div>
          <div class="statusbar-current">
            ${activeWorkspace
              ? html`
                  <span
                    class="statusbar-message"
                    data-tone="${activeWorkspaceBusy
                      ? "progress"
                      : "neutral"}"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    ${icon(
                      activeWorkspaceBusy ? "spinner" : "check",
                      11,
                      activeWorkspaceBusy ? "spin" : "",
                    )}
                    ${t(
                      activeWorkspaceBusy
                        ? "status.workspaceBusy"
                        : "status.workspaceReady",
                    )}
                  </span>
                `
              : html`
                  <span
                    class="statusbar-message"
                    data-tone="${tone}"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    ${icon(
                      active?.running
                        ? "spinner"
                        : persistence.phase ===
                              COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR ||
                            active?.error
                          ? "error"
                          : active?.dirty
                            ? "save"
                            : active?.response
                              ? "check"
                              : active?.savedRequestId
                                ? "collection"
                                : "info",
                      11,
                      active?.running ? "spin" : "",
                    )}
                    ${activeStatus}
                  </span>
                `}
            <span class="statusbar-version">Validex ${bootstrap.appVersion}</span>
          </div>
        </footer>
      `,
    );
  };

  lifecycle.add(
    workspaceStore.subscribe((state, previous) => {
      if (
        state.tabs !== previous.tabs ||
        state.activeTabID !== previous.activeTabID ||
        state.activeView !== previous.activeView
      ) {
        render();
      }
    }),
  );
  lifecycle.add(subscribeCollectionLibraryPersistence(render));
  lifecycle.add(subscribeWorkspaceActivity(render));
  lifecycle.add(subscribeLocale(() => render(true)));
  render();

  return {
    dispose() {
      lifecycle.dispose();
      root.replaceChildren();
    },
  };
}
