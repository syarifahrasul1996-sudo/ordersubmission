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
  var logs = [];
  try {
    logs.push("Parsing payload");
    var data = JSON.parse(e.postData.contents);
    var spreadsheetId = data.spreadsheetId;
    var sheetNameEn = data.sheetNameEn; // e.g. "June 2026"
    var sheetNameMs = data.sheetNameMs; // e.g. "Jun 2026"
    var rowData = data.rowData;
    
    if (!spreadsheetId) {
      return ContentService.createTextOutput(JSON.stringify({
        "status": "error", 
        "message": "Missing spreadsheetId",
        "logs": logs
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    logs.push("Opening spreadsheet ID: " + spreadsheetId);
    var ss = SpreadsheetApp.openById(spreadsheetId);
    
    // We try to find a tab matching the current month (English or Malay).
    var sheet = null;
    logs.push("Looking for: " + sheetNameEn + " or " + sheetNameMs);
    
    if (sheetNameEn) sheet = ss.getSheetByName(sheetNameEn);
    if (!sheet && sheetNameMs) sheet = ss.getSheetByName(sheetNameMs);
    
    // If not found, try just the month name without year (e.g. "June" or "Jun")
    if (!sheet && sheetNameEn) sheet = ss.getSheetByName(sheetNameEn.split(' ')[0]);
    if (!sheet && sheetNameMs) sheet = ss.getSheetByName(sheetNameMs.split(' ')[0]);
    
    // If absolutely no month tab is found, just use the first available tab
    if (!sheet) {
      logs.push("No matching month tab found. Using the first existing tab.");
      sheet = ss.getSheets()[0];
    }
    
    // Append row data properly from column A onwards (column 1)
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);
    logs.push("Appended row data starting at column A");
    
    // Auto-sort by Due date (Column I which is index 9)
    if (lastRow > 1) {
      try {
        // Sort from row 2 (assuming row 1 is headers), up to the last column (10)
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
             .sort({column: 9, ascending: true});
        logs.push("Sorted sheet by Due date (column I)");
      } catch (sortErr) {
        logs.push("Sorting failed: " + sortErr.toString());
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      "status": "success",
      "message": "Data added to " + sheet.getName() + " tab",
      "logs": logs
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    logs.push("Error caught: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      "status": "error",
      "message": error.toString(),
      "logs": logs
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
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
