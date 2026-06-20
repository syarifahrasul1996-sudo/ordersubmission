function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    if (!e.postData || !e.postData.contents) {
      return jsonResponse("error", "Missing POST body");
    }

    var data = JSON.parse(e.postData.contents);

    var spreadsheetId = data.spreadsheetId;
    var sheetNameEn = data.sheetNameEn;
    var sheetNameMs = data.sheetNameMs;
    var rowData = data.rowData;

    if (rowData && rowData[0] === "test_diagnostic_connection") {
      return jsonResponse("success", "Diagnostic connection successful");
    }

    if (!spreadsheetId) {
      return jsonResponse("error", "Missing spreadsheetId");
    }

    if (!Array.isArray(rowData)) {
      return jsonResponse("error", "Missing or invalid rowData");
    }

    if (rowData.length < 11) {
      return jsonResponse("error", "rowData must contain at least 11 columns");
    }

    var orderId = String(rowData[10] || "").trim();

    if (!orderId) {
      return jsonResponse("error", "Missing Order ID in column K");
    }

    var ss = SpreadsheetApp.openById(spreadsheetId);

    var sheet =
      ss.getSheetByName(sheetNameEn) ||
      ss.getSheetByName(sheetNameMs);

    if (!sheet) {
      sheet = ss.insertSheet(sheetNameEn || sheetNameMs || "Orders");
    }

    ensureSheetSetup(sheet);

    rowData[0] = normalizeCheckboxValue(rowData[0]);

    var existingRow = findRowByOrderId(sheet, orderId);

    if (existingRow) {
      var existingCheckbox = sheet.getRange(existingRow, 1).getValue();
      // If either the webapp status is true or the sheet checkbox is already checked, keep/mark it as true.
      if (rowData[0] === true || existingCheckbox === true || String(existingCheckbox).toUpperCase() === "TRUE") {
        rowData[0] = true;
      } else {
        rowData[0] = false;
      }

      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      applyRowTemplate(sheet, existingRow);

      return jsonResponse("success", "Updated order " + orderId, {
        orderId: orderId
      });
    }

    sheet.appendRow(rowData);

    var newRow = sheet.getLastRow();
    applyRowTemplate(sheet, newRow);

    return jsonResponse("success", "Created order " + orderId, {
      orderId: orderId
    });

  } catch (error) {
    return jsonResponse("error", error.toString());

  } finally {
    try {
      lock.releaseLock();
    } catch (err) {}
  }
}

function doGet(e) {
  var action = e.parameter.action;

  if (action === "sync_recent") {
    return syncRecentOrders(e);
  }

  if (action === "get_link") {
    return getOrderLink(e);
  }

  if (action === "update_delivered") {
    return updateDeliveredStatus(e);
  }

  if (action === "search_database") {
    return searchDatabase(e);
  }

  return ContentService
    .createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function syncRecentOrders(e) {
  var spreadsheetId = e.parameter.spreadsheetId;
  var callback = e.parameter.callback;

  try {
    if (!spreadsheetId) {
      return jsonOrJsonp(callback, {
        status: "error",
        message: "Missing spreadsheetId"
      });
    }

    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();

    var targetSheets = getCurrentAndNextMonthSheetNames();
    var recentOrders = [];

    sheets.forEach(function(sheet) {
      if (targetSheets.indexOf(sheet.getName()) === -1) return;

      var lastRow = sheet.getLastRow();

      if (lastRow < 2) return;

      var values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();

      values.forEach(function(rowData) {
        var dueDate = parseDueDate(rowData[8]);

        if (!dueDate) return;

        var today = new Date();
        today.setHours(0, 0, 0, 0);

        var startDate = new Date(today);
        startDate.setDate(today.getDate() - 2);

        var endDate = new Date(today);
        endDate.setDate(today.getDate() + 3);
        endDate.setHours(23, 59, 59, 999);

        if (dueDate < startDate || dueDate > endDate) return;

        recentOrders.push({
          isDelivered: rowData[0] === true || String(rowData[0]).toLowerCase() === "true",
          name: rowData[1] || "",
          phone: rowData[2] || "",
          order: rowData[3] || "",
          template: rowData[4] || "",
          bahasa: rowData[5] || "",
          addon: rowData[6] || "",
          jenis: rowData[7] || "",
          due: formatDateValue(rowData[8]),
          link: String(rowData[9] || ""),
          orderId: String(rowData[10] || "")
        });
      });
    });

    return jsonOrJsonp(callback, {
      status: "success",
      orders: recentOrders
    });

  } catch (error) {
    return jsonOrJsonp(callback, {
      status: "error",
      message: error.toString()
    });
  }
}

function getOrderLink(e) {
  var spreadsheetId = e.parameter.spreadsheetId;
  var orderId = e.parameter.orderId;
  var callback = e.parameter.callback;

  try {
    if (!spreadsheetId) {
      return jsonOrJsonp(callback, {
        status: "error",
        message: "Missing spreadsheetId"
      });
    }

    if (!orderId) {
      return jsonOrJsonp(callback, {
        status: "error",
        message: "Missing orderId"
      });
    }

    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();

    var foundLink = "";

    for (var i = 0; i < sheets.length; i++) {
      var row = findRowByOrderId(sheets[i], orderId);

      if (row) {
        foundLink = String(sheets[i].getRange(row, 10).getValue() || "");
        break;
      }
    }

    return jsonOrJsonp(callback, {
      status: "success",
      link: foundLink
    });

  } catch (error) {
    return jsonOrJsonp(callback, {
      status: "error",
      message: error.toString()
    });
  }
}

function ensureSheetSetup(sheet) {
  var headers = [
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
  ];

  if (sheet.getLastRow() < 1) {
    sheet.appendRow(headers);
  } else {
    var existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    var isHeaderMissing = existingHeaders.join("").trim() === "";

    if (isHeaderMissing) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  if (sheet.getLastRow() < 2) {
    sheet.appendRow(["", "", "", "", "", "", "", "", "", "", ""]);
  }

  sheet.getRange(2, 1).insertCheckboxes();
  sheet.setFrozenRows(1);
}

function findRowByOrderId(sheet, orderId) {
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) return null;

  var values = sheet.getRange(2, 11, lastRow - 1, 1).getValues();

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === String(orderId).trim()) {
      return i + 2;
    }
  }

  return null;
}

function applyRowTemplate(sheet, targetRow) {
  var lastCol = Math.max(sheet.getLastColumn(), 11);

  if (targetRow === 2) {
    sheet.getRange(targetRow, 1).insertCheckboxes();
    return;
  }

  sheet.getRange(2, 1, 1, lastCol).copyTo(
    sheet.getRange(targetRow, 1, 1, lastCol),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false
  );

  sheet.getRange(2, 1, 1, lastCol).copyTo(
    sheet.getRange(targetRow, 1, 1, lastCol),
    SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
    false
  );

  sheet.getRange(targetRow, 1).insertCheckboxes();
}

function normalizeCheckboxValue(value) {
  if (value === true || String(value).toUpperCase() === "TRUE") return true;
  if (value === false || String(value).toUpperCase() === "FALSE") return false;
  return false;
}

function getCurrentAndNextMonthSheetNames() {
  var now = new Date();

  var monthNamesEn = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  var monthNamesMs = [
    "Januari", "Februari", "Mac", "April", "Mei", "Jun",
    "Julai", "Ogos", "September", "Oktober", "November", "Disember"
  ];

  var names = [];

  for (var offset = 0; offset <= 1; offset++) {
    var date = new Date(now.getFullYear(), now.getMonth() + offset, 1);

    names.push(monthNamesEn[date.getMonth()] + " " + date.getFullYear());
    names.push(monthNamesMs[date.getMonth()] + " " + date.getFullYear());
  }

  return names;
}

function formatDateValue(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );
  }

  return value || "";
}

function jsonResponse(status, message, extra) {
  var obj = {
    status: status,
    message: message
  };

  if (extra) {
    Object.keys(extra).forEach(function(key) {
      obj[key] = extra[key];
    });
  }

  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonOrJsonp(callback, obj) {
  var output = JSON.stringify(obj);

  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + output + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(output)
    .setMimeType(ContentService.MimeType.JSON);
}

function parseDueDate(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value;
  }

  var text = String(value || "").trim();
  if (!text) return null;

  var match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;

  var day = Number(match[1]);
  var month = Number(match[2]) - 1;
  var year = Number(match[3]);

  return new Date(year, month, day);
}

function updateDeliveredStatus(e) {
  var spreadsheetId = e.parameter.spreadsheetId;
  var orderId = e.parameter.orderId;
  var isDelivered = e.parameter.isDelivered === "true";
  var callback = e.parameter.callback;

  try {
    if (!spreadsheetId) {
      return jsonOrJsonp(callback, {
        status: "error",
        message: "Missing spreadsheetId"
      });
    }

    if (!orderId) {
      return jsonOrJsonp(callback, {
        status: "error",
        message: "Missing orderId"
      });
    }

    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();

    for (var i = 0; i < sheets.length; i++) {
      var row = findRowByOrderId(sheets[i], orderId);

      if (row) {
        sheets[i].getRange(row, 1).setValue(isDelivered);

        return jsonOrJsonp(callback, {
          status: "success",
          orderId: orderId,
          isDelivered: isDelivered
        });
      }
    }

    return jsonOrJsonp(callback, {
      status: "error",
      message: "Order ID not found"
    });

  } catch (error) {
    return jsonOrJsonp(callback, {
      status: "error",
      message: error.toString()
    });
  }
}

function searchDatabase(e) {
  var spreadsheetId = e.parameter.spreadsheetId;
  var query = e.parameter.query;
  var callback = e.parameter.callback;

  try {
    if (!spreadsheetId) {
      return jsonOrJsonp(callback, {
        status: "error",
        message: "Missing spreadsheetId"
      });
    }

    if (!query) {
      return jsonOrJsonp(callback, {
        status: "success",
        orders: []
      });
    }

    var cleanQuery = String(query).toLowerCase().trim();
    if (!cleanQuery) {
      return jsonOrJsonp(callback, {
        status: "success",
        orders: []
      });
    }

    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();
    var matchingOrders = [];

    sheets.forEach(function(sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      var lastCol = sheet.getLastColumn();
      if (lastCol < 11) {
        lastCol = 11;
      }

      var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      values.forEach(function(rowData) {
        var nameVal = String(rowData[1] || "").toLowerCase();
        var phoneVal = String(rowData[2] || "").toLowerCase();
        var orderIdVal = String(rowData[10] || "").toLowerCase();

        if (nameVal.indexOf(cleanQuery) !== -1 ||
            phoneVal.indexOf(cleanQuery) !== -1 ||
            orderIdVal.indexOf(cleanQuery) !== -1) {
          
          matchingOrders.push({
            isDelivered: rowData[0] === true || String(rowData[0]).toLowerCase() === "true",
            name: rowData[1] || "",
            phone: rowData[2] || "",
            order: rowData[3] || "",
            template: rowData[4] || "",
            bahasa: rowData[5] || "",
            addon: rowData[6] || "",
            jenis: rowData[7] || "",
            due: formatDateValue(rowData[8]),
            link: String(rowData[9] || ""),
            orderId: String(rowData[10] || ""),
            sheetName: sheet.getName()
          });
        }
      });
    });

    return jsonOrJsonp(callback, {
      status: "success",
      orders: matchingOrders
    });

  } catch (error) {
    return jsonOrJsonp(callback, {
      status: "error",
      message: error.toString()
    });
  }
}
