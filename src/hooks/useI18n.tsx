import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { en } from '../i18n/en';
import { th } from '../i18n/th';
import { DEFAULT_LANG, LANGUAGE_STORAGE_KEY, type Lang, type TFunction, type TKey } from '../i18n/types';

const CATALOGS = { en, th } as const;

/** Walks a dotted path into a catalog. Returns undefined when the path does not resolve. */
function lookup(catalog: unknown, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>(
    (node, part) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined),
    catalog,
  );
  return typeof value === 'string' ? value : undefined;
}

/** Replaces every {{name}} placeholder with the matching param. Unmatched placeholders stay put. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    if (name in params) return String(params[name]);
    if (process.env.NODE_ENV === 'development') console.warn(`[i18n] missing param: ${name}`);
    return match;
  });
}

function translate(lang: Lang, key: TKey, params?: Record<string, string | number>): string {
  const hit = lookup(CATALOGS[lang], key) ?? lookup(CATALOGS[DEFAULT_LANG], key);
  if (hit === undefined) {
    // Unreachable through a literal key — TKey rejects those at compile time. This
    // guards keys assembled from variables. Never render the raw key to a user.
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[i18n] missing key: ${key}`);
    }
    return '';
  }
  return interpolate(hit, params);
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunction;
}

function readStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === 'en' || stored === 'th' ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(readStoredLang);

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // localStorage unavailable — the choice simply does not survive a reload.
    }
  }, [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // `t`'s identity is deliberately tied to `lang`: a useMemo'd column definition
  // that lists `t` in its deps recomputes on a language change, which is the only
  // thing keeping table headers from freezing in the previous language.
  const t = useCallback<TFunction>((key, params) => translate(lang, key, params), [lang]);

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Declared before `useI18n` reads it: a `const` referenced above its declaration sits
// in the temporal dead zone, and while this particular call only happens at render
// time, `no-use-before-define` flags it and the ordering is free.
const FALLBACK_CONTEXT: I18nContextValue = {
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key, params) => translate(DEFAULT_LANG, key, params),
};

/**
 * Unlike `useDarkMode`, this deliberately does NOT throw without a provider.
 *
 * Shell components and `ui/` primitives are rendered bare by 144 test files. A
 * throwing hook would fail all of them for no behavioural gain, so a provider-less
 * consumer gets a working English context instead. The provider is mounted once in
 * App.tsx; English is the default anyway.
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context) return context;
  return FALLBACK_CONTEXT;
}
