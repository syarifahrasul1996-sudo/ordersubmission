import type { OrderHistoryItem } from './types';

export function calculateDeadline(state: any, appLanguage: string) {
  const now = state.timestamp ? new Date(state.timestamp) : new Date();
  const isSuperUrgent = state.urgency === 'super';
  const addonHours = (state.mainType === 'Resume' && !state.isEditMode && isSuperUrgent && state.addons) ? state.addons.length : 0;
  const total = (state.baseHours || 0) + (state.extraHours || 0) + addonHours;
  
  const dl = new Date(now.getTime() + total * 3600000);
  const timeStr = dl.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const daysMs = ['Ahad','Isnin','Selasa','Rabu','Khamis','Jumaat','Sabtu'];
  const daysEn = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  
  const diff = Math.round((new Date(dl.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86400000);
  
  let dateStr = '';
  if (diff === 0) {
    dateStr = appLanguage === 'ms' ? `hari ini ${timeStr}` : `today at ${timeStr}`;
  } else if (diff === 1) {
    dateStr = appLanguage === 'ms' ? `esok ${timeStr}` : `tomorrow at ${timeStr}`;
  } else if (diff > 1) {
    if (appLanguage === 'ms') {
      dateStr = `pada hari ${daysMs[dl.getDay()]} (${String(dl.getDate()).padStart(2,'0')}/${String(dl.getMonth()+1).padStart(2,'0')}) ${timeStr}`;
    } else {
      dateStr = `on ${daysEn[dl.getDay()]} (${String(dl.getDate()).padStart(2,'0')}/${String(dl.getMonth()+1).padStart(2,'0')}) at ${timeStr}`;
    }
  }
  
  return { formatted: dateStr, total };
}

export function generateMessages(state: any, dl: { formatted: string, total: number }, appLanguage: string) {
  const isE = state.isEditMode;
  let raw = state.mainType === 'Lain-lain' ? ((state.customDoc || '').trim() || 'Dokumen') : state.mainType;
  const docLabel = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  
  const addsForDisplay = (state.addons || []).map((a: string) => {
      if (a === 'Soft Copy Word') return `Soft Copy Word (${state.softcopyLang})`;
      if (a === 'Cover Letter') {
          const clText = ['Melayu', 'English'].filter(l => state.clLangs && state.clLangs.includes(l)).join(' & ');
          return `Cover Letter (${clText})`;
      }
      return a;
  });
  
  const title = docLabel + (addsForDisplay.length > 0 && !isE ? " + " + addsForDisplay.join(" + ") : "");
  
  const ms = {
      ms: { thanks: "Terima kasih ☺️✨", will: (t: string, d: string) => `${t} ni saya akan hantar selewatnya ${d}`, super: "Kalau siap awal kita send awal", late: "Kalau saya terlewat, jangan segan untuk terus chat ya.", more: "Kalau nak siap lebih awal dari due yg diberi, boleh tukar ke pakej lebih cepat dan buat bayaran tambahan.", recalc: "> ⏱ Tempoh siap akan dikira semula dari tarikh bayaran tambahan dibuat, bukan dari tarikh bayaran asal.", h: "jam", template: "Template", language: "Bahasa", addon: "Add-on", disc: "Kita anggap maklumat resume yang diberi tu lengkap dan dah disemak.\n\n> Kalau nak betulkan sikit-sikit lepas siap, takde caj. Tapi kalau ada penambahan atau perubahan besar, akan dikenakan caj asing. Harap maklum ☺️" },
      en: { thanks: "Thank you ☺️✨", will: (t: string, d: string) => `I will send this ${t} by ${d}`, super: "If it's ready earlier I'll send it earlier", late: "If I'm late, please don’t hesitate to message me directly.", more: "If you want it ready earlier than the given due date, you can switch to a faster package and make an additional payment.", recalc: "> ⏱ Completion time will be recalculated from the date of additional payment, not from the original payment date.", h: "hours", template: "Template", language: "Language", addon: "Add-ons", disc: "We assume the resume information provided is complete and checked.\n\n> Minor corrections after completion are free. However, any major additions or changes will incur separate charges. Thank you for your understanding ☺️" }
  };
  const t = appLanguage === 'en' ? ms.en : ms.ms;
  let m1 = `${t.thanks}\n\n`;
  
  const isSuper = state.urgency === 'super';
  if (isSuper) {
      m1 += `${t.will(title, dl.formatted)} (${dl.total} ${t.h})\n\n${t.super}`;
  } else {
      m1 += `${t.will(title, dl.formatted)}. ${t.late}\n\n${t.more}\n\n${t.recalc}`;
  }
  
  const out = [m1];
  if (state.mainType === 'Resume') {
      const templateVal = (state.template || '').trim();
      let m2Body = '';
      
      if (!isE) {
          if (templateVal) m2Body += `${t.template}: ${templateVal.toUpperCase()}\n`;
          m2Body += `${t.language}: ${(state.resumeLangs || []).join(' & ')}\n`;
          m2Body += `${t.addon}: ${addsForDisplay.length ? addsForDisplay.join(', ') : '-'}`;
      } else {
          if (templateVal) m2Body += `${t.template}: ${templateVal.toUpperCase()}`;
      }
      
      const m2 = m2Body ? `${m2Body}\n\n${t.disc}` : t.disc;
      out.push(m2);
  }

  return out;
}

export function cleanWhatsAppInput(val?: any): { raw: string; isUrl: boolean; extracted: string; isPlaceholder: boolean } {
  if (!val) return { raw: '', isUrl: false, extracted: '', isPlaceholder: false };
  const raw = String(val).trim();
  if (!raw) return { raw: '', isUrl: false, extracted: '', isPlaceholder: false };

  const lower = raw.toLowerCase();
  if (['-', '--', 'n/a', 'na', 'none', 'tiada', 'nil', 'null', 'undefined'].includes(lower)) {
    return { raw, isUrl: false, extracted: raw, isPlaceholder: true };
  }

  // Handle WhatsApp web/app URLs
  if (raw.includes('wa.me/') || raw.includes('whatsapp.com/')) {
    const match = raw.match(/(?:wa\.me\/|phone=|send\?phone=|\/)([a-zA-Z0-9_.-]+)(?:\?|$)/i);
    if (match && match[1]) {
      return { raw, isUrl: true, extracted: match[1].trim(), isPlaceholder: false };
    }
  }

  return { raw, isUrl: false, extracted: raw, isPlaceholder: false };
}

export interface ParsedPhoneAndUsername {
  phone: string;
  username: string;
  isPlaceholder: boolean;
  raw: string;
}

export function parsePhoneAndUsername(input?: any): ParsedPhoneAndUsername {
  if (!input) return { phone: '', username: '', isPlaceholder: false, raw: '' };
  const raw = String(input).trim();
  if (!raw) return { phone: '', username: '', isPlaceholder: false, raw: '' };

  const lower = raw.toLowerCase();
  if (['-', '--', 'n/a', 'na', 'none', 'tiada', 'nil', 'null', 'undefined'].includes(lower)) {
    return { phone: '', username: '', isPlaceholder: true, raw };
  }

  let clean = raw;
  if (clean.includes('wa.me/') || clean.includes('whatsapp.com/')) {
    const match = clean.match(/(?:wa\.me\/|phone=|send\?phone=|\/)([a-zA-Z0-9_.-]+)(?:\?|$)/i);
    if (match && match[1]) {
      clean = match[1].trim();
    }
  }

  // 1. Explicit @username present anywhere in string
  // E.g. '018-9864891 (@user123)', '0189864891 / @user', '@user 0189864891', '@user123'
  if (clean.includes('@')) {
    const atMatch = clean.match(/@([a-zA-Z0-9_.-]+)/);
    if (atMatch) {
      const username = atMatch[1].trim();
      const remainder = clean.replace(atMatch[0], '').replace(/[()/,\\-]/g, ' ').trim();
      const remainderDigits = remainder.replace(/\D/g, '');
      if (remainderDigits.length >= 7) {
        return { phone: remainder, username: '@' + username, isPlaceholder: false, raw };
      } else if (!remainderDigits && !remainder.replace(/[^a-zA-Z0-9]/g, '')) {
        return { phone: '', username: '@' + username, isPlaceholder: false, raw };
      }
    }
  }

  // 2. Delimited with parentheses, e.g. '018-9864891 (user123)' or 'user123 (0189864891)'
  const parenMatch = clean.match(/^([^(]+)\(([^)]+)\)$/);
  if (parenMatch) {
    const part1 = parenMatch[1].trim();
    const part2 = parenMatch[2].trim();
    const d1 = part1.replace(/\D/g, '');
    const d2 = part2.replace(/\D/g, '');
    if (d1.length >= 7 && /[a-zA-Z]/.test(part2)) {
      return { phone: part1, username: '@' + part2.replace(/^@+/, ''), isPlaceholder: false, raw };
    }
    if (d2.length >= 7 && /[a-zA-Z]/.test(part1)) {
      return { phone: part2, username: '@' + part1.replace(/^@+/, ''), isPlaceholder: false, raw };
    }
  }

  // 3. Delimited with slash, comma, pipe, or dash with spaces between phone and username
  // E.g. '0189864891 / user123', 'user123 / 0189864891', '018-9864891 - user123'
  const delimiterMatch = clean.match(/^(.+?)\s*[/,|]\s*(.+)$/) || clean.match(/^(.+?)\s+-\s+(.+)$/);
  if (delimiterMatch) {
    const part1 = delimiterMatch[1].trim();
    const part2 = delimiterMatch[2].trim();
    const d1 = part1.replace(/\D/g, '');
    const d2 = part2.replace(/\D/g, '');
    if (d1.length >= 7 && (part2.startsWith('@') || (/[a-zA-Z]/.test(part2) && d2.length < 7))) {
      return { phone: part1, username: '@' + part2.replace(/^@+/, ''), isPlaceholder: false, raw };
    }
    if (d2.length >= 7 && (part1.startsWith('@') || (/[a-zA-Z]/.test(part1) && d1.length < 7))) {
      return { phone: part2, username: '@' + part1.replace(/^@+/, ''), isPlaceholder: false, raw };
    }
  }

  // 4. Space-separated phone and username
  // E.g. '0189864891 user123' or 'user123 0189864891'
  const spaceMatch1 = clean.match(/^(\+?\d[\d\s-]{6,}\d)\s+([a-zA-Z][a-zA-Z0-9_.-]*)$/);
  if (spaceMatch1) {
    return { phone: spaceMatch1[1].trim(), username: '@' + spaceMatch1[2].trim(), isPlaceholder: false, raw };
  }
  const spaceMatch2 = clean.match(/^([a-zA-Z][a-zA-Z0-9_.-]*)\s+(\+?\d[\d\s-]{6,}\d)$/);
  if (spaceMatch2) {
    return { phone: spaceMatch2[2].trim(), username: '@' + spaceMatch2[1].trim(), isPlaceholder: false, raw };
  }

  // 5. Pure username: starts with @
  if (clean.startsWith('@')) {
    const after = clean.replace(/^@+/, '').trim();
    return { phone: '', username: '@' + after, isPlaceholder: false, raw };
  }

  // 6. Alphanumeric username with letters and numbers (e.g. 'user123', 'syarifah1996', 'sarah_99')
  // If it has alphabetic characters and not a long sequence of digits (less than 7 digits)
  const allDigits = clean.replace(/\D/g, '');
  if (/[a-zA-Z]/.test(clean)) {
    if (allDigits.length < 7) {
      return { phone: '', username: '@' + clean.trim(), isPlaceholder: false, raw };
    }
  }

  // 7. Pure phone number
  return { phone: clean, username: '', isPlaceholder: false, raw };
}

export function isWhatsAppUsername(val?: any): boolean {
  if (!val) return false;
  const parsed = parsePhoneAndUsername(val);
  if (parsed.isPlaceholder) return false;
  return !parsed.phone && !!parsed.username;
}

export function getWhatsAppLink(phoneOrUsername?: any): string {
  if (!phoneOrUsername) return '';
  const parsed = parsePhoneAndUsername(phoneOrUsername);
  if (parsed.isPlaceholder) return '';

  if (parsed.phone) {
    let digits = parsed.phone.replace(/\D/g, '');
    if (digits) {
      if (digits.startsWith('0')) digits = '6' + digits;
      else if (digits.startsWith('1') && (digits.length === 9 || digits.length === 10)) digits = '60' + digits;
      return `https://wa.me/${digits}`;
    }
  }

  if (parsed.username) {
    const cleanUser = parsed.username.replace(/^@+/, '').trim();
    if (cleanUser) {
      return `https://wa.me/${encodeURIComponent(cleanUser)}`;
    }
  }

  return '';
}

export function formatDigitsUniversal(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return phone.trim();

  // 1. Malaysia (Country Code: 60)
  let normalized = digits;
  if (digits.startsWith('0')) {
    normalized = '6' + digits;
  } else if (digits.startsWith('1') && (digits.length === 9 || digits.length === 10)) {
    normalized = '60' + digits;
  }

  if (normalized.startsWith('60')) {
    const rawSuffix = normalized.substring(2);
    if (rawSuffix.startsWith('11')) {
      if (rawSuffix.length >= 10) {
        return `60 11-${rawSuffix.substring(2, 6)} ${rawSuffix.substring(6, 10)}`;
      } else {
        return `60 11-${rawSuffix.substring(2)}`;
      }
    } else if (
      rawSuffix.startsWith('10') ||
      rawSuffix.startsWith('12') ||
      rawSuffix.startsWith('13') ||
      rawSuffix.startsWith('14') ||
      rawSuffix.startsWith('15') ||
      rawSuffix.startsWith('16') ||
      rawSuffix.startsWith('17') ||
      rawSuffix.startsWith('18') ||
      rawSuffix.startsWith('19')
    ) {
      const op = rawSuffix.substring(0, 2);
      const rest = rawSuffix.substring(2);
      if (rest.length >= 7) {
        return `60 ${op}-${rest.substring(0, 3)} ${rest.substring(3, 7)}`;
      } else {
        return `60 ${op}-${rest}`;
      }
    } else if (rawSuffix.startsWith('3')) {
      const rest = rawSuffix.substring(1);
      if (rest.length >= 8) {
        return `60 3-${rest.substring(0, 4)} ${rest.substring(4, 8)}`;
      } else {
        return `60 3-${rest}`;
      }
    } else if (
      rawSuffix.startsWith('4') ||
      rawSuffix.startsWith('5') ||
      rawSuffix.startsWith('6') ||
      rawSuffix.startsWith('7') ||
      rawSuffix.startsWith('8') ||
      rawSuffix.startsWith('9')
    ) {
      const op = rawSuffix.substring(0, 1);
      const rest = rawSuffix.substring(1);
      if (rest.length >= 7) {
        return `60 ${op}-${rest.substring(0, 3)} ${rest.substring(3, 7)}`;
      } else {
        return `60 ${op}-${rest}`;
      }
    }
    return `60 ${rawSuffix}`;
  }

  // 2. Singapore (Country Code: 65)
  if (digits.startsWith('65')) {
    const suffix = digits.substring(2);
    if (suffix.length >= 8) {
      return `65 ${suffix.substring(0, 4)} ${suffix.substring(4, 8)}`;
    }
    return `65 ${suffix}`;
  }

  // 3. Indonesia (Country Code: 62)
  if (digits.startsWith('62')) {
    const suffix = digits.substring(2);
    if (suffix.length >= 9) {
      return `62 ${suffix.substring(0, 3)}-${suffix.substring(3, 7)}-${suffix.substring(7, 11)}`;
    }
    return `62 ${suffix}`;
  }

  // 4. US/Canada (Country Code: 1)
  if (digits.startsWith('1') && digits.length === 11) {
    return `1 (${digits.substring(1, 4)}) ${digits.substring(4, 7)}-${digits.substring(7)}`;
  }
  if (digits.length === 10) {
    return `1 (${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
  }

  // 5. United Kingdom (Country Code: 44)
  if (digits.startsWith('44')) {
    const suffix = digits.substring(2);
    if (suffix.length >= 10) {
      return `44 ${suffix.substring(0, 4)} ${suffix.substring(4)}`;
    }
  }

  // Generic Default Fallback
  if (digits.length >= 10) {
    return `+${digits.substring(0, 3)} ${digits.substring(3, 6)} ${digits.substring(6)}`;
  }

  return phone.trim();
}

export function formatPhoneUniversal(phone?: any): string {
  if (!phone) return '';

  const parsed = parsePhoneAndUsername(phone);
  if (parsed.isPlaceholder) return parsed.raw;

  if (parsed.phone && parsed.username) {
    const formattedPhone = formatDigitsUniversal(parsed.phone);
    return `${formattedPhone} (${parsed.username})`;
  }

  if (parsed.phone) {
    return formatDigitsUniversal(parsed.phone);
  }

  if (parsed.username) {
    return parsed.username;
  }

  return String(phone).trim();
}

/**
 * Parses any date-time string (DD/MM/YYYY with optional time, or standard formats)
 * in a robust manner. Returns both the timestamp and a Date object.
 */
export function parseDateStringToTimestamp(dueText: string, defaultTimestamp: number): { timestamp: number; date: Date } {
  if (!dueText || !dueText.trim()) {
    return { timestamp: defaultTimestamp, date: new Date(defaultTimestamp) };
  }

const cleanText = dueText
  .replace(/\s+at\s+/i, ' ')
  .trim();

// 1. Parse DD/MM/YYYY or DD-MM-YYYY
// This prevents JavaScript from reading 06/07/2026 as June 7.
const localDateMatch = cleanText.match(
  /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(AM|PM)?)?$/i
);

if (localDateMatch) {
  const day = Number(localDateMatch[1]);
  const month = Number(localDateMatch[2]);
  const year = Number(localDateMatch[3]);

  let hours = Number(localDateMatch[4] || 0);
  const minutes = Number(localDateMatch[5] || 0);
  const seconds = Number(localDateMatch[6] || 0);
  const meridiem = String(
    localDateMatch[7] || ''
  ).toUpperCase();

  if (meridiem === 'PM' && hours < 12) {
    hours += 12;
  }

  if (meridiem === 'AM' && hours === 12) {
    hours = 0;
  }

  const parsedDate = new Date(
    year,
    month - 1,
    day,
    hours,
    minutes,
    seconds,
    0
  );

  const isValid =
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day &&
    parsedDate.getHours() === hours &&
    parsedDate.getMinutes() === minutes &&
    parsedDate.getSeconds() === seconds;

  if (isValid) {
    return {
      timestamp: parsedDate.getTime(),
      date: parsedDate
    };
  }
}

// 2. Parse YYYY-MM-DD
const isoMatch = cleanText.match(
  /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(AM|PM)?)?$/i
);
if (isoMatch) {
  const year = Number(isoMatch[1]);
  const month = Number(isoMatch[2]);
  const day = Number(isoMatch[3]);

  let hours = Number(isoMatch[4] || 0);
  const minutes = Number(isoMatch[5] || 0);
  const seconds = Number(isoMatch[6] || 0);
  const meridiem = String(isoMatch[7] || '').toUpperCase();

  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  const parsedDate = new Date(year, month - 1, day, hours, minutes, seconds, 0);
  if (!isNaN(parsedDate.getTime())) {
    return {
      timestamp: parsedDate.getTime(),
      date: parsedDate
    };
  }
}

// 3. Normalize Malay month names to English for JS Date parser
const malayMonthsMap: Record<string, string> = {
  januari: 'Jan', jan: 'Jan',
  februari: 'Feb', feb: 'Feb',
  mac: 'Mar',
  april: 'Apr', apr: 'Apr',
  mei: 'May',
  jun: 'Jun',
  julai: 'Jul', jul: 'Jul',
  ogos: 'Aug', ogo: 'Aug',
  september: 'Sep', sep: 'Sep',
  oktober: 'Oct', okt: 'Oct',
  november: 'Nov', nov: 'Nov',
  disember: 'Dec', dis: 'Dec'
};

let normalizedText = cleanText;
for (const [mMalay, mEng] of Object.entries(malayMonthsMap)) {
  const regex = new RegExp(`\\b${mMalay}\\b`, 'gi');
  if (regex.test(normalizedText)) {
    normalizedText = normalizedText.replace(regex, mEng);
    break;
  }
}

const directDate = new Date(normalizedText);

if (!isNaN(directDate.getTime())) {
  return {
    timestamp: directDate.getTime(),
    date: directDate
  };
}

return {
  timestamp: defaultTimestamp,
  date: new Date(defaultTimestamp)
};
}

export function normalizePhoneDigits(phone?: any): string {
  if (!phone) return '';
  const parsed = parsePhoneAndUsername(phone);
  if (parsed.isPlaceholder) return '';

  if (parsed.phone) {
    let digits = parsed.phone.replace(/\D/g, '');
    if (digits.startsWith('60')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    if (digits) return digits;
  }

  if (parsed.username) {
    return parsed.username.replace(/^@+/, '').toLowerCase().trim();
  }

  return '';
}

export function normalizeNameStr(name?: string): string {
  if (!name) return '';
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseMainType(orderVal?: string): string {
  if (!orderVal) return 'Pesanan';
  const trimmed = String(orderVal).trim();
  const lower = trimmed.toLowerCase();
  
  if (lower.includes('resume') || lower.includes('cv')) return 'Resume';
  if (lower.includes('surat') || lower.includes('letter')) return 'Surat';
  if (lower.includes('edit')) return 'Edit PDF';
  if (lower.includes('borang')) return 'Borang';
  
  return trimmed || 'Pesanan';
}

export function reconcileOrdersByUniqueId<T extends OrderHistoryItem = OrderHistoryItem>(items: T[]): T[] {
  if (!items || !Array.isArray(items) || items.length === 0) return [];

  const orderIdMap = new Map<string, T>();
  const unmatched: T[] = [];

  for (const item of items) {
    if (!item) continue;
    const itemState: any = item.state || {};
    const rawOrderId = String(itemState.orderId || item.id || '').trim();
    const cleanOrderId = rawOrderId.toLowerCase();
    const isTemp = !cleanOrderId || cleanOrderId.startsWith('sync-') || cleanOrderId.startsWith('temp-');

    if (!isTemp) {
      if (!orderIdMap.has(cleanOrderId)) {
        orderIdMap.set(cleanOrderId, item);
      } else {
        const existing = orderIdMap.get(cleanOrderId)!;
        orderIdMap.set(cleanOrderId, mergeOrderRecords(existing, item));
      }
    } else {
      unmatched.push(item);
    }
  }

  const result: T[] = Array.from(orderIdMap.values());

  for (const item of unmatched) {
    const itemState: any = item.state || {};
    const normName = normalizeNameStr(itemState.customerName || itemState.name);
    const normPhone = normalizePhoneDigits(itemState.customerPhone || itemState.phone);
    const rawOrderType = String(itemState.customerOrder || itemState.mainType || '').trim().toLowerCase();
    const itemTs = Number(item.timestamp) || Number(itemState.timestamp) || 0;

    let matchIdx = -1;

    for (let i = 0; i < result.length; i++) {
      const existing = result[i];
      const exState: any = existing.state || {};
      const exName = normalizeNameStr(exState.customerName || exState.name);
      const exPhone = normalizePhoneDigits(exState.customerPhone || exState.phone);
      const exOrderType = String(exState.customerOrder || exState.mainType || '').trim().toLowerCase();
      const exTs = Number(existing.timestamp) || Number(exState.timestamp) || 0;

      // 1. Same historyId match
      if (itemState.historyId && exState.historyId && itemState.historyId === exState.historyId) {
        matchIdx = i;
        break;
      }

      // 2. Name + Phone match
      if (normName && normPhone && exName && exPhone) {
        if (normName === exName && normPhone === exPhone) {
          matchIdx = i;
          break;
        }
      }

      // 3. Name + Order type match
      if (normName && exName && normName === exName) {
        if (!rawOrderType || !exOrderType || rawOrderType === exOrderType) {
          matchIdx = i;
          break;
        }
      }

      // 4. Unnamed ghost item match (merges empty draft created during message generation into populated customer order)
      if (!normName && !normPhone && (exName || exPhone)) {
        if (rawOrderType && exOrderType && rawOrderType === exOrderType) {
          if (itemTs === 0 || exTs === 0 || Math.abs(itemTs - exTs) < 3600000) {
            matchIdx = i;
            break;
          }
        }
      }
    }

    if (matchIdx !== -1) {
      result[matchIdx] = mergeOrderRecords(result[matchIdx], item);
    } else {
      result.push(item);
    }
  }

  // Filter out any lingering completely empty ghost records if a populated record for the same type exists
  const populatedTypes = new Set<string>();
  result.forEach(item => {
    const s: any = item.state || {};
    const name = String(s.customerName || s.name || '').trim();
    const phone = String(s.customerPhone || s.phone || '').trim();
    const type = String(s.customerOrder || s.mainType || '').trim().toLowerCase();
    if (name || phone) {
      if (type) populatedTypes.add(type);
    }
  });

  return result.filter(item => {
    const s: any = item.state || {};
    const name = String(s.customerName || s.name || '').trim();
    const phone = String(s.customerPhone || s.phone || '').trim();
    const type = String(s.customerOrder || s.mainType || '').trim().toLowerCase();
    if (!name && !phone && type && populatedTypes.has(type)) {
      return false;
    }
    return true;
  });
}

function mergeOrderRecords<T extends OrderHistoryItem = OrderHistoryItem>(a: T, b: T): T {
  const aState: any = a.state || {};
  const bState: any = b.state || {};

  const aId = String(aState.orderId || a.id || '').trim();
  const bId = String(bState.orderId || b.id || '').trim();
  const aIsTemp = !aId || aId.toLowerCase().startsWith('sync-') || aId.toLowerCase().startsWith('temp-');
  const bIsTemp = !bId || bId.toLowerCase().startsWith('sync-') || bId.toLowerCase().startsWith('temp-');

  const preferredOrderId = !aIsTemp ? aId : !bIsTemp ? bId : aId || bId;
  const preferredId = !aIsTemp ? (a.id || aId) : !bIsTemp ? (b.id || bId) : a.id || b.id || 'ORDER-' + Date.now();

  const aLink = aState.orderLink || aState.googleSheetLink || '';
  const bLink = bState.orderLink || bState.googleSheetLink || '';
  const validLink = (bLink && !bLink.includes('Belum dimasukkan')) ? bLink : aLink;

  const mergedDelivered = !!(aState.isDelivered || bState.isDelivered);
  const newerTimestamp = Math.max(Number(a.timestamp) || 0, Number(b.timestamp) || 0, Date.now());

  const mergedState = {
    ...aState,
    ...bState,
    orderId: preferredOrderId,
    isDelivered: mergedDelivered,
    orderLink: validLink,
    googleSheetLink: validLink,
    customerName: bState.customerName || aState.customerName || '',
    customerPhone: bState.customerPhone || aState.customerPhone || '',
    mainType: bState.mainType || aState.mainType || parseMainType(bState.customerOrder || aState.customerOrder),
    customerOrder: bState.customerOrder || aState.customerOrder || bState.mainType || aState.mainType || 'Resume',
    dueTimestamp: bState.dueTimestamp || aState.dueTimestamp || 0,
    customerDue: bState.customerDue || aState.customerDue || '',
    syncStatus: (bState.syncStatus === 'synced' || aState.syncStatus === 'synced') ? ('synced' as const) : (bState.syncStatus || aState.syncStatus || 'synced')
  };

  const baseItem = (Number(a.timestamp) || 0) >= (Number(b.timestamp) || 0) ? a : b;

  return {
    ...baseItem,
    id: preferredId,
    timestamp: newerTimestamp,
    state: mergedState
  };
}

export function deduplicateHistoryList(items: any[]): any[] {
  return reconcileOrdersByUniqueId(items);
}

/**
 * Explicitly maps specific source columns/properties (e.g. Column L 'BAYARAN', harga, itemPrice, price, pendapatan)
 * to the 'Pendapatan' numeric value.
 * Safely handles null, undefined, NaN, formatted currency strings (RM 50.00), and ignores non-numeric descriptions.
 */
export function extractPendapatanValue(source: any): number {
  if (source === null || source === undefined) return 0;

  const parseNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') {
      return isFinite(val) && !isNaN(val) ? Math.max(0, val) : 0;
    }
    const strVal = String(val).trim();
    if (!strVal) return 0;

    // Check if string contains digits
    if (!/\d/.test(strVal)) return 0;

    // Standardize comma to dot for decimal conversion and strip non-numeric characters except dot
    const cleanedStr = strVal.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    if (!cleanedStr) return 0;

    const parsed = parseFloat(cleanedStr);
    return isFinite(parsed) && !isNaN(parsed) ? Math.max(0, parsed) : 0;
  };

  // 1. Array source (e.g. Google Sheet row array: Column L = Index 11 [BAYARAN])
  if (Array.isArray(source)) {
    // Check index 11 (Column L - Bayaran) first
    const valL = parseNumber(source[11]);
    if (valL > 0) return valL;

    // Check index 12 if present
    const valM = parseNumber(source[12]);
    if (valM > 0) return valM;

    // Fallback to index 6 only if it resolves to a valid number
    const valG = parseNumber(source[6]);
    if (valG > 0) return valG;

    return 0;
  } 

  // 2. Object source (e.g. Order object, item, or item.state)
  if (typeof source === 'object') {
    const st = source.state || source;

    // List of candidate fields in order of precedence
    const candidates = [
      st.bayaran,
      st.harga,
      st.itemPrice,
      st.price,
      st.pendapatan,
      st.amount,
      st.totalPrice,
      source.bayaran,
      source.harga,
      source.itemPrice,
      source.price,
      source.pendapatan
    ];

    for (const c of candidates) {
      if (c !== undefined && c !== null && c !== '') {
        const val = parseNumber(c);
        if (val > 0) return val;
      }
    }

    return 0;
  } 

  // 3. Direct primitive value (number or string)
  return parseNumber(source);
}

/**
 * Utility to safely parse raw JSON or JSONP text response (e.g. callbackName({...}))
 */
export function parseJsonpOrJson(text: string): any {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  const match = trimmed.match(/^[a-zA-Z0-9_$]+\s*\(([\s\S]*)\)\s*;?$/);
  if (match && match[1]) {
    return JSON.parse(match[1]);
  }
  throw new Error('Invalid JSON/JSONP payload format');
}

/**
 * Executes a Google Apps Script request using multi-level fallback strategy:
 * 1. Express backend proxy `/api/sync-proxy?url=...`
 * 2. Direct browser `fetch()`
 * 3. Dynamic `<script>` tag insertion (JSONP)
 */
export async function smartFetchGoogleScript<T = any>(
  urlInput: URL | string,
  callbackName?: string,
  timeoutMs = 50000
): Promise<T> {
  const urlStr = urlInput.toString();
  const cbName = callbackName || ('jsonp_cb_' + Math.round(1000000 * Math.random()));

  let requestUrl = urlStr;
  if (!requestUrl.includes('callback=')) {
    const separator = requestUrl.includes('?') ? '&' : '?';
    requestUrl = `${requestUrl}${separator}callback=${cbName}`;
  }

  // Strategy 1: Server-side proxy
  try {
    const proxyUrl = `/api/sync-proxy?url=${encodeURIComponent(requestUrl)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.min(timeoutMs, 50000));

    const resp = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const text = await resp.text();
      if (text && text.trim()) {
        const parsed = parseJsonpOrJson(text);
        if (parsed) return parsed as T;
      }
    }
  } catch (e) {
    // Proxy failed or unavailable, fallback to next strategy
  }

  // Strategy 2: Direct browser fetch
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.min(timeoutMs, 50000));

    const resp = await fetch(requestUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const text = await resp.text();
      if (text && text.trim()) {
        const parsed = parseJsonpOrJson(text);
        if (parsed) return parsed as T;
      }
    }
  } catch (e) {
    // Direct fetch failed or CORS blocked, fallback to script element
  }

  // Strategy 3: Dynamic <script> tag insertion (JSONP)
  return new Promise<T>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = requestUrl;
    script.async = true;

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Google Sheet request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeoutId);
      try {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      } catch (e) {}
      delete (window as any)[cbName];
    };

    (window as any)[cbName] = (data: T) => {
      cleanup();
      resolve(data);
    };

    script.onerror = (event: any) => {
      if (event && typeof event !== 'string') {
        if (typeof (event as any).preventDefault === 'function') (event as any).preventDefault();
        if (typeof (event as any).stopPropagation === 'function') (event as any).stopPropagation();
      }
      cleanup();
      reject(new Error('Google Sheet script loading failed'));
    };

    document.body.appendChild(script);
  });
}
