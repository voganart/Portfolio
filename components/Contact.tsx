import React from 'react';
import LinkedInIcon from './icons/LinkedInIcon';
import TelegramIcon from './icons/TelegramIcon';
import EmailIcon from './icons/EmailIcon';
import GitHubIcon from './icons/GitHubIcon';
import SketchfabIcon from './icons/SketchfabIcon';
import { useTranslations } from '../hooks/useTranslations';

const EMAIL = 'punktc77@gmail.com';

const Contact: React.FC = () => {
  const { t } = useTranslations();
  const tt = t.contact.tooltips;

  const links = [
    { href: 'https://t.me/voganistr', Icon: TelegramIcon, label: 'Telegram', tooltip: tt.telegram },
    { href: 'https://www.linkedin.com/in/vgart/', Icon: LinkedInIcon, label: 'LinkedIn', tooltip: tt.linkedin },
    { href: 'https://github.com/voganart', Icon: GitHubIcon, label: 'GitHub', tooltip: tt.github },
    { href: 'https://sketchfab.com/bigroguevogue', Icon: SketchfabIcon, label: 'Sketchfab', tooltip: tt.sketchfab },
  ];

  return (
    <footer id="contact" className="theme-line relative mt-8 scroll-mt-20 border-t">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <p className="eyebrow">{t.contact.eyebrow}</p>
        <h2 className="font-display mt-3 text-4xl text-white sm:text-5xl">{t.contact.title}</h2>
        <p className="mt-4 max-w-xl text-lg text-slate-400">{t.contact.subtitle}</p>

        <div className="mt-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <a href={`mailto:${EMAIL}`} title={tt.email} className="font-display theme-accent-text group inline-flex min-w-0 items-center gap-3 break-all text-2xl transition hover:brightness-125 sm:text-4xl">
            <EmailIcon className="h-8 w-8 shrink-0" />
            {EMAIL}
          </a>
          <div className="flex flex-wrap gap-2">
            {links.map(({ href, Icon, label, tooltip }) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer" title={tooltip} className="theme-line inline-flex items-center gap-2 rounded-xl border bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white">
                <Icon className="h-5 w-5" />
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="theme-line border-t">
        <p className="font-ui-mono mx-auto max-w-7xl px-4 py-6 text-xs text-slate-500 sm:px-6 lg:px-8">
          &copy; {new Date().getFullYear()} Vladimir Grigorov · VG.ART · {t.contact.rights}
        </p>
      </div>
    </footer>
  );
};

export default Contact;
