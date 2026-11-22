/* ==========================================================================
   Ocson Inc. Store — Orders.gs
   Orders reserve nothing; stock is deducted exactly once on conversion.
   ========================================================================== */

var ORDER_STATUSES = ['Pending','Confirmed','Processing','Ready for Collection','Dispatched','Delivered','Cancelled','Converted'];

function ORDERS_public(o) {
  return {
    id: o.id, date: o.date, customerId: o.customerId, customerName: o.customerName,
    phone: o.phone, email: o.email, deliveryAddress: o.deliveryAddress,
    itemCount: DB_int(o.itemCount), total: DB_num(o.total), discount: DB_num(o.discount),
    paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, status: o.status,
    notes: o.notes, reference: o.reference, user: o.user, convertedSaleId: o.convertedSaleId
  };
}

function ORDERS_list(params) {
  var rows = DB_all('Orders');
  if (params.status) rows = rows.filter(function (o) { return o.status === params.status; });
  rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  var limit = Math.min(2000, Math.max(1, DB_int(params.limit) || 300));
  return rows.slice(0, limit).map(ORDERS_public);
}

function ORDERS_get(id) {
  var o = DB_find('Orders', id);
  if (!o) fail('Order not found.', 'NOT_FOUND');
  var out = ORDERS_public(o);
  out.items = ORDERS_items(id);
  return out;
}

function ORDERS_items(orderId) {
  return DB_filter('Order_Items', function (i) { return String(i.orderId) === String(orderId); }).map(function (i) {
    return { id: i.id, orderId: i.orderId, productId: i.productId, productName: i.productName,
      quantity: DB_int(i.quantity), unitPrice: DB_num(i.unitPrice), lineTotal: DB_num(i.lineTotal) };
  });
}

function ORDERS_save(p, session, req) {
  var lock = DB_lock();
  try {
    DB_assertFresh(req && req.requestId);
    var items = p.items || [];
    if (!items.length) fail('Add at least one item to the order.', 'VALIDATION');
    var customer = p.customerId ? DB_find('Customers', p.customerId) : null;
    var customerName = customer ? customer.name : (DB_clean(p.customerName) || 'Walk-in Customer');

    var lines = [], subtotal = 0;
    items.forEach(function (item) {
      var product = DB_find('Products', item.productId);
      if (!product) fail('Product not found for an order item.', 'NOT_FOUND');
      var qty = DB_int(item.quantity);
      if (qty <= 0) fail('Invalid order quantity.', 'VALIDATION');
      var unit = DB_num(product.sellingPrice);
      subtotal += qty * unit;
      lines.push({ productId: product.id, productName: product.name, quantity: qty, unitPrice: unit, lineTotal: qty * unit });
    });
    var discount = Math.min(DB_num(p.discount), subtotal);
    var total = Math.max(0, subtotal - discount);

    var order;
    if (p.id) {
      order = DB_find('Orders', p.id);
      if (!order) fail('Order not found.', 'NOT_FOUND');
      if (['Converted','Cancelled','Delivered'].indexOf(order.status) >= 0) fail('This order can no longer be edited.', 'INVALID_STATE');
      DB_update('Orders', order.id, {
        customerId: customer ? customer.id : '', customerName: customerName,
        phone: DB_clean(p.phone), email: DB_clean(p.email), deliveryAddress: DB_clean(p.deliveryAddress),
        date: DB_date(p.date) || DB_date(order.date), total: total, discount: discount,
        itemCount: lines.length, paymentMethod: DB_clean(p.paymentMethod) || 'Cash',
        paymentStatus: DB_clean(p.paymentStatus) || 'Pending', notes: DB_clean(p.notes),
        reference: DB_clean(p.reference)
      });
    } else {
      order = {
        id: DB_id('ORD'), date: DB_date(p.date) || DB_now().slice(0, 10),
        customerId: customer ? customer.id : '', customerName: customerName,
        phone: DB_clean(p.phone), email: DB_clean(p.email), deliveryAddress: DB_clean(p.deliveryAddress),
        itemCount: lines.length, total: total, discount: discount,
        paymentMethod: DB_clean(p.paymentMethod) || 'Cash', paymentStatus: DB_clean(p.paymentStatus) || 'Pending',
        status: 'Pending', notes: DB_clean(p.notes), reference: DB_clean(p.reference),
        userId: session ? session.id : '', user: session ? session.name : 'system',
        convertedSaleId: '', requestId: req.requestId || ''
      };
      DB_insert('Orders', order);
    }

    // Replace line items for both create and edit.
    var existingItems = DB_filter('Order_Items', function (i) { return String(i.orderId) === String(order.id); });
    existingItems.forEach(function (i) { DB_remove('Order_Items', i.id); });
    lines.forEach(function (line) {
      DB_insert('Order_Items', {
        id: DB_id('OI'), orderId: order.id, productId: line.productId, productName: line.productName,
        quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal, requestId: req.requestId || ''
      });
    });

    DB_log(p.id ? 'UPDATE' : 'CREATE', 'Orders', order.id, 'Order ' + order.id + ' saved', session, req.requestId);
    return { data: ORDERS_public(order) };
  } finally { lock.releaseLock(); }
}

function ORDERS_status(p, session, req) {
  var lock = DB_lock();
  try {
    DB_assertFresh(req && req.requestId);
    var order = DB_find('Orders', p.id);
    if (!order) fail('Order not found.', 'NOT_FOUND');
    if (ORDER_STATUSES.indexOf(p.status) < 0) fail('Invalid order status.', 'VALIDATION');
    if (order.status === 'Converted') fail('A converted order cannot change status.', 'INVALID_STATE');
    DB_update('Orders', order.id, { status: p.status });
    DB_log('STATUS', 'Orders', order.id, 'Status set to ' + p.status, session, req.requestId);
    return { data: { id: order.id, status: p.status } };
  } finally { lock.releaseLock(); }
}

function ORDERS_convert(p, session, req) {
  var lock = DB_lock();
  try {
    var order = DB_find('Orders', p.id);
    if (!order) fail('Order not found.', 'NOT_FOUND');
    if (order.convertedSaleId) fail('This order has already been converted to a sale.', 'ALREADY_CONVERTED');
    if (order.status === 'Cancelled') fail('Cancelled orders cannot be converted.', 'INVALID_STATE');
    var items = ORDERS_items(order.id);
    if (!items.length) fail('This order has no items.', 'VALIDATION');

    var saleResult = SALES_create({
      items: items.map(function (i) { return { productId: i.productId, quantity: i.quantity }; }),
      discount: order.discount,
      paymentMethod: p.paymentMethod || order.paymentMethod || 'Cash',
      customerId: order.customerId,
      customerName: order.customerName,
      amountPaid: p.amountPaid || 0,
      requestId: req.requestId || ''
    }, session, req, order, { alreadyLocked: true });

    DB_update('Orders', order.id, { status: 'Converted', convertedSaleId: saleResult.data.id });
    // Conversion audit uses a derived id so the sale's idempotency key stays unique.
    DB_log('CONVERT', 'Orders', order.id, 'Converted to ' + saleResult.receiptNo, session, (req.requestId || '') + '_order');
    return { data: { sale: saleResult.data, receiptNo: saleResult.receiptNo, orderId: order.id } };
  } finally { lock.releaseLock(); }
}
