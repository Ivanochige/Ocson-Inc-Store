/* ==========================================================================
   Ocson Inc. Store — Code.gs
   Single action-based API endpoint. Deploy as a web app (Anyone access).
   ========================================================================== */

var API_SERVICE_NAME = 'Ocson Inc. Store API';
var API_VERSION = '1.0.0';

function fail(message, code) {
  var e = new Error(message);
  e.code = code || 'SERVER_ERROR';
  throw e;
}

function API_respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST');
}

function doGet(e) {
  try {
    return API_respond({ ok: true, data: {
      service: API_SERVICE_NAME, version: API_VERSION,
      sheets: Object.keys(DB_SCHEMA).length,
      time: DB_now()
    } });
  } catch (err) {
    return API_respond({ ok: false, error: err.message, code: 'STARTUP_ERROR' });
  }
}

function doPost(e) {
  var req = null;
  try {
    var body = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    req = JSON.parse(body);
  } catch (err) {
    return API_respond({ ok: false, error: 'Invalid JSON request.', code: 'BAD_REQUEST' });
  }

  var action = String(req.action || '');
  var payload = req.payload || {};
  var handler = API_ROUTES[action];

  try {
    if (!handler) fail('Unknown API action: ' + action, 'UNKNOWN_ACTION');

    // Reports use a dynamic action name (reports.dailySales, reports.netProfit, …).
    if (action.indexOf('reports.') === 0) handler = function (p, s) { return REPORTS_run(action.slice(8), p, s); };

    var permission = API_permissionFor(action);
    var session = AUTH_resolve(req.token);
    if (permission) AUTH_require(session, permission);

    var result = handler(payload, session, req) || {};
    var response = { ok: true };
    Object.keys(result).forEach(function (k) { response[k] = result[k]; });
    if (result.data === undefined && result !== null && Object.keys(result).length === 0) response.data = {};
    return API_respond(response);
  } catch (err) {
    return API_respond({
      ok: false,
      error: err && err.message ? err.message : 'Unexpected server error.',
      code: err && err.code ? err.code : 'SERVER_ERROR',
      action: action
    });
  }
}

function API_permissionFor(action) {
  if (action === 'auth.login' || action === 'system.health') return null;
  if (action === 'auth.me' || action === 'auth.changePassword' || action === 'auth.logout') return 'dashboard.view';
  if (action.indexOf('dashboard.') === 0) return 'dashboard.view';
  if (action.indexOf('products.') === 0) {
    return (action === 'products.list' || action === 'products.get' || action === 'products.stockHistory') ? 'products.view' : 'products.edit';
  }
  if (action.indexOf('categories.') === 0) return action === 'categories.list' ? 'products.view' : 'products.edit';
  if (action.indexOf('inventory.') === 0) {
    return (action === 'inventory.list' || action === 'inventory.movements' || action === 'inventory.valuation') ? 'inventory.view' : 'inventory.edit';
  }
  if (action.indexOf('sales.') === 0) {
    if (action === 'sales.list' || action === 'sales.get' || action === 'sales.items') return 'sales.view';
    return action === 'sales.refund' ? 'sales.refund' : 'sales.create';
  }
  if (action.indexOf('orders.') === 0) {
    if (action === 'orders.list' || action === 'orders.get' || action === 'orders.items') return 'orders.view';
    return action === 'orders.convert' ? 'orders.convert' : 'orders.edit';
  }
  if (action.indexOf('customers.') === 0) return action === 'customers.list' || action === 'customers.get' || action === 'customers.history' ? 'customers.view' : 'customers.edit';
  if (action.indexOf('suppliers.') === 0) return action === 'suppliers.list' || action === 'suppliers.get' || action === 'suppliers.report' ? 'suppliers.view' : 'suppliers.edit';
  if (action.indexOf('purchases.') === 0) return action === 'purchases.list' || action === 'purchases.get' || action === 'purchases.items' ? 'purchases.view' : 'purchases.edit';
  if (action.indexOf('expenses.') === 0) return action === 'expenses.list' || action === 'expenses.summary' ? 'expenses.view' : 'expenses.edit';
  if (action.indexOf('reports.') === 0) return 'reports.view';
  if (action.indexOf('settings.') === 0) return 'settings.view';
  if (action.indexOf('users.') === 0) return 'users.view';
  return 'dashboard.view';
}

var API_ROUTES = {
  'system.health': function () { return { data: { service: API_SERVICE_NAME, version: API_VERSION, sheetCount: Object.keys(DB_SCHEMA).length, time: DB_now() } }; },
  'auth.login': function (p) { return AUTH_login(p); },
  'auth.me': function (p, s) { return { data: { user: s } }; },
  'auth.logout': function (p, s, req) {
    if (req && req.token) DB_update('Settings', 'SESSION_' + req.token, { value: '' }, 'key');
    return AUTH_logout(s, p);
  },
  'auth.changePassword': function (p, s) { return AUTH_changePassword(s, p); },

  'dashboard.summary': function (p, s) { return DASH_summary(p, s); },
  'dashboard.chart': function (p, s) { return { data: DASH_chart(String(p.metric || ''), p) }; },

  'products.list': function (p, s) { return { data: PRODUCTS_list(p) }; },
  'products.get': function (p, s) { return { data: PRODUCTS_get(p.id) }; },
  'products.save': function (p, s) { return PRODUCTS_save(p, s); },
  'products.status': function (p, s) { return PRODUCTS_status(p, s); },
  'products.import': function (p, s) { return PRODUCTS_import(p, s); },
  'products.stockHistory': function (p) { return { data: PRODUCTS_stockHistory(p.id) }; },
  'categories.list': function () { return { data: PRODUCTS_categories() }; },
  'categories.save': function (p, s) { return PRODUCTS_saveCategory(p, s); },

  'inventory.list': function (p) { return { data: INV_list(p) }; },
  'inventory.movements': function (p) { return { data: INV_movements(p) }; },
  'inventory.move': function (p, s) { return INV_move(p, s); },
  'inventory.adjust': function (p, s) { return INV_move(Object.assign({}, p, { type: 'ADJUST' }), s); },
  'inventory.damaged': function (p, s) { return INV_move(Object.assign({}, p, { type: 'DAMAGED' }), s); },
  'inventory.return': function (p, s) { return INV_move(Object.assign({}, p, { type: 'RETURN' }), s); },
  'inventory.valuation': function () { return { data: INV_valuation() }; },

  'sales.list': function (p) { return { data: SALES_list(p) }; },
  'sales.get': function (p) { return { data: SALES_get(p.id) }; },
  'sales.items': function (p) { return { data: SALES_items(p.id) }; },
  'sales.create': function (p, s, req) { return SALES_create(p, s, req); },
  'sales.refund': function (p, s, req) { return SALES_refund(p, s, req); },

  'orders.list': function (p) { return { data: ORDERS_list(p) }; },
  'orders.get': function (p) { return { data: ORDERS_get(p.id) }; },
  'orders.items': function (p) { return { data: ORDERS_items(p.id) }; },
  'orders.save': function (p, s, req) { return ORDERS_save(p, s, req); },
  'orders.status': function (p, s) { return ORDERS_status(p, s); },
  'orders.convert': function (p, s, req) { return ORDERS_convert(p, s, req); },

  'customers.list': function (p) { return { data: CUST_list(p) }; },
  'customers.get': function (p) { return { data: CUST_get(p.id) }; },
  'customers.save': function (p, s, req) { return CUST_save(p, s, req); },
  'customers.delete': function (p, s) { return CUST_delete(p, s); },
  'customers.history': function (p) { return { data: CUST_history(p.id) }; },

  'suppliers.list': function (p) { return { data: SUPP_list(p) }; },
  'suppliers.get': function (p) { return { data: SUPP_get(p.id) }; },
  'suppliers.save': function (p, s, req) { return SUPP_save(p, s, req); },
  'suppliers.delete': function (p, s) { return SUPP_delete(p, s); },
  'suppliers.report': function (p) { return { data: SUPP_report(p.id) }; },

  'purchases.list': function (p) { return { data: PURCH_list(p) }; },
  'purchases.get': function (p) { return { data: PURCH_get(p.id) }; },
  'purchases.items': function (p) { return { data: PURCH_items(p.id) }; },
  'purchases.save': function (p, s, req) { return PURCH_save(p, s, req); },
  'purchases.receive': function (p, s, req) { return PURCH_receive(p, s, req); },

  'expenses.list': function (p) { return { data: EXP_list(p) }; },
  'expenses.summary': function (p) { return { data: EXP_summary(p) }; },
  'expenses.save': function (p, s, req) { return EXP_save(p, s, req); },
  'expenses.delete': function (p, s) { return EXP_delete(p, s); },

  'settings.list': function () { return { data: SETTINGS_list() }; },
  'settings.save': function (p, s) { return SETTINGS_save(p, s); },
  'settings.audit': function (p) { return { data: SETTINGS_audit(p) }; },

  'users.list': function () { return { data: USERS_list() }; },
  'users.save': function (p, s, req) { return USERS_save(p, s, req); },
  'users.status': function (p, s) { return USERS_status(p, s); }
};
