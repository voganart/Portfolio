import React from 'react';
import { useTranslations } from '../hooks/useTranslations';

const About: React.FC = () => {
  const { t } = useTranslations();

  return (
    <section id="about" className="theme-line scroll-mt-20 border-t py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="eyebrow">{t.about.eyebrow}</p>
        <h2 className="font-display mt-3 text-4xl text-white sm:text-5xl">{t.about.title}</h2>

        <div className="mt-10 grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <p className="max-w-[62ch] text-base leading-8 text-slate-400 sm:text-lg">{t.about.text}</p>

          {/* Навыки как дорожки таймлайна: длина клипа = уровень, ромб — ключ на конце */}
          <div>
            <h3 className="font-ui-mono text-xs uppercase tracking-[0.18em] text-slate-500">{t.about.skillsTitle}</h3>
            <ul className="mt-5 grid gap-3">
              {t.about.skillsData.map((skill: { label: string; value: number }) => (
                <li key={skill.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2rem] items-center gap-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_2rem]">
                  <span className="truncate text-sm font-semibold text-slate-200" title={skill.label}>{skill.label}</span>
                  <span className="skill-lane relative h-4 rounded">
                    <span className="skill-fill absolute inset-y-0 left-0 rounded" style={{ width: `${skill.value * 10}%` }}>
                      <span className="keyframe absolute -right-1.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    </span>
                  </span>
                  <span className="font-ui-mono text-right text-xs text-slate-500">{skill.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
