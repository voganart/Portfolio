
import React, { useState, useEffect } from 'react';
import type { Project } from '../types';
import { useTranslations } from '../hooks/useTranslations';

interface AdminPanelProps {
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  onClose: () => void;
}

// FIX: Correct the structure for title and description to match the Project type, and use mediaFile instead of mediaUrl.
const emptyProject: Omit<Project, 'id'> = {
  title: { ru: '', en: '' },
  description: { ru: '', en: '' },
  mediaFile: '',
  tags: [],
};

const AdminPanel: React.FC<AdminPanelProps> = ({ projects, setProjects, onClose }) => {
  // FIX: Destructure `t` from the hook's return value.
  const { t } = useTranslations();
  const [isEditing, setIsEditing] = useState<Project | null>(null);
  const [currentProject, setCurrentProject] = useState(emptyProject);
  const [tagsInput, setTagsInput] = useState('');
  
  useEffect(() => {
    if (isEditing) {
      setCurrentProject(isEditing);
      setTagsInput(isEditing.tags.join(', '));
    } else {
      setCurrentProject(emptyProject);
      setTagsInput('');
    }
  }, [isEditing]);

  // FIX: Update input handler to work with nested language properties.
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'title.ru' || name === 'title.en') {
      const lang = name.split('.')[1] as 'ru' | 'en';
      setCurrentProject(p => ({ ...p, title: { ...p.title, [lang]: value } }));
    } else if (name === 'description.ru' || name === 'description.en') {
      const lang = name.split('.')[1] as 'ru' | 'en';
      setCurrentProject(p => ({ ...p, description: { ...p.description, [lang]: value } }));
    }
  };
  
  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTagsInput(e.target.value);
  }

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // FIX: Use mediaFile to store the media data URL, consistent with the Project type.
        setCurrentProject({ ...currentProject, mediaFile: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalProject = {
        ...currentProject,
        tags: tagsInput.split(',').map(tag => tag.trim()).filter(Boolean)
    };

    if (isEditing) {
      setProjects(projects.map(p => p.id === isEditing.id ? { ...finalProject, id: p.id } : p));
    } else {
      setProjects([...projects, { ...finalProject, id: Date.now() }]);
    }
    setIsEditing(null);
  };

  const handleDelete = (id: number) => {
    if (window.confirm(t.admin.deleteConfirm)) {
      setProjects(projects.filter(p => p.id !== id));
    }
  };
  
  const MediaPreview = ({ src }: { src: string }) => {
    if (!src) return null;
    if (src.startsWith('data:video')) {
      return <video src={src} className="mt-2 rounded-md max-h-32" controls />;
    }
    return <img src={src} alt="Preview" className="mt-2 rounded-md max-h-32"/>;
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">{t.admin.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </header>
        
        <main className="flex-grow p-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Form Section */}
            <div className="bg-gray-900/50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">{isEditing ? t.admin.edit : t.admin.add}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* FIX: Use separate inputs for each language to match the data structure. */}
                <div>
                  <label className="block text-sm font-medium text-gray-300">{t.admin.formTitle} (RU)</label>
                  <input type="text" name="title.ru" value={currentProject.title.ru} onChange={handleInputChange} className="w-full bg-gray-700 border-gray-600 rounded mt-1 p-2 focus:ring-teal-500 focus:border-teal-500" required/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300">{t.admin.formTitle} (EN)</label>
                  <input type="text" name="title.en" value={currentProject.title.en} onChange={handleInputChange} className="w-full bg-gray-700 border-gray-600 rounded mt-1 p-2 focus:ring-teal-500 focus:border-teal-500" required/>
                </div>
                 <div>
                  <label className="block text-sm font-medium text-gray-300">{t.admin.formDescription} (RU)</label>
                  <textarea name="description.ru" value={currentProject.description.ru} onChange={handleInputChange} className="w-full bg-gray-700 border-gray-600 rounded mt-1 p-2 h-24 focus:ring-teal-500 focus:border-teal-500" required/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300">{t.admin.formDescription} (EN)</label>
                  <textarea name="description.en" value={currentProject.description.en} onChange={handleInputChange} className="w-full bg-gray-700 border-gray-600 rounded mt-1 p-2 h-24 focus:ring-teal-500 focus:border-teal-500" required/>
                </div>
                 <div>
                  <label className="block text-sm font-medium text-gray-300">{t.admin.formTags}</label>
                  <input type="text" name="tags" value={tagsInput} onChange={handleTagsChange} className="w-full bg-gray-700 border-gray-600 rounded mt-1 p-2 focus:ring-teal-500 focus:border-teal-500"/>
                </div>
                 <div>
                  <label className="block text-sm font-medium text-gray-300">{t.admin.formMedia}</label>
                  <input type="file" onChange={handleMediaChange} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-teal-600 file:text-white hover:file:bg-teal-700" accept="image/*,video/*"/>
                  {/* FIX: Use mediaFile for the preview source. */}
                  <MediaPreview src={currentProject.mediaFile} />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded">{t.admin.formSave}</button>
                  {isEditing && <button type="button" onClick={() => setIsEditing(null)} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">{t.admin.formCancel}</button>}
                </div>
              </form>
            </div>
            
            {/* List Section */}
            <div className="max-h-[70vh] overflow-y-auto">
              <h3 className="font-semibold mb-4">{t.admin.projects}</h3>
              <div className="space-y-2">
                {projects.length > 0 ? projects.map(p => (
                   <div key={p.id} className="bg-gray-700/50 p-2 rounded flex items-center justify-between">
                     {/* FIX: Display a string from the title object, not the object itself. */}
                     <span className="text-sm truncate">{p.title.ru || p.title.en}</span>
                     <div className="flex gap-2">
                       <button onClick={() => setIsEditing(p)} className="text-teal-400 hover:text-teal-300 text-xs">Edit</button>
                       <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                     </div>
                   </div>
                )) : <p className="text-gray-500 text-sm">{t.admin.noProjects}</p>}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminPanel;
