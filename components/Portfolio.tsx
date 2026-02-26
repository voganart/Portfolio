import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Project } from '../types';
import { useTranslations } from '../hooks/useTranslations';
import ProjectModal from './ProjectModal';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onClick }) => {
  const { language } = useTranslations();
  const title = project.title[language];
  const description = project.description[language];

  const basePath = import.meta.env.BASE_URL;
  const mediaPath = `${basePath}content/${project.mediaFile}`;
  const isVideo = /\.(mp4|webm|ogg)$/i.test(project.mediaFile);

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Hover-play только на десктопе
  useEffect(() => {
    if (!videoRef.current || isTouchDevice) return;

    if (isHovered) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
      // Возвращаем на 0.1 секунду, чтобы превью не сбрасывалось в черный экран
      videoRef.current.currentTime = 0.1; 
    }
  }, [isHovered, isTouchDevice]);

  return (
    <div
      className="group relative overflow-hidden rounded-lg bg-black/30 backdrop-blur-lg border border-white/10 shadow-xl transition-all duration-300 hover:border-teal-300/30 hover:shadow-teal-400/10 hover:scale-[1.02] cursor-pointer"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 
        Умный рендер: теперь мы всегда используем <video> для видео, 
        даже на мобилках. Трюк #t=0.1 заставляет браузер загрузить первый кадр 
        как картинку, так что нам больше не нужны отдельные .jpg постеры!
      */}
      {isVideo ? (
        <video
          ref={videoRef}
          src={`${mediaPath}#t=0.1`} 
          className="w-full h-56 object-cover transition-transform duration-500 group-hover:scale-110"
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          src={mediaPath}
          alt={title}
          className="w-full h-56 object-cover transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
      <div className="absolute bottom-0 left-0 p-6 text-white w-full">
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="mt-2 text-sm text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 h-0 group-hover:h-auto">
          {description}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs font-semibold bg-teal-400/20 text-teal-200 px-2 py-1 rounded-md"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

interface PortfolioProps {
  projects: Project[];
}

const Portfolio: React.FC<PortfolioProps> = ({ projects }) => {
  const { t } = useTranslations();
  const[showAll, setShowAll] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    projects.forEach(p => p.tags.forEach(tag => tags.add(tag)));
    return Array.from(tags).sort();
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (!selectedTag) return projects;
    return projects.filter(p => p.tags.includes(selectedTag));
  },[projects, selectedTag]);

  const displayedProjects = showAll ? filteredProjects : filteredProjects.slice(0, 9);

  return (
    <>
      <section id="portfolio" className="py-20 sm:py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              {t.portfolio.title}
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-400">{t.portfolio.subtitle}</p>
          </div>

          <div className="mt-12 flex justify-center flex-wrap gap-3">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors duration-200 ${
                !selectedTag 
                  ? 'bg-teal-600 text-white' 
                  : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
              }`}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-4 py-2 text-sm font-medium rounded-full transition-colors duration-200 ${
                  selectedTag === tag 
                    ? 'bg-teal-600 text-white' 
                    : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => setSelectedProject(project)}
              />
            ))}
          </div>

          {filteredProjects.length > 9 && !showAll && (
            <div className="mt-16 text-center">
              <button
                onClick={() => setShowAll(true)}
                className="bg-teal-600/80 text-white font-bold py-3 px-8 rounded-full hover:bg-teal-700/80 transition-colors duration-300"
              >
                {t.portfolio.showAll}
              </button>
            </div>
          )}
        </div>
      </section>

      {selectedProject && (
        <ProjectModal
          project={selectedProject}
          index={filteredProjects.findIndex((p) => p.id === selectedProject.id)}
          projects={filteredProjects}
          onClose={() => setSelectedProject(null)}
          onSelectProject={setSelectedProject}
        />
      )}
    </>
  );
};

export default Portfolio;