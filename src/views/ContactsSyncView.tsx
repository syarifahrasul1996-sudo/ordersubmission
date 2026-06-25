import React, { useState, useEffect, useMemo } from 'react';
import { parseDateStringToTimestamp } from '../utils';
import { 
  Users, 
  RefreshCw, 
  Search, 
  CheckSquare, 
  Square, 
  Loader2, 
  Phone, 
  Clock, 
  Database,
  Download,
  FileText,
  FileDown
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';
import { motion } from 'motion/react';

interface ContactItem {
  phone: string;
  originalName: string;
  formattedName: string;
  timesOrdered: number;
  oldestTimestamp: number;
  status: 'idle' | 'syncing' | 'success' | 'failed';
  error?: string;
}

const normalizePhone = (num: string): string => {
  return num.replace(/[^\d]/g, '');
};

const isPhoneMatch = (phoneA: string, phoneB: string): boolean => {
  const cleanA = normalizePhone(phoneA);
  const cleanB = normalizePhone(phoneB);
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;
  // Match end suffixes to account for international formatting, e.g., +60123456789 vs 0123456789
  if (cleanA.length >= 9 && cleanB.length >= 9) {
    return cleanA.slice(-9) === cleanB.slice(-9);
  }
  return cleanA.slice(-7) === cleanB.slice(-7);
};

const toProperCase = (str: string): string => {
  return str.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
};

export function ContactsSyncView() {
  const { state, history, appLanguage } = useAppContext();
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Database / past 3 years spreadsheet cloud loading state
  const [cloudOrders, setCloudOrders] = useState<any[]>([]);
  const [fetchingCloud, setFetchingCloud] = useState(false);
  const [cloudFetchProgress, setCloudFetchProgress] = useState('');
  const [hasLoadedCloud, setHasLoadedCloud] = useState(false);

  // Initialize annualSheets identical to HistoryView
  const [annualSheets] = useState(() => {
    try {
      const saved = localStorage.getItem('db_annual_sheets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s: any) => ({
            year: String(s.year || ''),
            spreadsheetId: String(s.spreadsheetId || ''),
            scriptUrl: String(s.scriptUrl || '')
          }));
        }
      }
    } catch (e) {
      console.error(e);
    }
    return [
      {
        year: '2024',
        spreadsheetId: '1B9zdWXVLnvj0jNNVnKxcb6cJnS1VLCIdB4j-RR3wOlg',
        scriptUrl: ''
      },
      {
        year: '2025',
        spreadsheetId: '1myU9apnYWWtU3snnCw14qI6ZS05i4DY6oOswLz1sCwo',
        scriptUrl: ''
      },
      {
        year: '2026',
        spreadsheetId: state.spreadsheetId || '1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo',
        scriptUrl: ''
      }
    ];
  });

  // 2. Fetch past 3 years database function
  const fetchThreeYearCloudDatabase = async () => {
    const activeConfigs = annualSheets.filter(
      sheet => sheet.spreadsheetId && sheet.spreadsheetId.trim() !== ''
    );

    if (activeConfigs.length === 0) {
      setSyncLogs(prev => [
        ...prev, 
        appLanguage === 'ms' 
          ? 'Ralat: Tiada Database Cloud dikonfigurasikan di bahagian Sejarah > Tetapan.' 
          : 'Error: No Cloud Database configured in History > Settings.'
      ]);
      return;
    }

    setFetchingCloud(true);
    setCloudFetchProgress(appLanguage === 'ms' ? 'Menyambung dengan pelayan...' : 'Connecting with server...');

    const globalScriptUrl = localStorage.getItem('db_global_script_url') || 'https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec';

    const allYearOrders: any[] = [];
    const errors: string[] = [];

    const extractIdLocal = (input: string) => {
      const trimmed = input.trim();
      if (trimmed.includes('docs.google.com/spreadsheets/d/')) {
        const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
        return match ? match[1] : trimmed;
      }
      return trimmed;
    };

    // Helper JSONP request
    const jsonpRequestLocal = (url: URL, callbackName: string) => {
      return new Promise<any>((resolve, reject) => {
        const cacheBustedUrl = new URL(url.toString());
        cacheBustedUrl.searchParams.set('_nocache', String(Date.now()) + Math.random().toString(36).substring(2, 7));
        const script = document.createElement('script');
        script.src = cacheBustedUrl.toString();
        script.async = true;

        const timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('Request timed out'));
        }, 30000);

        const cleanup = () => {
          clearTimeout(timeoutId);
          delete (window as any)[callbackName];
          if (script.parentNode) script.parentNode.removeChild(script);
        };

        (window as any)[callbackName] = (data: any) => {
          cleanup();
          resolve(data);
        };

        script.onerror = (event: any) => {
          if (event && typeof event !== 'string') {
            if (typeof (event as any).preventDefault === 'function') (event as any).preventDefault();
            if (typeof (event as any).stopPropagation === 'function') (event as any).stopPropagation();
          }
          cleanup();
          reject(new Error('Failed to load script callback'));
        };

        document.body.appendChild(script);
      });
    };

    try {
      await Promise.all(
        activeConfigs.map(async (sheet) => {
          const sId = extractIdLocal(sheet.spreadsheetId);
          const sUrl = sheet.scriptUrl.trim() || globalScriptUrl;
          const safeYear = String(sheet.year).replace(/[^\w]/g, '_');
          const callbackName = 'jsonp_contacts_' + Math.round(100000 * Math.random()) + '_' + safeYear;
          const url = new URL(sUrl);

          url.searchParams.append('action', 'get_dashboard_orders');
          url.searchParams.append('spreadsheetId', sId);
          url.searchParams.append('year', sheet.year);
          url.searchParams.append('callback', callbackName);

          setCloudFetchProgress(() => 
            appLanguage === 'ms' 
              ? `Memuat turun data tahun ${sheet.year}...` 
              : `Downloading data for year ${sheet.year}...`
          );

          try {
            const data = await jsonpRequestLocal(url, callbackName);
            if (data && data.status === 'success' && Array.isArray(data.orders)) {
              allYearOrders.push(...data.orders);
              setSyncLogs(prev => [
                ...prev, 
                `📥 ${appLanguage === 'ms' ? 'Berjaya memperoleh' : 'Fetched'} ${data.orders.length} ${appLanguage === 'ms' ? 'rekod dari' : 'records from'} ${sheet.year}`
              ]);
            } else {
              throw new Error(data?.message || 'Invalid response status');
            }
          } catch (err: any) {
            console.warn(`Sync contacts fetch failed for year ${sheet.year}:`, err);
            errors.push(`${sheet.year}: ${err.message || String(err)}`);
          }
        })
      );

      setCloudOrders(allYearOrders);
      setHasLoadedCloud(true);

      if (errors.length > 0) {
        setSyncLogs(prev => [
          ...prev, 
          `⚠️ ${appLanguage === 'ms' ? 'Ada ralat semasa memuat turun data' : 'Some issues occurred while loading sheets'}: ${errors.join(', ')}`
        ]);
      } else {
        setSyncLogs(prev => [
          ...prev, 
          `✨ ${appLanguage === 'ms' ? 'Pangkalan data 3 tahun berjaya dimuat!' : 'Full 3-year database successfully populated!'}`
        ]);
      }
    } catch (e: any) {
      console.error(e);
      setSyncLogs(prev => [...prev, `❌ Error calling Google Sheets: ${e.message || String(e)}`]);
    } finally {
      setFetchingCloud(false);
      setCloudFetchProgress('');
    }
  };

  // 3. Memoized compilation of local history + fetched cloud records
  const combinedContacts = useMemo(() => {
    const allOrders: Array<{ name: string; phone: string; timestamp: number }> = [];

    // Local History Items
    for (const item of history) {
      const name = item.state?.customerName;
      const phone = item.state?.customerPhone;
      const ts = item.state?.dueTimestamp || item.timestamp || Date.now();
      if (phone && phone.trim()) {
        allOrders.push({ name: name || '', phone: phone.trim(), timestamp: ts });
      }
    }

    // Cloud Database Items
    for (const item of cloudOrders) {
      const name = item.name;
      const phone = item.phone;
      let ts = Date.now();
      if (item.dueTimestamp && item.dueTimestamp > 0) {
        ts = item.dueTimestamp;
      } else if (item.due) {
        const parsed = parseDateStringToTimestamp(item.due, 0);
        ts = parsed.timestamp || Date.now();
      }
      if (phone && phone.trim()) {
        allOrders.push({ name: name || '', phone: phone.trim(), timestamp: ts });
      }
    }

    // Sort ascending so the OLDEST records are processed FIRST.
    // This connects unique numbers to their oldest name assignment!
    allOrders.sort((a, b) => a.timestamp - b.timestamp);

    const contactsMap = new Map<string, ContactItem>();

    for (const order of allOrders) {
      const rawPhone = order.phone;
      if (!rawPhone || !rawPhone.trim()) continue;

      const cleanPhone = rawPhone.replace(/[^\d+]/g, '');
      if (!cleanPhone) continue;

      // Match check
      let matchedKey = '';
      for (const existingKey of contactsMap.keys()) {
        if (isPhoneMatch(existingKey, cleanPhone)) {
          matchedKey = existingKey;
          break;
        }
      }

      if (matchedKey) {
        const existing = contactsMap.get(matchedKey)!;
        existing.timesOrdered += 1;
      } else {
        const rawName = (order.name || '').trim();
        // Split by all types of whitespace including unicode non-breaking spaces
        const words = rawName.split(/[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+/).filter(Boolean);
        const twoWords = words.slice(0, 2).join(' ');
        const finalName = twoWords ? toProperCase(twoWords) : (appLanguage === 'ms' ? 'Pelanggan' : 'Customer');
        const formattedName = `Cust ${finalName}`;

        contactsMap.set(cleanPhone, {
          phone: cleanPhone,
          originalName: rawName || (appLanguage === 'ms' ? 'Pelanggan Tanpa Nama' : 'Anonymous Customer'),
          formattedName,
          timesOrdered: 1,
          oldestTimestamp: order.timestamp,
          status: 'idle'
        });
      }
    }

    return Array.from(contactsMap.values());
  }, [history, cloudOrders, appLanguage]);

  // 4. Update state when combined list changes, ensuring active status configurations are kept intact
  useEffect(() => {
    setContacts(prev => {
      const statusMap = new Map<string, { status: 'idle' | 'syncing' | 'success' | 'failed'; error?: string }>();
      for (const item of prev) {
        statusMap.set(item.phone, { status: item.status, error: item.error });
      }

      return combinedContacts.map(c => {
        const saved = statusMap.get(c.phone);
        if (saved) {
          return { ...c, status: saved.status, error: saved.error };
        }
        return c;
      });
    });
  }, [combinedContacts]);

  // Handle CSV Export
  const handleExportCSV = () => {
    const targets = contacts.filter(c => selectedPhones.has(c.phone));
    if (targets.length === 0) return;

    setIsExporting(true);
    setSyncLogs(prev => [...prev, appLanguage === 'ms' ? `Membina fail CSV untuk ${targets.length} kenalan...` : `Building CSV file for ${targets.length} contacts...`]);

    try {
      // Headers for Google Contacts compatible CSV import
      const headers = ['Name', 'Phone 1 - Value'];
      const csvRows = [headers.join(',')];
      
      const sanitize = (val: string) => val.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2066-\u2069\u00A0\u202F\r\n\t]/g, '').trim();
      const sanitizePhone = (val: string) => {
        let p = val.replace(/[^\d+]/g, '');
        // If it starts with 60 (Malaysia) and no +, prepend +
        if (p.startsWith('60')) p = '+' + p;
        // If it starts with 0 (Local Malaysia), convert to +60
        else if (p.startsWith('0')) p = '+60' + p.substring(1);
        return p;
      };

      targets.forEach(c => {
        const row = [
          `"${sanitize(c.formattedName)}"`,
          `"${sanitizePhone(c.phone)}"`
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      // No BOM to avoid ï»¿ issue, simple blob for browsers
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      
      link.setAttribute('href', url);
      link.setAttribute('download', `pelanggan_contacts_${dateStr}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSyncLogs(prev => [...prev, appLanguage === 'ms' ? '✅ Fail CSV berjaya dimuat turun.' : '✅ CSV file downloaded successfully.']);
      
      // Update status to success
      setContacts(prev => prev.map(c => selectedPhones.has(c.phone) ? { ...c, status: 'success' } : c));
    } catch (err: any) {
      console.error(err);
      setSyncLogs(prev => [...prev, `❌ ${appLanguage === 'ms' ? 'Gagal membina CSV' : 'Failed to build CSV'}: ${err.message}`]);
    } finally {
      setIsExporting(false);
    }
  };

  // 3. Search and filter list items
  const filteredContacts = useMemo(() => {
    if (!localSearchQuery.trim()) return contacts;
    const q = localSearchQuery.toLowerCase();
    return contacts.filter(c => 
      c.formattedName.toLowerCase().includes(q) || 
      c.originalName.toLowerCase().includes(q) || 
      c.phone.includes(q)
    );
  }, [contacts, localSearchQuery]);

  // Checkbox functions
  const toggleSelect = (phone: string) => {
    setSelectedPhones(prev => {
      const next = new Set(prev);
      if (next.has(phone)) {
        next.delete(phone);
      } else {
        next.add(phone);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPhones.size === filteredContacts.length) {
      setSelectedPhones(new Set());
    } else {
      setSelectedPhones(new Set(filteredContacts.map(c => c.phone)));
    }
  };

  // Action: Export individual contact as CSV simple helper
  const handleExportIndividual = (contact: ContactItem) => {
    const sanitize = (val: string) => val.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2066-\u2069\u00A0\u202F\r\n\t]/g, '').trim();
    const sanitizePhone = (val: string) => {
      let p = val.replace(/[^\d+]/g, '');
      if (p.startsWith('60')) p = '+' + p;
      else if (p.startsWith('0')) p = '+60' + p.substring(1);
      return p;
    };
    
    setContacts(prev => prev.map(c => c.phone === contact.phone ? { ...c, status: 'success' } : c));
    const headers = ['Name', 'Phone 1 - Value'];
    const row = [`"${sanitize(contact.formattedName)}"`, `"${sanitizePhone(contact.phone)}"`];
    const csvContent = [headers.join(','), row.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `contact_${sanitizePhone(contact.phone)}.csv`);
    link.click();
    setSyncLogs(prev => [...prev, `✅ ${appLanguage === 'ms' ? 'Eksport CSV untuk' : 'CSV Exported for'} ${contact.formattedName}`]);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="p-4 sm:p-5 space-y-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] max-w-4xl mx-auto"
    >
      {/* Intro Context banner */}
      <div className="bg-surface rounded-2xl p-4 flex gap-4 items-start border border-gray-100/60 dark:border-gray-800">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-text">
            {appLanguage === 'ms' ? 'Eksport Kenalan Pelanggan (CSV)' : 'Export Customer Contacts (CSV)'}
          </h2>
          <p className="text-xs text-subtext leading-relaxed">
            {appLanguage === 'ms' 
               ? 'Muat turun senarai pelanggan anda dalam format CSV untuk dimasukkan ke dalam Google Contacts atau buku telefon iPhone anda.'
              : 'Download your consolidated customer list as a CSV file to easily import into Google Contacts or your iPhone address book.'}
          </p>
        </div>
      </div>

      {/* 3-Year Database Fetcher Card */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
              <Database className="w-5 h-5 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-text flex items-center gap-2">
                {appLanguage === 'ms' ? 'Gabung Data Tempahan (2024–2026)' : 'Load Orders (2024 - 2026)'}
              </h3>
              <p className="text-xs text-subtext leading-relaxed">
                {appLanguage === 'ms'
                  ? 'Muat dan gabungkan data tempahan daripada Google Sheets bagi tahun 2024–2026.'
                  : 'Fetch and compile records across Google Sheets spreadsheets for the years 2024–2026'}
              </p>
            </div>
          </div>
          <button
            onClick={fetchThreeYearCloudDatabase}
            disabled={fetchingCloud}
            className={cn(
              "shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer",
              hasLoadedCloud 
                ? "bg-indigo-55 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200" 
                : "bg-indigo-650 bg-[#4338CA]/10 text-indigo-600 hover:bg-[#4338CA]/10 border border-[#4338CA]/30 dark:bg-indigo-500/20 dark:text-indigo-400"
            )}
          >
            {fetchingCloud ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{appLanguage === 'ms' ? 'Memuat turun...' : 'Downloading...'}</span>
              </>
            ) : hasLoadedCloud ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{appLanguage === 'ms' ? 'Segarkan Semula' : 'Refresh Records'}</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{appLanguage === 'ms' ? 'Muat Semula Rekod' : 'Load Records'}</span>
              </>
            )}
          </button>
        </div>

        {fetchingCloud && (
          <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 p-3 rounded-xl flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300">
            <span className="font-semibold flex items-center gap-1.5 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              {cloudFetchProgress}
            </span>
          </div>
        )}

        {hasLoadedCloud && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-surface p-3 rounded-2xl border border-gray-100/50 dark:border-gray-800 text-center">
              <span className="block text-[10px] uppercase font-black tracking-wider text-subtext">Local Registers</span>
              <span className="block text-xl font-black text-text mt-1">{history.length}</span>
            </div>
            <div className="bg-surface p-3 rounded-2xl border border-gray-100/50 dark:border-gray-800 text-center">
              <span className="block text-[10px] uppercase font-black tracking-wider text-subtext">Cloud Records</span>
              <span className="block text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{cloudOrders.length}</span>
            </div>
            <div className="bg-surface p-3 rounded-2xl border border-gray-100/50 dark:border-gray-800 text-center">
              <span className="block text-[10px] uppercase font-black tracking-wider text-subtext">Synthesized Contacts</span>
              <span className="block text-xl font-black text-text mt-1">{contacts.length}</span>
            </div>
            <div className="bg-surface p-3 rounded-2xl border border-gray-100/50 dark:border-gray-800 text-center flex items-center justify-center">
              <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                {appLanguage === 'ms' ? 'Rekod Dimuat' : 'Records Loaded'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Customers List Layout */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-4 sm:p-5 border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
        {/* Filter and Search actions bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtext">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder={appLanguage === 'ms' ? 'Cari nama atau nombor telefon...' : 'Search customer name or phone...'}
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
              className="w-full bg-surface text-text pl-10 pr-4 py-2.5 rounded-2xl text-xs font-medium border border-gray-100 dark:border-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-subtext/60"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              disabled={filteredContacts.length === 0}
              className="flex items-center justify-center gap-1.5 bg-surface text-text border border-gray-100 dark:border-gray-800 px-3 py-2.5 rounded-2.5 rounded-2xl font-bold text-xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {selectedPhones.size === filteredContacts.length && filteredContacts.length > 0 ? (
                <>
                  <CheckSquare className="w-4 h-4 text-primary" />
                  <span>{appLanguage === 'ms' ? 'Nyahpilih Semua' : 'Deselect All'}</span>
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 text-subtext" />
                  <span>{appLanguage === 'ms' ? 'Pilih Semua' : 'Select All'}</span>
                </>
              )}
            </button>

            <button
              onClick={handleExportCSV}
              disabled={selectedPhones.size === 0 || isExporting}
              className="flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-hover disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-subtext text-white px-4 py-2.5 rounded-2xl font-bold text-xs shadow-md disabled:shadow-none active:scale-95 transition-all cursor-pointer"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>
                {appLanguage === 'ms' 
                  ? `Download CSV (${selectedPhones.size})` 
                  : `Download CSV (${selectedPhones.size})`}
              </span>
            </button>
          </div>
        </div>

        {/* Sync logs summary banner */}
        <div className="max-h-[120px] overflow-y-auto bg-surface/50 border border-gray-100 dark:border-gray-800 rounded-2xl p-3 space-y-1.5 custom-scrollbar">
          {syncLogs.length === 0 ? (
            <p className="text-[10px] text-subtext italic">
              {appLanguage === 'ms' ? 'Tiada aktiviti dikesan.' : 'No recent activity.'}
            </p>
          ) : (
            syncLogs.map((log, idx) => (
              <p key={idx} className="text-[10px] text-text border-l-2 border-primary/20 pl-2 leading-relaxed">
                {log}
              </p>
            )).reverse()
          )}
        </div>

        {/* Contacts Grid/Table List */}
        <div className="border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
          {filteredContacts.length === 0 ? (
            <div className="p-10 text-center flex flex-col items-center justify-center space-y-2">
              <Users className="w-10 h-10 text-subtext opacity-40" />
              <p className="text-xs font-bold text-text">
                {appLanguage === 'ms' ? 'Tiada Pelanggan Dijumpai' : 'No Customers Found'}
              </p>
              <p className="text-[10px] text-subtext">
                {appLanguage === 'ms' 
                  ? 'Sila masukkan pesanan terlebih dahulu di bahagian utama.' 
                  : 'Start making orders first to populate available client histories.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[460px] overflow-y-auto">
              {filteredContacts.map((contact) => {
                const isSelected = selectedPhones.has(contact.phone);
                
                return (
                  <div 
                    key={contact.phone}
                    className={cn(
                      "p-3.5 flex items-center justify-between gap-3 transition-colors",
                      isSelected ? "bg-primary/5" : "hover:bg-surface/40"
                    )}
                  >
                    {/* Left Checkbox & Names block */}
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <button
                        onClick={() => toggleSelect(contact.phone)}
                        className="p-1 rounded-lg text-subtext hover:bg-gray-200/50 dark:hover:bg-gray-800/50 shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-primary" />
                        ) : (
                          <Square className="w-5 h-5 opacity-60 text-subtext" />
                        )}
                      </button>

                      <div className="min-w-0 pr-2">
                        {/* Final Custom Format Name */}
                        <div className="flex items-center space-x-2">
                          <span className="text-xs sm:text-sm font-black text-text tracking-tight shrink-0">
                            {contact.formattedName}
                          </span>
                          {contact.timesOrdered > 1 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary shrink-0">
                              {contact.timesOrdered}x
                            </span>
                          )}
                        </div>
                        {/* Sub names description */}
                        <div className="flex items-center space-x-2.5 text-[10px] text-subtext mt-0.5 truncate gap-1 flex-wrap">
                          <span className="truncate max-w-[120px] sm:max-w-none">
                            {appLanguage === 'ms' ? `Asal: ${contact.originalName}` : `Orig: ${contact.originalName}`}
                          </span>
                          <span className="text-gray-300 dark:text-gray-700 font-extralight">|</span>
                          <span className="flex items-center gap-1 shrink-0">
                            <Phone className="w-2.5 h-2.5 opacity-75" />
                            {contact.phone}
                          </span>
                          <span className="text-gray-300 dark:text-gray-700 font-extralight hidden sm:inline">|</span>
                          <span className="items-center gap-1 text-[10px] text-[#A3A3A3] hidden sm:flex shrink-0">
                            <Clock className="w-2.5 h-2.5 opacity-60" />
                            {new Date(contact.oldestTimestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right Interactive Sync State Block */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        onClick={() => handleExportIndividual(contact)}
                        className="flex items-center justify-center space-x-1 text-xs font-black tracking-tight text-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/20 active:scale-95 transition-all cursor-pointer bg-white"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">CSV</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sync Action Log Terminal */}
      {syncLogs.length > 0 && (
        <div className="bg-[#1C1C1E] dark:bg-black rounded-3xl p-4 border border-gray-800 shadow-lg space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {appLanguage === 'ms' ? 'Log Proses Eksport' : 'Export Process Logs'}
            </span>
            <button
              onClick={() => setSyncLogs([])}
              className="text-[10px] font-bold text-gray-500 hover:text-gray-400 border border-gray-800 px-2 py-0.5 rounded-lg active:scale-95 transition-all"
            >
              {appLanguage === 'ms' ? 'Padam' : 'Clear'}
            </button>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto font-mono text-[10px] text-gray-300 leading-relaxed pr-1">
            {syncLogs.map((log, idx) => (
              <div key={idx} className="flex gap-1.5 hover:bg-gray-900/40 p-0.5 rounded">
                <span className="text-gray-600 shrink-0 select-none">[{idx + 1}]</span>
                <span className="whitespace-pre-wrap">{log}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
