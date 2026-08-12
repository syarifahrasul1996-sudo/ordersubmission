function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    if (!e.postData || !e.postData.contents) {
      return jsonResponse("error", "Missing POST body");
    }

    var data = JSON.parse(e.postData.contents);
    var action = data.action || "update_order";
    var spreadsheetId = data.spreadsheetId;

    if (data.rowData && data.rowData[0] === "test_diagnostic_connection") {
      return jsonResponse("success", "Diagnostic connection successful");
    }

    if (!spreadsheetId) {
      return jsonResponse("error", "Missing spreadsheetId");
    }

    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();

    if (action === "delete_order") {
      var orderId = data.orderId;
      if (!orderId) {
        return jsonResponse("error", "Missing orderId");
      }
      var deleted = false;
      for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s];
        var row = findRowByOrderId(sheet, orderId);
        if (row) {
          sheet.deleteRow(row);
          deleted = true;
          break;
        }
      }
      return jsonResponse("success", "Deleted order " + orderId, { deleted: deleted });
    }

    if (action === "update_delivered") {
      var orderId = data.orderId;
      var isDelivered = data.isDelivered === true || data.isDelivered === "true" || data.isDelivered === 1 || data.isDelivered === "1";
      if (!orderId) {
        return jsonResponse("error", "Missing orderId");
      }
      var updated = false;
      for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s];
        var row = findRowByOrderId(sheet, orderId);
        if (row) {
          sheet.getRange(row, 1).setValue(isDelivered);
          updated = true;
          break;
        }
      }
      return jsonResponse("success", "Updated delivered status for " + orderId, { updated: updated, isDelivered: isDelivered });
    }

    if (action === "update_order") {
      var rowData = data.rowData;
      if (!rowData || !Array.isArray(rowData)) {
        return jsonResponse("error", "Missing or invalid rowData");
      }
      if (rowData.length < 11) {
        return jsonResponse("error", "rowData must contain at least 11 columns");
      }

      var orderId = String(rowData[10] || "").trim();
      var oldOrderId = String(data.oldOrderId || "").trim();

      var foundRow = null;
      var foundSheet = null;

      // 1. Try finding by orderId
      if (orderId && orderId.indexOf("SYNC-") !== 0) {
        for (var s = 0; s < sheets.length; s++) {
          var sheet = sheets[s];
          var row = findRowByOrderId(sheet, orderId);
          if (row) {
            foundRow = row;
            foundSheet = sheet;
            break;
          }
        }
      }

      // 2. Try oldOrderId
      if (!foundRow && oldOrderId) {
        for (var s = 0; s < sheets.length; s++) {
          var sheet = sheets[s];
          var row = findRowByOrderId(sheet, oldOrderId);
          if (row) {
            foundRow = row;
            foundSheet = sheet;
            break;
          }
        }
      }

      // 3. Try fallback key
      if (!foundRow) {
        var name = rowData[1];
        var phone = rowData[2];
        var order = rowData[3];
        var due = rowData[8];
        for (var s = 0; s < sheets.length; s++) {
          var sheet = sheets[s];
          var row = findRowByFallbackKey(sheet, name, phone, due, order);
          if (row) {
            foundRow = row;
            foundSheet = sheet;
            break;
          }
        }
      }

      var finalOrderId = orderId;
      var isUpgraded = false;

      if (foundRow && foundSheet) {
        var currentCellId = String(foundSheet.getRange(foundRow, 11).getValue() || "").trim();
        if (!currentCellId || currentCellId.indexOf("SYNC-") === 0) {
          if (orderId && orderId.indexOf("SYNC-") !== 0) {
            finalOrderId = orderId;
          } else {
            finalOrderId = generateAppsScriptOrderId();
          }
          isUpgraded = true;
        } else {
          finalOrderId = currentCellId;
        }
        rowData[10] = finalOrderId;
      } else {
        if (!finalOrderId || finalOrderId.indexOf("SYNC-") === 0) {
          finalOrderId = generateAppsScriptOrderId();
          isUpgraded = true;
        }
        rowData[10] = finalOrderId;
      }

      rowData[0] = normalizeCheckboxValue(rowData[0]);
      rowData[2] = formatPhoneForSheet(rowData[2]);

      // Determine correct sheet name
      var due = rowData[8];
      var targetDate = new Date();
      if (due) {
        var parsedDObj = parseDueDate(due);
        if (parsedDObj) {
          targetDate = parsedDObj;
        }
      }
      var monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      var targetSheetEn = monthNamesEn[targetDate.getMonth()] + " " + targetDate.getFullYear();
      var targetSheet = ss.getSheetByName(targetSheetEn);
      if (!targetSheet) {
        var monthNamesMs = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
        var targetSheetMs = monthNamesMs[targetDate.getMonth()] + " " + targetDate.getFullYear();
        targetSheet = ss.getSheetByName(targetSheetMs);
      }
      if (!targetSheet) {
        targetSheet = ss.insertSheet(targetSheetEn);
      }
      ensureSheetSetup(targetSheet);

      if (foundRow && foundSheet) {
        if (foundSheet.getName() !== targetSheet.getName()) {
          // Move sheets because the due date changes!
          foundSheet.deleteRow(foundRow);
          targetSheet.appendRow(rowData);
          var newRow = targetSheet.getLastRow();
          applyRowTemplate(targetSheet, newRow);
        } else {
          foundSheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
          applyRowTemplate(foundSheet, foundRow);
        }
      } else {
        targetSheet.appendRow(rowData);
        var newRow = targetSheet.getLastRow();
        applyRowTemplate(targetSheet, newRow);
      }

      return jsonResponse("success", "Successfully updated/created order", {
        orderId: finalOrderId,
        isUpgraded: isUpgraded
      });
    }

    return jsonResponse("error", "Unknown action: " + action);

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

  if (action === "get_dashboard_orders") {
    return getDashboardOrders(e);
  }

  if (action === "delete_order") {
    return deleteOrder(e);
  }

  if (action === "update_order") {
    return updateOrder(e);
  }

  return ContentService
    .createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function deleteOrder(e) {
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
    var deleted = false;

    for (var s = 0; s < sheets.length; s++) {
      var sheet = sheets[s];
      var row = findRowByOrderId(sheet, orderId);
      if (row) {
        sheet.deleteRow(row);
        deleted = true;
        break;
      }
    }

    return jsonOrJsonp(callback, {
      status: "success",
      deleted: deleted
    });

  } catch (error) {
    return jsonOrJsonp(callback, {
      status: "error",
      message: error.toString()
    });
  }
}

function getDashboardOrders(e) {
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
    var orders = [];

    sheets.forEach(function(sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      var lastCol = Math.max(sheet.getLastColumn(), 11);
      var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      values.forEach(function(rowData) {
        var name = String(rowData[1] || "").trim();
        if (!name) return;

        var orderId = String(rowData[10] || "").trim();
        var dueValue = rowData[8];

        var dueDate = (Object.prototype.toString.call(dueValue) === "[object Date]")
          ? dueValue
          : parseDueDate(dueValue);

        var dueTimestamp = (dueDate && !isNaN(dueDate.getTime()))
          ? dueDate.getTime()
          : 0;

        orders.push({
          isDelivered: rowData[0] === true || String(rowData[0]).toLowerCase() === "true",
          name: String(rowData[1] || ""),
          phone: String(rowData[2] || ""),
          order: String(rowData[3] || ""),
          template: String(rowData[4] || ""),
          bahasa: String(rowData[5] || ""),
          addon: String(rowData[6] || ""),
          jenis: String(rowData[7] || ""),
          due: formatDateValue(rowData[8]),
          dueTimestamp: dueTimestamp,
          link: String(rowData[9] || ""),
          orderId: orderId,
          sheetName: sheet.getName()
        });
      });
    });

    return jsonOrJsonp(callback, {
      status: "success",
      orders: orders
    });

  } catch (error) {
    return jsonOrJsonp(callback, {
      status: "error",
      message: error.toString()
    });
  }
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

      values.forEach(function(rowData, rowIndex) {
        var dueDate = parseDueDate(rowData[8]);

        var currentOrderId = String(rowData[10] || "").trim();

if (!currentOrderId || currentOrderId.indexOf("SYNC-") === 0) {
  currentOrderId = generateAppsScriptOrderId();

  var actualRow = rowIndex + 2;

  sheet
    .getRange(actualRow, 11)
    .setValue(currentOrderId);

  rowData[10] = currentOrderId;
}

        if (!dueDate) return;

        var today = new Date();
        today.setHours(0, 0, 0, 0);

        var startDate = new Date(
  today.getFullYear(),
  today.getMonth() - 1,
  1
);

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

function findRowByOrderId(sheet, orderId, optionalContent) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var range = sheet.getRange(2, 1, lastRow - 1, 11);
  var values = range.getValues();

  // 1. Try exact ID match in column K (index 10)
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][10] || "").trim() === String(orderId).trim()) {
      return i + 2;
    }
  }

  // 2. If ID starts with SYNC- and we didn't find it, try matching by content
  // SYNC-Name-Phone-Due
  if (String(orderId).indexOf("SYNC-") === 0) {
    for (var j = 0; j < values.length; j++) {
      var row = values[j];
      // Compare Name (col 2), Phone (col 3), Due (col 9, index 8)
      var dueStr = formatDateValue(row[8]);
      var generatedForThisRow = ("SYNC-" + (row[1] || "UNKNOWN") + "-" + (row[2] || "") + "-" + dueStr)
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-]/g, "");
      
      if (generatedForThisRow === orderId) {
        return j + 2;
      }
    }
  }

  // 3. Last resort: if optionalContent is provided, try matching by that
  if (optionalContent && optionalContent.name) {
     for (var k = 0; k < values.length; k++) {
       var r = values[k];
       var rDueStr = formatDateValue(r[8]);
       if (String(r[1]).trim() === String(optionalContent.name).trim() && 
           String(r[2]).trim() === String(optionalContent.phone || "").trim() &&
           rDueStr === String(optionalContent.due || "").trim()) {
         return k + 2;
       }
     }
  }

  return null;
}

function generateAppsScriptOrderId() {
  var timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMdd-HHmmss"
  );

  var uniquePart = Utilities
    .getUuid()
    .slice(0, 8)
    .toUpperCase();

  return "ORD-" + timestamp + "-" + uniquePart;
}

function findRowByFallbackKey(sheet, name, phone, due, orderType) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var range = sheet.getRange(2, 1, lastRow - 1, 11);
  var values = range.getValues();

  var norm = function(val) {
    return String(val || "").trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, "");
  };

  var normPhone = function(val) {
    return String(val || "").trim().replace(/[^0-9]/g, "");
  };

  var normDue = function(val) {
    if (Object.prototype.toString.call(val) === "[object Date]") {
      return formatDateValue(val);
    }
    return String(val || "").trim().toLowerCase();
  };

  var targetName = norm(name);
  var targetPhone = normPhone(phone);
  var targetDue = normDue(due);
  var targetOrder = norm(orderType);

  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var rowName = norm(r[1]);
    var rowPhone = normPhone(r[2]);
    var rowOrder = norm(r[3]);
    var rowDue = normDue(r[8]);

    if (rowName === targetName && 
        rowPhone === targetPhone && 
        rowDue === targetDue && 
        rowOrder === targetOrder) {
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

  for (var offset = -1; offset <= 1; offset++) {
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

  var text = String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
    
  if (!text) return null;

  var match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*at\s*(\d{1,2}):(\d{2})\s*(am|pm))?/i);
  if (!match) return null;

  var day = Number(match[1]);
  var month = Number(match[2]) - 1;
  var year = Number(match[3]);

  var hour = match[4] ? Number(match[4]) : 0;
  var minute = match[5] ? Number(match[5]) : 0;
  var ampm = match[6] ? match[6].toLowerCase() : "";

  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;

  return new Date(year, month, day, hour, minute);
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

function updateOrder(e) {
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

    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();
    var updated = false;

    var isDelivered = e.parameter.isDelivered === "true" || e.parameter.done === "true" || e.parameter.isDelivered === true || e.parameter.isDelivered === "1";
    var name = e.parameter.name || e.parameter.customerName || "";
    var phone = e.parameter.phone || e.parameter.customerPhone || "";
    var order = e.parameter.order || e.parameter.customerOrder || "";
    var template = e.parameter.template || e.parameter.customerTemplate || "";
    var bahasa = e.parameter.bahasa || e.parameter.customerBahasa || "";
    var addon = e.parameter.addon || e.parameter.customerAddOn || "";
    var jenis = e.parameter.jenis || e.parameter.customerJenis || "";
    var due = e.parameter.due || e.parameter.customerDue || "";
    var link = e.parameter.link || e.parameter.googleSheetLink || e.parameter.orderLink || "";

    var foundRow = null;
    var foundSheet = null;

    // A. Match by exact orderId first (if real, non-empty, and not a SYNC- placeholder)
    var isRealOrderId = orderId && String(orderId).trim() !== "" && String(orderId).indexOf("SYNC-") !== 0;
    if (isRealOrderId) {
      for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s];
        var row = findRowByOrderId(sheet, orderId);
        if (row) {
          foundRow = row;
          foundSheet = sheet;
          break;
        }
      }
    }

    // A2. Match by oldOrderId if provided
    var oldOrderId = e.parameter.oldOrderId || "";
    if (!foundRow && oldOrderId && String(oldOrderId).trim() !== "") {
      for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s];
        var row = findRowByOrderId(sheet, oldOrderId);
        if (row) {
          foundRow = row;
          foundSheet = sheet;
          break;
        }
      }
    }

    // B. If not found, try fallback key: customer name + phone + due date + order type
    if (!foundRow) {
      for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s];
        var row = findRowByFallbackKey(sheet, name, phone, due, order);
        if (row) {
          foundRow = row;
          foundSheet = sheet;
          break;
        }
      }
    }

    // C. Also if ID is SYNC-... try the specialized SYNC ID finder on findRowByOrderId
    if (!foundRow && orderId && String(orderId).indexOf("SYNC-") === 0) {
      for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s];
        var row = findRowByOrderId(sheet, orderId);
        if (row) {
          foundRow = row;
          foundSheet = sheet;
          break;
        }
      }
    }

    // D. Assign/upgrade permanent Order ID
    var finalOrderId = orderId;
    var isUpgraded = false;

    if (foundRow && foundSheet) {
      var currentCellId = String(foundSheet.getRange(foundRow, 11).getValue() || "").trim();
      if (!currentCellId || currentCellId.indexOf("SYNC-") === 0) {
        // Upgrade to a permanent order ID! If incoming orderId is already a real permanent ID, use it. Otherwise, generate a new one.
        if (orderId && String(orderId).trim() !== "" && String(orderId).indexOf("SYNC-") !== 0) {
          finalOrderId = orderId;
        } else {
          finalOrderId = generateAppsScriptOrderId();
        }
        isUpgraded = true;
      } else {
        finalOrderId = currentCellId;
      }
    } else {
      if (!finalOrderId || String(finalOrderId).trim() === "" || String(finalOrderId).indexOf("SYNC-") === 0) {
        finalOrderId = generateAppsScriptOrderId();
        isUpgraded = true;
      }
    }

    var rowData = [
      isDelivered,
      name,
      formatPhoneForSheet(phone),
      order,
      template,
      bahasa,
      addon,
      jenis,
      due,
      link,
      finalOrderId
    ];

    var targetDate = new Date();
    if (due) {
      var parsedDObj = parseDueDate(due);
      if (parsedDObj) {
        targetDate = parsedDObj;
      }
    }
    var monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var targetSheetEn = monthNamesEn[targetDate.getMonth()] + " " + targetDate.getFullYear();
    
    var targetSheet = ss.getSheetByName(targetSheetEn);
    if (!targetSheet) {
      var monthNamesMs = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
      var targetSheetMs = monthNamesMs[targetDate.getMonth()] + " " + targetDate.getFullYear();
      targetSheet = ss.getSheetByName(targetSheetMs);
    }
    if (!targetSheet) {
      targetSheet = ss.insertSheet(targetSheetEn);
    }
    ensureSheetSetup(targetSheet);

    if (foundRow && foundSheet) {
      if (foundSheet.getName() !== targetSheet.getName()) {
        foundSheet.deleteRow(foundRow);
        targetSheet.appendRow(rowData);
        var newRow = targetSheet.getLastRow();
        applyRowTemplate(targetSheet, newRow);
      } else {
        foundSheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
        applyRowTemplate(foundSheet, foundRow);
      }
      updated = true;
    } else {
      targetSheet.appendRow(rowData);
      var newRow = targetSheet.getLastRow();
      applyRowTemplate(targetSheet, newRow);
      updated = true;
    }

    return jsonOrJsonp(callback, {
      status: "success",
      updated: updated,
      orderId: finalOrderId,
      isUpgraded: isUpgraded
    });

  } catch (error) {
    return jsonOrJsonp(callback, {
      status: "error",
      message: error.toString()
    });
  }
}

function formatPhoneForSheet(phone) {
  var original = String(phone || "").trim();
  var digits = original.replace(/\D/g, "");

  if (!digits) return "";

  var countryCode = "";
  var local = "";

  // Malaysia
  if (digits.indexOf("60") === 0) {
    countryCode = "60";
    local = digits.substring(2);
  }
  // Singapore
  else if (digits.indexOf("65") === 0) {
    countryCode = "65";
    local = digits.substring(2);
  }
  // Indonesia
  else if (digits.indexOf("62") === 0) {
    countryCode = "62";
    local = digits.substring(2);
  }
  // Brunei
  else if (digits.indexOf("673") === 0) {
    countryCode = "673";
    local = digits.substring(3);
  }
  // Thailand
  else if (digits.indexOf("66") === 0) {
    countryCode = "66";
    local = digits.substring(2);
  }
  // Local Malaysian number
  else if (digits.indexOf("0") === 0) {
    countryCode = "60";
    local = digits.substring(1);
  }
  // Unknown country: keep first 2 digits as country code
  else {
    countryCode = digits.substring(0, 2);
    local = digits.substring(2);
  }

  // Malaysian style: 60 12-906 6817
  if (countryCode === "60" && local.length >= 8) {
    return (
      countryCode +
      " " +
      local.substring(0, 2) +
      "-" +
      local.substring(2, 5) +
      " " +
      local.substring(5)
    );
  }

  // Singapore style: 65 8057 4517
  if (countryCode === "65" && local.length === 8) {
    return (
      countryCode +
      " " +
      local.substring(0, 4) +
      " " +
      local.substring(4)
    );
  }

  // General fallback: country code + grouped local number
  var groupedLocal = local.replace(/(\d{3})(?=\d)/g, "$1 ").trim();

  return (countryCode + " " + groupedLocal).trim();
}
