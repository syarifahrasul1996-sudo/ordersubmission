import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Code } from 'lucide-react';
import { Toast } from './Toast';

interface SetupHelperProps {
  onClose: () => void;
  appLanguage: string;
}

export function SetupHelper({ onClose, appLanguage }: SetupHelperProps) {
  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const scriptCode = `// Required Script Properties (Project Settings -> Script Properties):
// 1. APPS_SCRIPT_SECRET: Random secret shared with your web app (Settings -> APPS_SCRIPT_SECRET)
// 2. ALLOWED_SPREADSHEET_IDS: Comma-separated Google Sheet IDs permitted by this script
// 3. ALLOWED_EMAILS (optional): Comma-separated Google emails if authenticating via Google ID token

function safeStringCompare(a, b) {
  var strA = String(a || "");
  var strB = String(b || "");
  if (!strA || !strB || strA.length !== strB.length) return false;
  var mismatch = 0;
  for (var i = 0; i < strA.length; i++) {
    mismatch |= strA.charCodeAt(i) ^ strB.charCodeAt(i);
  }
  return mismatch === 0;
}

function getAllowedEmailSet(props) {
  var raw = String(props.getProperty("ALLOWED_EMAILS") || "");
  var emails = [];
  if (raw) {
    raw.split(",").forEach(function(item) {
      var trimmed = item.trim().toLowerCase();
      if (trimmed) emails.push(trimmed);
    });
  }
  return emails;
}

function verifyGoogleIdToken(idToken, allowedEmails) {
  if (!idToken || allowedEmails.length === 0) return false;
  try {
    var resp = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return false;
    var payload = JSON.parse(resp.getContentText() || "{}");
    var verified = payload.email_verified === true || payload.email_verified === "true";
    var email = String(payload.email || "").trim().toLowerCase();
    return Boolean(verified && email && allowedEmails.indexOf(email) !== -1);
  } catch (err) {
    return false;
  }
}

function verifyRequestAuth(params, bodyData) {
  var props = PropertiesService.getScriptProperties();
  var configuredSecret = String(props.getProperty("APPS_SCRIPT_SECRET") || "").trim();
  var allowedEmails = getAllowedEmailSet(props);

  if (!configuredSecret && allowedEmails.length === 0) {
    return { ok: false, message: "Unauthorized: Configure APPS_SCRIPT_SECRET or ALLOWED_EMAILS in Script Properties." };
  }

  var providedSecret = String((bodyData && bodyData.secret) || (params && params.secret) || "").trim();
  if (configuredSecret && providedSecret && safeStringCompare(configuredSecret, providedSecret)) {
    return { ok: true };
  }

  var providedIdToken = String((bodyData && bodyData.idToken) || (params && params.idToken) || "").trim();
  if (providedIdToken && verifyGoogleIdToken(providedIdToken, allowedEmails)) {
    return { ok: true };
  }

  return { ok: false, message: "Unauthorized: Invalid or missing credentials." };
}

function validateAllowedSpreadsheet(spreadsheetId) {
  var cleanId = String(spreadsheetId || "").trim();
  if (!cleanId) return { ok: false, message: "Missing spreadsheetId" };

  var raw = String(PropertiesService.getScriptProperties().getProperty("ALLOWED_SPREADSHEET_IDS") || "");
  var allowedIds = raw.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active && allowedIds.indexOf(active.getId()) === -1) allowedIds.push(active.getId());
  } catch (err) {}

  if (allowedIds.length === 0 || allowedIds.indexOf(cleanId) === -1) {
    return { ok: false, message: "Forbidden: spreadsheetId is not in ALLOWED_SPREADSHEET_IDS." };
  }
  return { ok: true, spreadsheetId: cleanId };
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var hasLock = false;

  try {
    lock.waitLock(10000);
    hasLock = true;

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: "error", message: "Missing POST body" });
    }

    var data = JSON.parse(e.postData.contents);
    var authResult = verifyRequestAuth(e.parameter || {}, data);
    if (!authResult.ok) {
      return jsonResponse({ status: "error", code: 401, message: authResult.message });
    }

    var action = data.action || "update_order";
    if (action === "test_diagnostic_connection" || (data.rowData && data.rowData[0] === "test_diagnostic_connection")) {
      return jsonResponse({ status: "success", message: "Diagnostic connection successful" });
    }

    var sheetCheck = validateAllowedSpreadsheet(data.spreadsheetId);
    if (!sheetCheck.ok) {
      return jsonResponse({ status: "error", code: 403, message: sheetCheck.message });
    }

    var ss = SpreadsheetApp.openById(sheetCheck.spreadsheetId);
    var sheets = ss.getSheets();

    if (action === "delete_order") {
      var orderId = data.orderId;
      if (!orderId) return jsonResponse({ status: "error", message: "Missing orderId" });
      var deleted = false;
      for (var s = 0; s < sheets.length; s++) {
        var row = findRowByOrderId(sheets[s], orderId);
        if (row) {
          sheets[s].deleteRow(row);
          deleted = true;
          break;
        }
      }
      return jsonResponse({ status: "success", deleted: deleted });
    }

    if (action === "update_delivered") {
      var orderId = data.orderId;
      var isDelivered = data.isDelivered === true || data.isDelivered === "true" || data.isDelivered === 1 || data.isDelivered === "1";
      if (!orderId) return jsonResponse({ status: "error", message: "Missing orderId" });
      var updated = false;
      for (var s = 0; s < sheets.length; s++) {
        var row = findRowByOrderId(sheets[s], orderId);
        if (row) {
          sheets[s].getRange(row, 1).setValue(isDelivered);
          updated = true;
          break;
        }
      }
      return jsonResponse({ status: "success", updated: updated, isDelivered: isDelivered });
    }

    var sheetNameEn = data.sheetNameEn;
    var sheetNameMs = data.sheetNameMs;
    var rowData = data.rowData;

    if (!Array.isArray(rowData)) {
      return jsonResponse({ status: "error", message: "Missing or invalid rowData" });
    }

    var sheet = ss.getSheetByName(sheetNameEn) || ss.getSheetByName(sheetNameMs);
    if (!sheet) {
      sheet = ss.insertSheet(sheetNameEn);
    }

    ensureSheetSetup(sheet);

    if (rowData[0] === "TRUE" || rowData[0] === true) rowData[0] = true;
    if (rowData[0] === "FALSE" || rowData[0] === false) rowData[0] = false;

    var orderId = String(rowData[10] || "").trim();
    if (!orderId) {
      return jsonResponse({ status: "error", message: "Missing Order ID in column K" });
    }

    var existingRow = findRowByOrderId(sheet, orderId);
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      applyRowTemplate(sheet, existingRow);
      return jsonResponse({ status: "success", message: "Updated order " + orderId, orderId: orderId });
    }

    sheet.appendRow(rowData);
    var newRow = sheet.getLastRow();
    applyRowTemplate(sheet, newRow);

    return jsonResponse({ status: "success", message: "Created order " + orderId, orderId: orderId });
  } catch (error) {
    return jsonResponse({ status: "error", message: error.toString() });
  } finally {
    if (hasLock) lock.releaseLock();
  }
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = params.action;

  var authResult = verifyRequestAuth(params, null);
  if (!authResult.ok) {
    return jsonResponse({ status: "error", code: 401, message: authResult.message });
  }

  if (action === "update_delivered" || action === "delete_order" || action === "update_order") {
    return jsonResponse({ status: "error", code: 405, message: "Method Not Allowed: Mutations must use HTTP POST." });
  }

  var sheetCheck = validateAllowedSpreadsheet(params.spreadsheetId);
  if (!sheetCheck.ok) {
    return jsonResponse({ status: "error", code: 403, message: sheetCheck.message });
  }

  // Read-only actions: sync_recent, get_dashboard_orders, search_database, get_link
  var ss = SpreadsheetApp.openById(sheetCheck.spreadsheetId);
  var sheets = ss.getSheets();

  if (action === "get_link") {
    var orderId = params.orderId;
    var foundLink = "";
    for (var s = 0; s < sheets.length; s++) {
      var row = findRowByOrderId(sheets[s], orderId);
      if (row) {
        foundLink = String(sheets[s].getRange(row, 10).getValue() || "");
        break;
      }
    }
    return jsonResponse({ status: "success", link: foundLink });
  }

  if (action === "sync_recent" || action === "get_dashboard_orders" || action === "search_database") {
    var query = (params.query || "").trim().toLowerCase();
    var recentOrders = [];
    for (var s = 0; s < sheets.length; s++) {
      var sheet = sheets[s];
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) continue;
      var values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
      for (var r = 0; r < values.length; r++) {
        var rowData = values[r];
        if (!rowData[1] && !rowData[2] && !rowData[3]) continue;
        var nameCheck = String(rowData[1]).trim().toLowerCase();
        if (nameCheck === "nama" || nameCheck === "name" || nameCheck === "customer name") continue;
        var doneVal = String(rowData[0]).trim().toLowerCase();
        var isDeliveredVal = (doneVal === "true" || doneVal === "1" || rowData[0] === true);
        var nameVal = String(rowData[1] || "");
        var phoneVal = String(rowData[2] || "");
        var orderVal = String(rowData[3] || "");
        var templateVal = String(rowData[4] || "");
        var orderIdVal = String(rowData[10] || "");
        var bayaranVal = rowData[11] !== undefined && rowData[11] !== null ? rowData[11] : "";
        if (query && (nameVal + " " + phoneVal + " " + orderVal + " " + templateVal + " " + orderIdVal).toLowerCase().indexOf(query) === -1) continue;
        recentOrders.push({
          isDelivered: isDeliveredVal, name: nameVal, phone: phoneVal, order: orderVal,
          template: templateVal, bahasa: String(rowData[5] || ""), addon: String(rowData[6] || ""),
          jenis: String(rowData[7] || ""), due: String(rowData[8] || ""), link: String(rowData[9] || ""),
          orderId: orderIdVal, bayaran: bayaranVal, price: bayaranVal
        });
      }
    }
    return jsonResponse({ status: "success", orders: recentOrders });
  }

  return jsonResponse({ status: "error", code: 400, message: "Unknown action" });
}

function ensureSheetSetup(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Done", "Nama", "Phone Number", "Order", "Template", "Bahasa", "Add On", "Jenis", "Due", "Link", "Order ID", "Bayaran"]);
    sheet.appendRow(["", "", "", "", "", "", "", "", "", "", "", ""]);
    applyRowTemplate(sheet, 2);
  }
}

function findRowByOrderId(sheet, orderId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 11, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === String(orderId).trim()) return i + 2;
  }
  return null;
}

function applyRowTemplate(sheet, targetRow) {
  var lastCol = sheet.getLastColumn();
  if (targetRow === 2) {
    sheet.getRange(targetRow, 1).insertCheckboxes();
    return;
  }
  sheet.getRange(2, 1, 1, lastCol).copyTo(sheet.getRange(targetRow, 1, 1, lastCol), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sheet.getRange(2, 1, 1, lastCol).copyTo(sheet.getRange(targetRow, 1, 1, lastCol), SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(scriptCode);
    setCopied(true);
    setShowToast(true);
    setTimeout(() => {
      setCopied(false);
      setShowToast(false);
    }, 2000);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Code className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-text">
              {appLanguage === 'ms' ? 'Persediaan Google Apps Script' : 'Google Apps Script Setup'}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-subtext hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto w-full flex-1 space-y-6">
          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-3">
            <h3 className="font-bold text-blue-900 text-base">
              {appLanguage === 'ms' ? 'Mengapa data tidak masuk ke sheet?' : 'Why is data not entering the sheet?'}
            </h3>
            <p className="text-sm text-blue-800 leading-relaxed">
              {appLanguage === 'ms' 
                ? 'Walaupun sambungan berjaya, web app URL anda mungkin menggunakan script lama yang tidak menyokong parameter ID spreadsheet atau sheet tab dinamis (bulan ini). Sila ikuti langkah di bawah untuk mengemas kini script anda.'
                : 'Even though the connection succeeds, your current web app URL might be using an old script that does not read the provided spreadsheet ID or dynamically create monthly tabs. Please replace your script with the code below.'}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-text text-base">
                {appLanguage === 'ms' ? 'Langkah 1: Salin Kod (Copy Code)' : 'Step 1: Copy Code'}
              </h3>
              <button
                onClick={copyToClipboard}
                className="flex items-center space-x-2 px-4 py-2 bg-primary/10 text-primary font-bold text-sm rounded-lg hover:bg-primary/20 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{appLanguage === 'ms' ? (copied ? 'Tersalin!' : 'Salin Kod') : (copied ? 'Copied!' : 'Copy Code')}</span>
              </button>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
              <pre className="text-xs font-mono text-green-400 leading-relaxed">
                {scriptCode}
              </pre>
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-bold text-text text-base">
              {appLanguage === 'ms' ? 'Langkah 2: Kemas Kini (Update Web App)' : 'Step 2: Update Web App'}
            </h3>
            <ul className="list-decimal pl-5 space-y-2 text-sm text-subtext leading-relaxed">
              <li>{appLanguage === 'ms' ? 'Pergi ke ' : 'Go to '} <strong>Extensions &gt; Apps Script</strong>.</li>
              <li>{appLanguage === 'ms' ? 'Gantikan semua kod lama dengan kod selamat di atas (atau apps-script.js).' : 'Replace all old code with the secured code above (or apps-script.js).'}</li>
              <li>
                {appLanguage === 'ms'
                  ? 'Buka Project Settings > Script Properties dan tambah APPS_SCRIPT_SECRET (kata laluan rawak) dan ALLOWED_SPREADSHEET_IDS (ID Sheet anda, dipisahkan koma).'
                  : 'Open Project Settings > Script Properties and add APPS_SCRIPT_SECRET (a random secret) and ALLOWED_SPREADSHEET_IDS (comma-separated allowed Sheet IDs).'}
              </li>
              <li className="text-orange-600 dark:text-orange-400 font-bold bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg">
                ⚠️ {appLanguage === 'ms' ? 'JANGAN klik butang "Run" di dalam Apps Script editor. Teruskan ke Deploy.' : 'DO NOT click the "Run" button inside the Apps Script editor for doPost. Proceed directly to Deploy.'}
              </li>
              <li>{appLanguage === 'ms' ? 'Klik ' : 'Click '} <strong>Deploy &gt; New deployment</strong> &rarr; <strong>Web app</strong> ("Execute as: Me", "Who has access: Anyone").</li>
              <li>{appLanguage === 'ms' ? 'Salin URL Web App serta APPS_SCRIPT_SECRET dan masukkan di Sejarah > Tetapan Database.' : 'Paste the Web App URL and APPS_SCRIPT_SECRET into History > Database Settings.'}</li>
            </ul>
          </div>
        </div>
      </div>
      <Toast show={showToast} message={appLanguage === 'ms' ? "Kod berjaya disalin!" : "Code copied!"} />
    </div>,
    document.body
  );
}
