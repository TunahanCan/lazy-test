import { automationToolsMessages } from "./messages/automationTools.js";
import { backendMessages } from "./messages/backend.js";
import { backendErrorMessages } from "./messages/backendErrors.js";
import { backendAutomationErrorMessages } from "./messages/backendErrorsAutomation.js";
import { backendToolsErrorMessages } from "./messages/backendErrorsTools.js";
import { backendRequestErrorMessages } from "./messages/backendErrorsRequest.js";
import { coreMessages } from "./messages/core.js";
import { diagnosticsProtocolsMessages } from "./messages/diagnosticsProtocols.js";
import { requestMessages } from "./messages/requests.js";

export const supportedLocales = ["tr", "en"] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "en";

const englishMessages = {
  ...coreMessages.en,
  ...backendMessages.en,
  ...backendErrorMessages.en,
  ...backendAutomationErrorMessages.en,
  ...backendToolsErrorMessages.en,
  ...backendRequestErrorMessages.en,
  ...requestMessages.en,
  ...automationToolsMessages.en,
  ...diagnosticsProtocolsMessages.en,
} as const;

export type TranslationKey = keyof typeof englishMessages;

const turkishMessages = {
  ...coreMessages.tr,
  ...backendMessages.tr,
  ...backendErrorMessages.tr,
  ...backendAutomationErrorMessages.tr,
  ...backendToolsErrorMessages.tr,
  ...backendRequestErrorMessages.tr,
  ...requestMessages.tr,
  ...automationToolsMessages.tr,
  ...diagnosticsProtocolsMessages.tr,
} satisfies Record<TranslationKey, string>;

export const messages: Readonly<
  Record<Locale, Readonly<Record<TranslationKey, string>>>
> = {
  en: englishMessages,
  tr: turkishMessages,
};

export type TranslationValues = Readonly<
  Record<string, string | number | boolean>
>;

export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: TranslationValues,
): string {
  const template = messages[locale]?.[key] ?? messages[defaultLocale][key];
  if (!values) return template;

  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (token, name) =>
    Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name])
      : token,
  );
}
