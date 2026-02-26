import React, { useState, useEffect } from 'react';
import type { Project } from '../types';

const AdminPanel: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');

  // Загружаем данные с локального сервера
  useEffect(() => {
    fetch('http://localhost:4000/api/projects')
      .then(res => res.json())
      .then(data => {
        setProjects(data.sort((a: Project, b: Project) => a.order - b.order));
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setMessage('Ошибка загрузки данных. Сервер запущен?');
        setLoading(false);
      });
  },[]);

  // Сохранение изменений в файл (через локальный API)
  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      // Обновляем поле order перед сохранением
      const updatedProjects = projects.map((p, index) => ({ ...p, order: index + 1 }));
      
      const res = await fetch('http://localhost:4000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProjects),
      });
      
      if (res.ok) {
        setProjects(updatedProjects);
        setMessage('✅ Сохранено успешно!');
      } else {
        setMessage('❌ Ошибка при сохранении.');
      }
    } catch (err) {
      setMessage('❌ Ошибка соединения с сервером.');
    }
    setSaving(false);
    setTimeout(() => setMessage(''), 3000);
  };

  // Публикация на GitHub
  const handlePublish = async () => {
    if (!window.confirm('Опубликовать изменения на GitHub Pages?')) return;
    setPublishing(true);
    setMessage('⏳ Публикация... Это может занять несколько секунд.');
    try {
      const res = await fetch('http://localhost:4000/api/publish', { method: 'POST' });
      if (res.ok) {
        setMessage('🚀 Опубликовано! Сайт обновится через пару минут.');
      } else {
        setMessage('❌ Ошибка при публикации.');
      }
    } catch (err) {
      setMessage('❌ Ошибка соединения с сервером.');
    }
    setPublishing(false);
  };

  // Изменение данных проекта
  const handleChange = (index: number, field: string, value: string) => {
    const newProjects = [...projects];
    if (field.includes('.')) {
      const [obj, lang] = field.split('.');
      // @ts-ignore
      newProjects[index][obj][lang] = value;
    } else if (field === 'tags') {
      newProjects[index].tags = value.split(',').map(t => t.trim()).filter(t => t !== '');
    } else {
      // @ts-ignore
      newProjects[index][field] = value;
    }
    setProjects(newProjects);
  };

  // Перемещение проекта вверх/вниз
  const moveProject = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === projects.length - 1) return;
    
    const newProjects = [...projects];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    const temp = newProjects[index];
    newProjects[index] = newProjects[targetIndex];
    newProjects[targetIndex] = temp;
    
    setProjects(newProjects);
  };

  // Добавление нового проекта
  const addProject = () => {
    const newId = projects.length > 0 ? Math.max(...projects.map(p => p.id)) + 1 : 1;
    const newProject: Project = {
      id: newId,
      order: projects.length + 1,
      title: { ru: 'Новый проект', en: 'New Project' },
      description: { ru: 'Описание', en: 'Description' },
      mediaFile: 'example.mp4',
      tags: ['New']
    };
    setProjects([...projects, newProject]);
  };

  // Удаление проекта
  const deleteProject = (index: number) => {
    if (window.confirm('Точно удалить этот проект?')) {
      const newProjects = [...projects];
      newProjects.splice(index, 1);
      setProjects(newProjects);
    }
  };

  if (loading) return <div className="p-10 text-white">Загрузка админки...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-gray-200 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8 bg-slate-800 p-6 rounded-xl border border-slate-700 sticky top-4 z-50 shadow-2xl">
          <div>
            <h1 className="text-3xl font-bold text-white">Панель управления</h1>
            <p className="text-sm text-gray-400 mt-1">
              {message || 'Измените данные и нажмите "Сохранить"'}
            </p>
          </div>
          <div className="flex gap-4">
            <button onClick={() => window.location.hash = ''} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded font-medium transition">
              Вернуться на сайт
            </button>
            <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded font-bold transition disabled:opacity-50">
              {saving ? 'Сохранение...' : '💾 Сохранить (Локально)'}
            </button>
            <button onClick={handlePublish} disabled={publishing} className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold transition disabled:opacity-50">
              {publishing ? 'Публикация...' : '🚀 Опубликовать (GitHub)'}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {projects.map((proj, idx) => (
            <div key={proj.id} className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex gap-6">
              
              {/* Кнопки управления порядком */}
              <div className="flex flex-col gap-2 justify-center">
                <button onClick={() => moveProject(idx, 'up')} disabled={idx === 0} className="p-2 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30">⬆️</button>
                <span className="text-center font-bold text-slate-500">{idx + 1}</span>
                <button onClick={() => moveProject(idx, 'down')} disabled={idx === projects.length - 1} className="p-2 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30">⬇️</button>
              </div>

              {/* Форма редактирования */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Название (RU)</label>
                  <input type="text" value={proj.title.ru} onChange={e => handleChange(idx, 'title.ru', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Название (EN)</label>
                  <input type="text" value={proj.title.en} onChange={e => handleChange(idx, 'title.en', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Имя файла (из папки public/content/)</label>
                  <input type="text" value={proj.mediaFile} onChange={e => handleChange(idx, 'mediaFile', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-teal-400 font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Описание (RU)</label>
                  <textarea value={proj.description.ru} onChange={e => handleChange(idx, 'description.ru', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white h-24" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Описание (EN)</label>
                  <textarea value={proj.description.en} onChange={e => handleChange(idx, 'description.en', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white h-24" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Теги (через запятую)</label>
                  <input type="text" value={proj.tags.join(', ')} onChange={e => handleChange(idx, 'tags', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-purple-300" />
                </div>
              </div>
              
              {/* Кнопка удаления */}
              <div className="flex items-center">
                <button onClick={() => deleteProject(idx)} className="p-3 bg-red-900/30 text-red-400 hover:bg-red-900/60 rounded-lg transition" title="Удалить проект">
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>

        <button onClick={addProject} className="mt-8 w-full py-4 border-2 border-dashed border-slate-600 hover:border-teal-500 hover:text-teal-400 rounded-xl text-slate-400 font-bold transition">
          + Добавить новый проект
        </button>
      </div>
    </div>
  );
};

export default AdminPanel;