
import React from 'react';
import { useTranslations } from '../hooks/useTranslations';

const Header: React.FC = () => {
  // FIX: Destructure `t` from the hook's return value.
  const { t } = useTranslations();

  const handleScrollToPortfolio = () => {
    document.getElementById('portfolio')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header id="top" className="relative flex min-h-[78vh] items-center justify-center overflow-hidden pt-16">
      <div className="theme-hero-glow pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-5xl px-6 py-20 text-center">
        <p className="theme-accent-text mb-5 text-xs font-black uppercase tracking-[0.35em]">Game animation · Technical art · Prototypes</p>
        <h1 className="text-5xl font-black uppercase tracking-tight text-white drop-shadow-lg sm:text-6xl md:text-7xl md:whitespace-nowrap">
          {t.header.name}
        </h1>
        <p className="theme-accent-text mx-auto mt-5 max-w-3xl text-lg font-bold sm:text-xl md:text-2xl">
          {t.header.title}
        </p>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
          {t.header.intro}
        </p>
        <div className="mt-9">
          <button
            onClick={handleScrollToPortfolio}
            className="theme-accent-bg rounded-full px-8 py-3.5 font-bold shadow-xl transition hover:-translate-y-0.5 hover:brightness-110"
          >
            {t.header.button}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
