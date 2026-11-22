/* ==========================================================================
   Ocson Inc. Store — Order management and conversion to sale
   ========================================================================== */
(function () {
  'use strict';

  const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Ready for Collection', 'Dispatched', 'Delivered', 'Cancelled'];
  const Page = {
    title: 'Orders', subtitle: 'Track customer orders through fulfilment',
    state: { orders: [], products: [], customers: [], status: '', draft: [] },

    async init() {
      this.render(); this.bind(); await this.load();
    },

    render() {
      Utils.$('#page-body').innerHTML =
        '<div class="page-heading"><div><h2>Customer orders</h2><p>Orders do not affect stock until they are converted into a sale — no double deduction.</p></div>' +
        (Auth.can('orders.edit') ? '<button class="btn btn-primary" id="order-add"><i data-lucide="plus"></i> New order</button>' : '') + '</div>' +
        '<div id="order-kpis" class="kpi-grid secondary mb-3"></div>' +
        '<div class="card"><div class="card-body">' +
        '<div class="filter-bar"><input class="form-control search-input" id="order-q" placeholder="Search order, customer…">' +
        '<select class="form-select" id="order-status"><option value="">All statuses</option>' + STATUSES.map((s) => '<option>' + s + '</option>').join('') + '</select>' +
        '<button class="btn btn-ghost btn-sm" id="order-export"><i data-lucide="file-down"></i> Export CSV</button></div>' +
        '<div id="order-table"><div class="skeleton-list">' + Array.from({ length: 5 }, () => '<div class="skeleton skeleton-row"></div>').join('') + '</div></div>' +
        '</div></div>';
      Utils.repaintIcons(Utils.$('#page-body'));
    },

    bind() {
      Utils.$('#order-add')?.addEventListener('click', () => this.form());
      Utils.$('#order-q').addEventListener('input', Utils.debounce(() => this.renderTable(), 250));
      Utils.$('#order-status').addEventListener('change', (e) => { this.state.status = e.target.value; this.renderTable(); });
      Utils.$('#order-export').addEventListener('click', () => this.export());
      Utils.$('#order-table').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const o = this.state.orders.find((x) => String(x.id) === String(b.closest('[data-id]')?.dataset.id));
        if (b.dataset.act === 'view') this.view(o);
        if (b.dataset.act === 'status') this.changeStatus(o);
        if (b.dataset.act === 'convert') this.convert(o);
      });
    },

    async load() {
      try {
        const [o, p, c] = await Promise.all([API.orders({ limit: 300 }), API.products({ status: 'Active' }), API.customers({ limit: 500 })]);
        this.state.orders = Array.isArray(o) ? o : (o.items || []);
        this.state.products = Array.isArray(p) ? p : (p.items || []);
        this.state.customers = Array.isArray(c) ? c : (c.items || []);
        this.renderKpis(); this.renderTable();
      } catch (err) {
        Utils.$('#order-table').innerHTML = Utils.errorState(err.message, 'order-retry');
        Utils.$('#order-table [data-action]')?.addEventListener('click', () => this.load());
      }
    },

    renderKpis() {
      const o = this.state.orders;
      const cards = [
        ['Total orders', o.length, 'clipboard-list', 'navy'],
        ['Pending', o.filter((x) => x.status === 'Pending').length, 'clock-3', 'amber'],
        ['In progress', o.filter((x) => ['Confirmed', 'Processing', 'Ready for Collection', 'Dispatched'].includes(x.status)).length, 'loader-circle', 'blue'],
        ['Delivered', o.filter((x) => x.status === 'Delivered').length, 'check-check', 'green'],
        ['Converted to sales', o.filter((x) => x.status === 'Converted' || x.converted).length, 'circle-check', 'purple'],
        ['Order value', Utils.money(Utils.sum(o, (x) => Number(x.total))), 'circle-dollar-sign', 'green'],
        ['Cancelled', o.filter((x) => x.status === 'Cancelled').length, 'circle-x', 'red'],
        ['With delivery', o.filter((x) => x.deliveryAddress).length, 'truck', 'blue']
      ];
      Utils.$('#order-kpis').innerHTML = cards.map(([l, v, i, t]) =>
        '<div class="stat-card"><div class="stat-top"><div><div class="stat-label">' + l + '</div><div class="stat-value">' + v + '</div></div>' +
        '<span class="stat-icon ' + t + '"><i data-lucide="' + i + '"></i></span></div></div>').join('');
      Utils.repaintIcons(Utils.$('#order-kpis'));
    },

    filtered() {
      const q = (Utils.$('#order-q')?.value || '').toLowerCase();
      return this.state.orders.filter((o) => (!this.state.status || o.status === this.state.status) &&
        (!q || (String(o.id) + ' ' + (o.customerName || '') + ' ' + (o.reference || '')).toLowerCase().includes(q)));
    },

    renderTable() {
      const rows = this.filtered();
      Utils.$('#order-table').innerHTML = Utils.table([
        { label: 'Order ID', key: 'id', render: (o) => '<strong class="font-mono text-xs">' + Utils.esc(o.id) + '</strong>' },
        { label: 'Date', key: 'date', render: (o) => Utils.date(o.date) },
        { label: 'Customer', key: 'customerName', render: (o) => Utils.esc(o.customerName || 'Walk-in') + (o.phone ? '<span class="cell-sub">' + Utils.esc(o.phone) + '</span>' : '') },
        { label: 'Items', key: 'itemCount', align: 'right', render: (o) => Utils.number(o.itemCount || (o.items || []).length) },
        { label: 'Total', key: 'total', align: 'right', render: (o) => '<strong>' + Utils.money(o.total) + '</strong>' },
        { label: 'Payment', key: 'paymentStatus', render: (o) => Utils.badge(o.paymentStatus || 'Pending') },
        { label: 'Status', key: 'status', render: (o) => Utils.statusBadge(o.status) },
        { label: 'Actions', align: 'right', render: (o) => '<div class="action-group">' +
          '<button class="btn btn-ghost btn-sm btn-icon" data-act="view" title="View"><i data-lucide="eye"></i></button>' +
          (Auth.can('orders.edit') && !['Delivered', 'Cancelled', 'Converted'].includes(o.status) ?
            '<button class="btn btn-ghost btn-sm btn-icon" data-act="status" title="Update status"><i data-lucide="refresh-cw"></i></button>' +
            '<button class="btn btn-soft btn-sm" data-act="convert" title="Convert to sale">Convert</button>' : '') + '</div>' }
      ], rows, { empty: 'No orders found.' });
      Utils.repaintIcons(Utils.$('#order-table'));
    },

    form() {
      this.state.draft = [];
      const m = Utils.modal({
        title: 'Create order', icon: 'clipboard-plus', size: 'xl', confirmText: 'Create order',
        body: '<form id="order-form">' +
          '<div class="form-row-3">' +
          '<div class="form-group"><label class="form-label">Customer</label><select class="form-select" name="customerId"><option value="">Walk-in customer</option>' +
          this.state.customers.map((c) => '<option value="' + Utils.attr(c.id) + '">' + Utils.esc(c.name) + '</option>').join('') + '</select></div>' +
          '<div class="form-group"><label class="form-label">Customer name (if walk-in)</label><input class="form-control" name="customerName"></div>' +
          '<div class="form-group"><label class="form-label">Phone</label><input class="form-control" name="phone"></div>' +
          '</div>' +
          '<div class="form-row-3">' +
          '<div class="form-group"><label class="form-label">Order date</label><input class="form-control" name="date" type="date" value="' + Utils.today() + '" required></div>' +
          '<div class="form-group"><label class="form-label">Payment method</label><select class="form-select" name="paymentMethod"><option>Cash</option><option>Mobile Money</option><option>Bank Transfer</option></select></div>' +
          '<div class="form-group"><label class="form-label">Payment status</label><select class="form-select" name="paymentStatus"><option>Pending</option><option>Partial</option><option>Paid</option></select></div>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Delivery information</label><input class="form-control" name="deliveryAddress" placeholder="Delivery address or collection instructions"></div>' +
          '<h4 class="section-title mt-2"><i data-lucide="list"></i> Order items</h4>' +
          '<div class="form-row"><div class="form-group"><label class="form-label">Product</label><select class="form-select" id="oi-product">' +
          this.state.products.map((p) => '<option value="' + Utils.attr(p.id) + '" data-price="' + Number(p.sellingPrice) + '" data-name="' + Utils.attr(p.name) + '">' + Utils.esc(p.name) + '</option>').join('') + '</select></div>' +
          '<div class="form-group"><label class="form-label">Quantity</label><input class="form-control" id="oi-qty" type="number" min="1" value="1"></div></div>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="oi-add"><i data-lucide="plus"></i> Add line item</button>' +
          '<div id="order-lines" class="mt-2"></div>' +
          '<div class="form-row mt-2"><div class="form-group"><label class="form-label">Discount (UGX)</label><input class="form-control" name="discount" type="number" min="0" value="0"></div>' +
          '<div class="form-group"><label class="form-label">Notes</label><input class="form-control" name="notes"></div></div>' +
          '</form>',
        onConfirm: async (el) => {
          const form = Utils.$('#order-form', el), data = Utils.formData(form);
          const v = Utils.validate(data, { date: { required: true }, customerName: { required: !data.customerId, min: 2 } });
          if (!v.ok) { Utils.showFormErrors(form, v.errors); return false; }
          if (!this.state.draft.length) { Utils.toast('Add at least one item to the order', 'warning'); return false; }
          data.items = this.state.draft;
          data.status = 'Pending';
          await API.saveOrder(data);
          Utils.toast('Order created', 'success');
          this.load();
          return true;
        }
      });
      const mEl = m.el;
      Utils.$('#oi-add', mEl).addEventListener('click', () => {
        const sel = Utils.$('#oi-product', mEl), opt = sel.selectedOptions[0];
        const qty = parseInt(Utils.$('#oi-qty', mEl).value, 10) || 1;
        if (!opt) return;
        this.state.draft.push({ productId: sel.value, productName: opt.dataset.name, quantity: qty, unitPrice: Number(opt.dataset.price) });
        this.renderLines(mEl);
      });
      this.renderLines(mEl);
    },

    renderLines(mEl) {
      const box = Utils.$('#order-lines', mEl);
      if (!box) return;
      const total = Utils.sum(this.state.draft, (i) => i.quantity * i.unitPrice);
      box.innerHTML = Utils.table([
        { label: 'Product', key: 'productName' }, { label: 'Qty', key: 'quantity', align: 'right' },
        { label: 'Unit price', key: 'unitPrice', align: 'right', render: (i) => Utils.money(i.unitPrice) },
        { label: 'Line total', align: 'right', render: (i) => Utils.money(i.quantity * i.unitPrice) },
        { label: '', align: 'right', render: (i, idx) => '<button type="button" class="btn btn-ghost btn-sm btn-icon" data-remove="' + idx + '"><i data-lucide="trash-2"></i></button>' }
      ], this.state.draft, { empty: 'No items added yet.' }) +
        '<div class="total-line grand mt-2"><span>Order total</span><span>' + Utils.money(total) + '</span></div>';
      Utils.$$('[data-remove]', box).forEach((b) => b.addEventListener('click', () => { this.state.draft.splice(Number(b.dataset.remove), 1); this.renderLines(mEl); }));
      Utils.repaintIcons(box);
    },

    async view(o) {
      if (!o) return;
      let items = o.items || [];
      try { const r = await API.request('orders.items', { id: o.id }, { silent: true }); if (Array.isArray(r)) items = r; } catch (_) {}
      Utils.modal({
        title: 'Order ' + o.id, icon: 'clipboard-list', size: 'lg', showConfirm: false, cancelText: 'Close',
        body: '<div class="kv-grid mb-3">' +
          '<div class="kv-item"><span class="kv-label">Status</span><span class="kv-value">' + Utils.statusBadge(o.status) + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Customer</span><span class="kv-value">' + Utils.esc(o.customerName || 'Walk-in') + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Phone</span><span class="kv-value">' + Utils.esc(o.phone || '—') + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Delivery</span><span class="kv-value">' + Utils.esc(o.deliveryAddress || '—') + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Payment</span><span class="kv-value">' + Utils.esc(o.paymentMethod || '') + ' · ' + Utils.esc(o.paymentStatus || '') + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Reference</span><span class="kv-value">' + Utils.esc(o.reference || '—') + '</span></div>' +
          '</div>' + Utils.table([
            { label: 'Product', key: 'productName' }, { label: 'Quantity', key: 'quantity', align: 'right' },
            { label: 'Unit price', key: 'unitPrice', align: 'right', render: (i) => Utils.money(i.unitPrice) },
            { label: 'Total', align: 'right', render: (i) => Utils.money(i.quantity * i.unitPrice) }
          ], items, { empty: 'Order line items are not available.' }) +
          '<div class="total-line grand mt-2"><span>Order total</span><span>' + Utils.money(o.total) + '</span></div>'
      });
    },

    async changeStatus(o) {
      if (!o) return;
      const allowed = STATUSES.filter((s) => s !== o.status);
      const m = Utils.modal({
        title: 'Update order status', icon: 'refresh-cw', size: 'sm', confirmText: 'Update status',
        body: '<form id="os-form"><div class="form-group"><label class="form-label">Order ' + Utils.esc(o.id) + ' · Current: ' + Utils.badge(o.status) + '</label>' +
          '<select class="form-select" name="status">' + allowed.map((s) => '<option>' + s + '</option>').join('') + '</select></div></form>',
        onConfirm: async (el) => {
          const status = Utils.formData(Utils.$('#os-form', el)).status;
          await API.orderStatus(o.id, status);
          Utils.toast('Order status updated', 'success'); this.load(); return true;
        }
      });
      return m;
    },

    async convert(o) {
      if (!o) return;
      const ok = await Utils.confirm('Convert order to sale', 'This creates one sale, deducts stock once and marks the order as converted.', { confirmText: 'Convert to sale' });
      if (!ok) return;
      try {
        const r = await API.convertOrder(o.id, { requestId: Utils.FN_id() });
        Utils.toast('Order converted · ' + (r.sale?.receiptNo || r.receiptNo || ''), 'success');
        this.load();
      } catch (e) { Utils.toast(e.message, 'error'); }
    },

    export() {
      Utils.exportCSV('orders', this.state.orders, [
        { label: 'Order ID', key: 'id' }, { label: 'Date', key: 'date' }, { label: 'Customer', key: 'customerName' },
        { label: 'Phone', key: 'phone' }, { label: 'Items', key: 'itemCount' }, { label: 'Total', key: 'total' },
        { label: 'Payment Method', key: 'paymentMethod' }, { label: 'Payment Status', key: 'paymentStatus' },
        { label: 'Status', key: 'status' }, { label: 'Delivery', key: 'deliveryAddress' }
      ]);
    }
  };

  window.Page = Page;
})();
