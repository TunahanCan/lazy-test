import { html, type TrustedHTMLFragment } from "../core/dom.js";
import { icon, type IconName } from "../core/icons.js";
import { t } from "../i18n/locale.js";

export interface ToolNotice {
  tone?: "success" | "error" | "info" | "warning";
  title?: string;
  message: string;
  hint?: string;
  technical?: string;
}

export interface ToolTab {
  id: string;
  label: string;
  icon?: IconName;
}

export function toolPageHeader(options: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  meta?: TrustedHTMLFragment;
}): TrustedHTMLFragment {
  return html`
    <header class="tool-page-header">
      <div>
        <span class="tool-eyebrow">${options.eyebrow}</span>
        <h1 id="${options.id}">${options.title}</h1>
        <p>${options.description}</p>
      </div>
      ${options.meta
        ? html`<div class="tool-page-meta">${options.meta}</div>`
        : ""}
    </header>
  `;
}

export function toolTabs(
  tabs: readonly ToolTab[],
  active: string,
  label: string,
  idBase: string,
  disabled = false,
): TrustedHTMLFragment {
  return html`
    <div class="tool-tabs" role="tablist" aria-label="${label}">
      ${tabs.map(
        (tab) => html`
          <button
            type="button"
            id="${idBase}-tab-${tab.id}"
            role="tab"
            data-tab="${tab.id}"
            data-state="${tab.id === active ? "active" : "inactive"}"
            aria-selected="${tab.id === active ? "true" : "false"}"
            aria-controls="${idBase}-panel-${tab.id}"
            tabindex="${tab.id === active ? "0" : "-1"}"
            ${disabled ? "disabled" : ""}
          >
            ${tab.icon ? icon(tab.icon, 15) : ""}
            <span>${tab.label}</span>
          </button>
        `,
      )}
    </div>
    ${tabs
      .filter((tab) => tab.id !== active)
      .map(
        (tab) => html`
          <div
            id="${idBase}-panel-${tab.id}"
            role="tabpanel"
            aria-labelledby="${idBase}-tab-${tab.id}"
            hidden
          ></div>
        `,
      )}
  `;
}

export function noticeMarkup(notice: ToolNotice | null): TrustedHTMLFragment {
  if (!notice) return html``;
  const role = notice.tone === "error" ? "alert" : "status";
  return html`
    <div class="tool-notice ${notice.tone ?? "info"}" role="${role}">
      ${icon(
        notice.tone === "error"
          ? "error"
          : notice.tone === "success"
            ? "check"
            : notice.tone === "warning"
              ? "warning"
              : "info",
        16,
      )}
      <div>
        ${notice.title ? html`<strong>${notice.title}</strong>` : ""}
        <p>${notice.message}</p>
        ${notice.hint ? html`<small>${notice.hint}</small>` : ""}
        ${notice.technical
          ? html`<details>
              <summary>${t("common.technicalDetails")}</summary>
              <pre><code>${notice.technical}</code></pre>
            </details>`
          : ""}
      </div>
    </div>
  `;
}

export function toolCardHeader(
  title: string,
  description: string,
  actions?: TrustedHTMLFragment,
): TrustedHTMLFragment {
  return html`
    <header class="tool-card-header">
      <div>
        <h2>${title}</h2>
        <p>${description}</p>
      </div>
      ${actions ? html`<div class="tool-card-header-actions">${actions}</div>` : ""}
    </header>
  `;
}

export function emptyToolResult(
  iconName: IconName,
  title: string,
  description?: string,
  busy = false,
): TrustedHTMLFragment {
  return html`
    <div
      class="tool-empty-result${busy ? " is-busy" : ""}"
      role="${busy ? "status" : "group"}"
      aria-busy="${busy ? "true" : "false"}"
    >
      ${icon(iconName, 25, busy ? "spin" : "")}
      <strong>${title}</strong>
      ${description ? html`<span>${description}</span>` : ""}
    </div>
  `;
}

export function summaryMarkup(
  items: readonly { label: string; value: string | number }[],
  className = "",
): TrustedHTMLFragment {
  return html`
    <dl class="automation-summary ${className}">
      ${items.map(
        ({ label, value }) => html`
          <div>
            <dt>${label}</dt>
            <dd>${value}</dd>
          </div>
        `,
      )}
    </dl>
  `;
}
