import { safeGetLocalStorage, safeGetLocalStorageJSON, safeSetLocalStorage } from './storage';

export interface AnnualSheetConfig {
  year: string;
  spreadsheetId: string;
  scriptUrl: string;
}

const DEFAULT_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec';

const DEFAULT_YEARS = ['2024', '2025', '2026'];

export function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (trimmed.includes('docs.google.com/spreadsheets/d/')) {
    const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : trimmed;
  }
  return trimmed;
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
  const list = Array.isArray(existing) ? [...existing] : [];
  for (const yr of DEFAULT_YEARS) {
    if (!list.some((item) => String(item.year).trim() === yr)) {
      list.push({ year: yr, spreadsheetId: '', scriptUrl: '' });
    }
  }
  return list.sort((a, b) => String(b.year).localeCompare(String(a.year)));
}

export function getAnnualSheets(): AnnualSheetConfig[] {
  const saved = safeGetLocalStorageJSON<AnnualSheetConfig[]>('db_annual_sheets', []);
  if (!Array.isArray(saved) || saved.length === 0) {
    return DEFAULT_YEARS.map((year) => ({ year, spreadsheetId: '', scriptUrl: '' })).reverse();
  }
  return saved.map((s) => ({
    year: String(s?.year || ''),
    spreadsheetId: String(s?.spreadsheetId || ''),
    scriptUrl: String(s?.scriptUrl || ''),
  }));
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
  return firstWithId ? extractSpreadsheetId(firstWithId.spreadsheetId) : '';
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
