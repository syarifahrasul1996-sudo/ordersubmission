/**
 * Google Apps Script backend for the Order Submission web app.
 *
 * Deploy as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * The web app uses JSONP for readable cross-origin responses, with POST
 * compatibility for older clients and external integrations. Keep this file as
 * setup helper imports this exact file.
 */

var ORDER_HEADERS = [
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
  "Price"
];

function doGet(e) {
  return routeRequest(getRequestParameters(e), true);
}

function doPost(e) {
  var data;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse("error", "Missing POST body");
    }
    data = JSON.parse(e.postData.contents);
  } catch (error) {
    return jsonResponse("error", "Invalid JSON body: " + error.toString());
  }

  return routeRequest(data || {}, false);
}

function routeRequest(params, allowJsonp) {
  var action = String(params.action || "").trim();
  var callback = allowJsonp ? params.callback : "";

  try {
    if (action === "sync_recent") return syncRecentOrders(params, callback);
    if (action === "get_dashboard_orders") return getDashboardOrders(params, callback);
    if (action === "get_link") return getOrderLink(params, callback);
    if (action === "update_delivered") return withWriteLock(function() {
      return updateDeliveredStatus(params, callback);
    }, callback);
    if (action === "search_database") return searchDatabase(params, callback);
    if (action === "delete_order") return withWriteLock(function() {
      return deleteOrder(params, callback);
    }, callback);
    if (action === "update_order") return withWriteLock(function() {
      return updateOrder(params, callback);
    }, callback);

    // Backward-compatible POST format used by older clients.
    if (Array.isArray(params.rowData)) {
      return withWriteLock(function() {
        return upsertRowData(params, callback);
      }, callback);
    }

    return jsonOrJsonp(callback, {
      status: "success",
      message: "Order Submission Apps Script is running"
    });
  } catch (error) {
    return jsonOrJsonp(callback, {
      status: "error",
      message: error.toString()
    });
  }
}

function getRequestParameters(e) {
  var result = {};
  if (!e || !e.parameter) return result;
  Object.keys(e.parameter).forEach(function(key) {
    result[key] = e.parameter[key];
  });
  return result;
}

function withWriteLock(callback, outputCallback) {
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    lock.waitLock(10000);
    hasLock = true;
    return callback();
  } catch (error) {
    return errorOutput(outputCallback, error.toString());
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (ignored) {}
    }
  }
}

function upsertRowData(params, callback) {
  var spreadsheetId = String(params.spreadsheetId || "").trim();
  var rowData = Array.isArray(params.rowData) ? params.rowData.slice(0, ORDER_HEADERS.length) : null;

  if (rowData && rowData[0] === "test_diagnostic_connection") {
    return jsonOrJsonp(callback, {
      status: "success",
      message: "Diagnostic connection successful"
    });
  }
  if (!spreadsheetId) return errorOutput(callback, "Missing spreadsheetId");
  if (!rowData) return errorOutput(callback, "Missing or invalid rowData");
  if (rowData.length < 11) return errorOutput(callback, "rowData must contain at least 11 columns");

  while (rowData.length < ORDER_HEADERS.length) rowData.push("");
  rowData[0] = normalizeCheckboxValue(rowData[0]);
  rowData[11] = normalizePrice(rowData[11]);

  var orderId = String(rowData[10] || "").trim();
  if (!orderId) return errorOutput(callback, "Missing Order ID in column K");

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = findOrCreateTargetSheet(ss, params, rowData[8]);
  ensureSheetSetup(sheet);

  var existing = findOrderAcrossSheets(ss, orderId);
  if (existing) {
    var existingDone = existing.sheet.getRange(existing.row, 1).getValue();
    if (normalizeCheckboxValue(existingDone)) rowData[0] = true;

    if (existing.sheet.getSheetId() !== sheet.getSheetId()) {
      existing.sheet.deleteRow(existing.row);
      appendOrderRow(sheet, rowData);
    } else {
      writeOrderRow(sheet, existing.row, rowData);
    }

    return jsonOrJsonp(callback, {
      status: "success",
      message: "Updated order " + orderId,
      orderId: orderId
    });
  }

  appendOrderRow(sheet, rowData);
  return jsonOrJsonp(callback, {
    status: "success",
    message: "Created order " + orderId,
    orderId: orderId
  });
}

function updateOrder(params, callback) {
  var spreadsheetId = String(params.spreadsheetId || "").trim();
  if (!spreadsheetId) return errorOutput(callback, "Missing spreadsheetId");

  var orderId = String(params.orderId || "").trim();
  var oldOrderId = String(params.oldOrderId || "").trim();
  if (!orderId) return errorOutput(callback, "Missing orderId");

  var rowData = Array.isArray(params.rowData)
    ? params.rowData.slice(0, ORDER_HEADERS.length)
    : [
        normalizeCheckboxValue(params.isDelivered),
        params.name || "",
        params.phone || "",
        params.order || "",
        params.template || "",
        params.bahasa || "",
        params.addon || "",
        params.jenis || "",
        params.due || "",
        params.link || "",
        orderId,
        normalizePrice(params.price)
      ];

  while (rowData.length < ORDER_HEADERS.length) rowData.push("");
  rowData[0] = normalizeCheckboxValue(rowData[0]);
  rowData[10] = orderId;
  rowData[11] = normalizePrice(rowData[11]);

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var targetSheet = findOrCreateTargetSheet(ss, params, rowData[8]);
  ensureSheetSetup(targetSheet);

  var existing = findOrderAcrossSheets(ss, orderId);
  if (!existing && oldOrderId) existing = findOrderAcrossSheets(ss, oldOrderId);

  if (existing) {
    if (existing.sheet.getSheetId() !== targetSheet.getSheetId()) {
      existing.sheet.deleteRow(existing.row);
      appendOrderRow(targetSheet, rowData);
    } else {
      writeOrderRow(targetSheet, existing.row, rowData);
    }
  } else {
    appendOrderRow(targetSheet, rowData);
  }

  return jsonOrJsonp(callback, {
    status: "success",
    message: existing ? "Updated order " + orderId : "Created order " + orderId,
    orderId: orderId,
    isUpgraded: !!oldOrderId && oldOrderId !== orderId
  });
}

function updateDeliveredStatus(params, callback) {
  var spreadsheetId = String(params.spreadsheetId || "").trim();
  var orderId = String(params.orderId || "").trim();
  if (!spreadsheetId) return errorOutput(callback, "Missing spreadsheetId");
  if (!orderId) return errorOutput(callback, "Missing orderId");

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var found = findOrderAcrossSheets(ss, orderId);
  if (!found) return errorOutput(callback, "Order ID not found");

  var isDelivered = normalizeCheckboxValue(params.isDelivered);
  found.sheet.getRange(found.row, 1).insertCheckboxes().setValue(isDelivered);

  return jsonOrJsonp(callback, {
    status: "success",
    orderId: orderId,
    isDelivered: isDelivered
  });
}

function deleteOrder(params, callback) {
  var spreadsheetId = String(params.spreadsheetId || "").trim();
  var orderId = String(params.orderId || "").trim();
  if (!spreadsheetId) return errorOutput(callback, "Missing spreadsheetId");
  if (!orderId) return errorOutput(callback, "Missing orderId");

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var found = findOrderAcrossSheets(ss, orderId);
  if (found) found.sheet.deleteRow(found.row);

  return jsonOrJsonp(callback, {
    status: "success",
    deleted: !!found,
    orderId: orderId
  });
}

function getOrderLink(params, callback) {
  var spreadsheetId = String(params.spreadsheetId || "").trim();
  var orderId = String(params.orderId || "").trim();
  if (!spreadsheetId) return errorOutput(callback, "Missing spreadsheetId");
  if (!orderId) return errorOutput(callback, "Missing orderId");

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var found = findOrderAcrossSheets(ss, orderId);

  return jsonOrJsonp(callback, {
    status: "success",
    link: found ? String(found.sheet.getRange(found.row, 10).getValue() || "") : ""
  });
}

function syncRecentOrders(params, callback) {
  var spreadsheetId = String(params.spreadsheetId || "").trim();
  if (!spreadsheetId) return errorOutput(callback, "Missing spreadsheetId");

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var targetNames = getRelevantMonthSheetNames();
  var range = getActiveDateRange();
  var recentOrders = [];

  ss.getSheets().forEach(function(sheet) {
    if (targetNames.indexOf(sheet.getName()) === -1) return;
    collectRows(sheet, function(rowData) {
      var dueDate = parseDueDate(rowData[8]);
      if (!dueDate || dueDate.getTime() < range.start.getTime() || dueDate.getTime() > range.end.getTime()) return;
      recentOrders.push(rowToOrder(rowData, sheet.getName()));
    });
  });

  return jsonOrJsonp(callback, {
    status: "success",
    orders: recentOrders
  });
}

function getDashboardOrders(params, callback) {
  var spreadsheetId = String(params.spreadsheetId || "").trim();
  var requestedYear = String(params.year || "").trim();
  if (!spreadsheetId) return errorOutput(callback, "Missing spreadsheetId");

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var orders = [];

  ss.getSheets().forEach(function(sheet) {
    if (requestedYear && requestedYear !== "all" && sheet.getName().indexOf(requestedYear) === -1) return;
    collectRows(sheet, function(rowData) {
      orders.push(rowToOrder(rowData, sheet.getName()));
    });
  });

  return jsonOrJsonp(callback, {
    status: "success",
    orders: orders
  });
}

function searchDatabase(params, callback) {
  var spreadsheetId = String(params.spreadsheetId || "").trim();
  var query = String(params.query || "").toLowerCase().trim();
  if (!spreadsheetId) return errorOutput(callback, "Missing spreadsheetId");
  if (!query) return jsonOrJsonp(callback, { status: "success", orders: [] });

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var matchingOrders = [];

  ss.getSheets().forEach(function(sheet) {
    collectRows(sheet, function(rowData) {
      var name = String(rowData[1] || "").toLowerCase();
      var phone = String(rowData[2] || "").toLowerCase();
      var orderId = String(rowData[10] || "").toLowerCase();
      if (name.indexOf(query) !== -1 || phone.indexOf(query) !== -1 || orderId.indexOf(query) !== -1) {
        matchingOrders.push(rowToOrder(rowData, sheet.getName()));
      }
    });
  });

  return jsonOrJsonp(callback, {
    status: "success",
    orders: matchingOrders
  });
}

function collectRows(sheet, visitor) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var values = sheet.getRange(2, 1, lastRow - 1, ORDER_HEADERS.length).getValues();
  values.forEach(function(rowData) {
    var hasContent = rowData.some(function(value) { return String(value || "").trim() !== ""; });
    if (!hasContent) return;
    visitor(rowData);
  });
}

function rowToOrder(rowData, sheetName) {
  return {
    isDelivered: normalizeCheckboxValue(rowData[0]),
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
    price: normalizePrice(rowData[11]),
    sheetName: sheetName
  };
}

function findOrCreateTargetSheet(ss, params, dueValue) {
  var suppliedEn = String(params.sheetNameEn || params.sheetName || "").trim();
  var suppliedMs = String(params.sheetNameMs || "").trim();
  var generated = getMonthSheetNames(parseDueDate(dueValue) || new Date());

  var candidates = [suppliedEn, suppliedMs, generated.en, generated.ms].filter(function(name, index, all) {
    return name && all.indexOf(name) === index;
  });

  for (var i = 0; i < candidates.length; i++) {
    var existing = ss.getSheetByName(candidates[i]);
    if (existing) return existing;
  }

  return ss.insertSheet(candidates[0] || generated.en || "Orders");
}

function findOrderAcrossSheets(ss, orderId, optionalContent) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var row = findRowByOrderId(sheets[i], orderId, optionalContent);
    if (row) return { sheet: sheets[i], row: row };
  }
  return null;
}

function findRowByOrderId(sheet, orderId, optionalContent) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var values = sheet.getRange(2, 1, lastRow - 1, ORDER_HEADERS.length).getValues();
  var cleanId = String(orderId || "").trim();

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][10] || "").trim() === cleanId) return i + 2;
  }

  if (cleanId.indexOf("SYNC-") === 0) {
    for (var j = 0; j < values.length; j++) {
      var row = values[j];
      var generated = ("SYNC-" + (row[1] || "UNKNOWN") + "-" + (row[2] || "") + "-" + formatDateValue(row[8]))
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-]/g, "");
      if (generated === cleanId) return j + 2;
    }
  }

  if (optionalContent && optionalContent.name) {
    for (var k = 0; k < values.length; k++) {
      var candidate = values[k];
      if (
        String(candidate[1] || "").trim() === String(optionalContent.name || "").trim() &&
        String(candidate[2] || "").trim() === String(optionalContent.phone || "").trim() &&
        formatDateValue(candidate[8]) === String(optionalContent.due || "").trim()
      ) return k + 2;
    }
  }

  return null;
}

function ensureSheetSetup(sheet) {
  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
  } else {
    var current = sheet.getRange(1, 1, 1, ORDER_HEADERS.length).getValues()[0];
    for (var i = 0; i < ORDER_HEADERS.length; i++) {
      if (!String(current[i] || "").trim()) current[i] = ORDER_HEADERS[i];
    }
    sheet.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([current]);
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, ORDER_HEADERS.length).setFontWeight("bold");
  sheet.getRange("A2:A").insertCheckboxes();
  sheet.getRange("L2:L").setNumberFormat("0.00");
}

function appendOrderRow(sheet, rowData) {
  var targetRow = Math.max(sheet.getLastRow() + 1, 2);
  writeOrderRow(sheet, targetRow, rowData);
}

function writeOrderRow(sheet, row, rowData) {
  ensureSheetSetup(sheet);
  sheet.getRange(row, 1, 1, ORDER_HEADERS.length).setValues([rowData]);
  applyRowTemplate(sheet, row);
}

function applyRowTemplate(sheet, targetRow) {
  var templateRow = sheet.getLastRow() >= 2 ? 2 : targetRow;
  if (templateRow !== targetRow && sheet.getLastColumn() >= ORDER_HEADERS.length) {
    sheet.getRange(templateRow, 1, 1, ORDER_HEADERS.length).copyTo(
      sheet.getRange(targetRow, 1, 1, ORDER_HEADERS.length),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false
    );
  }
  sheet.getRange(targetRow, 1).insertCheckboxes();
  sheet.getRange(targetRow, 12).setNumberFormat("0.00");
}

function normalizeCheckboxValue(value) {
  var text = String(value).toLowerCase().trim();
  return value === true || text === "true" || text === "1" || text === "yes";
}

function normalizePrice(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  var text = String(value).replace(/^RM\s*/i, "").replace(/\s+/g, "");
  if (text.indexOf(",") !== -1 && text.indexOf(".") !== -1) {
    text = text.replace(/,/g, "");
  } else if (text.indexOf(",") !== -1) {
    var parts = text.split(",");
    text = parts.length === 2 && parts[1].length <= 2 ? parts[0] + "." + parts[1] : parts.join("");
  }
  var number = Number(text);
  return isFinite(number) && number >= 0 ? number : "";
}

function parseDueDate(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return isNaN(value.getTime()) ? null : value;
  }

  var text = String(value || "").trim().replace(/\s+at\s+/i, " ").replace(/\s+/g, " ");
  if (!text) return null;

  var dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(AM|PM)?)?$/i);
  if (dmy) return buildValidatedDate(dmy[3], dmy[2], dmy[1], dmy[4], dmy[5], dmy[6], dmy[7]);

  var ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(AM|PM)?)?$/i);
  if (ymd) return buildValidatedDate(ymd[1], ymd[2], ymd[3], ymd[4], ymd[5], ymd[6], ymd[7]);

  var direct = new Date(text);
  return isNaN(direct.getTime()) ? null : direct;
}

function buildValidatedDate(yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue, markerValue) {
  var year = Number(yearValue);
  var month = Number(monthValue) - 1;
  var day = Number(dayValue);
  var hour = Number(hourValue || 0);
  var minute = Number(minuteValue || 0);
  var second = Number(secondValue || 0);
  var marker = String(markerValue || "").toUpperCase();

  if (marker) {
    if (hour < 1 || hour > 12) return null;
    if (marker === "PM" && hour < 12) hour += 12;
    if (marker === "AM" && hour === 12) hour = 0;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;

  var date = new Date(year, month, day, hour, minute, second, 0);
  if (
    date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day ||
    date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second
  ) return null;
  return date;
}

function formatDateValue(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "dd/MM/yyyy h:mm a");
  }
  return String(value || "").trim();
}

function getActiveDateRange() {
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var start = new Date(today);
  start.setDate(today.getDate() - 2);

  var end = new Date(today);
  end.setDate(today.getDate() + 3);
  end.setHours(23, 59, 59, 999);

  return { start: start, end: end };
}

function getRelevantMonthSheetNames() {
  var range = getActiveDateRange();
  var cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  var finalMonth = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
  var names = [];

  while (cursor.getTime() <= finalMonth.getTime()) {
    var pair = getMonthSheetNames(cursor);
    if (names.indexOf(pair.en) === -1) names.push(pair.en);
    if (names.indexOf(pair.ms) === -1) names.push(pair.ms);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return names;
}

function getMonthSheetNames(date) {
  var monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var monthNamesMs = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
  return {
    en: monthNamesEn[date.getMonth()] + " " + date.getFullYear(),
    ms: monthNamesMs[date.getMonth()] + " " + date.getFullYear()
  };
}

function errorOutput(callback, message) {
  return jsonOrJsonp(callback, { status: "error", message: message });
}

function jsonResponse(status, message, extra) {
  var obj = { status: status, message: message };
  if (extra) {
    Object.keys(extra).forEach(function(key) { obj[key] = extra[key]; });
  }
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function jsonOrJsonp(callback, obj) {
  var output = JSON.stringify(obj);
  var safeCallback = String(callback || "").trim();
  if (safeCallback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(safeCallback)) {
    return ContentService.createTextOutput(safeCallback + "(" + output + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JSON);
}
