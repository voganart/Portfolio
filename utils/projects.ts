import type { Project } from '../types';

export interface ProjectCategory {
  id: string;
  label: { ru: string; en: string };
  tags: string[];
}

export const PROJECT_CATEGORIES: ProjectCategory[] = [
  { id: 'featured', label: { ru: 'Избранное', en: 'Featured' }, tags: ['Showreel', 'PixiJS', 'Prototyping'] },
  { id: '2d', label: { ru: '2D / Spine', en: '2D / Spine' }, tags: ['2D Animation', 'Spine'] },
  { id: '3d', label: { ru: '3D', en: '3D' }, tags: ['3D Animation', 'Blender', 'Character'] },
  { id: 'vfx-ui', label: { ru: 'VFX / UI', en: 'VFX / UI' }, tags: ['VFX', 'UI', '3D Effects'] },
  { id: 'prototypes', label: { ru: 'Прототипы', en: 'Prototypes' }, tags: ['Prototyping', 'Game Development', 'Gameplay', 'Godot', 'Unity', 'PixiJS'] },
  { id: 'renders', label: { ru: 'Рендеры', en: 'Renders' }, tags: ['3D Render', 'Environment'] },
];

export const getUniqueTags = (projects: Project[]) =>
  Array.from(new Set(projects.flatMap((project) => project.tags.map((tag) => tag.trim())).filter(Boolean))).sort();

export const filterProjects = (projects: Project[], query: string, tag: string | null) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return projects.filter((project) => {
    const matchesTag = !tag || project.tags.includes(tag);
    const haystack = [project.title.ru, project.title.en, project.mediaFile, ...project.tags]
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
  const category = PROJECT_CATEGORIES.find((item) => item.id === categoryId);
  return !category || category.tags.some((tag) => project.tags.includes(tag));
};
