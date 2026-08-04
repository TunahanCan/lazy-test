import {
  Lifecycle,
  eventElement,
  html,
  setHTML,
  type Disposable,
} from "../../core/dom.js";
import {
  FEEDBACK_TONE,
  subscribeFeedback,
  type FeedbackMessage,
} from "../../core/feedback.js";
import { icon } from "../../core/icons.js";
import { subscribeLocale, t } from "../../i18n/locale.js";

export function mountFeedback(root: HTMLElement): Disposable {
  const lifecycle = new Lifecycle();
  let active: FeedbackMessage | undefined;
  let dismissTimer: number | undefined;

  const clearTimer = () => {
    if (dismissTimer === undefined) return;
    window.clearTimeout(dismissTimer);
    dismissTimer = undefined;
  };

  const render = () => {
    setHTML(
      root,
      active
        ? html`
            <div
              class="app-feedback ${active.tone}"
              role="${active.tone === FEEDBACK_TONE.ERROR
                ? "alert"
                : "status"}"
              aria-live="${active.tone === FEEDBACK_TONE.ERROR
                ? "assertive"
                : "polite"}"
              aria-atomic="true"
            >
              ${icon(
                active.tone === FEEDBACK_TONE.ERROR
                  ? "error"
                  : active.tone === FEEDBACK_TONE.WARNING
                    ? "warning"
                    : active.tone === FEEDBACK_TONE.SUCCESS
                      ? "check"
                      : "info",
                16,
              )}
              <span>${active.message}</span>
              <button
                type="button"
                class="icon-button"
                data-action="dismiss-feedback"
                aria-label="${t("common.dismiss")}"
                title="${t("common.dismiss")}"
              >
                ${icon("close", 13)}
              </button>
            </div>
          `
        : html``,
    );
  };

  const dismiss = () => {
    clearTimer();
    active = undefined;
    render();
  };

  lifecycle.add(
    subscribeFeedback((feedback) => {
      clearTimer();
      active = feedback;
      render();
      if (feedback.durationMs > 0) {
        dismissTimer = window.setTimeout(() => {
          if (active?.id === feedback.id) dismiss();
        }, feedback.durationMs);
      }
    }),
  );
  lifecycle.listen(root, "click", (event) => {
    if (eventElement(event, '[data-action="dismiss-feedback"]')) dismiss();
  });
  lifecycle.add(subscribeLocale(render));
  lifecycle.add(clearTimer);
  render();

  return {
    dispose() {
      lifecycle.dispose();
      root.replaceChildren();
    },
  };
}
