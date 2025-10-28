import React, { useEffect, useRef } from 'react';
import type { Project } from '../types';
import { useTranslations } from '../hooks/useTranslations';

interface ProjectModalProps {
  project: Project;
  onClose: () => void;
}

const ProjectModal: React.FC<ProjectModalProps> = ({ project, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const { language } = useTranslations();

  // закрытие по ESC
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // закрытие по клику на фон
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (modalRef.current && event.target === modalRef.current) onClose();
  };

  const title = project.title[language];
  const description = project.description[language];

  // 🔧 корректный путь для GitHub Pages
  const basePath = import.meta.env.BASE_URL || '/';
  const mediaPath = `${basePath}content/${project.mediaFile}`;

  const isVideo = ['.mp4', '.webm', '.ogg'].some(ext =>
    project.mediaFile.toLowerCase().endsWith(ext)
  );

  return (
    <div
      ref={modalRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in"
      style={{ animationDuration: '0.3s' }}
    >
      <div className="relative bg-gray-900/70 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col items-center p-4">
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 bg-white text-black rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold z-10 hover:scale-110 transition-transform"
          aria-label="Close"
        >
          &times;
        </button>

        <div className="w-full h-full flex items-center justify-center">
          {isVideo ? (
            <video
              src={mediaPath}
              className="max-w-full max-h-[80vh] object-contain rounded-md"
              controls
              autoPlay
              loop
              muted
              playsInline
              controlsList="nodownload"
            />
          ) : (
            <img
              src={mediaPath}
              alt={title}
              className="max-w-full max-h-[80vh] object-contain rounded-md"
              loading="lazy"
            />
          )}
        </div>

        <div className="w-full text-center mt-4 text-white p-2 bg-black/30 rounded-b-lg">
          <h3 className="text-xl font-bold">{title}</h3>
          <p className="mt-1 text-sm text-gray-300">{description}</p>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease;
        }
      `}</style>
    </div>
  );
};

export default ProjectModal;
