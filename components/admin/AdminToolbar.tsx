import React from 'react';

interface AdminToolbarProps {
  projectCount: number;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  undoing: boolean;
  ahead: number;
  message: string;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
  onUndo: () => void;
}

const AdminToolbar: React.FC<AdminToolbarProps> = ({
  projectCount,
  dirty,
  saving,
  publishing,
  undoing,
  ahead,
  message,
  onBack,
  onSave,
  onPublish,
  onUndo,
}) => (
  <header className="sticky top-3 z-50 rounded-2xl border border-slate-700/80 bg-slate-800/95 p-4 shadow-2xl backdrop-blur-xl sm:p-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black text-white sm:text-3xl">Управление портфолио</h1>
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-400">{projectCount} проектов</span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${dirty ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300'}`}>
            {dirty ? 'Есть несохранённые изменения' : 'Сохранено локально'}
          </span>
        </div>
        <p className="mt-2 min-h-5 text-sm font-medium text-teal-300" role="status">{message}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={onBack} className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2.5 font-semibold text-white transition hover:bg-slate-600">На сайт</button>
        <button onClick={onSave} disabled={!dirty || saving || publishing} className="rounded-lg bg-teal-600 px-4 py-2.5 font-bold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40">
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button onClick={onPublish} disabled={saving || publishing} className="rounded-lg bg-purple-600 px-4 py-2.5 font-bold text-white shadow-lg shadow-purple-950/40 transition hover:bg-purple-500 disabled:opacity-40">
          {publishing ? 'Публикую…' : 'Опубликовать'}
        </button>
        {ahead > 0 && (
          <button onClick={onUndo} disabled={undoing || publishing} className="rounded-lg border border-amber-700 bg-amber-950/50 px-3 py-2.5 text-sm font-bold text-amber-300 transition hover:bg-amber-900/60 disabled:opacity-40">
            {undoing ? 'Отменяю…' : `Отменить коммиты (${ahead})`}
          </button>
        )}
      </div>
    </div>
  </header>
);

export default AdminToolbar;
