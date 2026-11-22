/* ==========================================================================
   Ocson Inc. Store — Sales.gs
   Transactional POS: server-side pricing, stock deduction, receipts, refunds.
   ========================================================================== */

function SALES_public(s) {
  return {
    id: s.id, receiptNo: s.receiptNo, date: s.date,
    customerId: s.customerId, customerName: s.customerName || 'Walk-in Customer',
    subtotal: DB_num(s.subtotal), discount: DB_num(s.discount), total: DB_num(s.total),
    cogs: DB_num(s.cogs), paymentMethod: s.paymentMethod, paymentStatus: s.paymentStatus,
    amountPaid: DB_num(s.amountPaid), changeAmount: DB_num(s.changeAmount),
    status: s.status, user: s.user, userId: s.userId, orderId: s.orderId,
    refunded: DB_num(s.refunded), refundDate: s.refundDate, refundReason: s.refundReason
  };
}

function SALES_list(params) {
  var from = DB_date(params.from), to = DB_date(params.to);
  var rows = DB_filter('Sales', function (s) {
    var day = DB_date(s.date);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
  rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  var limit = Math.min(2000, Math.max(1, DB_int(params.limit) || 300));
  return rows.slice(0, limit).map(SALES_public);
}

function SALES_get(id) {
  var s = DB_find('Sales', id);
  if (!s) fail('Sale not found.', 'NOT_FOUND');
  var out = SALES_public(s);
  out.items = SALES_items(id);
  return out;
}

function SALES_items(saleId) {
  return DB_filter('Sale_Items', function (i) { return String(i.saleId) === String(saleId); }).map(function (i) {
    return {
      id: i.id, saleId: i.saleId, productId: i.productId, productName: i.productName, sku: i.sku,
      quantity: DB_int(i.quantity), unitPrice: DB_num(i.unitPrice), costPrice: DB_num(i.costPrice),
      lineTotal: DB_num(i.lineTotal), lineCost: DB_num(i.lineCost)
    };
  });
}

function SALES_nextReceipt() {
  var d = new Date();
  var prefix = 'RCP-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-';
  var today = prefix.slice(0, 15);
  var count = DB_filter('Sales', function (s) { return String(s.receiptNo || '').indexOf(today) === 0; }).length + 1;
  return prefix + ('000' + count).slice(-3);
}

/** Creates a sale. Shared by POS and order conversion (orderId prevents double work). */
function SALES_create(p, session, req, order, opts) {
  var options = opts || {};
  var lock = options.alreadyLocked ? null : DB_lock();
  try {
    var requestId = req && req.requestId ? req.requestId : '';
    DB_assertFresh(requestId);
    // NOTE: when called from ORDERS_convert, the order's own requestId was already
    // logged when the order was saved. Duplicate conversion is prevented by the
    // convertedSaleId guard in ORDERS_convert, so do not re-check it here.
    if (requestId && DB_findBy('Sales', 'requestId', requestId)) fail('This sale was already submitted.', 'DUPLICATE_REQUEST');

    var items = p.items || [];
    if (!Array.isArray(items) || !items.length) fail('Add at least one product to the sale.', 'VALIDATION');

    var resolved = [], subtotal = 0, cogs = 0;
    var needed = {};
    items.forEach(function (item) {
      var product = DB_find('Products', item.productId);
      if (!product) fail('One of the products no longer exists.', 'NOT_FOUND');
      if (String(product.status || 'Active').toLowerCase() === 'inactive') fail(product.name + ' is inactive.', 'VALIDATION');
      var qty = DB_int(item.quantity);
      if (qty <= 0) fail('Invalid quantity for ' + product.name + '.', 'VALIDATION');
      needed[product.id] = (needed[product.id] || 0) + qty;
      var lineTotal = qty * DB_num(product.sellingPrice);
      var lineCost = qty * DB_num(product.costPrice);
      subtotal += lineTotal; cogs += lineCost;
      resolved.push({ product: product, quantity: qty, unitPrice: DB_num(product.sellingPrice),
        costPrice: DB_num(product.costPrice), lineTotal: lineTotal, lineCost: lineCost });
    });

    Object.keys(needed).forEach(function (pid) {
      var product = DB_find('Products', pid);
      if (DB_int(product.stock) < needed[pid]) fail('Insufficient stock for ' + product.name + '. Available: ' + product.stock + ', required: ' + needed[pid] + '.', 'INSUFFICIENT_STOCK');
    });

    var discount = Math.min(DB_num(p.discount), subtotal);
    if (discount < 0) fail('Discount cannot be negative.', 'VALIDATION');
    var total = Math.max(0, subtotal - discount);
    var method = DB_clean(p.paymentMethod) || 'Cash';
    if (['Cash','Mobile Money','Bank Transfer'].indexOf(method) < 0) fail('Select a valid payment method.', 'VALIDATION');

    var customer = p.customerId ? DB_find('Customers', p.customerId) : null;
    var customerName = customer ? customer.name : (DB_clean(p.customerName) || 'Walk-in Customer');

    var sale = {
      id: DB_id('SAL'), receiptNo: SALES_nextReceipt(), date: DB_now(),
      customerId: customer ? customer.id : '', customerName: customerName,
      subtotal: subtotal, discount: discount, total: total, cogs: cogs,
      paymentMethod: method, paymentStatus: 'Paid',
      amountPaid: DB_num(p.amountPaid), changeAmount: Math.max(0, DB_num(p.amountPaid) - total),
      status: 'Completed', userId: session ? session.id : '', user: session ? session.name : 'system',
      requestId: requestId, orderId: order ? order.id : '', refunded: 0, refundDate: '', refundReason: ''
    };
    DB_insert('Sales', sale);

    resolved.forEach(function (line) {
      DB_insert('Sale_Items', {
        id: DB_id('SI'), saleId: sale.id, productId: line.product.id, productName: line.product.name,
        sku: line.product.sku, quantity: line.quantity, unitPrice: line.unitPrice,
        costPrice: line.costPrice, lineTotal: line.lineTotal, lineCost: line.lineCost, requestId: requestId
      });
      var previous = DB_int(line.product.stock);
      var next = previous - line.quantity;
      DB_update('Products', line.product.id, { stock: next });
      DB_update('Inventory', line.product.id, { stock: next, updatedAt: DB_now() });
      INV_recordMovement(line.product, 'SALE_OUT', line.quantity, previous, next, session,
        'Sale ' + sale.receiptNo, requestId, sale.id);
    });

    if (customer) {
      DB_update('Customers', customer.id, {
        totalSpent: DB_num(customer.totalSpent) + total,
        purchaseCount: DB_int(customer.purchaseCount) + 1
      });
    }
    DB_insert('Payments', {
      id: DB_id('PAY'), date: sale.date, type: 'SALE', referenceId: sale.id,
      customerId: sale.customerId, supplierId: '', amount: total, method: method,
      status: 'Paid', userId: sale.userId, requestId: requestId
    });
    DB_log('SALE', 'Sales', sale.id, sale.receiptNo + ' · ' + Utils_number(total), session, requestId);
    if (order && order.id) DB_log('ORDER_CONVERT', 'Orders', order.id, 'Converted to sale ' + sale.receiptNo, session, requestId);

    var out = SALES_public(sale);
    out.items = SALES_items(sale.id);
    return { data: out, receiptNo: sale.receiptNo };
  } finally { if (lock) lock.releaseLock(); }
}

function Utils_number(n) { return String(DB_num(n)); }

function SALES_refund(p, session, req) {
  var lock = DB_lock();
  try {
    var requestId = req && req.requestId ? req.requestId : '';
    DB_assertFresh(requestId);
    if (requestId && DB_filter('Returns', function (r) { return r.requestId === requestId; }).length) fail('This refund was already submitted.', 'DUPLICATE_REQUEST');
    var sale = DB_find('Sales', p.saleId);
    if (!sale) fail('Sale not found.', 'NOT_FOUND');
    if (String(sale.status).toLowerCase() === 'refunded') fail('This sale has already been refunded.', 'ALREADY_REFUNDED');
    var amount = DB_num(p.amount);
    if (amount <= 0 || amount > DB_num(sale.total)) fail('Invalid refund amount.', 'VALIDATION');
    var reason = DB_clean(p.reason);
    if (reason.length < 3) fail('A refund reason is required.', 'VALIDATION');

    var items = SALES_items(sale.id);
    var ratio = amount / Math.max(0.01, DB_num(sale.total));
    items.forEach(function (item) {
      var product = DB_find('Products', item.productId);
      if (product) {
        var previous = DB_int(product.stock);
        var next = previous + DB_int(item.quantity);
        DB_update('Products', product.id, { stock: next });
        DB_update('Inventory', product.id, { stock: next, updatedAt: DB_now() });
        INV_recordMovement(product, 'RETURN', DB_int(item.quantity), previous, next, session,
          'Refund ' + sale.receiptNo + ' — ' + reason, requestId, sale.id);
      }
      DB_insert('Returns', {
        id: DB_id('RET'), date: DB_now(), saleId: sale.id, receiptNo: sale.receiptNo,
        customerId: sale.customerId, productId: item.productId, productName: item.productName,
        quantity: item.quantity, amount: DB_num(item.lineTotal) * ratio, reason: reason,
        userId: session ? session.id : '', requestId: requestId
      });
    });

    DB_update('Sales', sale.id, { status: 'Refunded', refunded: amount, refundDate: DB_now(), refundReason: reason });
    if (sale.customerId) {
      var customer = DB_find('Customers', sale.customerId);
      if (customer) DB_update('Customers', customer.id, { totalSpent: Math.max(0, DB_num(customer.totalSpent) - amount) });
    }
    DB_insert('Payments', { id: DB_id('PAY'), date: DB_now(), type: 'REFUND', referenceId: sale.id,
      customerId: sale.customerId, supplierId: '', amount: -amount, method: sale.paymentMethod,
      status: 'Refunded', userId: session ? session.id : '', requestId: requestId });
    DB_log('REFUND', 'Sales', sale.id, 'Refunded ' + amount + ' — ' + reason, session, requestId);
    return { data: { saleId: sale.id, amount: amount, status: 'Refunded' } };
  } finally { lock.releaseLock(); }
}
