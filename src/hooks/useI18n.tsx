import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { DEFAULT_LANG, LANGUAGE_STORAGE_KEY, type Lang, type TFunction } from '../i18n/types';
import { translate } from '../i18n/translate';

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
