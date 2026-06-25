import React, { useState, useRef, useEffect } from 'react';
import { Wifi, WifiOff, Cloud, RefreshCw, Settings, Sun, Moon, Languages, Check, History, FileDown } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';

export function SettingsDropdown() {
  const { 
    isOnline, 
    isSyncing, 
    queueSize, 
    lastSyncTime, 
    syncOfflineQueue, 
    appLanguage,
    toggleLanguage,
    theme,
    toggleTheme,
    viewStack,
    pushView
  } = useAppContext();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getRelativeTime = (time: number | null) => {
    if (!time) return appLanguage === 'ms' ? 'Tiada Aktiviti' : 'Never';
    const diff = Date.now() - time;
    if (diff < 5000) return appLanguage === 'ms' ? 'Baru sahaja' : 'Just now';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) {
      return appLanguage === 'ms' ? `${seconds} saat lalu` : `${seconds}s ago`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return appLanguage === 'ms' ? `${minutes} minit lalu` : `${minutes}m ago`;
    }
    return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSyncClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await syncOfflineQueue();
  };

  const hasPending = queueSize > 0;
  const currentView = viewStack[viewStack.length - 1];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Discreet Master Settings Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-10 h-10 flex items-center justify-center rounded-full active:scale-95 transition-all text-text relative bg-surface hover:bg-gray-200/50 dark:hover:bg-gray-800/50",
          isOpen && "bg-gray-200/80 dark:bg-gray-800/80"
        )}
        aria-label="Settings and Sync status"
        title="Settings & Sync"
      >
        <Settings className={cn("w-5 h-5 transition-transform duration-500", isOpen && "rotate-45")} />

        {/* Discreet corner dot for system health */}
        {(!isOnline || hasPending) && (
          <span className={cn(
            "absolute top-[10px] right-[10px] w-2.5 h-2.5 rounded-full border border-white dark:border-black animate-pulse",
            !isOnline ? "bg-red-500" : "bg-amber-500"
          )} />
        )}
      </button>

      {/* Popover pane */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl p-4 shrink-0 z-50 text-xs text-text animate-fade-in-up">
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-gray-100 dark:border-gray-800">
            <span className="font-bold text-sm tracking-tight text-text">
              {appLanguage === 'ms' ? 'Tetapan & Sistem' : 'Settings & Sync'}
            </span>
            {hasPending && isOnline && (
              <button
                onClick={handleSyncClick}
                disabled={isSyncing}
                className="flex items-center space-x-1 bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider transition-all disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
                <span>{isSyncing ? '...' : (appLanguage === 'ms' ? 'Hantar' : 'Sync')}</span>
              </button>
            )}
          </div>

          <div className="space-y-3 pt-3">
            {/* Language Selection row */}
            <div className="flex items-center justify-between">
              <span className="text-subtext flex items-center gap-1.5 font-medium">
                <Languages className="w-3.5 h-3.5 opacity-70" />
                {appLanguage === 'ms' ? 'Bahasa' : 'Language'}
              </span>
              <div className="flex bg-surface p-0.5 rounded-lg border border-gray-100/50 dark:border-gray-800">
                <button
                  onClick={() => appLanguage !== 'en' && toggleLanguage()}
                  className={cn(
                    "px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                    appLanguage === 'en' 
                      ? "bg-white dark:bg-gray-800 text-text shadow-sm" 
                      : "text-subtext opacity-75 active:opacity-100"
                  )}
                >
                  EN
                </button>
                <button
                  onClick={() => appLanguage !== 'ms' && toggleLanguage()}
                  className={cn(
                    "px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                    appLanguage === 'ms' 
                      ? "bg-white dark:bg-gray-800 text-text shadow-sm" 
                      : "text-subtext opacity-75 active:opacity-100"
                  )}
                >
                  BM
                </button>
              </div>
            </div>

            {/* Theme selection row */}
            <div className="flex items-center justify-between">
              <span className="text-subtext flex items-center gap-1.5 font-medium">
                {theme === 'dark' ? <Moon className="w-3.5 h-3.5 opacity-70 text-amber-500" /> : <Sun className="w-3.5 h-3.5 opacity-70 text-amber-500" />}
                {appLanguage === 'ms' ? 'Tema' : 'Theme'}
              </span>
              <div className="flex bg-surface p-0.5 rounded-lg border border-gray-100/50 dark:border-gray-800">
                <button
                  onClick={() => theme !== 'light' && toggleTheme()}
                  className={cn(
                    "px-2 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1",
                    theme === 'light' 
                      ? "bg-white dark:bg-gray-800 text-text shadow-sm" 
                      : "text-subtext opacity-75 active:opacity-100"
                  )}
                >
                  {appLanguage === 'ms' ? 'Cerah' : 'Light'}
                </button>
                <button
                  onClick={() => theme !== 'dark' && toggleTheme()}
                  className={cn(
                    "px-2 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1",
                    theme === 'dark' 
                      ? "bg-white dark:bg-gray-800 text-text shadow-sm" 
                      : "text-subtext opacity-75 active:opacity-100"
                  )}
                >
                  {appLanguage === 'ms' ? 'Gelap' : 'Dark'}
                </button>
              </div>
            </div>

            {/* Network / Connectivity Row */}
            <div className="flex justify-between items-center py-0.5">
              <span className="text-subtext flex items-center gap-1.5 font-medium">
                {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-500" /> : <WifiOff className="w-3.5 h-3.5 text-red-500" />}
                {appLanguage === 'ms' ? 'Sambungan' : 'Network'}
              </span>
              <span className={cn(
                "font-bold",
                isOnline ? "text-emerald-500 dark:text-emerald-400" : "text-red-500"
              )}>
                {isOnline ? (appLanguage === 'ms' ? 'Dalam Talian' : 'Online') : (appLanguage === 'ms' ? 'Luar Talian' : 'Offline')}
              </span>
            </div>

            {/* Outbox Queue size */}
            <div className="flex justify-between items-center py-0.5">
              <span className="text-subtext">{appLanguage === 'ms' ? 'Barisan Penghantaran' : 'Outbox Queue'}</span>
              <span className={cn(
                "px-2.5 py-0.5 rounded-full font-mono text-xs font-bold",
                hasPending 
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" 
                  : "bg-surface text-subtext"
              )}>
                {queueSize}
              </span>
            </div>

            {/* Cloud synchronization state */}
            <div className="flex justify-between items-center py-0.5">
              <span className="text-subtext">{appLanguage === 'ms' ? 'Status Data' : 'Update Log'}</span>
              <span className="font-semibold text-text flex items-center gap-1">
                {lastSyncTime ? <Check className="w-3 h-3 text-emerald-500" /> : <Cloud className="w-3 h-3 text-subtext" />}
                {getRelativeTime(lastSyncTime)}
              </span>
            </div>

            {/* Interactive database informational slot */}
            <div className="bg-surface p-2.5 rounded-xl text-[10px] leading-relaxed text-subtext">
              {appLanguage === 'ms' 
                ? 'Semua order disimpan setempat apabila tiada internet dan akan dihantar semula secara automatik.' 
                : 'Offline data caches securely locally. Flushes immediately upon regaining connection.'
              }
            </div>

            {/* Export Contacts Button */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  pushView('contacts-sync');
                }}
                className="w-full flex items-center justify-center gap-1.5 bg-primary text-white py-2 rounded-xl font-bold text-xs hover:bg-primary-hover active:scale-[0.98] transition-all cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                {appLanguage === 'ms' ? 'Export Contacts (CSV)' : 'Export Contacts (CSV)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
