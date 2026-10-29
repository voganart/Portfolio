import React, { useEffect, useRef } from 'react';
import type { Project } from '../types';
import { useTranslations } from '../hooks/useTranslations';
import { localizedText, projectLinkUrl } from '../utils/projects';

interface ProjectModalProps {
  project: Project;
  onClose: () => void;
  index: number;
  projects: Project[];
  onSelectProject: (project: Project) => void;
}

const ProjectModal: React.FC<ProjectModalProps> = ({
  project,
  onClose,
  index,
  projects,
  onSelectProject,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const { t, language } = useTranslations();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  // Обработка клавиш (Esc, Left, Right)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') handlePrev();
      if (event.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, index, projects]); // Зависимости важны для корректной работы навигации

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (modalRef.current && event.target === modalRef.current) onClose();
  };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (index > 0) {
      onSelectProject(projects[index - 1]);
    }
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (index < projects.length - 1) {
      onSelectProject(projects[index + 1]);
    }
  };

  const title = localizedText(project.title, language);
  const description = localizedText(project.description, language);
  const basePath = import.meta.env.BASE_URL || '/';
  const mediaPath = `${basePath}content/${project.mediaFile}`;
  const isVideo = ['.mp4', '.webm', '.ogg'].some(ext =>
    project.mediaFile.toLowerCase().endsWith(ext)
  );

  return (
    <div
      ref={modalRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/95 p-3 backdrop-blur-md animate-fade-in sm:p-6"
      style={{ animationDuration: '0.3s' }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="relative my-auto flex w-full max-w-6xl flex-col items-center py-10 sm:py-0">
        
        {/* Кнопка Закрыть */}
        <button
          onClick={onClose}
          className="absolute right-1 top-0 z-50 rounded-full bg-black/60 p-2 text-gray-300 transition-colors hover:bg-slate-700 hover:text-white sm:-right-2 sm:-top-12"
          aria-label={t.modal.close}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center justify-between w-full gap-4">
          {/* Кнопка Назад */}
          <button
            onClick={handlePrev}
            disabled={index === 0}
            className={`theme-accent-hover hidden rounded-full bg-white/10 p-2 transition-all sm:flex ${
              index === 0 ? 'opacity-0 cursor-default' : 'text-white cursor-pointer'
            }`}
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Контент */}
          <div className="relative flex max-h-[88vh] w-full flex-col overflow-hidden theme-line rounded-2xl border bg-[color:var(--site-bg)] shadow-2xl">
            <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden">
               {isVideo ? (
                <video
                  key={mediaPath} // Ключ заставляет React пересоздать элемент при смене src
                  src={mediaPath}
                  className="max-h-[64vh] max-w-full object-contain"
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={mediaPath}
                  alt={title}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              )}
            </div>

            {/* Информация внизу */}
            <div className="theme-line theme-surface border-t p-5 sm:p-6">
              <div className="flex justify-between items-start">
                <div>
                   <h3 className="font-display text-2xl text-white">{title}</h3>
                   <div className="mt-2 flex flex-wrap gap-2">
                    {project.tags.map(tag => (
                      <span key={tag} className="font-ui-mono theme-line rounded-md border px-2 py-0.5 text-xs text-slate-400">
                        {tag}
                      </span>
                    ))}
                   </div>
                </div>
              </div>
              <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-slate-300 sm:text-base">{description}</p>
              {project.link && <a href={projectLinkUrl(project)} className="play-glow theme-accent-bg mt-5 inline-block rounded-full px-8 py-3 text-lg font-black transition hover:scale-105">{t.portfolio.play}</a>}
              <p className="font-ui-mono mt-4 text-xs text-slate-500">{String(index + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}</p>
            </div>
          </div>

          {/* Кнопка Вперед */}
          <button
            onClick={handleNext}
            disabled={index === projects.length - 1}
            className={`theme-accent-hover hidden rounded-full bg-white/10 p-2 transition-all sm:flex ${
              index === projects.length - 1 ? 'opacity-0 cursor-default' : 'text-white cursor-pointer'
            }`}
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        
        {/* Мобильная навигация (внизу) */}
        <div className="flex sm:hidden justify-between w-full mt-4 px-4">
           <button 
             onClick={handlePrev} 
             disabled={index === 0}
             className="px-4 py-2 bg-gray-800 rounded-lg text-white disabled:opacity-30"
           >
             {t.modal.prev}
           </button>
           <span className="text-gray-400 self-center">{index + 1} / {projects.length}</span>
           <button 
             onClick={handleNext} 
             disabled={index === projects.length - 1}
             className="px-4 py-2 bg-gray-800 rounded-lg text-white disabled:opacity-30"
           >
             {t.modal.next}
           </button>
        </div>

      </div>
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        @keyframes play-glow {
          from { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.35); }
          to { box-shadow: 0 0 0 10px rgba(255, 255, 255, 0), 0 0 28px currentColor; }
        }
        .play-glow {
          animation: play-glow 1.1s ease-out infinite;
        }
      `}</style>
    </div>
  );
};

export default ProjectModal;
