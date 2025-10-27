
import React from 'react';
import LinkedInIcon from './icons/LinkedInIcon';
import ArtStationIcon from './icons/ArtStationIcon';
import EmailIcon from './icons/EmailIcon';
import { useTranslations } from '../hooks/useTranslations';

const Contact: React.FC = () => {
  // FIX: Destructure `t` from the hook's return value.
  const { t } = useTranslations();

  return (
    <footer id="contact" className="bg-slate-900/50 border-t border-white/10 py-12 relative mt-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white">{t.contact.title}</h2>
        <p className="mt-4 text-lg text-gray-400">
          {t.contact.subtitle}
        </p>
        <div className="mt-8 flex justify-center items-center gap-6">
          <a href="https://www.linkedin.com/in/vg-art/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-teal-400 transition-colors duration-300">
            <LinkedInIcon className="w-8 h-8" />
          </a>
          <a href="https://www.artstation.com/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-teal-400 transition-colors duration-300" title="Replace with your ArtStation link">
            <ArtStationIcon className="w-8 h-8" />
          </a>
          <a href="mailto:vladimir.grigorov@example.com" className="text-gray-400 hover:text-teal-400 transition-colors duration-300" title="Replace with your email">
            <EmailIcon className="w-8 h-8" />
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
