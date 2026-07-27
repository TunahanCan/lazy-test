import { automationToolsMessages } from "./messages/automationTools";
import { coreMessages } from "./messages/core";
import { diagnosticsProtocolsMessages } from "./messages/diagnosticsProtocols";
import { requestMessages } from "./messages/requests";

export const supportedLocales = ["tr", "en"] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "en";

const englishMessages = {
  ...coreMessages.en,
  ...requestMessages.en,
  ...automationToolsMessages.en,
  ...diagnosticsProtocolsMessages.en,
} as const;

export type TranslationKey = keyof typeof englishMessages;

const turkishMessages = {
  ...coreMessages.tr,
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
