import React, { useState, useEffect } from 'react';
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
  HelpCircle,
  Shield,
  Key,
  RefreshCw,
  Play,
  CheckCircle,
  AlertTriangle,
  Smartphone
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';
import { getAuth } from '../lib/firebase';
import { SyncDiagnostics } from '../components/SyncDiagnostics';
import { isHapticsSupported, isHapticsEnabled, setHapticsEnabled, triggerHaptic } from '../utils/haptics';
const auth = getAuth();
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { googleSignIn, logout as googleLogout } from '../utils/googleAuth';
import { 
  seedCanaryData, 
  getOperationalOrders, 
  getOverdueOrders, 
  getArchivedOrders,
  isFirestoreCanary,
  orderDataSource
} from '../services/firestoreOrders';


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

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<any | null>(null);
  const [hapticsEnabled, setHapticsState] = useState(isHapticsEnabled());

  const handleToggleHaptics = (enabled: boolean) => {
    setHapticsEnabled(enabled);
    setHapticsState(enabled);
    if (enabled) {
      setTimeout(() => {
        triggerHaptic('success');
      }, 50);
    } else {
      setTimeout(() => {
        // Fallback or small confirmation if supported before turning off
      }, 50);
    }
  };

  useEffect(() => {
    getRedirectResult(auth).then((result) => {
    }).catch((error) => {
      console.error('Redirect error:', error);
      setAuthError(error.code);
    });

    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
  }, []);

  const handleLogin = async () => {
    triggerHaptic('light');
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');
    provider.addScope('https://www.googleapis.com/auth/contacts');
    
    try {
      // Default to popup, with fallback logic internally if needed
      await signInWithPopup(auth, provider);
      triggerHaptic('success');
    } catch (error: any) {
      triggerHaptic('error');
      setAuthError(error.code || error.message);
      
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-query') {
        await signInWithRedirect(auth, provider);
      }
    }
  };

  const handleLogout = async () => {
    triggerHaptic('heavy');
    try {
      await auth.signOut();
      setFirebaseUser(null);
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleSeed = async () => {
    triggerHaptic('medium');
    setIsSeeding(true);
    setSeedStatus(appLanguage === 'ms' ? 'Menulis rekod canary ke Firestore...' : 'Writing canary records to Firestore...');
    try {
      const res = await seedCanaryData();
      triggerHaptic('success');
      setSeedStatus(
        appLanguage === 'ms' 
          ? `Berjaya! Ditulis ${res.undelivered} ke orders_canary dan ${res.delivered} ke orders_archive_canary.` 
          : `Success! Wrote ${res.undelivered} to orders_canary and ${res.delivered} to orders_archive_canary.`
      );
    } catch (e: any) {
      triggerHaptic('error');
      console.error(e);
      setSeedStatus(appLanguage === 'ms' ? `Ralat: ${e.message}` : `Error: ${e.message}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleRunTests = async () => {
    triggerHaptic('medium');
    setIsRunningTests(true);
    setTestResults(null);
    try {
      const operational = await getOperationalOrders();
      const overdue = await getOverdueOrders();
      const archived = await getArchivedOrders();

      const totalCount = operational.length + overdue.length + archived.length;
      const isSuccess = operational.length === 5 && overdue.length === 5 && archived.length === 10;

      if (isSuccess) {
        triggerHaptic('success');
      } else {
        triggerHaptic('warning');
      }

      setTestResults({
        success: isSuccess,
        totalRecords: totalCount,
        operationalCount: operational.length,
        overdueCount: overdue.length,
        archivedCount: archived.length
      });
    } catch (e: any) {
      triggerHaptic('error');
      console.error(e);
      setTestResults({
        success: false,
        totalRecords: 0,
        operationalCount: 0,
        overdueCount: 0,
        archivedCount: 0,
        error: e.message
      });
    } finally {
      setIsRunningTests(false);
    }
  };

  const handleExportContacts = () => {
    triggerHaptic('light');
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
                onClick={() => {
                  if (appLanguage !== 'en') {
                    triggerHaptic('light');
                    toggleLanguage();
                  }
                }}
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
                onClick={() => {
                  if (appLanguage !== 'ms') {
                    triggerHaptic('light');
                    toggleLanguage();
                  }
                }}
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
                onClick={() => {
                  if (theme !== 'light') {
                    triggerHaptic('light');
                    toggleTheme();
                  }
                }}
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
                onClick={() => {
                  if (theme !== 'dark') {
                    triggerHaptic('light');
                    toggleTheme();
                  }
                }}
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

          {/* Haptic Feedback Row */}
          <div className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50/50 dark:hover:bg-zinc-900/50 transition-colors">
            <span className="text-xs font-bold text-text flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-violet-500" />
              <span className="flex flex-col">
                <span>{appLanguage === 'ms' ? 'Maklum Balas Haptik' : 'Haptic Feedback'}</span>
                {!isHapticsSupported() && (
                  <span className="text-[9px] text-subtext/60 font-semibold leading-none">
                    {appLanguage === 'ms' ? 'Tidak disokong pada peranti ini' : 'Not supported on this device'}
                  </span>
                )}
              </span>
            </span>
            <div className="flex bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-gray-100/30">
              <button
                onClick={() => handleToggleHaptics(true)}
                disabled={!isHapticsSupported()}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-black transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                  hapticsEnabled && isHapticsSupported()
                    ? "bg-white dark:bg-zinc-700 text-text shadow-sm" 
                    : "text-subtext opacity-75 active:opacity-100"
                )}
              >
                {appLanguage === 'ms' ? 'Aktif' : 'On'}
              </button>
              <button
                onClick={() => handleToggleHaptics(false)}
                disabled={!isHapticsSupported()}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-black transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                  (!hapticsEnabled || !isHapticsSupported())
                    ? "bg-white dark:bg-zinc-700 text-text shadow-sm" 
                    : "text-subtext opacity-75 active:opacity-100"
                )}
              >
                {appLanguage === 'ms' ? 'Matikan' : 'Off'}
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

      {/* FIRESTORE CANARY & AUTH CONTROL PANEL */}
      <div className="bg-gradient-to-tr from-amber-500/10 to-orange-500/5 dark:from-amber-500/20 dark:to-orange-500/10 p-5 rounded-2xl border border-amber-500/15 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-amber-500" />
          <h3 className="font-black text-sm text-text">
            {appLanguage === 'ms' ? 'Panel Kawalan Canary Firestore' : 'Firestore Canary Control Panel'}
          </h3>
        </div>

        {/* Feature Flag Status */}
        <div className="flex justify-between items-center text-xs bg-white dark:bg-zinc-900/50 p-3 rounded-xl border border-gray-100/30">
          <span className="font-bold text-subtext flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-indigo-500" />
            VITE_ORDER_DATA_SOURCE
          </span>
          <span className={cn(
            "font-mono font-black text-[10px] px-2.5 py-1 rounded-full",
            isFirestoreCanary
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400"
              : "bg-gray-100 text-subtext dark:bg-zinc-800"
          )}>
            {orderDataSource}
          </span>
        </div>

        {/* Auth User Details */}
        <div className="bg-white dark:bg-zinc-900/50 p-4 rounded-xl border border-gray-100/30 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-black text-text">
              {appLanguage === 'ms' ? 'Pengguna Firebase Terautentikasi' : 'Authenticated Firebase User'}
            </h4>
            {firebaseUser ? (
              <button 
                onClick={handleLogout}
                className="text-[10px] font-black text-red-500 hover:underline cursor-pointer"
              >
                {appLanguage === 'ms' ? 'LOG OUT' : 'LOG OUT'}
              </button>
            ) : null}
          </div>

          {firebaseUser ? (
            <div className="space-y-1.5 font-medium text-[11px] leading-tight">
              <div className="flex justify-between">
                <span className="text-subtext">UID:</span>
                <span className="font-mono font-bold text-text select-all">{firebaseUser.uid}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtext">Email:</span>
                <span className="text-text font-bold">{firebaseUser.email || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtext">Name:</span>
                <span className="text-text font-bold">{firebaseUser.displayName || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtext">Status:</span>
                <span className="text-emerald-500 font-bold">SIGNED_IN</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              <p className="text-xs text-subtext text-center">
                {appLanguage === 'ms' ? 'Sila log masuk untuk mendapatkan UID Firebase terautentikasi anda.' : 'Please sign in to retrieve your authenticated Firebase UID.'}
              </p>
              
              <button
                onClick={handleLogin}
                className="w-full bg-primary hover:bg-primary/90 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Key className="w-4 h-4" />
                {appLanguage === 'ms' ? 'Log Masuk dengan Google' : 'Sign In with Google'}
              </button>

              {authError && (
                <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded-lg border border-red-100 dark:border-red-900/30 text-[10px] text-red-600 dark:text-red-400 font-mono text-center">
                  Error: {authError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Operations Buttons */}
        {firebaseUser && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {/* Seed Button */}
            <button
              onClick={handleSeed}
              disabled={isSeeding}
              className="bg-white hover:bg-gray-50 text-text font-bold text-xs py-2.5 px-3 rounded-xl border border-gray-100/50 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSeeding ? (
                <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
              ) : (
                <Play className="w-4 h-4 text-amber-500" />
              )}
              {appLanguage === 'ms' ? 'Sediakan Data Canary' : 'Initialize Canary Data'}
            </button>

            {/* Run Tests Button */}
            <button
              onClick={handleRunTests}
              disabled={isRunningTests}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 px-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isRunningTests ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              {appLanguage === 'ms' ? 'Jalankan Ujian Canary' : 'Run Canary Tests'}
            </button>
          </div>
        )}

        {/* Seed result status */}
        {seedStatus && (
          <p className="text-center font-bold text-xs text-amber-600 animate-pulse bg-amber-50/50 dark:bg-amber-950/10 p-2 rounded-lg">
            {seedStatus}
          </p>
        )}

        {/* Test results report */}
        {testResults && (
          <div className="bg-zinc-900 text-zinc-100 p-4 rounded-xl font-mono text-[10px] space-y-2.5 border border-zinc-800">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-1.5">
              <span className="font-bold text-indigo-400">CANARY VERIFICATION REPORT</span>
              <span className={cn(
                "font-black text-[9px] px-2 py-0.5 rounded-full",
                testResults.success ? "bg-emerald-950/50 text-emerald-400" : "bg-red-950/50 text-red-400"
              )}>
                {testResults.success ? "PASSED" : "FAILED"}
              </span>
            </div>
            <div className="space-y-1">
              <div>- Total Canary Records: <span className="text-white font-bold">{testResults.totalRecords} / 20</span></div>
              <div>- Active Operational Window: <span className="text-white font-bold">{testResults.operationalCount} / 5</span></div>
              <div>- Overdue Undelivered: <span className="text-white font-bold">{testResults.overdueCount} / 5</span></div>
              <div>- Archived History: <span className="text-white font-bold">{testResults.archivedCount} / 10</span></div>
            </div>
            <p className="text-[9px] text-zinc-400 leading-normal border-t border-zinc-800 pt-1.5">
              {testResults.success 
                ? "All query range filters, order clauses, limits, and data mappings are 100% correct!" 
                : "Mismatched record counts or missing collections detected."}
            </p>
          </div>
        )}
      </div>

      <SyncDiagnostics />

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
