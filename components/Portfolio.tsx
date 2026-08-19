import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../types';
import { useTranslations } from '../hooks/useTranslations';
import ProjectModal from './ProjectModal';
import { PROJECT_CATEGORIES, getUniqueTags, matchesCategory } from '../utils/projects';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onClick }) => {
  const { language } = useTranslations();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const title = project.title[language];
  const description = project.description[language];
  const basePath = import.meta.env.BASE_URL;
  const mediaPath = `${basePath}content/${project.mediaFile}`;
  const posterPath = `${basePath}content/posters/${project.mediaFile.replace(/\.[^.]+$/, '.jpg')}`;
  const isVideo = /\.(mp4|webm|ogg)$/i.test(project.mediaFile);

  const playPreview = () => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    setIsPreviewing(true);
    videoRef.current?.play().catch(() => undefined);
  };
  const stopPreview = () => {
    setIsPreviewing(false);
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = 0;
  };

  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/75 shadow-xl shadow-slate-950/30 transition duration-300 hover:-translate-y-1 hover:border-teal-300/30 hover:shadow-teal-950/30">
      <button onClick={onClick} onMouseEnter={playPreview} onMouseLeave={stopPreview} className="block w-full text-left" aria-label={`${title}: ${description}`}>
        <div className="aspect-[16/10] overflow-hidden bg-black">
          {isVideo ? (
            <div className="relative h-full w-full">
              <video ref={videoRef} src={`${mediaPath}#t=0.1`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" muted loop playsInline preload="metadata" />
              {!posterFailed && !isPreviewing && <img src={posterPath} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setPosterFailed(true)} />}
            </div>
          ) : (
            <img src={mediaPath} alt={title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
          )}
        </div>
        <div className="p-5">
          <h3 className="text-xl font-black text-white">{title}</h3>
          <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-400">{description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {project.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-teal-400/10 px-2.5 py-1 text-[11px] font-bold text-teal-300">{tag}</span>)}
            {project.tags.length > 4 && <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-400">+{project.tags.length - 4}</span>}
          </div>
        </div>
      </button>
    </article>
  );
};

interface PortfolioProps {
  projects: Project[];
}

const Portfolio: React.FC<PortfolioProps> = ({ projects }) => {
  const { t, language } = useTranslations();
  const [showAll, setShowAll] = useState(false);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>('featured');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const allTags = useMemo(() => getUniqueTags(projects), [projects]);

  const filteredProjects = useMemo(() => projects.filter((project) => {
    if (selectedTag) return project.tags.includes(selectedTag);
    return matchesCategory(project, selectedCategory);
  }), [projects, selectedCategory, selectedTag]);

  useEffect(() => setShowAll(false), [selectedCategory, selectedTag]);
  const displayedProjects = showAll ? filteredProjects : filteredProjects.slice(0, 9);
  const chooseCategory = (id: string | null) => { setSelectedCategory(id); setSelectedTag(null); };
  const chooseTag = (tag: string) => { setSelectedTag(tag); setSelectedCategory(null); };

  return (
    <section id="portfolio" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-400">Selected work</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">{t.portfolio.title}</h2>
            <p className="mt-3 text-lg text-slate-400">{t.portfolio.subtitle}</p>
          </div>
          <p className="text-sm font-semibold text-slate-500">{filteredProjects.length} {t.portfolio.projectsCount}</p>
        </div>

        <div className="filter-scroll mt-9 flex gap-2 overflow-x-auto pb-2 sm:flex-wrap">
          <button onClick={() => chooseCategory(null)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${!selectedCategory && !selectedTag ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{t.portfolio.all}</button>
          {PROJECT_CATEGORIES.map((category) => <button key={category.id} onClick={() => chooseCategory(category.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${selectedCategory === category.id ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{category.label[language]}</button>)}
          <button onClick={() => setShowAllFilters((value) => !value)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${showAllFilters || selectedTag ? 'border-purple-400 bg-purple-400/15 text-purple-200' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>{t.portfolio.allFilters}</button>
        </div>

        {showAllFilters && <div className="mt-3 flex flex-wrap gap-2 rounded-2xl border border-white/5 bg-slate-900/60 p-4">{allTags.map((tag) => <button key={tag} onClick={() => chooseTag(tag)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${selectedTag === tag ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>{tag}</button>)}</div>}

        {displayedProjects.length ? (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {displayedProjects.map((project) => <ProjectCard key={project.id} project={project} onClick={() => setSelectedProject(project)} />)}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-700 py-20 text-center text-slate-500">{t.portfolio.empty}</div>
        )}

        {filteredProjects.length > 9 && <div className="mt-12 text-center"><button onClick={() => setShowAll((value) => !value)} className="rounded-full border border-teal-400/30 bg-teal-400/10 px-8 py-3 font-bold text-teal-300 transition hover:bg-teal-400 hover:text-slate-950">{showAll ? t.portfolio.showLess : t.portfolio.showAll}</button></div>}
      </div>

      {selectedProject && <ProjectModal project={selectedProject} index={filteredProjects.findIndex((project) => project.id === selectedProject.id)} projects={filteredProjects} onClose={() => setSelectedProject(null)} onSelectProject={setSelectedProject} />}
    </section>
  );
};

export default Portfolio;
