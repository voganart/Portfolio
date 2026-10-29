import React from 'react';
import type { Project } from '../types';
import { useTranslations } from '../hooks/useTranslations';
import { localizedText } from '../utils/projects';

interface ShowreelProps {
  project?: Project; // Делаем проект опциональным, чтобы избежать ошибок
}

const Showreel: React.FC<ShowreelProps> = ({ project }) => {
  const { t, language } = useTranslations();

  if (!project) {
    // Если шоурил по какой-то причине не найден, просто не рендерим секцию
    return null;
  }

  const title = localizedText(project.title, language);
  const description = localizedText(project.description, language);
  const basePath = import.meta.env.BASE_URL || '/';
  const mediaPath = `${basePath}content/${project.mediaFile}`;

  return (
    <section id="showreel" className="theme-line scroll-mt-20 border-t py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <p className="eyebrow">{title}</p>
        <h2 className="font-display mt-3 text-4xl text-white sm:text-5xl">{t.showreel.title}</h2>
        <p className="mb-8 mt-4 max-w-2xl text-lg text-slate-400">{description}</p>
        
        {/* Видеоплеер для шоурила */}
        <div className="aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/30">
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
        <div className="mt-6 flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="font-ui-mono theme-line rounded-md border px-2 py-0.5 text-xs text-slate-400"
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
