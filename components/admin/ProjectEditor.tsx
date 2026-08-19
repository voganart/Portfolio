import React, { useState } from 'react';
import type { Project } from '../../types';
import { getProjectValidationErrors } from '../../utils/projects';

interface ProjectEditorProps {
  project: Project | null;
  basePath: string;
  uploading: boolean;
  translating: boolean;
  duplicateTitle: boolean;
  onChange: (field: string, value: string | string[]) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTranslate: () => void;
  onDelete: () => void;
}

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15';

const ProjectEditor: React.FC<ProjectEditorProps> = ({ project, basePath, uploading, translating, duplicateTitle, onChange, onUpload, onTranslate, onDelete }) => {
  const [tagDraft, setTagDraft] = useState('');

  if (!project) {
    return <section className="flex min-h-96 items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center text-slate-500">Выберите проект слева или создайте новый.</section>;
  }

  const mediaUrl = `${basePath}content/${project.mediaFile}`;
  const posterUrl = `${basePath}content/posters/${project.mediaFile.replace(/\.[^.]+$/, '.jpg')}`;
  const isVideo = /\.(mp4|webm|ogg)$/i.test(project.mediaFile);
  const errors = getProjectValidationErrors(project);
  const addTag = () => {
    const values = tagDraft.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (values.length) onChange('tags', Array.from(new Set([...project.tags, ...values])));
    setTagDraft('');
  };

  return (
    <section id="admin-editor" className="min-w-0 scroll-mt-4 rounded-2xl border border-slate-700 bg-slate-800/80 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-400">Проект #{project.order}</p>
          <h2 className="mt-1 text-2xl font-black text-white">{project.title.ru || 'Новый проект'}</h2>
          {duplicateTitle && <p className="mt-1 text-sm font-semibold text-amber-300">Есть другой проект с таким же названием.</p>}
        </div>
        <button onClick={onDelete} className="rounded-lg border border-red-900/70 px-3 py-2 text-sm font-bold text-red-400 transition hover:bg-red-950/50">Удалить проект</button>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Название RU<input className={`${inputClass} mt-1.5`} value={project.title.ru} onChange={(event) => onChange('title.ru', event.target.value)} /></label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Title EN<input className={`${inputClass} mt-1.5`} value={project.title.en} onChange={(event) => onChange('title.en', event.target.value)} /></label>
          </div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Описание RU<textarea className={`${inputClass} mt-1.5 min-h-32 resize-y`} value={project.description.ru} onChange={(event) => onChange('description.ru', event.target.value)} /></label>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            <span className="flex items-center justify-between gap-3"><span>Description EN</span><button type="button" onClick={onTranslate} disabled={translating} className="rounded-md bg-teal-400/10 px-2 py-1 normal-case tracking-normal text-teal-300 hover:bg-teal-400/20 disabled:opacity-50">{translating ? 'Перевожу…' : 'Перевести с RU'}</button></span>
            <textarea className={`${inputClass} mt-1.5 min-h-32 resize-y`} value={project.description.en} onChange={(event) => onChange('description.en', event.target.value)} />
          </label>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Теги</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {project.tags.map((tag) => <button key={tag} onClick={() => onChange('tags', project.tags.filter((item) => item !== tag))} className="rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1 text-xs font-semibold text-purple-200 hover:border-red-400/40 hover:text-red-300" title="Удалить тег">{tag} ×</button>)}
            </div>
            <div className="mt-2 flex gap-2">
              <input className={inputClass} value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTag(); } }} placeholder="Новый тег — Enter или запятая" />
              <button type="button" onClick={addTag} className="rounded-lg border border-slate-600 px-4 font-bold text-slate-300 hover:bg-slate-700">Добавить</button>
            </div>
          </div>
        </div>

        <div>
          <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-black">
            {project.mediaFile ? (isVideo ? <video src={mediaUrl} poster={posterUrl} className="max-h-[420px] w-full object-contain" controls muted playsInline preload="metadata" /> : <img src={mediaUrl} alt={project.title.ru} className="max-h-[420px] w-full object-contain" />) : <span className="text-sm text-slate-600">Медиафайл не выбран</span>}
          </div>
          <label className="mt-3 flex cursor-pointer items-center justify-center rounded-lg bg-teal-600 px-4 py-3 font-bold text-white transition hover:bg-teal-500">
            {uploading ? 'Загрузка…' : 'Загрузить или заменить медиа'}
            <input type="file" className="hidden" accept=".mp4,.webm,.ogg,.png,.jpg,.jpeg,.webp,video/mp4,video/webm,video/ogg,image/png,image/jpeg,image/webp" onChange={onUpload} disabled={uploading} />
          </label>
          <p className="mt-2 text-xs text-slate-500">MP4, WebM, OGG, PNG, JPG или WebP · до 100 МБ</p>
          <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-400">Имя файла<input className={`${inputClass} mt-1.5 font-mono text-xs text-teal-300`} value={project.mediaFile} onChange={(event) => onChange('mediaFile', event.target.value)} /></label>
          {errors.length > 0 && <div className="mt-4 rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-sm text-amber-200"><strong>Нужно заполнить:</strong> {errors.join(', ')}</div>}
        </div>
      </div>
    </section>
  );
};

export default ProjectEditor;
