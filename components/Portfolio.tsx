import React, { useState } from 'react';
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

  // 🔹 проверяем, видео это или нет
  const isVideo = ['.mp4', '.webm', '.ogg'].some(ext => project.mediaFile.toLowerCase().endsWith(ext));
  const mediaPath = `${import.meta.env.BASE_URL}content/${project.mediaFile}`;

  return (
    <div
      className="group relative overflow-hidden rounded-lg bg-black/30 backdrop-blur-lg border border-white/10 shadow-xl transition-all duration-300 hover:border-teal-300/30 hover:shadow-teal-400/10 hover:scale-[1.02] cursor-pointer"
      onClick={onClick}
    >
      {isVideo ? (
        <video
          src={mediaPath}
          className="w-full h-56 object-cover transition-transform duration-500 group-hover:scale-110"
          muted
          loop
          autoPlay
          playsInline
        />
      ) : (
        <img
          src={mediaPath}
          alt={title}
          className="w-full h-56 object-cover transition-transform duration-500 group-hover:scale-110"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
      <div className="absolute bottom-0 left-0 p-6 text-white w-full">
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="mt-2 text-sm text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 h-0 group-hover:h-auto">{description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <span key={tag} className="text-xs font-semibold bg-teal-400/20 text-teal-200 px-2 py-1 rounded-md">
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
  const [showAll, setShowAll] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const displayedProjects = showAll ? projects : projects.slice(0, 9);

  return (
    <>
      <section id="portfolio" className="py-20 sm:py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">{t.portfolio.title}</h2>
            <p className="mt-4 text-lg leading-8 text-gray-400">{t.portfolio.subtitle}</p>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedProjects.map((project) => (
              <ProjectCard key={project.id} project={project} onClick={() => setSelectedProject(project)} />
            ))}
          </div>

          {projects.length > 9 && !showAll && (
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
          onClose={() => setSelectedProject(null)}
        />
      )}
    </>
  );
};

export default Portfolio;
