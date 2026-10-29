import React, { useContext } from 'react';
import { LanguageContext, LANGUAGES, type Language } from '../context/LanguageContext';
import { useTranslations } from '../hooks/useTranslations';

// подписи на родном языке — для title / aria-label
const LANGUAGE_NAMES: Record<Language, string> = { ru: 'Русский', en: 'English', es: 'Español' };

// Сегментированный переключатель RU / EN / ES
const LanguageSwitcher: React.FC = () => {
  const context = useContext(LanguageContext);
  const { t } = useTranslations();
  if (!context) {
    throw new Error('LanguageSwitcher must be used within a LanguageProvider');
  }

  const { language, setLanguage } = context;

  return (
    <div role="radiogroup" aria-label={t.languageSwitcher.label} className="theme-accent-border flex items-center rounded-full border bg-black/20 p-0.5">
      {LANGUAGES.map((code) => {
        const active = language === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={LANGUAGE_NAMES[code]}
            title={LANGUAGE_NAMES[code]}
            lang={code}
            onClick={() => setLanguage(code)}
            className={`rounded-full px-2 py-1 text-xs font-bold uppercase transition-colors sm:px-2.5 ${active ? 'theme-accent-bg' : 'text-slate-400 hover:text-white'}`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
};

export default LanguageSwitcher;
