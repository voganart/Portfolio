import { useContext } from 'react';
import { LanguageContext } from '../context/LanguageContext';
import ru from '../locales/ru';
import en from '../locales/en';

export const useTranslations = () => {
  const context = useContext(LanguageContext);

  if (context === undefined) {
    throw new Error('useTranslations must be used within a LanguageProvider');
  }

  const { language } = context;
  const t = language === 'ru' ? ru : en;

  return { t, language };
};
