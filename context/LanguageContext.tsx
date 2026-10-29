import React, { createContext, useEffect, useState, ReactNode } from 'react';

export type Language = 'ru' | 'en' | 'es';

export const LANGUAGES: Language[] = ['ru', 'en', 'es'];

// значение для атрибута <html lang>
const HTML_LANG: Record<Language, string> = { ru: 'ru', en: 'en', es: 'es-AR' };

const STORAGE_KEY = 'portfolio-language';
const DEFAULT_LANGUAGE: Language = 'ru';

const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);

// Порядок: сохранённый выбор → язык браузера → 'ru'
const detectLanguage = (): Language => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // localStorage недоступен (приватный режим и т.п.)
  }

  try {
    const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of browserLanguages) {
      const code = (tag || '').toLowerCase().split('-')[0];
      if (isLanguage(code)) return code;
    }
  } catch {
    // navigator недоступен
  }

  return DEFAULT_LANGUAGE;
};

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(detectLanguage);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[language];
  }, [language]);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // не удалось сохранить — язык всё равно переключится на текущую сессию
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};
