import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../cn';
import { Clock, Trash2, Calendar, AlertCircle, RefreshCcw, Save, Bell, Check, Search, Database, Phone, Settings, ChevronDown, ChevronUp, Link, X } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { formatPhoneUniversal, parseDateStringToTimestamp } from '../utils';

const GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec';

const formatCustomerName = (name?: string) => {
  if (!name) return '';
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const formatDisplayPhone = (phone?: string) => {
  return formatPhoneUniversal(phone);
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

const parseDueTimestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return 0;
  }

  return parseDateStringToTimestamp(value, 0).timestamp;
};

export function HistoryView() {
  const {
    state,
    history,
    setHistory,
    clearHistory,
    deleteOrderFromHistory,
    loadOrder,
    drafts,
    deleteDraft,
    loadDraft,
    pushView,
    appLanguage,
    updateSpecificHistoryItem,
    updateOrderHistoryState
  } = useAppContext();
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [confirmAction, setConfirmAction] = useState<{ title?: string; message: string; onConfirm: () => void } | null>(null);
  const [alertMsg, setAlertMsg] = useState<{ title?: string; message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'delivered' | 'pending'>('all');
  const [pendingTimeFilter, setPendingTimeFilter] = useState<'all' | 'today' | 'tomorrow' | '2days' | '3days'>('all');
  const [activeTab, setActiveTab] = useState<'local' | 'remote' | 'drafts'>('local');
  const [searchQuery, setSearchQuery] = useState('');
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [showDbSettings, setShowDbSettings] = useState(false);
  const [globalScriptUrl, setGlobalScriptUrl] = useState<string>(() => {
    return localStorage.getItem('db_global_script_url') || GOOGLE_SCRIPT_URL;
  });
  const [autoSync, setAutoSync] = useState(() => {
    const saved = localStorage.getItem('db_auto_sync');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('db_auto_sync', String(autoSync));
  }, [autoSync]);

  useEffect(() => {
  const timer = window.setInterval(() => {
    setCurrentTime(Date.now());
  }, 60 * 1000);

  return () => {
    window.clearInterval(timer);
  };
}, []);

  const handleGlobalSyncRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    let syncTimer: number | null = null;

    const triggerSync = () => {
      if (handleGlobalSyncRef.current && !isSearching && !refreshing && navigator.onLine) {
        handleGlobalSyncRef.current(true);
      }
    };

    // Run custom background sync on frame focus or initial mount
    triggerSync();

    if (autoSync) {
      syncTimer = window.setInterval(triggerSync, 20000); // 20 seconds auto-sync
    }

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        triggerSync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      if (syncTimer) window.clearInterval(syncTimer);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [autoSync, isSearching, refreshing]);


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

  const localizedHistoryItems = useMemo(() => {
    return history.filter(Boolean).filter((item) => {
      if (deliveryFilter === 'delivered' && !item.state?.isDelivered) return false;
      if (deliveryFilter === 'pending' && item.state?.isDelivered) return false;
      
      // If pending filter is active, apply sub-time filters
      if (deliveryFilter === 'pending' && pendingTimeFilter !== 'all') {
        const orderTime = parseDueTimestamp(item.state?.dueTimestamp || item.timestamp);
        const d = new Date(orderTime);
        d.setHours(0, 0, 0, 0);
        const orderDateTs = d.getTime();

        const n = new Date(currentTime);
        n.setHours(0, 0, 0, 0);
        const todayTs = n.getTime();

        const t = new Date(n);
        t.setDate(n.getDate() + 1);
        const tomorrowTs = t.getTime();

        const d2 = new Date(n);
        d2.setDate(n.getDate() + 2);
        const day2Ts = d2.getTime();

        const d3 = new Date(n);
        d3.setDate(n.getDate() + 3);
        const day3Ts = d3.getTime();

        if (pendingTimeFilter === 'today' && orderDateTs !== todayTs) return false;
        if (pendingTimeFilter === 'tomorrow' && orderDateTs !== tomorrowTs) return false;
        if (pendingTimeFilter === '2days' && orderDateTs !== day2Ts) return false;
        if (pendingTimeFilter === '3days' && orderDateTs !== day3Ts) return false;
      }
      
      if (localSearchQuery.trim()) {
        const query = localSearchQuery.toLowerCase().trim();
        const nameMatch = String(item.state?.customerName || '').toLowerCase().includes(query);
        const idMatch = String(item.state?.orderId || '').toLowerCase().includes(query);
        const phoneMatch = String(item.state?.customerPhone || '').toLowerCase().includes(query);
        if (!nameMatch && !idMatch && !phoneMatch) return false;
      }

      // Date filter: only show today's order, 2 days before and 3 days onward relative to today
      const orderTimeVal = parseDueTimestamp(item.state?.dueTimestamp || item.timestamp);
      const now = new Date(currentTime);
      
      const minDate = new Date(now);
      minDate.setDate(now.getDate() - 2);
      minDate.setHours(0, 0, 0, 0);

      const maxDate = new Date(now);
      maxDate.setDate(now.getDate() + 3);
      maxDate.setHours(23, 59, 59, 999);

      if (orderTimeVal < minDate.getTime() || orderTimeVal > maxDate.getTime()) {
        // Only return false if we AREN'T explicitly filtering for a specific pending day
        if (deliveryFilter !== 'pending' || pendingTimeFilter === 'all') {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const aDelivered = !!a.state?.isDelivered;
      const bDelivered = !!b.state?.isDelivered;

      // Pending orders appear above delivered orders
      if (!aDelivered && bDelivered) return -1;
      if (aDelivered && !bDelivered) return 1;

      const now = currentTime;

      // Read the visible due date again first.
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
    });
  }, [history, deliveryFilter, localSearchQuery, currentTime]);

  const pendingStats = useMemo(() => {
    const now = new Date(currentTime);
    now.setHours(0, 0, 0, 0);
    const todayTs = now.getTime();
    
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowTs = tomorrow.getTime();

    const day2 = new Date(now);
    day2.setDate(now.getDate() + 2);
    const day2Ts = day2.getTime();

    const day3 = new Date(now);
    day3.setDate(now.getDate() + 3);
    const day3Ts = day3.getTime();

    let todayCount = 0;
    let tomorrowCount = 0;
    let day2Count = 0;
    let day3Count = 0;

    // Use full history for stats, not just filtered results
    history.forEach(item => {
      if (item.state?.isDelivered) return;
      
      const due = parseDueTimestamp(item.state?.dueTimestamp || item.timestamp);
      if (!due) return;
      
      const dueDate = new Date(due);
      dueDate.setHours(0, 0, 0, 0);
      const dueDateTs = dueDate.getTime();
      
      if (dueDateTs === todayTs) todayCount++;
      else if (dueDateTs === tomorrowTs) tomorrowCount++;
      else if (dueDateTs === day2Ts) day2Count++;
      else if (dueDateTs === day3Ts) day3Count++;
    });

    return { today: todayCount, tomorrow: tomorrowCount, day2: day2Count, day3: day3Count };
  }, [history, currentTime]);

  const extractId = (input: string) => {
    const trimmed = input.trim();
    if (trimmed.includes('docs.google.com/spreadsheets/d/')) {
      const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
      return match ? match[1] : trimmed;
    }
    return trimmed;
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
      }, 45000);

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
        console.warn('JSONP failed URL:', url.toString());
        cleanup();
        reject(new Error('Connection failure or script load error'));
      };

      document.body.appendChild(script);
    });
  };

  const handleSyncLink = async (e: React.MouseEvent, item: any) => {
    e.preventDefault();
    e.stopPropagation();

    const spreadsheetId = item.state?.spreadsheetId || state.spreadsheetId;

    if (!item.state?.orderId || !spreadsheetId) {
      setAlertMsg({ type: 'error', message: appLanguage === 'ms' ? 'Kekurangan Order ID atau Spreadsheet ID.' : 'Missing Order ID or Spreadsheet ID.' });
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
        setAlertMsg({ type: 'success', message: appLanguage === 'ms' ? 'Pautan berjaya dikemaskini!' : 'Link successfully updated!' });
      } else if (data.status === 'success') {
        setAlertMsg({ type: 'info', message: appLanguage === 'ms' ? 'Tiada pautan dijumpai dalam rekod Google Sheet.' : 'No link found in the Google Sheet record.' });
      } else {
        setAlertMsg({ type: 'error', message: 'Error: ' + (data.message || 'Unknown error') });
      }
    } catch (err) {
      setAlertMsg({ type: 'error', message: 'Failed to sync link: ' + String(err) });
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
    const now = Date.now();

    // 1. Instantly update local state for perfect responsiveness and offline action
    updateSpecificHistoryItem(item.id, {
      isDelivered: newStatus,
      hasNotified: false,
      ...(spreadsheetId ? { spreadsheetId } : {}),
      ...(spreadsheetId && orderId ? {
        syncStatus: 'syncing',
        syncLastAttempt: now,
      } : {
        syncStatus: 'saved_locally'
      }),
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
          // Rollback on obvious application error
          updateSpecificHistoryItem(item.id, {
            isDelivered: currentStatus, // rollback
            syncStatus: 'failed',
            syncFailCount: (item.state?.syncFailCount || 0) + 1,
            syncLastAttempt: Date.now(),
          });
        } else {
          updateSpecificHistoryItem(item.id, {
             syncStatus: 'synced',
             syncLastSuccess: Date.now(),
             syncFailCount: 0,
          });
        }
      } catch (err) {
        console.warn('Failed to sync delivered status update in background:', err);
        // Rollback on network/fetch error
        updateSpecificHistoryItem(item.id, {
          isDelivered: currentStatus, // rollback
          syncStatus: 'failed',
          syncFailCount: (item.state?.syncFailCount || 0) + 1,
          syncLastAttempt: Date.now(),
        });
      }
    }
  };

  const deleteOrderFromCloud = async (spreadsheetId: string, orderId: string) => {
    if (spreadsheetId && orderId) {
      try {
        const callbackName = 'jsonp_callback_delete_' + Math.round(Math.random() * 100000);
        const url = new URL(getActiveScriptUrl(spreadsheetId));

        url.searchParams.append('action', 'delete_order');
        url.searchParams.append('spreadsheetId', spreadsheetId);
        url.searchParams.append('orderId', orderId);
        url.searchParams.append('callback', callbackName);

        await jsonpRequest(url, callbackName);
      } catch (err) {
        console.warn('Failed to delete order from cloud:', err);
      }
    }
  };

  const handleGlobalSync = async (silent = false) => {
    // Collect all active annual sheets
    const activeConfigs = annualSheets.filter(
      sheet => sheet.spreadsheetId && sheet.spreadsheetId.trim() !== ''
    );

    if (activeConfigs.length === 0) {
      if (!silent) {
        setAlertMsg({
          type: 'error',
          message: appLanguage === 'ms'
            ? 'Sila konfigurasikan sekurang-kurangnya satu spreadsheet ID di bahagian Tetapan Database terlebih dahulu.'
            : 'Please configure at least one spreadsheet ID in Database Settings first.'
        });
      }
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

        const safeYear = String(sheet.year).replace(/[^\w]/g, '_');
        const callbackName = 'jsonp_callback_sync_' + Math.round(100000 * Math.random()) + '_' + safeYear;
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
          console.warn(`Sync failed for year ${sheet.year}:`, e);
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
            const existingItem = existingHistory[existingIdx];
            // If the local item was modified within the last 15 seconds, skip overwriting it to prevent stale remote data from clobbering it.
            const isRecentlyModified = existingItem.state?.lastModifiedLocally && (currentNow - existingItem.state.lastModifiedLocally < 15000);

            if (!isRecentlyModified) {
              existingHistory[existingIdx] = {
                ...existingItem,
                state: {
                  ...existingItem.state,
                  ...newState
                }
              };
              totalUpdCou++;
            }
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

      if (!silent) {
        setAlertMsg({
          type: 'success',
          message: appLanguage === 'ms'
            ? `Berjaya dikemaskini daripada ${activeConfigs.length} database tahunan!\nBaru: ${totalNewCou}\nDikemaskini: ${totalUpdCou}`
            : `Aggregated sync complete across ${activeConfigs.length} annual sheets!\nNew: ${totalNewCou}\nUpdated: ${totalUpdCou}`
        });
      }
    } catch (e) {
      if (!silent) {
        setAlertMsg({ type: 'error', message: 'Sync failed: ' + e });
      }
    } finally {
      setRefreshing(false);
      setPullProgress(0);
    }
  };

  handleGlobalSyncRef.current = handleGlobalSync;

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
    setConfirmAction({
      title: appLanguage === 'ms' ? 'Padam Semua Sejarah?' : 'Delete All History?',
      message: appLanguage === 'ms'
        ? 'Tindakan ini tidak boleh diundurkan. Semua rekod tempahan akan dipadam.'
        : 'This action cannot be undone. All order records will be deleted.',
      onConfirm: () => {
        clearHistory();
        setConfirmAction(null);
      }
    });
  };

  const handleRemoteSearch = async () => {
    const activeConfigs = annualSheets.filter(s => s.spreadsheetId.trim() !== '');

    if (activeConfigs.length === 0) {
      setAlertMsg({
        type: 'error',
        message: appLanguage === 'ms'
          ? 'Sila tetapkan sekurang-kurangnya satu Spreadsheet ID/Pautan di dalam Tetapan sebelum mencari.'
          : 'Please set at least one Spreadsheet ID/Link in settings before searching.'
      });
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

    // Check if we already have this in local history (by generatedOrderId or orderId) to avoid creating a duplicate card
    const localMatch = history.find(item => 
      item.id === generatedOrderId || 
      (item.state?.orderId && item.state.orderId === generatedOrderId)
    );

    if (localMatch) {
      loadOrder(localMatch);
      return;
    }

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
      customerInfo: ''
    };

    const mockHistoryItem = {
      id: generatedOrderId,
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
      setAlertMsg({ type: 'error', message: appLanguage === 'ms' ? 'Kekurangan Order ID atau Spreadsheet ID.' : 'Missing Order ID or Spreadsheet ID.' });
      return;
    }

    // Instantly update local UI
    const now = Date.now();
    setRemoteResults((prev) =>
      prev.map((item, idx) => (idx === index ? { 
        ...item, 
        isDelivered: newStatus,
        syncStatus: 'syncing',
        syncLastAttempt: now
      } : item))
    );

    // If it exists in local history too, update there
    const existingIdx = history.findIndex((h) => h.state?.orderId === orderId);
    if (existingIdx !== -1) {
      updateSpecificHistoryItem(history[existingIdx].id, {
        isDelivered: newStatus,
        syncStatus: 'syncing',
        syncLastAttempt: now
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
        // Rollback
        setRemoteResults((prev) =>
          prev.map((item, idx) => (idx === index ? { 
            ...item, 
            isDelivered: currentStatus,
            syncStatus: 'failed',
            syncFailCount: (item.syncFailCount || 0) + 1,
            syncLastAttempt: Date.now()
          } : item))
        );
        if (existingIdx !== -1) {
          updateSpecificHistoryItem(history[existingIdx].id, {
            isDelivered: currentStatus,
            syncStatus: 'failed',
            syncFailCount: (history[existingIdx].state?.syncFailCount || 0) + 1,
            syncLastAttempt: Date.now()
          });
        }
      } else {
         setRemoteResults((prev) =>
          prev.map((item, idx) => (idx === index ? { 
            ...item, 
            syncStatus: 'synced',
            syncLastSuccess: Date.now(),
            syncFailCount: 0
          } : item))
        );
        if (existingIdx !== -1) {
           updateSpecificHistoryItem(history[existingIdx].id, {
             syncStatus: 'synced',
             syncLastSuccess: Date.now(),
             syncFailCount: 0
           });
        }
      }
    } catch (err) {
      console.warn('Failed to sync delivered status update in background:', err);
      // Rollback
      setRemoteResults((prev) =>
        prev.map((item, idx) => (idx === index ? { 
          ...item, 
          isDelivered: currentStatus,
          syncStatus: 'failed',
          syncFailCount: (item.syncFailCount || 0) + 1,
          syncLastAttempt: Date.now()
        } : item))
      );
      if (existingIdx !== -1) {
        updateSpecificHistoryItem(history[existingIdx].id, {
          isDelivered: currentStatus,
          syncStatus: 'failed',
          syncFailCount: (history[existingIdx].state?.syncFailCount || 0) + 1,
          syncLastAttempt: Date.now()
        });
      }
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
            className={`flex-1 text-center text-[10px] sm:text-xs font-bold py-2 px-1 rounded-lg transition-all duration-200 flex items-center justify-center space-x-1 ${
              activeTab === 'local'
                ? 'bg-white text-primary shadow-sm'
                : 'text-subtext/70 hover:text-text hover:bg-white/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="truncate">{appLanguage === 'ms' ? 'Sejarah' : 'History'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('drafts')}
            className={`flex-1 text-center text-[10px] sm:text-xs font-bold py-2 px-1 rounded-lg transition-all duration-200 flex items-center justify-center space-x-1 ${
              activeTab === 'drafts'
                ? 'bg-white text-primary shadow-sm'
                : 'text-subtext/70 hover:text-text hover:bg-white/40'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span className="truncate">{appLanguage === 'ms' ? 'Draf' : 'Drafts'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('remote');
              setSearchError('');
            }}
            className={`flex-1 text-center text-[10px] sm:text-xs font-bold py-2 px-1 rounded-lg transition-all duration-200 flex items-center justify-center space-x-1 ${
              activeTab === 'remote'
                ? 'bg-white text-primary shadow-sm'
                : 'text-subtext/70 hover:text-text hover:bg-white/40'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span className="truncate">{appLanguage === 'ms' ? 'Cari Cloud' : 'Cloud Search'}</span>
          </button>
        </div>
        {activeTab === 'local' && (
          <div className="space-y-4">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-subtext space-y-4">
                <Clock className="w-16 h-16 opacity-50" />
                <p className="font-bold">
                  {appLanguage === 'ms' ? 'Tiada sejarah tempahan' : 'No order history'}
                </p>
                <button
                  type="button"
                  onClick={() => handleGlobalSync(false)}
                  disabled={refreshing}
                  className="inline-flex items-center text-xs font-semibold px-4 py-2 rounded-xl bg-gray-100 text-subtext border border-transparent hover:bg-gray-200 active:scale-95 transition-all duration-200"
                >
                  <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                  {appLanguage === 'ms' ? 'Sync dari Google Sheet' : 'Sync from Google Sheet'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Carian Tempatan / Local Search Input */}
            <div className="flex gap-2 mt-2.5">
              <div className="relative flex-1">
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
              <button
                type="button"
                onClick={() => handleGlobalSync(false)}
                disabled={refreshing}
                title={appLanguage === 'ms' ? 'Sync dari Google Sheet' : 'Sync from Google Sheet'}
                className="w-11 h-11 bg-gray-100 text-subtext hover:bg-gray-200 active:scale-95 flex items-center justify-center rounded-xl transition-all duration-200 shadow-sm"
              >
                <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin text-primary' : ''}`} />
              </button>
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

            {deliveryFilter !== 'delivered' && (
              <div className="grid grid-cols-4 gap-1.5 mb-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryFilter('pending');
                    setCurrentTime(Date.now());
                    setPendingTimeFilter(pendingTimeFilter === 'today' ? 'all' : 'today');
                  }}
                  className={cn(
                    "flex-1 border rounded-xl p-1.5 flex flex-col items-center justify-center transition-all active:scale-95 duration-150 min-w-0 outline-none",
                    pendingTimeFilter === 'today' && deliveryFilter === 'pending'
                      ? "bg-rose-500 text-white border-rose-600 shadow-sm"
                      : "bg-rose-50/50 border-rose-100 hover:bg-rose-50/80 dark:border-gray-800"
                  )}
                >
                  <span className={cn("text-[10px] font-black uppercase tracking-tighter truncate w-full text-center leading-none", pendingTimeFilter === 'today' && deliveryFilter === 'pending' ? "text-white/80" : "text-rose-600")}>
                    {appLanguage === 'ms' ? 'Hari Ini' : 'Today'}
                  </span>
                  <span className={cn("text-base font-black leading-none mt-1 sm:mt-1.5", pendingTimeFilter === 'today' && deliveryFilter === 'pending' ? "text-white" : "text-rose-700")}>{pendingStats.today}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryFilter('pending');
                    setCurrentTime(Date.now());
                    setPendingTimeFilter(pendingTimeFilter === 'tomorrow' ? 'all' : 'tomorrow');
                  }}
                  className={cn(
                    "flex-1 border rounded-xl p-1.5 flex flex-col items-center justify-center transition-all active:scale-95 duration-150 min-w-0 outline-none",
                    pendingTimeFilter === 'tomorrow' && deliveryFilter === 'pending'
                      ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                      : "bg-amber-50/50 border-amber-100 hover:bg-amber-50/80 dark:border-gray-800"
                  )}
                >
                  <span className={cn("text-[10px] font-black uppercase tracking-tighter truncate w-full text-center leading-none", pendingTimeFilter === 'tomorrow' && deliveryFilter === 'pending' ? "text-white/80" : "text-amber-600")}>
                    {appLanguage === 'ms' ? 'Esok' : 'Tomorrow'}
                  </span>
                  <span className={cn("text-base font-black leading-none mt-1 sm:mt-1.5", pendingTimeFilter === 'tomorrow' && deliveryFilter === 'pending' ? "text-white" : "text-amber-700")}>{pendingStats.tomorrow}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryFilter('pending');
                    setCurrentTime(Date.now());
                    setPendingTimeFilter(pendingTimeFilter === '2days' ? 'all' : '2days');
                  }}
                  className={cn(
                    "flex-1 border rounded-xl p-1.5 flex flex-col items-center justify-center transition-all active:scale-95 duration-150 min-w-0 outline-none",
                    pendingTimeFilter === '2days' && deliveryFilter === 'pending'
                      ? "bg-indigo-500 text-white border-indigo-600 shadow-sm"
                      : "bg-indigo-50/50 border-indigo-100 hover:bg-indigo-50/80 dark:border-gray-800"
                  )}
                >
                  <span className={cn("text-[10px] font-black uppercase tracking-tighter truncate w-full text-center leading-none", pendingTimeFilter === '2days' && deliveryFilter === 'pending' ? "text-white/80" : "text-indigo-600")}>
                    {appLanguage === 'ms' ? '2 Hari' : '2 Days'}
                  </span>
                  <span className={cn("text-base font-black leading-none mt-1 sm:mt-1.5", pendingTimeFilter === '2days' && deliveryFilter === 'pending' ? "text-white" : "text-indigo-700")}>{pendingStats.day2}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryFilter('pending');
                    setCurrentTime(Date.now());
                    setPendingTimeFilter(pendingTimeFilter === '3days' ? 'all' : '3days');
                  }}
                  className={cn(
                    "flex-1 border rounded-xl p-1.5 flex flex-col items-center justify-center transition-all active:scale-95 duration-150 min-w-0 outline-none",
                    pendingTimeFilter === '3days' && deliveryFilter === 'pending'
                      ? "bg-blue-500 text-white border-blue-600 shadow-sm"
                      : "bg-blue-50/50 border-blue-100 hover:bg-blue-50/80 dark:border-gray-800"
                  )}
                >
                  <span className={cn("text-[10px] font-black uppercase tracking-tighter truncate w-full text-center leading-none", pendingTimeFilter === '3days' && deliveryFilter === 'pending' ? "text-white/80" : "text-blue-600")}>
                    {appLanguage === 'ms' ? '3 Hari' : '3 Days'}
                  </span>
                  <span className={cn("text-base font-black leading-none mt-1 sm:mt-1.5", pendingTimeFilter === '3days' && deliveryFilter === 'pending' ? "text-white" : "text-blue-700")}>{pendingStats.day3}</span>
                </button>
              </div>
            )}

            {(() => {
              const matchedItems = localizedHistoryItems;

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
                  {matchedItems.map((item) => {
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
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider ${relDetails.className}`}>
                                  {relDetails.text}
                                </span>
                              )}
                            </div>

                            <p className="font-bold text-sm sm:text-[13.5px] leading-tight text-[#111827]">
                              {item.state?.mainType === 'Lain-lain'
                                ? item.state?.customDoc
                                : item.state?.mainType}{' '}
                              {item.state?.isEditMode ? '(Edit)' : ''}
                              {item.state?.customerName
                                ? ` - ${formatCustomerName(item.state.customerName)}`
                                : ''}
                            </p>
                          </div>

                        <div className="flex items-center space-x-1.5 shrink-0 ml-1.5 cursor-default" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setConfirmAction({
                                title: appLanguage === 'ms' ? 'Padam Rekod?' : 'Delete Record?',
                                message: appLanguage === 'ms' 
                                  ? 'Adakah anda pasti mahu memadam rekod ini? Ia juga akan dipadamkan daripada Google Sheet anda.' 
                                  : 'Are you sure you want to delete this record? It will also be deleted from your Google Sheet.',
                                onConfirm: () => {
                                  const spreadsheetId = item.state?.spreadsheetId || state.spreadsheetId;
                                  const orderId = item.state?.orderId;
                                  if (spreadsheetId && orderId) {
                                    deleteOrderFromCloud(spreadsheetId, orderId);
                                  }
                                  deleteOrderFromHistory(item.id);
                                  setConfirmAction(null);
                                }
                              });
                            }}
                            className="relative z-20 w-8 h-8 pointer-events-auto bg-red-100/90 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white hover:scale-110 active:scale-90 transition-all shadow-xs duration-200"
                            title={appLanguage === 'ms' ? 'Padam' : 'Delete'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs mt-1 leading-normal">
                        <div className="w-full flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          {[
                            (item.state?.mainType === 'Resume' && !item.state?.isEditMode && item.state?.template) ? (
                              <span key="template" className="font-medium text-text">{item.state.template}</span>
                            ) : null,
                            item.state?.customerBahasa ? (
                              <span key="bahasa" className="font-medium text-text">{item.state.customerBahasa}</span>
                            ) : null,
                            item.state?.customerJenis ? (() => {
                              const val = String(item.state.customerJenis).toLowerCase();
                              let bColor = "text-gray-500 font-medium";
                              let displayVal = item.state.customerJenis;
                              if (val.includes('super')) { bColor = "text-super font-bold"; displayVal = "Super Urgent"; }
                              else if (val.includes('semi')) { bColor = "text-semi font-bold"; displayVal = "Semi Urgent"; }
                              else if (val.includes('normal') || val.includes('tak') || val.includes('not') || val.includes('tidak')) { bColor = "text-noturgent font-bold"; displayVal = appLanguage === 'ms' ? "Tak Urgent" : "Not Urgent"; }
                              else if (val.includes('urgent')) { bColor = "text-urgent font-bold"; displayVal = "Urgent"; }
                              return <span key="jenis" className={bColor}>{displayVal}</span>;
                            })() : null
                          ].filter(Boolean).map((part, index, array) => (
                            <React.Fragment key={index}>
                              {part}
                              {index < array.length - 1 && <span className="text-gray-300 font-bold mx-0.5">•</span>}
                            </React.Fragment>
                          ))}
                        </div>

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
                              href={`https://wa.me/${String(item.state.customerPhone).replace(/\D/g, '').startsWith('0') ? '6' + String(item.state.customerPhone).replace(/\D/g, '') : String(item.state.customerPhone).replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-blue-600 hover:underline hover:text-blue-700 bg-blue-50/50 px-1.5 py-0 rounded flex items-center space-x-1 inline-flex text-[10px]"
                              title={appLanguage === 'ms' ? 'Hubungi di WhatsApp' : 'Contact on WhatsApp'}
                            >
                              <Phone className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                              <span className="select-all font-mono">
                              {formatDisplayPhone(String(item.state.customerPhone))}
                            </span>
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

                        {item.state.syncStatus && (
                          <div className="w-full pt-2 mt-1.5 border-t border-dashed border-gray-100/80 flex items-start justify-between bg-gray-50/50 -mx-3 -mb-3 px-3 py-2 rounded-b-xl">
                            <div className="text-[9.5px] flex items-center">
                              {item.state.syncStatus === 'saved_locally' && <span className="text-gray-500 font-medium">Saved locally</span>}
                              {item.state.syncStatus === 'syncing' && <span className="text-blue-500 font-semibold animate-pulse flex items-center"><RefreshCcw className="w-2.5 h-2.5 mr-1 animate-spin" /> Syncing…</span>}
                              {item.state.syncStatus === 'synced' && <span className="text-emerald-600 font-bold flex items-center"><Check className="w-2.5 h-2.5 mr-1"/> Synced</span>}
                              {item.state.syncStatus === 'failed' && (
                                <button 
                                  type="button"
                                  className="text-red-600 font-bold hover:underline flex items-center active:scale-95 transition-transform"
                                  onClick={(e) => handleDeliveredToggle(e, item, isDelivered)}
                                >
                                  <AlertCircle className="w-2.5 h-2.5 mr-1" /> Sync failed — tap to retry
                                </button>
                              )}
                            </div>
                            {(item.state.syncLastSuccess || item.state.syncFailCount) && (
                              <div className="text-[8.5px] text-gray-400 text-right leading-tight">
                                {item.state.syncLastSuccess && <div>Last sync: <span className="font-medium text-gray-500">{new Date(item.state.syncLastSuccess).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>}
                                {!!item.state.syncFailCount && item.state.syncFailCount > 0 && <div className="text-red-400 font-medium mt-0.5">Failed attempts: {item.state.syncFailCount}</div>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    )}
  </div>
)}

{activeTab === 'drafts' && (
      <div className="space-y-4">
        <div className="mb-1">
          <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-100/50">
            <p className="text-xs text-blue-700 leading-relaxed font-medium">
              {appLanguage === 'ms' 
                ? 'Draf disimpan secara tempatan sahaja dan tidak dihantar ke Google Sheets. Tekan draf untuk memuatkan semula borang.' 
                : 'Drafts are saved locally only and are not sent to Google Sheets. Tap a draft to reload the form.'}
            </p>
          </div>
        </div>

        {drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-subtext space-y-4">
            <Save className="w-16 h-16 opacity-30" />
            <p className="font-bold">
              {appLanguage === 'ms' ? 'Tiada draf dijumpai' : 'No drafts found'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {drafts.map((draft) => {
              const date = new Date(draft.timestamp);
              const formattedDate = date.toLocaleString(appLanguage === 'ms' ? 'ms-MY' : 'en-US', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={draft.id}
                  onClick={() => loadDraft(draft)}
                  className="bg-surface border border-gray-200/60 rounded-xl p-3 flex flex-col space-y-2 hover:border-blue-300 hover:bg-blue-50/5 cursor-pointer active:scale-[0.995] transition-all shadow-sm"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-text truncate">
                        {draft.state.customerName || (appLanguage === 'ms' ? 'Tanpa Nama' : 'Untitled')}
                      </h4>
                      <p className="text-xs text-subtext font-medium">
                        {draft.state.mainType} • {formattedDate}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmAction({
                          title: appLanguage === 'ms' ? 'Padam Draf?' : 'Delete Draft?',
                          message: appLanguage === 'ms' 
                            ? 'Adakah anda pasti mahu memadam draf ini?' 
                            : 'Are you sure you want to delete this draft?',
                          onConfirm: () => {
                            deleteDraft(draft.id);
                            setConfirmAction(null);
                          }
                        });
                      }}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
                    {draft.state.customerOrder && (
                      <span className="text-[10px] bg-gray-100 text-subtext px-1.5 py-0.5 rounded font-bold">
                        {draft.state.customerOrder}
                      </span>
                    )}
                    {draft.state.customerJenis && (
                      <span className="text-[10px] bg-gray-100 text-subtext px-1.5 py-0.5 rounded font-bold">
                        {draft.state.customerJenis}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    )}

    {activeTab === 'remote' && (
      <div className="space-y-4 mt-2.5">
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
              <div className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 text-xs text-blue-800 leading-relaxed">
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
                  className="w-full text-xs bg-gray-50 font-mono rounded px-2.5 py-1.5 border border-gray-200 outline-none text-text focus:bg-white"
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
                            setConfirmAction({
                              title: appLanguage === 'ms' ? 'Padam Konfigurasi?' : 'Delete Configuration?',
                              message: appLanguage === 'ms' 
                                ? `Anda pasti mahu memadam konfigurasi tahun ${sheet.year}?` 
                                : `Are you sure you want to delete year ${sheet.year} configuration?`,
                              onConfirm: () => {
                                setAnnualSheets(prev => prev.filter((_, idx) => idx !== index));
                                setConfirmAction(null);
                              }
                            });
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
                          className="w-full text-xs bg-gray-50 font-mono rounded px-2.5 py-1.5 border border-gray-200 outline-none text-text focus:bg-white"
                        />
                        {sheet.spreadsheetId && (
                          <span className="text-[10px] text-green-600 block mt-1 font-semibold">
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
                  setAlertMsg({
                    type: 'success',
                    message: appLanguage === 'ms' 
                      ? 'Konfigurasi pautan database tahunan berjaya disimpan!' 
                      : 'Annual database configurations successfully saved!'
                  });
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
            <div className="flex items-center justify-between pl-1">
              <p className="text-[10px] font-bold text-subtext uppercase tracking-widest">
                {appLanguage === 'ms' 
                  ? `Hasil Carian (${remoteResults.length} Rekod)` 
                  : `Search Results (${remoteResults.length} Records)`}
              </p>
              <button 
                type="button"
                onClick={() => {
                  setRemoteResults([]);
                  setSearchQuery('');
                }}
                className="text-[10px] font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 uppercase tracking-widest px-2 py-1 rounded transition-colors flex flex-shrink-0 items-center justify-center"
                id="btn-clear-search"
              >
                {appLanguage === 'ms' ? 'Padam Carian' : 'Clear Results'}
              </button>
            </div>

            {remoteResults.map((item, idx) => {
              const isDelivered = !!item.isDelivered;
              const orderId = item.orderId || `REMOTE-${idx}`;

              return (
                <div
                  key={orderId + '-' + idx}
                  onClick={() => handleLoadRemoteOrder(item)}
                  className={`bg-surface border relative overflow-hidden ${
                    isDelivered
                      ? 'border-blue-100 bg-blue-50/5 hover:border-blue-200'
                      : 'border-gray-200/60 hover:border-gray-300 shadow-sm'
                  } rounded-xl p-2.5 flex flex-col space-y-1 hover:bg-gray-50/65 cursor-pointer active:scale-[0.995] transition-all duration-200`}
                >
                  {/* Left Accent Bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r ${isDelivered ? 'bg-blue-400' : 'bg-gray-300'}`} />

                  <div className="pl-1.5">
                    <div className="flex justify-between items-start border-b border-gray-100/60 pb-1">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-1 mb-0.5">
                          <div
                            className={`flex items-center ${
                              isDelivered
                                ? 'text-blue-500 font-bold'
                                : 'text-primary/75 font-semibold'
                            } text-[10px] sm:text-[10.5px] uppercase tracking-wider`}
                          >
                            {isDelivered ? (
                              <Check className="w-3 h-3 mr-1 text-blue-500" />
                            ) : (
                              <Calendar className="w-3 h-3 mr-1" />
                            )}
                            {item.due || (appLanguage === 'ms' ? 'Tiada Tarikh' : 'No Date')}

                            {isDelivered && (
                              <span className="ml-1 text-blue-500 lowercase">
                                ({appLanguage === 'ms' ? 'Dihantar' : 'Delivered'})
                              </span>
                            )}
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-purple-100 text-purple-700">
                            <Database className="w-2.5 h-2.5 inline mr-0.5" />
                            {item.sheetName || 'Google Sheet'}
                          </span>
                        </div>

                        <p className="font-bold text-sm sm:text-[13.5px] leading-tight text-[#111827]">
                          {item.order === 'Lain-lain' || item.order === 'Lain2'
                            ? item.order
                            : item.order}
                          {item.name ? ` - ${formatCustomerName(item.name)}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs mt-1 leading-normal">
                      <div className="w-full flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        {[
                          item.template ? (
                            <span key="template" className="font-medium text-[#374151]">{item.template}</span>
                          ) : null,
                          item.bahasa ? (
                            <span key="bahasa" className="font-medium text-[#374151]">{item.bahasa}</span>
                          ) : null,
                          item.jenis ? (() => {
                            const val = String(item.jenis).toLowerCase();
                            let bColor = "text-gray-500 font-medium";
                            let displayVal = item.jenis;
                            if (val.includes('super')) { bColor = "text-super font-bold"; displayVal = "Super Urgent"; }
                            else if (val.includes('semi')) { bColor = "text-semi font-bold"; displayVal = "Semi Urgent"; }
                            else if (val.includes('normal') || val.includes('tak') || val.includes('not') || val.includes('tidak')) { bColor = "text-noturgent font-bold"; displayVal = appLanguage === 'ms' ? "Tak Urgent" : "Not Urgent"; }
                            else if (val.includes('urgent')) { bColor = "text-urgent font-bold"; displayVal = "Urgent"; }
                            return <span key="jenis" className={bColor}>{displayVal}</span>;
                          })() : null
                        ].filter(Boolean).map((part, index, array) => (
                          <React.Fragment key={index}>
                            {part}
                            {index < array.length - 1 && <span className="text-gray-300 font-bold mx-0.5">•</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5 mt-1 text-[11.5px] text-subtext leading-snug">
                      {item.addon && (
                        <div className="truncate">
                          <span className="font-semibold text-gray-500">{(appLanguage === 'ms' ? 'Tambahan: ' : 'Add On: ')}</span>
                          <span className="text-gray-700 font-medium">{item.addon}</span>
                        </div>
                      )}
                      
                      {item.phone && (
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <span className="font-semibold text-gray-500">{appLanguage === 'ms' ? 'Tel:' : 'Phone:'}</span>
                          <a
                            href={`https://wa.me/${String(item.phone).replace(/\D/g, '').startsWith('0') ? '6' + String(item.phone).replace(/\D/g, '') : String(item.phone).replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold text-blue-600 hover:underline hover:text-blue-700 bg-blue-50/50 px-1.5 py-0 rounded flex items-center space-x-1 inline-flex text-[10px]"
                            title={appLanguage === 'ms' ? 'Hubungi di WhatsApp' : 'Contact on WhatsApp'}
                          >
                            <Phone className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                            <span className="select-all font-mono">
                              {formatDisplayPhone(item.phone)}
                            </span>
                          </a>
                        </div>
                      )}

                      {item.orderId && (
                        <div className="mt-0.5"><span className="font-semibold text-gray-500">ID:</span> <span className="font-mono text-[10.5px] font-semibold text-text/80 bg-gray-55 px-1 rounded">{item.orderId}</span></div>
                      )}

                      {item.link && (
                        <div className="w-full pt-1">
                          <span className="font-semibold text-gray-500">Link:</span>{' '}
                          <div className="flex flex-col gap-0.5">
                            {item.link
                              .split(/[\n,]+/)
                              .filter(Boolean)
                              .map((lnk: string, lIdx: number) => (
                                <a
                                  key={lIdx}
                                  href={lnk.trim()}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-500 hover:underline font-medium truncate inline-block max-w-[200px] sm:max-w-[300px] text-[10.5px]"
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

                    <div className="w-full pt-1.5 mt-1 border-t border-gray-100/65 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={(e) => handleRemoteDeliveredToggle(e, idx, item)}
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
                    </div>

                    {item.syncStatus && (
                      <div className="w-full pt-2 mt-1.5 border-t border-dashed border-gray-100/80 flex items-start justify-between bg-gray-50/50 -mx-3 -mb-3 px-3 py-2 rounded-b-xl">
                        <div className="text-[9.5px] flex items-center">
                          {item.syncStatus === 'syncing' && <span className="text-blue-500 font-semibold animate-pulse flex items-center"><RefreshCcw className="w-2.5 h-2.5 mr-1 animate-spin" /> Syncing…</span>}
                          {item.syncStatus === 'synced' && <span className="text-emerald-600 font-bold flex items-center"><Check className="w-2.5 h-2.5 mr-1"/> Synced</span>}
                          {item.syncStatus === 'failed' && (
                            <button 
                              type="button"
                              className="text-red-600 font-bold hover:underline flex items-center active:scale-95 transition-transform"
                              onClick={(e) => handleRemoteDeliveredToggle(e, idx, item)}
                            >
                              <AlertCircle className="w-2.5 h-2.5 mr-1" /> Sync failed — tap to retry
                            </button>
                          )}
                        </div>
                        {(item.syncLastSuccess || item.syncFailCount) && (
                          <div className="text-[8.5px] text-gray-400 text-right leading-tight">
                            {item.syncLastSuccess && <div>Last sync: <span className="font-medium text-gray-500">{new Date(item.syncLastSuccess).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>}
                            {!!item.syncFailCount && item.syncFailCount > 0 && <div className="text-red-400 font-medium mt-0.5">Failed attempts: {item.syncFailCount}</div>}
                          </div>
                        )}
                      </div>
                    )}
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

  {confirmAction && createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setConfirmAction(null)}
      />

      <div className="relative bg-white rounded-3xl p-6 w-full max-w-[320px] shadow-2xl animate-fade-in-up">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-2">
            <AlertCircle className="w-6 h-6" />
          </div>

          <h3 className="text-lg font-bold text-text">
            {confirmAction.title || (appLanguage === 'ms' ? 'Pasti?' : 'Are you sure?')}
          </h3>

          <p className="text-sm text-subtext pb-4">
            {confirmAction.message}
          </p>

          <div className="flex w-full space-x-3">
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="flex-1 py-3 px-4 rounded-full font-bold text-sm text-text bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all"
            >
              {appLanguage === 'ms' ? 'Batal' : 'Cancel'}
            </button>

            <button
              type="button"
              onClick={confirmAction.onConfirm}
              className="flex-1 py-3 px-4 rounded-full font-bold text-sm text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all"
            >
              {appLanguage === 'ms' ? 'Padam' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )}

  {alertMsg && createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setAlertMsg(null)}
      />
      <div className="relative bg-white rounded-3xl p-6 w-full max-w-[320px] shadow-2xl animate-fade-in-up">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
            alertMsg.type === 'error' ? 'bg-red-100 text-red-500' :
            alertMsg.type === 'success' ? 'bg-green-100 text-green-500' :
            'bg-blue-100 text-blue-500'
          }`}>
            {alertMsg.type === 'success' ? <Check className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
          </div>
          {alertMsg.title && (
            <h3 className="text-lg font-bold text-text">
              {alertMsg.title}
            </h3>
          )}
          <p className="text-sm text-subtext pb-4">
            {alertMsg.message}
          </p>
          <button
            type="button"
            onClick={() => setAlertMsg(null)}
            className="w-full py-3 px-4 rounded-full font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all"
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  )}
</div>
  );
}