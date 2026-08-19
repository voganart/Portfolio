import React from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Project } from '../../types';

interface SortableRowProps {
  project: Project;
  active: boolean;
  basePath: string;
  disabled: boolean;
  onSelect: () => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ project, active, basePath, disabled, onSelect }) => {
  const sortable = useSortable({ id: project.id, disabled });
  const mediaUrl = `${basePath}content/${project.mediaFile}`;
  const posterUrl = `${basePath}content/posters/${project.mediaFile.replace(/\.[^.]+$/, '.jpg')}`;
  const isVideo = /\.(mp4|webm|ogg)$/i.test(project.mediaFile);

  return (
    <div ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className={`group flex items-center gap-3 rounded-xl border p-2 transition ${active ? 'border-teal-400 bg-teal-400/10' : 'border-slate-700 bg-slate-800 hover:border-slate-500'}`}>
      <button {...sortable.attributes} {...sortable.listeners} disabled={disabled} className="cursor-grab touch-none rounded-lg px-2 py-4 text-slate-500 hover:bg-slate-700 hover:text-white disabled:cursor-default disabled:opacity-20" title={disabled ? 'Очистите поиск и фильтр для сортировки' : 'Изменить порядок'} aria-label={`Переместить ${project.title.ru}`}>⋮⋮</button>
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-black">
          {project.mediaFile && (isVideo ? (
            <video src={`${mediaUrl}#t=0.1`} poster={posterUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
          ) : (
            <img src={mediaUrl} className="h-full w-full object-cover" alt="" loading="lazy" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">#{project.order}</span>
            <strong className="truncate text-sm text-white">{project.title.ru || 'Без названия'}</strong>
          </div>
          <p className="mt-1 truncate text-xs text-slate-400">{project.tags.join(' · ') || 'Без тегов'}</p>
        </div>
      </button>
    </div>
  );
};

interface ProjectListProps {
  projects: Project[];
  selectedId: number | null;
  basePath: string;
  query: string;
  tag: string | null;
  tags: string[];
  onQueryChange: (value: string) => void;
  onTagChange: (value: string | null) => void;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onReorder: (event: DragEndEvent) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ projects, selectedId, basePath, query, tag, tags, onQueryChange, onTagChange, onSelect, onAdd, onReorder }) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sortingDisabled = Boolean(query.trim() || tag);

  return (
    <aside className="min-w-0 rounded-2xl border border-slate-700 bg-slate-900/70 p-3 lg:sticky lg:top-36 lg:h-[calc(100vh-10rem)]">
      <div className="flex gap-2">
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Поиск по названию, тегу, файлу…" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-500" />
        <button onClick={onAdd} className="rounded-lg bg-teal-600 px-4 py-2 font-black text-white hover:bg-teal-500" title="Создать проект">+</button>
      </div>
      <select value={tag || ''} onChange={(event) => onTagChange(event.target.value || null)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-teal-500">
        <option value="">Все теги</option>
        {tags.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>Найдено: {projects.length}</span>
        {sortingDisabled && <span>Сортировка временно выключена</span>}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onReorder}>
        <SortableContext items={projects.map((project) => project.id)} strategy={verticalListSortingStrategy}>
          <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto pr-1 lg:max-h-[calc(100vh-18.5rem)]">
            {projects.map((project) => <SortableRow key={project.id} project={project} active={selectedId === project.id} basePath={basePath} disabled={sortingDisabled} onSelect={() => onSelect(project.id)} />)}
            {!projects.length && <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">Ничего не найдено</p>}
          </div>
        </SortableContext>
      </DndContext>
    </aside>
  );
};

export default ProjectList;
