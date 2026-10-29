import type { LocalizedText, Project } from '../types';
import type { Language } from '../context/LanguageContext';

export interface ProjectCategory {
  id: string;
  label: Record<Language, string>;
  tags: string[];
}

export const FEATURED_CATEGORY_ID = 'featured';

export const PROJECT_CATEGORIES: ProjectCategory[] = [
  // «Избранное» выбирается вручную в админке (project.featured), а не по тегам
  { id: FEATURED_CATEGORY_ID, label: { ru: 'Избранное', en: 'Featured', es: 'Destacados' }, tags: [] },
  { id: '2d', label: { ru: '2D / Spine', en: '2D / Spine', es: '2D / Spine' }, tags: ['2D Animation', 'Spine'] },
  { id: '3d', label: { ru: '3D', en: '3D', es: '3D' }, tags: ['3D Animation', 'Blender', 'Character'] },
  { id: 'vfx-ui', label: { ru: 'VFX / UI', en: 'VFX / UI', es: 'VFX / UI' }, tags: ['VFX', 'UI', '3D Effects'] },
  { id: 'prototypes', label: { ru: 'Прототипы', en: 'Prototypes', es: 'Prototipos' }, tags: ['Prototyping', 'Game Development', 'Gameplay', 'Godot', 'Unity', 'PixiJS'] },
  { id: 'renders', label: { ru: 'Рендеры', en: 'Renders', es: 'Renders' }, tags: ['3D Render', 'Environment'] },
];

// текст проекта на нужном языке; пустой перевод (обычно es) — откат на en
export const localizedText = (text: LocalizedText, language: Language) => text[language]?.trim() ? text[language]! : text.en;

export const getUniqueTags = (projects: Project[]) =>
  Array.from(new Set(projects.flatMap((project) => project.tags.map((tag) => tag.trim())).filter(Boolean))).sort();

// Специальное значение фильтра в админке: показать только избранные проекты
export const FEATURED_FILTER = '__featured__';

export const filterProjects = (projects: Project[], query: string, tag: string | null) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return projects.filter((project) => {
    const matchesTag = !tag || (tag === FEATURED_FILTER ? Boolean(project.featured) : project.tags.includes(tag));
    const haystack = [project.title.ru, project.title.en, project.title.es || '', project.mediaFile, ...project.tags]
      .join(' ')
      .toLocaleLowerCase();
    return matchesTag && (!normalizedQuery || haystack.includes(normalizedQuery));
  });
};

export const getProjectValidationErrors = (project: Project) => {
  const errors: string[] = [];
  if (!project.title.ru.trim()) errors.push('Название RU');
  if (!project.title.en.trim()) errors.push('Title EN');
  if (!project.mediaFile.trim()) errors.push('Медиафайл');
  if (!project.tags.some((tag) => tag.trim())) errors.push('Хотя бы один тег');
  return errors;
};

export const normalizeProjects = (projects: Project[]) =>
  projects.map((project, index) => ({
    ...project,
    order: index + 1,
    tags: Array.from(new Set(project.tags.map((tag) => tag.trim()).filter(Boolean))),
  }));

export const matchesCategory = (project: Project, categoryId: string | null) => {
  if (!categoryId) return true;
  if (categoryId === FEATURED_CATEGORY_ID) return Boolean(project.featured);
  const category = PROJECT_CATEGORIES.find((item) => item.id === categoryId);
  return !category || category.tags.some((tag) => project.tags.includes(tag));
};

// проект со ссылкой (например, игра) открывается отдельной страницей, остальные — в просмотрщике
export const projectLinkUrl = (project: Project) =>
  /^https?:\/\//.test(project.link || '') ? project.link! : `${import.meta.env.BASE_URL}${(project.link || '').replace(/^\//, '')}`;
