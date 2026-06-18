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
    var contentStr = e.postData.contents;
    Logger.log("Payload string: " + contentStr);
    
    var data = JSON.parse(contentStr);
    Logger.log("Parsed data object: " + JSON.stringify(data));
    
    var spreadsheetId = data.spreadsheetId;
    var sheetNameEn = data.sheetNameEn;
    var sheetNameMs = data.sheetNameMs;
    var rowData = data.rowData;
    
    if (rowData && rowData[0] === 'test_diagnostic_connection') {
      return ContentService.createTextOutput(JSON.stringify({
        "status": "success", "message": "Diagnostic connection successful"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (!spreadsheetId) {
      return ContentService.createTextOutput(JSON.stringify({
        "status": "error", 
        "message": "Missing spreadsheetId",
        "logs": logs
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    logs.push("Opening spreadsheet ID: " + spreadsheetId);
    var ss = SpreadsheetApp.openById(spreadsheetId);
    
    var sheet = null;
    logs.push("Looking for: " + sheetNameEn + " or " + sheetNameMs);
    
    if (sheetNameEn) sheet = ss.getSheetByName(sheetNameEn);
    if (!sheet && sheetNameMs) sheet = ss.getSheetByName(sheetNameMs);
    if (!sheet && sheetNameEn) sheet = ss.getSheetByName(sheetNameEn.split(' ')[0]);
    if (!sheet && sheetNameMs) sheet = ss.getSheetByName(sheetNameMs.split(' ')[0]);
    
    if (!sheet) {
      logs.push("No matching month tab found. Using the first existing tab.");
      sheet = ss.getSheets()[0];
    }
    
    // Ensure we have enough columns for rowData
    if (sheet.getMaxColumns() < rowData.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), rowData.length - sheet.getMaxColumns());
    }
    
    // Provide a header if it's completely empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Done", "Nama", "Phone Number", "Order", "Template", "Bahasa", "Add On", "Jenis", "Due", "Link", "Order ID"]);
      // Column A checkbox
      sheet.getRange("A2:A").insertCheckboxes();
      
      // Column D (Order) validation
      var orderRule = SpreadsheetApp.newDataValidation().requireValueInList(["Resume", "Surat", "Edit PDF", "Lain2", "Edit Resume"], true).build();
      sheet.getRange("D2:D").setDataValidation(orderRule);
      
      // Column F (Bahasa) validation
      var bahasaRule = SpreadsheetApp.newDataValidation().requireValueInList(["Melayu", "English", "2 bahasa"], true).build();
      sheet.getRange("F2:F").setDataValidation(bahasaRule);
      
      // Column G (Add On) validation
      var addOnRule = SpreadsheetApp.newDataValidation().requireValueInList(["Cover Letter", "Softcopy Word", "Cover Letter + Softcopy Word", "Lain2"], true).build();
      sheet.getRange("G2:G").setDataValidation(addOnRule);
      
      // Column H (Jenis) validation
      var jenisRule = SpreadsheetApp.newDataValidation().requireValueInList(["Tak Urgent", "Semi Urgent", "Urgent", "Super Urgent"], true).build();
      sheet.getRange("H2:H").setDataValidation(jenisRule);
    }
    
    var lastRow = sheet.getLastRow();
    logs.push("lastRow is " + lastRow + " and getMaxColumns is " + sheet.getMaxColumns());
    
    var inputName = String(rowData[1] || "").trim();
    var inputPhone = String(rowData[2] || "").trim();
    var inputOrderId = String(rowData[10] || "").trim();
    var updated = false;
    
    // Format checkbox correctly
    if (rowData[0] === "FALSE" || rowData[0] === "TRUE" || rowData[0] === false || rowData[0] === true) {
      rowData[0] = (rowData[0] === "TRUE" || rowData[0] === true);
    }
    
    if (lastRow > 1) {
      // Find matching row
      var searchLimit = lastRow - 1;
      var dataRange = sheet.getRange(2, 1, Math.max(1, searchLimit), Math.max(sheet.getLastColumn(), rowData.length));
      var sheetData = dataRange.getValues();
      
      for (var i = 0; i < sheetData.length; i++) {
        var rowOrderId = String(sheetData[i][10] || "").trim();
        var rowName = String(sheetData[i][1] || "").trim();
        var rowPhone = String(sheetData[i][2] || "").trim();
        
        var isMatch = false;
        if (inputOrderId && rowOrderId === inputOrderId) {
           isMatch = true;
           logs.push("Matched by Order ID: " + inputOrderId);
        } else if (!inputOrderId && rowName === inputName && rowPhone === inputPhone) {
           isMatch = true;
           logs.push("Matched by Name + Phone");
        }
        
        if (isMatch) {
          var updateRowIndex = i + 2;
          var existingCheckbox = sheetData[i][0];
          rowData[0] = existingCheckbox; // Preserve existing checkbox state
          
          sheet.getRange(updateRowIndex, 1, 1, rowData.length).setValues([rowData]);
          logs.push("Updated existing record at row " + updateRowIndex);
          
          if (updateRowIndex > 2) {
            applyRowTemplate(sheet, updateRowIndex);
          }
          
          updated = true;
          break;
        }
      }
    }
    
    if (!updated) {
      sheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);
      logs.push("Appended new record at row " + (lastRow + 1));
      
      if (lastRow + 1 > 2) {
        applyRowTemplate(sheet, lastRow + 1);
      } else {
        sheet.getRange(lastRow + 1, 1).insertCheckboxes();
      }
    }
    
    if (sheet.getLastRow() > 1) {
      try {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
             .sort({column: 9, ascending: true});
        logs.push("Sorted sheet by Due date (column I)");
      } catch (sortErr) {
        logs.push("Sorting failed: " + sortErr.toString());
      }
    }
    
    var responseJSON = JSON.stringify({
      "status": "success",
      "message": "Data saved to " + sheet.getName(),
      "logs": logs
    });
    Logger.log("Returning success response: " + responseJSON);
    return ContentService.createTextOutput(responseJSON).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    logs.push("Error caught: " + error.toString());
    var errJSON = JSON.stringify({
      "status": "error",
      "message": error.toString(),
      "logs": logs
    });
    Logger.log("Returning error response: " + errJSON);
    return ContentService.createTextOutput(errJSON).setMimeType(ContentService.MimeType.JSON);
  }
}

function applyRowTemplate(sheet, targetRow) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;

  sheet.getRange(2, 1, 1, lastCol)
    .copyTo(
      sheet.getRange(targetRow, 1),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false
    );

  sheet.getRange(2, 1, 1, lastCol)
    .copyTo(
      sheet.getRange(targetRow, 1),
      SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
      false
    );
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
