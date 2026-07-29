import {
  Lifecycle,
  focusFirst,
  html,
  setHTML,
  type Disposable,
  type TrustedHTMLFragment,
} from "./dom.js";
import { icon, type IconName } from "./icons.js";

export interface MenuAction {
  kind?: "item";
  label: string;
  icon?: IconName;
  disabled?: boolean;
  danger?: boolean;
  shortcut?: string;
  action(): void | Promise<void>;
}

export interface MenuSeparator {
  kind: "separator";
}

export type MenuEntry = MenuAction | MenuSeparator;

export interface MenuPosition {
  anchor?: HTMLElement;
  point?: { x: number; y: number };
  align?: "start" | "end";
}

export interface OpenMenuOptions extends MenuPosition {
  label: string;
  entries: readonly MenuEntry[];
  restoreFocus?: HTMLElement;
}

export interface OpenOverlay extends Disposable {
  close(restoreFocus?: boolean): void;
  element: HTMLElement;
}

function menuButtons(menu: HTMLElement): HTMLButtonElement[] {
  return [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].filter(
    (item) => !item.disabled,
  );
}

function focusMenuItem(menu: HTMLElement, index: number): void {
  const items = menuButtons(menu);
  if (items.length === 0) return;
  for (const item of items) item.removeAttribute("data-highlighted");
  const normalized = ((index % items.length) + items.length) % items.length;
  const item = items[normalized];
  item.dataset.highlighted = "";
  item.focus();
}

export function openMenu(options: OpenMenuOptions): OpenOverlay {
  closeActiveMenu(false);
  const lifecycle = new Lifecycle();
  const restoreFocus = options.restoreFocus ?? options.anchor;
  const menu = document.createElement("div");
  menu.className = "menu-content native-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", options.label);
  menu.dataset.state = "open";
  menu.tabIndex = -1;

  setHTML(
    menu,
    html`${options.entries.map((entry, index) =>
      entry.kind === "separator"
        ? html`<div class="menu-separator" role="separator"></div>`
        : html`
            <button
              type="button"
              class="menu-item${entry.danger ? " danger" : ""}"
              role="menuitem"
              data-menu-index="${index}"
              ${entry.disabled ? "disabled data-disabled" : ""}
            >
              ${entry.icon ? icon(entry.icon, 15) : ""}
              <span>${entry.label}</span>
              ${entry.shortcut
                ? html`<kbd class="menu-shortcut">${entry.shortcut}</kbd>`
                : ""}
            </button>
          `,
    )}`,
  );

  document.body.append(menu);
  const anchorRect = options.anchor?.getBoundingClientRect();
  const desiredX =
    options.point?.x ??
    (options.align === "end" ? anchorRect?.right : anchorRect?.left) ??
    8;
  const desiredY = options.point?.y ?? anchorRect?.bottom ?? 8;
  const rect = menu.getBoundingClientRect();
  const left =
    options.align === "end"
      ? Math.min(window.innerWidth - rect.width - 8, desiredX - rect.width)
      : Math.min(window.innerWidth - rect.width - 8, desiredX);
  menu.style.position = "fixed";
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(
    8,
    Math.min(window.innerHeight - rect.height - 8, desiredY + 4),
  )}px`;
  menu.style.zIndex = "1000";

  let closed = false;
  const overlay: OpenOverlay = {
    element: menu,
    close(shouldRestore = true) {
      if (closed) return;
      closed = true;
      lifecycle.dispose();
      menu.remove();
      if (activeMenu === overlay) activeMenu = undefined;
      if (shouldRestore) restoreFocus?.focus();
    },
    dispose() {
      overlay.close(false);
    },
  };
  activeMenu = overlay;

  lifecycle.listen(menu, "click", (event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-menu-index]")
        : null;
    if (!target || target.disabled) return;
    const entry = options.entries[Number(target.dataset.menuIndex)];
    if (!entry || entry.kind === "separator") return;
    overlay.close(false);
    void entry.action();
  });
  lifecycle.listen(menu, "pointermove", (event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[role="menuitem"]')
        : null;
    if (!target || target.disabled) return;
    for (const item of menuButtons(menu)) item.removeAttribute("data-highlighted");
    target.dataset.highlighted = "";
    target.focus({ preventScroll: true });
  });
  lifecycle.listen(menu, "keydown", (event) => {
    const items = menuButtons(menu);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusMenuItem(menu, current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuItem(menu, current - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusMenuItem(menu, 0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusMenuItem(menu, -1);
    } else if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      overlay.close();
    }
  });
  lifecycle.listen(
    document,
    "pointerdown",
    (event) => {
      const target = event.target;
      if (target instanceof Node && menu.contains(target)) return;
      overlay.close(false);
    },
    true,
  );
  lifecycle.listen(window, "blur", () => overlay.close(false));
  window.requestAnimationFrame(() => focusMenuItem(menu, 0));
  return overlay;
}

let activeMenu: OpenOverlay | undefined;

export function closeActiveMenu(restoreFocus = true): void {
  activeMenu?.close(restoreFocus);
}

export interface DialogHandle extends Disposable {
  element: HTMLDialogElement;
  close(value?: string): void;
  closed: Promise<string>;
}

export interface DialogOptions {
  className?: string;
  trigger?: HTMLElement;
  initialFocus?: string;
  describedBy?: string;
  closeOnBackdrop?: boolean;
}

let dialogSequence = 0;

const dialogFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function dialogFocusables(dialog: HTMLDialogElement): HTMLElement[] {
  return [
    ...dialog.querySelectorAll<HTMLElement>(dialogFocusableSelector),
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hidden &&
      !element.closest("[hidden], [inert]") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}

function focusRestoreSelector(
  trigger: HTMLElement | undefined,
): string | undefined {
  if (!trigger) return undefined;
  if (trigger.id) return `#${CSS.escape(trigger.id)}`;
  const parts: string[] = [];
  for (const attribute of [
    "data-focus",
    "data-action",
    "data-tab-id",
    "data-library-kind",
    "data-library-item-id",
    "data-key",
  ]) {
    const value = trigger.getAttribute(attribute);
    if (value !== null) {
      parts.push(`[${attribute}="${CSS.escape(value)}"]`);
    }
  }
  if (parts.length > 0) return parts.join("");
  const name = trigger.getAttribute("name");
  return name ? `[name="${CSS.escape(name)}"]` : undefined;
}

export function presentDialog(
  content: TrustedHTMLFragment,
  options: DialogOptions = {},
): DialogHandle {
  const lifecycle = new Lifecycle();
  const dialog = document.createElement("dialog");
  dialog.className = `dialog native-dialog ${options.className ?? ""}`.trim();
  setHTML(dialog, content);
  const heading = dialog.querySelector<HTMLElement>("h1, h2, h3");
  if (heading) {
    if (!heading.id) {
      dialogSequence += 1;
      heading.id = `native-dialog-title-${dialogSequence}`;
    }
    dialog.setAttribute("aria-labelledby", heading.id);
  }
  if (options.describedBy) {
    dialog.setAttribute("aria-describedby", options.describedBy);
  }
  document.body.append(dialog);
  const restoreTrigger =
    options.trigger ??
    (document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined);
  const restoreSelector = focusRestoreSelector(restoreTrigger);

  let resolveClosed!: (value: string) => void;
  let finished = false;
  const closed = new Promise<string>((resolve) => {
    resolveClosed = resolve;
  });
  const finish = (value = "") => {
    if (finished) return;
    finished = true;
    lifecycle.dispose();
    dialog.remove();
    window.requestAnimationFrame(() => {
      if (document.querySelector("dialog[open]")) return;
      const replacement =
        restoreTrigger?.isConnected &&
        !restoreTrigger.matches(":disabled") &&
        !restoreTrigger.closest("[hidden], [inert]")
          ? restoreTrigger
          : restoreSelector
            ? document.querySelector<HTMLElement>(restoreSelector)
            : undefined;
      if (
        replacement &&
        !replacement.matches(":disabled") &&
        !replacement.closest("[hidden], [inert]")
      ) {
        replacement.focus({ preventScroll: true });
      }
    });
    resolveClosed(value);
  };
  const handle: DialogHandle = {
    element: dialog,
    closed,
    close(value = "") {
      if (dialog.open) dialog.close(value);
      else finish(value);
    },
    dispose() {
      handle.close();
    },
  };

  lifecycle.listen(dialog, "close", () => finish(dialog.returnValue));
  lifecycle.listen(dialog, "cancel", (event) => {
    event.preventDefault();
    handle.close("cancel");
  });
  lifecycle.listen(dialog, "keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusables = dialogFocusables(dialog);
    if (focusables.length === 0) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }
    const active =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const activeIndex = active ? focusables.indexOf(active) : -1;
    if (activeIndex === -1) {
      event.preventDefault();
      focusables[event.shiftKey ? focusables.length - 1 : 0]?.focus({
        preventScroll: true,
      });
      return;
    }
    if (event.shiftKey && activeIndex === 0) {
      event.preventDefault();
      focusables[focusables.length - 1]?.focus({ preventScroll: true });
    } else if (!event.shiftKey && activeIndex === focusables.length - 1) {
      event.preventDefault();
      focusables[0]?.focus({ preventScroll: true });
    }
  });
  if (options.closeOnBackdrop !== false) {
    lifecycle.listen(dialog, "pointerdown", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const inside =
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;
      if (!inside) handle.close("cancel");
    });
  }
  lifecycle.listen(dialog, "click", (event) => {
    const closeButton =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-dialog-close]")
        : null;
    if (closeButton) handle.close(closeButton.dataset.dialogClose || "cancel");
  });

  dialog.showModal();
  window.requestAnimationFrame(() =>
    focusFirst(dialog, options.initialFocus ?? undefined),
  );
  return handle;
}

export interface ConfirmDialogOptions {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  trigger?: HTMLElement;
}

export async function confirmDialog(
  options: ConfirmDialogOptions,
): Promise<boolean> {
  const dialog = presentDialog(
    html`
      <div class="dialog-header">
        <div>
          <h2>${options.title}</h2>
          <p>${options.description}</p>
        </div>
        <button
          type="button"
          class="icon-button"
          aria-label="${options.cancelLabel}"
          data-dialog-close="cancel"
        >
          ${icon("close", 16)}
        </button>
      </div>
      <div class="dialog-actions">
        <button
          type="button"
          class="button secondary"
          data-dialog-close="cancel"
          data-cancel
        >
          ${options.cancelLabel}
        </button>
        <button
          type="button"
          class="button ${options.danger ? "danger" : "primary"}"
          data-dialog-close="confirm"
          data-confirm
        >
          ${options.confirmLabel}
        </button>
      </div>
    `,
    {
      trigger: options.trigger,
      initialFocus: options.danger ? "[data-cancel]" : "[data-confirm]",
    },
  );
  return (await dialog.closed) === "confirm";
}

export function activateTab(
  root: HTMLElement,
  tabID: string,
  notify = true,
): void {
  const tabs = [
    ...root.querySelectorAll<HTMLElement>('[role="tab"][data-tab]'),
  ];
  for (const tab of tabs) {
    const active = tab.dataset.tab === tabID;
    tab.dataset.state = active ? "active" : "inactive";
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of root.querySelectorAll<HTMLElement>(
    '[role="tabpanel"][data-panel]',
  )) {
    const active = panel.dataset.panel === tabID;
    panel.hidden = !active;
    panel.dataset.state = active ? "active" : "inactive";
  }
  if (notify) {
    root.dispatchEvent(
      new CustomEvent("validex:tabchange", {
        bubbles: true,
        detail: { tab: tabID },
      }),
    );
  }
}

export function bindTabs(
  root: HTMLElement,
  initialTab?: string,
): Disposable {
  const lifecycle = new Lifecycle();
  const tabs = () => [
    ...root.querySelectorAll<HTMLElement>('[role="tab"][data-tab]'),
  ];
  const select = (tab: HTMLElement, focus = false) => {
    const tabID = tab.dataset.tab;
    if (!tabID) return;
    activateTab(root, tabID);
    if (focus) tab.focus();
  };
  lifecycle.listen(root, "click", (event) => {
    const tab =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[role="tab"][data-tab]')
        : null;
    if (tab && root.contains(tab)) select(tab);
  });
  lifecycle.listen(root, "pointerdown", (event) => {
    if (event.button !== 0) return;
    const tab =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[role="tab"][data-tab]')
        : null;
    if (tab && root.contains(tab)) select(tab);
  });
  lifecycle.listen(root, "keydown", (event) => {
    const tab =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[role="tab"][data-tab]')
        : null;
    if (!tab || !root.contains(tab)) return;
    const items = tabs();
    const index = items.indexOf(tab);
    let next: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    select(items[((next % items.length) + items.length) % items.length], true);
  });
  const selected =
    initialTab ??
    tabs().find((tab) => tab.getAttribute("aria-selected") === "true")?.dataset
      .tab ??
    tabs()[0]?.dataset.tab;
  if (selected) activateTab(root, selected, false);
  return lifecycle;
}
