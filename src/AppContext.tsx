import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { AppState, INITIAL_STATE, ViewType, OrderHistoryItem, InAppNotification } from './types';
import { getSubscription, syncPushNotifications, clearPushNotifications } from './lib/push';
import { getOperationalOrders, getOverdueOrders, getArchivedOrders } from './services/firestoreOrders';
import { parseDateStringToTimestamp } from './utils';

const deduplicateHistory = (items: OrderHistoryItem[]): OrderHistoryItem[] => {
  if (!Array.isArray(items)) return [];

  const isTemp = (item: OrderHistoryItem) => {
    const state: Partial<AppState> = item.state || {};
    const id = String(state.orderId || item.id || '');
    const markers = ['SYNC-', 'draft_', 'saved_locally', 'syncing', 'failed', 'sent_unverified'];
    return markers.some(marker => id.includes(marker)) || 
           markers.some(marker => String(state.syncStatus).includes(marker));
  };

  const normalizeText = (value: unknown) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

  const normalizePhone = (value: unknown) =>
    String(value || '').replace(/\D/g, '');

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

  const getDueDayTimestamp = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const d = new Date(value);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const num = Number(value.trim());
      if (Number.isFinite(num)) {
        const d = new Date(num);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }
    }
    if (typeof value !== 'string' || !value.trim()) {
      return 0;
    }
    const { date } = parseDateStringToTimestamp(value, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const result: OrderHistoryItem[] = [];

  for (const item of items) {
    if (!item || !item.id) continue;

    const localState: Partial<AppState> = item.state || {};
    
    // Check if there is an existing item in result that is a duplicate of this item
    const duplicateIdx = result.findIndex(existing => {
      const existingState: Partial<AppState> = existing.state || {};

      // 1. Direct ID matching
      if (
        item.id === existing.id ||
        (localState.orderId && localState.orderId === existing.id) ||
        (existingState.orderId && existingState.orderId === item.id) ||
        (localState.orderId && existingState.orderId && localState.orderId === existingState.orderId)
      ) {
        return true;
      }

      // 2. Fallback content matching (to prevent duplicate records on the same day)
      // Only use content fallback matching when at least one record is temporary or unsynced.
      if (!isTemp(item) && !isTemp(existing)) {
        return false;
      }

      // Require non-empty customerName, non-empty customerPhone, valid due date, and non-empty order type for fallback matching.
      const itemDue = parseDueTimestamp(localState.customerDue || localState.dueTimestamp);
      const existingDue = parseDueTimestamp(existingState.customerDue || existingState.dueTimestamp);
      
      if (!localState.customerName || !localState.customerPhone || itemDue <= 0 || !localState.customerOrder) {
        return false;
      }
      if (!existingState.customerName || !existingState.customerPhone || existingDue <= 0 || !existingState.customerOrder) {
        return false;
      }

      const sameName =
        normalizeText(localState.customerName) === normalizeText(existingState.customerName);
      
      const samePhone =
        normalizePhone(localState.customerPhone) === normalizePhone(existingState.customerPhone);

      const sameDueDay =
        getDueDayTimestamp(localState.customerDue || localState.dueTimestamp) ===
        getDueDayTimestamp(existingState.customerDue || existingState.dueTimestamp);

      const sameOrder =
        normalizeText(localState.customerOrder || localState.mainType) ===
        normalizeText(existingState.customerOrder || existingState.mainType);

      return (sameName && samePhone && sameDueDay && sameOrder);
    });

    if (duplicateIdx !== -1) {
      // We found a duplicate! Let's choose the better one to keep.
      const existing = result[duplicateIdx];
      const existingState: Partial<AppState> = existing.state || {};
      const isExistingTemp = isTemp(existing);
      const isLocalTemp = isTemp(item);

      let preferNew = false;
      if (isExistingTemp && !isLocalTemp) {
        preferNew = true;
      } else if (isLocalTemp && !isExistingTemp) {
        preferNew = false;
      } else {
        const existingSynced = existingState.syncStatus === 'synced';
        const localSynced = localState.syncStatus === 'synced';
        if (!existingSynced && localSynced) {
          preferNew = true;
        } else if (existingSynced && !localSynced) {
          preferNew = false;
        } else {
          // If both have the same sync state, compare the due timestamps
          const existingTime = parseDueTimestamp(existingState.customerDue || existingState.dueTimestamp);
          const localTime = parseDueTimestamp(localState.customerDue || localState.dueTimestamp);
          
          if (localTime > existingTime) {
            preferNew = true;
          } else if (localTime < existingTime) {
            preferNew = false;
          } else {
            const existingKeys = Object.keys(existingState).length;
            const localKeys = Object.keys(localState).length;
            if (localKeys > existingKeys) {
              preferNew = true;
            }
          }
        }
      }

      if (preferNew) {
        result[duplicateIdx] = item;
      }
    } else {
      result.push(item);
    }
  }

  return result;
};

interface AppContextType {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  viewStack: ViewType[];
  pushView: (view: ViewType, updates?: Partial<AppState>) => void;
  changeTab: (tab: ViewType) => void;
  startNewOrder: (view: ViewType, updates: Partial<AppState>) => void;
  startNewCustomer: () => void;
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
  isHistoryReady: boolean;
  queueSize: number;
  lastSyncTime: number | null;
  syncOfflineQueue: () => Promise<void>;
  addToOfflineQueue: (payload: any, webhookUrl: string, orderId: string) => void;
  deletedOrderIds: string[];
  historyDeliveryFilter: 'all' | 'delivered' | 'pending';
  setHistoryDeliveryFilter: (val: 'all' | 'delivered' | 'pending') => void;
  historyPendingTimeFilter: 'all' | 'today' | 'tomorrow' | '2days' | '3days';
  setHistoryPendingTimeFilter: (val: 'all' | 'today' | 'tomorrow' | '2days' | '3days') => void;
  syncOrders: () => Promise<void>;
  inAppNotifications: InAppNotification[];
  markNotificationAsRead: (id: string) => void;
  clearAllNotifications: () => void;
  addInAppNotification: (title: string, body: string, type?: 'soon' | 'due' | 'sync' | 'status_query', dedupeKey?: string) => void;
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

  const [history, setHistoryState] = useState<OrderHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('orderHistory');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? deduplicateHistory(parsed) : [];
      }
      return [];
    } catch {
      return [];
    }
  });

  const setHistory = (value: React.SetStateAction<OrderHistoryItem[]>) => {
    setHistoryState(prev => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;
      return deduplicateHistory(next);
    });
  };

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

  const [drafts, setDraftsState] = useState<OrderHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('orderDrafts');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? deduplicateHistory(parsed) : [];
      }
      return [];
    } catch {
      return [];
    }
  });

  const setDrafts = (value: React.SetStateAction<OrderHistoryItem[]>) => {
    setDraftsState(prev => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;
      return deduplicateHistory(next);
    });
  };

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

  const [inAppNotifications, setInAppNotifications] = useState<InAppNotification[]>(() => {
    try {
      const saved = localStorage.getItem('inAppNotifications');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('inAppNotifications', JSON.stringify(inAppNotifications));
  }, [inAppNotifications]);

  const addInAppNotification = (title: string, body: string, type?: 'soon' | 'due' | 'sync' | 'status_query', dedupeKey?: string) => {
    setInAppNotifications(prev => {
        if (dedupeKey) {
            const exists = prev.some(n => n.dedupeKey === dedupeKey && !n.isRead);
            if (exists) return prev;
        }
        const newNotif: InAppNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          title,
          body,
          timestamp: Date.now(),
          isRead: false,
          type,
          dedupeKey
        };
        return [newNotif, ...prev];
    });
  };

  const markNotificationAsRead = (id: string) => {
    setInAppNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const clearAllNotifications = () => {
    setInAppNotifications([]);
  };


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
        const script = document.createElement('script');
        script.src = url.toString();
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

  useEffect(() => {
    const checkAlerts = () => {
      const now = Date.now();
      const TWENTY_MINS = 20 * 60 * 1000;
      const THREE_HOURS = 3 * 60 * 60 * 1000;
      
      const alertsToTrigger: Array<{ title: string; body: string; type: 'soon' | 'due' | 'status_query'; dedupeKey: string }> = [];

      setHistory(prevHistory => {
        let updatedHistory = false;
        const newHistory = prevHistory.map(item => {
          const { dueTimestamp, hasNotified, hasDueAlerted, hasThreeHourChecked, customerName, subType, mainType, orderId, isDelivered } = item.state;
          
          let itemUpdated = false;
          let newState = { ...item.state };

          if (dueTimestamp && !isDelivered) {
            const timeUntilDue = dueTimestamp - now;

            // 1. Check 3 hours logic: 3 hours before due time
            if (timeUntilDue <= THREE_HOURS && !hasThreeHourChecked) {
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
                        
                        addInAppNotification(notifyTitle, notifyBody, 'status_query', `status_query_${item.id}`);
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
                      
                      addInAppNotification(notifyTitle, notifyBody, 'status_query', `status_query_${item.id}`);
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
                  
                  alertsToTrigger.push({ title: notifyTitle, body: notifyBody, type: 'status_query', dedupeKey: `status_query_${item.id}` });
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
              
              alertsToTrigger.push({ title, body, type: 'soon', dedupeKey: `soon_${item.id}` });
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
              
              alertsToTrigger.push({ title, body, type: 'due', dedupeKey: `due_${item.id}` });
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

      if (alertsToTrigger.length > 0) {
        setInAppNotifications(prev => {
          const filteredAlerts = alertsToTrigger.filter(a => {
            if (a.dedupeKey) {
                const exists = prev.some(n => n.dedupeKey === a.dedupeKey && !n.isRead);
                return !exists;
            }
            return true;
          });

          const newAlerts = filteredAlerts.map(a => ({
            id: `notif_${Date.now()}_${Math.round(Math.random() * 1000000)}`,
            title: a.title,
            body: a.body,
            timestamp: Date.now(),
            isRead: false,
            type: a.type as any,
            dedupeKey: a.dedupeKey
          }));
          return [...newAlerts, ...prev];
        });
      }
    };

    // Ask for permission and trigger PWA/Web Push subscription registration if supported
    try {
      getSubscription().catch(console.warn);
    } catch (e) {
      console.warn("Could not register push notifications on mount", e);
    }


    const interval = setInterval(checkAlerts, 60000); // Check every minute
    const syncInterval = setInterval(syncOrders, 60000); // Sync every minute
    checkAlerts(); // Check right away
    
    return () => {
        clearInterval(interval);
        clearInterval(syncInterval);
    };
  }, [appLanguage]);

  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [historyDeliveryFilter, setHistoryDeliveryFilter] = useState<'all' | 'delivered' | 'pending'>('all');
  const [historyPendingTimeFilter, setHistoryPendingTimeFilter] = useState<'all' | 'today' | 'tomorrow' | '2days' | '3days'>('all');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isHistoryReady, setIsHistoryReady] = useState<boolean>(false);
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

      const title = appLanguage === 'ms' ? 'Kemaskini Selesai' : 'Sync Completed';
      const body = appLanguage === 'ms' 
        ? `${processedCount} rekod luar talian telah berjaya dikemaskini.` 
        : `${processedCount} records from queue synced.`;

      addInAppNotification(title, body, 'sync', 'sync_offline_queue');

      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body });
        }
      } catch(e) {}
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
    syncOrders();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [appLanguage]);

  const syncOrders = async () => {
    setIsSyncing(true);
    try {
      const savedSheets = localStorage.getItem('db_annual_sheets');
      const annualSheets = savedSheets ? JSON.parse(savedSheets) : [
        { year: '2024', spreadsheetId: '1B9zdWXVLnvj0jNNVnKxcb6cJnS1VLCIdB4j-RR3wOlg', scriptUrl: '' },
        { year: '2025', spreadsheetId: '1myU9apnYWWtU3snnCw14qI6ZS05i4DY6oOswLz1sCwo', scriptUrl: '' },
        { year: '2026', spreadsheetId: '1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo', scriptUrl: '' }
      ];

      const [operational, overdue, archived, ...sheetResults] = await Promise.all([
        getOperationalOrders(),
        getOverdueOrders(),
        getArchivedOrders(),
        ...annualSheets.map(async (sheet: any) => {
          if (!sheet.spreadsheetId?.trim()) return [];
          const url = new URL(sheet.scriptUrl?.trim() || 'https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec');
          url.searchParams.append('action', 'sync_recent');
          url.searchParams.append('spreadsheetId', sheet.spreadsheetId.trim());
          const callbackName = 'jsonp_callback_sync_' + Math.round(100000 * Math.random());
          url.searchParams.append('callback', callbackName);
          try {
            const data = await jsonpRequest(url, callbackName);
            return (data && data.status === 'success' && Array.isArray(data.orders)) ? data.orders : [];
          } catch (e) {
            console.error('Sheet sync failed', e);
            return [];
          }
        })
      ]);
      
      const allFirestoreOrders = [...operational, ...overdue, ...archived];
      
      const uniqueOrders = new Set<string>();
      const filteredOrders: OrderHistoryItem[] = [];

      const processOrder = (order: any, isFirestore: boolean) => {
        if (order.status === 'draft') return;
        
        const id = order.orderId || order.historyId || `SYNC-${order.name || 'UNKNOWN'}-${order.phone || ''}-${order.due || ''}`.replace(/[^a-zA-Z0-9-]/g, '');
        if (id && !uniqueOrders.has(id)) {
          uniqueOrders.add(id);
          filteredOrders.push({
            id: id,
            timestamp: order.timestamp || Date.now(),
            state: {
                ...order,
                syncStatus: isFirestore ? order.syncStatus || 'synced' : 'synced'
            },
            messages: []
          });
        }
      };

      for (const order of allFirestoreOrders) {
          processOrder(order, true);
      }
      
      for (const sheetResult of sheetResults) {
          for (const order of sheetResult) {
              processOrder(order, false);
          }
      }

      setHistory(filteredOrders);
    } catch (e) {
      console.error("Sync failed", e);
    } finally {
      setIsSyncing(false);
      setIsHistoryReady(true);
    }
  };

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
    syncPushNotifications(newItem, appLanguage).catch(console.warn);
  };
  
  const updateOrderHistoryState = (updates: Partial<AppState>) => {
    const finalState = { ...state, ...updates, lastModifiedLocally: Date.now() };
    setState(finalState);
    if (finalState.historyId) {
       setHistory(prev => {
         const exists = prev.some(item => item.id === finalState.historyId);
         if (exists) {
           return prev.map(item => {
             if (item.id === finalState.historyId) {
               const updatedItem = { ...item, state: finalState };
               syncPushNotifications(updatedItem, appLanguage).catch(console.warn);
               return updatedItem;
             }
             return item;
           });
         }
         
         const newItem: OrderHistoryItem = {
           id: finalState.historyId as string,
           timestamp: finalState.timestamp || Date.now(),
           state: finalState,
           messages: []
         };
         syncPushNotifications(newItem, appLanguage).catch(console.warn);
         return [newItem, ...prev];
       });
    }
  };

  const updateSpecificHistoryItem = (id: string, updates: Partial<AppState>) => {
    setHistory(prev => prev.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, state: { ...item.state, ...updates, lastModifiedLocally: Date.now() } };
        syncPushNotifications(updatedItem, appLanguage).catch(console.warn);
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
          customerInfo,
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
      customerName: s.customerName || s.name || INITIAL_STATE.customerName,
      customerPhone: s.customerPhone || s.phone || INITIAL_STATE.customerPhone,
      addons: Array.isArray(s.addons) ? s.addons : INITIAL_STATE.addons,
      clLangs: Array.isArray(s.clLangs) ? s.clLangs : INITIAL_STATE.clLangs,
      resumeLangs: Array.isArray(s.resumeLangs) ? s.resumeLangs : INITIAL_STATE.resumeLangs,
      timestamp: item.timestamp,
      historyId: item.id,
      isEditMode: s.isEditMode === true || s.customerOrder === 'Edit Resume'
    });
    setViewStack(['home', 'history', 'customer-info']);
  };

  const startNewCustomer = () => {
    localStorage.removeItem('customer_form_progress');
    setState(prev => ({
      ...INITIAL_STATE,
      spreadsheetId: prev.spreadsheetId
    }));
    setViewStack(['home', 'customer-info']);
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
    <AppContext.Provider value={{ state, setState, viewStack, pushView, changeTab, startNewOrder, startNewCustomer, popView, goHome, reset, generatedMessages, setGeneratedMessages, history, setHistory, saveOrderToHistory, updateOrderHistoryState, updateSpecificHistoryItem, deleteOrderFromHistory, restoreOrderFromHistory, permanentlyDeleteOrderFromHistory, clearHistory, loadOrder, drafts, saveAsDraft, deleteDraft, loadDraft, theme, toggleTheme, appLanguage, toggleLanguage, isOnline, isSyncing, isHistoryReady, queueSize, lastSyncTime, syncOfflineQueue, addToOfflineQueue, deletedOrderIds, historyDeliveryFilter, setHistoryDeliveryFilter, historyPendingTimeFilter, setHistoryPendingTimeFilter, syncOrders, inAppNotifications, markNotificationAsRead, clearAllNotifications, addInAppNotification }}>
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
