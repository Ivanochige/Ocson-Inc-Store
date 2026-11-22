/* ==========================================================================
   Ocson Inc. Store — Purchases.gs
   Purchase orders and one-time stock receiving.
   ========================================================================== */

function PURCH_public(p) {
  return {
    id: p.id, supplierId: p.supplierId, supplierName: p.supplierName, date: p.date,
    reference: p.reference, total: DB_num(p.total), totalQuantity: DB_int(p.totalQuantity),
    itemCount: DB_int(p.itemCount), paymentStatus: p.paymentStatus, status: p.status,
    received: p.received === true || String(p.received) === 'true',
    receivedAt: p.receivedAt, receivedBy: p.receivedBy, notes: p.notes, user: p.user
  };
}

function PURCH_list(params) {
  var rows = DB_all('Purchases');
  rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  var limit = Math.min(2000, Math.max(1, DB_int(params.limit) || 300));
  return rows.slice(0, limit).map(PURCH_public);
}

function PURCH_get(id) {
  var p = DB_find('Purchases', id);
  if (!p) fail('Purchase not found.', 'NOT_FOUND');
  var out = PURCH_public(p);
  out.items = PURCH_items(id);
  return out;
}

function PURCH_items(purchaseId) {
  return DB_filter('Purchase_Items', function (i) { return String(i.purchaseId) === String(purchaseId); }).map(function (i) {
    return { id: i.id, purchaseId: i.purchaseId, productId: i.productId, productName: i.productName,
      quantity: DB_int(i.quantity), unitCost: DB_num(i.unitCost), lineTotal: DB_num(i.lineTotal), received: i.received };
  });
}

function PURCH_save(p, session, req) {
  var lock = DB_lock();
  try {
    DB_assertFresh(req && req.requestId);
    var items = p.items || [];
    if (!items.length) fail('Add at least one product to the purchase.', 'VALIDATION');
    var supplier = p.supplierId ? DB_find('Suppliers', p.supplierId) : null;
    if (!supplier) fail('Select a valid supplier.', 'VALIDATION');

    var lines = [], total = 0, totalQty = 0;
    items.forEach(function (item) {
      var product = DB_find('Products', item.productId);
      if (!product) fail('Product not found for a purchase item.', 'NOT_FOUND');
      var qty = DB_int(item.quantity);
      if (qty <= 0) fail('Invalid purchase quantity.', 'VALIDATION');
      var cost = DB_num(item.unitCost != null && item.unitCost !== '' ? item.unitCost : product.costPrice);
      if (cost < 0) fail('Unit cost cannot be negative.', 'VALIDATION');
      total += qty * cost; totalQty += qty;
      lines.push({ productId: product.id, productName: product.name, quantity: qty, unitCost: cost, lineTotal: qty * cost });
    });

    var purchase = {
      id: DB_id('PUR'), supplierId: supplier.id, supplierName: supplier.name,
      date: DB_date(p.date) || DB_now().slice(0, 10), reference: DB_clean(p.reference),
      total: total, totalQuantity: totalQty, itemCount: lines.length,
      paymentStatus: DB_clean(p.paymentStatus) || 'Pending', status: 'Pending',
      received: false, receivedAt: '', receivedBy: '', notes: DB_clean(p.notes),
      userId: session ? session.id : '', requestId: req.requestId || ''
    };
    DB_insert('Purchases', purchase);
    lines.forEach(function (line) {
      DB_insert('Purchase_Items', {
        id: DB_id('PI'), purchaseId: purchase.id, productId: line.productId, productName: line.productName,
        quantity: line.quantity, unitCost: line.unitCost, lineTotal: line.lineTotal,
        received: false, requestId: req.requestId || ''
      });
    });
    DB_log('CREATE', 'Purchases', purchase.id, 'Purchase order created for ' + supplier.name, session, req.requestId);
    return { data: PURCH_public(purchase) };
  } finally { lock.releaseLock(); }
}

function PURCH_receive(p, session, req) {
  var lock = DB_lock();
  try {
    DB_assertFresh(req && req.requestId);
    var purchase = DB_find('Purchases', p.id);
    if (!purchase) fail('Purchase not found.', 'NOT_FOUND');
    if (purchase.received === true || String(purchase.received) === 'true') fail('This purchase has already been received.', 'ALREADY_RECEIVED');

    var lines = PURCH_items(purchase.id);
    if (!lines.length) fail('This purchase has no items.', 'VALIDATION');
    lines.forEach(function (line) {
      var product = DB_find('Products', line.productId);
      if (!product) fail('Product not found while receiving purchase.', 'NOT_FOUND');
      var previous = DB_int(product.stock);
      var next = previous + DB_int(line.quantity);
      DB_update('Products', product.id, { stock: next, costPrice: line.unitCost });
      DB_update('Inventory', product.id, { stock: next, costPrice: line.unitCost, updatedAt: DB_now() });
      INV_recordMovement(product, 'PURCHASE_IN', line.quantity, previous, next, session,
        'Purchase ' + purchase.id + (purchase.reference ? ' · ' + purchase.reference : ''), req.requestId, purchase.id);
      DB_update('Purchase_Items', line.id, { received: true });
    });
    DB_update('Purchases', purchase.id, { received: true, receivedAt: DB_now(), receivedBy: session ? session.name : 'system', status: 'Received' });
    DB_insert('Payments', { id: DB_id('PAY'), date: DB_now(), type: 'PURCHASE', referenceId: purchase.id,
      customerId: '', supplierId: purchase.supplierId, amount: DB_num(purchase.total),
      method: 'Bank Transfer', status: purchase.paymentStatus || 'Pending', userId: session ? session.id : '', requestId: req.requestId || '' });

    if (purchase.supplierId) {
      var supplier = DB_find('Suppliers', purchase.supplierId);
      if (supplier) {
        var outstanding = String(purchase.paymentStatus).toLowerCase() === 'paid' ? 0 : DB_num(purchase.total);
        DB_update('Suppliers', supplier.id, {
          totalPurchases: DB_num(supplier.totalPurchases) + DB_num(purchase.total),
          purchaseCount: DB_int(supplier.purchaseCount) + 1,
          balance: DB_num(supplier.balance) + outstanding
        });
      }
    }
    DB_log('RECEIVE', 'Purchases', purchase.id, 'Stock received for purchase ' + purchase.id, session, req.requestId);
    return { data: { id: purchase.id, received: true, receivedAt: DB_now() } };
  } finally { lock.releaseLock(); }
}
