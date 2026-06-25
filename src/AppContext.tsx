import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { AppState, INITIAL_STATE, ViewType, OrderHistoryItem } from './types';
import { getSubscription, syncPushNotifications, clearPushNotifications } from './lib/push';

interface AppContextType {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  viewStack: ViewType[];
  pushView: (view: ViewType, updates?: Partial<AppState>) => void;
  changeTab: (tab: ViewType) => void;
  startNewOrder: (view: ViewType, updates: Partial<AppState>) => void;
  popView: () => void;
  goHome: () => void;
  reset: () => void;
  generatedMessages: string[];
  setGeneratedMessages: (msgs: string[]) => void;
  history: OrderHistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<OrderHistoryItem[]>>;
  saveOrderToHistory: (messages: string[]) => void;
  updateOrderHistoryState: (updates: Partial<AppState>) => void;
  updateSpecificHistoryItem: (id: string, updates: Partial<AppState>) => void;
  deleteOrderFromHistory: (id: string) => void;
  restoreOrderFromHistory: (id: string) => void;
  permanentlyDeleteOrderFromHistory: (id: string) => void;
  clearHistory: () => void;
  loadOrder: (item: OrderHistoryItem) => void;
  drafts: OrderHistoryItem[];
  saveAsDraft: () => void;
  deleteDraft: (id: string) => void;
  loadDraft: (item: OrderHistoryItem) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  appLanguage: 'ms' | 'en';
  toggleLanguage: () => void;
  isOnline: boolean;
  isSyncing: boolean;
  queueSize: number;
  lastSyncTime: number | null;
  syncOfflineQueue: () => Promise<void>;
  addToOfflineQueue: (payload: any, webhookUrl: string, orderId: string) => void;
  deletedOrderIds: string[];
  historyDeliveryFilter: 'all' | 'delivered' | 'pending';
  setHistoryDeliveryFilter: (val: 'all' | 'delivered' | 'pending') => void;
  historyPendingTimeFilter: 'all' | 'today' | 'tomorrow' | '2days' | '3days';
  setHistoryPendingTimeFilter: (val: 'all' | 'today' | 'tomorrow' | '2days' | '3days') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
  console.log("AppProvider mounted");
}, []);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('appTheme') as 'light' | 'dark';
      if (saved) return saved;
      return 'light';
    } catch {
      return 'light';
    }
  });

  const [appLanguage, setAppLanguage] = useState<'ms' | 'en'>(() => {
    try {
      const saved = localStorage.getItem('appLanguage') as 'ms' | 'en';
      if (saved) return saved;
      return 'ms';
    } catch {
      return 'ms';
    }
  });

  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem('appState');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...INITIAL_STATE,
          ...parsed,
          addons: Array.isArray(parsed.addons) ? parsed.addons : INITIAL_STATE.addons,
          clLangs: Array.isArray(parsed.clLangs) ? parsed.clLangs : INITIAL_STATE.clLangs,
          resumeLangs: Array.isArray(parsed.resumeLangs) ? parsed.resumeLangs : INITIAL_STATE.resumeLangs
        };
      }
      return INITIAL_STATE;
    } catch {
      return INITIAL_STATE;
    }
  });

  const [viewStack, setViewStack] = useState<ViewType[]>(() => {
    try {
      const saved = localStorage.getItem('viewStack');
      return saved ? JSON.parse(saved) : ['home'];
    } catch {
      return ['home'];
    }
  });

  const [generatedMessages, setGeneratedMessages] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('generatedMessages');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState<OrderHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('orderHistory');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch {
      return [];
    }
  });

  const [deletedOrderIds, setDeletedOrderIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('deletedOrderIds');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.slice(-100) : [];
    } catch {
      return [];
    }
  });

  const [drafts, setDrafts] = useState<OrderHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('orderDrafts');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('deletedOrderIds', JSON.stringify(deletedOrderIds));
  }, [deletedOrderIds]);

  useEffect(() => {
    localStorage.setItem('appState', JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem('viewStack', JSON.stringify(viewStack));
  }, [viewStack]);

  useEffect(() => {
    localStorage.setItem('generatedMessages', JSON.stringify(generatedMessages));
  }, [generatedMessages]);

  useEffect(() => {
    localStorage.setItem('orderDrafts', JSON.stringify(drafts));
  }, [drafts]);

  useEffect(() => {
    localStorage.setItem('appTheme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark-theme-active');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark-theme-active');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('appLanguage', appLanguage);
  }, [appLanguage]);

  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec';

    const extractId = (input: string) => {
      if (!input) return '';
      const trimmed = input.trim();
      if (trimmed.includes('docs.google.com/spreadsheets/d/')) {
        const matches = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
        return matches ? matches[1] : trimmed;
      }
      return trimmed;
    };

    const getActiveScriptUrl = (sId?: string) => {
      const globalUrl = localStorage.getItem('db_global_script_url');
      if (globalUrl && globalUrl.trim() !== '') {
        return globalUrl.trim();
      }
      const savedSheets = localStorage.getItem('db_annual_sheets');
      const annualSheets = savedSheets ? JSON.parse(savedSheets) : [];
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

    const jsonpRequest = (url: URL, callbackName: string): Promise<any> => {
      return new Promise((resolve, reject) => {
        const cacheBustedUrl = new URL(url.toString());
        cacheBustedUrl.searchParams.set('_nocache', String(Date.now()) + Math.random().toString(36).substring(2, 7));
        const script = document.createElement('script');
        script.src = cacheBustedUrl.toString();
        script.async = true;

        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Request timeout'));
        }, 45000);

        const cleanup = () => {
          clearTimeout(timeout);
          try {
            document.body.removeChild(script);
          } catch (e) {}
          delete (window as any)[callbackName];
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
          reject(new Error('Script load error'));
        };

        document.body.appendChild(script);
      });
    };

    const checkAlerts = () => {
      const now = Date.now();
      const TWENTY_MINS = 20 * 60 * 1000;
      const THREE_HOURS = 3 * 60 * 60 * 1000;
      
      const currentHistory = historyRef.current;
      const historyUpdates: { id: string; updates: any }[] = [];
      const pendingJSONP: { item: OrderHistoryItem; url: URL; callbackName: string }[] = [];
      const notifications: { title: string; body: string }[] = [];

      currentHistory.forEach(item => {
        const { dueTimestamp, hasNotified, hasDueAlerted, hasThreeHourChecked, customerName, subType, mainType, isDelivered } = item.state;
        if (!dueTimestamp || isDelivered) return;

        const timeUntilDue = dueTimestamp - now;
        let itemUpdates: any = {};
        let needsStateUpdate = false;

        // 1. Check 3 hours logic
        if (timeUntilDue <= THREE_HOURS && !hasThreeHourChecked) {
          needsStateUpdate = true;
          itemUpdates.hasThreeHourChecked = true;
          itemUpdates.threeHourAlerted = true;

          const spreadsheetId = item.state?.spreadsheetId || '1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo';
          const oId = item.state?.orderId;

          if (oId && spreadsheetId) {
            const callbackName = 'jsonp_auto_sync_' + Math.round(100000 * Math.random()) + '_' + item.id;
            const url = new URL(getActiveScriptUrl(spreadsheetId));
            url.searchParams.append('action', 'get_link');
            url.searchParams.append('orderId', oId);
            url.searchParams.append('spreadsheetId', spreadsheetId);
            url.searchParams.append('callback', callbackName);
            pendingJSONP.push({ item, url, callbackName });
          } else if (!item.state.googleSheetLink || item.state.googleSheetLink.trim() === '') {
            notifications.push({
              title: appLanguage === 'ms' ? 'Status Tempahan' : 'Ask Order Status',
              body: `${customerName || 'Customer'} (${mainType || 'Tempahan'}) - Dah siap ke belum? Link masih belum dimasukkan.`
            });
          }
        }

        // 2. Check 20 mins logic
        if (!hasNotified && timeUntilDue > 0 && timeUntilDue <= TWENTY_MINS) {
          needsStateUpdate = true;
          itemUpdates.hasNotified = true;
          notifications.push({
            title: appLanguage === 'ms' ? 'Pesanan Bakal Selesai!' : 'Order Due Soon!',
            body: appLanguage === 'ms'
              ? `Pesanan untuk ${customerName || 'Pelanggan'} (${mainType} ${subType}) berbaki kurang dari 20 minit!`
              : `Order for ${customerName || 'Customer'} (${mainType} ${subType}) is due in less than 20 minutes!`
          });
        }

        // 3. Due Now logic
        if (!hasDueAlerted && timeUntilDue <= 0) {
          needsStateUpdate = true;
          itemUpdates.hasDueAlerted = true;
          notifications.push({
            title: appLanguage === 'ms' ? 'Tempahan Sudah Sampai Tempoh!' : 'Order Deadline Reached!',
            body: appLanguage === 'ms'
              ? `Tempahan untuk ${customerName || 'Pelanggan'} (${mainType} ${subType}) sudah sampai tempoh sekarang!`
              : `Order for ${customerName || 'Customer'} (${mainType} ${subType}) is due now!`
          });
        }

        if (needsStateUpdate) {
          historyUpdates.push({ id: item.id, updates: itemUpdates });
        }
      });

      // Fire notifications
      notifications.forEach(n => {
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(n.title, { body: n.body });
          }
        } catch (e) { console.warn(e); }
      });

      // Update history state for basic flag changes
      if (historyUpdates.length > 0) {
        setHistory(prev => prev.map(item => {
          const u = historyUpdates.find(up => up.id === item.id);
          return u ? { ...item, state: { ...item.state, ...u.updates } } : item;
        }));
      }

      // Fire JSONP requests separately
      pendingJSONP.forEach(({ item, url, callbackName }) => {
        jsonpRequest(url, callbackName)
          .then((data) => {
            if (data && data.status === 'success' && data.link) {
              updateSpecificHistoryItem(item.id, {
                googleSheetLink: data.link,
                orderLink: data.link,
                hasThreeHourChecked: true,
                threeHourAlerted: true
              });
            } else {
              if (!item.state.googleSheetLink || item.state.googleSheetLink.trim() === '') {
                const notifyTitle = appLanguage === 'ms' ? 'Status Tempahan' : 'Ask Order Status';
                const notifyBody = `${item.state.customerName || 'Customer'} (${item.state.mainType || 'Tempahan'}) - Dah siap ke belum? Link masih belum dimasukkan.`;
                try {
                  if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification(notifyTitle, { body: notifyBody });
                  }
                } catch (e) {}
              }
              updateSpecificHistoryItem(item.id, {
                hasThreeHourChecked: true,
                threeHourAlerted: true
              });
            }
          })
          .catch((err) => {
            console.warn('Auto background sync failed:', err);
            updateSpecificHistoryItem(item.id, {
              hasThreeHourChecked: true,
              threeHourAlerted: true
            });
          });
      });
    };

    // Ask for permission and trigger PWA/Web Push subscription registration if supported
    try {
      getSubscription().catch(console.warn);
    } catch (e) {
      console.warn("Could not register push notifications on mount", e);
    }


    // const interval = setInterval(checkAlerts, 60000);
// checkAlerts();

// return () => clearInterval(interval);
return;
  }, [appLanguage]);

  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [historyDeliveryFilter, setHistoryDeliveryFilter] = useState<'all' | 'delivered' | 'pending'>('all');
  const [historyPendingTimeFilter, setHistoryPendingTimeFilter] = useState<'all' | 'today' | 'tomorrow' | '2days' | '3days'>('all');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [queueSize, setQueueSize] = useState<number>(() => {
    try {
      const q = localStorage.getItem('db_offline_sync_queue');
      if (q) {
        const parsed = JSON.parse(q);
        return Array.isArray(parsed) ? parsed.length : 0;
      }
    } catch {}
    return 0;
  });
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(() => {
    try {
      const t = localStorage.getItem('db_last_sync_time');
      return t ? parseInt(t, 10) : null;
    } catch {
      return null;
    }
  });

  const updateQueueSize = useCallback(() => {
    try {
      const q = localStorage.getItem('db_offline_sync_queue');
      if (q) {
        const parsed = JSON.parse(q);
        setQueueSize(Array.isArray(parsed) ? parsed.length : 0);
        return;
      }
    } catch {}
    setQueueSize(0);
  }, []);

  const addToOfflineQueue = (payload: any, webhookUrl: string, orderId: string) => {
    try {
      const queueStr = localStorage.getItem('db_offline_sync_queue');
      const queue = queueStr ? JSON.parse(queueStr) : [];
      const uid = Math.random().toString(36).substring(2) + Date.now().toString(36);
      queue.push({
        uid,
        payload,
        webhookUrl,
        id: orderId,
        timestamp: Date.now()
      });
      localStorage.setItem('db_offline_sync_queue', JSON.stringify(queue));
      updateQueueSize();
    } catch (e) {
      console.warn('Failed to add to offline queue', e);
    }
  };

  const syncOfflineQueue = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      return;
    }
    setIsOnline(true);

    const queueStr = localStorage.getItem('db_offline_sync_queue');
    if (!queueStr) {
      updateQueueSize();
      return;
    }

    let queue: any[] = [];
    try {
      queue = JSON.parse(queueStr);
    } catch (e) {
      localStorage.removeItem('db_offline_sync_queue');
      updateQueueSize();
      return;
    }

    if (!Array.isArray(queue) || queue.length === 0) {
      updateQueueSize();
      return;
    }

    setIsSyncing(true);
    let remainingQueue = [...queue];
    let processedCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (!navigator.onLine) {
        setIsOnline(false);
        break;
      }

      try {
        await fetch(item.webhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(item.payload)
        });
        remainingQueue = remainingQueue.filter(q => q.uid ? q.uid !== item.uid : q.id !== item.id);
        processedCount++;
        
        if (remainingQueue.length === 0) {
          localStorage.removeItem('db_offline_sync_queue');
        } else {
          localStorage.setItem('db_offline_sync_queue', JSON.stringify(remainingQueue));
        }
        updateQueueSize();
      } catch (e) {
        console.warn('Failed to sync offline item', e);
      }
    }

    setIsSyncing(false);
    updateQueueSize();

    if (processedCount > 0) {
      const now = Date.now();
      setLastSyncTime(now);
      localStorage.setItem('db_last_sync_time', String(now));

      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(appLanguage === 'ms' ? 'Kemaskini Selesai' : 'Sync Completed', { 
            body: appLanguage === 'ms' 
              ? `${processedCount} rekod luar talian telah berjaya dikemaskini.` 
              : `${processedCount} records from queue synced.` 
          });
        }
      } catch(e) {}
    }
  }, [appLanguage, updateQueueSize]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // syncOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'db_offline_sync_queue') {
        updateQueueSize();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Initial check
    syncOfflineQueue();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [appLanguage]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');
  const toggleLanguage = () => setAppLanguage(l => l === 'ms' ? 'en' : 'ms');

  const saveOrderToHistory = (messages: string[]) => {
    let currentId = state.historyId;
    let currentTimestamp = state.timestamp;
    
    if (!currentId) {
      currentId = Date.now().toString();
      currentTimestamp = Date.now();
    }
    
    const finalState = { ...state, historyId: currentId, timestamp: currentTimestamp };
    
    const newItem: OrderHistoryItem = {
      id: currentId,
      timestamp: currentTimestamp!,
      state: { ...finalState, syncStatus: 'saved_locally' },
      messages: [...messages]
    };
    
    setHistory(prev => {
      const exists = prev.find(item => item.id === currentId);
      const nextHistory = exists ? prev.map(item => item.id === currentId ? newItem : item) : [newItem, ...prev];
      localStorage.setItem('orderHistory', JSON.stringify(nextHistory));
      return nextHistory;
    });
    
    setState(finalState);
    syncPushNotifications(newItem, appLanguage).catch(console.warn);
  };
  
  const updateOrderHistoryState = (updates: Partial<AppState>) => {
    const finalState = { ...state, ...updates, lastModifiedLocally: Date.now() };
    setState(finalState);
    if (finalState.historyId) {
       setHistory(prev => {
         const oldId = state.historyId;
         const newId = finalState.historyId;
         
         // Find the item by newId OR oldId
         const itemToUpdate = prev.find(item => item.id === newId || (oldId && item.id === oldId));
         
         let nextHistory;
         if (itemToUpdate) {
           nextHistory = prev.map(item => {
             if (item.id === itemToUpdate.id) {
               const updatedItem = { ...item, id: newId as string, state: finalState };
               syncPushNotifications(updatedItem, appLanguage).catch(console.warn);
               return updatedItem;
             }
             return item;
           });
         } else {
           const newItem: OrderHistoryItem = {
             id: finalState.historyId as string,
             timestamp: finalState.timestamp || Date.now(),
             state: finalState,
             messages: []
           };
           syncPushNotifications(newItem, appLanguage).catch(console.warn);
           nextHistory = [newItem, ...prev];
         }
         localStorage.setItem('orderHistory', JSON.stringify(nextHistory));
         return nextHistory;
       });
    }
  };

  const updateSpecificHistoryItem = (id: string, updates: Partial<AppState>) => {
    setHistory(prev => {
      const nextHistory = prev.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, state: { ...item.state, ...updates, lastModifiedLocally: Date.now() } };
          syncPushNotifications(updatedItem, appLanguage).catch(console.warn);
          return updatedItem;
        }
        return item;
      });
      localStorage.setItem('orderHistory', JSON.stringify(nextHistory));
      return nextHistory;
    });
  };

  const deleteOrderFromHistory = (id: string) => {
    const itemToDelete = history.find(h => h.id === id);
    if (itemToDelete) {
      setDeletedOrderIds(prev => {
        const idsToBlacklist = [itemToDelete.id];
        if (itemToDelete.state?.orderId) {
          idsToBlacklist.push(itemToDelete.state.orderId);
        }
        const next = [...prev, ...idsToBlacklist];
        return [...new Set(next)].slice(-100);
      });
      
      // Mark as deleted in state to persist the status
      setHistory(prev => prev.map(item => 
        item.id === id 
          ? { ...item, state: { ...item.state, isDeleted: true, lastModifiedLocally: Date.now() } } 
          : item
      ));
    }

    clearPushNotifications(id).catch(console.warn);
  };

  const restoreOrderFromHistory = (id: string) => {
    const itemToRestore = history.find(h => h.id === id);
    if (itemToRestore) {
      setDeletedOrderIds(prev => {
        const blacklisted = [itemToRestore.id];
        if (itemToRestore.state?.orderId) {
          blacklisted.push(itemToRestore.state.orderId);
        }
        return prev.filter(x => !blacklisted.includes(x));
      });

      setHistory(prev => prev.map(item => 
        item.id === id 
          ? { ...item, state: { ...item.state, isDeleted: false, syncStatus: 'failed', lastModifiedLocally: Date.now() } } 
          : item
      ));

      if (itemToRestore.state) {
        const {
          scriptUrl,
          spreadsheetId,
          orderId,
          customerName,
          customerPhone,
          customerOrder,
          customerTemplate,
          template,
          customerBahasa,
          customerAddOn,
          customerJenis,
          customerDue,
          googleSheetLink,
          orderLink,
          isDelivered
        } = itemToRestore.state;

        if (scriptUrl && spreadsheetId && orderId) {
          const orderRow = [
            isDelivered || false,
            customerName || '',
            customerPhone || '',
            customerOrder || '',
            customerTemplate || template || '',
            customerBahasa || '',
            customerAddOn || '',
            customerJenis || '',
            customerDue || '',
            orderLink || googleSheetLink || '',
            orderId
          ];
          addToOfflineQueue({
            action: 'update_order',
            spreadsheetId: spreadsheetId,
            orderId: orderId,
            rowData: orderRow
          }, scriptUrl, orderId);
        }
      }
    }
  };

  const permanentlyDeleteOrderFromHistory = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const saveAsDraft = () => {
    // If this is a real order (not starting with 'draft_' or already present in history), do not save it as a draft
    if (state.historyId && (!state.historyId.startsWith('draft_') || history.some(item => item.id === state.historyId))) {
      return;
    }

    const draftId = state.historyId || `draft_${Date.now()}`;
    const timestamp = state.timestamp || Date.now();
    
    const draftItem: OrderHistoryItem = {
      id: draftId,
      timestamp,
      state: { ...state, historyId: draftId, timestamp },
      messages: []
    };
    
    setDrafts(prev => {
      const exists = prev.find(d => d.id === draftId);
      if (exists) {
        return prev.map(d => d.id === draftId ? draftItem : d);
      }
      return [draftItem, ...prev];
    });
    
    setState(prev => ({ ...prev, historyId: draftId, timestamp }));
  };

  const deleteDraft = (id: string) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
  };

  const loadDraft = (item: OrderHistoryItem) => {
    const s = (item.state || {}) as any;
    setState({
      ...INITIAL_STATE,
      ...s,
      customerName: s.customerName || s.name || INITIAL_STATE.customerName,
      customerPhone: s.customerPhone || s.phone || INITIAL_STATE.customerPhone,
      addons: Array.isArray(s.addons) ? s.addons : INITIAL_STATE.addons,
      clLangs: Array.isArray(s.clLangs) ? s.clLangs : INITIAL_STATE.clLangs,
      resumeLangs: Array.isArray(s.resumeLangs) ? s.resumeLangs : INITIAL_STATE.resumeLangs,
      timestamp: item.timestamp,
      historyId: item.id,
      isEditMode: s.isEditMode !== undefined ? s.isEditMode : false
    });
    // Go to the appropriate form view based on state
    if (s.mainType === 'Resume' || s.mainType === 'Curriculum Vitae') {
      setViewStack(['home', 'resume-type', 'resume-form-fields', 'customer-info']);
    } else {
      setViewStack(['home', 'general-form', 'customer-info']);
    }
  };


  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('orderHistory');
  };

  const loadOrder = (item: OrderHistoryItem) => {
    // If it's a remote item not in history, add it to history now so it's persisted locally
    setHistory(prev => {
      const exists = prev.some(h => h.id === item.id || (h.state?.orderId && h.state.orderId === item.id));
      if (exists) return prev;
      return [item, ...prev];
    });

    const s = (item.state || {}) as any;
    setState({
      ...INITIAL_STATE,
      ...s,
      customerName: s.customerName || s.name || INITIAL_STATE.customerName,
      customerPhone: s.customerPhone || s.phone || INITIAL_STATE.customerPhone,
      addons: Array.isArray(s.addons) ? s.addons : INITIAL_STATE.addons,
      clLangs: Array.isArray(s.clLangs) ? s.clLangs : INITIAL_STATE.clLangs,
      resumeLangs: Array.isArray(s.resumeLangs) ? s.resumeLangs : INITIAL_STATE.resumeLangs,
      timestamp: item.timestamp,
      historyId: item.id,
      isEditMode: s.isEditMode !== undefined ? s.isEditMode : false
    });
    setViewStack(['home', 'history', 'customer-info']);
  };

  const startNewOrder = (view: ViewType, updates: Partial<AppState>) => {
    setState({ ...INITIAL_STATE, ...updates });
    setViewStack(['home', view]);
  };

  const pushView = (view: ViewType, updates?: Partial<AppState>) => {
    if (updates) {
      setState(prev => ({ ...prev, ...updates }));
    }
    setViewStack(prev => [...prev, view]);
  };

  const changeTab = (tab: ViewType) => {
    if (tab === 'home') {
      setViewStack(['home']);
    } else {
      setViewStack(['home', tab]);
    }
  };

  const popView = () => {
    setViewStack(prev => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, -1);
    });
  };

  const goHome = () => {
    reset();
  };

  const reset = () => {
    setState(INITIAL_STATE);
    setViewStack(['home']);
    setGeneratedMessages([]);
    localStorage.removeItem('appState');
    localStorage.removeItem('viewStack');
    localStorage.removeItem('generatedMessages');
  };

  return (
    <AppContext.Provider value={{ state, setState, viewStack, pushView, changeTab, startNewOrder, popView, goHome, reset, generatedMessages, setGeneratedMessages, history, setHistory, saveOrderToHistory, updateOrderHistoryState, updateSpecificHistoryItem, deleteOrderFromHistory, restoreOrderFromHistory, permanentlyDeleteOrderFromHistory, clearHistory, loadOrder, drafts, saveAsDraft, deleteDraft, loadDraft, theme, toggleTheme, appLanguage, toggleLanguage, isOnline, isSyncing, queueSize, lastSyncTime, syncOfflineQueue, addToOfflineQueue, deletedOrderIds, historyDeliveryFilter, setHistoryDeliveryFilter, historyPendingTimeFilter, setHistoryPendingTimeFilter }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
