import React from 'react';
import { useTranslations } from '../hooks/useTranslations';

const skillsData = [
  { label: 'Animation (2D / 3D)', value: 10 },
  { label: 'Modeling & Topology (Low-poly)', value: 8 },
  { label: 'Texturing & 2D Sketching', value: 5 },
  { label: 'Team Leadership & Mentorship', value: 5 },
  { label: 'Self-learning & Skill Growth', value: 10 },
  { label: 'Blender', value: 10 },
  { label: 'Unity', value: 8 },
  { label: 'Photoshop', value: 8 },
  { label: 'Godot', value: 7 },
  { label: 'Maya', value: 5 },
];

const About: React.FC = () => {
  const { t } = useTranslations();

  return (
    <section id="about" className="py-20 sm:py-32 bg-slate-900/40 backdrop-blur-sm rounded-xl">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* Левая колонка — текст "Обо мне" */}
          <div className="text-center lg:text-left">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              {t.about.title}
            </h2>
            <p className="mt-6 text-lg leading-8 text-gray-400">
              {t.about.text}
            </p>
          </div>

          {/* Правая колонка — шкалы навыков */}
          <div>
            <h3 className="text-2xl font-semibold text-center lg:text-left text-white mb-8">
              {t.about.skillsTitle}
            </h3>
            <div className="space-y-4">
              {t.about.skillsData.map((skill: { label: string; value: number }) => (
                <div key={skill.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-300">{skill.label}</span>
                    <span className="text-sm text-gray-400">{skill.value}/10</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-teal-400 h-2.5 rounded-full transition-all duration-700"
                      style={{ width: `${(skill.value / 10) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default About;
