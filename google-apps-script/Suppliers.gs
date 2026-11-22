/* ==========================================================================
   Ocson Inc. Store — Suppliers.gs
   ========================================================================== */

function SUPP_public(s) {
  return {
    id: s.id, name: s.name, contactPerson: s.contactPerson, phone: s.phone, email: s.email,
    address: s.address, paymentTerms: s.paymentTerms, notes: s.notes, status: s.status || 'Active',
    balance: DB_num(s.balance), totalPurchases: DB_num(s.totalPurchases),
    purchaseCount: DB_int(s.purchaseCount), productCount: DB_int(s.productCount), dateAdded: s.dateAdded
  };
}

function SUPP_list(params) {
  var purchases = DB_all('Purchases');
  var products = DB_all('Products');
  var rows = DB_all('Suppliers').map(function (s) {
    var out = SUPP_public(s);
    var mine = purchases.filter(function (p) { return String(p.supplierId) === String(s.id); });
    out.totalPurchases = Utils_sum(mine, function (p) { return DB_num(p.total); });
    out.purchaseCount = mine.length;
    out.productCount = products.filter(function (pr) {
      return String(pr.supplierId) === String(s.id) || String(pr.supplier) === String(s.name);
    }).length;
    out.balance = Utils_sum(mine.filter(function (p) {
      return String(p.paymentStatus).toLowerCase() !== 'paid';
    }), function (p) { return DB_num(p.total); });
    return out;
  });
  var q = DB_clean(params.q).toLowerCase();
  if (q) rows = rows.filter(function (s) { return String(s.name + ' ' + (s.contactPerson || '') + ' ' + (s.phone || '')).toLowerCase().indexOf(q) >= 0; });
  rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  var limit = Math.min(2000, Math.max(1, DB_int(params.limit) || 300));
  return rows.slice(0, limit);
}

function SUPP_get(id) {
  var s = DB_find('Suppliers', id);
  if (!s) fail('Supplier not found.', 'NOT_FOUND');
  return SUPP_public(s);
}

function SUPP_save(p, session, req) {
  DB_assertFresh(req && req.requestId);
  var name = DB_clean(p.name);
  if (name.length < 2) fail('Supplier name is required.', 'VALIDATION');
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) fail('Enter a valid email address.', 'VALIDATION');
  var existing = p.id ? DB_find('Suppliers', p.id) : null;
  var data = { name: name, contactPerson: DB_clean(p.contactPerson), phone: DB_clean(p.phone),
    email: DB_clean(p.email), address: DB_clean(p.address), paymentTerms: DB_clean(p.paymentTerms),
    notes: DB_clean(p.notes), status: DB_clean(p.status) || 'Active', requestId: req.requestId || '' };
  var supplier;
  if (existing) {
    supplier = DB_update('Suppliers', existing.id, data);
    DB_log('UPDATE', 'Suppliers', supplier.id, 'Supplier updated', session, req.requestId);
  } else {
    data.id = DB_id('SUP'); data.dateAdded = DB_now(); data.balance = 0; data.totalPurchases = 0;
    data.purchaseCount = 0; data.productCount = 0;
    supplier = DB_insert('Suppliers', data);
    DB_log('CREATE', 'Suppliers', supplier.id, 'Supplier registered', session, req.requestId);
  }
  return { data: SUPP_public(supplier) };
}

function SUPP_delete(p, session, req) {
  DB_assertFresh(req && req.requestId);
  var s = DB_find('Suppliers', p.id || p);
  if (!s) fail('Supplier not found.', 'NOT_FOUND');
  DB_remove('Suppliers', s.id);
  DB_log('DELETE', 'Suppliers', s.id, 'Supplier removed', session, req.requestId);
  return { data: { id: s.id, deleted: true } };
}

function SUPP_report(id) {
  var supplier = DB_find('Suppliers', id);
  if (!supplier) fail('Supplier not found.', 'NOT_FOUND');
  var purchases = DB_filter('Purchases', function (p) { return String(p.supplierId) === String(id); })
    .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
    .map(PURCH_public);
  var products = DB_filter('Products', function (p) {
    return String(p.supplierId) === String(id) || String(p.supplier) === String(supplier.name);
  }).map(PRODUCTS_public);
  return {
    supplier: SUPP_public(supplier),
    purchases: purchases,
    products: products,
    totalPurchases: Utils_sum(purchases, function (p) { return DB_num(p.total); }),
    balance: Utils_sum(purchases.filter(function (p) { return String(p.paymentStatus).toLowerCase() !== 'paid'; }),
      function (p) { return DB_num(p.total); })
  };
}
