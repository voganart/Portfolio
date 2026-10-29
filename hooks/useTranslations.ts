import { useContext } from 'react';
import { LanguageContext, type Language } from '../context/LanguageContext';
import ru from '../locales/ru';
import en from '../locales/en';
import es from '../locales/es';

const locales: Record<Language, typeof en> = { ru, en, es };

export const useTranslations = () => {
  const context = useContext(LanguageContext);

  if (context === undefined) {
    throw new Error('useTranslations must be used within a LanguageProvider');
  }

  const { language } = context;
  const t = locales[language] ?? en;

  return { t, language };
};
