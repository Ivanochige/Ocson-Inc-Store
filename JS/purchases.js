/* ==========================================================================
   Ocson Inc. Store — Purchase orders and receiving stock
   ========================================================================== */
(function () {
  'use strict';

  const Page = {
    title: 'Purchases', subtitle: 'Supplier purchases and stock receiving',
    state: { purchases: [], suppliers: [], products: [], draft: [], status: '' },

    async init() { this.render(); this.bind(); await this.load(); },

    render() {
      Utils.$('#page-body').innerHTML =
        '<div class="page-heading"><div><h2>Purchase management</h2><p>Stock increases only when a purchase is received — and only once.</p></div>' +
        (Auth.can('purchases.edit') ? '<button class="btn btn-primary" id="pur-add"><i data-lucide="plus"></i> New purchase</button>' : '') + '</div>' +
        '<div id="pur-kpis" class="kpi-grid secondary mb-3"></div>' +
        '<div class="card"><div class="card-body"><div class="filter-bar">' +
        '<input class="form-control search-input" id="pur-q" placeholder="Search purchase ID, supplier, reference…">' +
        '<select class="form-select" id="pur-status"><option value="">All statuses</option><option value="Pending">Pending</option><option value="Partial">Partial</option><option value="Received">Received</option></select>' +
        '<button class="btn btn-ghost btn-sm" id="pur-export"><i data-lucide="file-down"></i> Export CSV</button></div>' +
        '<div id="pur-table"><div class="skeleton-list">' + Array.from({ length: 5 }, () => '<div class="skeleton skeleton-row"></div>').join('') + '</div></div>' +
        '</div></div>';
      Utils.repaintIcons(Utils.$('#page-body'));
    },

    bind() {
      Utils.$('#pur-add')?.addEventListener('click', () => this.form());
      Utils.$('#pur-q').addEventListener('input', Utils.debounce(() => this.renderTable(), 250));
      Utils.$('#pur-status').addEventListener('change', (e) => { this.state.status = e.target.value; this.renderTable(); });
      Utils.$('#pur-export').addEventListener('click', () => this.export());
      Utils.$('#pur-table').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const p = this.state.purchases.find((x) => String(x.id) === String(b.closest('[data-id]')?.dataset.id));
        if (b.dataset.act === 'view') this.view(p);
        if (b.dataset.act === 'receive') this.receive(p);
      });
    },

    async load() {
      try {
        const [p, s, pr] = await Promise.all([API.purchases({ limit: 300 }), API.suppliers({ limit: 300 }), API.products({ status: 'Active' })]);
        this.state.purchases = Array.isArray(p) ? p : (p.items || []);
        this.state.suppliers = Array.isArray(s) ? s : (s.items || []);
        this.state.products = Array.isArray(pr) ? pr : (pr.items || []);
        this.renderKpis(); this.renderTable();
      } catch (err) {
        Utils.$('#pur-table').innerHTML = Utils.errorState(err.message, 'pur-retry');
        Utils.$('#pur-table [data-action]')?.addEventListener('click', () => this.load());
      }
    },

    renderKpis() {
      const p = this.state.purchases;
      const cards = [
        ['Purchase orders', p.length, 'file-plus-2', 'navy'],
        ['Pending receipt', p.filter((x) => !x.received).length, 'clock-3', 'amber'],
        ['Received', p.filter((x) => x.received).length, 'circle-check', 'green'],
        ['Total purchase value', Utils.money(Utils.sum(p, (x) => Number(x.total))), 'circle-dollar-sign', 'blue'],
        ['Paid', p.filter((x) => String(x.paymentStatus).toLowerCase() === 'paid').length, 'wallet', 'green'],
        ['Unpaid', p.filter((x) => String(x.paymentStatus).toLowerCase() !== 'paid').length, 'wallet', 'red'],
        ['Units ordered', Utils.number(Utils.sum(p, (x) => Number(x.totalQuantity))), 'boxes', 'purple'],
        ['Suppliers', new Set(p.map((x) => x.supplierId)).size, 'truck', 'blue']
      ];
      Utils.$('#pur-kpis').innerHTML = cards.map(([l, v, i, t]) =>
        '<div class="stat-card"><div class="stat-top"><div><div class="stat-label">' + l + '</div><div class="stat-value">' + v + '</div></div>' +
        '<span class="stat-icon ' + t + '"><i data-lucide="' + i + '"></i></span></div></div>').join('');
      Utils.repaintIcons(Utils.$('#pur-kpis'));
    },

    renderTable() {
      const q = (Utils.$('#pur-q')?.value || '').toLowerCase();
      const rows = this.state.purchases.filter((p) =>
        (!this.state.status || (this.state.status === 'Received' ? p.received : !p.received)) &&
        (!q || (String(p.id) + ' ' + (p.supplierName || '') + ' ' + (p.reference || '')).toLowerCase().includes(q)));
      Utils.$('#pur-table').innerHTML = Utils.table([
        { label: 'Purchase ID', key: 'id', render: (p) => '<strong class="font-mono text-xs">' + Utils.esc(p.id) + '</strong>' },
        { label: 'Date', key: 'date', render: (p) => Utils.date(p.date) },
        { label: 'Supplier', key: 'supplierName', render: (p) => Utils.esc(p.supplierName || '—') },
        { label: 'Reference', key: 'reference' },
        { label: 'Items', key: 'itemCount', align: 'right', render: (p) => Utils.number(p.itemCount || (p.items || []).length) },
        { label: 'Total cost', key: 'total', align: 'right', render: (p) => '<strong>' + Utils.money(p.total) + '</strong>' },
        { label: 'Payment', key: 'paymentStatus', render: (p) => Utils.badge(p.paymentStatus || 'Pending') },
        { label: 'Received', key: 'received', render: (p) => Utils.badge(p.received ? 'Received' : 'Pending', p.received ? 'success' : 'warning') },
        { label: 'Actions', align: 'right', render: (p) => '<div class="action-group">' +
          '<button class="btn btn-ghost btn-sm btn-icon" data-act="view" title="View"><i data-lucide="eye"></i></button>' +
          (!p.received && Auth.can('purchases.edit') ? '<button class="btn btn-soft btn-sm" data-act="receive"><i data-lucide="package-check"></i> Receive</button>' : '') + '</div>' }
      ], rows, { empty: 'No purchases found.' });
      Utils.repaintIcons(Utils.$('#pur-table'));
    },

    form() {
      this.state.draft = [];
      const m = Utils.modal({
        title: 'New purchase order', icon: 'file-plus-2', size: 'xl', confirmText: 'Create purchase',
        body: '<form id="pur-form">' +
          '<div class="form-row-3">' +
          '<div class="form-group"><label class="form-label">Supplier <span class="req">*</span></label><select class="form-select" name="supplierId" required>' +
          this.state.suppliers.map((s) => '<option value="' + Utils.attr(s.id) + '">' + Utils.esc(s.name) + '</option>').join('') + '</select></div>' +
          '<div class="form-group"><label class="form-label">Purchase date</label><input class="form-control" name="date" type="date" value="' + Utils.today() + '" required></div>' +
          '<div class="form-group"><label class="form-label">Reference number</label><input class="form-control" name="reference" placeholder="Invoice / waybill no."></div>' +
          '</div>' +
          '<div class="form-row"><div class="form-group"><label class="form-label">Payment status</label><select class="form-select" name="paymentStatus"><option>Pending</option><option>Partial</option><option>Paid</option></select></div>' +
          '<div class="form-group"><label class="form-label">Notes</label><input class="form-control" name="notes"></div></div>' +
          '<h4 class="section-title mt-2"><i data-lucide="list"></i> Purchased products</h4>' +
          '<div class="form-row-3"><div class="form-group"><label class="form-label">Product</label><select class="form-select" id="pi-product">' +
          this.state.products.map((p) => '<option value="' + Utils.attr(p.id) + '" data-cost="' + Number(p.costPrice) + '" data-name="' + Utils.attr(p.name) + '">' + Utils.esc(p.name) + '</option>').join('') + '</select></div>' +
          '<div class="form-group"><label class="form-label">Quantity</label><input class="form-control" id="pi-qty" type="number" min="1" value="1"></div>' +
          '<div class="form-group"><label class="form-label">Unit cost</label><input class="form-control" id="pi-cost" type="number" min="0" step="0.01" value="0"></div></div>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="pi-add"><i data-lucide="plus"></i> Add line</button>' +
          '<div id="pur-lines" class="mt-2"></div>' +
          '</form>',
        onConfirm: async (el) => {
          const form = Utils.$('#pur-form', el), data = Utils.formData(form);
          if (!this.state.draft.length) { Utils.toast('Add at least one product', 'warning'); return false; }
          if (!this.state.suppliers.length) { Utils.toast('Add a supplier first', 'warning'); return false; }
          data.items = this.state.draft;
          await API.savePurchase(data);
          Utils.toast('Purchase order created · receive it to update stock', 'success');
          this.load(); return true;
        }
      });
      Utils.$('#pi-product', m.el).addEventListener('change', (e) => {
        const opt = e.target.selectedOptions[0];
        if (opt) Utils.$('#pi-cost', m.el).value = opt.dataset.cost;
      });
      if (Utils.$('#pi-product', m.el).selectedOptions[0]) {
        Utils.$('#pi-cost', m.el).value = Utils.$('#pi-product', m.el).selectedOptions[0].dataset.cost;
      }
      Utils.$('#pi-add', m.el).addEventListener('click', () => {
        const sel = Utils.$('#pi-product', m.el), opt = sel.selectedOptions[0];
        const qty = parseInt(Utils.$('#pi-qty', m.el).value, 10) || 1;
        const cost = Number(Utils.$('#pi-cost', m.el).value) || 0;
        if (!opt || qty < 1 || cost < 0) return;
        this.state.draft.push({ productId: sel.value, productName: opt.dataset.name, quantity: qty, unitCost: cost });
        this.renderLines(m.el);
      });
      this.renderLines(m.el);
    },

    renderLines(mEl) {
      const box = Utils.$('#pur-lines', mEl);
      if (!box) return;
      const total = Utils.sum(this.state.draft, (i) => i.quantity * i.unitCost);
      box.innerHTML = Utils.table([
        { label: 'Product', key: 'productName' }, { label: 'Qty', key: 'quantity', align: 'right' },
        { label: 'Unit cost', key: 'unitCost', align: 'right', render: (i) => Utils.money(i.unitCost) },
        { label: 'Line total', align: 'right', render: (i) => Utils.money(i.quantity * i.unitCost) },
        { label: '', align: 'right', render: (i, idx) => '<button type="button" class="btn btn-ghost btn-sm btn-icon" data-remove="' + idx + '"><i data-lucide="trash-2"></i></button>' }
      ], this.state.draft, { empty: 'No products added yet.' }) +
        '<div class="total-line grand mt-2"><span>Purchase total</span><span>' + Utils.money(total) + '</span></div>';
      Utils.$$('[data-remove]', box).forEach((b) => b.addEventListener('click', () => { this.state.draft.splice(Number(b.dataset.remove), 1); this.renderLines(mEl); }));
      Utils.repaintIcons(box);
    },

    async view(p) {
      if (!p) return;
      let items = p.items || [];
      try { const r = await API.purchaseItems(p.id); if (Array.isArray(r)) items = r; else if (r?.items) items = r.items; } catch (_) {}
      Utils.modal({
        title: 'Purchase ' + p.id, icon: 'file-plus-2', size: 'lg', showConfirm: false, cancelText: 'Close',
        body: '<div class="kv-grid mb-3">' +
          '<div class="kv-item"><span class="kv-label">Supplier</span><span class="kv-value">' + Utils.esc(p.supplierName || '—') + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Date</span><span class="kv-value">' + Utils.date(p.date) + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Reference</span><span class="kv-value">' + Utils.esc(p.reference || '—') + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Payment</span><span class="kv-value">' + Utils.esc(p.paymentStatus || '') + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Received</span><span class="kv-value">' + Utils.statusBadge(p.received ? 'Received' : 'Pending') + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Received date</span><span class="kv-value">' + Utils.date(p.receivedAt) + '</span></div>' +
          '</div>' + Utils.table([
            { label: 'Product', key: 'productName' }, { label: 'Quantity', key: 'quantity', align: 'right' },
            { label: 'Unit cost', key: 'unitCost', align: 'right', render: (i) => Utils.money(i.unitCost) },
            { label: 'Line total', align: 'right', render: (i) => Utils.money(i.quantity * i.unitCost) }
          ], items, { empty: 'Line items are not available.' }) +
          '<div class="total-line grand mt-2"><span>Grand total</span><span>' + Utils.money(p.total) + '</span></div>'
      });
    },

    async receive(p) {
      if (!p) return;
      const ok = await Utils.confirm('Receive purchase', 'This will add all purchased quantities to inventory and record stock movements. This can only be done once.', { confirmText: 'Receive stock' });
      if (!ok) return;
      try {
        await API.receivePurchase(p.id);
        Utils.toast('Purchase received · inventory updated', 'success');
        this.load();
      } catch (e) { Utils.toast(e.message, 'error'); }
    },

    export() {
      Utils.exportCSV('purchases', this.state.purchases, [
        { label: 'Purchase ID', key: 'id' }, { label: 'Supplier', key: 'supplierName' }, { label: 'Date', key: 'date' },
        { label: 'Reference', key: 'reference' }, { label: 'Items', key: 'itemCount' }, { label: 'Total', key: 'total' },
        { label: 'Payment Status', key: 'paymentStatus' }, { label: 'Received', key: 'received' }, { label: 'Received Date', key: 'receivedAt' }
      ]);
    }
  };

  window.Page = Page;
})();
