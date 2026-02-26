import React from 'react';
import type { Project } from '../types';
import { useTranslations } from '../hooks/useTranslations';

interface ShowreelProps {
  project?: Project; // Делаем проект опциональным, чтобы избежать ошибок
}

const Showreel: React.FC<ShowreelProps> = ({ project }) => {
  const { language } = useTranslations();

  if (!project) {
    // Если шоурил по какой-то причине не найден, просто не рендерим секцию
    return null;
  }

  const title = project.title[language];
  const description = project.description[language];
  const basePath = import.meta.env.BASE_URL || '/';
  const mediaPath = `${basePath}content/${project.mediaFile}`;

  return (
    <section id="showreel" className="py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
          Animation Showreel
        </h2>
        <p className="text-lg text-gray-400 mb-8">{description}</p>
        
        {/* Видеоплеер для шоурила */}
        <div className="aspect-w-16 aspect-h-9 rounded-lg overflow-hidden border-2 border-slate-700/50 shadow-2xl shadow-teal-500/10">
          <video
            src={mediaPath}
            className="w-full h-full object-contain"
            controls
            autoPlay
            loop
            muted
            playsInline
          />
        </div>
        
        {/* Теги под видео */}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="text-sm font-semibold bg-slate-800 text-teal-300 px-3 py-1 rounded-full border border-slate-700"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Showreel;