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
    <section id="showreel" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-6 text-center lg:px-8">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
          Animation Showreel
        </h2>
        <p className="text-lg text-gray-400 mb-8">{description}</p>
        
        {/* Видеоплеер для шоурила */}
        <div className="aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-teal-950/40">
          <video
            src={mediaPath}
            className="w-full h-full object-contain"
            controls
            muted
            playsInline
            preload="metadata"
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
