function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var spreadsheetId = data.spreadsheetId;
    var sheetName = data.sheetName;
    var rowData = data.rowData;
    
    if (!spreadsheetId) {
      return ContentService.createTextOutput(JSON.stringify({
        "status": "error", 
        "message": "Missing spreadsheetId"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(sheetName);
    
    // Create tab if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      
      // Auto-add headers based on the current sheet format
      sheet.appendRow(["Status", "Nama", "Phone Number", "Order", "Template", "Bahasa", "Add On", "Jenis", "Due", "Link"]);
      sheet.setFrozenRows(1);
      
      // Format first column as checkbox
      var rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
      sheet.getRange("A2:A").setDataValidation(rule);
    }
    
    // Append the row
    sheet.appendRow(rowData);
    
    return ContentService.createTextOutput(JSON.stringify({
      "status": "success",
      "message": "Row added to " + sheetName
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      "status": "error",
      "message": error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle preflight CORS requests if needed
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}
