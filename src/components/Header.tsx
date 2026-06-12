import React from 'react';
import { ChevronLeft, Clock, History, Moon, Sun, Home } from 'lucide-react';
import { useAppContext } from '../AppContext';

export function Header() {
  const { viewStack, popView, goHome, state, pushView, theme, toggleTheme, appLanguage, toggleLanguage } = useAppContext();
  const currentView = viewStack[viewStack.length - 1];

  const titles: Record<string, { ms: string, en: string }> = {
    'home': { ms: 'Order Submission', en: 'Order Submission' },
    'resume-type': { ms: 'Jenis Resume', en: 'Resume Type' },
    'resume-form-fields': { ms: 'Butiran Resume', en: 'Resume Details' },
    'general-form': { ms: 'Butiran Dokumen', en: 'Document Details' },
    'confirmation': { ms: 'Sahkan Maklumat', en: 'Confirm Details' },
    'output': { ms: 'Order Selesai', en: 'Order Complete' },
    'history': { ms: 'Sejarah Tempahan', en: 'Order History' }
  };

  const title = titles[currentView]?.[appLanguage] || (appLanguage === 'ms' ? 'Butiran' : 'Details');
  const showBack = currentView !== 'home';
  const showCounter = state.extraHours > 0 && !['confirmation', 'output'].includes(currentView);

  return (
    <header className="sticky top-0 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-4 sm:px-5 h-[calc(3.5rem+env(safe-area-inset-top))] sm:h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex items-center justify-between shrink-0 z-40">
      <div className="flex items-center">
        {showBack ? (
          <button 
            onClick={popView}
            aria-label="Kembali" 
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface text-primary mr-1 active:scale-95 transition-all md:hover:bg-surface"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        ) : (
          <img src="https://i.imgur.com/49kNDoe.png" alt="Logo" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full mr-3 object-contain shadow-sm border border-gray-100" />
        )}
        <h1 className="text-lg sm:text-xl font-black text-text tracking-tight truncate">{title}</h1>
      </div>
      {showCounter && (
        <div aria-live="polite" className="bg-primary text-white px-3.5 py-1.5 rounded-full text-[11px] font-black shadow-lg flex items-center">
          <Clock className="w-3.5 h-3.5 mr-1" />
          +{state.extraHours}h
        </div>
      )}
      {currentView === 'home' ? (
        <div className="flex items-center">
          <button 
            onClick={toggleLanguage}
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface text-text font-black text-sm active:scale-95 transition-all md:hover:bg-surface uppercase"
            aria-label="Toggle Language"
            title="Language"
          >
            {appLanguage}
          </button>
          <button 
            onClick={toggleTheme}
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface text-text active:scale-95 transition-all md:hover:bg-surface"
            aria-label="Toggle Theme"
            title="Theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => pushView('history')}
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface text-text active:scale-95 transition-all md:hover:bg-surface ml-1"
            aria-label="Sejarah Tempahan"
            title="Sejarah"
          >
            <History className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center">
          <button 
            onClick={goHome}
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface text-text active:scale-95 transition-all md:hover:bg-surface"
            aria-label="Home"
            title="Home"
          >
            <Home className="w-5 h-5" />
          </button>
        </div>
      )}
    </header>
  );
}
