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
        
        {/* Кнопка Закрыть */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 sm:-right-4 text-gray-400 hover:text-white transition-colors z-50 p-2"
          aria-label="Close"
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
            className={`hidden sm:flex p-2 rounded-full bg-white/10 hover:bg-teal-600/80 transition-all ${
              index === 0 ? 'opacity-0 cursor-default' : 'text-white cursor-pointer'
            }`}
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Контент */}
          <div className="relative bg-gray-900 rounded-lg shadow-2xl overflow-hidden max-h-[85vh] w-full flex flex-col">
            <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden">
               {isVideo ? (
                <video
                  key={mediaPath} // Ключ заставляет React пересоздать элемент при смене src
                  src={mediaPath}
                  className="max-w-full max-h-[70vh] object-contain"
                  controls
                  autoPlay
                  loop
                  muted={false} // В модалке звук можно включить по дефолту или оставить выкл
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
            <div className="p-6 bg-gray-800 border-t border-gray-700">
              <div className="flex justify-between items-start">
                <div>
                   <h3 className="text-2xl font-bold text-white">{title}</h3>
                   <div className="mt-2 flex flex-wrap gap-2">
                    {project.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded text-xs bg-gray-700 text-teal-400 border border-gray-600">
                        {tag}
                      </span>
                    ))}
                   </div>
                </div>
              </div>
              <p className="mt-4 text-gray-300 leading-relaxed">{description}</p>
            </div>
          </div>

          {/* Кнопка Вперед */}
          <button
            onClick={handleNext}
            disabled={index === projects.length - 1}
            className={`hidden sm:flex p-2 rounded-full bg-white/10 hover:bg-teal-600/80 transition-all ${
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
             Prev
           </button>
           <span className="text-gray-400 self-center">{index + 1} / {projects.length}</span>
           <button 
             onClick={handleNext} 
             disabled={index === projects.length - 1}
             className="px-4 py-2 bg-gray-800 rounded-lg text-white disabled:opacity-30"
           >
             Next
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
      `}</style>
    </div>
  );
};

export default ProjectModal;