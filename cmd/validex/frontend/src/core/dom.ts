export interface Disposable {
  dispose(): void;
}

export type Cleanup = () => void;

export class Lifecycle implements Disposable {
  readonly #cleanups: Cleanup[] = [];
  #disposed = false;

  add(cleanup: Cleanup): Cleanup {
    if (this.#disposed) {
      cleanup();
      return cleanup;
    }
    this.#cleanups.push(cleanup);
    return cleanup;
  }

  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): Cleanup;
  listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): Cleanup;
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): Cleanup;
  listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions | boolean,
  ): Cleanup {
    target.addEventListener(type, listener, options);
    return this.add(() => target.removeEventListener(type, listener, options));
  }

  child<T extends Disposable>(disposable: T): T {
    this.add(() => disposable.dispose());
    return disposable;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const cleanup of this.#cleanups.splice(0).reverse()) cleanup();
  }
}

const trustedHTMLBrand: unique symbol = Symbol("validex.trusted-html");

export interface TrustedHTMLFragment {
  readonly [trustedHTMLBrand]: true;
  readonly value: string;
}

type TemplateValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | TrustedHTMLFragment
  | readonly TemplateValue[];

export function escapeHTML(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Marks application-owned static markup as safe. Never pass backend, request,
 * response, imported file, or user-provided content to this function.
 */
export function trustedHTML(value: string): TrustedHTMLFragment {
  return { [trustedHTMLBrand]: true, value };
}

function renderTemplateValue(value: TemplateValue): string {
  if (value === null || value === undefined || value === false) return "";
  if (Array.isArray(value)) return value.map(renderTemplateValue).join("");
  if (
    typeof value === "object" &&
    trustedHTMLBrand in value &&
    value[trustedHTMLBrand]
  ) {
    return value.value;
  }
  return escapeHTML(value);
}

/**
 * Dynamic values are escaped by default. Only TrustedHTMLFragment instances
 * can inject markup.
 */
export function html(
  strings: TemplateStringsArray,
  ...values: TemplateValue[]
): TrustedHTMLFragment {
  let output = strings[0];
  for (let index = 0; index < values.length; index += 1) {
    output += renderTemplateValue(values[index]);
    output += strings[index + 1];
  }
  return trustedHTML(output);
}

export function setHTML(
  target: Element,
  markup: TrustedHTMLFragment,
): void {
  target.innerHTML = markup.value;
}

export function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required element was not found: ${selector}`);
  return element;
}

export function optionalElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T | undefined {
  return root.querySelector<T>(selector) ?? undefined;
}

export function eventElement<T extends Element>(
  event: Event,
  selector: string,
): T | undefined {
  const target = event.target;
  if (!(target instanceof Element)) return undefined;
  return target.closest<T>(selector) ?? undefined;
}

export function delegate<K extends keyof HTMLElementEventMap>(
  lifecycle: Lifecycle,
  root: HTMLElement,
  type: K,
  selector: string,
  listener: (event: HTMLElementEventMap[K], element: HTMLElement) => void,
): Cleanup {
  return lifecycle.listen(root, type, (event) => {
    const matched = eventElement<HTMLElement>(event, selector);
    if (!matched || !root.contains(matched)) return;
    listener(event, matched);
  });
}

export function focusFirst(
  root: ParentNode,
  selector =
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
): void {
  root.querySelector<HTMLElement>(selector)?.focus();
}

export function formValue(
  form: HTMLFormElement,
  name: string,
): string {
  return String(new FormData(form).get(name) ?? "");
}

export function numberFormValue(
  form: HTMLFormElement,
  name: string,
  fallback = 0,
): number {
  const value = Number(formValue(form, name));
  return Number.isFinite(value) ? value : fallback;
}

export function checkedFormValue(
  form: HTMLFormElement,
  name: string,
): boolean {
  return new FormData(form).has(name);
}

export function announce(message: string): void {
  let region = document.querySelector<HTMLElement>("#validex-live-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "validex-live-region";
    region.className = "sr-only";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  region.textContent = "";
  window.requestAnimationFrame(() => {
    if (region) region.textContent = message;
  });
}

export function downloadText(
  filename: string,
  content: string,
  type = "text/plain;charset=utf-8",
): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
