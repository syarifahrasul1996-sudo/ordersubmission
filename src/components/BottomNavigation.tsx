import React, { useState } from 'react';
import { 
  Home, 
  History, 
  Users, 
  BarChart3, 
  MoreHorizontal,
  Plus,
  FileText,
  Mail,
  X 
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';

export function BottomNavigation() {
  const { 
    viewStack, 
    changeTab,
    pushView,
    startNewOrder,
    appLanguage,
    drafts
  } = useAppContext();
  
  const [showAddMenu, setShowAddMenu] = useState(false);
  
  // Get the active tab (the top-most view in the viewStack)
  const currentView = viewStack[viewStack.length - 1];

  // Only show the bottom navigation bar on the top-level tab views
  const tabViews = ['home', 'history', 'customer-info', 'dashboard', 'others'];
  if (!tabViews.includes(currentView)) return null;

  return (
    <>
      <div className="w-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-gray-100 dark:border-zinc-850 px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] flex items-center justify-between shrink-0 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        {/* TAB 1: HOME */}
        <button
          onClick={() => changeTab('home')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 cursor-pointer",
            currentView === 'home' ? "text-primary font-black" : "text-subtext/70 dark:text-zinc-500 font-medium"
          )}
          id="btn-nav-home"
        >
          <Home className={cn("w-5 h-5", currentView === 'home' ? "stroke-[2.5]" : "stroke-[2]")} />
          <span className="text-[9px] uppercase tracking-wider mt-1">
            {appLanguage === 'ms' ? 'Laman' : 'Home'}
          </span>
        </button>

        {/* TAB 2: ORDER */}
        <button
          onClick={() => changeTab('history')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 cursor-pointer",
            currentView === 'history' ? "text-primary font-black" : "text-subtext/70 dark:text-zinc-500 font-medium"
          )}
          id="btn-nav-orders"
        >
          <div className="relative">
            <History className={cn("w-5 h-5", currentView === 'history' ? "stroke-[2.5]" : "stroke-[2]")} />
          </div>
          <span className="text-[9px] uppercase tracking-wider mt-1">
            {appLanguage === 'ms' ? 'Tempahan' : 'Orders'}
          </span>
        </button>

        {/* TAB 3: PLUS (+) BUTTON FOR ADD ORDER */}
        <div className="flex-1 flex justify-center -mt-3">
          <button
            onClick={() => setShowAddMenu(true)}
            className="w-13 h-13 bg-primary text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform cursor-pointer border-4 border-white dark:border-zinc-900 hover:bg-primary/95"
            id="btn-nav-add"
            aria-label="Add Order"
            title="Add Order"
          >
            <Plus className="w-6.5 h-6.5 stroke-[3]" />
          </button>
        </div>

        {/* TAB 4: BUSINESS ANALYTICS */}
        <button
          onClick={() => changeTab('dashboard')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 cursor-pointer",
            currentView === 'dashboard' ? "text-primary font-black" : "text-subtext/70 dark:text-zinc-500 font-medium"
          )}
          id="btn-nav-analytics"
        >
          <BarChart3 className={cn("w-5 h-5", currentView === 'dashboard' ? "stroke-[2.5]" : "stroke-[2]")} />
          <span className="text-[9px] uppercase tracking-wider mt-1">
            {appLanguage === 'ms' ? 'Analisis' : 'Analytics'}
          </span>
        </button>

        {/* TAB 5: OTHERS */}
        <button
          onClick={() => changeTab('others')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 cursor-pointer",
            currentView === 'others' ? "text-primary font-black" : "text-subtext/70 dark:text-zinc-500 font-medium"
          )}
          id="btn-nav-others"
        >
          <MoreHorizontal className={cn("w-5 h-5", currentView === 'others' ? "stroke-[2.5]" : "stroke-[2]")} />
          <span className="text-[9px] uppercase tracking-wider mt-1">
            {appLanguage === 'ms' ? 'Lain-lain' : 'Others'}
          </span>
        </button>
      </div>

      {/* Slide-up bottom sheet menu for Adding Order */}
      {showAddMenu && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end justify-center z-50 animate-fade-in" onClick={() => setShowAddMenu(false)}>
          <div 
            className="w-full max-w-[500px] bg-white dark:bg-[#1C1C1E] rounded-t-[32px] p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] space-y-4 animate-slide-up shadow-2xl border-t border-gray-100 dark:border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-3">
              <div className="space-y-0.5">
                <h3 className="font-black text-base text-text">
                  {appLanguage === 'ms' ? 'Tambah Tempahan Baru' : 'Add New Order'}
                </h3>
                <p className="text-xs text-subtext font-semibold">
                  {appLanguage === 'ms' ? 'Pilih jenis perkhidmatan di bawah:' : 'Select a service category below:'}
                </p>
              </div>
              <button 
                onClick={() => setShowAddMenu(false)}
                className="w-8 h-8 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-text active:scale-90 transition-transform cursor-pointer"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Service Buttons */}
            <div className="grid grid-cols-1 gap-2 pt-1">
              {/* Option 1: Resume */}
              <button
                onClick={() => {
                  setShowAddMenu(false);
                  startNewOrder('resume-type', { mainType: 'Resume' });
                }}
                className="flex items-center gap-3.5 p-2.5 bg-gray-50/50 hover:bg-gray-50 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/70 border border-gray-100 dark:border-zinc-800/80 rounded-2xl text-left transition-all active:scale-[0.98] cursor-pointer group"
              >
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-text">Resume</h4>
                </div>
              </button>

              {/* Option 2: Surat */}
              <button
                onClick={() => {
                  setShowAddMenu(false);
                  startNewOrder('general-form', { mainType: 'Surat' });
                }}
                className="flex items-center gap-3.5 p-2.5 bg-gray-50/50 hover:bg-gray-50 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/70 border border-gray-100 dark:border-zinc-800/80 rounded-2xl text-left transition-all active:scale-[0.98] cursor-pointer group"
              >
                <div className="w-10 h-10 bg-purple-500/10 text-purple-500 rounded-xl flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-text">
                    {appLanguage === 'ms' ? 'Surat' : 'Letters'}
                  </h4>
                </div>
              </button>

              {/* Option 3: Lain-lain */}
              <button
                onClick={() => {
                  setShowAddMenu(false);
                  startNewOrder('general-form', { mainType: 'Lain-lain' });
                }}
                className="flex items-center gap-3.5 p-2.5 bg-gray-50/50 hover:bg-gray-50 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/70 border border-gray-100 dark:border-zinc-800/80 rounded-2xl text-left transition-all active:scale-[0.98] cursor-pointer group"
              >
                <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                  <MoreHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-text">
                    {appLanguage === 'ms' ? 'Lain-lain' : 'Others'}
                  </h4>
                </div>
              </button>

              {/* Option 4: Maklumat Pelanggan */}
              <button
                onClick={() => {
                  setShowAddMenu(false);
                  pushView('customer-info');
                }}
                className="flex items-center gap-3.5 p-2.5 bg-gray-50/50 hover:bg-gray-50 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/70 border border-gray-100 dark:border-zinc-800/80 rounded-2xl text-left transition-all active:scale-[0.98] cursor-pointer group"
              >
                <div className="w-10 h-10 bg-teal-500/10 text-teal-500 rounded-xl flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-text">
                    {appLanguage === 'ms' ? 'Maklumat Pelanggan' : 'Customer Info'}
                  </h4>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
