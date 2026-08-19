
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(45,212,191,0.12),transparent_30%),radial-gradient(circle_at_30%_65%,rgba(168,85,247,0.14),transparent_34%)]" />
      <div className="relative mx-auto max-w-5xl px-6 py-20 text-center">
        <p className="mb-5 text-xs font-black uppercase tracking-[0.35em] text-teal-400">Game animation · Technical art · Prototypes</p>
        <h1 className="text-5xl font-black uppercase tracking-tight text-white drop-shadow-lg sm:text-6xl md:text-7xl md:whitespace-nowrap">
          {t.header.name}
        </h1>
        <p className="mx-auto mt-5 max-w-3xl text-lg font-bold text-teal-300 sm:text-xl md:text-2xl">
          {t.header.title}
        </p>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
          {t.header.intro}
        </p>
        <div className="mt-9">
          <button
            onClick={handleScrollToPortfolio}
            className="rounded-full bg-teal-500 px-8 py-3.5 font-bold text-slate-950 shadow-xl shadow-teal-950/40 transition hover:-translate-y-0.5 hover:bg-teal-300"
          >
            {t.header.button}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
