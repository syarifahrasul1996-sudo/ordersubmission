import React, { useState, useEffect, useMemo } from 'react';
import { parseDateStringToTimestamp } from '../utils';
import { 
  Users, 
  LogIn, 
  LogOut, 
  RefreshCw, 
  Search, 
  Check, 
  AlertTriangle, 
  CheckSquare, 
  Square, 
  Loader2, 
  CheckCircle2, 
  Phone, 
  UserPlus, 
  Clock, 
  ExternalLink,
  Smartphone,
  Database
} from 'lucide-react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { useAppContext } from '../AppContext';
import { googleSignIn, logout, getAccessToken, handleRedirectResult } from '../auth';
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

export function ContactsSyncView() {
  const { state, history, appLanguage } = useAppContext();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

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

  // 1. Observe firebase authentication & store local Google access token
  useEffect(() => {
    const authInstance = getAuth();
    const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
      setCurrentUser(user);
      if (user) {
        const token = await getAccessToken();
        setAccessToken(token);
      } else {
        setAccessToken(null);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // 1.5 Handle redirect result
  useEffect(() => {
    const init = async () => {
      try {
        const res = await handleRedirectResult();
        if (res) {
          setCurrentUser(res.user);
          setAccessToken(res.accessToken);
          setSyncLogs(prev => [...prev, appLanguage === 'ms' ? 'Berjaya bersambung dengan Google API' : 'Successfully connected with Google API']);
        }
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoadingAuth(false);
      }
    };
    init();
  }, [appLanguage]);

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
        const script = document.createElement('script');
        script.src = url.toString();
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

        script.onerror = () => {
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
          const callbackName = 'jsonp_contacts_' + Math.round(100000 * Math.random()) + '_' + sheet.year;
          const url = new URL(sUrl);

          url.searchParams.append('action', 'get_dashboard_orders');
          url.searchParams.append('spreadsheetId', sId);
          url.searchParams.append('year', sheet.year);
          url.searchParams.append('callback', callbackName);

          setCloudFetchProgress(prev => 
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
        const words = rawName.split(/\s+/).filter(Boolean);
        const twoWords = words.slice(0, 2).join(' ');
        const finalName = twoWords || 'Pelanggan';
        const formattedName = `Cust ${finalName}`;

        contactsMap.set(cleanPhone, {
          phone: rawPhone,
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

  // Handle Google Login / Scope Request
  const handleConnect = async () => {
    try {
      setLoadingAuth(true);
      const res = await googleSignIn();
      if (res) {
        setCurrentUser(res.user);
        setAccessToken(res.accessToken);
        setSyncLogs(prev => [...prev, appLanguage === 'ms' ? 'Berjaya bersambung dengan Google API' : 'Successfully connected with Google API']);
      }
    } catch (err: any) {
      console.error(err);
      setSyncLogs(prev => [...prev, `${appLanguage === 'ms' ? 'Gagal menyambung' : 'Connection failed'}: ${err.message}`]);
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setLoadingAuth(true);
      await logout();
      setCurrentUser(null);
      setAccessToken(null);
      setSyncLogs(prev => [...prev, appLanguage === 'ms' ? 'Telah memutuskan sambungan Google' : 'Google Account disconnected']);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingAuth(false);
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

  // Google Contacts synchronization helper (checks for duplicates, overwrites different names, or creates new)
  const syncSingleContact = async (
    contact: ContactItem, 
    tokenToUse: string
  ): Promise<{ action: 'created' | 'updated' | 'unchanged'; resourceName: string; prevName?: string }> => {
    let existingContact: { resourceName: string; etag: string; currentName: string } | null = null;
    
    // 1. Check for existing contact via searchContacts
    try {
      const searchUrl = `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(contact.phone)}&readMask=names,phoneNumbers`;
      const sResponse = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${tokenToUse}`
        }
      });
      
      if (sResponse.ok) {
        const sData = await sResponse.json();
        const results = sData.results || [];
        for (const res of results) {
          const person = res.person;
          if (!person) continue;
          
          const match = (person.phoneNumbers || []).some((pn: any) => isPhoneMatch(pn.value, contact.phone));
          if (match) {
            const names = person.names || [];
            const displayName = names[0]?.displayName || names[0]?.givenName || '';
            existingContact = {
              resourceName: person.resourceName,
              etag: person.etag,
              currentName: displayName
            };
            break;
          }
        }
      }
    } catch (e) {
      console.warn('Google People searchContacts failed, attempting listConnections fallback:', e);
    }

    // 2. Fallback to listConnections if no exact match from search yet
    if (!existingContact) {
      try {
        const listUrl = `https://people.googleapis.com/v1/people/me/connections?pageSize=150&personFields=names,phoneNumbers`;
        const lResponse = await fetch(listUrl, {
          headers: {
            'Authorization': `Bearer ${tokenToUse}`
          }
        });
        if (lResponse.ok) {
          const lData = await lResponse.json();
          const connections = lData.connections || [];
          for (const person of connections) {
            const match = (person.phoneNumbers || []).some((pn: any) => isPhoneMatch(pn.value, contact.phone));
            if (match) {
              const names = person.names || [];
              const displayName = names[0]?.displayName || names[0]?.givenName || '';
              existingContact = {
                resourceName: person.resourceName,
                etag: person.etag,
                currentName: displayName
              };
              break;
            }
          }
        }
      } catch (e) {
        console.warn('Google People listConnections fallback failed:', e);
      }
    }

    // 3. Process search results: Overwrite name if matching number exists with different name, else create
    if (existingContact) {
      const { resourceName, etag, currentName } = existingContact;
      
      if (currentName.trim() !== contact.formattedName.trim()) {
        const updateUrl = `https://people.googleapis.com/v1/${resourceName}:updateContact?updatePersonFields=names`;
        const payload = {
          etag,
          names: [{
            givenName: contact.formattedName
          }]
        };

        const uResponse = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${tokenToUse}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!uResponse.ok) {
          const errData = await uResponse.json().catch(() => ({}));
          const msg = errData?.error?.message || `Status Code ${uResponse.status}`;
          throw new Error(`Failed to overwrite pre-existing contact from "${currentName}" to "${contact.formattedName}": ${msg}`);
        }

        return { action: 'updated', resourceName, prevName: currentName };
      } else {
        // Already matching oldest name record
        return { action: 'unchanged', resourceName };
      }
    } else {
      // Create new contact
      const createUrl = 'https://people.googleapis.com/v1/people:createContact';
      const payload = {
        names: [{
          givenName: contact.formattedName
        }],
        phoneNumbers: [{
          value: contact.phone,
          type: 'mobile'
        }]
      };

      const cResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenToUse}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!cResponse.ok) {
        const errData = await cResponse.json().catch(() => ({}));
        const msg = errData?.error?.message || `Status Code ${cResponse.status}`;
        throw new Error(msg);
      }

      const cData = await cResponse.json();
      return { action: 'created', resourceName: cData.resourceName || 'success' };
    }
  };

  // Action: Synchronize selected contacts
  const handleSyncSelected = async () => {
    const token = await getAccessToken() || accessToken;
    if (!token) {
      setSyncLogs(prev => [...prev, appLanguage === 'ms' ? 'Ralat: Sila hubungkan Google Account terlebih dahulu.' : 'Error: Please connect your Google Account first.']);
      return;
    }

    const targets = contacts.filter(c => selectedPhones.has(c.phone));
    if (targets.length === 0) return;

    setIsSyncingAll(true);
    setSyncLogs(prev => [...prev, appLanguage === 'ms' ? `Memproses ${targets.length} kenalan...` : `Syncing ${targets.length} contacts...`]);

    for (const target of targets) {
      // Set single contact to syncing status
      setContacts(prev => prev.map(c => c.phone === target.phone ? { ...c, status: 'syncing' } : c));

      try {
        const result = await syncSingleContact(target, token);
        setContacts(prev => prev.map(c => c.phone === target.phone ? { ...c, status: 'success' } : c));
        
        if (result.action === 'updated') {
          const logMsg = appLanguage === 'ms'
            ? `✏️ Dikemas kini: Nama terlama "${target.formattedName}" telah menggantikan "${result.prevName}" bagi no ${target.phone}`
            : `✏️ Overwritten: "${target.formattedName}" has replaced "${result.prevName}" for phone ${target.phone}`;
          setSyncLogs(prev => [...prev, logMsg]);
        } else if (result.action === 'unchanged') {
          const logMsg = appLanguage === 'ms'
            ? `ℹ️ Tiada perubahan: Nama "${target.formattedName}" (${target.phone}) sudah sepadan`
            : `ℹ️ Unchanged: Name "${target.formattedName}" (${target.phone}) is already matching oldest configuration`;
          setSyncLogs(prev => [...prev, logMsg]);
        } else {
          const logMsg = appLanguage === 'ms'
            ? `✅ Baharu: Kenalan "${target.formattedName}" (${target.phone}) berjaya disimpan`
            : `✅ Newly created: Contact "${target.formattedName}" (${target.phone}) saved successfully`;
          setSyncLogs(prev => [...prev, logMsg]);
        }
      } catch (err: any) {
        console.error(`Sync error for ${target.phone}:`, err);
        setContacts(prev => prev.map(c => c.phone === target.phone ? { ...c, status: 'failed', error: err.message } : c));
        setSyncLogs(prev => [...prev, `❌ ${target.formattedName} (${target.phone}) ${appLanguage === 'ms' ? 'gagal' : 'failed'}: ${err.message}`]);
      }
    }

    setIsSyncingAll(false);
  };

  // Action: Synchronize an individual contact immediately
  const handleSyncIndividual = async (target: ContactItem) => {
    const token = await getAccessToken() || accessToken;
    if (!token) {
      setSyncLogs(prev => [...prev, appLanguage === 'ms' ? 'Ralat: Sila hubungkan Google Account' : 'Error: Connect Google Account first']);
      return;
    }

    setContacts(prev => prev.map(c => c.phone === target.phone ? { ...c, status: 'syncing', error: undefined } : c));

    try {
      const result = await syncSingleContact(target, token);
      setContacts(prev => prev.map(c => c.phone === target.phone ? { ...c, status: 'success' } : c));
      
      if (result.action === 'updated') {
        const logMsg = appLanguage === 'ms'
          ? `✏️ Dikemas kini: Nama terlama "${target.formattedName}" telah menggantikan "${result.prevName}" bagi no ${target.phone}`
          : `✏️ Overwritten: "${target.formattedName}" has replaced "${result.prevName}" for phone ${target.phone}`;
        setSyncLogs(prev => [...prev, logMsg]);
      } else if (result.action === 'unchanged') {
        const logMsg = appLanguage === 'ms'
          ? `ℹ️ Tiada perubahan: Nama "${target.formattedName}" (${target.phone}) sudah sepadan`
          : `ℹ️ Unchanged: Name "${target.formattedName}" (${target.phone}) is already matching oldest configuration`;
        setSyncLogs(prev => [...prev, logMsg]);
      } else {
        const logMsg = appLanguage === 'ms'
          ? `✅ Baharu: Kenalan "${target.formattedName}" (${target.phone}) berjaya disimpan`
          : `✅ Newly created: Contact "${target.formattedName}" (${target.phone}) saved successfully`;
        setSyncLogs(prev => [...prev, logMsg]);
      }
    } catch (err: any) {
      console.error(err);
      setContacts(prev => prev.map(c => c.phone === target.phone ? { ...c, status: 'failed', error: err.message } : c));
      setSyncLogs(prev => [...prev, `❌ ${target.formattedName} (${target.phone}) ${appLanguage === 'ms' ? 'gagal' : 'failed'}: ${err.message}`]);
    }
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
          <Users className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-text">
            {appLanguage === 'ms' ? 'Simpan Kenalan ke Google Contacts' : 'Google Contacts Sync'}
          </h2>
          <p className="text-xs text-subtext leading-relaxed">
            {appLanguage === 'ms' 
               ? 'Semua nombor pelanggan akan disimpan dan dikemas kini secara automatik dalam Google Contacts.'
              : 'All customer phone numbers will be automatically saved and updated in Google Contacts.'}
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
                {appLanguage === 'ms' ? 'Gabung Data Tempahan (2024–2026)' : 'Database Sync (2024 - 2026)'}
              </h3>
              <p className="text-[11px] text-subtext leading-relaxed">
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
                <span>{appLanguage === 'ms' ? 'Segarkan Semula' : 'Refetch Database'}</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{appLanguage === 'ms' ? 'Muat Semula Database' : 'Sync Database'}</span>
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
              <span className="block text-[10px] uppercase font-black tracking-wider text-subtext">Cloud Registers</span>
              <span className="block text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{cloudOrders.length}</span>
            </div>
            <div className="bg-surface p-3 rounded-2xl border border-gray-100/50 dark:border-gray-800 text-center">
              <span className="block text-[10px] uppercase font-black tracking-wider text-subtext">Synthesized Contacts</span>
              <span className="block text-xl font-black text-text mt-1">{contacts.length}</span>
            </div>
            <div className="bg-surface p-3 rounded-2xl border border-gray-100/50 dark:border-gray-800 text-center flex items-center justify-center">
              <span className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                {appLanguage === 'ms' ? 'Database Dimuat' : 'Database Loaded'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Connection & Auth Controller Card */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-subtext flex items-center gap-2">
          <Smartphone className="w-3.5 h-3.5 text-primary" />
          {appLanguage === 'ms' ? 'Sambungan Google' : 'Google Connection Status'}
        </h3>

        {loadingAuth ? (
          <div className="flex items-center space-x-2.5 py-2">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <span className="text-xs text-subtext">{appLanguage === 'ms' ? 'Menyemak sambungan Google...' : 'Checking Google Authorization...'}</span>
          </div>
        ) : currentUser && accessToken ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3.5 rounded-2xl border border-gray-100/50 dark:border-gray-800">
            <div className="flex items-center space-x-3">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL || ''} alt="Google Pic" className="w-9 h-9 rounded-full object-cover border border-primary/20 shadow-sm" />
              ) : (
                <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center font-bold text-primary text-sm">
                  {currentUser.displayName ? currentUser.displayName[0] : 'U'}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-xs font-bold text-text truncate max-w-[200px]">{currentUser.displayName || 'Authorized User'}</span>
                <span className="text-[10px] text-subtext truncate max-w-[200px]">{currentUser.email || 'No email'}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                {appLanguage === 'ms' ? 'Bersambung' : 'Connected'}
              </span>
              <button
                onClick={handleDisconnect}
                className="flex items-center space-x-1 hover:bg-red-50 text-red-500 hover:text-red-600 px-3 py-1.5 rounded-xl font-bold text-[11px] transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{appLanguage === 'ms' ? 'Keluar' : 'Disconnect'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl space-y-3 bg-surface/50">
            <UserPlus className="w-9 h-9 text-subtext opacity-60" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-text">{appLanguage === 'ms' ? 'Akaun Google Tidak Terhubung' : 'Google Account Disconnected'}</p>
              <p className="text-[10px] text-subtext max-w-sm leading-relaxed">
                {appLanguage === 'ms' 
                  ? 'Sila hubungkan akaun Google anda terlebih dahulu untuk memberikan akses menyimpan senarai kenalan ke telefon atau Google Contacts.' 
                  : 'Establish a secure credentials connection with Google to automate adding customized client names directly into your phone database.'}
              </p>
            </div>
            <button
              onClick={handleConnect}
              className="flex items-center space-x-2 bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-2xl font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{appLanguage === 'ms' ? 'Hubungkan Google Contacts' : 'Login with Google'}</span>
            </button>
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
              onClick={handleSyncSelected}
              disabled={selectedPhones.size === 0 || !currentUser || isSyncingAll}
              className="flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-hover disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-subtext text-white px-4 py-2.5 rounded-2xl font-bold text-xs shadow-md disabled:shadow-none active:scale-95 transition-all cursor-pointer"
            >
              {isSyncingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              <span>
                {appLanguage === 'ms' 
                  ? `Simpan Ke Google (${selectedPhones.size})` 
                  : `Sync Contacts (${selectedPhones.size})`}
              </span>
            </button>
          </div>
        </div>

        {/* Selected contacts warning banner */}
        {!currentUser && selectedPhones.size > 0 && (
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 text-[10px] md:text-xs flex items-center gap-2 font-medium border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{appLanguage === 'ms' ? 'Sila sambung Google Contacts untuk membolehkan butang Sinkronisasi berfungsi.' : 'Connect to Google Contacts first to enable direct account synchronization.'}</span>
          </div>
        )}

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
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-primary/10 text-primary shrink-0">
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
                          <span className="items-center gap-1 text-[9px] text-[#A3A3A3] hidden sm:flex shrink-0">
                            <Clock className="w-2.5 h-2.5 opacity-60" />
                            {new Date(contact.oldestTimestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right Interactive Sync State Block */}
                    <div className="flex items-center space-x-2 shrink-0">
                      {/* Individual Sync Badge/Action */}
                      {contact.status === 'syncing' ? (
                        <span className="flex items-center space-x-1.5 text-[10px] text-primary bg-primary/10 px-2.5 py-1 rounded-full font-bold">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>{appLanguage === 'ms' ? 'Menyimpan...' : 'Saving...'}</span>
                        </span>
                      ) : contact.status === 'success' ? (
                        <span className="flex items-center space-x-1 text-[10px] text-emerald-800 bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 px-2.5 py-1 rounded-full font-bold">
                          <Check className="w-3.5 h-3.5" />
                          <span>{appLanguage === 'ms' ? 'Berjaya' : 'Synced'}</span>
                        </span>
                      ) : contact.status === 'failed' ? (
                        <div className="flex items-center space-x-1">
                          <span 
                            title={contact.error}
                            className="flex items-center space-x-1 text-[10px] text-red-800 bg-red-100 dark:bg-red-950/40 dark:text-red-300 px-2.5 py-1 rounded-full font-bold cursor-help"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{appLanguage === 'ms' ? 'Gagal' : 'Failed'}</span>
                          </span>
                          <button
                            onClick={() => handleSyncIndividual(contact)}
                            disabled={!currentUser}
                            className="p-1 rounded bg-surface hover:bg-gray-200 text-text active:scale-95 disabled:opacity-40 transition-all border border-gray-100"
                            title={appLanguage === 'ms' ? 'Cuba semula' : 'Retry'}
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSyncIndividual(contact)}
                          disabled={!currentUser}
                          className="flex items-center justify-center space-x-1 text-[11px] font-black tracking-tight text-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/20 active:scale-95 disabled:opacity-40 transition-all cursor-pointer bg-white"
                        >
                          <UserPlus className="w-3 h-3 text-primary" />
                          <span>{appLanguage === 'ms' ? 'Simpan' : 'Sync'}</span>
                        </button>
                      )}
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
              {appLanguage === 'ms' ? 'Log Proses Sinkronisasi' : 'Process Sync Logs'}
            </span>
            <button
              onClick={() => setSyncLogs([])}
              className="text-[9px] font-bold text-gray-500 hover:text-gray-400 border border-gray-800 px-2 py-0.5 rounded-lg active:scale-95 transition-all"
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
