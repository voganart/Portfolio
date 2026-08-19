
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
      className="rounded-full border border-teal-400/20 bg-teal-500/10 px-3 py-1.5 text-sm font-bold text-teal-300 transition-colors hover:bg-teal-500 hover:text-white"
      aria-label={language === 'ru' ? 'Switch to English' : 'Переключить на русский'}
    >
      {language === 'ru' ? 'EN' : 'RU'}
    </button>
  );
};

export default LanguageSwitcher;
