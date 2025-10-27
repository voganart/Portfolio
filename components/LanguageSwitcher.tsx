import React, { useContext } from 'react';
import { LanguageContext } from '../context/LanguageContext';

const LanguageSwitcher: React.FC = () => {
  const context = useContext(LanguageContext);

  if (!context) {
    return null;
  }

  const { language, setLanguage } = context;

  const buttonStyle = "px-3 py-1 text-sm font-bold rounded-md transition-colors";
  const activeStyle = "bg-teal-600 text-white";
  const inactiveStyle = "bg-gray-700/50 text-gray-300 hover:bg-gray-600/50";

  return (
    <div className="fixed top-6 right-6 z-50 flex items-center space-x-2 p-1 bg-gray-800/80 rounded-lg backdrop-blur-sm">
      <button
        onClick={() => setLanguage('ru')}
        className={`${buttonStyle} ${language === 'ru' ? activeStyle : inactiveStyle}`}
      >
        RU
      </button>
      <button
        onClick={() => setLanguage('en')}
        className={`${buttonStyle} ${language === 'en' ? activeStyle : inactiveStyle}`}
      >
        EN
      </button>
    </div>
  );
};

export default LanguageSwitcher;