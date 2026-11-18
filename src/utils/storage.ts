export function safeGetLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetLocalStorage(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn(`[Storage] Failed to set key "${key}":`, e);
    return false;
  }
}

export function safeRemoveLocalStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

export function safeGetLocalStorageJSON<T>(key: string, fallback: T): T {
  const raw = safeGetLocalStorage(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeSetLocalStorageJSON(key: string, value: unknown): boolean {
  try {
    return safeSetLocalStorage(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[Storage] Failed to serialize JSON for "${key}":`, e);
    return false;
  }
}

export async function clearOrderHistoryDb(): Promise<void> {
  safeRemoveLocalStorage('orderHistory');
  safeRemoveLocalStorage('orderDrafts');
  safeRemoveLocalStorage('deletedOrderIds');
  if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name && db.name.toLowerCase().includes('order')) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    } catch {
      // ignore IndexedDB cleanup errors
    }
  }
}
