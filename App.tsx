import React from 'react';
import Header from './components/Header';
import About from './components/About';
import Portfolio from './components/Portfolio';
import Contact from './components/Contact';
import LanguageSwitcher from './components/LanguageSwitcher';
import { initialProjects } from './data/initialProjects';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-gray-200">
      <LanguageSwitcher />
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8">
        <About />
        <Portfolio projects={initialProjects} />
      </main>
      <Contact />
    </div>
  );
};

export default App;