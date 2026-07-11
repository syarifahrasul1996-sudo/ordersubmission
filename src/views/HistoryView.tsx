import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../cn';
import { Clock, Trash2, Calendar, AlertCircle, RefreshCcw, Save, Bell, Check, Search, Database, Phone, Settings, ChevronDown, ChevronUp, Link, X, ArrowRight, Zap } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { OrderHistoryItem } from '../types';
import { formatPhoneUniversal, parseDateStringToTimestamp } from '../utils';
import { getOperationalOrders, getOverdueOrders, getArchivedOrders, isFirestoreCanary, saveOrderToFirestore, deleteOrderFromFirestore } from '../services/firestoreOrders';


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
  const d1 = new Date(orderTime);
  const d2 = new Date();

  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  const diffDays = Math.round((utc1 - utc2) / (1000 * 60 * 60 * 24));
  
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

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const num = Number(value.trim());
    if (Number.isFinite(num)) {
      return num;
    }
  }

  if (typeof value !== 'string' || !value.trim()) {
    return 0;
  }

  return parseDateStringToTimestamp(value, 0).timestamp;
};

const getBestDueTimestamp = (item: any): number => {
  if (!item) return 0;

  const customerDue = String(item.state?.customerDue ?? '').trim();
  if (customerDue) {
    const parsed = parseDateStringToTimestamp(customerDue, 0).timestamp;
    if (parsed > 0) {
      return parsed;
    }
  }
  
  const dueTimestamp = Number(item.state?.dueTimestamp);
  if (Number.isFinite(dueTimestamp) && dueTimestamp > 0) {
    return dueTimestamp;
  }
  
  return Number(item.timestamp) || 0;
};

const isDeliveredState = (item: any): boolean => {
  if (!item || !item.state) return false;
  const val = item.state.isDelivered;
  return val === true || val === 'true' || val === 1 || val === '1';
};

const isDeletedState = (item: any): boolean => {
  if (!item || !item.state) return false;
  const val = item.state.isDeleted;
  return val === true || val === 'true' || val === 1 || val === '1';
};

const getOrderTypeDisplay = (state: any) => {
  const mainType = String(state?.mainType || '').trim();
  const customDoc = String(state?.customDoc || '').trim();
  const customerOrder = String(state?.customerOrder || '').trim();
  const order = String(state?.order || '').trim();
  const jenisTempahan = String(state?.jenisTempahan || '').trim();

  if (mainType && mainType !== 'Lain-lain') {
    return mainType;
  }

  return customDoc || customerOrder || order || jenisTempahan || 'Lain-lain';
};

export function HistoryView() {
  const {
    state,
    history,
    setHistory,
    clearHistory,
    deleteOrderFromHistory,
    restoreOrderFromHistory,
    permanentlyDeleteOrderFromHistory,
    loadOrder,
    drafts,
    deleteDraft,
    loadDraft,
    pushView,
    appLanguage,
    updateSpecificHistoryItem,
    updateOrderHistoryState,
    addToOfflineQueue,
    syncOfflineQueue,
    deletedOrderIds,
    historyDeliveryFilter,
    setHistoryDeliveryFilter,
    historyPendingTimeFilter,
    setHistoryPendingTimeFilter,
    setLastSyncTime,
    setLastSyncFetchedCount,
    setSyncError
  } = useAppContext();
  const historyRef = useRef(history);
  const deletedOrderIdsRef = useRef(deletedOrderIds);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    deletedOrderIdsRef.current = deletedOrderIds;
  }, [deletedOrderIds]);

  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [confirmAction, setConfirmAction] = useState<{ 
    title?: string; 
    message: string; 
    onConfirm: () => void | Promise<void>; 
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ title?: string; message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [syncErrorToast, setSyncErrorToast] = useState<{ message: string; visible: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const deliveryFilter = historyDeliveryFilter;
  const setDeliveryFilter = setHistoryDeliveryFilter;
  const pendingTimeFilter = historyPendingTimeFilter;
  const setPendingTimeFilter = setHistoryPendingTimeFilter;
  const [activeTab, setActiveTab] = useState<'local' | 'remote' | 'drafts' | 'trash'>('local');
  const [searchQuery, setSearchQuery] = useState('');
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

  const deduplicatedHistory = useMemo(() => {
    const map = new Map();
    history.forEach(item => {
      const state = item.state as any;
      if (!state) return;
      const orderId = state.orderId;
      const historyId = state.historyId;
      const id = item.id;
      
      const key = orderId || historyId || id;
      if (!key) return;
      
      if (!map.has(key)) {
        map.set(key, item);
      } else {
        const existing = map.get(key);
        if (Number(item.timestamp) > Number(existing.timestamp)) {
          map.set(key, item);
        }
      }
    });
    return Array.from(map.values());
  }, [history]);

  const localizedHistoryItems = useMemo(() => {
    return deduplicatedHistory.filter(Boolean).filter((item) => {
      if (!item || !item.state) return false;
      
      const isDelivered = isDeliveredState(item);
      const isDeleted = isDeletedState(item);
      
      if (isDeleted) return false;
      // whatever only saved locally, that is a draft. dont take into account
      if (item.state.syncStatus === 'draft') return false;

      // Filter out "empty" orders
      const state = item.state as any;
      const hasName = String(state?.customerName || state?.name || '').trim();
      const hasOrder = String(state?.customerOrder || state?.order || state?.jenisTempahan || state?.mainType || '').trim();
      const hasPhone = String(state?.customerPhone || state?.phone || '').trim();
      if (!hasName && !hasOrder && !hasPhone) return false;

      const orderId = item.state?.orderId;
      const id = item.id;
      if (deletedOrderIds && (deletedOrderIds.includes(id) || (orderId && deletedOrderIds.includes(orderId)))) {
        return false;
      }
      if (deliveryFilter === 'delivered' && !isDelivered) return false;
      if (deliveryFilter === 'pending' && isDelivered) return false;
      
      // If pending filter is active, apply sub-time filters
      if (deliveryFilter === 'pending' && pendingTimeFilter !== 'all') {
        const orderTime = getBestDueTimestamp(item);
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
      
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = String(item.state?.customerName || '').toLowerCase().includes(query);
        const idMatch = String(item.state?.orderId || '').toLowerCase().includes(query);
        const phoneMatch = String(item.state?.customerPhone || '').toLowerCase().includes(query);
        const orderTypeMatch = getOrderTypeDisplay(item.state).toLowerCase().includes(query);
        const templateMatch = String(item.state?.template || item.state?.customerTemplate || '').toLowerCase().includes(query);
        const addonMatch = String(item.state?.customerAddOn || '').toLowerCase().includes(query);
        
        if (!nameMatch && !idMatch && !phoneMatch && !orderTypeMatch && !templateMatch && !addonMatch) {
          return false;
        }
      }

      // Date filter: only apply the active date window (2 days before and 3 days after) for 'all' or 'delivered' views.
      // For 'pending' views, we want to see ALL pending orders so that overdue or far-future pending orders are not hidden.
      // If there is an active search query, bypass the date window filter to allow searching the entire history.
      if (deliveryFilter !== 'pending' && !searchQuery.trim()) {
        const orderTimeVal = getBestDueTimestamp(item);
        const now = new Date(currentTime);
        
        const minDate = new Date(now);
        minDate.setDate(now.getDate() - 2);
        minDate.setHours(0, 0, 0, 0);

        const maxDate = new Date(now);
        maxDate.setDate(now.getDate() + 3);
        maxDate.setHours(23, 59, 59, 999);

        if (orderTimeVal < minDate.getTime() || orderTimeVal > maxDate.getTime()) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const aDelivered = isDeliveredState(a);
      const bDelivered = isDeliveredState(b);

      const now = currentTime;

      // Read the visible due date again first using our robust helper.
      const aDue = getBestDueTimestamp(a) || now;
      const bDue = getBestDueTimestamp(b) || now;

      // 1. Standard pending orders appear above delivered orders
      if (!aDelivered && bDelivered) return -1;
      if (aDelivered && !bDelivered) return 1;

      if (!aDelivered) {
        // Pending orders: earliest due date first (chronological order)
        if (aDue !== bDue) {
          return aDue - bDue;
        }

        // If both have the same due date, show the latest edited order first
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
  }, [deduplicatedHistory, deliveryFilter, searchQuery, currentTime]);

  const filteredDrafts = useMemo(() => {
    // Combine drafts and unsynced history items (which are drafts/saved locally only)
    const unsyncedHistory = history.filter(item => item && item.state && item.state.syncStatus !== 'synced');
    const seenIds = new Set<string>();
    const combined: OrderHistoryItem[] = [];

    [...drafts, ...unsyncedHistory].forEach(item => {
      if (!item) return;
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        combined.push(item);
      }
    });

    if (!searchQuery.trim()) return combined;
    const query = searchQuery.toLowerCase().trim();
    return combined.filter(draft => {
      const s = draft.state;
      if (!s) return false;
      const nameMatch = String(s.customerName || '').toLowerCase().includes(query);
      const phoneMatch = String(s.customerPhone || '').toLowerCase().includes(query);
      const typeMatch = String(s.mainType || '').toLowerCase().includes(query);
      const orderMatch = String(s.customerOrder || '').toLowerCase().includes(query);
      return nameMatch || phoneMatch || typeMatch || orderMatch;
    });
  }, [drafts, history, searchQuery]);

  const filteredTrash = useMemo(() => {
    const deletedItems = history.filter(item => isDeletedState(item) && item.state?.syncStatus !== 'draft');
    if (!searchQuery.trim()) return deletedItems;
    const query = searchQuery.toLowerCase().trim();
    return deletedItems.filter(item => {
      const nameMatch = String(item.state?.customerName || item.state?.name || '').toLowerCase().includes(query);
      const idMatch = String(item.state?.orderId || '').toLowerCase().includes(query);
      const phoneMatch = String(item.state?.customerPhone || '').toLowerCase().includes(query);
      return nameMatch || idMatch || phoneMatch;
    });
  }, [history, searchQuery]);

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
    deduplicatedHistory.forEach(item => {
      if (!item || !item.state) return;
      if (item.state.syncStatus === 'draft' || item.state.status === 'draft') return; // whatever only saved locally, that is a draft. dont take into account
      
      // Filter out empty orders from counts
      const state = item.state as any;
      const hasName = String(state?.customerName || state?.name || '').trim();
      const hasOrder = String(state?.customerOrder || state?.order || state?.jenisTempahan || state?.mainType || '').trim();
      const hasPhone = String(state?.customerPhone || state?.phone || '').trim();
      if (!hasName && !hasOrder && !hasPhone) return;

      const isDelivered = item.state.isDelivered === true || item.state.isDelivered === 'true' || item.state.isDelivered === 1 || item.state.isDelivered === '1';
      const isDeleted = item.state.isDeleted === true || item.state.isDeleted === 'true' || item.state.isDeleted === 1 || item.state.isDeleted === '1';

      
      if (isDeleted || isDelivered) return;
      const orderId = item.state?.orderId;
      const id = item.id;
      if (deletedOrderIds && (deletedOrderIds.includes(id) || (orderId && deletedOrderIds.includes(orderId)))) {
        return;
      }
      
      const due = getBestDueTimestamp(item);
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
  }, [deduplicatedHistory, currentTime, deletedOrderIds]);

  const extractId = (input: string) => {
    const trimmed = input.trim();
    if (trimmed.includes('docs.google.com/spreadsheets/d/')) {
      const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
      return match ? match[1] : trimmed;
    }
    return trimmed;
  };

  const getActiveScriptUrl = (sId?: string) => {
    if (globalScriptUrl && globalScriptUrl.trim() !== '') {
      return globalScriptUrl.trim();
    }
    if (sId) {
      const targetId = extractId(sId);
      const found = annualSheets.find((s: any) => extractId(s.spreadsheetId) === targetId);
      if (found && found.scriptUrl && found.scriptUrl.trim() !== '') {
        return found.scriptUrl.trim();
      }
    }
    const firstActive = annualSheets.find((s: any) => s.scriptUrl && s.scriptUrl.trim() !== '');
    if (firstActive) {
      return firstActive.scriptUrl.trim();
    }
    return GOOGLE_SCRIPT_URL;
  };

  const jsonpRequest = async (url: URL, callbackName: string) => {
    // Try standard fetch GET first as it is much more robust against ad-blockers and CSP that block dynamic scripts
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for fetch
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const text = await response.text();
        const match = text.match(/^[a-zA-Z0-9_]+\(([\s\S]*)\);?\s*$/);
        if (match) {
          try {
            return JSON.parse(match[1]);
          } catch (err) {
            console.warn('JSONP regex match parse failed', err);
          }
        } else {
          try {
            return JSON.parse(text);
          } catch (err) {
            console.warn('JSONP response body raw parse failed', err);
          }
        }
      }
    } catch (fetchErr) {
      console.warn('Fetch JSONP fallback failed, trying dynamic script injection:', fetchErr);
    }

    // Fallback to traditional script injection JSONP
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
    currentStatus: boolean,
    isRetry = false
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const spreadsheetId = item.state?.spreadsheetId || state.spreadsheetId;
    const orderId = item.state?.orderId;
    const newStatus = isRetry ? currentStatus : !currentStatus;
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

    // 2. If Firestore is active, save to Firestore and return
    if (isFirestoreCanary) {
      try {
        const updatedState = {
          ...item.state,
          isDelivered: newStatus,
          lastModifiedLocally: now,
          syncStatus: 'synced' as const,
          syncLastSuccess: now,
          syncFailCount: 0
        };
        await saveOrderToFirestore(updatedState);
        updateSpecificHistoryItem(item.id, {
          isDelivered: newStatus,
          syncStatus: 'synced',
          syncLastSuccess: now,
          syncFailCount: 0
        });
        handleGlobalSync(true);
      } catch (err) {
        console.error("Failed to save delivery toggle in Firestore:", err);
        updateSpecificHistoryItem(item.id, {
          isDelivered: newStatus,
          syncStatus: 'failed',
          syncFailCount: (item.state?.syncFailCount || 0) + 1,
          syncLastAttempt: now,
        });
      }
      return;
    }

    // 3. If spreadsheetId and orderId are configured, gently sync update with Google Sheets in background
    if (spreadsheetId && orderId) {
      const activeUrl = getActiveScriptUrl(spreadsheetId);
      const callbackName = 'jsonp_callback_delivered_' + Math.round(Math.random() * 100000);
      const url = new URL(activeUrl);

      url.searchParams.append('action', 'update_delivered');
      url.searchParams.append('spreadsheetId', spreadsheetId);
      url.searchParams.append('orderId', orderId);
      url.searchParams.append('isDelivered', String(newStatus));
      url.searchParams.append('callback', callbackName);

      const triggerPostFallback = () => {
        fetch(activeUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify({
            action: 'update_delivered',
            spreadsheetId: spreadsheetId,
            orderId: orderId,
            isDelivered: newStatus
          })
        }).then(() => {
          updateSpecificHistoryItem(item.id, {
            syncStatus: 'synced',
            syncLastSuccess: Date.now(),
            syncFailCount: 0,
          });
        }).catch(postErr => {
          console.error("POST delivered status fallback failed, queuing for offline:", postErr);
          addToOfflineQueue({
            action: 'update_delivered',
            spreadsheetId: spreadsheetId,
            orderId: orderId,
            isDelivered: newStatus
          }, activeUrl, item.id);
          updateSpecificHistoryItem(item.id, {
            syncStatus: 'failed',
            syncFailCount: (item.state?.syncFailCount || 0) + 1,
            syncLastAttempt: Date.now(),
          });
        });
      };

      try {
        const result = await jsonpRequest(url, callbackName);
        if (!result || result.status !== 'success') {
          console.warn('Synced status check warning, trying POST fallback:', result?.message || 'Update failed');
          triggerPostFallback();
        } else {
          updateSpecificHistoryItem(item.id, {
             syncStatus: 'synced',
             syncLastSuccess: Date.now(),
             syncFailCount: 0,
          });
          handleGlobalSync(true);
        }
      } catch (err) {
        console.warn('Failed to sync delivered status update in background, running POST fallback:', err);
        triggerPostFallback();
      }
    }
  };

  const deleteOrderFromCloud = async (spreadsheetId: string, orderId: string) => {
    if (isFirestoreCanary) {
      if (orderId) {
        await deleteOrderFromFirestore(orderId);
      }
      return;
    }
    if (spreadsheetId && orderId) {
      const activeUrl = getActiveScriptUrl(spreadsheetId);
      const callbackName = 'jsonp_callback_delete_' + Math.round(Math.random() * 100000);
      const url = new URL(activeUrl);

      url.searchParams.append('action', 'delete_order');
      url.searchParams.append('spreadsheetId', spreadsheetId);
      url.searchParams.append('orderId', orderId);
      url.searchParams.append('callback', callbackName);

      const triggerPostFallback = async () => {
        try {
          await fetch(activeUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({
              action: 'delete_order',
              spreadsheetId: spreadsheetId,
              orderId: orderId
            })
          });
        } catch (postErr) {
          console.error("POST delete fallback failed, queuing for offline:", postErr);
          addToOfflineQueue({
            action: 'delete_order',
            spreadsheetId: spreadsheetId,
            orderId: orderId
          }, activeUrl);
        }
      };

      try {
        const resp = await jsonpRequest(url, callbackName);
        if (resp && resp.status === 'success') {
        } else {
          console.warn('JSONP deletion failed, attempting POST fallback:', resp);
          await triggerPostFallback();
        }
      } catch (err) {
        console.warn('Failed to delete order from cloud via JSONP, running fallback:', err);
        await triggerPostFallback();
      }
    }
  };

  const handleGlobalSync = async (silent = false) => {
    setRefreshing(true);
    setSyncErrorToast(null);

    // Wait for offline queue to attempt to clear before pulling results
    await syncOfflineQueue();

    try {
      if (isFirestoreCanary) {
        const [op, ov, arch] = await Promise.all([
          getOperationalOrders().catch(() => []),
          getOverdueOrders().catch(() => []),
          getArchivedOrders().catch(() => [])
        ]);

        const allFirestoreOrders = [...op, ...ov, ...arch];
        
        setHistory(prevHistory => {
          let updatedHistory = [...prevHistory];
          
          for (const order of allFirestoreOrders) {
            const generatedOrderId = order.orderId || order.historyId;
            if (!generatedOrderId) continue;
            
            // Skip if deleted locally
            if (deletedOrderIdsRef.current.includes(generatedOrderId)) {
              continue;
            }

            const existingIdx = updatedHistory.findIndex(item => item.id === generatedOrderId || item.state?.orderId === generatedOrderId);

            const newState = {
              ...order,
              syncStatus: 'synced' as const,
              mainType: order.customerOrder === 'Resume' ? 'Resume' : (order.customerOrder === 'Surat' ? 'Surat' : order.customerOrder || 'Lain-lain'),
              subType: ''
            };

            if (existingIdx !== -1) {
              const existingItem = updatedHistory[existingIdx];
              if (isDeletedState(existingItem)) {
                continue;
              }
              updatedHistory[existingIdx] = {
                ...existingItem,
                state: {
                  ...existingItem.state,
                  ...newState,
                  syncStatus: 'synced'
                }
              };
            } else {
              updatedHistory.push({
                id: generatedOrderId,
                timestamp: Date.now(),
                state: newState,
                messages: []
              });
            }
          }
          return updatedHistory;
        });

        const firestoreCount = allFirestoreOrders.length;
        setLastSyncTime(Date.now());
        localStorage.setItem('db_last_sync_time', String(Date.now()));
        setLastSyncFetchedCount(firestoreCount);
        localStorage.setItem('db_sync_total_items', String(firestoreCount));
        setSyncError(null);
        localStorage.removeItem('db_sync_error');

        if (!silent) {
          setAlertMsg({
            type: 'success',
            message: appLanguage === 'ms'
              ? 'Penyelarasan Firestore Canary berjaya!'
              : 'Firestore Canary sync complete!'
          });
        }
        setRefreshing(false);
        setPullProgress(0);
        return;
      }

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
        setRefreshing(false);
        setPullProgress(0);
        return;
      }

      const currentNow = Date.now();
      let totalNewCou = 0;
      let totalUpdCou = 0;

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
            return { year: sheet.year, orders: data.orders, spreadsheetId: sId, success: true };
          }
          return { year: sheet.year, orders: [], spreadsheetId: sId, success: false, error: data?.message || 'Invalid format' };
        } catch (e) {
          console.warn(`Sync failed for year ${sheet.year}:`, e);
          return { year: sheet.year, orders: [], spreadsheetId: sId, success: false, error: String(e) };
        }
      });

      const results = await Promise.all(fetchPromises);

      setHistory(prevHistory => {
        let updatedHistory = [...prevHistory];

        for (const res of results) {
          if (!res.success) continue;

          // 1. Collect all order IDs that exist in the fetched sheet results
          const fetchedOrderIds = new Set(res.orders.map(o => o.orderId).filter(Boolean));

          // 2. We can detect if any local synced order is MISSING from the fetched results AND lies in the date range.
          // Let's compute the sync date range boundaries exactly matching the Apps Script:
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const startDate = new Date(today);
          startDate.setDate(today.getDate() - 2);

          const endDate = new Date(today);
          endDate.setDate(today.getDate() + 3);
          endDate.setHours(23, 59, 59, 999);

          updatedHistory = updatedHistory.map(item => {
            const itemOrderId = item.state?.orderId;
            const itemSpreadsheetId = item.state?.spreadsheetId;
            const itemDue = item.state?.customerDue;

            let itemDueTimestamp = item.state?.dueTimestamp;
            if (!itemDueTimestamp && itemDue) {
              itemDueTimestamp = parseDueTimestamp(itemDue);
            }

            // If this item was successfully synced to the current spreadsheet before
            // AND its due date falls in the range [startDate, endDate]
            // AND it is NOT marked as deleted locally yet
            // AND its orderId is NOT in the fetched sheet orders list:
            if (
              itemSpreadsheetId === res.spreadsheetId &&
              itemOrderId &&
              !itemOrderId.startsWith('SYNC-') &&
              itemDueTimestamp &&
              itemDueTimestamp >= startDate.getTime() &&
              itemDueTimestamp <= endDate.getTime() &&
              !isDeletedState(item) &&
              item.state?.syncStatus === 'synced' &&
              !fetchedOrderIds.has(itemOrderId)
            ) {
              return {
                ...item,
                state: {
                  ...item.state,
                  isDeleted: true
                }
              };
            }
            return item;
          });

          for (const orderData of res.orders) {
            const generatedOrderId =
              orderData.orderId ||
              `SYNC-${orderData.name || 'UNKNOWN'}-${orderData.phone || ''}-${orderData.due || ''}`
                .replace(/\s+/g, '-')
                .replace(/[^a-zA-Z0-9-]/g, '');

            // Use the up-to-date deletedOrderIds ref to skip any deleted items
            if (deletedOrderIdsRef.current.includes(generatedOrderId)) {
              continue;
            }

            const normalizeText = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const normalizePhone = (value: unknown) =>
  String(value || '').replace(/\D/g, '');

const normalizeDue = (value: unknown) => {
  const timestamp = parseDueTimestamp(value);
  return timestamp ? String(timestamp) : normalizeText(value);
};

const existingIdx = updatedHistory.findIndex((item) => {
  const localState = item.state || {};

  // First choice: exact permanent Order ID.
  if (
    localState.orderId === generatedOrderId ||
    item.id === generatedOrderId
  ) {
    return true;
  }

  const localId = String(localState.orderId || item.id || '');
  const isLocalTemp = localId.startsWith('SYNC-') || localId.startsWith('draft_') || !localId;
  const isRemoteTemp = generatedOrderId.startsWith('SYNC-') || !generatedOrderId;

  // Content matching is only allowed if at least one side has a temporary ID or if unsynced.
  const canUseFallback =
    isLocalTemp ||
    isRemoteTemp ||
    localState.syncStatus === 'syncing' ||
    localState.syncStatus === 'failed' ||
    localState.syncStatus === 'saved_locally' ||
    localState.syncStatus === 'sent_unverified';

  if (!canUseFallback) {
    return false;
  }

  const sameSpreadsheet =
    !localState.spreadsheetId ||
    localState.spreadsheetId === res.spreadsheetId;

  const sameName =
    normalizeText(localState.customerName) ===
    normalizeText(orderData.name);

  const samePhone =
    normalizePhone(localState.customerPhone) ===
    normalizePhone(orderData.phone);

  const sameDue =
    normalizeDue(localState.customerDue || localState.dueTimestamp) ===
    normalizeDue(orderData.due);

  const sameOrder =
    normalizeText(localState.customerOrder || localState.mainType) ===
    normalizeText(orderData.order);

  return (
    sameSpreadsheet &&
    sameName &&
    samePhone &&
    sameDue &&
    sameOrder
  );
});

            const dueTs = parseDueTimestamp(orderData.due);

            let parsedName = orderData.name ? String(orderData.name).trim() : '';
            parsedName = parsedName.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
            
            let parsedTemplate = orderData.template ? String(orderData.template).trim().toUpperCase() : '';

            const newState = {
              isDelivered: !!orderData.isDelivered,
              spreadsheetId: res.spreadsheetId,
              customerName: parsedName,
              customerPhone: orderData.phone,
              customerOrder: orderData.order,
              template: parsedTemplate,
              customerTemplate: parsedTemplate,
              customerBahasa: orderData.bahasa,
              customerAddOn: orderData.addon,
              customerJenis: orderData.jenis,
              customerDue: orderData.due,
              orderLink: orderData.link,
              googleSheetLink: orderData.link,
              orderId: generatedOrderId,
              dueTimestamp: dueTs,
              syncStatus: 'synced' as const,
              syncLastSuccess: currentNow,
              mainType:
                orderData.order === 'Resume'
                  ? 'Resume'
                  : orderData.order === 'Surat'
                  ? 'Surat'
                  : orderData.order || 'Lain-lain',
              subType: ''
            };

            if (existingIdx !== -1) {
              const existingItem = updatedHistory[existingIdx];

              if (isDeletedState(existingItem)) {
                const activeSheet = annualSheets.find(s => s.spreadsheetId === res.spreadsheetId);
                if (activeSheet) {
                  addToOfflineQueue({
                    action: 'delete_order',
                    spreadsheetId: res.spreadsheetId,
                    orderId: generatedOrderId
                  }, activeSheet.scriptUrl);
                }
                continue;
              }

              const localState = existingItem.state || {};
              const isUnsynced = localState.syncStatus !== 'synced';

              const localDelivered = localState.isDelivered === true || localState.isDelivered === 'true' || localState.isDelivered === 1 || localState.isDelivered === '1';
              const remoteDelivered = !!newState.isDelivered;

              const hasDiff = 
                localDelivered !== remoteDelivered ||
                String(localState.customerName || '') !== String(newState.customerName || '') ||
                String(localState.customerPhone || '') !== String(newState.customerPhone || '') ||
                String(localState.customerOrder || '') !== String(newState.customerOrder || '') ||
                String(localState.customerTemplate || '') !== String(newState.customerTemplate || '') ||
                String(localState.customerDue || '') !== String(newState.customerDue || '') ||
                String(localState.orderLink || '') !== String(newState.orderLink || '');

              if (hasDiff) {
                if (!isUnsynced) {
                  // If the item was recently toggled or edited locally (within 30 seconds),
                  // we temporarily protect the local UI state from flickering to old values
                  // while Google Sheets/script cache catches up. Otherwise, we accept the sheet's new data.
                  const recentlyToggledOrEdited = localState.lastModifiedLocally && (currentNow - localState.lastModifiedLocally < 30000);
                  if (!recentlyToggledOrEdited) {
                    const localId = String(localState.orderId || existingItem.id || '');
                    const isLocalTemp = localId.startsWith('SYNC-') || localId.startsWith('draft_') || !localId;
                    const isRemoteTemp = generatedOrderId.startsWith('SYNC-') || !generatedOrderId;

                    updatedHistory[existingIdx] = {
                      ...existingItem,
                      state: {
                        ...localState,
                        ...newState,
                        orderId: (!isLocalTemp && isRemoteTemp) ? localState.orderId : newState.orderId,
                        syncStatus: 'synced'
                      }
                    };
                    totalUpdCou++;
                  }
                } else {
                  // If local is genuinely unsynced (offline), we preserve local data.
                  // We do NOT call addToOfflineQueue here again because the offline queue already tracks
                  // unsynced edits, preventing infinite loops/duplicate spam.
                }
              }
            } else {
              updatedHistory.push({
                id: generatedOrderId,
                timestamp: currentNow,
                state: newState,
                messages: []
              });
              totalNewCou++;
            }
          }
        }
        return updatedHistory;
      });

      const successfulFetchCount = results.reduce((acc, res) => acc + (res.success ? res.orders.length : 0), 0);
      setLastSyncTime(currentNow);
      localStorage.setItem('db_last_sync_time', String(currentNow));
      setLastSyncFetchedCount(successfulFetchCount);
      localStorage.setItem('db_sync_total_items', String(successfulFetchCount));

      const failed = results.filter(r => !r.success);

      if (failed.length > 0) {
        const failedYears = failed.map(f => f.year || 'UNKNOWN').join(', ');
        const sheetSyncError = appLanguage === 'ms'
          ? `Gagal menyelaraskan database bagi tahun: ${failedYears}`
          : `Failed to sync database for years: ${failedYears}`;
        
        setSyncError(sheetSyncError);
        localStorage.setItem('db_sync_error', sheetSyncError);

        if (!silent) {
          setSyncErrorToast({
            message: sheetSyncError,
            visible: true
          });
        }
      } else {
        setSyncError(null);
        localStorage.removeItem('db_sync_error');

        if (!silent) {
          setAlertMsg({
            type: 'success',
            message: appLanguage === 'ms'
              ? `Berjaya dikemaskini daripada ${activeConfigs.length} database tahunan!\nBaru: ${totalNewCou}\nDikemaskini: ${totalUpdCou}`
              : `Aggregated sync complete across ${activeConfigs.length} annual sheets!\nNew: ${totalNewCou}\nUpdated: ${totalUpdCou}`
          });
        }
      }
    } catch (e) {
      const errMsg = String(e);
      setSyncError(errMsg);
      localStorage.setItem('db_sync_error', errMsg);

      if (!silent) {
        setSyncErrorToast({
          message: appLanguage === 'ms'
            ? 'Penyelarasan gagal: ' + errMsg
            : 'Sync failed: ' + errMsg,
          visible: true
        });
      }
    } finally {
      setRefreshing(false);
      setPullProgress(0);
    }
  };

  useEffect(() => {
    if (navigator.onLine) {
      handleGlobalSync(true);
    }
  }, []);

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

    if (isFirestoreCanary) {
      try {
        const op = await getOperationalOrders();
        const ov = await getOverdueOrders();
        const arch = await getArchivedOrders();
        
        const allOrders = [...op, ...ov, ...arch].map(item => ({
          orderId: item.orderId,
          name: item.customerName,
          phone: item.customerPhone,
          order: item.customerOrder,
          template: item.customerTemplate,
          bahasa: item.customerBahasa,
          addon: item.customerAddOn,
          jenis: item.customerJenis,
          due: item.customerDue || (item.dueTimestamp ? new Date(item.dueTimestamp).toLocaleString() : ''),
          link: item.orderLink,
          price: item.price,
          isDelivered: item.isDelivered,
          sheetName: item.isDelivered ? 'orders_archive_canary' : 'orders_canary',
          spreadsheetId: 'canary'
        }));

        const lowerQ = q.toLowerCase();
        const filtered = allOrders.filter(o => 
          (o.name && o.name.toLowerCase().includes(lowerQ)) ||
          (o.phone && o.phone.toLowerCase().includes(lowerQ)) ||
          (o.orderId && o.orderId.toLowerCase().includes(lowerQ))
        );

        setRemoteResults(filtered);
        if (filtered.length === 0) {
          setSearchError(
            appLanguage === 'ms'
              ? 'Tiada padanan dijumpai di Firestore Canary.'
              : 'No matching records found in Firestore Canary.'
          );
        }
      } catch (err: any) {
        console.error('Firestore search failed:', err);
        setSearchError(appLanguage === 'ms' ? 'Carian Firestore gagal: ' + err.message : 'Firestore search failed: ' + err.message);
      } finally {
        setIsSearching(false);
      }
      return;
    }

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
              const annotated = data.orders.map((o: any) => {
                const genId = o.orderId || `SYNC-${o.name || 'UNKNOWN'}-${o.phone || ''}-${o.due || ''}`
                   .replace(/\s+/g, '-')
                   .replace(/[^a-zA-Z0-9-]/g, '');
                return {
                  ...o,
                  generatedId: genId,
                  sheetName: sheet.year,
                  spreadsheetId: sId,
                  scriptUrl: sUrl
                };
              }).filter((o: any) => {
                return !deletedOrderIds.includes(o.generatedId) && !deletedOrderIds.includes(o.orderId);
              });
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
      `SYNC-${orderData.name || 'UNKNOWN'}-${orderData.phone || ''}-${orderData.due || ''}`
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

  const handleRemoteDeliveredToggle = async (
    e: React.MouseEvent,
    index: number,
    orderData: any,
    isRetry = false
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const spreadsheetId = orderData.spreadsheetId || state.spreadsheetId;
    const scriptUrl = orderData.scriptUrl || getActiveScriptUrl(spreadsheetId);
    const orderId = orderData.orderId;
    const currentStatus = !!orderData.isDelivered;
    const newStatus = isRetry ? currentStatus : !currentStatus;

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
          // Try POST fallback
          fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({
              action: 'update_delivered',
              spreadsheetId: spreadsheetId,
              orderId: orderId,
              isDelivered: newStatus
            })
          }).then(() => {
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
          }).catch((postErr) => {
             console.error("POST delivered status fallback failed, queuing for offline:", postErr);
             addToOfflineQueue({
               action: 'update_delivered',
               spreadsheetId: spreadsheetId,
               orderId: orderId,
               isDelivered: newStatus
             }, scriptUrl, existingIdx !== -1 ? history[existingIdx].id : undefined);

             setRemoteResults((prev) =>
              prev.map((item, idx) => (idx === index ? { 
                ...item, 
                syncStatus: 'failed',
                syncFailCount: (item.syncFailCount || 0) + 1,
                syncLastAttempt: Date.now()
              } : item))
            );
            if (existingIdx !== -1) {
              updateSpecificHistoryItem(history[existingIdx].id, {
                syncStatus: 'failed',
                syncFailCount: (history[existingIdx].state?.syncFailCount || 0) + 1,
                syncLastAttempt: Date.now()
              });
            }
          });
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
      // Try POST fallback
      fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action: 'update_delivered',
          spreadsheetId: spreadsheetId,
          orderId: orderId,
          isDelivered: newStatus
        })
      }).then(() => {
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
      }).catch((postErr) => {
         console.error("POST delivered status fallback failed, queuing for offline:", postErr);
         addToOfflineQueue({
           action: 'update_delivered',
           spreadsheetId: spreadsheetId,
           orderId: orderId,
           isDelivered: newStatus
         }, scriptUrl, existingIdx !== -1 ? history[existingIdx].id : undefined);

         setRemoteResults((prev) =>
          prev.map((item, idx) => (idx === index ? { 
            ...item, 
            syncStatus: 'failed',
            syncFailCount: (item.syncFailCount || 0) + 1,
            syncLastAttempt: Date.now()
          } : item))
        );
        if (existingIdx !== -1) {
          updateSpecificHistoryItem(history[existingIdx].id, {
            syncStatus: 'failed',
            syncFailCount: (history[existingIdx].state?.syncFailCount || 0) + 1,
            syncLastAttempt: Date.now()
          });
        }
      });
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
        {/* Unified Search Bar */}
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1 group">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (activeTab === 'remote') {
                    handleRemoteSearch();
                  } else {
                    // Optional: maybe auto-switch to remote if searching? 
                    // For now, just allow filtering local.
                  }
                }
              }}
              placeholder={appLanguage === 'ms' ? 'Cari nama, Order ID, atau no. telefon...' : 'Search name, Order ID, or phone...'}
              className="w-full h-11 bg-gray-100/80 dark:bg-zinc-900/50 rounded-xl pl-10 pr-10 font-bold text-text border border-transparent outline-none focus:bg-white dark:focus:bg-zinc-900 focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all text-[11px] sm:text-xs placeholder:text-gray-400 placeholder:font-medium"
            />
            <Search className="w-4 h-4 text-subtext/75 absolute left-3.5 top-3.5" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-3 w-5 h-5 rounded-full bg-gray-200 dark:bg-zinc-800 hover:bg-gray-300 dark:hover:bg-zinc-700 text-subtext flex items-center justify-center transition-colors"
              >
                <X className="w-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'remote') {
                handleRemoteSearch();
              } else {
                handleGlobalSync(false);
              }
            }}
            disabled={refreshing || isSearching}
            className="w-11 h-11 bg-gray-100/80 dark:bg-zinc-900/50 text-subtext hover:bg-gray-200 dark:hover:bg-zinc-800 active:scale-95 flex items-center justify-center rounded-xl transition-all duration-200 shadow-sm"
          >
            {activeTab === 'remote' ? (
              isSearching ? <RefreshCcw className="w-4 h-4 animate-spin text-primary" /> : <Search className="w-4 h-4" />
            ) : (
              <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin text-primary' : ''}`} />
            )}
          </button>
        </div>

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
            {filteredDrafts.length > 0 && (
              <span className="px-1.5 py-0.5 text-[9px] font-black bg-blue-600 text-white rounded-full scale-90 select-none">
                {filteredDrafts.length}
              </span>
            )}
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
          <button
            type="button"
            onClick={() => {
              setActiveTab('trash');
            }}
            className={`flex-1 text-center text-[10px] sm:text-xs font-bold py-2 px-1 rounded-lg transition-all duration-200 flex items-center justify-center space-x-1 ${
              activeTab === 'trash'
                ? 'bg-rose-50 border border-rose-200/50 dark:bg-rose-950/20 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-subtext/70 hover:text-text hover:bg-white/40'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="truncate">{appLanguage === 'ms' ? 'Tong Sampah' : 'Trash Bin'}</span>
            {(() => {
              const deletedCount = history.filter(item => isDeletedState(item) && item.state?.syncStatus !== 'draft').length;
              return deletedCount > 0 ? (
                <span className="px-1.5 py-0.5 text-[9px] font-black bg-rose-600 dark:bg-rose-500 text-white rounded-full scale-90 select-none animate-pulse">
                  {deletedCount}
                </span>
              ) : null;
            })()}
          </button>
        </div>
        {activeTab === 'local' && (
          <div className="space-y-4">
            {history.filter(item => !isDeletedState(item) && item.state?.syncStatus !== 'draft').length === 0 ? (
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
                {/* No local search input here anymore, moved to top */}

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
                  {matchedItems.map((item, idx) => {
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

                  const dueTimestamp = getBestDueTimestamp(item) || Date.now();
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
                  const isDelivered = isDeliveredState(item);
                  const timeUntilDue = dueTimestamp ? dueTimestamp - now : 0;
                  const isDueSoon = !isDelivered && timeUntilDue > 0 && timeUntilDue <= 20 * 60 * 1000;
                  const isOverdue = !isDelivered && dueTimestamp ? timeUntilDue <= 0 : false;

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
                      key={`${item.id}-${idx}`}
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
                              {getOrderTypeDisplay(item.state)}{' '}
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
                                onConfirm: async () => {
                                  setConfirmAction(null);
                                  const spreadsheetId = item.state?.spreadsheetId || state.spreadsheetId;
                                  const orderId = item.state?.orderId;
                                  if (spreadsheetId && orderId) {
                                    await deleteOrderFromCloud(spreadsheetId, orderId);
                                  }
                                  deleteOrderFromHistory(item.id);
                                  handleGlobalSync(true);
                                }
                              });
                            }}
                            className="relative z-20 w-9 h-9 pointer-events-auto bg-red-100 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white hover:scale-110 active:scale-90 transition-all shadow-sm duration-200"
                            title={appLanguage === 'ms' ? 'Padam' : 'Delete'}
                          >
                            <Trash2 className="w-4 h-4" />
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
                                  onClick={(e) => handleDeliveredToggle(e, item, isDelivered, true)}
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

        {filteredDrafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-subtext space-y-4">
            <Save className="w-16 h-16 opacity-30" />
            <p className="font-bold">
              {appLanguage === 'ms' ? 'Tiada draf dijumpai' : 'No drafts found'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredDrafts.map((draft, idx) => {
              const date = new Date(draft.timestamp);
              const formattedDate = date.toLocaleString(appLanguage === 'ms' ? 'ms-MY' : 'en-US', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={`${draft.id}-${idx}`}
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
                            permanentlyDeleteOrderFromHistory(draft.id);
                            setConfirmAction(null);
                          }
                        });
                      }}
                      className="w-9 h-9 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full transition-all active:scale-90"
                    >
                      <Trash2 className="w-4 h-4" />
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
            <span>{appLanguage === 'ms' ? 'Cari Database Cloud' : 'Search Cloud Database'}</span>
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
                          className="w-8 h-8 flex items-center justify-center hover:bg-red-50 text-red-500 rounded-full transition-all active:scale-90"
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
                  handleGlobalSync(true);
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
              const isDelivered = item.isDelivered === true || item.isDelivered === 'true' || item.isDelivered === 1 || item.isDelivered === '1';
              const orderId = item.orderId || item.generatedId || `SYNC-TMP-${idx}`;

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
                              onClick={(e) => handleRemoteDeliveredToggle(e, idx, item, true)}
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

    {activeTab === 'trash' && (
      <div className="space-y-4 mt-2.5">
        {(() => {
          const deletedItems = filteredTrash;
          
          if (deletedItems.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-20 text-subtext space-y-4">
                <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center text-rose-500/60">
                  <Trash2 className="w-8 h-8 opacity-60" />
                </div>
                <p className="font-bold">
                  {appLanguage === 'ms' ? 'Tong sampah kosong' : 'Trash bin is empty'}
                </p>
                <p className="text-[10px] text-gray-400 text-center max-w-[220px]">
                  {appLanguage === 'ms' 
                    ? 'Rekod yang dipadamkan dari Sejarah akan dipaparkan di sini.' 
                    : 'Deleted records from History will appear here.'}
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-rose-50/50 border border-rose-200/50 rounded-2xl p-4">
                <div className="space-y-0.5">
                  <p className="text-xs font-extrabold text-rose-900">
                    {appLanguage === 'ms' ? 'Tong Sampah' : 'Trash Bin'}
                  </p>
                  <p className="text-[10px] text-rose-700/80">
                    {appLanguage === 'ms' 
                      ? `${deletedItems.length} rekod dipadamkan dikesan.` 
                      : `${deletedItems.length} deleted records detected.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmAction({
                      title: appLanguage === 'ms' ? 'Kosongkan Tong Sampah?' : 'Empty Trash Bin?',
                      message: appLanguage === 'ms'
                        ? 'Adakah anda benar-benar ingin memadamkan semua rekod ini secara kekal dari peranti ini?'
                        : 'Are you sure you want to permanently delete all these records from this device?',
                      onConfirm: () => {
                        deletedItems.forEach(item => {
                          permanentlyDeleteOrderFromHistory(item.id);
                        });
                        setConfirmAction(null);
                        setAlertMsg({
                          type: 'success',
                          message: appLanguage === 'ms' 
                            ? 'Tong sampah telah dibersihkan!' 
                            : 'Trash bin emptied successfully!'
                        });
                      }
                    });
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[10px] sm:text-xs font-black transition-all duration-150 active:scale-95 shadow-sm"
                >
                  {appLanguage === 'ms' ? 'Kosongkan' : 'Empty Trash'}
                </button>
              </div>

              <div className="space-y-3">
                {deletedItems.map((item, idx) => {
                  const customerName = item.state?.customerName || item.state?.name || 'Unknown';
                  const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                  const orderIdHex = item.state?.orderId || item.id;
                  
                  return (
                    <div
                      key={`${item.id}-${idx}`}
                      className="bg-surface border border-gray-100 dark:border-gray-800/40 rounded-2xl p-4 shadow-sm flex flex-col space-y-3.5 hover:border-gray-200 transition-all duration-150 animate-fade-in"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-black text-text">{formatCustomerName(customerName)}</span>
                            {item.state?.customerJenis && (
                              <span className="px-1.5 py-0.5 text-[8px] bg-gray-100 text-subtext font-bold rounded-md">
                                {item.state.customerJenis}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center text-[9px] text-subtext space-x-2 font-semibold">
                            <span>ID: {orderIdHex.substring(0, 10)}</span>
                            <span>•</span>
                            <span>{dateStr}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2.5 pt-1.5 border-t border-dashed border-gray-100/60">
                        <button
                          type="button"
                          onClick={() => {
                            restoreOrderFromHistory(item.id);
                            syncOfflineQueue();
                            setAlertMsg({
                              type: 'success',
                              message: appLanguage === 'ms' 
                                ? 'Rekod berjaya dipulihkan!' 
                                : 'Record restored successfully!'
                            });
                          }}
                          className="flex-1 h-9 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-[10px] sm:text-xs font-bold transition-all duration-150 active:scale-[0.97] flex items-center justify-center space-x-1"
                        >
                          <RefreshCcw className="w-3 h-3 rotate-180" />
                          <span>{appLanguage === 'ms' ? 'Pulihkan' : 'Restore'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmAction({
                              title: appLanguage === 'ms' ? 'Padam Kekal?' : 'Delete Permanently?',
                              message: appLanguage === 'ms'
                                ? 'Adakah anda mahu memadam rekod ini selamanya dari peranti ini? Tindakan ini tidak boleh diundur.'
                                : 'Do you want to permanently delete this record from this device? This action cannot be undone.',
                              onConfirm: () => {
                                permanentlyDeleteOrderFromHistory(item.id);
                                setConfirmAction(null);
                                setAlertMsg({
                                  type: 'success',
                                  message: appLanguage === 'ms' 
                                    ? 'Rekod dipadam kekal!' 
                                    : 'Record permanently deleted!'
                                });
                              }
                            });
                          }}
                          className="flex-1 h-9 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[10px] sm:text-xs font-bold transition-all duration-150 active:scale-[0.97] flex items-center justify-center space-x-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{appLanguage === 'ms' ? 'Padam Kekal' : 'Delete Permanently'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
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
              disabled={isConfirmLoading}
              onClick={() => {
                if (isConfirmLoading) return;
                setConfirmAction(null);
              }}
              className="flex-1 py-3 px-4 rounded-full font-bold text-sm text-text bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
            >
              {appLanguage === 'ms' ? 'Batal' : 'Cancel'}
            </button>

            <button
              type="button"
              disabled={isConfirmLoading}
              onClick={async () => {
                if (isConfirmLoading) return;
                try {
                  const result = confirmAction.onConfirm();
                  if (result instanceof Promise) {
                    setIsConfirmLoading(true);
                    await result;
                  }
                } finally {
                  setIsConfirmLoading(false);
                }
              }}
              className={cn(
                "flex-1 py-3 px-4 rounded-full font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center",
                confirmAction.isDestructive !== false ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary-dark"
              )}
            >
              {isConfirmLoading ? (
                <RefreshCcw className="w-4 h-4 animate-spin" />
              ) : (
                confirmAction.confirmText || (appLanguage === 'ms' ? 'Padam' : 'Delete')
              )}
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

  {syncErrorToast && syncErrorToast.visible && createPortal(
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] z-[100] w-full max-w-sm px-4">
      <div className="bg-red-50 text-red-900 border border-red-200 rounded-2xl p-4 shadow-xl flex gap-3 items-start animate-fade-in-up">
        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
        <div className="flex-1 space-y-1">
          <p className="text-xs font-bold leading-tight">
            {appLanguage === 'ms' ? 'Penyelarasan Gagal' : 'Sync Failed'}
          </p>
          <p className="text-[11px] text-red-700/90 leading-normal line-clamp-2">
            {syncErrorToast.message}
          </p>
          <div className="flex gap-2 pt-1.5 justify-start">
            <button
              type="button"
              onClick={() => {
                setSyncErrorToast(null);
                handleGlobalSync(false);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] sm:text-xs active:scale-95 transition-all flex items-center gap-1 shadow-sm"
            >
              <RefreshCcw className="w-3 h-3" />
              {appLanguage === 'ms' ? 'Cuba Lagi' : 'Retry'}
            </button>
            <button
              type="button"
              onClick={() => setSyncErrorToast(null)}
              className="px-3 py-1.5 rounded-lg bg-transparent hover:bg-red-100/50 text-red-700 font-bold text-[10px] sm:text-xs transition-colors"
            >
              {appLanguage === 'ms' ? 'Tutup' : 'Dismiss'}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSyncErrorToast(null)}
          className="text-red-500 hover:text-red-700 transition-colors p-0.5 rounded-lg hover:bg-red-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body
  )}
</div>
  );
}
