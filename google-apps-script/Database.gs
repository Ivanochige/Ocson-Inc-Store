/* ==========================================================================
   Ocson Inc. Store — Database.gs
   Google Sheets schema, initialisation and low-level CRUD helpers.
   All sheet access happens here. The frontend never sees a spreadsheet.
   ========================================================================== */

var DB_SPREADSHEET_ID = '1kI2FGZ5xYd69E0thYjUwKAcBp0i5PuaMIVWJHNQXQlU'; // Optional: paste the Google Sheet ID here. Leave blank to use the active spreadsheet.

var DB_SCHEMA = {
  Users:            ['id','username','name','email','phone','role','passwordHash','salt','status','dateAdded','lastLogin','requestId'],
  Products:         ['id','name','sku','description','category','brand','imageUrl','costPrice','sellingPrice','stock','minStock','supplier','supplierId','dateAdded','status','requestId'],
  Categories:       ['id','name','description','status','requestId'],
  Sales:            ['id','receiptNo','date','customerId','customerName','subtotal','discount','total','cogs','paymentMethod','paymentStatus','amountPaid','changeAmount','status','userId','user','requestId','orderId','refunded','refundDate','refundReason'],
  Sale_Items:       ['id','saleId','productId','productName','sku','quantity','unitPrice','costPrice','lineTotal','lineCost','requestId'],
  Inventory:        ['id','productId','name','sku','category','stock','costPrice','sellingPrice','updatedAt','requestId'],
  Stock_Movements:  ['id','productId','productName','type','quantity','previousStock','newStock','date','user','userId','reason','reference','requestId','relatedId'],
  Orders:           ['id','date','customerId','customerName','phone','email','deliveryAddress','itemCount','total','discount','paymentMethod','paymentStatus','status','notes','reference','userId','user','convertedSaleId','requestId'],
  Order_Items:      ['id','orderId','productId','productName','quantity','unitPrice','lineTotal','requestId'],
  Customers:        ['id','name','phone','email','address','notes','balance','totalSpent','purchaseCount','dateAdded','requestId'],
  Suppliers:        ['id','name','contactPerson','phone','email','address','paymentTerms','notes','status','balance','totalPurchases','purchaseCount','productCount','dateAdded','requestId'],
  Purchases:        ['id','supplierId','supplierName','date','reference','total','totalQuantity','itemCount','paymentStatus','status','received','receivedAt','receivedBy','notes','userId','requestId'],
  Purchase_Items:   ['id','purchaseId','productId','productName','quantity','unitCost','lineTotal','received','requestId'],
  Expenses:         ['id','date','category','description','amount','paymentMethod','user','userId','notes','requestId'],
  Payments:         ['id','date','type','referenceId','customerId','supplierId','amount','method','status','userId','requestId'],
  Returns:          ['id','date','saleId','receiptNo','customerId','productId','productName','quantity','amount','reason','userId','requestId'],
  Audit_Logs:       ['id','timestamp','user','userId','action','entity','recordId','details','requestId','ip'],
  Settings:         ['key','value','updatedAt','updatedBy','requestId']
};

var DB_DEFAULT_CATEGORIES = ['General','Beverages','Food','Electronics','Household','Personal Care','Stationery','Other'];
var DB_DEFAULT_SETTINGS = {
  companyName: 'Ocson Inc. Store',
  currency: 'UGX',
  currencySymbol: 'UGX',
  address: '',
  phone: '',
  email: '',
  lowStockThreshold: '10',
  receiptFooter: 'Thank you for shopping with Ocson Inc. Store'
};

/* ------------------------------ Connection -------------------------------- */
function DB_ss() {
  if (DB_SPREADSHEET_ID) return SpreadsheetApp.openById(DB_SPREADSHEET_ID);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) fail('No spreadsheet found. Set DB_SPREADSHEET_ID in Database.gs.', 'DB_NOT_FOUND');
  return ss;
}

function DB_sheet(name) {
  if (!DB_SCHEMA[name]) fail('Unknown sheet: ' + name, 'DB_SCHEMA');
  var ss = DB_ss();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(DB_SCHEMA[name]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, DB_SCHEMA[name].length).setFontWeight('bold').setBackground('#0b1526').setFontColor('#ffffff');
    sh.setColumnWidth(1, 170);
  }
  return sh;
}

/** Creates all 18 worksheets and seeds defaults. Safe to run many times. */
function setupDatabase() {
  var ss = DB_ss();
  Object.keys(DB_SCHEMA).forEach(function (name) { DB_sheet(name); });

  DB_DEFAULT_CATEGORIES.forEach(function (name) {
    if (!DB_findBy('Categories', 'name', name)) {
      DB_insert('Categories', { id: DB_id('CAT'), name: name, description: 'Default category', status: 'Active' });
    }
  });
  Object.keys(DB_DEFAULT_SETTINGS).forEach(function (key) {
    if (!DB_getSetting(key)) DB_setSetting(key, DB_DEFAULT_SETTINGS[key], 'system');
  });
  return { ok: true, sheets: Object.keys(DB_SCHEMA).length, created: Object.keys(DB_SCHEMA) };
}

/* -------------------------------- CRUD ------------------------------------ */
function DB_headers(name) {
  return DB_sheet(name).getRange(1, 1, 1, DB_SCHEMA[name].length).getValues()[0].map(String);
}

function DB_all(name) {
  var sh = DB_sheet(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, DB_SCHEMA[name].length).getValues();
  var headers = DB_SCHEMA[name];
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var blank = true;
    for (var j = 0; j < row.length; j++) { if (row[j] !== '' && row[j] != null) { blank = false; break; } }
    if (blank) continue;
    var obj = {};
    for (var k = 0; k < headers.length; k++) obj[headers[k]] = row[k];
    out.push(obj);
  }
  return out;
}

function DB_find(name, id) {
  var rows = DB_all(name);
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i];
  return null;
}

function DB_findBy(name, key, value) {
  var rows = DB_all(name);
  var v = String(value).toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][key] == null ? '' : rows[i][key]).toLowerCase() === v) return rows[i];
  }
  return null;
}

function DB_filter(name, fn) { return DB_all(name).filter(fn); }

function DB_rowObject(name, obj) {
  return DB_SCHEMA[name].map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return '';
    return v;
  });
}

function DB_insert(name, obj) {
  var sh = DB_sheet(name);
  var row = DB_rowObject(name, obj);
  sh.appendRow(row);
  return obj;
}

function DB_update(name, id, changes, keyField) {
  var sh = DB_sheet(name);
  var key = keyField || 'id';
  var headers = DB_SCHEMA[name];
  var last = sh.getLastRow();
  if (last < 2) return null;
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][headers.indexOf(key)]) === String(id)) {
      var merged = {};
      headers.forEach(function (h, idx) { merged[h] = values[i][idx]; });
      Object.keys(changes || {}).forEach(function (k) { if (headers.indexOf(k) >= 0) merged[k] = changes[k]; });
      sh.getRange(i + 2, 1, 1, headers.length).setValues([DB_rowObject(name, merged)]);
      return merged;
    }
  }
  return null;
}

function DB_remove(name, id) {
  var sh = DB_sheet(name);
  var headers = DB_SCHEMA[name];
  var values = sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), headers.length).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][headers.indexOf('id')]) === String(id)) { sh.deleteRow(i + 2); return true; }
  }
  return false;
}

function DB_id(prefix) {
  return (prefix || 'ID') + '_' + Date.now().toString(36).toUpperCase() + '_' + Utilities.getUuid().slice(0, 6).toUpperCase();
}

function DB_now() { return new Date().toISOString(); }

function DB_num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function DB_int(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
function DB_clean(v) { return v === undefined || v === null ? '' : String(v).trim(); }
function DB_date(v) {
  if (!v) return '';
  var d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/* ------------------------------- Settings --------------------------------- */
function DB_getSetting(key) {
  var rows = DB_all('Settings');
  for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i].value;
  return '';
}

function DB_setSetting(key, value, user, requestId) {
  var existing = null;
  var rows = DB_all('Settings');
  for (var i = 0; i < rows.length; i++) if (rows[i].key === key) { existing = rows[i]; break; }
  var payload = { key: key, value: String(value), updatedAt: DB_now(), updatedBy: user || 'system', requestId: requestId || '' };
  if (existing) return DB_update('Settings', key, payload, 'key');
  return DB_insert('Settings', payload);
}

/* ------------------------------- Audit / dedupe ---------------------------- */
function DB_log(action, entity, recordId, details, session, requestId) {
  DB_insert('Audit_Logs', {
    id: DB_id('LOG'),
    timestamp: DB_now(),
    user: session ? session.name : 'system',
    userId: session ? session.id : '',
    action: action,
    entity: entity,
    recordId: recordId || '',
    details: typeof details === 'string' ? details : JSON.stringify(details || {}),
    requestId: requestId || '',
    ip: ''
  });
}

/** Throws when the same client requestId was already committed. */
function DB_assertFresh(requestId) {
  if (!requestId) return;
  var rows = DB_all('Audit_Logs');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].requestId === requestId) fail('This request was already submitted. Refresh and try again.', 'DUPLICATE_REQUEST');
  }
}

function DB_lock() {
  var lock = LockService.getScriptLock();
  lock.waitLock(45000);
  return lock;
}
