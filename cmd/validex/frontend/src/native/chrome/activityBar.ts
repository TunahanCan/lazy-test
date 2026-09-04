import {
  Lifecycle,
  eventElement,
  html,
  setHTML,
  type Disposable,
} from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import { subscribeLocale, t } from "../../i18n/locale.js";
import type { WorkspaceView } from "../../lib/types.js";
import { workspaceStore } from "../../stores/workspace.js";
import { workspaceDefinitions } from "../workspaces.js";

export function mountActivityBar(root: HTMLElement): Disposable {
  const lifecycle = new Lifecycle();

  const render = () => {
    const activeView = workspaceStore.getState().activeView;
    setHTML(
      root,
      html`
        <nav class="activity-bar" aria-label="${t("workspace.navigation")}">
          ${workspaceDefinitions.map((definition, index) => {
            const active = definition.id === activeView;
            const label = t(definition.labelKey);
            const description = t(definition.descriptionKey);
            const startsGroup =
              definition.group === "tools" &&
              workspaceDefinitions[index - 1]?.group !== "tools";
            return html`
              ${startsGroup
                ? html`
                    <span class="activity-section-label" aria-hidden="true">
                      ${t("workspace.toolsLabel")}
                    </span>
                  `
                : ""}
              <button
                type="button"
                class="activity-item ${active ? "active" : ""}"
                data-workspace-view="${definition.id}"
                data-state="${active ? "active" : "inactive"}"
                aria-current="${active ? "page" : "false"}"
                aria-controls="workspace-view-${definition.id}"
                aria-describedby="workspace-description-${definition.id}"
                aria-label="${label}"
                tabindex="${active ? "0" : "-1"}"
                title="${label} — ${description}"
              >
                ${icon(definition.icon, 19)}
                <span
                  data-compact-label="${t(definition.compactLabelKey)}"
                >${label}</span>
                <span
                  id="workspace-description-${definition.id}"
                  class="sr-only workspace-description"
                >${description}</span>
              </button>
            `;
          })}
        </nav>
      `,
    );
    root
      .querySelector<HTMLElement>(".activity-item.active")
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  lifecycle.listen(root, "click", (event) => {
    const target = eventElement<HTMLElement>(event, "[data-workspace-view]");
    const view = target?.dataset.workspaceView as WorkspaceView | undefined;
    if (!view) return;
    workspaceStore.getState().setActiveView(view);
  });
  lifecycle.listen(root, "keydown", (event) => {
    const current = eventElement<HTMLButtonElement>(
      event,
      "[data-workspace-view]",
    );
    if (!current) return;
    const items = [
      ...root.querySelectorAll<HTMLButtonElement>("[data-workspace-view]"),
    ];
    const index = items.indexOf(current);
    let nextIndex: number | undefined;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (index + 1) % items.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = (index - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    }
    if (nextIndex === undefined) return;
    event.preventDefault();
    items[nextIndex]?.focus({ preventScroll: true });
  });
  lifecycle.add(
    workspaceStore.subscribe((state, previous) => {
      if (state.activeView !== previous.activeView) render();
    }),
  );
  lifecycle.add(subscribeLocale(render));
  render();

  return {
    dispose() {
      lifecycle.dispose();
      root.replaceChildren();
    },
  };
}
