import React, { useEffect, useMemo, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import type { Project } from '../types';
import AdminToolbar from './admin/AdminToolbar';
import ProjectList from './admin/ProjectList';
import ProjectEditor from './admin/ProjectEditor';
import { filterProjects, getProjectValidationErrors, getUniqueTags, normalizeProjects } from '../utils/projects';

interface GitStatus {
  ahead: number;
  behind: number;
  tracking: string | null;
}

const API_URL = 'http://localhost:4000/api';
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = /\.(mp4|webm|ogg|png|jpe?g|webp)$/i;

const AdminPanel: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [translatingId, setTranslatingId] = useState<number | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [message, setMessage] = useState('');

  const basePath = import.meta.env.BASE_URL || '/';
  const selectedProject = projects.find((project) => project.id === selectedId) || null;
  const tags = useMemo(() => getUniqueTags(projects), [projects]);
  const visibleProjects = useMemo(() => filterProjects(projects, query, selectedTag), [projects, query, selectedTag]);
  const duplicateTitle = Boolean(selectedProject && projects.some((project) => project.id !== selectedProject.id && project.title.ru.trim() && project.title.ru.trim().toLocaleLowerCase() === selectedProject.title.ru.trim().toLocaleLowerCase()));

  const readApiError = async (response: Response) => {
    const data = await response.json().catch(() => null);
    if (data?.files?.length) {
      return `${data.message} ${data.files.map((file: { name: string; sizeMb: string }) => `${file.name} (${file.sizeMb} МБ)`).join(', ')}`;
    }
    return data?.message || data?.error || `Ошибка сервера: ${response.status}`;
  };

  const refreshGitStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/git-status`);
      if (response.ok) setGitStatus(await response.json());
    } catch (error) {
      console.error('Ошибка проверки Git:', error);
    }
  };

  useEffect(() => {
    refreshGitStatus();
    fetch(`${API_URL}/projects`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response));
        return response.json();
      })
      .then((data: Project[]) => {
        const sorted = [...data].sort((a, b) => a.order - b.order);
        setProjects(sorted);
        setSelectedId(sorted[0]?.id ?? null);
      })
      .catch((error) => setMessage(`Ошибка загрузки: ${error.message}. Сервер запущен?`))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  const updateProject = (id: number, updater: (project: Project) => Project) => {
    setProjects((current) => current.map((project) => project.id === id ? updater(project) : project));
    setDirty(true);
  };

  const selectProject = (id: number) => {
    setSelectedId(id);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() => document.getElementById('admin-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const handleFieldChange = (field: string, value: string | string[]) => {
    if (!selectedProject) return;
    updateProject(selectedProject.id, (project) => {
      if (field === 'tags') return { ...project, tags: value as string[] };
      if (field === 'mediaFile') return { ...project, mediaFile: value as string };
      const [group, language] = field.split('.') as ['title' | 'description', 'ru' | 'en'];
      return { ...project, [group]: { ...project[group], [language]: value as string } };
    });
  };

  const validationMessage = (items: Project[]) => {
    const invalid = items
      .map((project) => ({ project, errors: getProjectValidationErrors(project) }))
      .find((entry) => entry.errors.length > 0);
    if (!invalid) return '';
    setSelectedId(invalid.project.id);
    return `Не сохранено: «${invalid.project.title.ru || `проект #${invalid.project.order}`}» — ${invalid.errors.join(', ')}.`;
  };

  const saveProjects = async (options: { silent?: boolean } = {}) => {
    const validationError = validationMessage(projects);
    if (validationError) {
      setMessage(validationError);
      return false;
    }

    setSaving(true);
    if (!options.silent) setMessage('Сохраняю локально…');
    const normalized = normalizeProjects(projects);
    try {
      const response = await fetch(`${API_URL}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      setProjects(normalized);
      setDirty(false);
      if (!options.silent) setMessage('Сохранено локально. Можно проверить сайт или опубликовать.');
      return true;
    } catch (error) {
      setMessage(`Ошибка сохранения: ${error instanceof Error ? error.message : 'нет соединения'}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const publishProjects = async () => {
    if (!window.confirm('Сохранить изменения и опубликовать сайт на GitHub Pages?')) return;
    if (dirty && !(await saveProjects({ silent: true }))) return;
    setPublishing(true);
    setMessage('Публикация… Обычно занимает около 30 секунд.');
    try {
      const response = await fetch(`${API_URL}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!response.ok) throw new Error(await readApiError(response));
      setMessage('Опубликовано. GitHub Pages обновится через несколько минут.');
      await refreshGitStatus();
    } catch (error) {
      setMessage(`Ошибка публикации: ${error instanceof Error ? error.message : 'нет соединения'}`);
    } finally {
      setPublishing(false);
    }
  };

  const addProject = () => {
    const id = projects.length ? Math.max(...projects.map((project) => project.id)) + 1 : 1;
    const created: Project = { id, order: 1, title: { ru: 'Новый проект', en: 'New Project' }, description: { ru: '', en: '' }, mediaFile: '', tags: [] };
    setProjects((current) => normalizeProjects([created, ...current]));
    setSelectedId(id);
    setQuery('');
    setSelectedTag(null);
    setDirty(true);
    setMessage('Новый проект создан локально. Заполните поля и сохраните.');
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() => document.getElementById('admin-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const deleteProject = () => {
    if (!selectedProject || !window.confirm(`Удалить проект «${selectedProject.title.ru}» из списка? Изменение применится после сохранения.`)) return;
    const index = projects.findIndex((project) => project.id === selectedProject.id);
    const next = projects[index + 1] || projects[index - 1] || null;
    setProjects((current) => normalizeProjects(current.filter((project) => project.id !== selectedProject.id)));
    setSelectedId(next?.id ?? null);
    setDirty(true);
    setMessage('Проект убран из списка. Для применения нажмите «Сохранить».');
  };

  const uploadMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedProject) return;
    event.target.value = '';
    if (!ACCEPTED_EXTENSIONS.test(file.name)) {
      setMessage('Неподдерживаемый формат. Используйте MP4, WebM, OGG, PNG, JPG или WebP.');
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      setMessage('Файл больше 100 МБ. Уменьшите размер перед загрузкой.');
      return;
    }

    const projectId = selectedProject.id;
    setUploadingId(projectId);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(await readApiError(response));
      const data = await response.json();
      updateProject(projectId, (project) => ({ ...project, mediaFile: data.filename }));
      setMessage(`Файл ${data.filename} загружен. Сохраните проект.`);
    } catch (error) {
      setMessage(`Ошибка загрузки: ${error instanceof Error ? error.message : 'нет соединения'}`);
    } finally {
      setUploadingId(null);
    }
  };

  const translateDescription = async () => {
    if (!selectedProject?.description.ru.trim()) {
      setMessage('Сначала заполните описание на русском.');
      return;
    }
    const projectId = selectedProject.id;
    setTranslatingId(projectId);
    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(selectedProject.description.ru)}&langpair=ru|en`);
      const data = await response.json();
      if (!response.ok || !data.responseData?.translatedText) throw new Error('сервис не вернул перевод');
      updateProject(projectId, (project) => ({ ...project, description: { ...project.description, en: data.responseData.translatedText } }));
      setMessage('Перевод добавлен. Проверьте текст перед сохранением.');
    } catch (error) {
      setMessage(`Ошибка перевода: ${error instanceof Error ? error.message : 'сервис недоступен'}`);
    } finally {
      setTranslatingId(null);
    }
  };

  const reorderProjects = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id || query.trim() || selectedTag) return;
    setProjects((current) => {
      const oldIndex = current.findIndex((project) => project.id === event.active.id);
      const newIndex = current.findIndex((project) => project.id === event.over?.id);
      return normalizeProjects(arrayMove(current, oldIndex, newIndex));
    });
    setDirty(true);
  };

  const goToSite = () => {
    if (dirty && !window.confirm('Есть несохранённые изменения. Перейти на сайт без сохранения?')) return;
    window.location.hash = '';
  };

  const undoCommits = async () => {
    const count = gitStatus?.ahead || 0;
    if (!count || !window.confirm(`Отменить ${count} неопубликованных коммитов? Файлы останутся на диске.`)) return;
    setUndoing(true);
    try {
      const response = await fetch(`${API_URL}/undo-unpublished`, { method: 'POST' });
      if (!response.ok) throw new Error(await readApiError(response));
      const data = await response.json();
      setMessage(data.message);
      await refreshGitStatus();
    } catch (error) {
      setMessage(`Ошибка отмены: ${error instanceof Error ? error.message : 'нет соединения'}`);
    } finally {
      setUndoing(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-950 p-10 text-xl font-bold text-white">Загрузка админки…</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-[1600px] p-3 sm:p-6">
        <AdminToolbar projectCount={projects.length} dirty={dirty} saving={saving} publishing={publishing} undoing={undoing} ahead={gitStatus?.ahead || 0} message={message} onBack={goToSite} onSave={() => { void saveProjects(); }} onPublish={() => { void publishProjects(); }} onUndo={() => { void undoCommits(); }} />
        <main className="mt-5 grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <ProjectList projects={visibleProjects} selectedId={selectedId} basePath={basePath} query={query} tag={selectedTag} tags={tags} onQueryChange={setQuery} onTagChange={setSelectedTag} onSelect={selectProject} onAdd={addProject} onReorder={reorderProjects} />
          <ProjectEditor key={selectedProject?.id || 'empty'} project={selectedProject} basePath={basePath} uploading={uploadingId === selectedProject?.id} translating={translatingId === selectedProject?.id} duplicateTitle={duplicateTitle} onChange={handleFieldChange} onUpload={uploadMedia} onTranslate={() => { void translateDescription(); }} onDelete={deleteProject} />
        </main>
      </div>
    </div>
  );
};

export default AdminPanel;
