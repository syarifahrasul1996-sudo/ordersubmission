import React, { useEffect, useState } from 'react';
import { Clock, Trash2, Calendar, AlertCircle, RefreshCcw, Save, Bell, Check, Search, Database, Phone, Settings, ChevronDown, ChevronUp, Link, X } from 'lucide-react';
import { useAppContext } from '../AppContext';

const GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec';

const formatCustomerName = (name?: string) => {
  if (!name) return '';
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const getRelativeDayDetails = (orderTime: number, appLanguage: string) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const orderDate = new Date(orderTime);
  orderDate.setHours(0, 0, 0, 0);
  
  const diffTime = orderDate.getTime() - now.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return {
      text: appLanguage === 'ms' ? 'HARI INI' : 'TODAY',
      className: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50'
    };
  } else if (diffDays === 1) {
    return {
      text: appLanguage === 'ms' ? 'ESOK' : 'TOMORROW',
      className: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50'
    };
  } else if (diffDays === 2) {
    return {
      text: appLanguage === 'ms' ? '2 HARI LAGI' : 'IN 2 DAYS',
      className: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50'
    };
  } else if (diffDays === 3) {
    return {
      text: appLanguage === 'ms' ? '3 HARI LAGI' : 'IN 3 DAYS',
      className: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50'
    };
  } else if (diffDays === -1) {
    return {
      text: appLanguage === 'ms' ? 'SEMALAM' : 'YESTERDAY',
      className: 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border border-gray-200 dark:border-gray-800'
    };
  } else if (diffDays === -2) {
    return {
      text: appLanguage === 'ms' ? '2 HARI LEPAS' : '2 DAYS AGO',
      className: 'bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
    };
  }
  return null;
};

export function HistoryView() {
  const {
    state,
    history,
    setHistory,
    clearHistory,
    deleteOrderFromHistory,
    loadOrder,
    pushView,
    appLanguage,
    updateSpecificHistoryItem,
    updateOrderHistoryState
  } = useAppContext();
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [showConfirm, setShowConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'delivered' | 'pending'>('all');
  const [activeTab, setActiveTab] = useState<'local' | 'remote'>('local');
  const [searchQuery, setSearchQuery] = useState('');
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [showDbSettings, setShowDbSettings] = useState(false);
  const [globalScriptUrl, setGlobalScriptUrl] = useState<string>(() => {
    return localStorage.getItem('db_global_script_url') || GOOGLE_SCRIPT_URL;
  });
  useEffect(() => {
  const timer = window.setInterval(() => {
    setCurrentTime(Date.now());
  }, 60 * 1000);

  return () => {
    window.clearInterval(timer);
  };
}, []);

  const [annualSheets, setAnnualSheets] = useState<{ year: string; spreadsheetId: string; scriptUrl: string }[]>(() => {
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

  const extractId = (input: string) => {
    const trimmed = input.trim();
    if (trimmed.includes('docs.google.com/spreadsheets/d/')) {
      const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
      return match ? match[1] : trimmed;
    }
    return trimmed;
  };
const parseDueTimestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return 0;
  }

  const due = value.trim();

  const match = due.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+at\s+|\s+)(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i
  );

  if (match) {
    const [, day, month, year, rawHour, minute, period] = match;

    let hour = Number(rawHour);

    if (period?.toUpperCase() === 'PM' && hour !== 12) {
      hour += 12;
    }

    if (period?.toUpperCase() === 'AM' && hour === 12) {
      hour = 0;
    }

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      hour,
      Number(minute),
      0,
      0
    ).getTime();
  }

  const nativeTimestamp = Date.parse(
    due.replace(/\s+at\s+/i, ' ')
  );

  return Number.isNaN(nativeTimestamp) ? 0 : nativeTimestamp;
};

  const getActiveScriptUrl = (sId?: string) => {
    return globalScriptUrl.trim() || GOOGLE_SCRIPT_URL;
  };

  const jsonpRequest = (url: URL, callbackName: string) => {
    return new Promise<any>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url.toString();
      script.async = true;

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Request timed out'));
      }, 15000);

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
        console.warn('JSONP failed URL:', url.toString());
        cleanup();
        reject(new Error('Failed to update'));
      };

      document.body.appendChild(script);
    });
  };

  const handleSyncLink = async (e: React.MouseEvent, item: any) => {
    e.preventDefault();
    e.stopPropagation();

    const spreadsheetId = item.state?.spreadsheetId || state.spreadsheetId;

    if (!item.state?.orderId || !spreadsheetId) {
      alert(appLanguage === 'ms' ? 'Kekurangan Order ID atau Spreadsheet ID.' : 'Missing Order ID or Spreadsheet ID.');
      return;
    }

    setSyncingId(item.id);

    try {
      const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
      const url = new URL(getActiveScriptUrl(spreadsheetId));

      url.searchParams.append('action', 'get_link');
      url.searchParams.append('orderId', item.state.orderId);
      url.searchParams.append('spreadsheetId', spreadsheetId);
      url.searchParams.append('callback', callbackName);

      const data = await jsonpRequest(url, callbackName);

      if (data.status === 'success' && data.link) {
        updateSpecificHistoryItem(item.id, {
          googleSheetLink: data.link,
          spreadsheetId
        });
        alert(appLanguage === 'ms' ? 'Pautan berjaya dikemaskini!' : 'Link successfully updated!');
      } else if (data.status === 'success') {
        alert(appLanguage === 'ms' ? 'Tiada pautan dijumpai dalam rekod Google Sheet.' : 'No link found in the Google Sheet record.');
      } else {
        alert('Error: ' + (data.message || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to sync link: ' + String(err));
    } finally {
      setSyncingId(null);
    }
  };

  const handleDeliveredToggle = async (
    e: React.MouseEvent,
    item: any,
    currentStatus: boolean
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const spreadsheetId = item.state?.spreadsheetId || state.spreadsheetId;
    const orderId = item.state?.orderId;
    const newStatus = !currentStatus;

    // 1. Instantly update local state for perfect responsiveness and offline action
    updateSpecificHistoryItem(item.id, {
      isDelivered: newStatus,
      hasNotified: false,
      ...(spreadsheetId ? { spreadsheetId } : {})
    });

    // 2. If spreadsheetId and orderId are configured, gently sync update with Google Sheets in background
    if (spreadsheetId && orderId) {
      try {
        const callbackName = 'jsonp_callback_delivered_' + Math.round(Math.random() * 100000);
        const url = new URL(getActiveScriptUrl(spreadsheetId));

        url.searchParams.append('action', 'update_delivered');
        url.searchParams.append('spreadsheetId', spreadsheetId);
        url.searchParams.append('orderId', orderId);
        url.searchParams.append('isDelivered', String(newStatus));
        url.searchParams.append('callback', callbackName);

        const result = await jsonpRequest(url, callbackName);
        if (result.status !== 'success') {
          console.warn('Synced status check warning:', result.message || 'Update failed');
        }
      } catch (err) {
        console.warn('Failed to sync delivered status update in background:', err);
      }
    }
  };

  const handleGlobalSync = async () => {
    // Collect all active annual sheets
    const activeConfigs = annualSheets.filter(
      sheet => sheet.spreadsheetId && sheet.spreadsheetId.trim() !== ''
    );

    if (activeConfigs.length === 0) {
      alert(
        appLanguage === 'ms'
          ? 'Sila konfigurasikan sekurang-kurangnya satu spreadsheet ID di bahagian Tetapan Database terlebih dahulu.'
          : 'Please configure at least one spreadsheet ID in Database Settings first.'
      );
      return;
    }

    setRefreshing(true);

    try {
      const currentNow = Date.now();
      let totalNewCou = 0;
      let totalUpdCou = 0;
      let existingHistory = [...history];

      // Perform JSONP sync_recent requests across all active yearly sheets
      const fetchPromises = activeConfigs.map(async (sheet) => {
        const rawId = sheet.spreadsheetId.trim();
        const sId = extractId(rawId);
        const sUrl = sheet.scriptUrl.trim() || GOOGLE_SCRIPT_URL;

        const callbackName = 'jsonp_callback_sync_' + Math.round(100000 * Math.random()) + '_' + sheet.year;
        const url = new URL(sUrl);

        url.searchParams.append('action', 'sync_recent');
        url.searchParams.append('spreadsheetId', sId);
        url.searchParams.append('callback', callbackName);

        try {
          const data = await jsonpRequest(url, callbackName);
          if (data && data.status === 'success' && Array.isArray(data.orders)) {
            return { year: sheet.year, orders: data.orders, spreadsheetId: sId };
          }
        } catch (e) {
          console.error(`Sync failed for year ${sheet.year}:`, e);
        }
        return { year: sheet.year, orders: [], spreadsheetId: sId };
      });

      const results = await Promise.all(fetchPromises);

      for (const res of results) {
        for (const orderData of res.orders) {
          const generatedOrderId =
            orderData.orderId ||
            `SYNC-${orderData.name || 'UNKNOWN'}-${orderData.phone || ''}-${orderData.due || ''}`
              .replace(/\s+/g, '-')
              .replace(/[^a-zA-Z0-9-]/g, '');

          const existingIdx = existingHistory.findIndex(
            h => h.state?.orderId === generatedOrderId
          );

         const dueTs = parseDueTimestamp(orderData.due);

          const newState = {
            isDelivered: !!orderData.isDelivered,
            spreadsheetId: res.spreadsheetId,
            customerName: orderData.name,
            customerPhone: orderData.phone,
            customerOrder: orderData.order,
            template: orderData.template,
            customerTemplate: orderData.template,
            customerBahasa: orderData.bahasa,
            customerAddOn: orderData.addon,
            customerJenis: orderData.jenis,
            customerDue: orderData.due,
            orderLink: orderData.link,
            googleSheetLink: orderData.link,
            orderId: generatedOrderId,
            dueTimestamp: dueTs,
            mainType:
              orderData.order === 'Resume'
                ? 'Resume'
                : orderData.order === 'Surat'
                ? 'Surat'
                : orderData.order || 'Lain-lain',
            subType: ''
          };

          if (existingIdx !== -1) {
            existingHistory[existingIdx] = {
              ...existingHistory[existingIdx],
              state: {
                ...existingHistory[existingIdx].state,
                ...newState
              }
            };
            totalUpdCou++;
          } else {
            existingHistory.push({
              id: 'synced_' + Math.random().toString(36).substr(2, 9),
              timestamp: currentNow,
              state: newState,
              messages: []
            });
            totalNewCou++;
          }
        }
      }

      setHistory(existingHistory);

      alert(
        appLanguage === 'ms'
          ? `Berjaya disync daripada ${activeConfigs.length} database tahunan!\nBaru: ${totalNewCou}\nDikemaskini: ${totalUpdCou}`
          : `Aggregated sync complete across ${activeConfigs.length} annual sheets!\nNew: ${totalNewCou}\nUpdated: ${totalUpdCou}`
      );
    } catch (e) {
      alert('Sync failed: ' + e);
    } finally {
      setRefreshing(false);
      setPullProgress(0);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0) {
      setStartY(e.touches[0].clientY);
      setIsPulling(true);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || refreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;

    if (diff > 0) {
      setPullProgress(Math.min(diff * 0.5, 80));
    } else {
      setPullProgress(0);
    }
  };

  const onTouchEnd = () => {
    if (!isPulling) return;
    setIsPulling(false);

    if (pullProgress >= 60) {
      handleGlobalSync();
    }
  };

  const handleClearConfirm = () => {
    clearHistory();
    setShowConfirm(false);
  };

  const handleRemoteSearch = async () => {
    const activeConfigs = annualSheets.filter(s => s.spreadsheetId.trim() !== '');

    if (activeConfigs.length === 0) {
      alert(
        appLanguage === 'ms'
          ? 'Sila tetapkan sekurang-kurangnya satu Spreadsheet ID/Pautan di dalam Tetapan sebelum mencari.'
          : 'Please set at least one Spreadsheet ID/Link in settings before searching.'
      );
      setShowDbSettings(true);
      return;
    }

    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    setSearchError('');
    setRemoteResults([]);

    const allMatchedOrders: any[] = [];
    const errors: string[] = [];

    const extractId = (input: string) => {
      const trimmed = input.trim();
      if (trimmed.includes('docs.google.com/spreadsheets/d/')) {
        const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
        return match ? match[1] : trimmed;
      }
      return trimmed;
    };

    try {
      await Promise.all(
        activeConfigs.map(async (sheet) => {
          try {
            const sId = extractId(sheet.spreadsheetId);
            const sUrl = sheet.scriptUrl.trim() || GOOGLE_SCRIPT_URL;

            const callbackName = 'jsonp_callback_db_search_' + Math.round(100000 * Math.random()) + '_' + sheet.year;
            const url = new URL(sUrl);

            url.searchParams.append('action', 'search_database');
            url.searchParams.append('spreadsheetId', sId);
            url.searchParams.append('query', q);
            url.searchParams.append('callback', callbackName);

            const data = await jsonpRequest(url, callbackName);

            if (data.status === 'success' && Array.isArray(data.orders)) {
              const annotated = data.orders.map((o: any) => ({
                ...o,
                sheetName: sheet.year,
                spreadsheetId: sId,
                scriptUrl: sUrl
              }));
              allMatchedOrders.push(...annotated);
            } else {
              errors.push(`${sheet.year}: ${data.message || 'Error'}`);
            }
          } catch (err: any) {
            errors.push(`${sheet.year}: ${err.message || String(err)}`);
          }
        })
      );

      setRemoteResults(allMatchedOrders);

      if (allMatchedOrders.length === 0) {
        if (errors.length > 0) {
          setSearchError(
            appLanguage === 'ms'
              ? `Carian ralat:\n${errors.join('\n')}`
              : `Search errors:\n${errors.join('\n')}`
          );
        } else {
          setSearchError(
            appLanguage === 'ms'
              ? 'Tiada padanan dijumpai di Google Sheets tahunan.'
              : 'No matching records found across the annual Google Sheets.'
          );
        }
      } else if (errors.length > 0) {
        console.warn('Some sheet searches failed:', errors);
      }
    } catch (err: any) {
      setSearchError(appLanguage === 'ms' ? 'Carian gagal: ' + String(err) : 'Search failed: ' + String(err));
    } finally {
      setIsSearching(false);
    }
  };

  const handleLoadRemoteOrder = (orderData: any) => {
    const generatedOrderId =
      orderData.orderId ||
      `REMOTE-${orderData.name || 'UNKNOWN'}-${orderData.phone || ''}-${orderData.due || ''}`
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9-]/g, '');

    const dueTs = parseDueTimestamp(orderData.due);

    const stateToApply = {
      isDelivered: !!orderData.isDelivered,
      spreadsheetId: orderData.spreadsheetId || state.spreadsheetId,
      customerName: orderData.name,
      customerPhone: orderData.phone,
      customerOrder: orderData.order,
      template: orderData.template,
      customerTemplate: orderData.template,
      customerBahasa: orderData.bahasa,
      customerAddOn: orderData.addon,
      customerJenis: orderData.jenis,
      customerDue: orderData.due,
      orderLink: orderData.link,
      googleSheetLink: orderData.link,
      orderId: generatedOrderId,
      dueTimestamp: dueTs,
      mainType:
        orderData.order === 'Resume'
          ? 'Resume'
          : orderData.order === 'Surat'
          ? 'Surat'
          : orderData.order || 'Lain-lain',
      subType: '',
      customerInfo: [
        `--- MAKLUMAT PELANGGAN ---`,
        `Nama Penuh: ${orderData.name || ''}`,
        `No. Telefon: ${orderData.phone || ''}`,
        `Order: ${orderData.order || ''}`,
        `Template: ${orderData.template || ''}`,
        `Bahasa: ${orderData.bahasa || ''}`,
        `Add On: ${orderData.addon || ''}`,
        `Jenis: ${orderData.jenis || ''}`,
        `Due: ${orderData.due || ''}`,
        `Link: ${orderData.link || ''}`,
        `Order ID: ${generatedOrderId}`
      ].join('\n')
    };

    const randomId = orderData.orderId || 'synced_' + Math.round(Math.random() * 100000);
    const mockHistoryItem = {
      id: randomId,
      timestamp: Date.now(),
      state: stateToApply,
      messages: []
    };

    loadOrder(mockHistoryItem);
  };

  const handleRemoteDeliveredToggle = async (e: React.MouseEvent, index: number, orderData: any) => {
    e.preventDefault();
    e.stopPropagation();

    const spreadsheetId = orderData.spreadsheetId || state.spreadsheetId;
    const scriptUrl = orderData.scriptUrl || getActiveScriptUrl(spreadsheetId);
    const orderId = orderData.orderId;
    const currentStatus = !!orderData.isDelivered;
    const newStatus = !currentStatus;

    if (!spreadsheetId || !orderId) {
      alert(appLanguage === 'ms' ? 'Kekurangan Order ID atau Spreadsheet ID.' : 'Missing Order ID or Spreadsheet ID.');
      return;
    }

    // Instantly update local UI
    setRemoteResults((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, isDelivered: newStatus } : item))
    );

    // If it exists in local history too, update there
    const existingIdx = history.findIndex((h) => h.state?.orderId === orderId);
    if (existingIdx !== -1) {
      updateSpecificHistoryItem(history[existingIdx].id, {
        isDelivered: newStatus
      });
    }

    try {
      const callbackName = 'jsonp_callback_remote_delivered_' + Math.round(Math.random() * 100000);
      const url = new URL(scriptUrl);

      url.searchParams.append('action', 'update_delivered');
      url.searchParams.append('spreadsheetId', spreadsheetId);
      url.searchParams.append('orderId', orderId);
      url.searchParams.append('isDelivered', String(newStatus));
      url.searchParams.append('callback', callbackName);

      const result = await jsonpRequest(url, callbackName);
      if (result.status !== 'success') {
        console.warn('Synced status check warning:', result.message || 'Update failed');
      }
    } catch (err) {
      console.warn('Failed to sync delivered status update in background:', err);
    }
  };

  return (
    <div
      className="flex flex-col bg-background w-full min-h-screen pb-[calc(env(safe-area-inset-bottom)+8rem)] overscroll-y-contain"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="w-full flex items-center justify-center overflow-hidden"
        style={{
          height: `${pullProgress}px`,
          transition: isPulling && !refreshing ? 'none' : 'height 0.3s ease-out'
        }}
      >
        <div
          className="flex items-center justify-center w-8 h-8 rounded-full bg-surface shadow-sm text-subtext"
          style={{
            transform: refreshing ? 'none' : `rotate(${pullProgress * 4}deg)`,
            opacity: pullProgress / 40 > 1 ? 1 : pullProgress / 40
          }}
        >
          <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin text-primary' : ''}`} />
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Tab Segment Selector */}
        <div className="flex bg-gray-100/80 p-1 rounded-xl shadow-sm mb-1">
          <button
            type="button"
            onClick={() => setActiveTab('local')}
            className={`flex-1 text-center text-xs font-bold py-2.5 px-3 rounded-lg transition-all duration-200 flex items-center justify-center space-x-1.5 ${
              activeTab === 'local'
                ? 'bg-white text-primary shadow-sm'
                : 'text-subtext/70 hover:text-text hover:bg-white/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{appLanguage === 'ms' ? 'Sejarah Tempatan' : 'Local History'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('remote');
              setSearchError('');
            }}
            className={`flex-1 text-center text-xs font-bold py-2.5 px-3 rounded-lg transition-all duration-200 flex items-center justify-center space-x-1.5 ${
              activeTab === 'remote'
                ? 'bg-white text-primary shadow-sm'
                : 'text-subtext/70 hover:text-text hover:bg-white/40'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>{appLanguage === 'ms' ? 'Cari Database' : 'Search Database'}</span>
          </button>
        </div>
        {activeTab === 'local' && (
          <div className="flex justify-between items-center mb-2">
            <button
              type="button"
              onClick={handleGlobalSync}
              disabled={refreshing}
              className={`flex items-center text-[13px] font-bold px-3.5 py-1.5 rounded-full transition-all duration-200 ${
                refreshing
                  ? 'bg-blue-100 text-blue-400 cursor-not-allowed'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-[1.02] active:scale-95'
              }`}
              title={appLanguage === 'ms' ? 'Sync dari Google Sheet' : 'Sync from Google Sheet'}
            >
              <RefreshCcw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
              Sync
            </button>

            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="flex items-center text-[13px] font-bold text-red-500 hover:bg-red-50 hover:text-red-600 hover:scale-[1.02] px-3.5 py-1.5 rounded-full transition-all duration-200 active:scale-95"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {appLanguage === 'ms' ? 'Padam Semua' : 'Delete All'}
              </button>
            )}
          </div>
        )}

        {activeTab === 'local' ? (
          history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-subtext">
              <Clock className="w-16 h-16 mb-4 opacity-50" />
              <p className="font-bold">
                {appLanguage === 'ms' ? 'Tiada sejarah tempahan' : 'No order history'}
              </p>
            </div>
          ) : (
          <div className="space-y-4">
            {/* Carian Tempatan / Local Search Input */}
            <div className="relative">
              <input
                type="text"
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                placeholder={appLanguage === 'ms' ? 'Cari nama, Order ID, atau no. telefon...' : 'Search name, Order ID, or phone...'}
                className="w-full h-11 bg-gray-100 rounded-xl pl-10 pr-10 font-semibold text-text border border-transparent outline-none focus:bg-white focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all text-xs placeholder:text-gray-400"
              />
              <Search className="w-4 h-4 text-subtext/75 absolute left-3.5 top-3.5" />
              {localSearchQuery && (
                <button
                  type="button"
                  onClick={() => setLocalSearchQuery('')}
                  className="absolute right-3.5 top-3 w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 text-subtext flex items-center justify-center transition-colors"
                >
                  <X className="w-3" />
                </button>
              )}
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl">
              {(['all', 'pending', 'delivered'] as const).map((filterOpt) => {
                const isActive = deliveryFilter === filterOpt;
                let label = '';
                if (filterOpt === 'all') {
                  label = appLanguage === 'ms' ? 'Semua' : 'All';
                } else if (filterOpt === 'pending') {
                  label = appLanguage === 'ms' ? 'Pending' : 'Pending';
                } else if (filterOpt === 'delivered') {
                  label = appLanguage === 'ms' ? 'Dihantar' : 'Delivered';
                }

                return (
                  <button
                    key={filterOpt}
                    type="button"
                    onClick={() => setDeliveryFilter(filterOpt)}
                    className={`flex-1 text-center text-xs font-bold py-2 px-3 rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-white text-primary shadow-sm'
                        : 'text-subtext/70 hover:text-text hover:bg-white/40'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {(() => {
              const matchedItems = history.filter(Boolean).filter((item) => {
                if (deliveryFilter === 'delivered' && !item.state?.isDelivered) return false;
                if (deliveryFilter === 'pending' && item.state?.isDelivered) return false;
                
                if (localSearchQuery.trim()) {
                  const query = localSearchQuery.toLowerCase().trim();
                  const nameMatch = (item.state?.customerName || '').toLowerCase().includes(query);
                  const idMatch = (item.state?.orderId || '').toLowerCase().includes(query);
                  const phoneMatch = (item.state?.customerPhone || '').toLowerCase().includes(query);
                  if (!nameMatch && !idMatch && !phoneMatch) return false;
                }

                // Date filter: only show today's order, 2 days before and 3 days onward relative to today
                const orderTime = item.state?.dueTimestamp || item.timestamp || Date.now();
                const now = new Date(currentTime);
                
                const minDate = new Date(now);
                minDate.setDate(now.getDate() - 2);
                minDate.setHours(0, 0, 0, 0);

                const maxDate = new Date(now);
                maxDate.setDate(now.getDate() + 3);
                maxDate.setHours(23, 59, 59, 999);

                if (orderTime < minDate.getTime() || orderTime > maxDate.getTime()) {
                  return false;
                }

                return true;
              });

              if (matchedItems.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-16 text-subtext bg-surface border border-dashed border-gray-200 rounded-2xl">
                    <Clock className="w-12 h-12 mb-3 opacity-30" />
                    <p className="font-bold text-sm">
                      {appLanguage === 'ms'
                        ? 'Tiada tempahan yang dijumpai'
                        : 'No matching orders found'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  {matchedItems
  .sort((a, b) => {
    const aDelivered = !!a.state?.isDelivered;
    const bDelivered = !!b.state?.isDelivered;

    // Pending orders appear above delivered orders
    if (!aDelivered && bDelivered) return -1;
    if (aDelivered && !bDelivered) return 1;

    const now = currentTime;

    // Read the visible due date again first.
    // This also repairs older records with incorrect timestamps.
    const aDue =
      parseDueTimestamp(a.state?.customerDue) ||
      Number(a.state?.dueTimestamp) ||
      Number(a.timestamp) ||
      now;

    const bDue =
      parseDueTimestamp(b.state?.customerDue) ||
      Number(b.state?.dueTimestamp) ||
      Number(b.timestamp) ||
      now;

    if (!aDelivered) {
      // Pending orders nearest to the current time appear first
      const aDistance = Math.abs(aDue - now);
      const bDistance = Math.abs(bDue - now);

      if (aDistance !== bDistance) {
        return aDistance - bDistance;
      }

      // If both are equally close, show the latest edited order first
      return (
        (Number(b.timestamp) || 0) -
        (Number(a.timestamp) || 0)
      );
    }

    // Delivered orders: latest due date first
    if (aDue !== bDue) {
      return bDue - aDue;
    }

    return (
      (Number(b.timestamp) || 0) -
      (Number(a.timestamp) || 0)
    );
  })
  .map((item) => {
                  const lastEditedDateObj = new Date(item.timestamp || Date.now());
                  const formattedLastEditedDate = lastEditedDateObj.toLocaleString(
                    appLanguage === 'ms' ? 'ms-MY' : 'en-US',
                    {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    }
                  );

                  const dueTimestamp = item.state?.dueTimestamp || item.timestamp || Date.now();
                  const dueDateObj = new Date(dueTimestamp);
                  const formattedDueDate = dueDateObj.toLocaleString(
                    appLanguage === 'ms' ? 'ms-MY' : 'en-US',
                    {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }
                  );

                  const now = currentTime;
                  const isDelivered = !!item.state?.isDelivered;
                  const timeUntilDue = item.state?.dueTimestamp ? item.state.dueTimestamp - now : 0;
                  const isDueSoon = !isDelivered && timeUntilDue > 0 && timeUntilDue <= 20 * 60 * 1000;
                  const isOverdue = !isDelivered && item.state?.dueTimestamp ? timeUntilDue <= 0 : false;

                  const relDetails = getRelativeDayDetails(dueTimestamp, appLanguage);

                  let barColor = "bg-gray-300";
                  if (isDelivered) barColor = "bg-blue-500";
                  else if (isDueSoon) barColor = "bg-rose-500";
                  else if (isOverdue) barColor = "bg-amber-500 font-extrabold";
                  else if (item.state?.urgency === 'super' || item.state?.customerJenis?.toLowerCase().includes('super')) barColor = "bg-rose-600";
                  else if (item.state?.urgency === 'urgent' || item.state?.customerJenis?.toLowerCase().includes('urgent')) barColor = "bg-orange-500";
                  else if (item.state?.urgency === 'semi' || item.state?.customerJenis?.toLowerCase().includes('semi')) barColor = "bg-yellow-500";

                  return (
                    <div
                      key={item.id}
                      onClick={() => loadOrder(item)}
                      className={`bg-surface border relative overflow-hidden ${
                        isDelivered
                          ? 'border-blue-100 bg-blue-50/5 hover:border-blue-200'
                          : isDueSoon
                          ? 'border-red-200 bg-red-50/5 hover:border-red-300'
                          : isOverdue
                          ? 'border-amber-200 bg-amber-50/5 hover:border-amber-300/80'
                          : 'border-gray-200/60 hover:border-gray-300 shadow-sm'
                      } rounded-xl p-2.5 flex flex-col space-y-1 hover:bg-gray-50/65 cursor-pointer active:scale-[0.995] transition-all duration-200`}
                    >
                      {/* Left Accent Bar */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r ${barColor}`} />

                      <div className="pl-1.5">
                        <div className="flex justify-between items-start border-b border-gray-100/60 pb-1">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-1 mb-0.5">
                              <div
                                className={`flex items-center ${
                                  isDelivered
                                    ? 'text-blue-500 font-bold'
                                    : isDueSoon
                                    ? 'text-rose-600 font-bold'
                                    : isOverdue
                                    ? 'text-amber-600 font-bold'
                                    : 'text-primary/75 font-semibold'
                                } text-[10px] sm:text-[10.5px] uppercase tracking-wider`}
                              >
                                {isDelivered ? (
                                  <Check className="w-3 h-3 mr-1 text-blue-500" />
                                ) : isDueSoon ? (
                                  <Bell className="w-3 h-3 mr-1 text-rose-500 animate-pulse" />
                                ) : (
                                  <Calendar className="w-3 h-3 mr-1" />
                                )}

                                {item.state?.customerDue || formattedDueDate}

                                {isDueSoon && (
                                  <span className="ml-1 text-rose-600 lowercase font-bold">
                                    ({Math.ceil(timeUntilDue / 60000)}m)
                                  </span>
                                )}

                                {isDelivered && (
                                  <span className="ml-1 text-blue-500 lowercase">
                                    ({appLanguage === 'ms' ? 'Dihantar' : 'Delivered'})
                                  </span>
                                )}
                              </div>

                              {relDetails && (
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider ${relDetails.className}`}>
                                  {relDetails.text}
                                </span>
                              )}
                            </div>

                            <p className="font-bold text-[13px] sm:text-[13.5px] leading-tight text-[#111827]">
                              {item.state?.mainType === 'Lain-lain'
                                ? item.state?.customDoc
                                : item.state?.mainType}{' '}
                              {item.state?.isEditMode ? '(Edit)' : ''}
                              {item.state?.customerName
                                ? ` - ${formatCustomerName(item.state.customerName)}`
                                : ''}
                            </p>
                          </div>

                        <div className="flex items-center space-x-1 shrink-0 ml-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              pushView('customer-info', {
                                ...item.state,
                                spreadsheetId: item.state?.spreadsheetId || state.spreadsheetId,
                                timestamp: item.timestamp,
                                historyId: item.id
                              });
                            }}
                            className="w-7 h-7 bg-green-100 text-green-600 rounded-full flex items-center justify-center hover:bg-green-200 hover:text-green-700 hover:scale-[1.05] active:scale-95 transition-all shadow-xs duration-200"
                            title={appLanguage === 'ms' ? 'Kemaskini data & hantar ke Google Sheet' : 'Edit details & sync to Google Sheets'}
                          >
                            <Save className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (window.confirm(appLanguage === 'ms' ? 'Adakah anda pasti mahu pemadam rekod ini?' : 'Are you sure you want to delete this record?')) {
                                deleteOrderFromHistory(item.id);
                              }
                            }}
                            className="w-7 h-7 bg-red-100 text-red-500 rounded-full flex items-center justify-center hover:bg-red-200 hover:text-red-700 hover:scale-[1.05] active:scale-95 transition-all shadow-xs duration-200"
                            title={appLanguage === 'ms' ? 'Padam' : 'Delete'}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] mt-1 leading-normal">
                        {item.state?.template &&
                          item.state?.mainType === 'Resume' &&
                          !item.state?.isEditMode && (
                            <div>
                              <span className="text-subtext">
                                {appLanguage === 'ms' ? 'Templat' : 'Template'}:
                              </span>{' '}
                              <span className="font-medium text-text">{item.state.template}</span>
                            </div>
                          )}

                        {item.state?.customerBahasa && (
                          <div>
                            <span className="text-subtext">
                              {appLanguage === 'ms' ? 'Bahasa' : 'Language'}:
                            </span>{' '}
                            <span className="font-medium text-text">{item.state.customerBahasa}</span>
                          </div>
                        )}

                        {item.state?.customerJenis && (
                          <div>
                            <span className="text-subtext">
                              {appLanguage === 'ms' ? 'Jenis' : 'Type'}:
                            </span>{' '}
                            <span className="font-medium text-text">{item.state.customerJenis}</span>
                          </div>
                        )}

                        {item.state?.customerAddOn && (
                          <div className="w-full">
                            <span className="text-subtext">
                              {appLanguage === 'ms' ? 'Tambahan' : 'Add-ons'}:
                            </span>{' '}
                            <span className="font-medium text-text">{item.state.customerAddOn}</span>
                          </div>
                        )}

                        {item.state?.customerPhone && (
                          <div className="w-full flex items-center space-x-1.5 mt-0.5">
                            <span className="text-subtext">
                              {appLanguage === 'ms' ? 'Tel' : 'Phone'}:
                            </span>{' '}
                            <a
                              href={`https://wa.me/${item.state.customerPhone.replace(/\D/g, '').startsWith('0') ? '6' + item.state.customerPhone.replace(/\D/g, '') : item.state.customerPhone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-blue-600 hover:underline hover:text-blue-700 bg-blue-50/50 px-1.5 py-0 rounded flex items-center space-x-1 inline-flex text-[10px]"
                              title={appLanguage === 'ms' ? 'Hubungi di WhatsApp' : 'Contact on WhatsApp'}
                            >
                              <Phone className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                              <span className="select-all font-mono">{item.state.customerPhone}</span>
                            </a>
                          </div>
                        )}

                        {item.state?.orderId && (
                          <div className="w-full flex items-center justify-between pt-0.5 mt-0.5">
                            <div className="flex-1 truncate mr-2">
                              <span className="text-subtext text-[10.5px]">Link:</span>{' '}
                              {item.state?.googleSheetLink ? (
                                <div className="flex flex-col gap-0.5">
                                  {item.state.googleSheetLink
                                    .split(/[\n,]+/)
                                    .filter(Boolean)
                                    .map((link, idx) => (
                                      <a
                                        key={idx}
                                        href={link.trim()}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-500 hover:underline font-medium truncate inline-block max-w-[150px] sm:max-w-[250px] text-[10.5px]"
                                        onClick={(e) => e.stopPropagation()}
                                        title={link.trim()}
                                      >
                                        {link.trim()}
                                      </a>
                                    ))}
                                </div>
                              ) : (
                                <span className="text-gray-400 italic font-medium text-[10px]">
                                  {appLanguage === 'ms' ? 'Belum dimasukkan' : 'Not entered'}
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => handleSyncLink(e, item)}
                              disabled={syncingId === item.id}
                              className="shrink-0 flex items-center justify-center bg-gray-100 hover:bg-gray-200 hover:scale-105 active:scale-95 text-text p-1 rounded-full transition-all disabled:opacity-50"
                              title={appLanguage === 'ms' ? 'Sync Link dari Google Sheet' : 'Sync Link from Google Sheet'}
                            >
                              <RefreshCcw
                                className={`w-3 h-3 ${
                                  syncingId === item.id ? 'animate-spin text-primary' : ''
                                }`}
                              />
                            </button>
                          </div>
                        )}

                        <div className="w-full pt-1.5 mt-1 border-t border-gray-100/65 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={(e) => handleDeliveredToggle(e, item, isDelivered)}
                            className={`px-2 py-1 text-[10px] font-bold rounded-md flex items-center hover:scale-[1.02] active:scale-95 transition-all duration-200 shadow-xs ${
                              isDelivered
                                ? 'bg-blue-50 text-blue-600 border border-blue-200/60 hover:bg-blue-100'
                                : 'bg-white text-gray-400 border border-gray-150 hover:bg-gray-50 hover:text-gray-600'
                            }`}
                          >
                            <Check
                              className={`w-3 h-3 mr-1 ${
                                isDelivered ? 'text-blue-500' : 'text-gray-400'
                              }`}
                            />
                            {appLanguage === 'ms'
                              ? isDelivered
                                ? 'Dihantar'
                                : 'Belum Dihantar'
                              : isDelivered
                              ? 'Delivered'
                              : 'Not Delivered'}
                          </button>

                          <div className="text-[9.5px] text-right text-subtext font-medium leading-none select-none">
                            <span className="opacity-75">{appLanguage === 'ms' ? 'Disunting: ' : 'Edited: '}</span>
                            <span className="font-semibold text-text/80">{formattedLastEditedDate}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>
            );
        })()}
      </div>
      )
        ) : (
          /* Database Search Tab */
          <div className="space-y-4">
            <div className="bg-surface border border-gray-100 p-4 rounded-xl shadow-sm space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRemoteSearch();
                  }}
                  placeholder={appLanguage === 'ms' ? 'Cari nama, Order ID, atau no. telefon...' : 'Search name, Order ID, or phone number...'}
                  className="w-full h-11 bg-gray-50 rounded-xl pl-10 pr-4 font-semibold text-text border border-gray-200 outline-none focus:bg-white focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all text-xs placeholder:text-gray-400"
                />
                <Search className="w-4 h-4 text-subtext/70 absolute left-3.5 top-3.5" />
              </div>
              <button
                type="button"
                onClick={handleRemoteSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="w-full h-11 bg-primary text-white font-bold rounded-xl flex items-center justify-center space-x-2 active:scale-[0.98] transition-all disabled:opacity-50 text-xs shadow-sm"
              >
                {isSearching ? (
                  <RefreshCcw className="w-3.5 h-3.5 animate-spin text-white" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>{appLanguage === 'ms' ? 'Cari Database' : 'Search Database'}</span>
              </button>
            </div>

            {/* Pautan & Tetapan Database (3 Tahun) */}
            <div className="bg-surface border border-gray-100 rounded-xl shadow-sm overflow-hidden transition-all duration-200">
              <button
                type="button"
                onClick={() => setShowDbSettings(!showDbSettings)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-text hover:bg-gray-50/50 transition-colors"
                id="btn-db-settings-toggle"
              >
                <div className="flex items-center space-x-2">
                  <Settings className="w-4 h-4 text-primary" />
                  <span>{appLanguage === 'ms' ? 'Pautan & Tetapan Database Tahunan' : 'Annual Database Connection & Settings'}</span>
                </div>
                {showDbSettings ? (
                  <ChevronUp className="w-4 h-4 text-subtext/70" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-subtext/70" />
                )}
              </button>

              {showDbSettings && (
                <div className="p-4 border-t border-gray-100 bg-gray-50/30 space-y-4 animate-in slide-in-from-top-1 duration-150">
                  <div className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 text-[11px] text-blue-800 leading-relaxed">
                    {appLanguage === 'ms' 
                      ? 'Konfigurasikan Spreadsheet ID bagi setiap tahun. Anda boleh memasukkan pautan Google Sheet penuh (URL) atau ID terus.'
                      : 'Configure the Spreadsheet ID for each year. You can paste the full Google Sheet Link (URL) or directly the Spreadsheet ID.'}
                  </div>

                  {/* Web App Script URL block shared for all */}
                  <div className="p-3 bg-white rounded-lg border border-gray-100 shadow-sm space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary block">
                      {appLanguage === 'ms' ? 'Pautan Web App Apps Script (Kongsi Untuk Semua):' : 'Global Web App Apps Script URL (Shared for All):'}
                    </span>
                    <input
                      type="text"
                      className="w-full text-[11px] bg-gray-50 font-mono rounded px-2.5 py-1.5 border border-gray-200 outline-none text-text focus:bg-white"
                      value={globalScriptUrl}
                      onChange={(e) => setGlobalScriptUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                    />
                  </div>

                  <div className="space-y-4">
                    {annualSheets.map((sheet, index) => (
                      <div key={index} className="p-3 bg-white rounded-lg border border-gray-100 shadow-sm space-y-2.5 relative">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <label className="text-[10px] font-black uppercase tracking-wider text-primary shrink-0">
                              {appLanguage === 'ms' ? 'Tahun:' : 'Year:'}
                            </label>
                            <input
                              type="text"
                              value={sheet.year}
                              onChange={(e) => {
                                const val = e.target.value;
                                setAnnualSheets(prev => prev.map((s, idx) => idx === index ? { ...s, year: val } : s));
                              }}
                              className="bg-gray-50 px-2 py-0.5 rounded text-[10px] font-bold text-text border border-gray-200 max-w-[80px] outline-none text-left"
                              placeholder="e.g. 2024"
                            />
                          </div>
                          {annualSheets.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setAnnualSheets(prev => prev.filter((_, idx) => idx !== index));
                              }}
                              className="p-1 hover:bg-red-50 text-red-500 rounded transition-colors"
                              title={appLanguage === 'ms' ? 'Hapus' : 'Delete'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] text-subtext font-medium block">
                            {appLanguage === 'ms' ? 'Pautan / ID Google Sheet:' : 'Google Sheet URL / Spreadsheet ID:'}
                          </span>
                          <div className="relative">
                            <input
                              type="text"
                              value={sheet.spreadsheetId}
                              onChange={(e) => {
                                const val = e.target.value;
                                setAnnualSheets(prev => prev.map((s, idx) => idx === index ? { ...s, spreadsheetId: val } : s));
                              }}
                              placeholder={appLanguage === 'ms' ? 'Salin pautan Google Sheet di sini...' : 'Paste Google Sheet Link here...'}
                              className="w-full text-[11px] bg-gray-50 font-mono rounded px-2.5 py-1.5 border border-gray-200 outline-none text-text focus:bg-white"
                            />
                            {sheet.spreadsheetId && (
                              <span className="text-[9px] text-green-600 block mt-1 font-semibold">
                                ✓ ID: {sheet.spreadsheetId.includes('docs.google.com/spreadsheets/d/') 
                                  ? (sheet.spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1] || 'URL valid') 
                                  : 'Raw ID'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAnnualSheets(prev => [...prev, { year: '', spreadsheetId: '', scriptUrl: '' }]);
                    }}
                    className="w-full py-2.5 border border-dashed border-gray-300 hover:border-blue-400 hover:text-blue-600 text-subtext font-bold rounded-xl flex items-center justify-center space-x-1.5 text-xs active:scale-[0.98] transition-all bg-white"
                  >
                    <span className="text-base font-normal">+</span>
                    <span>{appLanguage === 'ms' ? 'Tambah Tahun Baru' : 'Add New Year'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem('db_annual_sheets', JSON.stringify(annualSheets));
                      localStorage.setItem('db_global_script_url', globalScriptUrl);
                      // Save and sync with context state
                      const firstActive = annualSheets.find(s => s.spreadsheetId !== '');
                      if (firstActive) {
                        const extractId = (input: string) => {
                          if (input.includes('docs.google.com/spreadsheets/d/')) {
                            const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
                            return match ? match[1] : input;
                          }
                          return input;
                        };
                        updateOrderHistoryState({ spreadsheetId: extractId(firstActive.spreadsheetId) });
                      }
                      alert(
                        appLanguage === 'ms' 
                          ? 'Konfigurasi pautan database tahunan berjaya disimpan!' 
                          : 'Annual database configurations successfully saved!'
                      );
                      setShowDbSettings(false);
                    }}
                    className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center space-x-1 text-xs active:scale-95 transition-all shadow-sm"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{appLanguage === 'ms' ? 'Simpan Tetapan' : 'Save Connection Settings'}</span>
                  </button>
                </div>
              )}
            </div>

            {searchError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold border border-red-100 flex items-center space-x-2 animate-fade-in">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                <span>{searchError}</span>
              </div>
            )}

            {isSearching && (
              <div className="flex flex-col items-center justify-center py-16 text-subtext">
                <RefreshCcw className="w-7 h-7 mb-3 animate-spin text-primary opacity-80" />
                <p className="font-bold text-xs select-none">
                  {appLanguage === 'ms' ? 'Sedang mencari di lembaran tahunan...' : 'Searching across annual sheets...'}
                </p>
              </div>
            )}

            {!isSearching && remoteResults.length > 0 && (
              <div className="space-y-2.5 animate-fade-in-up">
                <p className="text-[10px] font-bold text-subtext uppercase tracking-widest pl-1">
                  {appLanguage === 'ms' 
                    ? `Hasil Carian (${remoteResults.length} Rekod)` 
                    : `Search Results (${remoteResults.length} Records)`}
                </p>

                {remoteResults.map((item, idx) => {
                  const isDelivered = !!item.isDelivered;
                  const orderId = item.orderId || `REMOTE-${idx}`;

                  return (
                    <div
                      key={orderId + '-' + idx}
                      onClick={() => handleLoadRemoteOrder(item)}
                      className={`bg-surface border ${
                        isDelivered
                          ? 'border-blue-200 bg-blue-50/10 hover:border-blue-300'
                          : 'border-gray-100 hover:border-gray-200 shadow-sm'
                      } rounded-[16px] p-2.5 flex flex-col space-y-1 hover:bg-gray-50/80 cursor-pointer active:scale-[0.99] transition-all duration-200`}
                    >
                      <div className="flex justify-between items-start border-b border-gray-100 pb-1.5">
                        <div className="flex-1">
                          <div className="flex items-center flex-wrap gap-1 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#2563eb] bg-[#eff6ff] px-1.5 py-0.5 rounded flex items-center space-x-1">
                              <Database className="w-2.5 h-2.5 mr-0.5" />
                              <span>{item.sheetName || 'Google Sheet'}</span>
                            </span>
                            {isDelivered ? (
                              <span className="text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded flex items-center">
                                <Check className="w-2.5 h-2.5 mr-0.5" />
                                <span>{appLanguage === 'ms' ? 'Dihantar' : 'Delivered'}</span>
                              </span>
                            ) : (
                              <span className="text-[9px] font-black uppercase tracking-widest text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                                {appLanguage === 'ms' ? 'Belum Dihantar' : 'Pending'}
                              </span>
                            )}
                          </div>

                          <p className="font-bold text-[13px] leading-tight text-text">
                            {item.order === 'Lain-lain' || item.order === 'Lain2'
                              ? item.order
                              : item.order}
                            {item.name ? ` - ${formatCustomerName(item.name)}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center space-x-1 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleLoadRemoteOrder(item);
                            }}
                            className="w-7 h-7 bg-green-100 text-green-600 rounded-full flex items-center justify-center hover:bg-green-200 hover:text-green-700 hover:scale-[1.10] active:scale-90 transition-all shadow-sm duration-200"
                            title={appLanguage === 'ms' ? 'Kemaskini data & hantar ke Google Sheet' : 'Edit details & sync to Google Sheets'}
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-2 text-[11px] leading-snug">
                        {item.phone && (
                          <div className="w-full flex items-center space-x-1.5 mt-0.5">
                            <span className="text-subtext">Tel:</span>{' '}
                            <a
                              href={`https://wa.me/${String(item.phone).replace(/\D/g, '').startsWith('0') ? '6' + String(item.phone).replace(/\D/g, '') : String(item.phone).replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-blue-600 hover:underline hover:text-blue-700 bg-blue-50/70 px-2 py-0.5 rounded flex items-center space-x-1 inline-flex text-[11px]"
                              title={appLanguage === 'ms' ? 'Hubungi di WhatsApp' : 'Contact on WhatsApp'}
                            >
                              <Phone className="w-3 h-3 text-blue-500 shrink-0" />
                              <span className="select-all font-mono">{item.phone}</span>
                            </a>
                          </div>
                        )}
                        
                        {item.orderId && (
                          <div className="w-full">
                            <span className="text-subtext">Order ID:</span>{' '}
                            <span className="font-mono text-[10px] text-text/80 select-all font-semibold bg-gray-55 px-1 rounded">{item.orderId}</span>
                          </div>
                        )}

                        {item.template && (
                          <div>
                            <span className="text-subtext">{appLanguage === 'ms' ? 'Templat: ' : 'Template: '}</span>{' '}
                            <span className="font-medium text-text">{item.template}</span>
                          </div>
                        )}

                        {item.bahasa && (
                          <div>
                            <span className="text-subtext">{appLanguage === 'ms' ? 'Bahasa: ' : 'Language: '}</span>{' '}
                            <span className="font-medium text-text">{item.bahasa}</span>
                          </div>
                        )}

                        {item.jenis && (
                          <div>
                            <span className="text-subtext">Urgency:</span>{' '}
                            <span className="font-medium text-text">{item.jenis}</span>
                          </div>
                        )}

                        {item.addon && (
                          <div className="w-full">
                            <span className="text-subtext">{appLanguage === 'ms' ? 'Tambahan: ' : 'Add On: '}</span>{' '}
                            <span className="font-medium text-text">{item.addon}</span>
                          </div>
                        )}

                        {item.due && (
                          <div className="w-full flex items-center space-x-1 text-primary">
                            <Calendar className="w-3 h-3 mr-1" />
                            <span className="text-[12px] font-bold">{item.due}</span>
                          </div>
                        )}

                        {item.link && (
                          <div className="w-full pt-1">
                            <span className="text-subtext">Link:</span>{' '}
                            <div className="flex flex-col gap-1">
                              {item.link
                                .split(/[\n,]+/)
                                .filter(Boolean)
                                .map((lnk: string, lIdx: number) => (
                                  <a
                                    key={lIdx}
                                    href={lnk.trim()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 hover:underline font-medium truncate inline-block max-w-[200px] sm:max-w-[300px]"
                                    onClick={(e) => e.stopPropagation()}
                                    title={lnk.trim()}
                                  >
                                    {lnk.trim()}
                                  </a>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="w-full pt-2 mt-1 border-t border-gray-100 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={(e) => handleRemoteDeliveredToggle(e, idx, item)}
                          className={`px-3 py-1.5 text-[11px] font-bold rounded-lg flex items-center hover:scale-[1.02] active:scale-95 transition-all duration-200 shadow-sm ${
                            isDelivered
                              ? 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 hover:border-blue-300'
                              : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <Check
                            className={`w-3.5 h-3.5 mr-1.5 ${
                              isDelivered ? 'text-blue-500' : 'text-gray-400'
                            }`}
                          />
                          {appLanguage === 'ms'
                            ? isDelivered
                              ? 'Dihantar'
                              : 'Belum Dihantar'
                            : isDelivered
                            ? 'Delivered'
                            : 'Not Delivered'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!isSearching && remoteResults.length === 0 && !searchError && (
              <div className="flex flex-col items-center justify-center py-20 text-subtext animate-fade-in-up">
                <Search className="w-16 h-16 mb-4 opacity-30 animate-pulse" />
                <p className="font-bold text-center text-xs text-text/60 md:max-w-[260px] leading-relaxed">
                  {appLanguage === 'ms' 
                    ? 'Masukkan nama, Order ID, atau No. telefon untuk mencari di lembaran tahunan.' 
                    : 'Enter customer name, Order ID, or Phone No to search across annual sheets.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          />

          <div className="relative bg-white rounded-[24px] p-6 w-full max-w-[320px] shadow-2xl animate-fade-in-up">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-2">
                <AlertCircle className="w-6 h-6" />
              </div>

              <h3 className="text-[18px] font-bold text-text">
                {appLanguage === 'ms' ? 'Padam Semua Sejarah?' : 'Delete All History?'}
              </h3>

              <p className="text-[14px] text-subtext pb-4">
                {appLanguage === 'ms'
                  ? 'Tindakan ini tidak boleh diundurkan. Semua rekod tempahan akan dipadam.'
                  : 'This action cannot be undone. All order records will be deleted.'}
              </p>

              <div className="flex w-full space-x-3">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 px-4 rounded-full font-bold text-[14px] text-text bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all"
                >
                  {appLanguage === 'ms' ? 'Batal' : 'Cancel'}
                </button>

                <button
                  type="button"
                  onClick={handleClearConfirm}
                  className="flex-1 py-3 px-4 rounded-full font-bold text-[14px] text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all"
                >
                  {appLanguage === 'ms' ? 'Padam' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}