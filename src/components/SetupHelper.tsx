import React, { useState } from 'react';
import { X, Copy, Check, Code } from 'lucide-react';
import { Toast } from './Toast';

interface SetupHelperProps {
  onClose: () => void;
  appLanguage: string;
}

export function SetupHelper({ onClose, appLanguage }: SetupHelperProps) {
  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const scriptCode = `function doPost(e) {
  var lock = LockService.getScriptLock();
  var hasLock = false;

  try {
    lock.waitLock(10000);
    hasLock = true;

    var data = JSON.parse(e.postData.contents);

    var spreadsheetId = data.spreadsheetId;
    var sheetNameEn = data.sheetNameEn;
    var sheetNameMs = data.sheetNameMs;
    var rowData = data.rowData;

    if (rowData && rowData[0] === "test_diagnostic_connection") {
      return jsonResponse({
        status: "success",
        message: "Diagnostic connection successful"
      });
    }

    if (!spreadsheetId) {
      return jsonResponse({
        status: "error",
        message: "Missing spreadsheetId"
      });
    }

    if (!Array.isArray(rowData)) {
      return jsonResponse({
        status: "error",
        message: "Missing or invalid rowData"
      });
    }

    var ss = SpreadsheetApp.openById(spreadsheetId);

    var sheet =
      ss.getSheetByName(sheetNameEn) ||
      ss.getSheetByName(sheetNameMs);

    if (!sheet) {
      sheet = ss.insertSheet(sheetNameEn);
    }

    ensureSheetSetup(sheet);

    if (rowData[0] === "TRUE" || rowData[0] === true) rowData[0] = true;
    if (rowData[0] === "FALSE" || rowData[0] === false) rowData[0] = false;

    var orderId = String(rowData[10] || "").trim();

    if (!orderId) {
      return jsonResponse({
        status: "error",
        message: "Missing Order ID in column K"
      });
    }

    var existingRow = findRowByOrderId(sheet, orderId);

    if (existingRow) {
      var existingCheckbox = sheet.getRange(existingRow, 1).getValue();
      if (rowData[0] === true || existingCheckbox === true || String(existingCheckbox).toUpperCase() === "TRUE") {
        rowData[0] = true;
      } else {
        rowData[0] = false;
      }

      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      applyRowTemplate(sheet, existingRow);

      return jsonResponse({
        status: "success",
        message: "Updated order " + orderId,
        orderId: orderId
      });
    }

    sheet.appendRow(rowData);

    var newRow = sheet.getLastRow();
    applyRowTemplate(sheet, newRow);

    return jsonResponse({
      status: "success",
      message: "Created order " + orderId,
      orderId: orderId
    });

  } catch (error) {
    return jsonResponse({
      status: "error",
      message: error.toString()
    });

  } finally {
    if (hasLock) lock.releaseLock();
  }
}

function ensureSheetSetup(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Done",
      "Nama",
      "Phone Number",
      "Order",
      "Template",
      "Bahasa",
      "Add On",
      "Jenis",
      "Due",
      "Link",
      "Order ID"
    ]);

    sheet.appendRow(["", "", "", "", "", "", "", "", "", "", ""]);
    applyRowTemplate(sheet, 2);
  }
}

function findRowByOrderId(sheet, orderId) {
  var lastRow = sheet.getLastRow();

  if (lastRow < 3) return null;

  var values = sheet.getRange(3, 11, lastRow - 2, 1).getValues();

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === orderId) {
      return i + 3;
    }
  }

  return null;
}

function applyRowTemplate(sheet, targetRow) {
  var lastCol = sheet.getLastColumn();

  if (targetRow === 2) {
    sheet.getRange(targetRow, 1).insertCheckboxes();
    return;
  }

  sheet.getRange(2, 1, 1, lastCol)
    .copyTo(
      sheet.getRange(targetRow, 1, 1, lastCol),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false
    );

  sheet.getRange(2, 1, 1, lastCol)
    .copyTo(
      sheet.getRange(targetRow, 1, 1, lastCol),
      SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
      false
    );
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var action = e.parameter.action;
  
  if (action === "update_delivered") {
    var orderId = e.parameter.orderId;
    var spreadsheetId = e.parameter.spreadsheetId;
    var isDelivered = e.parameter.isDelivered;
    var callback = e.parameter.callback;

    try {
      var ss = SpreadsheetApp.openById(spreadsheetId);
      var sheets = ss.getSheets();
      var updated = false;

      for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s];
        var row = findRowByOrderId(sheet, orderId);
        if (row) {
          sheet.getRange(row, 1).setValue(isDelivered === "true" || isDelivered === true);
          updated = true;
          break;
        }
      }

      var result = { status: "success", updated: updated };
      if (callback) {
        return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return jsonResponse(result);
    } catch(err) {
      var errResult = { status: "error", message: err.toString() };
      if (callback) {
        return ContentService.createTextOutput(callback + '(' + JSON.stringify(errResult) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return jsonResponse(errResult);
    }
  }

  if (action === "sync_recent") {
    var spreadsheetId = e.parameter.spreadsheetId;
    var callback = e.parameter.callback;

    try {
      var ss = SpreadsheetApp.openById(spreadsheetId);
      var sheets = ss.getSheets();
      var now = new Date();
      var monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      var monthNamesMs = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
      
      var targetSheets = [];
      for (var mOffset = 0; mOffset <= 1; mOffset++) {
        var d = new Date(now.getFullYear(), now.getMonth() + mOffset, 1);
        targetSheets.push(monthNamesEn[d.getMonth()] + " " + d.getFullYear());
        targetSheets.push(monthNamesMs[d.getMonth()] + " " + d.getFullYear());
      }
      
      var recentOrders = [];
      for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s];
        if (targetSheets.indexOf(sheet.getName()) !== -1) {
          var lastRow = sheet.getLastRow();
          if (lastRow >= 3) {
            var values = sheet.getRange(3, 1, lastRow - 2, 11).getValues();
            for (var r = 0; r < values.length; r++) {
              var rowData = values[r];
              var doneVal = String(rowData[0]).toLowerCase();
              var isDeliveredVal = (doneVal === "true" || doneVal === "1" || doneVal === "yes");
              recentOrders.push({
                isDelivered: isDeliveredVal,
                name: rowData[1] || "",
                phone: rowData[2] || "",
                order: rowData[3] || "",
                template: rowData[4] || "",
                bahasa: rowData[5] || "",
                addon: rowData[6] || "",
                jenis: rowData[7] || "",
                due: rowData[8] || "",
                link: String(rowData[9] || ""),
                orderId: String(rowData[10] || "")
              });
            }
          }
        }
      }
      
      var result = { status: "success", orders: recentOrders };
      if (callback) {
        return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return jsonResponse(result);
    } catch(err) {
      var errResult = { status: "error", message: err.toString() };
      if (callback) {
        return ContentService.createTextOutput(callback + '(' + JSON.stringify(errResult) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return jsonResponse(errResult);
    }
  }
  
  if (action === "get_link") {
    var orderId = e.parameter.orderId;
    var spreadsheetId = e.parameter.spreadsheetId;
    var callback = e.parameter.callback;
    
    try {
      var ss = SpreadsheetApp.openById(spreadsheetId);
      var sheets = ss.getSheets();
      
      var foundLink = "";
      for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s];
        var row = findRowByOrderId(sheet, orderId);
        if (row) {
          foundLink = sheet.getRange(row, 10).getValue(); // Column J is Link (10th column)
          break;
        }
      }
      
      var result = { status: "success", link: foundLink };
      if (callback) {
        return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return jsonResponse(result);
    } catch(err) {
      var errResult = { status: "error", message: err.toString() };
      if (callback) {
        return ContentService.createTextOutput(callback + '(' + JSON.stringify(errResult) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return jsonResponse(errResult);
    }
  }
  
  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}

function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface w-full max-w-2xl rounded-[24px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Code className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-[18px] font-bold text-text">
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
            <h3 className="font-bold text-blue-900 text-[15px]">
              {appLanguage === 'ms' ? 'Mengapa data tidak masuk ke sheet?' : 'Why is data not entering the sheet?'}
            </h3>
            <p className="text-[14px] text-blue-800 leading-relaxed">
              {appLanguage === 'ms' 
                ? 'Walaupun sambungan berjaya, web app URL anda mungkin menggunakan script lama yang tidak menyokong parameter ID spreadsheet atau sheet tab dinamis (bulan ini). Sila ikuti langkah di bawah untuk mengemas kini script anda.'
                : 'Even though the connection succeeds, your current web app URL might be using an old script that does not read the provided spreadsheet ID or dynamically create monthly tabs. Please replace your script with the code below.'}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-text text-[15px]">
                {appLanguage === 'ms' ? 'Langkah 1: Salin Kod (Copy Code)' : 'Step 1: Copy Code'}
              </h3>
              <button
                onClick={copyToClipboard}
                className="flex items-center space-x-2 px-4 py-2 bg-primary/10 text-primary font-bold text-[13px] rounded-lg hover:bg-primary/20 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{appLanguage === 'ms' ? (copied ? 'Tersalin!' : 'Salin Kod') : (copied ? 'Copied!' : 'Copy Code')}</span>
              </button>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
              <pre className="text-[12px] font-mono text-green-400 leading-relaxed">
                {scriptCode}
              </pre>
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-bold text-text text-[15px]">
              {appLanguage === 'ms' ? 'Langkah 2: Kemas Kini (Update Web App)' : 'Step 2: Update Web App'}
            </h3>
            <ul className="list-decimal pl-5 space-y-2 text-[14px] text-subtext leading-relaxed">
              <li>{appLanguage === 'ms' ? 'Pergi ke ' : 'Go to '} <strong>Extensions &gt; Apps Script</strong>.</li>
              <li>{appLanguage === 'ms' ? 'Gantikan semua kod lama dengan kod di atas.' : 'Replace all old code with the code above.'}</li>
              <li className="text-orange-600 dark:text-orange-400 font-bold bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg">
                ⚠️ {appLanguage === 'ms' ? 'JANGAN klik butang "Run" di dalam Apps Script editor. Ia akan ralat (e is undefined). Teruskan ke Publish / Deploy.' : 'DO NOT click the "Run" button inside the Apps Script editor for doPost. It will error (e is undefined). Just proceed to Publish / Deploy.'}
              </li>
              <li>{appLanguage === 'ms' ? 'Klik ' : 'Click '} <strong>Deploy &gt; New deployment</strong>.</li>
              <li>{appLanguage === 'ms' ? 'Pilih jenis ' : 'Select type '} <strong>Web app</strong>. Set "Execute as: Me" dan "Who has access: Anyone".</li>
              <li>{appLanguage === 'ms' ? 'Salin URL Web App yang baru dan masukkan ke dalam kod web app (webhookUrl).' : 'Copy the new Web App URL and place it in the web app.'}</li>
            </ul>
          </div>
        </div>
      </div>
      <Toast show={showToast} message={appLanguage === 'ms' ? "Kod berjaya disalin!" : "Code copied!"} />
    </div>
  );
}
