import React, { useEffect, useRef } from 'react';
import type { OrderHistoryItem, AppState } from '../types';
import { parseDateStringToTimestamp, normalizeNameStr, normalizePhoneDigits, parseMainType, deduplicateHistoryList, extractPendapatanValue, smartFetchGoogleScript } from '../utils';

export const BACKGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Performs resilient fetch/JSONP request specifically for background sync
 */
export function jsonpSyncRequest<T = any>(url: URL, callbackName: string): Promise<T> {
  return smartFetchGoogleScript<T>(url, callbackName, 50000);
}

const DEFAULT_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec';

const extractId = (input: string) => {
  if (!input) return '';
  const trimmed = input.trim();
  if (trimmed.includes('docs.google.com/spreadsheets/d/')) {
    const matches = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return matches ? matches[1] : trimmed;
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

  return parseDateStringToTimestamp(value, 0).timestamp;
};

const INITIAL_STATE: AppState = {
  mainType: 'Resume',
  subType: 'Professional',
  urgency: null,
  baseHours: 24,
  addons: [],
  template: '',
  language: 'ms',
  softcopyLang: 'BM',
  clLangs: ['Melayu'],
  resumeLangs: ['Melayu'],
  isEditMode: false,
  extraHours: 0,
  customDoc: '',
  spreadsheetId: '',
  isDelivered: false
};

/**
 * Silently syncs recent orders from configured Google Sheets without displaying UI toasts or blocking user actions.
 */
export async function silentBackgroundSync(
  setHistory: React.Dispatch<React.SetStateAction<OrderHistoryItem[]>>,
  deletedOrderIds: string[] = []
): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !navigator.onLine ||
    document.visibilityState !== 'visible'
  ) {
    console.debug('[Sync Debug] Background sync skipped: window offline or page hidden');
    return false;
  }

  const syncStartTime = Date.now();
  const prevLastSyncRaw = localStorage.getItem('db_last_sync_time');
  const prevLastSyncMs = prevLastSyncRaw ? parseInt(prevLastSyncRaw, 10) : 0;
  const prevLastSyncISO = prevLastSyncMs ? new Date(prevLastSyncMs).toISOString() : 'None (First Sync)';
  const timeSinceLastSyncSec = prevLastSyncMs ? Math.round((syncStartTime - prevLastSyncMs) / 1000) : null;

  console.log(`[Sync Debug] Starting background fetch at ${new Date(syncStartTime).toISOString()}`, {
    lastSuccessfulSyncTimestamp: prevLastSyncISO,
    secondsSinceLastSync: timeSinceLastSyncSec
  });

  try {
    const globalScriptUrl = localStorage.getItem('db_global_script_url') || DEFAULT_SCRIPT_URL;
    const savedSheetsStr = localStorage.getItem('db_annual_sheets');
    let annualSheets: { year: string; spreadsheetId: string; scriptUrl: string }[] = [];

    if (savedSheetsStr) {
      try {
        annualSheets = JSON.parse(savedSheetsStr);
      } catch (e) {}
    }

    if (!annualSheets || annualSheets.length === 0) {
      const currentYear = new Date().getFullYear().toString();
      annualSheets = [{ year: currentYear, spreadsheetId: '', scriptUrl: globalScriptUrl }];
    }

    const activeConfigs = annualSheets.filter(
      s => s.spreadsheetId && s.spreadsheetId.trim() !== ''
    );

    if (activeConfigs.length === 0) {
      console.warn('[Sync Debug] Background sync aborted: No active spreadsheet IDs configured');
      return false;
    }

    const fetchPromises = activeConfigs.map(async sheet => {
      const rawId = sheet.spreadsheetId.trim();
      const sId = extractId(rawId);
      const sUrl = sheet.scriptUrl.trim() || globalScriptUrl;

      const safeYear = String(sheet.year).replace(/[^\w]/g, '_');
      const callbackName =
        'jsonp_bg_sync_' + Math.round(100000 * Math.random()) + '_' + safeYear;
      const url = new URL(sUrl);

      url.searchParams.append('action', 'sync_recent');
      url.searchParams.append('spreadsheetId', sId);
      url.searchParams.append('callback', callbackName);

      const reqStartTime = Date.now();

      try {
        const data = await jsonpSyncRequest(url, callbackName);
        const reqEndTime = Date.now();
        const durationMs = reqEndTime - reqStartTime;

        if (data && data.status === 'success' && Array.isArray(data.orders)) {
          const sheetUpdateTime = data.serverTime || data.lastUpdated || data.timestamp || new Date(reqEndTime).toISOString();
          const sheetTimeMs = new Date(sheetUpdateTime).getTime() || reqEndTime;
          const syncLagMs = prevLastSyncMs ? Math.max(0, reqEndTime - prevLastSyncMs) : 0;

          console.log(`[Sync Debug] Google Sheet data fetched successfully for ${sheet.year} (${sId}):`, {
            ordersCount: data.orders.length,
            requestDurationMs: durationMs,
            sheetDataUpdateTime: sheetUpdateTime,
            lastSuccessfulSyncTime: prevLastSyncISO,
            syncLagVsLastFetchMs: syncLagMs,
            syncLagVsLastFetchSec: Math.round(syncLagMs / 1000)
          });

          return { year: sheet.year, orders: data.orders, spreadsheetId: sId, success: true, sheetUpdateTime };
        }

        console.warn(`[Sync Debug] Google Sheet data fetch returned unexpected status or format for ${sheet.year} (${sId}):`, {
          status: data?.status,
          message: data?.message,
          durationMs
        });

        return { year: sheet.year, orders: [], spreadsheetId: sId, success: false, sheetUpdateTime: new Date().toISOString() };
      } catch (e) {
        console.error(`[Sync Debug] Google Sheet JSONP request failed/timed out for ${sheet.year} (${sId}):`, e);
        return { year: sheet.year, orders: [], spreadsheetId: sId, success: false, sheetUpdateTime: new Date().toISOString() };
      }
    });

    const results = await Promise.all(fetchPromises);
    const currentNow = Date.now();
    let hasUpdates = false;

    setHistory(prevHistory => {
      let updatedHistory = [...prevHistory];

      for (const res of results) {
        if (!res.success) continue;

        for (const orderData of res.orders) {
          const generatedOrderId =
            orderData.orderId ||
            `SYNC-${orderData.name || 'UNKNOWN'}-${orderData.phone || ''}-${orderData.due || ''}`
              .replace(/\s+/g, '-')
              .replace(/[^a-zA-Z0-9-]/g, '');

          if (deletedOrderIds.includes(generatedOrderId)) {
            continue;
          }

          const normSheetName = normalizeNameStr(orderData.name);
          const normSheetPhone = normalizePhoneDigits(orderData.phone);
          const normSheetOrderId = String(orderData.orderId || '').trim();

          const existingIdx = updatedHistory.findIndex(h => {
            const hOrderId = String(h.state?.orderId || '').trim();
            const hId = String(h.id || '').trim();

            // 1. Exact order ID match
            if (
              (generatedOrderId && (hOrderId === generatedOrderId || hId === generatedOrderId)) ||
              (normSheetOrderId && (hOrderId === normSheetOrderId || hId === normSheetOrderId))
            ) {
              return true;
            }

            // 2. Name + Phone match (if phone exists)
            if (normSheetName && normSheetPhone) {
              const hName = normalizeNameStr(h.state?.customerName || h.state?.name);
              const hPhone = normalizePhoneDigits(h.state?.customerPhone || h.state?.phone);
              if (hName === normSheetName && hPhone === normSheetPhone) {
                return true;
              }
            }

            // 3. Name + Order type match
            if (normSheetName) {
              const hName = normalizeNameStr(h.state?.customerName || h.state?.name);
              if (hName === normSheetName) {
                const hOrder = String(h.state?.customerOrder || h.state?.mainType || '').trim().toLowerCase();
                const sheetOrder = String(orderData.order || '').trim().toLowerCase();
                if (!hOrder || !sheetOrder || hOrder === sheetOrder) {
                  return true;
                }
              }
            }

            return false;
          });

          const dueTs = parseDueTimestamp(orderData.due);
          let parsedName = orderData.name ? String(orderData.name).trim() : '';
          parsedName = parsedName.replace(
            /\w\S*/g,
            txt => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
          );
          const parsedTemplate = orderData.template
            ? String(orderData.template).trim().toUpperCase()
            : '';

          const parsedType = parseMainType(orderData.order);
          const parsedPrice = extractPendapatanValue(orderData);

          const newState = {
            isDelivered: !!orderData.isDelivered,
            spreadsheetId: res.spreadsheetId,
            customerName: parsedName,
            customerPhone: orderData.phone,
            customerOrder: orderData.order || parsedType,
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
            mainType: parsedType,
            subType: '',
            itemPrice: parsedPrice,
            price: parsedPrice,
            harga: parsedPrice,
            bayaran: parsedPrice
          };

          if (existingIdx !== -1) {
            const existingItem = updatedHistory[existingIdx];
            if (existingItem.state?.isDeleted) continue;

            const localState: Partial<AppState> = existingItem.state || {};

            const hasDiff =
              String(localState.orderId || '') !== generatedOrderId ||
              !!localState.isDelivered !== !!newState.isDelivered ||
              String(localState.customerName || '').trim() !==
                String(newState.customerName || '').trim() ||
              String(localState.customerPhone || '').trim() !==
                String(newState.customerPhone || '').trim() ||
              String(localState.customerOrder || '').trim() !==
                String(newState.customerOrder || '').trim() ||
              String(localState.customerTemplate || '').trim() !==
                String(newState.customerTemplate || '').trim() ||
              String(localState.customerBahasa || '').trim() !==
                String(newState.customerBahasa || '').trim() ||
              String(localState.customerAddOn || '').trim() !==
                String(newState.customerAddOn || '').trim() ||
              String(localState.customerJenis || '').trim() !==
                String(newState.customerJenis || '').trim() ||
              String(localState.customerDue || '').trim() !==
                String(newState.customerDue || '').trim() ||
              String(localState.orderLink || '').trim() !==
                String(newState.orderLink || '').trim() ||
              localState.syncStatus !== 'synced';

            if (hasDiff) {
              const recentlyToggledOrEdited =
                localState.lastModifiedLocally &&
                currentNow - localState.lastModifiedLocally < 15000;

              if (!recentlyToggledOrEdited) {
                const finalLink =
                  (orderData.link || '').trim() ||
                  localState.orderLink ||
                  localState.googleSheetLink ||
                  '';
                updatedHistory[existingIdx] = {
                  ...existingItem,
                  id: String(existingItem.id || '').startsWith('SYNC-')
                    ? generatedOrderId
                    : existingItem.id,
                  state: {
                    ...INITIAL_STATE,
                    ...localState,
                    ...newState,
                    orderLink: finalLink,
                    googleSheetLink: finalLink,
                    orderId: generatedOrderId,
                    syncStatus: 'synced'
                  }
                };
                hasUpdates = true;
              }
            }
          } else {
            updatedHistory.push({
              id: generatedOrderId,
              timestamp: currentNow,
              state: {
                ...INITIAL_STATE,
                ...newState
              },
              messages: []
            });
            hasUpdates = true;
          }
        }
      }

      return deduplicateHistoryList(updatedHistory);
    });

    const now = Date.now();
    localStorage.setItem('db_last_sync_time', String(now));

    console.log(`[Sync Debug] Background sync completed at ${new Date(now).toISOString()}`, {
      totalDurationMs: now - syncStartTime,
      successfulSheets: results.filter(r => r.success).length,
      failedSheets: results.filter(r => !r.success).length,
      totalOrdersReceived: results.reduce((sum, r) => sum + (r.orders?.length || 0), 0),
      hasUpdates,
      newLastSyncTimestamp: new Date(now).toISOString()
    });

    return hasUpdates;
  } catch (err) {
    console.warn('[Sync Debug] Background sync error:', err);
    return false;
  }
}

/**
 * React Hook that manages background synchronization every 5 minutes when the app is active
 */
export function useBackgroundSync(
  setHistory: React.Dispatch<React.SetStateAction<OrderHistoryItem[]>>,
  deletedOrderIds: string[] = []
) {
  const deletedRef = useRef(deletedOrderIds);
  deletedRef.current = deletedOrderIds;

  // Initialize to 0 so runSyncIfNeeded runs immediately on app mount
  const lastSyncRef = useRef<number>(0);

  useEffect(() => {
    const runSyncIfNeeded = () => {
      const now = Date.now();
      const timeSinceLastSync = now - lastSyncRef.current;

      if (timeSinceLastSync >= BACKGROUND_SYNC_INTERVAL_MS || timeSinceLastSync < 0) {
        console.log(`[Sync Debug] Triggering background sync via hook (elapsed since last trigger: ${timeSinceLastSync}ms)`);
        lastSyncRef.current = now;
        silentBackgroundSync(setHistory, deletedRef.current);
      }
    };

    // Initial silent check on mount
    runSyncIfNeeded();

    // Periodic 5-minute background timer while app is active
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        lastSyncRef.current = Date.now();
        silentBackgroundSync(setHistory, deletedRef.current);
      }
    }, BACKGROUND_SYNC_INTERVAL_MS);

    // Event listeners to handle tab activation / focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        runSyncIfNeeded();
      }
    };

    const handleFocus = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        runSyncIfNeeded();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [setHistory]);
}
