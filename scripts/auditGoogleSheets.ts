import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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

const MONTH_PATTERN = /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|januari|februari|mac|mei|jun|julai|ogos|oktober|november|disember)(?:\s+\d{4})?$/i;

interface AuditIssue {
  spreadsheetYear: string;
  spreadsheetId: string;
  worksheet: string;
  sourceRow: number;
  orderId: string | null;
  field: string;
  code: string;
  message: string;
  originalValue: unknown;
  originalRow: unknown[];
  classification?: string;
  reasons?: string[];
}

type RowClassification = 
  | 'READY_WITH_EXISTING_ID'
  | 'MIGRATABLE_GENERATED_ID'
  | 'MIGRATABLE_PRICE_NULL'
  | 'MIGRATABLE_GENERATED_ID_AND_PRICE_NULL'
  | 'REQUIRES_MANUAL_REVIEW'
  | 'IGNORED_EMPTY_ROW';

interface TransformedSample {
  spreadsheetYear: string;
  worksheet: string;
  sourceRow: number;
  isDelivered: boolean;
  customerName: string;
  customerPhone: string;
  customerOrder: string;
  customerTemplate: string;
  customerBahasa: string;
  customerAddOn: string;
  customerJenis: string;
  originalDue: string;
  normalizedDue: string | null;
  orderLink: string;
  orderId: string;
  originalPrice: unknown;
  normalizedPrice: number;
}

interface OrderIdLocation {
  spreadsheetYear: string;
  spreadsheetId: string;
  worksheet: string;
  sourceRow: number;
}

function cleanCell(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeHeader(value: unknown): string {
  return cleanCell(value).toLowerCase().replace(/\s+/g, ' ');
}

function isMonthlyWorksheet(title: string): boolean {
  return MONTH_PATTERN.test(cleanCell(title));
}

function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

function generateDeterministicId(spreadsheetId: string, worksheet: string, row: number): string {
  const sourceKey = `${spreadsheetId}|${worksheet}|${row}`;
  const hash = crypto.createHash('sha256').update(sourceKey).digest('hex');
  return `sheet-${hash.substring(0, 16)}`;
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

  // Strip " at ..." or trailing spaces/time
  const s = raw.split(/\s+at\s+/i)[0].split(/\s+/)[0].trim();
  if (s === '') return { status: 'invalid', originalValue: raw, normalizedDate: null };

  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) return { status: 'valid', originalValue: raw, normalizedDate: s };
    return { status: 'invalid', originalValue: raw, normalizedDate: null };
  }

  // Slashed/Hyphenated
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

async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 1000): Promise<any> {
  try {
    return await fn();
  } catch (e: any) {
    if (retries > 0 && (e.code === 429 || e.code === 500 || e.code === 503)) {
      console.warn(`API Error ${e.code}. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw e;
  }
}

async function auditSheets() {
  let auth: string | any = process.env.GOOGLE_SHEETS_API_KEY;

  if (fs.existsSync('/scripts/service-account.json')) {
    try {
        const creds = JSON.parse(fs.readFileSync('/scripts/service-account.json', 'utf-8'));
        auth = new google.auth.GoogleAuth({
            credentials: creds,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
    } catch (e) {
        throw new Error('SERVICE_ACCOUNT_CREDENTIALS in /scripts/service-account.json is not valid JSON.');
    }
  } else if (!auth) {
    throw new Error('Neither GOOGLE_SHEETS_API_KEY nor /scripts/service-account.json is configured.');
  }
  
  const sheets = google.sheets({
    version: 'v4',
    auth: auth,
  });
  const issues: AuditIssue[] = [];
  const samples: Record<string, TransformedSample[]> = {};
  const orderIdMap = new Map<string, OrderIdLocation>();

  const summary = {
    spreadsheetsChecked: 0,
    worksheetsDiscovered: 0,
    monthlyWorksheetsProcessed: 0,
    nonMonthlyWorksheetsSkipped: 0,
    worksheetsWithMissingHeaders: 0,
    worksheetsWithInvalidHeaders: 0,
    emptyRowsIgnored: 0,
    nonEmptyRows: 0,
    
    // New Classifications
    READY_WITH_EXISTING_ID: 0,
    MIGRATABLE_GENERATED_ID: 0,
    MIGRATABLE_PRICE_NULL: 0,
    MIGRATABLE_GENERATED_ID_AND_PRICE_NULL: 0,
    REQUIRES_MANUAL_REVIEW: 0,
    IGNORED_EMPTY_ROW: 0,

    totalIssues: 0,
    blankOrderIds: 0,
    duplicateIdsWithinWorksheet: 0,
    duplicateIdsAcrossWorksheets: 0,
    duplicateIdsAcrossYears: 0,
    blankCustomerNames: 0,
    blankPrices: 0,
    invalidPrices: 0,
    blankDueDates: 0,
    invalidDueDates: 0,
    ambiguousDueDates: 0,
    invalidDeliveryStatuses: 0,
    bySpreadsheet: {} as any
  };

  function addIssue(issue: AuditIssue): void {
    issues.push(issue);
  }

  const classificationSamples: Record<string, any[]> = {
    READY_WITH_EXISTING_ID: [],
    MIGRATABLE_GENERATED_ID: [],
    MIGRATABLE_PRICE_NULL: [],
    MIGRATABLE_GENERATED_ID_AND_PRICE_NULL: [],
    REQUIRES_MANUAL_REVIEW: [],
    IGNORED_EMPTY_ROW: [],
  };

  const allRows: any[] = [];

  for (const [year, spreadsheetId] of Object.entries(SPREADSHEETS)) {
    summary.spreadsheetsChecked++;
    summary.bySpreadsheet[year] = { 
        spreadsheetId, 
        locale: null, 
        timeZone: null, 
        discoveredWorksheets: [], 
        processedWorksheets: [], 
        skippedWorksheets: [], 
        invalidHeaderWorksheets: [], 
        emptyWorksheets: [], 
        readErrors: [], 
        monthlyWorksheetsFound: 0, 
        rowsReturned: 0, 
        nonEmptyRows: 0, 
        migratableRows: 0,
        manualReviewRows: 0,
        emptyRows: 0,
        existingIds: 0,
        missingIds: 0,
        numericPrices: 0,
        nullPrices: 0,
        headerDetails: {} as Record<string, { header: string[] | null, mappingMethod: string, dataStartRow: number }>
    };
    samples[year] = [];

    try {
        const meta = await fetchWithRetry(() => sheets.spreadsheets.get({ spreadsheetId }));
        summary.bySpreadsheet[year].locale = meta.data.properties?.locale || null;
        summary.bySpreadsheet[year].timeZone = meta.data.properties?.timeZone || null;
        const sheetsList = meta.data.sheets || [];
        
        for (const sheet of sheetsList) {
          const sheetTitle = sheet.properties?.title || 'Unknown';
          summary.bySpreadsheet[year].discoveredWorksheets.push(sheetTitle);
          summary.worksheetsDiscovered++;

          if (!isMonthlyWorksheet(sheetTitle)) {
            summary.bySpreadsheet[year].skippedWorksheets.push(sheetTitle);
            summary.nonMonthlyWorksheetsSkipped++;
            continue;
          }

          // Empty future worksheets
          const futureWorksheets = ['July 2026', 'August 2026', 'September 2026', 'October 2026', 'November 2026', 'December 2026'];
          if (year === '2026' && futureWorksheets.includes(sheetTitle)) {
            console.log(`Skipping future worksheet: ${sheetTitle}`);
            summary.bySpreadsheet[year].skippedWorksheets.push(sheetTitle);
            summary.nonMonthlyWorksheetsSkipped++;
            continue;
          }

          summary.bySpreadsheet[year].monthlyWorksheetsFound++;
          
          try {
            const response = await fetchWithRetry(() => sheets.spreadsheets.get({ spreadsheetId, ranges: [`${quoteSheetTitle(sheetTitle)}!A1:L10`], includeGridData: true }));
            const values = response.data.sheets?.[0]?.data?.[0]?.rowData;
            
            if (!values || values.length === 0) {
              addIssue({ spreadsheetYear: year, spreadsheetId, worksheet: sheetTitle, sourceRow: 1, orderId: null, field: 'A-L', code: 'MISSING_HEADER', message: 'Empty worksheet or missing header row', originalValue: null, originalRow: [] });
              summary.bySpreadsheet[year].emptyWorksheets.push(sheetTitle);
              summary.worksheetsWithMissingHeaders++;
              continue;
            }
            
            // Header detection
            let headerRowIndex = -1;
            let headerDetected = true;
            let dataStartRow = 1;
            let mappingMethod = 'header-detection';

            const headerlessWorksheets = ['October 2025', 'November 2025', 'December 2025'];
            if (year === '2025' && headerlessWorksheets.includes(sheetTitle)) {
                headerDetected = false;
                dataStartRow = 1;
                mappingMethod = 'fixed-column-fallback';
                console.log(`Worksheet ${sheetTitle}: Using fixed-column-fallback (no header)`);
            } else {
                const scanLimit = Math.min(10, values.length);
                for (let r = 0; r < scanLimit; r++) {
                    const rowValues = values[r].values || [];
                    const rowNormalized = Array.from({ length: 12 }, (_, columnIndex) => normalizeHeader(rowValues[columnIndex]?.formattedValue));
                    
                    let matchCount = 0;
                    for(let i=0; i<12; i++) {
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
                    const first10Rows = values.slice(0, scanLimit).map(row => row.values?.map(v => v.formattedValue || '') || []);
                    addIssue({ spreadsheetYear: year, spreadsheetId, worksheet: sheetTitle, sourceRow: 1, orderId: null, field: 'A-L', code: 'INVALID_HEADER', message: `Header not found in first 10 rows. Rows: ${JSON.stringify(first10Rows)}`, originalValue: null, originalRow: [] });
                    summary.bySpreadsheet[year].invalidHeaderWorksheets.push(sheetTitle);
                    summary.worksheetsWithInvalidHeaders++;
                    continue;
                }
                dataStartRow = headerRowIndex + 2;
                console.log(`Worksheet ${sheetTitle}: Detected header at row ${headerRowIndex + 1}`);
                summary.bySpreadsheet[year].headerDetails[sheetTitle] = { 
                    header: values[headerRowIndex].values?.map(v => v.formattedValue || '') || [],
                    mappingMethod,
                    dataStartRow
                };
            }

            // Refetch all rows from start row
            const responseFull = await fetchWithRetry(() => sheets.spreadsheets.values.get({ 
                spreadsheetId, 
                range: `${quoteSheetTitle(sheetTitle)}!A${headerDetected ? headerRowIndex + 1 : 1}:L`,
                valueRenderOption: 'FORMATTED_VALUE'
            }));
            const valuesFull = responseFull.data.values;
            if (!valuesFull) { continue; } 

            if (!headerDetected) {
                summary.bySpreadsheet[year].headerDetails[sheetTitle] = { 
                    header: null,
                    mappingMethod,
                    dataStartRow
                };
            }
            summary.bySpreadsheet[year].rowsReturned += valuesFull.length;

            summary.bySpreadsheet[year].processedWorksheets.push(sheetTitle);
            summary.monthlyWorksheetsProcessed++;

            // Rows
            // If header was detected, we start from index 1 (row immediately below header)
            // If no header, we start from index 0
            const startIndex = headerDetected ? 1 : 0;
            for (let i = startIndex; i < valuesFull.length; i++) {
              const row = Array.from({ length: 12 }, (_, columnIndex) => cleanCell(valuesFull[i][columnIndex]));
              const sourceRow = (headerDetected ? headerRowIndex + 1 : 0) + 1 + i;
              
              if (row.every(c => c === '')) {
                  summary.emptyRowsIgnored++;
                  summary.IGNORED_EMPTY_ROW++;
                  summary.bySpreadsheet[year].emptyRows++;
                  if (classificationSamples['IGNORED_EMPTY_ROW'].length < 5) {
                    classificationSamples['IGNORED_EMPTY_ROW'].push({
                      spreadsheetYear: year,
                      worksheet: sheetTitle,
                      sourceRow,
                      originalRow: row
                    });
                  }
                  allRows.push({
                    spreadsheetYear: year,
                    spreadsheetId,
                    worksheet: sheetTitle,
                    sourceRow,
                    classification: 'IGNORED_EMPTY_ROW',
                    originalRow: row
                  });
                  continue;
              }
              summary.bySpreadsheet[year].nonEmptyRows++;
              summary.nonEmptyRows++;

              let classification: RowClassification = 'READY_WITH_EXISTING_ID';
              const [deliv, name, phone, order, template, bahasa, addon, jenis, due, link, orderIdRaw, priceRaw] = row;
              const orderId = cleanCell(orderIdRaw);

              const priceRes = validatePrice(priceRaw);
              const dateRes = validateDate(due, summary.bySpreadsheet[year].locale);
              const statusRes = validateStatus(deliv);

              const isMissingId = orderId === '';
              const isMissingPrice = priceRes.status === 'blank';
              const isMissingName = name === '';
              const isInvalidPrice = priceRes.status === 'invalid';
              const isInvalidDate = dateRes.status === 'invalid' || dateRes.status === 'ambiguous';
              const isInvalidStatus = statusRes.status === 'invalid';

              // Suspicious/Manual Review detection
              const manualReviewReasons: string[] = [];
              if (isMissingName) manualReviewReasons.push('Missing Name');
              if (isInvalidDate) manualReviewReasons.push(`Invalid/Ambiguous Date: ${due}`);
              if (isInvalidStatus) manualReviewReasons.push(`Invalid Status: ${deliv}`);
              if (isInvalidPrice && priceRaw.includes('http')) manualReviewReasons.push('URL in Price column');
              else if (isInvalidPrice) manualReviewReasons.push(`Invalid Price format: ${priceRaw}`);
              
              // Check for potential shifts
              if (name.includes('http') || name.includes('www')) manualReviewReasons.push('Name looks like a URL (Shift?)');
              if (orderId.length > 30) manualReviewReasons.push('Order ID unusually long (Shift?)');

              // Duplicates
              if (!isMissingId) {
                const existing = orderIdMap.get(orderId);
                if (existing) {
                  const code = existing.spreadsheetYear !== year ? 'DUPLICATE_ACROSS_YEARS' : (existing.worksheet !== sheetTitle ? 'DUPLICATE_ACROSS_WORKSHEETS' : 'DUPLICATE_WITHIN_WORKSHEET');
                  manualReviewReasons.push(`${code}: Duplicate ID. First seen in ${existing.spreadsheetYear} / ${existing.worksheet} at row ${existing.sourceRow}`);
                  if (code === 'DUPLICATE_WITHIN_WORKSHEET') summary.duplicateIdsWithinWorksheet++;
                  if (code === 'DUPLICATE_ACROSS_WORKSHEETS') summary.duplicateIdsAcrossWorksheets++;
                  if (code === 'DUPLICATE_ACROSS_YEARS') summary.duplicateIdsAcrossYears++;
                } else {
                  orderIdMap.set(orderId, { spreadsheetYear: year, spreadsheetId, worksheet: sheetTitle, sourceRow });
                }
              }

              if (manualReviewReasons.length > 0) {
                classification = 'REQUIRES_MANUAL_REVIEW';
                summary.REQUIRES_MANUAL_REVIEW++;
                summary.bySpreadsheet[year].manualReviewRows++;
                addIssue({ spreadsheetYear: year, spreadsheetId, worksheet: sheetTitle, sourceRow, orderId: isMissingId ? null : orderId, field: 'ROW', code: 'REQUIRES_MANUAL_REVIEW', message: manualReviewReasons.join(' | '), originalValue: null, originalRow: row, classification, reasons: manualReviewReasons });
              } else {
                if (isMissingId && isMissingPrice) {
                  classification = 'MIGRATABLE_GENERATED_ID_AND_PRICE_NULL';
                  summary.MIGRATABLE_GENERATED_ID_AND_PRICE_NULL++;
                } else if (isMissingId) {
                  classification = 'MIGRATABLE_GENERATED_ID';
                  summary.MIGRATABLE_GENERATED_ID++;
                } else if (isMissingPrice) {
                  classification = 'MIGRATABLE_PRICE_NULL';
                  summary.MIGRATABLE_PRICE_NULL++;
                } else {
                  classification = 'READY_WITH_EXISTING_ID';
                  summary.READY_WITH_EXISTING_ID++;
                }
                summary.bySpreadsheet[year].migratableRows++;
              }

              const rowData = {
                spreadsheetYear: year,
                spreadsheetId,
                worksheet: sheetTitle,
                sourceRow,
                classification,
                reasons: classification === 'REQUIRES_MANUAL_REVIEW' ? manualReviewReasons : [],
                data: {
                  isDelivered: statusRes.value,
                  customerName: name,
                  customerPhone: phone,
                  customerOrder: order,
                  customerTemplate: template,
                  customerBahasa: bahasa,
                  customerAddOn: addon,
                  customerJenis: jenis,
                  originalDue: due,
                  normalizedDue: dateRes.normalizedDate,
                  orderLink: link,
                  orderId: isMissingId ? generateDeterministicId(spreadsheetId, sheetTitle, sourceRow) : orderId,
                  originalOrderId: isMissingId ? null : orderId,
                  generatedOrderId: isMissingId,
                  price: priceRes.value,
                  originalPrice: priceRaw
                },
                originalRow: row
              };
              allRows.push(rowData);

              // Metrics
              if (isMissingId) { summary.blankOrderIds++; summary.bySpreadsheet[year].missingIds++; } else { summary.bySpreadsheet[year].existingIds++; }
              if (isMissingPrice) { summary.blankPrices++; summary.bySpreadsheet[year].nullPrices++; } else if (!isInvalidPrice) { summary.bySpreadsheet[year].numericPrices++; }
              if (isMissingName) summary.blankCustomerNames++;
              if (isInvalidPrice) summary.invalidPrices++;
              if (dateRes.status === 'blank') summary.blankDueDates++;
              if (isInvalidDate) summary.invalidDueDates++;
              if (dateRes.status === 'ambiguous') summary.ambiguousDueDates++;
              if (isInvalidStatus) summary.invalidDeliveryStatuses++;

              // Collect samples
              if (classificationSamples[classification] && classificationSamples[classification].length < 5) {
                classificationSamples[classification].push({
                    spreadsheetYear: year,
                    worksheet: sheetTitle,
                    sourceRow,
                    data: {
                        isDelivered: statusRes.value,
                        customerName: name,
                        customerPhone: phone,
                        customerOrder: order,
                        customerTemplate: template,
                        customerBahasa: bahasa,
                        customerAddOn: addon,
                        customerJenis: jenis,
                        originalDue: due,
                        normalizedDue: dateRes.normalizedDate,
                        orderLink: link,
                        orderId: isMissingId ? generateDeterministicId(spreadsheetId, sheetTitle, sourceRow) : orderId,
                        originalOrderId: isMissingId ? null : orderId,
                        generatedOrderId: isMissingId,
                        price: priceRes.value,
                        originalPrice: priceRaw
                    },
                    originalRow: row
                });
              }
            }
          } catch (e: any) {
            addIssue({ spreadsheetYear: year, spreadsheetId, worksheet: sheetTitle, sourceRow: 0, orderId: null, field: 'N/A', code: 'WORKSHEET_READ_ERROR', message: `Read Error: ${e.message}`, originalValue: null, originalRow: [] });
            summary.bySpreadsheet[year].readErrors.push(sheetTitle);
          }
        }
        if (summary.bySpreadsheet[year].monthlyWorksheetsFound === 0) {
            addIssue({ spreadsheetYear: year, spreadsheetId, worksheet: 'N/A', sourceRow: 0, orderId: null, field: 'N/A', code: 'NO_MONTHLY_WORKSHEETS', message: 'No monthly worksheets found', originalValue: null, originalRow: [] });
        }
    } catch (e: any) {
        addIssue({ spreadsheetYear: year, spreadsheetId, worksheet: 'N/A', sourceRow: 0, orderId: null, field: 'N/A', code: 'SPREADSHEET_READ_ERROR', message: `Spreadsheet Read Error: ${e.message}`, originalValue: null, originalRow: [] });
    }
  }

  summary.totalIssues = issues.length;
  if (!fs.existsSync('migration-reports')) fs.mkdirSync('migration-reports');
  fs.writeFileSync(path.join('migration-reports', 'sheet-audit-errors.json'), JSON.stringify(issues, null, 2));
  fs.writeFileSync(path.join('migration-reports', 'sheet-audit-summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join('migration-reports', 'sheet-audit-samples.json'), JSON.stringify(classificationSamples, null, 2));
  fs.writeFileSync(path.join('migration-reports', 'audit-rows.json'), JSON.stringify(allRows, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Audit complete. Issues requiring attention: ${summary.REQUIRES_MANUAL_REVIEW}. Summary written to migration-reports/`);
  
  if (summary.REQUIRES_MANUAL_REVIEW > 0 || summary.worksheetsWithInvalidHeaders > 0) process.exitCode = 1;
}

auditSheets().catch((error) => {
  console.error('Fatal audit error:', error);
  process.exitCode = 1;
});
