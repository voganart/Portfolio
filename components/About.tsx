
import React from 'react';
import { useTranslations } from '../hooks/useTranslations';

const About: React.FC = () => {
  // FIX: Destructure `t` from the hook's return value.
  const { t } = useTranslations();

  return (
    <section id="about" className="py-20 sm:py-32 bg-slate-900/40 backdrop-blur-sm rounded-xl">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">{t.about.title}</h2>
            <p className="mt-6 text-lg leading-8 text-gray-400">
             {t.about.text}
            </p>
          </div>
          <div>
            <h3 className="text-2xl font-semibold text-center lg:text-left text-white mb-6">{t.about.skillsTitle}</h3>
            <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
              {t.about.skills.map((skill) => (
                <span
                  key={skill}
                  className="bg-teal-400/10 text-teal-300 text-sm font-medium px-4 py-2 rounded-full border border-teal-400/20"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
