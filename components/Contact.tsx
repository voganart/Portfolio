import React from 'react';
import LinkedInIcon from './icons/LinkedInIcon';
import TelegramIcon from './icons/TelegramIcon';
import EmailIcon from './icons/EmailIcon';
import GitHubIcon from './icons/GitHubIcon';
import SketchfabIcon from './icons/SketchfabIcon'; // нужно создать этот компонент
import { useTranslations } from '../hooks/useTranslations';

const Contact: React.FC = () => {
  const { t, language } = useTranslations();

  const tooltips = {
    ru: {
      linkedin: 'Открыть LinkedIn',
      telegram: 'Написать в Telegram',
      email: 'Отправить email',
      github: 'Открыть GitHub',
      sketchfab: 'Открыть Sketchfab',
    },
    en: {
      linkedin: 'Open LinkedIn',
      telegram: 'Message on Telegram',
      email: 'Send email',
      github: 'Open GitHub',
      sketchfab: 'Open Sketchfab',
    },
  };

  const tt = tooltips[language];

  const links = [
    { href: 'https://www.linkedin.com/in/vg-art/', Icon: LinkedInIcon, tooltip: tt.linkedin },
    { href: 'https://t.me/voganistr', Icon: TelegramIcon, tooltip: tt.telegram },
    { href: 'mailto:punktc77@gmail.com', Icon: EmailIcon, tooltip: tt.email },
    { href: 'https://github.com/voganart', Icon: GitHubIcon, tooltip: tt.github },
    { href: 'https://sketchfab.com/bigroguevogue', Icon: SketchfabIcon, tooltip: tt.sketchfab },
  ];

  return (
    <footer className="bg-slate-900/50 border-t border-white/10 py-12 relative mt-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white">{t.contact.title}</h2>
        <p className="mt-4 text-lg text-gray-400">{t.contact.subtitle}</p>

        <div className="mt-8 flex justify-center items-center gap-6">
          {links.map(({ href, Icon, tooltip }, idx) => (
            <a
              key={idx}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="relative group text-gray-400 hover:text-teal-400 transition-colors duration-300"
            >
              <Icon className="w-8 h-8" />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                {tooltip}
              </span>
            </a>
          ))}
        </div>

        <p className="mt-10 text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Vladimir Grigorov. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Contact;
