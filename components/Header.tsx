import React, { Suspense, lazy } from 'react';
import { useTranslations } from '../hooks/useTranslations';

// three.js тяжёлый — грузим вьюпорт отдельным чанком, текст hero показывается сразу
const Hero3D = lazy(() => import('./hero/Hero3D'));

const ViewportPlaceholder: React.FC = () => (
  <div className="theme-line flex aspect-[4/3.6] w-full items-center justify-center rounded-2xl border bg-black/20">
    <span className="font-ui-mono text-xs text-slate-500">loading boy.glb…</span>
  </div>
);

const Header: React.FC = () => {
  const { t } = useTranslations();
  const [first, ...rest] = t.header.name.split(' ');

  return (
    <header id="top" className="relative overflow-hidden pt-16">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:px-8 lg:py-20">
        <div className="min-w-0">
          <p className="eyebrow">{t.header.eyebrow}</p>
          <h1 className="font-display mt-5 text-5xl leading-[0.95] text-white sm:text-6xl xl:text-7xl">
            {first}
            <span className="theme-accent-text block">{rest.join(' ')}</span>
          </h1>
          <p className="mt-6 text-lg font-semibold text-white sm:text-xl">{t.header.title}</p>
          <p className="mt-3 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">{t.header.intro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#portfolio" className="theme-accent-bg rounded-xl px-6 py-3.5 font-bold shadow-xl transition hover:-translate-y-0.5 hover:brightness-110">
              {t.header.button}
            </a>
            <a href="#contact" className="theme-line rounded-xl border bg-white/5 px-6 py-3.5 font-bold text-white transition hover:bg-white/10">
              {t.header.cta2}
            </a>
          </div>
        </div>

        <div className="min-w-0">
          <Suspense fallback={<ViewportPlaceholder />}>
            <Hero3D hint={t.header.hint} />
          </Suspense>
        </div>
      </div>
    </header>
  );
};

export default Header;
