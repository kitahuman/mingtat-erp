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
  const [lang, setLangState] = useState<Language>('zh');

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'zh' ? 'en' : 'zh'));
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
