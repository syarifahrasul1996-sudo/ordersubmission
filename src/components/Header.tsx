import React, { useState } from 'react';
import { ChevronLeft, Clock, History, Home, Plus } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { SettingsDropdown } from './SettingsDropdown';
import { NotificationsDropdown } from './NotificationsDropdown';
import { NewOrderModal } from './NewOrderModal';

export function Header() {
  const { viewStack, popView, goHome, state, theme, toggleTheme, appLanguage, toggleLanguage } = useAppContext();
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const currentView = viewStack[viewStack.length - 1];

  const titles: Record<string, { ms: string, en: string }> = {
    'home': { ms: 'Penghantaran Pesanan', en: 'Order Submission' },
    'resume-type': { ms: 'Jenis Resume', en: 'Resume Type' },
    'resume-form-fields': { ms: 'Butiran Resume', en: 'Resume Details' },
    'general-form': { ms: 'Butiran Dokumen', en: 'Document Details' },
    'confirmation': { ms: 'Sahkan Maklumat', en: 'Confirm Details' },
    'output': { ms: 'Order Selesai', en: 'Order Complete' },
    'history': { ms: 'Sejarah Tempahan', en: 'Order History' },
    'dashboard': { ms: 'Tinjauan Perniagaan', en: 'Business Overview' },
    'customer-info': { ms: 'Maklumat Pelanggan', en: 'Customer Info' },
    'contacts-sync': { ms: 'Eksport Kenalan (CSV)', en: 'Export Contacts (CSV)' },
    'others': { ms: 'Tetapan & Sistem', en: 'Settings & System' }
  };

  const title = titles[currentView]?.[appLanguage] || (appLanguage === 'ms' ? 'Butiran' : 'Details');
  const isPrimaryTab = ['home', 'history', 'dashboard', 'others'].includes(currentView);
  const showBack = !isPrimaryTab;
  const showCounter = state.extraHours > 0 && !['confirmation', 'output'].includes(currentView);

  return (
    <>
      <header className="sticky top-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-gray-100 dark:border-zinc-800 px-4 sm:px-5 h-[calc(3.5rem+env(safe-area-inset-top))] sm:h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex items-center justify-between shrink-0 z-40">
        <div className="flex items-center">
          {showBack ? (
            <button 
              onClick={popView}
              aria-label="Kembali" 
              className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface text-primary mr-1 active:scale-95 transition-all md:hover:bg-surface cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          ) : (
            <img src="https://i.imgur.com/49kNDoe.png" alt="Logo" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full mr-3 object-contain shadow-sm border border-gray-100 dark:border-zinc-800" />
          )}
          <h1 className="text-lg sm:text-xl font-black text-text tracking-tight truncate">{title}</h1>
        </div>

        {showCounter && (
          <div aria-live="polite" className="bg-primary text-white px-3.5 py-1.5 rounded-full text-xs font-black shadow-lg flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1" />
            +{state.extraHours}h
          </div>
        )}

        <div className="flex items-center space-x-1.5 sm:space-x-2">
          {/* Quick desktop New Order button */}
          <button
            onClick={() => setShowNewOrderModal(true)}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-white text-xs font-bold shadow-sm shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{appLanguage === 'ms' ? 'Tempahan Baru' : 'New Order'}</span>
          </button>

          {!isPrimaryTab && (
            <button 
              onClick={goHome}
              className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface text-text active:scale-95 transition-all md:hover:bg-surface cursor-pointer"
              aria-label="Home"
              title="Home"
            >
              <Home className="w-5 h-5" />
            </button>
          )}

          <NotificationsDropdown />
          <SettingsDropdown />
        </div>
      </header>

      <NewOrderModal 
        isOpen={showNewOrderModal} 
        onClose={() => setShowNewOrderModal(false)} 
      />
    </>
  );
}
