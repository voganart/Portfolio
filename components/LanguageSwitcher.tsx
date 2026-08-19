
import React from 'react';
import { LanguageContext } from '../context/LanguageContext';
import { useContext } from 'react';

const LanguageSwitcher: React.FC = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('LanguageSwitcher must be used within a LanguageProvider');
  }

  const { language, setLanguage } = context;

  const toggleLanguage = () => {
    setLanguage(language === 'ru' ? 'en' : 'ru');
  };

  return (
    <button
      onClick={toggleLanguage}
      className="theme-accent-soft theme-accent-border theme-accent-hover rounded-full border px-3 py-1.5 text-sm font-bold transition-colors"
      aria-label={language === 'ru' ? 'Switch to English' : 'Переключить на русский'}
    >
      {language === 'ru' ? 'EN' : 'RU'}
    </button>
  );
};

export default LanguageSwitcher;
