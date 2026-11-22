/* ==========================================================================
   Ocson Inc. Store — Inventory.gs
   Stock movements, adjustments and inventory valuation.
   ========================================================================== */

function INV_list(params) {
  var rows = DB_all('Products').filter(function (p) {
    if (params.status && String(p.status || 'Active') !== params.status) return false;
    return true;
  });
  return rows.map(PRODUCTS_public);
}

function INV_movements(params) {
  var productId = DB_clean(params.productId);
  var from = DB_date(params.from), to = DB_date(params.to);
  var rows = DB_filter('Stock_Movements', function (m) {
    if (productId && String(m.productId) !== productId) return false;
    var day = DB_date(m.date);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
  rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  var limit = Math.min(1000, Math.max(1, DB_int(params.limit) || 300));
  return rows.slice(0, limit).map(function (m) {
    return {
      id: m.id, productId: m.productId, productName: m.productName, type: m.type,
      transactionType: m.type, quantity: DB_num(m.quantity), previousStock: DB_num(m.previousStock),
      newStock: DB_num(m.newStock), date: m.date, user: m.user, reason: m.reason, reference: m.reference
    };
  });
}

/** Records a movement. Caller must hold the script lock for stock-changing flows. */
function INV_recordMovement(product, type, quantity, previous, next, session, reason, requestId, relatedId) {
  return DB_insert('Stock_Movements', {
    id: DB_id('MOV'),
    productId: product.id,
    productName: product.name,
    type: type,
    quantity: DB_num(quantity),
    previousStock: DB_num(previous),
    newStock: DB_num(next),
    date: DB_now(),
    user: session ? session.name : 'system',
    userId: session ? session.id : '',
    reason: reason || '',
    reference: DB_clean(product.reference || ''),
    requestId: requestId || '',
    relatedId: relatedId || ''
  });
}

function INV_move(p, session, req) {
  var lock = DB_lock();
  try {
    DB_assertFresh(req && req.requestId);
    var type = DB_clean(p.type).toUpperCase();
    if (['ADD','DEDUCT','ADJUST','DAMAGED','RETURN','OPENING'].indexOf(type) < 0) fail('Invalid movement type.', 'VALIDATION');
    var product = DB_find('Products', p.productId);
    if (!product) fail('Product not found.', 'NOT_FOUND');
    var qty = DB_num(p.quantity);
    if (qty <= 0) fail('Quantity must be greater than zero.', 'VALIDATION');
    if (type === 'ADJUST' && !/^\d+$/.test(String(qty))) fail('Adjustment quantity must be a whole number.', 'VALIDATION');
    var previous = DB_int(product.stock);
    var next = previous;

    if (type === 'ADD' || type === 'RETURN' || type === 'OPENING') next = previous + qty;
    else if (type === 'DEDUCT' || type === 'DAMAGED') next = previous - qty;
    else next = qty;

    if (next < 0) fail('Insufficient stock for ' + product.name + '. Available: ' + previous + '.', 'INSUFFICIENT_STOCK');

    DB_update('Products', product.id, { stock: next });
    DB_update('Inventory', product.id, { stock: next, updatedAt: DB_now() });
    var movement = INV_recordMovement(product, type, qty, previous, next, session,
      DB_clean(p.reason) || (type + ' stock adjustment'), req.requestId, DB_clean(p.reference));
    DB_log('STOCK_' + type, 'Inventory', product.id,
      product.name + ': ' + previous + ' → ' + next + ' (' + (p.reason || '') + ')', session, req.requestId);

    return { data: {
      id: movement.id, productId: product.id, productName: product.name, type: type,
      quantity: qty, previousStock: previous, newStock: next, date: movement.date,
      user: movement.user, reason: movement.reason
    } };
  } finally { lock.releaseLock(); }
}

function INV_valuation() {
  var rows = DB_all('Products');
  var cost = 0, retail = 0, units = 0;
  rows.forEach(function (p) {
    var stock = DB_int(p.stock);
    units += stock;
    cost += stock * DB_num(p.costPrice);
    retail += stock * DB_num(p.sellingPrice);
  });
  return { totalUnits: units, costValue: cost, retailValue: retail, potentialProfit: retail - cost,
    items: rows.map(function (p) {
      return { name: p.name, sku: p.sku, stock: DB_int(p.stock), costPrice: DB_num(p.costPrice),
        costValue: DB_int(p.stock) * DB_num(p.costPrice), retailValue: DB_int(p.stock) * DB_num(p.sellingPrice) };
    }) };
}
