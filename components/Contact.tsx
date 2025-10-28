import React from 'react';
import LinkedInIcon from './icons/LinkedInIcon';
import TelegramIcon from './icons/TelegramIcon';
import EmailIcon from './icons/EmailIcon';
import GitHubIcon from './icons/GitHubIcon'; // нужно создать этот компонент
import { useTranslations } from '../hooks/useTranslations';

const Contact: React.FC = () => {
  const { t, language } = useTranslations();

  const tooltips = {
    ru: {
      linkedin: 'Открыть LinkedIn',
      telegram: 'Написать в Telegram',
      email: 'Отправить email',
      github: 'Открыть GitHub',
    },
    en: {
      linkedin: 'Open LinkedIn',
      telegram: 'Message on Telegram',
      email: 'Send email',
      github: 'Open GitHub',
    },
  };

  const tt = tooltips[language];

  return (
    <footer
      id="contact"
      className="bg-slate-900/50 border-t border-white/10 py-12 relative mt-16"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white">
          {t.contact.title}
        </h2>
        <p className="mt-4 text-lg text-gray-400">{t.contact.subtitle}</p>

        <div className="mt-8 flex justify-center items-center gap-6">
          {/* LinkedIn */}
          <a
            href="https://www.linkedin.com/in/vg-art/"
            target="_blank"
            rel="noopener noreferrer"
            className="relative group text-gray-400 hover:text-teal-400 transition-colors duration-300"
          >
            <LinkedInIcon className="w-8 h-8" />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
              {tt.linkedin}
            </span>
          </a>

          {/* Telegram */}
          <a
            href="https://t.me/voganistr"
            target="_blank"
            rel="noopener noreferrer"
            className="relative group text-gray-400 hover:text-teal-400 transition-colors duration-300"
          >
            <TelegramIcon className="w-8 h-8" />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
              {tt.telegram}
            </span>
          </a>

          {/* Email */}
          <a
            href="mailto:punktc77@gmail.com"
            className="relative group text-gray-400 hover:text-teal-400 transition-colors duration-300"
          >
            <EmailIcon className="w-8 h-8" />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
              {tt.email}
            </span>
          </a>

          {/* GitHub */}
          <a
            href="https://github.com/voganart"
            target="_blank"
            rel="noopener noreferrer"
            className="relative group text-gray-400 hover:text-teal-400 transition-colors duration-300"
          >
            <GitHubIcon className="w-8 h-8" />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
              {tt.github}
            </span>
          </a>
        </div>

        <p className="mt-10 text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Vladimir Grigorov. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Contact;
