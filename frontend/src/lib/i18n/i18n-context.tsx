'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Language, translations } from './translations';

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof typeof translations.zh, params?: Record<string, any>) => string;
  toggleLang: () => void;
}

const I18nContext = createContext<I18nContextType>({
  lang: 'zh',
  setLang: () => {},
  t: (key) => key,
  toggleLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('portal-lang');
      if (saved === 'en' || saved === 'zh') return saved;
    }
    return 'zh';
  });

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('portal-lang', newLang);
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const next = prev === 'zh' ? 'en' : 'zh';
      if (typeof window !== 'undefined') {
        localStorage.setItem('portal-lang', next);
      }
      return next;
    });
  }, []);

  const t = useCallback(
    (key: keyof typeof translations.zh, params?: Record<string, string | number>) => {
      let translation: string = translations[lang][key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          translation = translation.replace(`{${k}}`, String(v));
        }
      }
      return translation;
    },
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t, toggleLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
