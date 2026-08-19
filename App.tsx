import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import About from './components/About';
import Portfolio from './components/Portfolio';
import Contact from './components/Contact';
import { LanguageProvider } from './context/LanguageContext';
import Showreel from './components/Showreel';
import AdminPanel from './components/AdminPanel'; // Импортируем админку
import type { Project } from './types';
import SiteNav from './components/SiteNav';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Состояние: находимся ли мы на странице админки
  const[isAdminRoute, setIsAdminRoute] = useState(window.location.hash === '#admin');

  // Слушаем изменения URL (хэша)
  useEffect(() => {
    const handleHashChange = () => {
      setIsAdminRoute(window.location.hash === '#admin');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  },[]);

  useEffect(() => {
    const fetchProjects = async () => {
      setLoading(true);
      try {
        const url = import.meta.env.DEV 
          ? 'http://localhost:4000/api/projects' 
          : '/Portfolio/data/projects.json';

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: Project[] = await response.json();
        const sortedData = data.sort((a, b) => a.order - b.order);
        setProjects(sortedData);
      } catch (error) {
        console.error("Не удалось загрузить проекты:", error);
      } finally {
        setLoading(false);
      }
    };

    // Грузим данные только если мы не в админке (админка грузит их сама)
    if (!isAdminRoute) {
      fetchProjects();
    } else {
      setLoading(false);
    }
  },[isAdminRoute]);

  // Если в URL написано #admin
  if (isAdminRoute) {
    // ЗАЩИТА: Админка работает ТОЛЬКО при локальной разработке (npm run dev)
    if (!import.meta.env.DEV) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-red-400 font-bold text-xl flex-col">
          <p>Админ-панель недоступна в интернете.</p>
          <button onClick={() => window.location.hash = ''} className="mt-4 px-4 py-2 bg-slate-700 text-white rounded">Вернуться на сайт</button>
        </div>
      );
    }
    // Если мы локально - рендерим админку
    return <AdminPanel />;
  }

  const showreelProject = projects.find(p => p.id === 3);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-bold text-xl">Loading Portfolio...</div>;
  }

  return (
    <LanguageProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-gray-200">
        <SiteNav />
        <Header />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8">
          <Portfolio projects={projects} />
          <Showreel project={showreelProject} />
          <About />
        </main>
        <Contact />
      </div>
    </LanguageProvider>
  );
};

export default App;
