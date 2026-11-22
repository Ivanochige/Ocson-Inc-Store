/* ==========================================================================
   Ocson Inc. Store — Products.gs
   ========================================================================== */

function PRODUCTS_public(p) {
  if (!p) return null;
  return {
    id: p.id, name: p.name, sku: p.sku, description: p.description,
    category: p.category, brand: p.brand, imageUrl: p.imageUrl,
    costPrice: DB_num(p.costPrice), sellingPrice: DB_num(p.sellingPrice),
    stock: DB_int(p.stock), minStock: DB_int(p.minStock),
    supplier: p.supplier, supplierId: p.supplierId,
    dateAdded: p.dateAdded, status: p.status || 'Active'
  };
}

function PRODUCTS_list(params) {
  var q = DB_clean(params.q).toLowerCase();
  var category = DB_clean(params.category);
  var status = DB_clean(params.status);
  var rows = DB_all('Products').filter(function (p) {
    if (q && String(p.name + ' ' + (p.sku || '') + ' ' + (p.brand || '')).toLowerCase().indexOf(q) < 0) return false;
    if (category && String(p.category) !== category) return false;
    if (status && String(p.status || 'Active') !== status) return false;
    return true;
  });
  rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  var page = Math.max(1, DB_int(params.page) || 1);
  var per = Math.min(200, Math.max(1, DB_int(params.per) || 20));
  var start = (page - 1) * per;
  return { items: rows.slice(start, start + per).map(PRODUCTS_public), total: rows.length, page: page, per: per };
}

function PRODUCTS_get(id) {
  var p = DB_find('Products', id);
  if (!p) fail('Product not found.', 'NOT_FOUND');
  return PRODUCTS_public(p);
}

function PRODUCTS_save(p, session, req) {
  var lock = DB_lock();
  try {
    DB_assertFresh(req && req.requestId);
    var name = DB_clean(p.name), sku = DB_clean(p.sku);
    if (name.length < 2) fail('Product name is required (minimum 2 characters).', 'VALIDATION');
    if (sku.length < 2) fail('SKU / barcode is required.', 'VALIDATION');
    var cost = DB_num(p.costPrice), price = DB_num(p.sellingPrice);
    var stock = DB_int(p.stock), minStock = DB_int(p.minStock);
    if (cost < 0 || price < 0) fail('Prices cannot be negative.', 'VALIDATION');
    if (price < cost) fail('Selling price cannot be below cost price.', 'VALIDATION');
    if (stock < 0) fail('Stock cannot be negative.', 'VALIDATION');

    var existing = DB_find('Products', p.id);
    var bySku = DB_findBy('Products', 'sku', sku);
    if (bySku && String(bySku.id) !== String(existing ? existing.id : '')) fail('SKU "' + sku + '" is already used by another product.', 'DUPLICATE_SKU');

    var data = {
      name: name, sku: sku, description: DB_clean(p.description), category: DB_clean(p.category) || 'General',
      brand: DB_clean(p.brand), imageUrl: DB_clean(p.imageUrl), costPrice: cost, sellingPrice: price,
      stock: stock, minStock: minStock, supplier: DB_clean(p.supplier), supplierId: DB_clean(p.supplierId),
      status: DB_clean(p.status) || 'Active', requestId: req.requestId || ''
    };

    var product;
    if (existing) {
      product = DB_update('Products', existing.id, data);
      DB_update('Inventory', existing.id, { name: name, sku: sku, category: data.category, costPrice: cost, sellingPrice: price, stock: stock, updatedAt: DB_now() });
      DB_log('UPDATE', 'Products', existing.id, 'Product updated', session, req.requestId);
    } else {
      data.id = DB_id('PRD');
      data.dateAdded = DB_now();
      product = DB_insert('Products', data);
      DB_insert('Inventory', {
        id: DB_id('INV'), productId: product.id, name: name, sku: sku, category: data.category,
        stock: stock, costPrice: cost, sellingPrice: price, updatedAt: DB_now(), requestId: req.requestId || ''
      });
      if (stock > 0) {
        INV_recordMovement(product, 'OPENING', stock, 0, stock, session, 'Opening stock', req.requestId, product.id);
      }
      DB_log('CREATE', 'Products', product.id, 'Product created', session, req.requestId);
    }
    return { data: PRODUCTS_public(product) };
  } finally {
    lock.releaseLock();
  }
}

function PRODUCTS_status(p, session, req) {
  var lock = DB_lock();
  try {
    DB_assertFresh(req && req.requestId);
    var product = DB_find('Products', p.id);
    if (!product) fail('Product not found.', 'NOT_FOUND');
    var status = String(p.status).toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
    DB_update('Products', product.id, { status: status });
    DB_log('STATUS', 'Products', product.id, 'Status set to ' + status, session, req.requestId);
    return { data: { id: product.id, status: status } };
  } finally { lock.releaseLock(); }
}

function PRODUCTS_import(p, session, req) {
  DB_assertFresh(req && req.requestId);
  var rows = p.rows || [];
  if (!rows.length) fail('No rows to import.', 'VALIDATION');
  var imported = 0, skipped = 0, errors = [];
  rows.forEach(function (row) {
    try {
      if (!DB_clean(row.name) || !DB_clean(row.sku)) { skipped++; return; }
      var payload = {
        name: row.name, sku: row.sku, description: row.description || '', category: row.category || 'General',
        brand: row.brand || '', costPrice: DB_num(row.cost_price != null ? row.cost_price : row.costPrice),
        sellingPrice: DB_num(row.selling_price != null ? row.selling_price : row.sellingPrice),
        stock: DB_int(row.current_stock != null ? row.current_stock : row.stock),
        minStock: DB_int(row.minimum_stock != null ? row.minimum_stock : row.minStock),
        supplier: row.supplier || '', status: row.status || 'Active', requestId: ''
      };
      if (payload.sellingPrice < payload.costPrice) { skipped++; return; }
      var data = {
        id: DB_id('PRD'), name: payload.name, sku: payload.sku, description: payload.description,
        category: payload.category, brand: payload.brand, costPrice: payload.costPrice,
        sellingPrice: payload.sellingPrice, stock: payload.stock, minStock: payload.minStock,
        supplier: payload.supplier, status: payload.status, dateAdded: DB_now(), requestId: ''
      };
      DB_insert('Products', data);
      DB_insert('Inventory', { id: DB_id('INV'), productId: data.id, name: data.name, sku: data.sku,
        category: data.category, stock: data.stock, costPrice: data.costPrice,
        sellingPrice: data.sellingPrice, updatedAt: DB_now(), requestId: '' });
      imported++;
    } catch (e) { skipped++; errors.push(String(e.message)); }
  });
  DB_log('IMPORT', 'Products', '', 'Imported ' + imported + ' products, skipped ' + skipped, session, req.requestId);
  return { data: { imported: imported, skipped: skipped, errors: errors.slice(0, 10) } };
}

function PRODUCTS_stockHistory(id) {
  var rows = DB_filter('Stock_Movements', function (m) { return String(m.productId) === String(id); });
  rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  return rows.slice(0, 100).map(function (m) {
    return {
      id: m.id, date: m.date, type: m.type, transactionType: m.type,
      quantity: DB_num(m.quantity), previousStock: DB_num(m.previousStock), newStock: DB_num(m.newStock),
      user: m.user, reason: m.reason, reference: m.reference, productId: m.productId
    };
  });
}

function PRODUCTS_categories() {
  var rows = DB_all('Categories').filter(function (c) { return String(c.status || 'Active') === 'Active'; });
  rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  return rows.map(function (c) { return { id: c.id, name: c.name, description: c.description, status: c.status }; });
}

function PRODUCTS_saveCategory(p, session, req) {
  DB_assertFresh(req && req.requestId);
  var name = DB_clean(p.name);
  if (name.length < 2) fail('Category name is required.', 'VALIDATION');
  var existing = DB_findBy('Categories', 'name', name);
  if (existing && String(existing.id) !== String(p.id || '')) fail('Category already exists.', 'DUPLICATE');
  var cat = existing || { id: DB_id('CAT'), name: name, description: DB_clean(p.description), status: 'Active' };
  if (existing) DB_update('Categories', existing.id, { description: DB_clean(p.description), status: DB_clean(p.status) || 'Active' });
  else DB_insert('Categories', cat);
  DB_log('SAVE', 'Categories', cat.id, 'Category saved', session, req.requestId);
  return { data: cat };
}
