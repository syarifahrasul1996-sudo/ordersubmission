import React from 'react';
import { 
  RefreshCw, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  Database,
  Layers
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';

export function SyncDiagnostics() {
  const { 
    lastSyncTime, 
    lastSyncFetchedCount, 
    syncError, 
    isSyncing, 
    syncOrders, 
    appLanguage 
  } = useAppContext();

  const handleManualSync = async () => {
    if (isSyncing) return;
    try {
      await syncOrders();
    } catch (e) {
      console.error('Manual sync failed in diagnostics', e);
    }
  };

  const formatTimestamp = (timestamp: number | null) => {
    if (!timestamp) {
      return appLanguage === 'ms' ? 'Belum pernah diselaraskan' : 'Never synced';
    }
    
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
    
    // Relative time helper
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor(diffMs / 1000);
    
    let relativeStr = '';
    if (diffSecs < 5) {
      relativeStr = appLanguage === 'ms' ? 'Baru sahaja' : 'Just now';
    } else if (diffSecs < 60) {
      relativeStr = appLanguage === 'ms' ? `${diffSecs} saat yang lalu` : `${diffSecs}s ago`;
    } else if (diffMins < 60) {
      relativeStr = appLanguage === 'ms' ? `${diffMins} minit yang lalu` : `${diffMins}m ago`;
    } else {
      const diffHours = Math.floor(diffMins / 60);
      relativeStr = appLanguage === 'ms' ? `${diffHours} jam yang lalu` : `${diffHours}h ago`;
    }

    return `${relativeStr} (${dateStr}, ${timeStr})`;
  };

  return (
    <div className="bg-surface rounded-2xl border border-gray-100/50 p-4 space-y-4 shadow-sm animate-fade-in">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Layers className="w-4 h-4 text-primary" />
          <h5 className="font-bold text-xs text-text">
            {appLanguage === 'ms' ? 'Diagnostik Penyelarasan' : 'Sync Status & Diagnostics'}
          </h5>
        </div>
        
        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer",
            isSyncing
              ? "bg-gray-100 dark:bg-zinc-800 text-subtext"
              : "bg-primary/10 hover:bg-primary/20 text-primary"
          )}
        >
          <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
          {isSyncing 
            ? (appLanguage === 'ms' ? 'Menyelaras...' : 'Syncing...') 
            : (appLanguage === 'ms' ? 'Selaras Sekarang' : 'Sync Now')
          }
        </button>
      </div>

      {/* Grid Status Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Last Sync Timestamp Box */}
        <div className="bg-gray-50/50 dark:bg-zinc-900/40 p-3 rounded-xl border border-gray-100/30 space-y-1">
          <div className="flex items-center gap-1.5 text-subtext text-[10px] font-bold uppercase tracking-wider">
            <Clock className="w-3 h-3 text-indigo-500" />
            {appLanguage === 'ms' ? 'Penyelarasan Terakhir' : 'Last Sync At'}
          </div>
          <p className="text-xs font-bold text-text truncate font-mono">
            {formatTimestamp(lastSyncTime)}
          </p>
        </div>

        {/* Total Items Box */}
        <div className="bg-gray-50/50 dark:bg-zinc-900/40 p-3 rounded-xl border border-gray-100/30 space-y-1">
          <div className="flex items-center gap-1.5 text-subtext text-[10px] font-bold uppercase tracking-wider">
            <Database className="w-3 h-3 text-emerald-500" />
            {appLanguage === 'ms' ? 'Item Berjaya Diambil' : 'Total Items Synced'}
          </div>
          <p className="text-xs font-bold text-text font-mono">
            {lastSyncFetchedCount} {appLanguage === 'ms' ? 'pesanan' : 'orders'}
          </p>
        </div>
      </div>

      {/* Sync Health & Error Reporting */}
      <div className="pt-1">
        {syncError ? (
          <div className="bg-red-50/70 dark:bg-red-950/20 p-3 rounded-xl border border-red-100/60 dark:border-red-900/30 flex gap-2.5 items-start">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h6 className="font-bold text-[11px] text-red-700 dark:text-red-400">
                {appLanguage === 'ms' ? 'Ralat Penyelarasan Dikesan' : 'Synchronization Errors Found'}
              </h6>
              <p className="text-[10px] text-red-600/90 dark:text-red-400/80 leading-relaxed font-mono font-medium">
                {syncError}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100/60 dark:border-emerald-900/30 flex gap-2.5 items-center">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="space-y-0.5">
              <h6 className="font-bold text-[11px] text-emerald-700 dark:text-emerald-400">
                {appLanguage === 'ms' ? 'Kesihatan Penyelarasan Sihat' : 'Sync Connection Healthy'}
              </h6>
              <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/70 leading-none font-medium">
                {appLanguage === 'ms' 
                  ? 'Semua sambungan pangkalan data awan beroperasi secara optimum.' 
                  : 'All annual databases and cloud channels are synchronized properly.'
                }
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
