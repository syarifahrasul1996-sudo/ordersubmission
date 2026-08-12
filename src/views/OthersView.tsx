import React from 'react';
import { 
  Languages, 
  Sun, 
  Moon, 
  Wifi, 
  WifiOff, 
  FileDown, 
  Database, 
  ExternalLink,
  ChevronRight,
  Info,
  Layers,
  HelpCircle
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';

export function OthersView() {
  const { 
    theme, 
    toggleTheme, 
    appLanguage, 
    toggleLanguage, 
    isOnline, 
    queueSize, 
    pushView, 
    state 
  } = useAppContext();

  const handleExportContacts = () => {
    pushView('contacts-sync');
  };

  return (
    <div className="flex flex-col p-4 sm:p-5 space-y-5 pb-[calc(env(safe-area-inset-bottom)+6.5rem)]">
      {/* App Quick Status Info Banner */}
      <div className="bg-gradient-to-tr from-primary/10 to-purple-500/5 dark:from-primary/20 dark:to-purple-500/10 p-4 rounded-2xl border border-primary/15 flex items-start gap-3">
        <div className="p-2 bg-white dark:bg-zinc-900 rounded-xl shadow-sm text-primary shrink-0">
          <Layers className="w-5 h-5 animate-pulse" />
        </div>
        <div className="space-y-0.5">
          <h3 className="font-black text-sm text-text">
            {appLanguage === 'ms' ? 'Hab Pengurusan & Tetapan' : 'Management & Settings Hub'}
          </h3>
          <p className="text-xs text-subtext leading-relaxed font-medium">
            {appLanguage === 'ms' 
              ? 'Urus tetapan peranti, eksport data kenalan pelanggan, dan periksa keserasian sistem secara langsung.' 
              : 'Manage local system preferences, export customer contacts, and review spreadsheet integration health.'
            }
          </p>
        </div>
      </div>

      {/* Main Settings Group */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-subtext ml-1.5">
          {appLanguage === 'ms' ? 'Sistem & Keutamaan' : 'System & Preferences'}
        </h4>
        <div className="bg-surface rounded-2xl border border-gray-100/50 p-2.5 space-y-1.5 shadow-sm">
          {/* Language Row */}
          <div className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50/50 dark:hover:bg-zinc-900/50 transition-colors">
            <span className="text-xs font-bold text-text flex items-center gap-2">
              <Languages className="w-4 h-4 text-primary" />
              {appLanguage === 'ms' ? 'Bahasa Aplikasi' : 'App Language'}
            </span>
            <div className="flex bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-gray-100/30">
              <button
                onClick={() => appLanguage !== 'en' && toggleLanguage()}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all cursor-pointer",
                  appLanguage === 'en' 
                    ? "bg-white dark:bg-zinc-700 text-text shadow-sm" 
                    : "text-subtext opacity-75 active:opacity-100"
                )}
              >
                EN
              </button>
              <button
                onClick={() => appLanguage !== 'ms' && toggleLanguage()}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all cursor-pointer",
                  appLanguage === 'ms' 
                    ? "bg-white dark:bg-zinc-700 text-text shadow-sm" 
                    : "text-subtext opacity-75 active:opacity-100"
                )}
              >
                BM
              </button>
            </div>
          </div>

          {/* Theme Row */}
          <div className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50/50 dark:hover:bg-zinc-900/50 transition-colors">
            <span className="text-xs font-bold text-text flex items-center gap-2">
              {theme === 'dark' ? <Moon className="w-4 h-4 text-amber-500" /> : <Sun className="w-4 h-4 text-amber-500" />}
              {appLanguage === 'ms' ? 'Tema Aplikasi' : 'App Theme'}
            </span>
            <div className="flex bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-gray-100/30">
              <button
                onClick={() => theme !== 'light' && toggleTheme()}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-black transition-all cursor-pointer",
                  theme === 'light' 
                    ? "bg-white dark:bg-zinc-700 text-text shadow-sm" 
                    : "text-subtext opacity-75 active:opacity-100"
                )}
              >
                {appLanguage === 'ms' ? 'Cerah' : 'Light'}
              </button>
              <button
                onClick={() => theme !== 'dark' && toggleTheme()}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-black transition-all cursor-pointer",
                  theme === 'dark' 
                    ? "bg-white dark:bg-zinc-700 text-text shadow-sm" 
                    : "text-subtext opacity-75 active:opacity-100"
                )}
              >
                {appLanguage === 'ms' ? 'Gelap' : 'Dark'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Utilities Group */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-subtext ml-1.5">
          {appLanguage === 'ms' ? 'Utiliti Data' : 'Data Utilities'}
        </h4>
        <div className="bg-surface rounded-2xl border border-gray-100/50 p-2.5 space-y-1 shadow-sm">
          {/* Export Contacts button */}
          <button
            onClick={handleExportContacts}
            className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50/50 dark:hover:bg-zinc-900/50 text-left transition-colors cursor-pointer group"
          >
            <span className="text-xs font-bold text-text flex items-center gap-2">
              <FileDown className="w-4 h-4 text-emerald-500" />
              {appLanguage === 'ms' ? 'Eksport Kenalan Pelanggan (CSV)' : 'Export Customer Contacts (CSV)'}
            </span>
            <ChevronRight className="w-4 h-4 text-subtext group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Integration & Cloud Database Settings */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-subtext ml-1.5">
          {appLanguage === 'ms' ? 'Integrasi Google Sheets' : 'Google Sheets Integration'}
        </h4>
        <div className="bg-surface rounded-2xl border border-gray-100/50 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-indigo-500" />
            <h5 className="font-bold text-xs text-text">
              {appLanguage === 'ms' ? 'Pangkalan Data Awan Terpaut' : 'Connected Cloud Database'}
            </h5>
          </div>

          <div className="bg-gray-50/50 dark:bg-zinc-900/40 p-3 rounded-xl border border-gray-100/30 text-[11px] space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-subtext font-medium">{appLanguage === 'ms' ? 'Spreadsheet ID' : 'Spreadsheet ID'}:</span>
              <span className="font-mono font-bold text-text truncate max-w-[180px]" title={state.spreadsheetId}>
                {state.spreadsheetId || '1kUAJYUV...'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-subtext font-medium">{appLanguage === 'ms' ? 'Pautan Terus' : 'Direct Link'}:</span>
              {state.spreadsheetId ? (
                <a 
                  href={`https://docs.google.com/spreadsheets/d/${state.spreadsheetId}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-bold flex items-center gap-1.5"
                >
                  {appLanguage === 'ms' ? 'Buka Google Sheet' : 'Open Google Sheet'}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-subtext italic">N/A</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics / Connection Health */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-subtext ml-1.5">
          {appLanguage === 'ms' ? 'Kesihatan Sistem' : 'System Health'}
        </h4>
        <div className="bg-surface rounded-2xl border border-gray-100/50 p-3.5 space-y-3 shadow-sm">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-text flex items-center gap-2">
              {isOnline ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
              {appLanguage === 'ms' ? 'Sambungan Internet' : 'Internet Connection'}
            </span>
            <span className={cn(
              "font-black text-xs px-2.5 py-0.5 rounded-full",
              isOnline ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400"
            )}>
              {isOnline ? (appLanguage === 'ms' ? 'AKTIF' : 'ACTIVE') : (appLanguage === 'ms' ? 'TIADA' : 'OFFLINE')}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-text flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-500" />
              {appLanguage === 'ms' ? 'Barisan Offline' : 'Offline Queue Size'}
            </span>
            <span className={cn(
              "font-mono font-black text-xs px-2.5 py-0.5 rounded-full",
              queueSize > 0 ? "bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400" : "bg-gray-100 text-subtext dark:bg-zinc-800"
            )}>
              {queueSize} {appLanguage === 'ms' ? 'item tertunda' : 'pending items'}
            </span>
          </div>
        </div>
      </div>

      {/* Developer Information / Humble Attribution */}
      <div className="flex flex-col items-center justify-center pt-2 text-center text-subtext/60 gap-1">
        <Info className="w-4 h-4 opacity-55" />
        <p className="text-[10px] font-bold uppercase tracking-wider">
          {appLanguage === 'ms' ? 'Sistem Tempahan & Pengurusan' : 'Ordering & Management System'}
        </p>
        <p className="text-[9px] font-semibold opacity-80">v1.2.0 (Offline-Enabled App)</p>
      </div>
    </div>
  );
}
