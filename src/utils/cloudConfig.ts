import { safeGetLocalStorage, safeGetLocalStorageJSON, safeSetLocalStorage, safeSetLocalStorageJSON } from './storage';

export interface AnnualSheetConfig {
  year: string;
  spreadsheetId: string;
  scriptUrl: string;
}

export interface SyncedSheetConfigsPayload {
  annualSheets: AnnualSheetConfig[];
  globalScriptUrl?: string;
  updatedAt?: number;
}

export const DEFAULT_SPREADSHEET_ID = '1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo';

export const DEFAULT_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec';

const DEFAULT_YEARS = ['2024', '2025', '2026'];

export function getDefaultSpreadsheetIdForYear(year: string): string {
  const yr = String(year).trim();
  if (yr === '2026' || yr === '2025' || yr === '2024') {
    return DEFAULT_SPREADSHEET_ID;
  }
  return '';
}

export function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (trimmed.includes('docs.google.com/spreadsheets/d/')) {
    const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : trimmed;
  }
  return trimmed;
}

export function getSpreadsheetUrl(spreadsheetId?: string): string {
  const id = extractSpreadsheetId(spreadsheetId || '');
  return id ? `https://docs.google.com/spreadsheets/d/${id}` : '';
}

export function isValidAppsScriptUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith('https://script.google.com/') ||
    trimmed.startsWith('http://script.google.com/')
  );
}

export function getGlobalScriptUrl(): string {
  const saved = safeGetLocalStorage('db_global_script_url');
  return saved && saved.trim() ? saved.trim() : DEFAULT_SCRIPT_URL;
}

export function setGlobalScriptUrl(url: string): void {
  safeSetLocalStorage('db_global_script_url', (url || '').trim());
}

export function getScriptSecret(): string {
  return (safeGetLocalStorage('db_script_secret') || '').trim();
}

export function setScriptSecret(secret: string): void {
  safeSetLocalStorage('db_script_secret', (secret || '').trim());
}

export function mergeMissingDefaultYears(existing: AnnualSheetConfig[]): AnnualSheetConfig[] {
  const list = Array.isArray(existing)
    ? existing.map((item) => {
        const yearStr = String(item?.year || '').trim();
        const existingId = String(item?.spreadsheetId || '').trim();
        return {
          year: yearStr,
          spreadsheetId: existingId || getDefaultSpreadsheetIdForYear(yearStr),
          scriptUrl: String(item?.scriptUrl || '').trim(),
        };
      })
    : [];

  for (const yr of DEFAULT_YEARS) {
    if (!list.some((item) => String(item.year).trim() === yr)) {
      list.push({
        year: yr,
        spreadsheetId: getDefaultSpreadsheetIdForYear(yr),
        scriptUrl: '',
      });
    }
  }
  return list.sort((a, b) => String(b.year).localeCompare(String(a.year)));
}

export function getAnnualSheets(): AnnualSheetConfig[] {
  const saved = safeGetLocalStorageJSON<AnnualSheetConfig[]>('db_annual_sheets', []);
  if (!Array.isArray(saved) || saved.length === 0) {
    return DEFAULT_YEARS.map((year) => ({
      year,
      spreadsheetId: getDefaultSpreadsheetIdForYear(year),
      scriptUrl: '',
    })).reverse();
  }
  return saved.map((s) => {
    const yr = String(s?.year || '').trim();
    const rawId = String(s?.spreadsheetId || '').trim();
    return {
      year: yr,
      spreadsheetId: rawId || getDefaultSpreadsheetIdForYear(yr),
      scriptUrl: String(s?.scriptUrl || '').trim(),
    };
  });
}

export function getActiveScriptUrl(spreadsheetId?: string): string {
  const annualSheets = getAnnualSheets();
  if (spreadsheetId) {
    const targetId = extractSpreadsheetId(spreadsheetId);
    const match = annualSheets.find(
      (s) => extractSpreadsheetId(s.spreadsheetId) === targetId
    );
    if (match && isValidAppsScriptUrl(match.scriptUrl)) {
      return match.scriptUrl.trim();
    }
  }
  const globalUrl = getGlobalScriptUrl();
  if (isValidAppsScriptUrl(globalUrl)) {
    return globalUrl;
  }
  const firstActive = annualSheets.find((s) => isValidAppsScriptUrl(s.scriptUrl));
  return firstActive ? firstActive.scriptUrl.trim() : DEFAULT_SCRIPT_URL;
}

export function resolveSpreadsheetIdForYear(year: string, fallbackId = ''): string {
  const annualSheets = getAnnualSheets();
  const yrMatch = annualSheets.find(
    (s) => String(s.year).trim() === String(year).trim() && s.spreadsheetId.trim() !== ''
  );
  if (yrMatch) {
    return extractSpreadsheetId(yrMatch.spreadsheetId);
  }
  if (fallbackId && fallbackId.trim()) {
    return extractSpreadsheetId(fallbackId);
  }
  const firstWithId = annualSheets.find((s) => s.spreadsheetId.trim() !== '');
  return firstWithId ? extractSpreadsheetId(firstWithId.spreadsheetId) : DEFAULT_SPREADSHEET_ID;
}

export function mergeRemoteSheetConfigs(remote?: SyncedSheetConfigsPayload | null): boolean {
  if (!remote || typeof window === 'undefined') return false;
  let changed = false;

  if (remote.globalScriptUrl && isValidAppsScriptUrl(remote.globalScriptUrl)) {
    const currentGlobal = safeGetLocalStorage('db_global_script_url') || '';
    if (!currentGlobal.trim() || (remote.updatedAt && remote.globalScriptUrl.trim() !== currentGlobal.trim())) {
      safeSetLocalStorage('db_global_script_url', remote.globalScriptUrl.trim());
      changed = true;
    }
  }

  if (Array.isArray(remote.annualSheets) && remote.annualSheets.length > 0) {
    const currentSheets = getAnnualSheets();
    const mergedMap = new Map<string, AnnualSheetConfig>();

    for (const s of currentSheets) {
      if (s.year) mergedMap.set(s.year, { ...s });
    }

    for (const r of remote.annualSheets) {
      const yr = String(r?.year || '').trim();
      if (!yr) continue;
      const remoteId = String(r?.spreadsheetId || '').trim();
      const remoteScript = String(r?.scriptUrl || '').trim();
      const localExisting = mergedMap.get(yr);

      if (!localExisting) {
        mergedMap.set(yr, {
          year: yr,
          spreadsheetId: remoteId || getDefaultSpreadsheetIdForYear(yr),
          scriptUrl: remoteScript,
        });
        changed = true;
      } else {
        const nextId =
          remoteId && (!localExisting.spreadsheetId.trim() || (remote.updatedAt && remoteId !== localExisting.spreadsheetId.trim()))
            ? remoteId
            : localExisting.spreadsheetId;
        const nextScript =
          remoteScript && (!localExisting.scriptUrl.trim() || (remote.updatedAt && remoteScript !== localExisting.scriptUrl.trim()))
            ? remoteScript
            : localExisting.scriptUrl;
        if (nextId !== localExisting.spreadsheetId || nextScript !== localExisting.scriptUrl) {
          mergedMap.set(yr, { year: yr, spreadsheetId: nextId, scriptUrl: nextScript });
          changed = true;
        }
      }
    }

    if (changed) {
      const mergedList = Array.from(mergedMap.values()).sort((a, b) => String(b.year).localeCompare(String(a.year)));
      safeSetLocalStorageJSON('db_annual_sheets', mergedList);
    }
  }

  if (changed) {
    window.dispatchEvent(new CustomEvent('sheet-configs-updated'));
  }

  return changed;
}

export async function syncSheetConfigsToServer(
  annualSheets: AnnualSheetConfig[],
  globalScriptUrl: string
): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const base = window.location?.origin || '';
    await fetch(`${base}/api/settings/sheets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        annualSheets,
        globalScriptUrl: (globalScriptUrl || '').trim(),
      }),
    });
    window.dispatchEvent(new CustomEvent('sheet-configs-updated'));
  } catch {
    // offline or transient failure; local settings remain persisted
  }
}

export async function postToGoogleScript<T = { status: string; message?: string; [key: string]: any }>(
  url: string,
  payload: Record<string, any>
): Promise<T> {
  const secret = getScriptSecret();
  const bodyPayload = secret && !payload.secret ? { ...payload, secret } : payload;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(bodyPayload),
    });

    if (resp.ok) {
      const text = await resp.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        return { status: 'sent_unverified' } as T;
      }
    }
  } catch {
    // Fallback to no-cors when Apps Script redirects strip CORS headers
  }

  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(bodyPayload),
  });

  return { status: 'sent_unverified' } as T;
}
