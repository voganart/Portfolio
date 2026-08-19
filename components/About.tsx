import React from 'react';
import { useTranslations } from '../hooks/useTranslations';

const About: React.FC = () => {
  const { t } = useTranslations();

  return (
    <section id="about" className="theme-surface-soft scroll-mt-20 rounded-2xl border border-white/5 py-16 backdrop-blur-sm sm:py-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1.2fr_0.8fr]">

          {/* Левая колонка — текст "Обо мне" */}
          <div className="text-center lg:text-left">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              {t.about.title}
            </h2>
            <p className="mt-6 text-base leading-8 text-gray-400 sm:text-lg">
              {t.about.text}
            </p>
          </div>

          {/* Правая колонка — шкалы навыков */}
          <div>
            <h3 className="text-2xl font-semibold text-center lg:text-left text-white mb-8">
              {t.about.skillsTitle}
            </h3>
            <div className="flex flex-wrap gap-2">
              {t.about.skillsData.map((skill: { label: string; value: number }) => (
                <span key={skill.label} className="rounded-full border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-300">{skill.label}</span>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default About;
