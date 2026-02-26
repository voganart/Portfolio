import React, { useState, useEffect } from 'react';
import type { Project } from '../types';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- КОМПОНЕНТ КАРТОЧКИ ---
const SortableProjectCard = ({ 
  project, 
  index, 
  isGridView, 
  basePath, 
  handleChange, 
  deleteProject, 
  handleFileUpload,
  uploadingId,
  handleAutoTranslate // <-- Новая функция прокинута сюда
}: any) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  const mediaUrl = `${basePath}content/${project.mediaFile}`;
  const isVideo = /\.(mp4|webm|ogg)$/i.test(project.mediaFile);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-slate-800 rounded-xl border overflow-hidden flex flex-col transition-shadow ${
        isDragging ? 'border-teal-500 shadow-2xl shadow-teal-900/30' : 'border-slate-700 shadow-lg'
      } ${isGridView ? 'w-full md:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]' : 'w-full'}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="bg-slate-900 p-2 border-b border-slate-700 text-center text-slate-500 hover:text-white cursor-grab active:cursor-grabbing flex justify-center items-center gap-2 touch-none"
        title="Потяните, чтобы изменить порядок"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        <span className="text-xs uppercase font-bold tracking-widest">№ {index + 1}</span>
      </div>

      <div className="h-48 w-full bg-black relative group flex items-center justify-center border-b border-slate-700">
        {project.mediaFile ? (
          isVideo ? (
            <video src={`${mediaUrl}#t=0.1`} className="max-w-full max-h-full object-contain" muted playsInline />
          ) : (
            <img src={mediaUrl} className="max-w-full max-h-full object-contain" alt="preview" />
          )
        ) : (
          <span className="text-slate-600 font-medium">Нет медиафайла</span>
        )}
        
        <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity backdrop-blur-sm">
          <label className="cursor-pointer bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg transition-transform hover:scale-105">
            {uploadingId === project.id ? '⏳ Загрузка...' : '📁 Загрузить файл'}
            <input 
              type="file" 
              className="hidden" 
              accept="video/*,image/*" 
              onChange={(e) => handleFileUpload(index, e)} 
              disabled={uploadingId === project.id} 
            />
          </label>
          <span className="text-xs text-gray-400 mt-2 text-center px-4">
            Выберите .mp4, .webm или .png
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1 bg-slate-800">
        {/* Заголовки */}
        <div className="grid grid-cols-2 gap-2">
           <input type="text" value={project.title.ru} onChange={e => handleChange(index, 'title.ru', e.target.value)} placeholder="Название (RU)" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-medium focus:border-teal-500 outline-none text-sm" />
           <input type="text" value={project.title.en} onChange={e => handleChange(index, 'title.en', e.target.value)} placeholder="Title (EN)" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-medium focus:border-teal-500 outline-none text-sm" />
        </div>
        
        <input type="text" value={project.mediaFile} onChange={e => handleChange(index, 'mediaFile', e.target.value)} placeholder="Имя файла" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-teal-400 font-mono text-xs focus:border-teal-500 outline-none" />
        
        <input 
          type="text" 
          value={project.tags.join(',')} 
          onChange={e => handleChange(index, 'tags', e.target.value)} 
          placeholder="Теги (Spine,Unity,VFX)" 
          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-purple-300 text-sm focus:border-purple-500 outline-none" 
        />
        
        {/* Описание RU */}
        <textarea value={project.description.ru} onChange={e => handleChange(index, 'description.ru', e.target.value)} placeholder="Описание (RU)" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-gray-300 text-sm h-20 resize-none focus:border-teal-500 outline-none" />
        
        {/* Кнопка перевода и Описание EN */}
        <div className="relative">
          <div className="flex justify-between items-center mb-1">
             <span className="text-xs text-gray-500">English Description</span>
             <button 
               onClick={() => handleAutoTranslate(index)} 
               className="text-xs text-teal-400 hover:text-teal-300 border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 rounded transition hover:scale-105"
               title="Автоматически перевести русское описание"
             >
               ✨ Перевести с RU
             </button>
          </div>
          <textarea 
            value={project.description.en} 
            onChange={e => handleChange(index, 'description.en', e.target.value)} 
            placeholder="Description (EN)" 
            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-gray-300 text-sm h-20 resize-none focus:border-teal-500 outline-none" 
          />
        </div>
        
        <div className="mt-auto pt-2 flex justify-end">
          <button onClick={() => deleteProject(index)} className="text-xs text-red-500 hover:text-red-400 font-bold px-3 py-1 rounded border border-red-900/50 hover:bg-red-900/20 transition">
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
};

// --- ГЛАВНЫЙ КОМПОНЕНТ ---
const AdminPanel: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');
  const [isGridView, setIsGridView] = useState(true);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  const basePath = import.meta.env.BASE_URL || '/';

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const updatedProjects = projects.map((p, index) => ({ 
        ...p, 
        order: index + 1,
        tags: p.tags.map(t => t.trim()).filter(t => t !== '')
      }));
      
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
      setMessage('❌ Ошибка соединения.');
    }
    setSaving(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const handlePublish = async () => {
    if (!window.confirm('Опубликовать изменения на GitHub Pages?')) return;
    setPublishing(true);
    setMessage('⏳ Публикация... Это займет около 30 секунд.');
    try {
      const res = await fetch('http://localhost:4000/api/publish', { method: 'POST' });
      if (res.ok) {
        setMessage('🚀 Опубликовано! Сайт обновится через пару минут.');
      } else {
        setMessage('❌ Ошибка при публикации.');
      }
    } catch (err) {
      setMessage('❌ Ошибка соединения.');
    }
    setPublishing(false);
  };

  const handleChange = (index: number, field: string, value: string) => {
    const newProjects = [...projects];
    if (field.includes('.')) {
      const [obj, lang] = field.split('.');
      // @ts-ignore
      newProjects[index][obj][lang] = value;
    } else if (field === 'tags') {
      newProjects[index].tags = value.split(',');
    } else {
      // @ts-ignore
      newProjects[index][field] = value;
    }
    setProjects(newProjects);
  };

  // --- ЛОГИКА АВТОПЕРЕВОДА ---
  const handleAutoTranslate = async (index: number) => {
    const textToTranslate = projects[index].description.ru;
    if (!textToTranslate) {
      alert("Сначала заполните русское описание!");
      return;
    }

    // Временная индикация
    const newProjects = [...projects];
    newProjects[index].description.en = "Translating...";
    setProjects(newProjects);

    try {
      // Используем бесплатный API (MyMemory)
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=ru|en`
      );
      const data = await response.json();
      
      if (data.responseData && data.responseData.translatedText) {
        const translated = data.responseData.translatedText;
        // Обновляем стейт с переводом
        const updatedProjects = [...projects];
        updatedProjects[index].description.en = translated;
        setProjects(updatedProjects);
      } else {
        alert("Не удалось перевести. Попробуйте вручную.");
      }
    } catch (error) {
      console.error("Ошибка перевода:", error);
      alert("Ошибка сервиса перевода.");
      // Возвращаем как было
      const fallbackProjects = [...projects];
      fallbackProjects[index].description.en = "";
      setProjects(fallbackProjects);
    }
  };

  const addProject = () => {
    const newId = projects.length > 0 ? Math.max(...projects.map(p => p.id)) + 1 : 1;
    const newProject: Project = {
      id: newId,
      order: projects.length + 1,
      title: { ru: 'Новый проект', en: 'New Project' },
      description: { ru: '', en: '' },
      mediaFile: '',
      tags: []
    };
    setProjects([newProject, ...projects]);
  };

  const deleteProject = (index: number) => {
    if (window.confirm('Точно удалить этот проект?')) {
      const newProjects = [...projects];
      newProjects.splice(index, 1);
      setProjects(newProjects);
    }
  };

  const handleFileUpload = async (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingId(projects[index].id);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:4000/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        const data = await res.json();
        handleChange(index, 'mediaFile', data.filename);
        setMessage(`✅ Файл ${data.filename} загружен!`);
      } else {
        setMessage('❌ Ошибка загрузки файла.');
      }
    } catch (err) {
      setMessage('❌ Ошибка соединения.');
    }
    setUploadingId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setProjects((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over?.id);
        
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        return newItems.map((item, idx) => ({ ...item, order: idx + 1 }));
      });
    }
  };

  if (loading) return <div className="p-10 text-white font-bold text-xl">Загрузка админки...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-gray-200 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-slate-800 p-6 rounded-xl border border-slate-700 sticky top-4 z-50 shadow-2xl gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Панель управления</h1>
            <p className="text-sm text-teal-400 mt-1 font-semibold min-h-[20px]">
              {message}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={() => setIsGridView(!isGridView)} 
              className="px-4 py-2 bg-slate-900 border border-slate-600 hover:bg-slate-700 rounded transition flex items-center gap-2"
            >
              {isGridView ? '🔲 Сетка' : '📄 Список'}
            </button>
            <button onClick={() => window.location.hash = ''} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded font-medium transition">
              На сайт
            </button>
            <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded font-bold transition disabled:opacity-50 shadow-lg shadow-teal-900/50">
              {saving ? 'Сохранение...' : '💾 Сохранить'}
            </button>
            <button onClick={handlePublish} disabled={publishing} className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold transition disabled:opacity-50 shadow-lg shadow-purple-900/50">
              {publishing ? 'Публикация...' : '🚀 Опубликовать'}
            </button>
          </div>
        </div>

        <button onClick={addProject} className="mb-8 w-full py-4 bg-slate-800/50 border-2 border-dashed border-slate-600 hover:border-teal-500 hover:text-teal-400 rounded-xl text-slate-400 font-bold transition text-lg">
          + Создать новый проект
        </button>

        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCenter} 
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={projects.map(p => p.id)} 
            strategy={isGridView ? rectSortingStrategy : verticalListSortingStrategy}
          >
            <div className={isGridView ? "flex flex-wrap gap-6" : "flex flex-col gap-6"}>
              {projects.map((proj, idx) => (
                <SortableProjectCard
                  key={proj.id}
                  project={proj}
                  index={idx}
                  isGridView={isGridView}
                  basePath={basePath}
                  handleChange={handleChange}
                  deleteProject={deleteProject}
                  handleFileUpload={handleFileUpload}
                  uploadingId={uploadingId}
                  handleAutoTranslate={handleAutoTranslate} // Передаем функцию
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

export default AdminPanel;