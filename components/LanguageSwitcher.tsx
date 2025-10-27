
import React from 'react';
import { useTranslations } from '../hooks/useTranslations';

const Header: React.FC = () => {
  // FIX: Destructure `t` from the hook's return value.
  const { t } = useTranslations();

  const handleScrollToPortfolio = () => {
    document.getElementById('portfolio')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="min-h-screen flex items-center justify-center relative">
      <div className="text-center p-8 max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-wider text-white drop-shadow-lg">
          {t.header.name}
        </h1>
        <p className="mt-4 text-xl md:text-2xl font-medium text-teal-400">
          {t.header.title}
        </p>
        <p className="mt-6 text-lg md:text-xl text-gray-300 max-w-2xl mx-auto">
          {t.header.intro}
        </p>
        <div className="mt-10">
          <button
            onClick={handleScrollToPortfolio}
            className="bg-teal-600 text-white font-bold py-3 px-8 rounded-full hover:bg-teal-700 transition-transform transform hover:scale-105 duration-300 ease-in-out"
          >
            {t.header.button}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
