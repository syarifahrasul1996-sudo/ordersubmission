import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { google } from 'googleapis';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore/lite';

const SPREADSHEETS: Record<string, string> = {
  '2024': '1B9zdWXVLnvj0jNNVnKxcb6cJnS1VLCIdB4j-RR3wOlg',
  '2025': '1myU9apnYWWtU3snnCw14qI6ZS05i4DY6oOswLz1sCwo',
  '2026': '1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo'
};

const HEADER_ALIASES: string[][] = [
  ['delivered', 'checkbox', 'done', 'status', 'siap', 'hantar', 'checkbox / delivered', 'delivered / checkbox', 'is delivered'],
  ['nama', 'name', 'customer name'],
  ['phone number', 'phone', 'no phone', 'nombor telefon', 'telefon', 'customer phone'],
  ['order', 'customer order', 'pesanan', 'produk', 'service'],
  ['template'],
  ['bahasa', 'language'],
  ['add on', 'addon', 'add-on', 'tambahan'],
  ['jenis', 'type'],
  ['due', 'due date', 'deadline', 'tarikh due', 'tarikh siap'],
  ['link', 'order link', 'pautan'],
  ['order id', 'orderid', 'id'],
  ['price', 'harga', 'amount', 'jumlah'],
];

function cleanCell(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeHeader(value: unknown): string {
  return cleanCell(value).toLowerCase().replace(/\s+/g, ' ');
}

function validatePrice(value: unknown): { status: 'valid' | 'invalid' | 'blank'; value: number | null } {
  const s = cleanCell(value);
  if (s === '') return { status: 'blank', value: null };

  const PRICE_PATTERN = /^(?:RM\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/i;
  if (!PRICE_PATTERN.test(s)) return { status: 'invalid', value: null };

  const numericValue = Number(s.replace(/[RM\s,]/gi, ''));
  return Number.isFinite(numericValue) && numericValue >= 0 
    ? { status: 'valid', value: numericValue } 
    : { status: 'invalid', value: null };
}

function validateDate(value: unknown, locale: string | null): { status: 'blank' | 'valid' | 'invalid' | 'ambiguous'; originalValue: string; normalizedDate: string | null } {
  const raw = cleanCell(value);
  if (raw === '') return { status: 'blank', originalValue: raw, normalizedDate: null };

  const s = raw.split(/\s+at\s+/i)[0].split(/\s+/)[0].trim();
  if (s === '') return { status: 'invalid', originalValue: raw, normalizedDate: null };

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) return { status: 'valid', originalValue: raw, normalizedDate: s };
    return { status: 'invalid', originalValue: raw, normalizedDate: null };
  }

  const parts = s.split(/[\/\-]/);
  if (parts.length === 3) {
    const p1 = Number(parts[0]);
    const p2 = Number(parts[1]);
    const p3 = Number(parts[2]);
    let d: number, m: number, y: number;

    const normalizedLocale = cleanCell(locale).toLowerCase().replace(/_/g, '-');
    const dayFirstLocales = new Set(['en-gb', 'en-my', 'ms-my']);
    const monthFirstLocales = new Set(['en-us']);

    if (p1 > 12) { [d, m, y] = [p1, p2, p3]; }
    else if (p2 > 12) { [m, d, y] = [p1, p2, p3]; }
    else if (dayFirstLocales.has(normalizedLocale)) { [d, m, y] = [p1, p2, p3]; }
    else if (monthFirstLocales.has(normalizedLocale)) { [m, d, y] = [p1, p2, p3]; }
    else { return { status: 'ambiguous', originalValue: raw, normalizedDate: null }; }
    
    if (y < 100) y += 2000;
    
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) return { status: 'valid', originalValue: raw, normalizedDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
  }
  
  return { status: 'invalid', originalValue: raw, normalizedDate: null };
}

function validateStatus(value: unknown): { status: 'valid' | 'invalid'; value: boolean | null } {
  const s = cleanCell(value).toLowerCase();
  if (s === '' || s === 'false' || s === 'no' || s === '0' || s === 'blank') return { status: 'valid', value: false };
  if (s === 'true' || s === 'yes' || s === '1' || s === 'checked') return { status: 'valid', value: true };
  return { status: 'invalid', value: null };
}

async function main() {
    console.log('Fetching staging documents from Firestore...');
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
    const app = initializeApp(config);
    const db = getFirestore(app, config.firestoreDatabaseId);

    const snapshot = await getDocs(collection(db, 'orders_migration_staging'));
    const stagingDocs: any[] = [];
    snapshot.forEach(docSnap => {
        stagingDocs.push(docSnap.data());
    });
    console.log(`Fetched ${stagingDocs.length} documents from Firestore.`);

    // Set up sheets api
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_SHEETS_API_KEY environment variable is required');
    }
    const sheets = google.sheets({ version: 'v4', auth: apiKey });

    // Identify unique sheets we need to fetch
    const sheetsToFetch = new Map<string, Set<string>>();
    for (const doc of stagingDocs) {
        const spreadId = doc.sourceSpreadsheetId;
        const worksheet = doc.sourceWorksheet;
        if (spreadId && worksheet) {
            if (!sheetsToFetch.has(spreadId)) {
                sheetsToFetch.set(spreadId, new Set<string>());
            }
            sheetsToFetch.get(spreadId)!.add(worksheet);
        }
    }

    // Cache spreadsheet metadata and row values
    const sheetCache: Record<string, Record<string, string[][]>> = {};
    const localeCache: Record<string, string | null> = {};
    const headerDetectedCache: Record<string, Record<string, boolean>> = {};

    for (const [spreadId, worksheets] of sheetsToFetch.entries()) {
        console.log(`Fetching spreadsheet metadata for ${spreadId}...`);
        const meta = await sheets.spreadsheets.get({ spreadsheetId: spreadId });
        const locale = meta.data.properties?.locale || null;
        localeCache[spreadId] = locale;

        sheetCache[spreadId] = {};
        headerDetectedCache[spreadId] = {};

        for (const ws of worksheets) {
            console.log(`Fetching sheet values for ${ws}...`);
            // Fetch entire sheet to row 2000
            const range = `'${ws.replace(/'/g, "''")}'!A1:L2000`;
            const res = await sheets.spreadsheets.values.get({
                spreadsheetId: spreadId,
                range,
                valueRenderOption: 'FORMATTED_VALUE'
            });
            const values = res.data.values || [];
            sheetCache[spreadId][ws] = values;

            // Detect if header is present
            let headerDetected = true;
            if (spreadId === SPREADSHEETS['2025'] && ['October 2025', 'November 2025', 'December 2025'].includes(ws)) {
                headerDetected = false;
            } else {
                let headerRowIndex = -1;
                const scanLimit = Math.min(10, values.length);
                for (let r = 0; r < scanLimit; r++) {
                    const rowValues = values[r] || [];
                    const rowNormalized = Array.from({ length: 12 }, (_, colIdx) => normalizeHeader(rowValues[colIdx]));
                    
                    let matchCount = 0;
                    for (let i = 0; i < 12; i++) {
                        if (HEADER_ALIASES[i].includes(rowNormalized[i])) {
                            matchCount++;
                        }
                    }
                    if (matchCount >= 8) {
                        headerRowIndex = r;
                        break;
                    }
                }
                if (headerRowIndex === -1) {
                    headerDetected = false;
                }
            }
            headerDetectedCache[spreadId][ws] = headerDetected;
            console.log(`  Header detected for ${ws}: ${headerDetected}`);
        }
    }

    // Validation loop
    let checkedCount = 0;
    let foundCount = 0;
    let missingCount = 0;
    let exactMatches = 0;
    let fieldMismatchesCount = 0;
    let duplicateSourceKeys = 0;
    let invalidSourceReferences = 0;

    const sourceKeySet = new Set<string>();
    const mismatchReport: any[] = [];

    for (const doc of stagingDocs) {
        checkedCount++;
        const docId = doc.documentId;
        const spreadId = doc.sourceSpreadsheetId;
        const ws = doc.sourceWorksheet;
        const rowNum = doc.sourceRow;
        const sKey = doc.sourceKey;

        if (!spreadId || !ws || !rowNum || !sKey) {
            invalidSourceReferences++;
            continue;
        }

        if (sourceKeySet.has(sKey)) {
            duplicateSourceKeys++;
        }
        sourceKeySet.add(sKey);

        const sheetValues = sheetCache[spreadId]?.[ws];
        if (!sheetValues) {
            missingCount++;
            continue;
        }

        const headerDetected = headerDetectedCache[spreadId][ws];
        const actualIndex = headerDetected ? rowNum - 2 : rowNum - 1;

        if (actualIndex < 0 || actualIndex >= sheetValues.length) {
            missingCount++;
            mismatchReport.push({
                documentId: docId,
                sourceKey: sKey,
                error: 'Row number out of bounds in fetched sheet'
            });
            continue;
        }

        foundCount++;
        const row = Array.from({ length: 12 }, (_, colIdx) => cleanCell(sheetValues[actualIndex]?.[colIdx]));

        // Check if row is empty in sheet but we have document
        if (row.every(c => c === '')) {
            missingCount++;
            mismatchReport.push({
                documentId: docId,
                sourceKey: sKey,
                error: 'Source row is completely empty/blank in sheet'
            });
            continue;
        }

        // Normalize sheet fields
        const sheetIsDelivered = validateStatus(row[0]).value;
        const sheetCustomerName = row[1];
        const sheetCustomerPhone = row[2];
        const sheetCustomerOrder = row[3];
        const sheetCustomerTemplate = row[4];
        const sheetCustomerBahasa = row[5];
        const sheetCustomerAddOn = row[6];
        const sheetCustomerJenis = row[7];
        const sheetOriginalDue = row[8];
        const sheetNormalizedDue = validateDate(row[8], localeCache[spreadId]).normalizedDate;
        const sheetOrderLink = row[9];
        const sheetOriginalOrderId = row[10] === '' ? null : row[10];
        const sheetPrice = validatePrice(row[11]).value;

        // Fetch Firestore fields
        const docIsDelivered = doc.isDelivered;
        const docCustomerName = doc.customerName;
        const docCustomerPhone = doc.customerPhone;
        const docCustomerOrder = doc.customerOrder;
        const docCustomerTemplate = doc.customerTemplate;
        const docCustomerBahasa = doc.customerBahasa;
        const docCustomerAddOn = doc.customerAddOn;
        const docCustomerJenis = doc.customerJenis;
        const docOriginalDue = doc.originalDue;
        const docOrderLink = doc.orderLink;
        const docOriginalOrderId = doc.originalOrderId;
        const docPrice = doc.price;

        let docNormalizedDue: string | null = null;
        if (doc.deliveryDate) {
            // Check if it has a seconds field (it's a Timestamp representation)
            const sec = doc.deliveryDate.seconds !== undefined ? doc.deliveryDate.seconds : (doc.deliveryDate._seconds !== undefined ? doc.deliveryDate._seconds : null);
            if (sec !== null) {
                const date = new Date(sec * 1000);
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                docNormalizedDue = `${y}-${m}-${day}`;
            }
        }

        // Compare
        const mismatches: Record<string, { sheet: any; firestore: any }> = {};

        if (sheetIsDelivered !== docIsDelivered) mismatches.isDelivered = { sheet: sheetIsDelivered, firestore: docIsDelivered };
        if (sheetCustomerName !== docCustomerName) mismatches.customerName = { sheet: sheetCustomerName, firestore: docCustomerName };
        if (sheetCustomerPhone !== docCustomerPhone) mismatches.customerPhone = { sheet: sheetCustomerPhone, firestore: docCustomerPhone };
        if (sheetCustomerOrder !== docCustomerOrder) mismatches.customerOrder = { sheet: sheetCustomerOrder, firestore: docCustomerOrder };
        if (sheetCustomerTemplate !== docCustomerTemplate) mismatches.customerTemplate = { sheet: sheetCustomerTemplate, firestore: docCustomerTemplate };
        if (sheetCustomerBahasa !== docCustomerBahasa) mismatches.customerBahasa = { sheet: sheetCustomerBahasa, firestore: docCustomerBahasa };
        if (sheetCustomerAddOn !== docCustomerAddOn) mismatches.customerAddOn = { sheet: sheetCustomerAddOn, firestore: docCustomerAddOn };
        if (sheetCustomerJenis !== docCustomerJenis) mismatches.customerJenis = { sheet: sheetCustomerJenis, firestore: docCustomerJenis };
        if (sheetOriginalDue !== docOriginalDue) mismatches.originalDue = { sheet: sheetOriginalDue, firestore: docOriginalDue };
        if (sheetNormalizedDue !== docNormalizedDue) mismatches.deliveryDate = { sheet: sheetNormalizedDue, firestore: docNormalizedDue };
        if (sheetOrderLink !== docOrderLink) mismatches.orderLink = { sheet: sheetOrderLink, firestore: docOrderLink };
        if (sheetOriginalOrderId !== docOriginalOrderId) mismatches.originalOrderId = { sheet: sheetOriginalOrderId, firestore: docOriginalOrderId };
        if (sheetPrice !== docPrice) mismatches.price = { sheet: sheetPrice, firestore: docPrice };

        if (Object.keys(mismatches).length > 0) {
            fieldMismatchesCount++;
            mismatchReport.push({
                documentId: docId,
                sourceKey: sKey,
                mismatches
            });
        } else {
            exactMatches++;
        }
    }

    const summary = {
        stagingDocumentsChecked: checkedCount,
        sourceRowsFound: foundCount,
        sourceRowsMissing: missingCount,
        exactMatches: exactMatches,
        fieldMismatches: fieldMismatchesCount,
        duplicateSourceKeys: duplicateSourceKeys,
        invalidSourceReferences: invalidSourceReferences
    };

    console.log('\n--- REVALIDATION RESULTS ---');
    console.log(JSON.stringify(summary, null, 2));

    if (!fs.existsSync('migration-reports')) {
        fs.mkdirSync('migration-reports');
    }

    fs.writeFileSync('migration-reports/staging-source-revalidation-summary.json', JSON.stringify(summary, null, 2));
    fs.writeFileSync('migration-reports/staging-source-revalidation-mismatches.json', JSON.stringify(mismatchReport, null, 2));

    console.log('Saved reports:');
    console.log(' - migration-reports/staging-source-revalidation-summary.json');
    console.log(' - migration-reports/staging-source-revalidation-mismatches.json');
}

main().catch(console.error);
