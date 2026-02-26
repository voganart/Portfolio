import React, { useEffect, useRef } from 'react';
import type { Project } from '../types';
import { useTranslations } from '../hooks/useTranslations';

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
  const { language } = useTranslations();

  // Обработка клавиш (Escape + Стрелки)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && index > 0) {
        onSelectProject(projects[index - 1]);
      }
      if (event.key === 'ArrowRight' && index < projects.length - 1) {
        onSelectProject(projects[index + 1]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, index, projects, onSelectProject]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (modalRef.current && event.target === modalRef.current) onClose();
  };

  const title = project.title[language];
  const description = project.description[language];
  const basePath = import.meta.env.BASE_URL || '/';
  const mediaPath = `${basePath}content/${project.mediaFile}`;
  const isVideo = ['.mp4', '.webm', '.ogg'].some(ext =>
    project.mediaFile.toLowerCase().endsWith(ext)
  );

  return (
    <div
      ref={modalRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in"
      style={{ animationDuration: '0.3s' }}
    >
      <div className="relative w-full max-w-6xl flex flex-col items-center">

        {/* Кнопка закрытия */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 sm:-right-8 text-white/50 hover:text-white transition-colors p-2 z-50"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center justify-between w-full gap-4">
          
          {/* Кнопка НАЗАД (раскомментирована и улучшена) */}
          <button
            onClick={(e) => { e.stopPropagation(); if(index > 0) onSelectProject(projects[index - 1]); }}
            disabled={index === 0}
            className={`hidden md:flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 ${
              index === 0 
                ? 'opacity-0 cursor-default' 
                : 'bg-white/10 hover:bg-teal-500 text-white hover:scale-110'
            }`}
          >
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          {/* Контейнер медиа */}
          <div className="relative bg-gray-900 rounded-lg shadow-2xl overflow-hidden max-h-[80vh] w-full flex justify-center items-center group">
            {isVideo ? (
              <video
                key={mediaPath} // Важно: key заставляет видео перезагружаться при смене слайда
                src={mediaPath}
                className="max-w-full max-h-[80vh] object-contain shadow-lg"
                controls
                autoPlay
                loop
                muted={false} // Включаем звук в модалке по желанию
                playsInline
                controlsList="nodownload"
              />
            ) : (
              <img
                src={mediaPath}
                alt={title}
                className="max-w-full max-h-[80vh] object-contain shadow-lg"
                loading="lazy"
              />
            )}
            
            {/* Описание поверх медиа (снизу, полупрозрачное) */}
            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 text-center pt-12 opacity-100 transition-opacity duration-300">
               <h3 className="text-2xl font-bold text-white mb-2 drop-shadow-md">{title}</h3>
               <p className="text-gray-200 max-w-2xl mx-auto drop-shadow-sm">{description}</p>
            </div>
          </div>

          {/* Кнопка ВПЕРЕД (раскомментирована и улучшена) */}
          <button
            onClick={(e) => { e.stopPropagation(); if(index < projects.length - 1) onSelectProject(projects[index + 1]); }}
            disabled={index === projects.length - 1}
            className={`hidden md:flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 ${
              index === projects.length - 1 
                ? 'opacity-0 cursor-default' 
                : 'bg-white/10 hover:bg-teal-500 text-white hover:scale-110'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
};

export default ProjectModal;