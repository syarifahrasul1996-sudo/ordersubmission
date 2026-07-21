export function calculateDeadline(state: any, appLanguage: string) {
  const now = state.timestamp ? new Date(state.timestamp) : new Date();
  const isSuperUrgent = state.urgency === 'super';
  const addonHours = (state.mainType === 'Resume' && !state.isEditMode && isSuperUrgent && state.addons) ? state.addons.length : 0;
  let rawTotal = (state.baseHours || 0) + (state.extraHours || 0) + addonHours;
  
  if (typeof rawTotal !== 'number' || isNaN(rawTotal) || rawTotal < 0) {
    rawTotal = 0;
  }
  const total = rawTotal;
  
  const dl = new Date(now.getTime() + total * 3600000);
  const timeStr = dl.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const daysMs = ['Ahad','Isnin','Selasa','Rabu','Khamis','Jumaat','Sabtu'];
  const daysEn = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  
  const diff = Math.round((new Date(dl.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86400000);
  
  let dateStr = '';
  if (diff <= 0) {
    dateStr = appLanguage === 'ms' ? `hari ini ${timeStr}` : `today at ${timeStr}`;
  } else if (diff === 1) {
    dateStr = appLanguage === 'ms' ? `esok ${timeStr}` : `tomorrow at ${timeStr}`;
  } else {
    if (appLanguage === 'ms') {
      dateStr = `pada hari ${daysMs[dl.getDay()]} (${String(dl.getDate()).padStart(2,'0')}/${String(dl.getMonth()+1).padStart(2,'0')}) ${timeStr}`;
    } else {
      dateStr = `on ${daysEn[dl.getDay()]} (${String(dl.getDate()).padStart(2,'0')}/${String(dl.getMonth()+1).padStart(2,'0')}) at ${timeStr}`;
    }
  }
  
  const isDays = state.urgency === 'semi' || state.urgency === 'noturgent';
  const displayDuration = total > 0 ? (isDays ? Math.ceil(total / 24) : total) : 0;
  
  return { formatted: dateStr, total, displayDuration };
}

export function toProperCase(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .replace(/\w\S*/g, (txt) => {
      const upper = txt.toUpperCase();
      if (['ATS', 'BI', 'BM', 'PDF', 'CV'].includes(upper)) {
        return upper;
      }
      return txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase();
    });
}

export function formatAddOnString(addOnStr: string): string {
  if (!addOnStr) return '';
  return addOnStr
    .split(',')
    .map(item => toProperCase(item))
    .filter(Boolean)
    .join(', ');
}

export function generateMessages(state: any, dl: { formatted: string, total: number }, appLanguage: string) {
  const isE = state.isEditMode;
  let raw = state.mainType === 'Lain-lain' ? ((state.customDoc || '').trim() || 'Dokumen') : state.mainType;
  const docLabel = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  
  let addsForDisplay: string[] = [];
  if (state.customerAddOn && String(state.customerAddOn).trim()) {
    addsForDisplay = String(state.customerAddOn)
      .split(',')
      .map((s: string) => toProperCase(s))
      .filter(Boolean);
  } else {
    addsForDisplay = (state.addons || []).map((a: string) => {
      if (a === 'Soft Copy Word') return `Soft Copy Word (${state.softcopyLang})`;
      if (a === 'Cover Letter') {
          const clText = ['Melayu', 'English'].filter(l => state.clLangs && state.clLangs.includes(l)).join(' & ');
          return `Cover Letter (${clText})`;
      }
      if (a === 'Custom') {
          return toProperCase(state.customDoc || '').trim() || 'Custom';
      }
      return a;
    });
  }
  
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

export function formatPhoneUniversal(phone?: any): string {
  if (!phone) return '';

  const phoneStr = String(phone);
  // Clean all non-digit characters
  const digits = phoneStr.replace(/\D/g, '');
  if (!digits) return phoneStr.trim(); // fallback to trimmed input if no digits

  // 1. Malaysia (Country Code: 60)
  // If starts with domestic '0', replace with '60'. E.g. '0189864891' -> '60189864891'
  let normalized = digits;
  if (digits.startsWith('0')) {
    normalized = '6' + digits;
  } else if (digits.startsWith('1') && (digits.length === 9 || digits.length === 10)) {
    // If entered without country code (e.g. 189864891), prefix with '60'
    normalized = '60' + digits;
  }

  if (normalized.startsWith('60')) {
    const rawSuffix = normalized.substring(2);
    // Malaysian mobile operator codes have 2 or 3 digits (11 or 10,12,13,14,15,16,17,18,19)
    if (rawSuffix.startsWith('11')) {
      if (rawSuffix.length >= 10) {
        // Format: 60 11-3957 6582
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
        // Format: 60 18-986 4891
        return `60 ${op}-${rest.substring(0, 3)} ${rest.substring(3, 7)}`;
      } else {
        return `60 ${op}-${rest}`;
      }
    } else if (rawSuffix.startsWith('3')) {
      // KL Landline: e.g. 60 3-1234 5678 (8 digits suffix)
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
      // Other states landline: e.g. 60 9-123 4567
      const op = rawSuffix.substring(0, 1);
      const rest = rawSuffix.substring(1);
      if (rest.length >= 7) {
        return `60 ${op}-${rest.substring(0, 3)} ${rest.substring(3, 7)}`;
      } else {
        return `60 ${op}-${rest}`;
      }
    }
    // General fallback for other formats of Malaysian numbers
    return `60 ${rawSuffix}`;
  }

  // 2. Singapore (Country Code: 65) - 8 digits suffix typically
  if (digits.startsWith('65')) {
    const suffix = digits.substring(2);
    if (suffix.length >= 8) {
      return `65 ${suffix.substring(0, 4)} ${suffix.substring(4, 8)}`;
    }
    return `65 ${suffix}`;
  }

  // 3. Indonesia (Country Code: 62) - e.g. 62 812-3456-7890
  if (digits.startsWith('62')) {
    const suffix = digits.substring(2);
    if (suffix.length >= 9) {
      return `62 ${suffix.substring(0, 3)}-${suffix.substring(3, 7)}-${suffix.substring(7, 11)}`;
    }
    return `62 ${suffix}`;
  }

  // 4. US/Canada (Country Code: 1) - 10 digits
  if (digits.startsWith('1') && digits.length === 11) {
    return `1 (${digits.substring(1, 4)}) ${digits.substring(4, 7)}-${digits.substring(7)}`;
  }
  if (digits.length === 10) {
    return `1 (${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
  }

  // 5. United Kingdom (Country Code: 44) - e.g. 44 7123 456789
  if (digits.startsWith('44')) {
    const suffix = digits.substring(2);
    if (suffix.length >= 10) {
      return `44 ${suffix.substring(0, 4)} ${suffix.substring(4)}`;
    }
  }

  // Generic Default Fallback (spaced representation) or original input
  if (digits.length >= 10) {
    return `+${digits.substring(0, 3)} ${digits.substring(3, 6)} ${digits.substring(6)}`;
  }

  return phoneStr.trim();
}

/**
 * Parses any date-time string (DD/MM/YYYY with optional time, or standard formats)
 * in a robust manner. Returns both the timestamp and a Date object.
 */
export function parseDateStringToTimestamp(dueText: string, defaultTimestamp: number): { timestamp: number; date: Date } {
  if (!dueText) {
    return { timestamp: defaultTimestamp, date: new Date(defaultTimestamp) };
  }

  // Strip all invisible formatting marks/Unicode directional controls (e.g. \u202a, \u202c)
  // and normalize all types of spaces (regular, non-breaking, wide spaces) to regular space
  const sanitized = String(dueText)
    .replace(/[\u200B-\uFEFF\u200E\u200F\u202A-\u202E]/g, '')
    .replace(/[\s\xa0\u2002\u2003\u2009]+/g, ' ')
    .trim();

  if (!sanitized) {
    return { timestamp: defaultTimestamp, date: new Date(defaultTimestamp) };
  }

  const cleanText = sanitized.replace(/\s+at\s+/i, ' ').trim();

  // Robustly extract date segments: support /, -, or . separators
  const datePattern = /(\d{1,4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,4})/;
  const match = cleanText.match(datePattern);

  if (match) {
    let day = 0, month = 0, year = 0;
    const part1 = match[1];
    const part2 = match[2];
    const part3 = match[3];

    if (part1.length === 4) {
      // YYYY-MM-DD
      year = parseInt(part1, 10);
      month = parseInt(part2, 10) - 1;
      day = parseInt(part3, 10);
    } else {
      // DD-MM-YYYY
      day = parseInt(part1, 10);
      month = parseInt(part2, 10) - 1;
      year = parseInt(part3, 10);
      // Normalize 2-digit years
      if (year < 100) {
        if (year >= 50) year += 1900;
        else year += 2000;
      }
    }

    // Robustly extract time segments: support : or . delimiters with optional AM/PM
    const timePattern = /(\d{1,2})[\:\.](\d{2})(?:[\:\.](\d{2}))?\s*(AM|PM)?/i;
    const timeMatch = cleanText.match(timePattern);

    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
      if (timeMatch[3]) {
        seconds = parseInt(timeMatch[3], 10);
      }
      const ampm = timeMatch[4];
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hours < 12) {
          hours += 12;
        } else if (ampm.toUpperCase() === 'AM' && hours === 12) {
          hours = 0;
        }
      }
    }

    const parsedDME = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(parsedDME.getTime())) {
      return { timestamp: parsedDME.getTime(), date: parsedDME };
    }
  }

  // Fallback to standard new Date() for formats other than custom DD/MM/YYYY
  const directDate = new Date(cleanText);
  if (!isNaN(directDate.getTime())) {
    return { timestamp: directDate.getTime(), date: directDate };
  }

  return { timestamp: defaultTimestamp, date: new Date(defaultTimestamp) };
}

export function normalizeBahasa(val: string): string {
  const clean = (val || '').trim();
  if (!clean) return 'Melayu';
  const lower = clean.toLowerCase();
  if (lower === '2 bahasa' || lower === 'dua bahasa' || lower === 'both') return '2 Bahasa';
  if (lower === 'melayu' || lower === 'bm') return 'Melayu';
  if (lower === 'english' || lower === 'bi') return 'English';
  return clean;
}

export function normalizeJenis(val: string): string {
  const v = (val || '').trim().toLowerCase();
  if (v.includes('super')) return 'Super Urgent';
  if (v.includes('semi')) return 'Semi Urgent';
  if (v.includes('normal') || v.includes('tak') || v.includes('not') || v.includes('tidak')) return 'Tak Urgent';
  if (v.includes('urgent')) return 'Urgent';
  return 'Tak Urgent'; // default fallback
}

export function parseTimestampFromId(id: string): number | null {
  if (!id) return null;
  
  // Format: ORD-YYYYMMDD-HHMMSS (e.g. ORD-20260709-115815)
  const ordMatch = id.match(/ORD-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (ordMatch) {
    const [_, y, m, d, hh, mm, ss] = ordMatch;
    const parsedDate = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.getTime();
    }
  }

  // Format: SYNC-Willy-6018-4601993-10072026at237PM or SYNC-...-10072026at1437
  const syncMatch = id.match(/(\d{2})(\d{2})(\d{4})at(\d+)(\d{2})(AM|PM)?/i);
  if (syncMatch) {
    const [_, d, m, y, hh, mm, ampm] = syncMatch;
    let hour = Number(hh);
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hour < 12) hour += 12;
      if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    const parsedDate = new Date(Number(y), Number(m) - 1, Number(d), hour, Number(mm));
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.getTime();
    }
  }

  // Format: SYNC-Willy-6018-4601993-10072026 (DDMMYYYY) at the end of ID
  const syncMatchNoTime = id.match(/(\d{2})(\d{2})(\d{4})$/);
  if (syncMatchNoTime) {
    const [_, d, m, y] = syncMatchNoTime;
    const parsedDate = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.getTime();
    }
  }

  // General fallback check for any numbers of length 13 (typical JS timestamps)
  const tsMatch = id.match(/\b\d{13}\b/);
  if (tsMatch) {
    const tsVal = Number(tsMatch[0]);
    if (tsVal > 1500000000000 && tsVal < 2500000000000) {
      return tsVal;
    }
  }

  return null;
}

