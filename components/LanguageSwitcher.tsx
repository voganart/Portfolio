
import React from 'react';
import { useTranslations } from '../hooks/useTranslations';
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
      className="fixed top-4 right-4 z-50 bg-teal-600 text-white px-4 py-2 rounded-full hover:bg-teal-700 transition-colors duration-300"
    >
      {language === 'ru' ? 'EN' : 'RU'}
    </button>
  );
};

export default LanguageSwitcher;
