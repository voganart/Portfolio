import React from 'react';
import { useTranslations } from '../hooks/useTranslations';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import type { ThemePresetId } from '../utils/themes';

interface SiteNavProps {
  theme: ThemePresetId;
  onThemeChange: (value: ThemePresetId) => void;
}

const SiteNav: React.FC<SiteNavProps> = ({ theme, onThemeChange }) => {
  const { t } = useTranslations();
  const links = [
    { href: '#portfolio', label: t.nav.work },
    { href: '#showreel', label: t.nav.showreel },
    { href: '#about', label: t.nav.about },
    { href: '#contact', label: t.nav.contact },
  ];

  return (
    <nav className="theme-nav theme-line fixed inset-x-0 top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="font-display text-lg tracking-[0.04em] text-white">VG<span className="theme-accent-text">.</span>ART</a>
        <div className="hidden items-center gap-6 sm:flex">
          {links.map((link) => <a key={link.href} href={link.href} className="text-sm font-semibold text-slate-400 transition hover:text-white">{link.label}</a>)}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeSwitcher value={theme} onChange={onThemeChange} />
          <LanguageSwitcher />
        </div>
      </div>
    </nav>
  );
};

export default SiteNav;
