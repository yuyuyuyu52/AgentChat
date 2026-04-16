import React from "react";
import zhCN from "./locales/zh-CN.js";
import en from "./locales/en.js";
import ja from "./locales/ja.js";
import ko from "./locales/ko.js";
import es from "./locales/es.js";

export type SupportedLocale = "zh-CN" | "en" | "ja" | "ko" | "es";

export interface Messages {
  [key: string]: string | Messages;
}
type TranslationParams = Record<string, string | number>;

export const LANGUAGE_OPTIONS: Array<{
  code: SupportedLocale;
  label: string;
  nativeLabel: string;
}> = [
  { code: "zh-CN", label: "Chinese (Simplified)", nativeLabel: "简体中文" },
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
];

const STORAGE_KEY = "agentchat-locale";

const messages: Partial<Record<SupportedLocale, Messages>> = {
  "zh-CN": zhCN,
  en,
  ja,
  ko,
  es,
};

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, params?: TranslationParams, fallback?: string) => string;
  formatDate: (value: string | number | Date) => string;
  formatTime: (value: string | number | Date) => string;
  formatDateTime: (value: string | number | Date) => string;
  formatRelativeTime: (value: string | number | Date) => string;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

function resolveSupportedLocale(input?: string | null): SupportedLocale {
  const value = (input ?? "").toLowerCase();
  if (value.startsWith("zh")) {
    return "zh-CN";
  }
  if (value.startsWith("ja")) {
    return "ja";
  }
  if (value.startsWith("ko")) {
    return "ko";
  }
  if (value.startsWith("es")) {
    return "es";
  }
  return "en";
}

function resolveInitialLocale(): SupportedLocale {
  if (typeof window === "undefined") {
    return "en";
  }

  const storedLocale = window.localStorage.getItem(STORAGE_KEY);
  if (storedLocale) {
    return resolveSupportedLocale(storedLocale);
  }

  for (const language of window.navigator.languages) {
    return resolveSupportedLocale(language);
  }

  return resolveSupportedLocale(window.navigator.language);
}

function getMessage(locale: SupportedLocale, key: string): string | null {
  const parts = key.split(".");
  let current: string | Messages | undefined = messages[locale];

  for (const part of parts) {
    if (!current || typeof current === "string" || !(part in current)) {
      return null;
    }
    current = current[part];
  }

  return typeof current === "string" ? current : null;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

function getDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<SupportedLocale>(resolveInitialLocale);

  React.useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = React.useCallback((nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
  }, []);

  const t = React.useCallback(
    (key: string, params?: TranslationParams, fallback?: string) => {
      const template = getMessage(locale, key) ?? getMessage("en", key) ?? fallback ?? key;
      return interpolate(template, params);
    },
    [locale],
  );

  const formatDate = React.useCallback(
    (value: string | number | Date) => getDate(value).toLocaleDateString(locale),
    [locale],
  );

  const formatTime = React.useCallback(
    (value: string | number | Date) => getDate(value).toLocaleTimeString(locale),
    [locale],
  );

  const formatDateTime = React.useCallback(
    (value: string | number | Date) => getDate(value).toLocaleString(locale),
    [locale],
  );

  const formatRelativeTime = React.useCallback(
    (value: string | number | Date) => {
      const target = getDate(value).getTime();
      const deltaSeconds = Math.round((target - Date.now()) / 1_000);
      const abs = Math.abs(deltaSeconds);
      const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

      if (abs < 60) {
        return formatter.format(deltaSeconds, "second");
      }
      if (abs < 3_600) {
        return formatter.format(Math.round(deltaSeconds / 60), "minute");
      }
      if (abs < 86_400) {
        return formatter.format(Math.round(deltaSeconds / 3_600), "hour");
      }
      if (abs < 604_800) {
        return formatter.format(Math.round(deltaSeconds / 86_400), "day");
      }
      if (abs < 2_592_000) {
        return formatter.format(Math.round(deltaSeconds / 604_800), "week");
      }
      if (abs < 31_536_000) {
        return formatter.format(Math.round(deltaSeconds / 2_592_000), "month");
      }
      return formatter.format(Math.round(deltaSeconds / 31_536_000), "year");
    },
    [locale],
  );

  const value = React.useMemo(
    () => ({
      locale,
      setLocale,
      t,
      formatDate,
      formatTime,
      formatDateTime,
      formatRelativeTime,
    }),
    [formatDate, formatDateTime, formatRelativeTime, formatTime, locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
