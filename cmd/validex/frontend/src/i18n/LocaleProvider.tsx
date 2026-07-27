import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  defaultLocale,
  supportedLocales,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationValues,
} from "./messages";

export const localeStorageKey = "validex.locale";

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
  if (typeof localStorage === "undefined") return undefined;
  try {
    const value = localStorage.getItem(localeStorageKey);
    return isLocale(value) ? value.toLocaleLowerCase() as Locale : undefined;
  } catch {
    return undefined;
  }
}

export function resolveInitialLocale(): Locale {
  const saved = storedLocale();
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

export type Translate = (
  key: TranslationKey,
  values?: TranslationValues,
) => string;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const fallbackLocale = resolveInitialLocale();
const fallbackValue: LocaleContextValue = {
  locale: fallbackLocale,
  setLocale: () => undefined,
  t: (key, values) => translate(fallbackLocale, key, values),
};

const LocaleContext = createContext<LocaleContextValue>(fallbackValue);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(resolveInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(localeStorageKey, locale);
    } catch {
      // A blocked storage API must not make the workspace unusable.
    }
  }, [locale]);

  useEffect(() => {
    const syncLocale = (event: StorageEvent) => {
      if (event.key === localeStorageKey && isLocale(event.newValue)) {
        setLocale(event.newValue.toLocaleLowerCase() as Locale);
      }
    };
    window.addEventListener("storage", syncLocale);
    return () => window.removeEventListener("storage", syncLocale);
  }, []);

  const t = useCallback<Translate>(
    (key, values) => translate(locale, key, values),
    [locale],
  );
  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

export function useTranslation(): Translate {
  return useLocale().t;
}
