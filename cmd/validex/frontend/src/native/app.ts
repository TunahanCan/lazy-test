import {
  eventElement,
  html,
  Lifecycle,
  setHTML,
  type Disposable,
} from "../core/dom.js";
import { icon } from "../core/icons.js";
import {
  initializeLocale,
  subscribeLocale,
  t,
} from "../i18n/locale.js";
import { applyTheme, watchSystemTheme } from "../app/theme.js";
import { backend } from "../lib/backend.js";
import type { BootstrapData } from "../lib/types.js";
import { workspaceStore } from "../stores/workspace.js";
import { mountAppShell } from "./chrome/appShell.js";

type StartupState =
  | { phase: "loading" }
  | { phase: "error"; error: unknown; detailsVisible: boolean }
  | { phase: "ready"; bootstrap: BootstrapData };

let bootstrapInFlight: Promise<BootstrapData> | undefined;

async function bootstrapWithRetry(): Promise<BootstrapData> {
  try {
    return await backend.bootstrap();
  } catch {
    return backend.bootstrap();
  }
}

function sharedBootstrap(): Promise<BootstrapData> {
  bootstrapInFlight ??= bootstrapWithRetry().finally(() => {
    bootstrapInFlight = undefined;
  });
  return bootstrapInFlight;
}

function technicalError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error !== undefined && error !== null) return String(error);
  return t("app.bootstrap.noDetails");
}

export function mountApp(root: HTMLElement): Disposable {
  const lifecycle = new Lifecycle();
  let state: StartupState = { phase: "loading" };
  let shell: Disposable | undefined;
  let requestVersion = 0;
  let disposed = false;

  lifecycle.add(initializeLocale());
  lifecycle.add(
    watchSystemTheme(() => workspaceStore.getState().theme),
  );
  lifecycle.add(
    workspaceStore.subscribe((next, previous) => {
      if (next.theme !== previous.theme) applyTheme(next.theme);
    }),
  );

  const render = () => {
    if (state.phase === "ready") return;
    if (state.phase === "loading") {
      setHTML(
        root,
        html`
          <main class="center-screen" aria-busy="true">
            ${icon("spinner", 22, "spin")}
            <span>${t("app.workspacePreparing")}</span>
          </main>
        `,
      );
      return;
    }

    const description = state.detailsVisible
      ? t("app.bootstrap.descriptionWithDetails", {
          details: technicalError(state.error),
        })
      : t("app.bootstrap.description");
    setHTML(
      root,
      html`
        <main class="center-screen">
          <section class="empty-state" role="alert">
            <div class="empty-icon empty-icon-error">
              ${icon("warning", 24)}
            </div>
            <h2>${t("app.bootstrap.title")}</h2>
            <p>${description}</p>
            <div class="empty-actions">
              <button
                type="button"
                class="button button-primary"
                data-startup-action="retry"
              >
                ${t("app.bootstrap.retry")}
              </button>
              <button
                type="button"
                class="button"
                data-startup-action="details"
              >
                ${state.detailsVisible
                  ? t("app.bootstrap.hideDetails")
                  : t("app.bootstrap.showDetails")}
              </button>
            </div>
          </section>
        </main>
      `,
    );
  };

  const load = async () => {
    const version = ++requestVersion;
    shell?.dispose();
    shell = undefined;
    state = { phase: "loading" };
    render();
    try {
      const bootstrap = await sharedBootstrap();
      if (disposed || requestVersion !== version) return;
      state = { phase: "ready", bootstrap };
      shell = mountAppShell(root, bootstrap);
    } catch (error) {
      if (disposed || requestVersion !== version) return;
      state = { phase: "error", error, detailsVisible: false };
      render();
    }
  };

  lifecycle.listen(root, "click", (event) => {
    const action = eventElement<HTMLElement>(
      event,
      "[data-startup-action]",
    )?.dataset.startupAction;
    if (action === "retry") {
      void load();
    } else if (action === "details" && state.phase === "error") {
      state = {
        ...state,
        detailsVisible: !state.detailsVisible,
      };
      render();
    }
  });
  lifecycle.add(
    subscribeLocale(() => {
      if (state.phase !== "ready") render();
    }),
  );

  applyTheme(workspaceStore.getState().theme);
  void load();

  return {
    dispose() {
      disposed = true;
      requestVersion += 1;
      shell?.dispose();
      lifecycle.dispose();
      root.replaceChildren();
    },
  };
}
