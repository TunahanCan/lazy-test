import {
  backendUserErrorHintKeys,
  backendUserErrorMessageKeys,
} from "../i18n/messages/backendErrors.js";
import {
  backendAutomationErrorHintKeys,
  backendAutomationErrorMessageKeys,
} from "../i18n/messages/backendErrorsAutomation.js";
import {
  backendToolsErrorHintKeys,
  backendToolsErrorMessageKeys,
} from "../i18n/messages/backendErrorsTools.js";
import {
  backendRequestErrorHintKeys,
  backendRequestErrorMessageKeys,
} from "../i18n/messages/backendErrorsRequest.js";
import type { TranslationKey, TranslationValues } from "../i18n/messages.js";
import type { Translate } from "../i18n/locale.js";
import type { UserError } from "./types.js";

function translationValues(
  params: UserError["params"],
): TranslationValues | undefined {
  return params ? { ...params } : undefined;
}

export function hasLocalizedUserError(error: Partial<UserError>): boolean {
  return (
    typeof error.messageKey === "string" &&
    (backendUserErrorMessageKeys.has(error.messageKey) ||
      backendAutomationErrorMessageKeys.has(error.messageKey) ||
      backendToolsErrorMessageKeys.has(error.messageKey) ||
      backendRequestErrorMessageKeys.has(error.messageKey))
  );
}

export function localizeUserError(
  error: UserError,
  translate: Translate,
): UserError {
  if (!hasLocalizedUserError(error)) return error;
  const messageKey = error.messageKey as string;
  const values = translationValues(error.params);
  return {
    ...error,
    title: translate(`${messageKey}.title` as TranslationKey, values),
    message: translate(`${messageKey}.message` as TranslationKey, values),
    hint:
      backendUserErrorHintKeys.has(messageKey) ||
      backendAutomationErrorHintKeys.has(messageKey) ||
      backendToolsErrorHintKeys.has(messageKey) ||
      backendRequestErrorHintKeys.has(messageKey)
      ? translate(`${messageKey}.hint` as TranslationKey, values)
      : undefined,
  };
}

export function keyedUserError(
  code: string,
  messageKey: string,
  options: {
    params?: Readonly<Record<string, string>>;
    technical?: string;
  } = {},
): UserError {
  return {
    code,
    messageKey,
    params: options.params,
    title: "",
    message: "",
    technical: options.technical,
  };
}

// Localized backend messages are display text, never technical diagnostics.
// For an older backend without messageKey, retain its full structured payload
// so support information is not silently lost.
export function userErrorTechnicalDetails(
  error: Partial<UserError>,
): string | undefined {
  if (hasLocalizedUserError(error)) return error.technical || undefined;
  const details = [error.title, error.message, error.hint, error.technical]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return details || undefined;
}
