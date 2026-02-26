import React from 'react';
import Header from './components/Header';
import About from './components/About';
import Portfolio from './components/Portfolio';
import Contact from './components/Contact';
import LanguageSwitcher from './components/LanguageSwitcher';
import { initialProjects } from './data/initialProjects';
import { LanguageProvider } from './context/LanguageContext';
import Showreel from './components/Showreel'; // 1. Импортируем новый компонент
const App: React.FC = () => {
// 2. Находим шоурил по его ID (например, ID=3 для шоурила 2021 года)
const showreelProject = initialProjects.find(p => p.id === 3);
return (
<LanguageProvider>
<div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-gray-200">
<LanguageSwitcher />
<Header />
{/* 3. Добавляем секцию с шоурилом */}
<Showreel project={showreelProject} />
<main className="container mx-auto px-4 sm:px-6 lg:px-8">
<About />
<Portfolio projects={initialProjects} />
</main>
<Contact />
</div>
</LanguageProvider>
);
};
export default App;