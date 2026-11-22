/* ==========================================================================
   Ocson Inc. Store — Customers.gs
   ========================================================================== */

function CUST_public(c) {
  return {
    id: c.id, name: c.name, phone: c.phone, email: c.email, address: c.address,
    notes: c.notes, balance: DB_num(c.balance), totalSpent: DB_num(c.totalSpent),
    purchaseCount: DB_int(c.purchaseCount), dateAdded: c.dateAdded
  };
}

function CUST_list(params) {
  var sales = DB_all('Sales');
  var rows = DB_all('Customers').map(function (c) {
    var out = CUST_public(c);
    var mine = sales.filter(function (s) { return String(s.customerId) === String(c.id) && String(s.status).toLowerCase() !== 'refunded'; });
    out.totalSpent = Utils_sum(mine, function (s) { return DB_num(s.total) - DB_num(s.refunded); });
    out.purchaseCount = mine.length;
    return out;
  });
  var q = DB_clean(params.q).toLowerCase();
  if (q) rows = rows.filter(function (c) { return String(c.name + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase().indexOf(q) >= 0; });
  rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  var limit = Math.min(2000, Math.max(1, DB_int(params.limit) || 500));
  return rows.slice(0, limit);
}

function Utils_sum(arr, fn) {
  var total = 0;
  for (var i = 0; i < arr.length; i++) total += Number(fn ? fn(arr[i]) : arr[i]) || 0;
  return total;
}

function CUST_get(id) {
  var c = DB_find('Customers', id);
  if (!c) fail('Customer not found.', 'NOT_FOUND');
  return CUST_public(c);
}

function CUST_save(p, session, req) {
  DB_assertFresh(req && req.requestId);
  var name = DB_clean(p.name);
  if (name.length < 2) fail('Customer name is required.', 'VALIDATION');
  var phone = DB_clean(p.phone);
  if (phone && !/^[+\d][\d\s()-]{5,}$/.test(phone)) fail('Enter a valid phone number.', 'VALIDATION');
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) fail('Enter a valid email address.', 'VALIDATION');

  var existing = p.id ? DB_find('Customers', p.id) : null;
  var data = { name: name, phone: phone, email: DB_clean(p.email), address: DB_clean(p.address),
    notes: DB_clean(p.notes), balance: DB_num(p.balance), requestId: req.requestId || '' };
  var customer;
  if (existing) {
    customer = DB_update('Customers', existing.id, data);
    DB_log('UPDATE', 'Customers', customer.id, 'Customer updated', session, req.requestId);
  } else {
    data.id = DB_id('CUS'); data.dateAdded = DB_now(); data.totalSpent = 0; data.purchaseCount = 0;
    customer = DB_insert('Customers', data);
    DB_log('CREATE', 'Customers', customer.id, 'Customer registered', session, req.requestId);
  }
  return { data: CUST_public(customer) };
}

function CUST_delete(p, session, req) {
  DB_assertFresh(req && req.requestId);
  var c = DB_find('Customers', p.id || p);
  if (!c) fail('Customer not found.', 'NOT_FOUND');
  DB_remove('Customers', c.id);
  DB_log('DELETE', 'Customers', c.id, 'Customer removed', session, req.requestId);
  return { data: { id: c.id, deleted: true } };
}

function CUST_history(id) {
  var rows = DB_filter('Sales', function (s) { return String(s.customerId) === String(id); });
  rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  return rows.map(SALES_public);
}
