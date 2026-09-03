import React, { useState } from 'react';
import { 
  Home, 
  History, 
  Users, 
  BarChart3, 
  Settings, 
  Plus,
  FileText,
  Mail,
  MoreHorizontal
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';
import { NewOrderModal } from './NewOrderModal';

export function DesktopSidebar() {
  const { 
    viewStack, 
    changeTab,
    pushView,
    appLanguage,
    startNewOrder
  } = useAppContext();
  
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const currentView = viewStack[viewStack.length - 1];
  
  const navItems = [
    { id: 'home', icon: Home, label: appLanguage === 'ms' ? 'Laman Utama' : 'Home' },
    { id: 'history', icon: History, label: appLanguage === 'ms' ? 'Tempahan' : 'Orders' },
    { id: 'customer-info', icon: Users, label: appLanguage === 'ms' ? 'Maklumat Pelanggan' : 'Customer Info' },
    { id: 'dashboard', icon: BarChart3, label: appLanguage === 'ms' ? 'Analisis' : 'Analytics' },
    { id: 'others', icon: Settings, label: appLanguage === 'ms' ? 'Tetapan & Sistem' : 'Settings' },
  ] as const;

  return (
    <div className="h-full w-full flex flex-col py-5">
      {/* Header Branding */}
      <div className="px-5 mb-6">
        <div className="flex items-center gap-3">
          <img 
            src="https://i.imgur.com/49kNDoe.png" 
            alt="Logo" 
            className="w-10 h-10 rounded-2xl object-contain shadow-xs border border-gray-100 dark:border-zinc-800" 
          />
          <div>
            <h1 className="text-base font-black text-text tracking-tight leading-none">
              Order Manager
            </h1>
            <p className="text-subtext text-[11px] mt-1 font-medium">
              {appLanguage === 'ms' ? 'Pengurusan Tempahan' : 'Order System'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Navigation Links */}
      <div className="px-3 space-y-1">
        <div className="px-3 pb-1 text-[10px] font-black uppercase tracking-wider text-subtext/70">
          {appLanguage === 'ms' ? 'Menu Utama' : 'Main Menu'}
        </div>
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'customer-info') {
                  pushView('customer-info');
                } else {
                  changeTab(item.id as any);
                }
              }}
              className={cn(
                "w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer text-left",
                isActive 
                  ? "bg-primary text-white shadow-md shadow-primary/20 font-bold" 
                  : "text-text hover:bg-gray-100 dark:hover:bg-zinc-800/70 font-semibold"
              )}
            >
              <Icon className={cn("w-4.5 h-4.5", isActive ? "stroke-[2.5]" : "stroke-[2] text-subtext")} />
              <span className="text-sm">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Quick Action / New Order Section */}
      <div className="px-3 mt-5 space-y-2">
        <div className="px-3 text-[10px] font-black uppercase tracking-wider text-subtext/70">
          {appLanguage === 'ms' ? 'Cipta Tempahan' : 'Quick Create'}
        </div>
        <div className="grid grid-cols-1 gap-1">
          <button
            onClick={() => startNewOrder('resume-type', { mainType: 'Resume' })}
            className="w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold text-text hover:bg-primary/5 hover:text-primary dark:hover:bg-zinc-800/60 transition-colors cursor-pointer group"
          >
            <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <FileText className="w-3.5 h-3.5" />
            </div>
            <span>{appLanguage === 'ms' ? 'Resume Baru' : 'New Resume'}</span>
          </button>
          <button
            onClick={() => startNewOrder('general-form', { mainType: 'Surat' })}
            className="w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold text-text hover:bg-purple-500/5 hover:text-purple-600 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer group"
          >
            <div className="w-6 h-6 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Mail className="w-3.5 h-3.5" />
            </div>
            <span>{appLanguage === 'ms' ? 'Surat Rasmi / Rayuan' : 'New Letter'}</span>
          </button>
          <button
            onClick={() => startNewOrder('general-form', { mainType: 'Lain-lain' })}
            className="w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold text-text hover:bg-amber-500/5 hover:text-amber-600 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer group"
          >
            <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </div>
            <span>{appLanguage === 'ms' ? 'Servis Lain-lain' : 'Other Service'}</span>
          </button>
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="px-3 pt-4 border-t border-gray-100 dark:border-zinc-800 mt-auto">
        <button
          onClick={() => setShowNewOrderModal(true)}
          className="w-full bg-primary text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center space-x-2 shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>{appLanguage === 'ms' ? 'Tempahan Baru' : 'New Order'}</span>
        </button>
      </div>

      {/* New Order Options Modal */}
      <NewOrderModal 
        isOpen={showNewOrderModal} 
        onClose={() => setShowNewOrderModal(false)} 
      />
    </div>
  );
}
