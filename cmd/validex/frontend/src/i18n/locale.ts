import {
  defaultLocale,
  supportedLocales,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationValues,
} from "./messages.js";

export const localeStorageKey = "validex.locale";

export type Translate = (
  key: TranslationKey,
  values?: TranslationValues,
) => string;

type LocaleListener = (locale: Locale) => void;

const listeners = new Set<LocaleListener>();

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    supportedLocales.includes(value.toLocaleLowerCase() as Locale)
  );
}

export function preferredLocale(
  languageTags: readonly string[] | undefined,
): Locale {
  for (const languageTag of languageTags ?? []) {
    const normalized = languageTag.trim().toLocaleLowerCase().replace("_", "-");
    const language = normalized.split("-", 1)[0];
    if (isLocale(language)) return language;
  }
  return defaultLocale;
}

function storedLocale(): Locale | undefined {
  try {
    const value = localStorage.getItem(localeStorageKey);
    return isLocale(value) ? (value.toLocaleLowerCase() as Locale) : undefined;
  } catch {
    return undefined;
  }
}

export function resolveInitialLocale(): Locale {
  const saved = typeof localStorage === "undefined" ? undefined : storedLocale();
  if (saved) return saved;
  if (typeof navigator === "undefined") return defaultLocale;
  const languages =
    navigator.languages?.length > 0
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];
  return preferredLocale(languages);
}

let activeLocale = resolveInitialLocale();

function applyLocale(locale: Locale): void {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  try {
    localStorage.setItem(localeStorageKey, locale);
  } catch {
    // Storage may be blocked. Locale changes still remain valid in memory.
  }
}

export function getLocale(): Locale {
  return activeLocale;
}

export function setLocale(locale: Locale): void {
  if (activeLocale === locale) return;
  activeLocale = locale;
  applyLocale(locale);
  for (const listener of listeners) listener(locale);
}

export function subscribeLocale(listener: LocaleListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const t: Translate = (key, values) =>
  translate(activeLocale, key, values);

export function initializeLocale(): () => void {
  applyLocale(activeLocale);
  const syncLocale = (event: StorageEvent) => {
    if (event.key === localeStorageKey && isLocale(event.newValue)) {
      const locale = event.newValue.toLocaleLowerCase() as Locale;
      if (locale === activeLocale) return;
      activeLocale = locale;
      applyLocale(locale);
      for (const listener of listeners) listener(locale);
    }
  };
  window.addEventListener("storage", syncLocale);
  return () => window.removeEventListener("storage", syncLocale);
}
