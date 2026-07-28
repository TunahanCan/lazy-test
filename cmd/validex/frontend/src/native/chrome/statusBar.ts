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

export function mountStatusBar(
  root: HTMLElement,
  bootstrap: BootstrapData,
): Disposable {
  const lifecycle = new Lifecycle();
  let lastSignature = "";

  const render = (force = false) => {
    const state = workspaceStore.getState();
    const persistence = getCollectionLibraryPersistenceSnapshot();
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
          ? "warning"
          : active?.response
            ? "success"
            : "neutral";
    const signature = JSON.stringify([
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
    ]);
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
          </div>
          <div class="statusbar-current">
            <span
              class="statusbar-message"
              data-tone="${tone}"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              ${icon("protocols", 11)}
              ${activeStatus}
            </span>
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
        state.activeTabID !== previous.activeTabID
      ) {
        render();
      }
    }),
  );
  lifecycle.add(subscribeCollectionLibraryPersistence(render));
  lifecycle.add(subscribeLocale(() => render(true)));
  render();

  return {
    dispose() {
      lifecycle.dispose();
      root.replaceChildren();
    },
  };
}
