import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { AppState, INITIAL_STATE, ViewType, OrderHistoryItem } from './types';
import { initFCMStartupReconciliation } from './lib/fcm';
import { useBackgroundSync } from './utils/backgroundSync';
import { deduplicateHistoryList, smartFetchGoogleScript } from './utils';


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
  resetOrderForm: () => void;
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
  addToOfflineQueue: (payload: any, webhookUrl: string, orderId?: string) => void;
  deletedOrderIds: string[];
  historyDeliveryFilter: 'all' | 'delivered' | 'pending';
  setHistoryDeliveryFilter: (val: 'all' | 'delivered' | 'pending') => void;
  historyPendingTimeFilter: 'all' | 'today' | 'tomorrow' | '2days' | '3days';
  setHistoryPendingTimeFilter: (val: 'all' | 'today' | 'tomorrow' | '2days' | '3days') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
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

    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);

    return Array.isArray(parsed) ? deduplicateHistoryList(parsed) : [];
  } catch (error) {
    console.error(
      'Failed to load order history:',
      error
    );

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

  useEffect(() => {
    localStorage.setItem('deletedOrderIds', JSON.stringify(deletedOrderIds));
  }, [deletedOrderIds]);

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
    localStorage.setItem('appState', JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem('viewStack', JSON.stringify(viewStack));
  }, [viewStack]);

  useEffect(() => {
    localStorage.setItem('generatedMessages', JSON.stringify(generatedMessages));
  }, [generatedMessages]);

  useEffect(() => {
    localStorage.setItem('orderHistory', JSON.stringify(history));
  }, [history]);

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
      return smartFetchGoogleScript(url, callbackName);
    };

    /**
     * Client-side foreground reminders loop.
     * Note: This is an in-browser foreground timer check while the tab is open.
     * It is NOT durable FCM background scheduling (which will be migrated in the next phase).
     * It strictly checks if Notification.permission === 'granted' and NEVER requests permission automatically.
     */
    const checkAlerts = () => {
      const now = Date.now();
      const TWENTY_MINS = 20 * 60 * 1000;
      const THREE_HOURS = 3 * 60 * 60 * 1000;
      
      setHistory(prevHistory => {
        let updatedHistory = false;
        const newHistory = prevHistory.map(item => {
          const { dueTimestamp, hasNotified, hasDueAlerted, hasThreeHourChecked, customerName, subType, mainType, orderId, isDelivered } = item.state;
          
          let itemUpdated = false;
          let newState = { ...item.state };

          if (dueTimestamp && !isDelivered) {
            const timeUntilDue = dueTimestamp - now;

            // 1. Check 3 hours logic: 3 hours before due time
            if (
  timeUntilDue > 0 &&
  timeUntilDue <= THREE_HOURS &&
  !hasThreeHourChecked
) {
              newState.hasThreeHourChecked = true;
              itemUpdated = true;

              const spreadsheetId = item.state?.spreadsheetId || '1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo';
              const oId = item.state?.orderId;

              if (oId && spreadsheetId) {
                const callbackName = 'jsonp_auto_sync_' + Math.round(100000 * Math.random()) + '_' + item.id;
                const url = new URL(getActiveScriptUrl(spreadsheetId));
                url.searchParams.append('action', 'get_link');
                url.searchParams.append('orderId', oId);
                url.searchParams.append('spreadsheetId', spreadsheetId);
                url.searchParams.append('callback', callbackName);

                jsonpRequest(url, callbackName)
                  .then((data) => {
                    if (data && data.status === 'success' && data.link) {
                      // Update successfully and save link
                      updateSpecificHistoryItem(item.id, {
                        googleSheetLink: data.link,
                        orderLink: data.link,
                        hasThreeHourChecked: true,
                        threeHourAlerted: true
                      });
                    } else {
                      // Not updated, send custom status query notification!
                      if (!item.state.googleSheetLink || item.state.googleSheetLink.trim() === '') {
                        const notifyTitle = appLanguage === 'ms' ? 'Status Tempahan' : 'Ask Order Status';
                        const notifyBody = `${customerName || 'Customer'} (${mainType || 'Tempahan'}) - Dah siap ke belum? Link masih belum dimasukkan.`;
                        
                        try {
                          if ('Notification' in window && Notification.permission === 'granted') {
                            new Notification(notifyTitle, { body: notifyBody });
                          }
                        } catch (e) { console.warn(e); }
                      }
                      updateSpecificHistoryItem(item.id, {
                        hasThreeHourChecked: true,
                        threeHourAlerted: true
                      });
                    }
                  })
                  .catch((err) => {
                    console.warn('Auto background sync failed:', err);
                    if (!item.state.googleSheetLink || item.state.googleSheetLink.trim() === '') {
                      const notifyTitle = appLanguage === 'ms' ? 'Status Tempahan' : 'Ask Order Status';
                      const notifyBody = `${customerName || 'Customer'} (${mainType || 'Tempahan'}) - Dah siap ke belum? Link masih belum dimasukkan.`;
                      
                      try {
                        if ('Notification' in window && Notification.permission === 'granted') {
                          new Notification(notifyTitle, { body: notifyBody });
                        }
                      } catch (e) { console.warn(e); }
                    }
                    updateSpecificHistoryItem(item.id, {
                      hasThreeHourChecked: true,
                      threeHourAlerted: true
                    });
                  });
              } else {
                // No spreadsheetId or orderId, just ask for status if no link
                if (!item.state.googleSheetLink || item.state.googleSheetLink.trim() === '') {
                  const notifyTitle = appLanguage === 'ms' ? 'Status Tempahan' : 'Ask Order Status';
                  const notifyBody = `${customerName || 'Customer'} (${mainType || 'Tempahan'}) - Dah siap ke belum? Link masih belum dimasukkan.`;
                  
                  try {
                    if ('Notification' in window && Notification.permission === 'granted') {
                      new Notification(notifyTitle, { body: notifyBody });
                    }
                  } catch (e) { console.warn(e); }
                }
                newState.threeHourAlerted = true;
              }
            }

            // 2. Check 20 mins logic
            if (!hasNotified && timeUntilDue > 0 && timeUntilDue <= TWENTY_MINS) {
              const title = appLanguage === 'ms' ? 'Pesanan Bakal Selesai!' : 'Order Due Soon!';
              const body = appLanguage === 'ms'
                ? `Pesanan untuk ${customerName || 'Pelanggan'} (${mainType} ${subType}) berbaki kurang dari 20 minit!`
                : `Order for ${customerName || 'Customer'} (${mainType} ${subType}) is due in less than 20 minutes!`;
              
              try {
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification(title, { body });
                }
              } catch (e) { console.warn(e); }
              newState.hasNotified = true;
              itemUpdated = true;
            }

            // 3. New Check "Due Now" logic (deadline reached)
            if (!hasDueAlerted && timeUntilDue <= 0) {
              const title = appLanguage === 'ms' ? 'Tempahan Sudah Sampai Tempoh!' : 'Order Deadline Reached!';
              const body = appLanguage === 'ms'
                ? `Tempahan untuk ${customerName || 'Pelanggan'} (${mainType} ${subType}) sudah sampai tempoh sekarang!`
                : `Order for ${customerName || 'Customer'} (${mainType} ${subType}) is due now!`;
              
              try {
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification(title, { body });
                }
              } catch (e) { console.warn(e); }
              newState.hasDueAlerted = true;
              itemUpdated = true;
            }
          }

          if (itemUpdated) {
            updatedHistory = true;
            return {
              ...item,
              state: newState
            };
          }
          return item;
        });

        return updatedHistory ? newHistory : prevHistory;
      });
    };

    // Silently reconcile FCM registration lifecycle on startup if already granted and registered
    let cleanupFCM: (() => void) | undefined;
    initFCMStartupReconciliation().then((cleanup) => {
      cleanupFCM = cleanup;
    }).catch(console.warn);

    const interval = setInterval(checkAlerts, 60000); // Check every minute
    checkAlerts(); // Check right away
    
    return () => {
      clearInterval(interval);
      if (cleanupFCM) {
        cleanupFCM();
      }
    };
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

  const updateQueueSize = () => {
    try {
      const q = localStorage.getItem('db_offline_sync_queue');
      if (q) {
        const parsed = JSON.parse(q);
        setQueueSize(Array.isArray(parsed) ? parsed.length : 0);
        return;
      }
    } catch {}
    setQueueSize(0);
  };

  const addToOfflineQueue = (payload: any, webhookUrl: string, orderId: string = '') => {
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

  const syncOfflineQueue = async () => {
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
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
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
      if (exists) {
        return prev.map(item => item.id === currentId ? newItem : item);
      }
      return [newItem, ...prev];
    });
    
    setState(finalState);
  };
  
  const updateOrderHistoryState = (updates: Partial<AppState>) => {
    setState(prev => {
      const previousHistoryId = prev.historyId;
      const finalState = { ...prev, ...updates, lastModifiedLocally: Date.now() };

      const targetId = finalState.historyId;
      if (targetId) {
        setHistory(hPrev => {
          const matchIndex = hPrev.findIndex(item => 
            item.id === targetId || 
            (previousHistoryId && item.id === previousHistoryId) ||
            (updates.orderId && item.state?.orderId === updates.orderId)
          );

          if (matchIndex !== -1) {
            const updatedHistory = [...hPrev];
            const existingItem = updatedHistory[matchIndex];
            const updatedItem: OrderHistoryItem = {
              ...existingItem,
              id: targetId,
              state: {
                ...existingItem.state,
                ...finalState,
                historyId: targetId
              }
            };
            updatedHistory[matchIndex] = updatedItem;
            return deduplicateHistoryList(updatedHistory);
          }

          const newItem: OrderHistoryItem = {
            id: targetId,
            timestamp: finalState.timestamp || Date.now(),
            state: finalState,
            messages: []
          };
          return deduplicateHistoryList([newItem, ...hPrev]);
        });
      }
      return finalState;
    });
  };

  const updateSpecificHistoryItem = (id: string, updates: Partial<AppState>) => {
    setHistory(prev => prev.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, state: { ...item.state, ...updates, lastModifiedLocally: Date.now() } };
        return updatedItem;
      }
      return item;
    }));
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
          customerInfo,
          isDelivered
        } = itemToRestore.state;

        if (scriptUrl && spreadsheetId && orderId) {
          const priceVal = itemToRestore.state.bayaran || itemToRestore.state.harga || itemToRestore.state.price || itemToRestore.state.itemPrice || '';
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
            orderId,
            priceVal ? String(priceVal) : ''
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
      customerName: String(s.customerName || s.name || INITIAL_STATE.customerName || ''),
      customerPhone: String(s.customerPhone || s.phone || INITIAL_STATE.customerPhone || ''),
      addons: Array.isArray(s.addons) ? s.addons : INITIAL_STATE.addons,
      clLangs: Array.isArray(s.clLangs) ? s.clLangs : INITIAL_STATE.clLangs,
      resumeLangs: Array.isArray(s.resumeLangs) ? s.resumeLangs : INITIAL_STATE.resumeLangs,
      timestamp: item.timestamp,
      historyId: item.id,
      isEditMode: true
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
      customerName: String(s.customerName || s.name || INITIAL_STATE.customerName || ''),
      customerPhone: String(s.customerPhone || s.phone || INITIAL_STATE.customerPhone || ''),
      addons: Array.isArray(s.addons) ? s.addons : INITIAL_STATE.addons,
      clLangs: Array.isArray(s.clLangs) ? s.clLangs : INITIAL_STATE.clLangs,
      resumeLangs: Array.isArray(s.resumeLangs) ? s.resumeLangs : INITIAL_STATE.resumeLangs,
      timestamp: item.timestamp,
      historyId: item.id,
      isEditMode: true
    });
    setViewStack(['home', 'history', 'customer-info']);
  };

  const startNewOrder = (view: ViewType, updates: Partial<AppState>) => {
    resetOrderForm();
    setState({ ...INITIAL_STATE, historyId: '', timestamp: Date.now(), ...updates });
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

  const resetOrderForm = () => {
    try {
      localStorage.removeItem('customer_form_progress');
    } catch (e) {
      // ignore
    }
    setState(prev => ({
      ...prev,
      customerName: '',
      customerPhone: '',
      customerInfo: '',
      orderLink: '',
      googleSheetLink: '',
      customerOrder: '',
      customerTemplate: '',
      customerBahasa: '',
      customerAddOn: '',
      customerJenis: '',
      customerDue: '',
      dueTimestamp: 0,
      name: '',
      phone: '',
      orderId: '',
      historyId: '',
      price: undefined,
      isEditMode: false
    }));
  };

  const reset = () => {
    setState(INITIAL_STATE);
    setViewStack(['home']);
    setGeneratedMessages([]);
    localStorage.removeItem('appState');
    localStorage.removeItem('viewStack');
    localStorage.removeItem('generatedMessages');
    localStorage.removeItem('customer_form_progress');
  };

  // Background synchronization utility checking for new order updates every 5 minutes when active
  useBackgroundSync(setHistory, deletedOrderIds);

  return (
    <AppContext.Provider value={{ state, setState, viewStack, pushView, changeTab, startNewOrder, popView, goHome, reset, resetOrderForm, generatedMessages, setGeneratedMessages, history, setHistory, saveOrderToHistory, updateOrderHistoryState, updateSpecificHistoryItem, deleteOrderFromHistory, restoreOrderFromHistory, permanentlyDeleteOrderFromHistory, clearHistory, loadOrder, drafts, saveAsDraft, deleteDraft, loadDraft, theme, toggleTheme, appLanguage, toggleLanguage, isOnline, isSyncing, queueSize, lastSyncTime, syncOfflineQueue, addToOfflineQueue, deletedOrderIds, historyDeliveryFilter, setHistoryDeliveryFilter, historyPendingTimeFilter, setHistoryPendingTimeFilter }}>
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
