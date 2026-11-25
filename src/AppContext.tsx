import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { AppState, INITIAL_STATE, ViewType, OrderHistoryItem } from './types';
import {
  initFCMStartupReconciliation,
  showServiceWorkerNotification,
  syncOrderRemindersToBackend,
  playAlertChime,
  getCurrentFid,
  refreshDeviceRegistrationHeartbeat,
  sendDevicePresenceHeartbeat,
  getOrCreateSyncDeviceId,
  fetchCrossDeviceNotificationState,
  syncReadNotificationsToBackend,
  subscribeToNotificationStream,
  SyncedDeviceInfo,
  SyncedAlertEvent,
  ServerOrderReminder,
  CrossDeviceNotificationState,
} from './lib/fcm';
import { useBackgroundSync } from './utils/backgroundSync';
import { deduplicateHistoryList, smartFetchGoogleScript, normalizeUrgencyForSheet } from './utils';
import { getOrderDueTimestamp } from './utils/orderWindow';
import { DEFAULT_SPREADSHEET_ID, mergeRemoteSheetConfigs, resolveSpreadsheetIdForYear } from './utils/cloudConfig';


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
  remoteReminders: ServerOrderReminder[];
  recentSyncedAlerts: SyncedAlertEvent[];
  incomingAlertToast: SyncedAlertEvent | null;
  dismissIncomingAlertToast: () => void;
  syncedDevicesCount: number;
  syncedDevices: SyncedDeviceInfo[];
  sharedReadNotificationIds: string[];
  isSyncingNotifications: boolean;
  lastNotificationSyncAt: number | null;
  markNotificationsRead: (ids: string[], action?: 'read' | 'unread' | 'clear') => Promise<void>;
  syncAllDevicesNotifications: () => Promise<boolean>;
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
      const currentYear = String(new Date().getFullYear());
      const defaultSheetId = resolveSpreadsheetIdForYear(currentYear, DEFAULT_SPREADSHEET_ID);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...INITIAL_STATE,
          ...parsed,
          spreadsheetId: (parsed.spreadsheetId && String(parsed.spreadsheetId).trim()) || defaultSheetId,
          addons: Array.isArray(parsed.addons) ? parsed.addons : INITIAL_STATE.addons,
          clLangs: Array.isArray(parsed.clLangs) ? parsed.clLangs : INITIAL_STATE.clLangs,
          resumeLangs: Array.isArray(parsed.resumeLangs) ? parsed.resumeLangs : INITIAL_STATE.resumeLangs
        };
      }
      return { ...INITIAL_STATE, spreadsheetId: defaultSheetId };
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

  const historyRef = useRef(history);
  historyRef.current = history;
  const deletedOrderIdsRef = useRef(deletedOrderIds);
  deletedOrderIdsRef.current = deletedOrderIds;
  const appLanguageRef = useRef(appLanguage);
  appLanguageRef.current = appLanguage;
  const isCheckingAlertsRef = useRef(false);

  const [remoteReminders, setRemoteReminders] = useState<ServerOrderReminder[]>([]);
  const [recentSyncedAlerts, setRecentSyncedAlerts] = useState<SyncedAlertEvent[]>([]);
  const [incomingAlertToast, setIncomingAlertToast] = useState<SyncedAlertEvent | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deliveredAlertIdsRef = useRef<string[]>((() => {
    try {
      const saved = localStorage.getItem('app_delivered_alert_ids');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.slice(-100) : [];
    } catch {
      return [];
    }
  })());
  const [syncedDevicesCount, setSyncedDevicesCount] = useState<number>(0);
  const [syncedDevices, setSyncedDevices] = useState<SyncedDeviceInfo[]>([]);
  const [sharedReadNotificationIds, setSharedReadNotificationIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('app_read_notifications');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [isSyncingNotifications, setIsSyncingNotifications] = useState<boolean>(false);
  const [lastNotificationSyncAt, setLastNotificationSyncAt] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('app_read_notifications', JSON.stringify(sharedReadNotificationIds));
    } catch {}
  }, [sharedReadNotificationIds]);

  const dismissIncomingAlertToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setIncomingAlertToast(null);
  }, []);

  const processIncomingAlerts = useCallback((alerts: SyncedAlertEvent[]) => {
    if (!Array.isArray(alerts) || alerts.length === 0) return;

    const myDeviceId = getOrCreateSyncDeviceId();
    const myFidSuffix = getCurrentFid()?.slice(-8);
    const now = Date.now();
    const FRESH_WINDOW_MS = 5 * 60 * 1000;

    setRecentSyncedAlerts((prev) => {
      const map = new Map<string, SyncedAlertEvent>();
      for (const a of [...prev, ...alerts]) {
        if (a && a.id && now - (a.createdAt || now) < 24 * 60 * 60 * 1000) {
          map.set(a.id, a);
        }
      }
      return Array.from(map.values())
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 20);
    });

    let deliveredModified = false;
    const deliveredSet = new Set(deliveredAlertIdsRef.current);

    for (const alert of alerts) {
      if (!alert || !alert.id) continue;
      if (deliveredSet.has(alert.id)) continue;

      deliveredSet.add(alert.id);
      deliveredModified = true;

      const isFromSelf =
        (alert.senderDeviceId && alert.senderDeviceId === myDeviceId) ||
        (alert.senderFidSuffix && myFidSuffix && alert.senderFidSuffix === myFidSuffix);

      if (isFromSelf) continue;

      const isFresh = now - (alert.createdAt || now) <= FRESH_WINDOW_MS;
      if (!isFresh) continue;

      playAlertChime();
      showServiceWorkerNotification(alert.title || '🔥 Notifikasi Disegerakkan', {
        body: alert.body || '',
        tag: alert.id,
        data: { url: '/', orderId: alert.orderId },
      }).catch(() => {});

      setIncomingAlertToast(alert);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setIncomingAlertToast(null);
        toastTimerRef.current = null;
      }, 7000);
    }

    if (deliveredModified) {
      const trimmed = Array.from(deliveredSet).slice(-100);
      deliveredAlertIdsRef.current = trimmed;
      try {
        localStorage.setItem('app_delivered_alert_ids', JSON.stringify(trimmed));
      } catch {}
    }
  }, []);

  const applyCrossDeviceState = useCallback((data: Partial<CrossDeviceNotificationState>) => {
    if (!data) return;

    if (typeof data.activeDevicesCount === 'number') {
      setSyncedDevicesCount(data.activeDevicesCount);
    }
    if (Array.isArray(data.devices)) {
      setSyncedDevices(data.devices);
    }

    if (Array.isArray(data.recentAlerts)) {
      processIncomingAlerts(data.recentAlerts);
    }

    if (Array.isArray(data.readNotificationIds)) {
      setSharedReadNotificationIds((prev) => {
        const merged = Array.from(new Set([...prev, ...data.readNotificationIds!]));
        return merged.length === prev.length && merged.every((id, idx) => prev[idx] === id) ? prev : merged;
      });
    }

    if (Array.isArray(data.reminders)) {
      const currentDeleted = deletedOrderIdsRef.current;
      const filteredRemote = data.reminders.filter(
        (r) => !r.isDeleted && !currentDeleted.includes(r.id) && (!r.orderId || !currentDeleted.includes(r.orderId))
      );
      setRemoteReminders(filteredRemote);

      // Merge remote order state updates (delivery, delete, alert flags, links) into matching local history
      const now = Date.now();
      const byId = new Map<string, ServerOrderReminder>();
      for (const r of data.reminders) {
        byId.set(r.id, r);
        if (r.orderId) byId.set(r.orderId, r);
      }

      setHistory((prev) => {
        let changed = false;
        const updated = [...prev];
        const existingKeys = new Set<string>();
        for (const item of prev) {
          if (item.id) existingKeys.add(item.id);
          if (item.state?.orderId) existingKeys.add(item.state.orderId);
        }

        // 1. Update existing local items
        const mapped = updated.map((item) => {
          if (!item?.state) return item;
          const remote = byId.get(item.id) || (item.state.orderId ? byId.get(item.state.orderId) : undefined);
          if (!remote) return item;

          const recentlyEditedLocally = now - (item.state.lastModifiedLocally || 0) < 10000;
          if (recentlyEditedLocally) return item;

          let mod = false;
          const nextState = { ...item.state };

          if (remote.hasNotified20Min && !nextState.hasNotified) {
            nextState.hasNotified = true;
            mod = true;
          }
          if (remote.hasDueAlerted && !nextState.hasDueAlerted) {
            nextState.hasDueAlerted = true;
            mod = true;
          }
          if (remote.hasThreeHourAlerted && !nextState.hasThreeHourChecked) {
            nextState.hasThreeHourChecked = true;
            nextState.threeHourAlerted = true;
            mod = true;
          }
          if (remote.isDelivered !== undefined && remote.isDelivered !== Boolean(nextState.isDelivered)) {
            nextState.isDelivered = remote.isDelivered;
            mod = true;
          }
          if (remote.isDeleted && !nextState.isDeleted) {
            nextState.isDeleted = true;
            mod = true;
          }
          if (remote.googleSheetLink && !nextState.googleSheetLink) {
            nextState.googleSheetLink = remote.googleSheetLink;
            nextState.orderLink = remote.googleSheetLink;
            mod = true;
          }

          if (mod) {
            changed = true;
            return { ...item, state: nextState };
          }
          return item;
        });

        // 2. Automatically add any remote reminders not yet present in local history
        for (const rem of filteredRemote) {
          if (existingKeys.has(rem.id) || (rem.orderId && existingKeys.has(rem.orderId))) continue;
          if (rem.isDeleted) continue;

          const synthesized: OrderHistoryItem = {
            id: rem.id,
            timestamp: rem.createdAt ? Date.parse(rem.createdAt) || now : now,
            state: {
              ...INITIAL_STATE,
              historyId: rem.id,
              orderId: rem.orderId || rem.id,
              customerName: rem.customerName || 'Pelanggan',
              mainType: rem.mainType || 'Pesanan',
              subType: rem.subType || '',
              dueTimestamp: rem.dueTimestamp || 0,
              isDelivered: Boolean(rem.isDelivered),
              isDeleted: Boolean(rem.isDeleted),
              googleSheetLink: rem.googleSheetLink || '',
              orderLink: rem.googleSheetLink || '',
              hasNotified: rem.hasNotified20Min,
              hasDueAlerted: rem.hasDueAlerted,
              hasThreeHourChecked: rem.hasThreeHourAlerted,
              threeHourAlerted: rem.hasThreeHourAlerted,
              syncStatus: 'synced',
              syncLastSuccess: now,
            },
            messages: [],
          };
          mapped.unshift(synthesized);
          existingKeys.add(rem.id);
          if (rem.orderId) existingKeys.add(rem.orderId);
          changed = true;
        }

        return changed ? mapped : prev;
      });
    }

    if (data.sheetConfigs) {
      mergeRemoteSheetConfigs(data.sheetConfigs);
      setState((prev) => {
        if (prev.spreadsheetId && prev.spreadsheetId.trim()) return prev;
        const resolved = resolveSpreadsheetIdForYear(String(new Date().getFullYear()), DEFAULT_SPREADSHEET_ID);
        return resolved ? { ...prev, spreadsheetId: resolved } : prev;
      });
    }

    setLastNotificationSyncAt(Date.now());
  }, [processIncomingAlerts]);

  const syncAllDevicesNotifications = useCallback(async (): Promise<boolean> => {
    setIsSyncingNotifications(true);
    try {
      const [heartbeat] = await Promise.all([
        sendDevicePresenceHeartbeat().catch(() => null),
        refreshDeviceRegistrationHeartbeat().catch(() => {}),
      ]);
      if (heartbeat) {
        setSyncedDevicesCount(heartbeat.activeDevicesCount);
        setSyncedDevices(heartbeat.devices);
      }
      const stateData = await fetchCrossDeviceNotificationState();
      if (stateData) {
        applyCrossDeviceState(stateData);
        return true;
      }
      return Boolean(heartbeat);
    } finally {
      setIsSyncingNotifications(false);
    }
  }, [applyCrossDeviceState]);

  const markNotificationsRead = useCallback(
    async (ids: string[], action: 'read' | 'unread' | 'clear' = 'read') => {
      if (action === 'clear') {
        setSharedReadNotificationIds([]);
      } else if (action === 'unread') {
        setSharedReadNotificationIds((prev) => prev.filter((id) => !ids.includes(id)));
      } else {
        setSharedReadNotificationIds((prev) => Array.from(new Set([...prev, ...ids])));
      }

      const serverIds = await syncReadNotificationsToBackend(ids, action);
      if (Array.isArray(serverIds)) {
        setSharedReadNotificationIds(serverIds);
      }
    },
    []
  );

  // Mount-only FCM lifecycle reconciliation, SSE cross-device stream, & Service Worker notification click handler
  useEffect(() => {
    let cleanupFCM: (() => void) | undefined;
    initFCMStartupReconciliation().then((cleanup) => {
      cleanupFCM = cleanup;
    }).catch(console.warn);

    // Initial universal device heartbeat + cross-device notification state pull
    syncAllDevicesNotifications().catch(() => {});

    let syncDebounce: ReturnType<typeof setTimeout> | null = null;
    const triggerDebouncedPull = () => {
      if (syncDebounce) clearTimeout(syncDebounce);
      syncDebounce = setTimeout(() => {
        fetchCrossDeviceNotificationState().then((d) => {
          if (d) applyCrossDeviceState(d);
        }).catch(() => {});
      }, 200);
    };

    const cleanupSSE = subscribeToNotificationStream((evt) => {
      if (evt.reason === 'test_alert') {
        const incoming: SyncedAlertEvent = evt.alert || {
          id: evt.id || `sse_test_${evt.timestamp || Date.now()}`,
          type: 'test_alert',
          title: evt.title || '🔥 Ujian Notifikasi',
          body: evt.body || 'Ujian notifikasi disegerakkan dari peranti lain.',
          senderDeviceId: evt.senderDeviceId,
          senderDeviceLabel: evt.senderDeviceLabel,
          senderFidSuffix: evt.senderFidSuffix,
          createdAt: evt.timestamp || evt.createdAt || Date.now(),
        };
        processIncomingAlerts([incoming]);
        return;
      }

      if (evt.reason === 'order_alert') {
        const incoming: SyncedAlertEvent = evt.alert || {
          id: evt.id || `sse_order_${evt.orderId || Date.now()}`,
          type: 'order_alert',
          title: evt.title || 'Peringatan Tempahan',
          body: evt.body || '',
          orderId: evt.orderId,
          createdAt: evt.timestamp || Date.now(),
        };
        processIncomingAlerts([incoming]);
      }

      if (Array.isArray(evt.readNotificationIds)) {
        setSharedReadNotificationIds(evt.readNotificationIds);
      }
      if (typeof evt.activeDevicesCount === 'number') {
        setSyncedDevicesCount(evt.activeDevicesCount);
      }

      if (evt.reason === 'connected') {
        sendDevicePresenceHeartbeat().then((hb) => {
          if (hb) {
            setSyncedDevicesCount(hb.activeDevicesCount);
            setSyncedDevices(hb.devices);
          }
        }).catch(() => {});
        triggerDebouncedPull();
        return;
      }

      if (evt.reason === 'sheets_updated') {
        if (evt.sheetConfigs) {
          mergeRemoteSheetConfigs(evt.sheetConfigs);
        } else {
          triggerDebouncedPull();
        }
        return;
      }

      if (
        evt.reason === 'reminders_updated' ||
        evt.reason === 'devices_updated' ||
        evt.reason === 'read_updated' ||
        evt.reason === 'order_alert'
      ) {
        triggerDebouncedPull();
      }
    });

    const handleVisibilityOrFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        syncAllDevicesNotifications().catch(() => {});
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    let tickCount = 0;
    const periodicSync = setInterval(() => {
      tickCount++;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && tickCount % 2 !== 0) {
        return;
      }
      if (tickCount % 2 === 0) {
        sendDevicePresenceHeartbeat().catch(() => {});
      }
      fetchCrossDeviceNotificationState().then((d) => {
        if (d) applyCrossDeviceState(d);
      }).catch(() => {});
    }, 15000);

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICKED' && event.data.orderId) {
        const clickedOrderId = String(event.data.orderId);
        console.log('[AppContext] Service worker notification clicked for order:', clickedOrderId);
        const match = historyRef.current.find(
          (h) => h.id === clickedOrderId || h.state?.orderId === clickedOrderId
        );
        if (match) {
          loadOrder(match);
        } else {
          setViewStack(['home', 'history']);
        }
      }
    };

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      if (cleanupFCM) {
        cleanupFCM();
      }
      cleanupSSE();
      if (syncDebounce) clearTimeout(syncDebounce);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      clearInterval(periodicSync);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, [applyCrossDeviceState, processIncomingAlerts, syncAllDevicesNotifications]);

  // Client-side foreground reminders loop (30s interval + triggered when orders update)
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

    const jsonpRequest = (url: URL, _callbackName?: string): Promise<any> => {
      return smartFetchGoogleScript(url, 50000);
    };

    const checkAlerts = async () => {
      if (isCheckingAlertsRef.current) return;
      isCheckingAlertsRef.current = true;

      try {
        const currentHistory = historyRef.current;
        const currentDeleted = deletedOrderIdsRef.current;
        const lang = appLanguageRef.current;
        const now = Date.now();
        const TWENTY_MINS = 20 * 60 * 1000;
        const THREE_HOURS = 3 * 60 * 60 * 1000;
        const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

        const pendingUpdates: { id: string; updates: Partial<AppState> }[] = [];

        for (const item of currentHistory) {
          if (!item?.state) continue;
          if (item.state.isDeleted || currentDeleted.includes(item.id) || (item.state.orderId && currentDeleted.includes(item.state.orderId))) {
            continue;
          }

          const { hasNotified, hasDueAlerted, hasThreeHourChecked, customerName, subType, mainType, isDelivered } = item.state;
          const dueTimestamp = getOrderDueTimestamp(item);

          if (dueTimestamp && !isDelivered) {
            const timeUntilDue = dueTimestamp - now;

            // 1. Check 3 hours before due time
            if (timeUntilDue > 0 && timeUntilDue <= THREE_HOURS && !hasThreeHourChecked) {
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
                  .then(async (data) => {
                    if (data && data.status === 'success' && data.link) {
                      updateSpecificHistoryItem(item.id, {
                        googleSheetLink: data.link,
                        orderLink: data.link,
                        hasThreeHourChecked: true,
                        threeHourAlerted: true
                      });
                    } else {
                      let displayed = false;
                      if (!item.state.googleSheetLink || item.state.googleSheetLink.trim() === '') {
                        const notifyTitle = lang === 'ms' ? 'Status Tempahan' : 'Ask Order Status';
                        const notifyBody = `${customerName || 'Customer'} (${mainType || 'Tempahan'}) - Dah siap ke belum? Link masih belum dimasukkan.`;
                        displayed = await showServiceWorkerNotification(notifyTitle, {
                          body: notifyBody,
                          tag: `three_hour_${item.id}`,
                          data: { orderId: item.state?.orderId || item.id, url: '/' }
                        });
                        if (displayed) playAlertChime();
                      }
                      if (displayed || data) {
                        updateSpecificHistoryItem(item.id, {
                          hasThreeHourChecked: true,
                          threeHourAlerted: true
                        });
                      }
                    }
                  })
                  .catch(async (err) => {
                    console.warn('Auto background sync failed:', err);
                    if (!item.state.googleSheetLink || item.state.googleSheetLink.trim() === '') {
                      const notifyTitle = lang === 'ms' ? 'Status Tempahan' : 'Ask Order Status';
                      const notifyBody = `${customerName || 'Customer'} (${mainType || 'Tempahan'}) - Dah siap ke belum? Link masih belum dimasukkan.`;
                      const displayed = await showServiceWorkerNotification(notifyTitle, {
                        body: notifyBody,
                        tag: `three_hour_${item.id}`,
                        data: { orderId: item.state?.orderId || item.id, url: '/' }
                      });
                      if (displayed) {
                        playAlertChime();
                        updateSpecificHistoryItem(item.id, {
                          hasThreeHourChecked: true,
                          threeHourAlerted: true
                        });
                      }
                    }
                  });
              } else {
                if (!item.state.googleSheetLink || item.state.googleSheetLink.trim() === '') {
                  const notifyTitle = lang === 'ms' ? 'Status Tempahan' : 'Ask Order Status';
                  const notifyBody = `${customerName || 'Customer'} (${mainType || 'Tempahan'}) - Dah siap ke belum? Link masih belum dimasukkan.`;
                  const displayed = await showServiceWorkerNotification(notifyTitle, {
                    body: notifyBody,
                    tag: `three_hour_${item.id}`,
                    data: { orderId: item.state?.orderId || item.id, url: '/' }
                  });
                  if (displayed) {
                    playAlertChime();
                    pendingUpdates.push({ id: item.id, updates: { hasThreeHourChecked: true, threeHourAlerted: true } });
                  }
                }
              }
            }

            // 2. Check 20 mins logic
            if (!hasNotified && timeUntilDue > 0 && timeUntilDue <= TWENTY_MINS) {
              const title = lang === 'ms' ? 'Pesanan Bakal Selesai!' : 'Order Due Soon!';
              const body = lang === 'ms'
                ? `Pesanan untuk ${customerName || 'Pelanggan'} (${mainType} ${subType || ''}) berbaki kurang dari 20 minit!`
                : `Order for ${customerName || 'Customer'} (${mainType} ${subType || ''}) is due in less than 20 minutes!`;

              const displayed = await showServiceWorkerNotification(title, {
                body,
                tag: `due_soon_${item.id}`,
                data: { orderId: item.state?.orderId || item.id, url: '/' }
              });

              if (displayed) {
                playAlertChime();
                pendingUpdates.push({ id: item.id, updates: { hasNotified: true } });
              }
            }

            // 3. Check "Due Now" logic (within last 48h to avoid spamming ancient orders)
            if (!hasDueAlerted && timeUntilDue <= 0 && timeUntilDue >= -FORTY_EIGHT_HOURS) {
              const title = lang === 'ms' ? 'Tempahan Sudah Sampai Tempoh!' : 'Order Deadline Reached!';
              const body = lang === 'ms'
                ? `Tempahan untuk ${customerName || 'Pelanggan'} (${mainType} ${subType || ''}) sudah sampai tempoh sekarang!`
                : `Order for ${customerName || 'Customer'} (${mainType} ${subType || ''}) is due now!`;

              const displayed = await showServiceWorkerNotification(title, {
                body,
                tag: `due_now_${item.id}`,
                data: { orderId: item.state?.orderId || item.id, url: '/' }
              });

              if (displayed) {
                playAlertChime();
                pendingUpdates.push({ id: item.id, updates: { hasDueAlerted: true } });
              }
            }
          }
        }

        if (pendingUpdates.length > 0) {
          setHistory(prevHistory => {
            return prevHistory.map(item => {
              const match = pendingUpdates.find(u => u.id === item.id);
              if (match && item.state) {
                return {
                  ...item,
                  state: {
                    ...item.state,
                    ...match.updates
                  }
                };
              }
              return item;
            });
          });
        }
      } finally {
        isCheckingAlertsRef.current = false;
      }
    };

    const interval = setInterval(checkAlerts, 30000);
    checkAlerts();

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Synchronize active order reminders to backend whenever any order status, due timestamp, or deletion changes
  const reminderSyncPayload = history
    .filter(item => item?.state)
    .map(item => ({
      id: item.id,
      orderId: item.state.orderId,
      customerName: item.state.customerName || 'Pelanggan',
      mainType: item.state.mainType || 'Pesanan',
      subType: item.state.subType || '',
      dueTimestamp: getOrderDueTimestamp(item) || 0,
      isDelivered: Boolean(item.state.isDelivered),
      isDeleted: Boolean(item.state.isDeleted || deletedOrderIds.includes(item.id)),
      hasNotified20Min: Boolean(item.state.hasNotified),
      hasDueAlerted: Boolean(item.state.hasDueAlerted),
      hasThreeHourAlerted: Boolean(item.state.hasThreeHourChecked || item.state.threeHourAlerted),
      googleSheetLink: item.state.googleSheetLink || '',
      language: appLanguage,
    }))
    .filter(o => o.dueTimestamp > 0);

  const reminderSyncSignature = reminderSyncPayload
    .map(o => `${o.id}:${o.dueTimestamp}:${o.isDelivered ? 1 : 0}:${o.isDeleted ? 1 : 0}:${o.hasNotified20Min ? 1 : 0}:${o.hasDueAlerted ? 1 : 0}`)
    .join('|');

  useEffect(() => {
    const timer = setTimeout(() => {
      syncOrderRemindersToBackend(reminderSyncPayload).then(res => {
        if (res?.reminderStates) {
          setHistory(prev => {
            let changed = false;
            const updated = prev.map(item => {
              const serverState = res.reminderStates?.[item.id];
              if (serverState && item.state) {
                let mod = false;
                const nextState = { ...item.state };
                if (serverState.hasNotified20Min && !nextState.hasNotified) {
                  nextState.hasNotified = true;
                  mod = true;
                }
                if (serverState.hasDueAlerted && !nextState.hasDueAlerted) {
                  nextState.hasDueAlerted = true;
                  mod = true;
                }
                if (serverState.hasThreeHourAlerted && !nextState.hasThreeHourChecked) {
                  nextState.hasThreeHourChecked = true;
                  nextState.threeHourAlerted = true;
                  mod = true;
                }
                if (mod) {
                  changed = true;
                  return { ...item, state: nextState };
                }
              }
              return item;
            });
            return changed ? updated : prev;
          });
        }
        if (res?.allReminders || res?.recentAlerts || res?.readNotificationIds || typeof res?.activeDevicesCount === 'number') {
          applyCrossDeviceState({
            reminders: res.allReminders,
            recentAlerts: res.recentAlerts,
            readNotificationIds: res.readNotificationIds,
            activeDevicesCount: res.activeDevicesCount,
          });
        }
      }).catch(() => {});
    }, 800);

    return () => clearTimeout(timer);
  }, [reminderSyncSignature, appLanguage, applyCrossDeviceState]);

  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [historyDeliveryFilter, setHistoryDeliveryFilter] = useState<'all' | 'delivered' | 'pending'>('pending');
  const [historyPendingTimeFilter, setHistoryPendingTimeFilter] = useState<'all' | 'today' | 'tomorrow' | '2days' | '3days'>('today');
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
            normalizeUrgencyForSheet(customerJenis),
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
      isEditMode: Boolean(s.isEditMode || s.mainType === 'Edit Resume' || s.mainType === 'Edit PDF')
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
      isEditMode: Boolean(s.isEditMode || s.mainType === 'Edit Resume' || s.mainType === 'Edit PDF')
    });
    setViewStack(['home', 'history', 'customer-info']);
  };

  const startNewOrder = (view: ViewType, updates: Partial<AppState>) => {
    try {
      localStorage.removeItem('customer_form_progress');
    } catch (e) {
      // ignore
    }
    setState(prev => ({
      ...INITIAL_STATE,
      language: prev.language,
      spreadsheetId: prev.spreadsheetId || INITIAL_STATE.spreadsheetId,
      dashboardFilterMonth: prev.dashboardFilterMonth || INITIAL_STATE.dashboardFilterMonth,
      dashboardFilterYear: prev.dashboardFilterYear || INITIAL_STATE.dashboardFilterYear,
      historyId: '',
      timestamp: Date.now(),
      ...updates,
    }));
    setViewStack(['home', view]);
  };

  const pushView = (view: ViewType, updates?: Partial<AppState>) => {
    if (view === 'history') {
      setHistoryDeliveryFilter('pending');
      setHistoryPendingTimeFilter('today');
    }
    if (updates) {
      setState(prev => ({ ...prev, ...updates }));
    }
    setViewStack(prev => [...prev, view]);
  };

  const changeTab = (tab: ViewType) => {
    if (tab === 'history') {
      setHistoryDeliveryFilter('pending');
      setHistoryPendingTimeFilter('today');
    }
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
      ...INITIAL_STATE,
      language: prev.language,
      spreadsheetId: prev.spreadsheetId || INITIAL_STATE.spreadsheetId,
      dashboardFilterMonth: prev.dashboardFilterMonth || INITIAL_STATE.dashboardFilterMonth,
      dashboardFilterYear: prev.dashboardFilterYear || INITIAL_STATE.dashboardFilterYear,
      historyId: '',
      timestamp: Date.now(),
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
    <AppContext.Provider value={{ state, setState, viewStack, pushView, changeTab, startNewOrder, popView, goHome, reset, resetOrderForm, generatedMessages, setGeneratedMessages, history, setHistory, saveOrderToHistory, updateOrderHistoryState, updateSpecificHistoryItem, deleteOrderFromHistory, restoreOrderFromHistory, permanentlyDeleteOrderFromHistory, clearHistory, loadOrder, drafts, saveAsDraft, deleteDraft, loadDraft, theme, toggleTheme, appLanguage, toggleLanguage, isOnline, isSyncing, queueSize, lastSyncTime, syncOfflineQueue, addToOfflineQueue, deletedOrderIds, historyDeliveryFilter, setHistoryDeliveryFilter, historyPendingTimeFilter, setHistoryPendingTimeFilter, remoteReminders, recentSyncedAlerts, incomingAlertToast, dismissIncomingAlertToast, syncedDevicesCount, syncedDevices, sharedReadNotificationIds, isSyncingNotifications, lastNotificationSyncAt, markNotificationsRead, syncAllDevicesNotifications }}>
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
