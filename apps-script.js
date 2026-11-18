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
  try {
    var ownerEmail = Session.getEffectiveUser().getEmail();
    if (ownerEmail && emails.length > 0 && emails.indexOf(ownerEmail.toLowerCase()) === -1) {
      emails.push(ownerEmail.toLowerCase());
    }
  } catch (err) {}
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
    return {
      ok: false,
      message: "Unauthorized: Script Properties must define APPS_SCRIPT_SECRET or ALLOWED_EMAILS."
    };
  }

  var providedSecret = String((bodyData && bodyData.secret) || (params && params.secret) || "").trim();
  if (configuredSecret && providedSecret && safeStringCompare(configuredSecret, providedSecret)) {
    return { ok: true };
  }

  var providedIdToken = String((bodyData && bodyData.idToken) || (params && params.idToken) || "").trim();
  if (providedIdToken && verifyGoogleIdToken(providedIdToken, allowedEmails)) {
    return { ok: true };
  }

  return {
    ok: false,
    message: "Unauthorized: Invalid or missing credentials."
  };
}

function getAllowedSpreadsheetIds() {
  var props = PropertiesService.getScriptProperties();
  var raw = String(props.getProperty("ALLOWED_SPREADSHEET_IDS") || "");
  var ids = [];
  if (raw) {
    raw.split(",").forEach(function(item) {
      var trimmed = item.trim();
      if (trimmed) ids.push(trimmed);
    });
  }
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      var activeId = active.getId();
      if (activeId && ids.indexOf(activeId) === -1) {
        ids.push(activeId);
      }
    }
  } catch (err) {}
  return ids;
}

function validateAllowedSpreadsheet(spreadsheetId) {
  var cleanId = String(spreadsheetId || "").trim();
  if (!cleanId) {
    return { ok: false, message: "Missing spreadsheetId" };
  }
  var allowedIds = getAllowedSpreadsheetIds();
  if (allowedIds.length === 0 || allowedIds.indexOf(cleanId) === -1) {
    return {
      ok: false,
      message: "Forbidden: spreadsheetId is not in ALLOWED_SPREADSHEET_IDS."
    };
  }
  return { ok: true, spreadsheetId: cleanId };
}

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse("error", "Missing POST body");
    }

    var data = JSON.parse(e.postData.contents);
    var authResult = verifyRequestAuth(e.parameter || {}, data);
    if (!authResult.ok) {
      return jsonResponse("error", authResult.message, { code: 401 });
    }

    var action = data.action || "update_order";
    var spreadsheetId = data.spreadsheetId;

    if (action === "test_diagnostic_connection" || (data.rowData && data.rowData[0] === "test_diagnostic_connection")) {
      return jsonResponse("success", "Diagnostic connection successful");
    }

    var sheetCheck = validateAllowedSpreadsheet(spreadsheetId);
    if (!sheetCheck.ok) {
      return jsonResponse("error", sheetCheck.message, { code: 403 });
    }

    var ss = SpreadsheetApp.openById(sheetCheck.spreadsheetId);
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
  var params = (e && e.parameter) || {};
  var action = params.action;

  var authResult = verifyRequestAuth(params, null);
  if (!authResult.ok) {
    return jsonResponse("error", authResult.message, { code: 401 });
  }

  if (action === "update_delivered" || action === "delete_order" || action === "update_order") {
    return jsonResponse("error", "Method Not Allowed: Mutations must use HTTP POST.", { code: 405 });
  }

  if (action === "sync_recent") {
    return syncRecentOrders(e);
  }

  if (action === "get_link") {
    return getOrderLink(e);
  }

  if (action === "search_database") {
    return searchDatabase(e);
  }

  if (action === "get_dashboard_orders") {
    return getDashboardOrders(e);
  }

  return jsonResponse("error", "Unknown or missing action", { code: 400 });
}

function getDashboardOrders(e) {
  var spreadsheetId = e.parameter.spreadsheetId;

  try {
    var sheetCheck = validateAllowedSpreadsheet(spreadsheetId);
    if (!sheetCheck.ok) {
      return jsonResponse("error", sheetCheck.message, { code: 403 });
    }

    var ss = SpreadsheetApp.openById(sheetCheck.spreadsheetId);
    var sheets = ss.getSheets();
    var orders = [];

    sheets.forEach(function(sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      var lastCol = Math.max(sheet.getLastColumn(), 12);
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

        var bayaranVal = rowData[11] !== undefined && rowData[11] !== null ? rowData[11] : "";

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
          bayaran: bayaranVal,
          price: bayaranVal,
          sheetName: sheet.getName()
        });
      });
    });

    return jsonResponse("success", "Dashboard orders fetched", { orders: orders });

  } catch (error) {
    return jsonResponse("error", error.toString());
  }
}

function syncRecentOrders(e) {
  var spreadsheetId = e.parameter.spreadsheetId;

  try {
    var sheetCheck = validateAllowedSpreadsheet(spreadsheetId);
    if (!sheetCheck.ok) {
      return jsonResponse("error", sheetCheck.message, { code: 403 });
    }

    var ss = SpreadsheetApp.openById(sheetCheck.spreadsheetId);
    var sheets = ss.getSheets();

    var targetSheets = getCurrentAndNextMonthSheetNames();
    var recentOrders = [];

    sheets.forEach(function(sheet) {
      if (targetSheets.indexOf(sheet.getName()) === -1) return;

      var lastRow = sheet.getLastRow();

      if (lastRow < 2) return;

      var lastCol = Math.max(sheet.getLastColumn(), 12);
      var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

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

        var bayaranVal = rowData[11] !== undefined && rowData[11] !== null ? rowData[11] : "";

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
          orderId: String(rowData[10] || ""),
          bayaran: bayaranVal,
          price: bayaranVal
        });
      });
    });

    return jsonResponse("success", "Recent orders fetched", { orders: recentOrders });

  } catch (error) {
    return jsonResponse("error", error.toString());
  }
}

function getOrderLink(e) {
  var spreadsheetId = e.parameter.spreadsheetId;
  var orderId = e.parameter.orderId;

  try {
    var sheetCheck = validateAllowedSpreadsheet(spreadsheetId);
    if (!sheetCheck.ok) {
      return jsonResponse("error", sheetCheck.message, { code: 403 });
    }

    if (!orderId) {
      return jsonResponse("error", "Missing orderId");
    }

    var ss = SpreadsheetApp.openById(sheetCheck.spreadsheetId);
    var sheets = ss.getSheets();

    var foundLink = "";

    for (var i = 0; i < sheets.length; i++) {
      var row = findRowByOrderId(sheets[i], orderId);

      if (row) {
        foundLink = String(sheets[i].getRange(row, 10).getValue() || "");
        break;
      }
    }

    return jsonResponse("success", "Order link fetched", { link: foundLink });

  } catch (error) {
    return jsonResponse("error", error.toString());
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
    "Order ID",
    "Bayaran"
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
    sheet.appendRow(["", "", "", "", "", "", "", "", "", "", "", ""]);
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

function searchDatabase(e) {
  var spreadsheetId = e.parameter.spreadsheetId;
  var query = e.parameter.query;

  try {
    var sheetCheck = validateAllowedSpreadsheet(spreadsheetId);
    if (!sheetCheck.ok) {
      return jsonResponse("error", sheetCheck.message, { code: 403 });
    }

    if (!query) {
      return jsonResponse("success", "Empty query", { orders: [] });
    }

    var cleanQuery = String(query).toLowerCase().trim();
    if (!cleanQuery) {
      return jsonResponse("success", "Empty query", { orders: [] });
    }

    var ss = SpreadsheetApp.openById(sheetCheck.spreadsheetId);
    var sheets = ss.getSheets();
    var matchingOrders = [];

    sheets.forEach(function(sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      var lastCol = Math.max(sheet.getLastColumn(), 12);

      var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      values.forEach(function(rowData) {
        var nameVal = String(rowData[1] || "").toLowerCase();
        var phoneVal = String(rowData[2] || "").toLowerCase();
        var orderIdVal = String(rowData[10] || "").toLowerCase();

        if (nameVal.indexOf(cleanQuery) !== -1 ||
            phoneVal.indexOf(cleanQuery) !== -1 ||
            orderIdVal.indexOf(cleanQuery) !== -1) {
          
          var bayaranVal = rowData[11] !== undefined && rowData[11] !== null ? rowData[11] : "";

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
            bayaran: bayaranVal,
            price: bayaranVal,
            sheetName: sheet.getName()
          });
        }
      });
    });

    return jsonResponse("success", "Search complete", { orders: matchingOrders });

  } catch (error) {
    return jsonResponse("error", error.toString());
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
