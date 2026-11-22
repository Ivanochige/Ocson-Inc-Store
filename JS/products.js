/* ==========================================================================
   Ocson Inc. Store — Product management
   ========================================================================== */
(function () {
  'use strict';

  const Page = {
    title: 'Products',
    subtitle: 'Manage catalogue, pricing and product details',
    state: { q: '', category: '', status: '', page: 1, per: 20, items: [], categories: [] },

    async init() {
      this.state.q = Utils.params().get('q') || '';
      this.render();
      this.bind();
      await Promise.all([this.loadCategories(), this.load()]);
    },

    render() {
      Utils.$('#page-body').innerHTML =
        '<div class="page-heading"><div><h2>Product catalogue</h2>' +
        '<p>All products, pricing and stock levels from your Google Sheet database.</p></div>' +
        '<div class="row row-wrap">' +
        (Auth.can('products.import') ? '<button class="btn btn-ghost" id="prod-import"><i data-lucide="file-up"></i> Import CSV</button>' : '') +
        '<button class="btn btn-ghost" id="prod-export"><i data-lucide="file-down"></i> Export CSV</button>' +
        (Auth.can('products.edit') ? '<button class="btn btn-primary" id="prod-add"><i data-lucide="plus"></i> Add product</button>' : '') +
        '</div></div>' +
        '<div class="card"><div class="card-body">' +
        '<div class="filter-bar">' +
        '<input class="form-control search-input" id="prod-q" placeholder="Search name, SKU, brand…" value="' + Utils.attr(this.state.q) + '">' +
        '<select class="form-select" id="prod-category"><option value="">All categories</option></select>' +
        '<select class="form-select" id="prod-status"><option value="">All statuses</option><option value="Active">Active</option><option value="Inactive">Inactive</option></select>' +
        '<span class="muted text-sm" id="prod-count"></span>' +
        '</div>' +
        '<div id="prod-table"><div class="skeleton-list">' + Array.from({ length: 6 }, () => '<div class="skeleton skeleton-row"></div>').join('') + '</div></div>' +
        '<div class="table-footer"><span id="prod-page-info"></span><div class="pagination" id="prod-pagination"></div></div>' +
        '</div></div>';
      Utils.repaintIcons(Utils.$('#page-body'));
    },

    bind() {
      const q = Utils.$('#prod-q');
      q.addEventListener('input', Utils.debounce(() => { this.state.q = q.value; this.state.page = 1; this.load(); }, 300));
      Utils.$('#prod-category').addEventListener('change', (e) => { this.state.category = e.target.value; this.state.page = 1; this.load(); });
      Utils.$('#prod-status').addEventListener('change', (e) => { this.state.status = e.target.value; this.state.page = 1; this.load(); });
      Utils.$('#prod-add')?.addEventListener('click', () => this.form());
      Utils.$('#prod-import')?.addEventListener('click', () => this.import());
      Utils.$('#prod-export').addEventListener('click', () => this.export());
      Utils.$('#prod-table').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = btn.closest('[data-id]')?.dataset.id;
        const row = this.state.items.find((p) => String(p.id) === String(id));
        if (btn.dataset.act === 'view') this.details(row);
        if (btn.dataset.act === 'edit') this.form(row);
        if (btn.dataset.act === 'history') this.history(row);
        if (btn.dataset.act === 'status') this.toggleStatus(row);
      });
    },

    async loadCategories() {
      try {
        const res = await API.categories();
        this.state.categories = Array.isArray(res) ? res : (res.items || []);
        const sel = Utils.$('#prod-category');
        if (sel) sel.innerHTML = '<option value="">All categories</option>' + this.state.categories.map((c) =>
          '<option value="' + Utils.attr(c.name || c) + '">' + Utils.esc(c.name || c) + '</option>').join('');
      } catch (_) { /* categories are optional for filtering */ }
    },

    async load() {
      const box = Utils.$('#prod-table');
      Utils.inlineLoading(box, 5);
      try {
        const res = await API.products({ q: this.state.q, category: this.state.category, status: this.state.status, page: this.state.page, per: this.state.per });
        this.state.items = Array.isArray(res) ? res : (res.items || res.products || []);
        this.renderTable();
      } catch (err) {
        box.innerHTML = Utils.errorState(err.message, 'products-retry');
        box.querySelector('[data-action]')?.addEventListener('click', () => this.load());
      }
    },

    renderTable() {
      const rows = this.state.items;
      const cols = [
        { label: 'Product', key: 'name', sortable: true, render: (p) =>
          '<div class="cell-product">' + (p.imageUrl ? '<img class="cell-thumb" src="' + Utils.attr(p.imageUrl) + '" alt="" loading="lazy">' :
            '<span class="cell-avatar">' + Utils.esc(String(p.name || '?').charAt(0)) + '</span>') +
          '<div><span class="cell-main">' + Utils.esc(p.name) + '</span><span class="cell-sub">' + Utils.esc(p.sku || '—') + '</span></div></div>' },
        { label: 'Category', key: 'category', sortable: true, render: (p) => Utils.esc(p.category || '—') + (p.brand ? '<span class="cell-sub">' + Utils.esc(p.brand) + '</span>' : '') },
        { label: 'Cost', key: 'costPrice', align: 'right', sortable: true, render: (p) => Utils.money(p.costPrice) },
        { label: 'Selling price', key: 'sellingPrice', align: 'right', sortable: true, render: (p) => '<strong>' + Utils.money(p.sellingPrice) + '</strong>' },
        { label: 'Stock', key: 'stock', align: 'right', sortable: true, render: (p) => Utils.number(p.stock) + '<span class="cell-sub">' + Utils.stockBadge(p.stock, p.minStock) + '</span>' },
        { label: 'Status', key: 'status', render: (p) => Utils.badge(p.status || 'Active', String(p.status).toLowerCase() === 'inactive' ? 'danger' : 'success') },
        { label: 'Actions', align: 'right', render: (p) =>
          '<div class="action-group"><button class="btn btn-ghost btn-sm btn-icon" data-act="view" title="View details"><i data-lucide="eye"></i></button>' +
          (Auth.can('products.edit') ? '<button class="btn btn-ghost btn-sm btn-icon" data-act="edit" title="Edit"><i data-lucide="pencil"></i></button>' +
            '<button class="btn btn-ghost btn-sm btn-icon" data-act="history" title="Stock history"><i data-lucide="history"></i></button>' +
            '<button class="btn btn-ghost btn-sm btn-icon" data-act="status" title="Activate / deactivate"><i data-lucide="power"></i></button>' : '') + '</div>' }
      ];
      Utils.$('#prod-table').innerHTML = Utils.table(cols, rows, {
        empty: 'No products match your filters. Add a product or adjust the search.', emptyTitle: 'No products found',
        emptyAction: Auth.can('products.edit') ? '<button class="btn btn-primary" id="empty-add"><i data-lucide="plus"></i> Add product</button>' : ''
      });
      Utils.$('#empty-add')?.addEventListener('click', () => this.form());
      const total = rows.length;
      Utils.$('#prod-count').textContent = total + ' product' + (total === 1 ? '' : 's');
      Utils.$('#prod-page-info').textContent = 'Showing page ' + this.state.page + ' · ' + total + ' records';
      Utils.$('#prod-pagination').innerHTML =
        '<button ' + (this.state.page <= 1 ? 'disabled' : '') + ' data-page="prev">‹</button>' +
        '<button class="active">' + this.state.page + '</button>' +
        '<button ' + (total < this.state.per ? 'disabled' : '') + ' data-page="next">›</button>';
      Utils.$$('#prod-pagination button').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.page === 'prev' && this.state.page > 1) this.state.page--;
        if (b.dataset.page === 'next' && total >= this.state.per) this.state.page++;
        this.load();
      }));
      Utils.repaintIcons(Utils.$('#prod-table'));
    },

    form(product) {
      const p = product || {};
      const isEdit = !!p.id;
      const opts = (arr, selected) => arr.map((v) => '<option value="' + Utils.attr(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + Utils.esc(v) + '</option>').join('');
      const m = Utils.modal({
        title: isEdit ? 'Edit product' : 'Add new product', icon: isEdit ? 'pencil' : 'package-plus', size: 'lg',
        confirmText: isEdit ? 'Save changes' : 'Create product',
        body: '<form id="product-form" autocomplete="off">' +
          '<div class="form-row">' +
          '<div class="form-group"><label class="form-label">Product name <span class="req">*</span></label><input class="form-control" name="name" value="' + Utils.attr(p.name) + '" required></div>' +
          '<div class="form-group"><label class="form-label">SKU / Barcode <span class="req">*</span></label><input class="form-control" name="sku" value="' + Utils.attr(p.sku) + '" required><small class="form-hint">Must be unique across all products.</small></div>' +
          '</div>' +
          '<div class="form-row">' +
          '<div class="form-group"><label class="form-label">Category</label><input class="form-control" name="category" list="cat-list" value="' + Utils.attr(p.category) + '"><datalist id="cat-list">' +
          this.state.categories.map((c) => '<option value="' + Utils.attr(c.name || c) + '">').join('') + '</datalist></div>' +
          '<div class="form-group"><label class="form-label">Brand</label><input class="form-control" name="brand" value="' + Utils.attr(p.brand) + '"></div>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Description</label><textarea class="form-control" name="description">' + Utils.esc(p.description) + '</textarea></div>' +
          '<div class="form-row-3">' +
          '<div class="form-group"><label class="form-label">Cost price <span class="req">*</span></label><input class="form-control" name="costPrice" type="number" min="0" step="0.01" value="' + Utils.attr(p.costPrice != null ? p.costPrice : 0) + '" required></div>' +
          '<div class="form-group"><label class="form-label">Selling price <span class="req">*</span></label><input class="form-control" name="sellingPrice" type="number" min="0" step="0.01" value="' + Utils.attr(p.sellingPrice != null ? p.sellingPrice : 0) + '" required></div>' +
          '<div class="form-group"><label class="form-label">Initial stock</label><input class="form-control" name="stock" type="number" min="0" step="1" value="' + Utils.attr(p.stock != null ? p.stock : 0) + '"></div>' +
          '</div>' +
          '<div class="form-row-3">' +
          '<div class="form-group"><label class="form-label">Minimum stock</label><input class="form-control" name="minStock" type="number" min="0" step="1" value="' + Utils.attr(p.minStock != null ? p.minStock : APP_CONFIG.LOW_STOCK_FALLBACK) + '"></div>' +
          '<div class="form-group"><label class="form-label">Supplier</label><input class="form-control" name="supplier" value="' + Utils.attr(p.supplier) + '"></div>' +
          '<div class="form-group"><label class="form-label">Status</label><select class="form-select" name="status">' + opts(['Active', 'Inactive'], p.status || 'Active') + '</select></div>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Product image URL</label><input class="form-control" name="imageUrl" value="' + Utils.attr(p.imageUrl) + '" placeholder="https://… (optional)"><small class="form-hint">Use a publicly accessible image URL. Leave blank for an initials thumbnail.</small></div>' +
          (isEdit ? '<input type="hidden" name="id" value="' + Utils.attr(p.id) + '">' : '') +
          '</form>',
        onConfirm: async (el) => {
          const form = Utils.$('#product-form', el);
          const data = Utils.formData(form);
          const rules = {
            name: { required: true, min: 2, max: 120 },
            sku: { required: true, min: 2, max: 60 },
            costPrice: { required: true, numeric: true, minValue: 0 },
            sellingPrice: { required: true, numeric: true, minValue: 0 },
            stock: { numeric: true, minValue: 0, integer: true },
            minStock: { numeric: true, minValue: 0, integer: true }
          };
          const v = Utils.validate(data, rules);
          if (!v.ok) { Utils.showFormErrors(form, v.errors); Utils.toast('Please correct the highlighted fields', 'warning'); return false; }
          if (Number(data.sellingPrice) < Number(data.costPrice)) {
            Utils.showFormErrors(form, { sellingPrice: 'Selling price cannot be below cost price' }); return false;
          }
          const duplicate = this.state.items.find((x) => String(x.sku).toLowerCase() === String(data.sku).toLowerCase() && String(x.id) !== String(data.id || ''));
          if (duplicate) { Utils.showFormErrors(form, { sku: 'SKU already used by ' + duplicate.name }); Utils.toast('Duplicate SKU detected', 'error'); return false; }
          await API.saveProduct(data);
          Utils.toast(isEdit ? 'Product updated' : 'Product created', 'success');
          await Promise.all([this.load(), this.loadCategories()]);
          return true;
        }
      });
      const form = Utils.$('#product-form', m.el);
      form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); Utils.$('[data-modal-confirm]', m.el).click(); } });
    },

    async details(p) {
      if (!p) return;
      let history = [];
      try { history = await API.productStockHistory(p.id); if (!Array.isArray(history)) history = history.items || []; } catch (_) {}
      Utils.modal({
        title: p.name, icon: 'package', size: 'lg', showConfirm: false, cancelText: 'Close',
        body: '<div class="detail-hero">' + (p.imageUrl ? '<img class="detail-thumb" src="' + Utils.attr(p.imageUrl) + '">' :
          '<span class="cell-avatar" style="width:84px;height:84px;font-size:28px">' + Utils.esc(String(p.name).charAt(0)) + '</span>') +
          '<div><h3>' + Utils.esc(p.name) + '</h3><p class="muted mb-0">' + Utils.esc(p.sku || 'No SKU') + ' · ' + Utils.esc(p.category || 'Uncategorised') + '</p>' +
          Utils.stockBadge(p.stock, p.minStock) + '</div></div>' +
          '<div class="card-body"><p class="text-2">' + Utils.esc(p.description || 'No description provided.') + '</p>' +
          '<div class="kv-grid">' +
          this.kv('Product ID', p.id) + this.kv('Brand', p.brand) + this.kv('Supplier', p.supplier) +
          this.kv('Date added', Utils.date(p.dateAdded)) + this.kv('Cost price', Utils.money(p.costPrice)) +
          this.kv('Selling price', Utils.money(p.sellingPrice)) + this.kv('Stock on hand', Utils.number(p.stock)) +
          this.kv('Minimum stock', Utils.number(p.minStock)) + this.kv('Status', Utils.badge(p.status || 'Active')) +
          this.kv('Potential value', Utils.money(Number(p.stock) * Number(p.sellingPrice))) +
          '</div>' +
          '<h4 class="section-title mt-3"><i data-lucide="history"></i> Recent stock movements</h4>' +
          (history.length ? '<div class="table-responsive"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Previous</th><th>New</th><th>Reason</th></tr></thead><tbody>' +
            history.slice(0, 8).map((h) => '<tr><td>' + Utils.date(h.date) + '</td><td>' + Utils.badge(h.type || h.transactionType) + '</td>' +
              '<td>' + Utils.number(h.quantity) + '</td><td>' + Utils.number(h.previousStock) + '</td><td>' + Utils.number(h.newStock) + '</td>' +
              '<td>' + Utils.esc(h.reason || '—') + '</td></tr>').join('') + '</tbody></table></div>' :
            '<p class="muted">No stock movements recorded for this product yet.</p>') + '</div>'
      });
    },

    kv(label, value) {
      return '<div class="kv-item"><span class="kv-label">' + Utils.esc(label) + '</span><span class="kv-value">' + Utils.esc(value == null || value === '' ? '—' : value) + '</span></div>';
    },

    async history(p) {
      if (!p) return;
      let rows = [];
      try { rows = await API.productStockHistory(p.id); if (!Array.isArray(rows)) rows = rows.items || []; } catch (e) { Utils.toast(e.message, 'error'); return; }
      Utils.modal({
        title: 'Stock history · ' + p.name, icon: 'history', size: 'lg', showConfirm: false, cancelText: 'Close',
        body: Utils.table([
          { label: 'Movement ID', key: 'id' }, { label: 'Date', key: 'date', render: (h) => Utils.datetime(h.date) },
          { label: 'Type', key: 'type', render: (h) => Utils.badge(h.type || h.transactionType) },
          { label: 'Qty', key: 'quantity', align: 'right', render: (h) => Utils.number(h.quantity) },
          { label: 'Previous', key: 'previousStock', align: 'right' }, { label: 'New', key: 'newStock', align: 'right' },
          { label: 'User', key: 'user' }, { label: 'Reason', key: 'reason' }
        ], rows, { empty: 'No movements recorded yet.' })
      });
    },

    async toggleStatus(p) {
      if (!p) return;
      const next = String(p.status).toLowerCase() === 'inactive' ? 'Active' : 'Inactive';
      const ok = await Utils.confirm('Change product status', 'Set <strong>' + Utils.esc(p.name) + '</strong> to ' + next + '?', { confirmText: 'Yes, change' });
      if (!ok) return;
      try { await API.setProductStatus(p.id, next); Utils.toast('Product is now ' + next, 'success'); this.load(); }
      catch (e) { Utils.toast(e.message, 'error'); }
    },

    export() {
      const rows = this.state.items;
      Utils.exportCSV('products', rows, [
        { label: 'Product ID', key: 'id' }, { label: 'Product Name', key: 'name' }, { label: 'SKU', key: 'sku' },
        { label: 'Description', key: 'description' }, { label: 'Category', key: 'category' }, { label: 'Brand', key: 'brand' },
        { label: 'Cost Price', key: 'costPrice' }, { label: 'Selling Price', key: 'sellingPrice' },
        { label: 'Current Stock', key: 'stock' }, { label: 'Minimum Stock', key: 'minStock' },
        { label: 'Supplier', key: 'supplier' }, { label: 'Date Added', key: 'dateAdded' }, { label: 'Status', key: 'status' }
      ]);
    },

    async import() {
      const file = await Utils.pickFile('.csv,text/csv');
      if (!file) return;
      const text = await Utils.readFile(file);
      const rows = Utils.parseCSV(text);
      if (!rows.length) { Utils.toast('The CSV file contains no rows', 'warning'); return; }
      const required = ['name', 'sku'];
      if (!required.every((k) => Object.keys(rows[0]).includes(k))) {
        Utils.toast('CSV must contain at least "name" and "sku" columns', 'error'); return;
      }
      const ok = await Utils.confirm('Import products', 'Import ' + rows.length + ' product(s)? Rows with duplicate SKUs will be skipped by the server.', { confirmText: 'Import now' });
      if (!ok) return;
      try {
        const res = await API.importProducts(rows);
        Utils.toast('Imported ' + (res.imported || rows.length) + ' product(s)' + (res.skipped ? ', ' + res.skipped + ' skipped' : ''), 'success');
        this.load();
      } catch (e) { Utils.toast(e.message, 'error'); }
    }
  };

  window.Page = Page;
})();
