import React from 'react';
import { Home, History, BarChart3, Settings, Plus } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';

export function DesktopSidebar() {
  const { 
    viewStack, 
    changeTab,
    appLanguage,
    pushView
  } = useAppContext();
  
  const currentView = viewStack[viewStack.length - 1];
  
  const navItems = [
    { id: 'home', icon: Home, label: appLanguage === 'ms' ? 'Laman Utama' : 'Home' },
    { id: 'history', icon: History, label: appLanguage === 'ms' ? 'Sejarah Tempahan' : 'Order History' },
    { id: 'dashboard', icon: BarChart3, label: appLanguage === 'ms' ? 'Analisis' : 'Analytics' },
    { id: 'others', icon: Settings, label: appLanguage === 'ms' ? 'Tetapan' : 'Settings' },
  ] as const;

  return (
    <div className="h-full w-full flex flex-col py-6">
      <div className="px-6 mb-8">
        <h1 className="text-xl font-black text-text tracking-tight">Order Manager</h1>
        <p className="text-subtext text-xs mt-1 font-medium">
          {appLanguage === 'ms' ? 'Pengurusan Tempahan' : 'Order Management'}
        </p>
      </div>

      <div className="px-4 space-y-1.5 flex-1">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => changeTab(item.id as any)}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3.5 rounded-xl transition-all cursor-pointer text-left",
                isActive 
                  ? "bg-primary text-white shadow-md shadow-primary/20 font-bold" 
                  : "text-text hover:bg-gray-100 dark:hover:bg-zinc-800 font-semibold"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive ? "stroke-[2.5]" : "stroke-[2] text-subtext")} />
              <span className="text-sm">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="px-4 pt-6 border-t border-gray-100 dark:border-zinc-800 mt-auto">
        <button
          onClick={() => pushView('resume-type')}
          className="w-full bg-primary text-white py-3.5 rounded-xl font-bold flex items-center justify-center space-x-2 shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>{appLanguage === 'ms' ? 'Tempahan Baru' : 'New Order'}</span>
        </button>
      </div>
    </div>
  );
}
