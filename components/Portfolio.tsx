import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../types';
import { useTranslations } from '../hooks/useTranslations';
import ProjectModal from './ProjectModal';
import { FEATURED_CATEGORY_ID, PROJECT_CATEGORIES, getUniqueTags, localizedText, matchesCategory, projectLinkUrl } from '../utils/projects';

interface ProjectCardProps {
  project: Project;
  big?: boolean; // первая работа в подборке — крупная карточка 2×2
  onClick: () => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, big = false, onClick }) => {
  const { t, language } = useTranslations();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const title = localizedText(project.title, language);
  const description = localizedText(project.description, language);
  const basePath = import.meta.env.BASE_URL;
  const mediaPath = `${basePath}content/${project.mediaFile}`;
  const posterPath = `${basePath}content/posters/${project.mediaFile.replace(/\.[^.]+$/, '.jpg')}`;
  const isVideo = /\.(mp4|webm|ogg)$/i.test(project.mediaFile);
  const playLabel = t.portfolio.play;

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
    <article className={`theme-surface theme-line theme-card-hover group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-1 ${big ? 'md:col-span-2 md:row-span-2' : ''}`}>
      <button onClick={onClick} onMouseEnter={playPreview} onMouseLeave={stopPreview} className="flex w-full flex-1 flex-col text-left" aria-label={`${title}: ${description}`}>
        <div className={`relative w-full overflow-hidden bg-black ${big ? 'aspect-[16/10] md:aspect-auto md:min-h-72 md:flex-1' : 'aspect-[16/10]'}`}>
          {isVideo ? (
            <div className="relative h-full w-full">
              <video ref={videoRef} src={`${mediaPath}#t=0.1`} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" muted loop playsInline preload="metadata" />
              {!posterFailed && !isPreviewing && <img src={posterPath} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setPosterFailed(true)} />}
            </div>
          ) : (
            <img src={mediaPath} alt={title} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
          )}
        </div>
        <div className={big ? 'p-6' : 'p-5'}>
          <h3 className={big ? 'font-display text-2xl text-white sm:text-3xl' : 'text-lg font-bold text-white'}>{title}</h3>
          <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-400">{description}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {project.tags.slice(0, 4).map((tag) => <span key={tag} className="font-ui-mono theme-line rounded-md border px-2 py-0.5 text-[11px] text-slate-400">{tag}</span>)}
            {project.tags.length > 4 && <span className="font-ui-mono theme-line rounded-md border px-2 py-0.5 text-[11px] text-slate-500">+{project.tags.length - 4}</span>}
          </div>
        </div>
      </button>
      {/* the card itself opens the viewer; only this button starts the game (a link can't sit inside the card button) */}
      {project.link && (
        <a href={projectLinkUrl(project)} className="theme-accent-bg absolute right-3 top-3 rounded-full px-4 py-1.5 text-sm font-black shadow-lg shadow-black/40 transition hover:scale-110">{playLabel}</a>
      )}
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
  const hasFeatured = projects.some((project) => project.featured);
  // При первом открытии показываем работы, отмеченные в админке; если таких нет — все
  const [selectedCategory, setSelectedCategory] = useState<string | null>(hasFeatured ? FEATURED_CATEGORY_ID : null);
  const categories = hasFeatured ? PROJECT_CATEGORIES : PROJECT_CATEGORIES.filter((category) => category.id !== FEATURED_CATEGORY_ID);
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">{t.portfolio.eyebrow}</p>
            <h2 className="font-display mt-3 text-4xl text-white sm:text-5xl">{t.portfolio.title}</h2>
            <p className="mt-3 text-lg text-slate-400">{t.portfolio.subtitle}</p>
          </div>
          <p className="font-ui-mono flex items-center gap-2 text-xs text-slate-500"><span className="keyframe" aria-hidden="true" />{filteredProjects.length} {t.portfolio.projectsCount}</p>
        </div>

        <div className="filter-scroll mt-9 flex gap-2 overflow-x-auto pb-2 sm:flex-wrap">
          <button onClick={() => chooseCategory(null)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${!selectedCategory && !selectedTag ? 'theme-accent-bg' : 'theme-line border text-slate-300 hover:bg-white/5'}`}>{t.portfolio.all}</button>
          {categories.map((category) => <button key={category.id} onClick={() => chooseCategory(category.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${selectedCategory === category.id ? 'theme-accent-bg' : 'theme-line border text-slate-300 hover:bg-white/5'}`}>{category.label[language]}</button>)}
          <button onClick={() => setShowAllFilters((value) => !value)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${showAllFilters || selectedTag ? 'theme-secondary-soft border-transparent' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>{t.portfolio.allFilters}</button>
        </div>

        {showAllFilters && <div className="theme-surface-soft mt-3 flex flex-wrap gap-2 rounded-2xl border border-white/5 p-4">{allTags.map((tag) => <button key={tag} onClick={() => chooseTag(tag)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${selectedTag === tag ? 'theme-secondary-bg text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>{tag}</button>)}</div>}

        {displayedProjects.length ? (
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {displayedProjects.map((project, index) => <ProjectCard key={project.id} project={project} big={index === 0 && displayedProjects.length >= 5} onClick={() => setSelectedProject(project)} />)}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-700 py-20 text-center text-slate-500">{t.portfolio.empty}</div>
        )}

        {filteredProjects.length > 9 && <div className="mt-12 text-center"><button onClick={() => setShowAll((value) => !value)} className="theme-accent-soft theme-accent-border theme-accent-hover rounded-full border px-8 py-3 font-bold transition">{showAll ? t.portfolio.showLess : t.portfolio.showAll}</button></div>}
      </div>

      {selectedProject && <ProjectModal project={selectedProject} index={filteredProjects.findIndex((project) => project.id === selectedProject.id)} projects={filteredProjects} onClose={() => setSelectedProject(null)} onSelectProject={setSelectedProject} />}
    </section>
  );
};

export default Portfolio;
