/* ==========================================================================
   Ocson Inc. Store — Supplier management
   ========================================================================== */
(function () {
  'use strict';

  const Page = {
    title: 'Suppliers', subtitle: 'Vendors, products and purchase history',
    state: { suppliers: [], q: '' },

    async init() { this.render(); this.bind(); await this.load(); },

    render() {
      Utils.$('#page-body').innerHTML =
        '<div class="page-heading"><div><h2>Supplier directory</h2><p>Manage vendor contacts, linked products, purchases and balances.</p></div>' +
        (Auth.can('suppliers.edit') ? '<button class="btn btn-primary" id="sup-add"><i data-lucide="plus"></i> Add supplier</button>' : '') + '</div>' +
        '<div id="sup-kpis" class="kpi-grid secondary mb-3"></div>' +
        '<div class="card"><div class="card-body"><div class="filter-bar">' +
        '<input class="form-control search-input" id="sup-q" placeholder="Search supplier, contact, phone…">' +
        '<button class="btn btn-ghost btn-sm" id="sup-export"><i data-lucide="file-down"></i> Export CSV</button></div>' +
        '<div id="sup-table"><div class="skeleton-list">' + Array.from({ length: 5 }, () => '<div class="skeleton skeleton-row"></div>').join('') + '</div></div>' +
        '</div></div>';
      Utils.repaintIcons(Utils.$('#page-body'));
    },

    bind() {
      Utils.$('#sup-add')?.addEventListener('click', () => this.form());
      Utils.$('#sup-q').addEventListener('input', Utils.debounce(() => this.renderTable(), 250));
      Utils.$('#sup-export').addEventListener('click', () => this.export());
      Utils.$('#sup-table').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const s = this.state.suppliers.find((x) => String(x.id) === String(b.closest('[data-id]')?.dataset.id));
        if (b.dataset.act === 'view') this.report(s);
        if (b.dataset.act === 'edit') this.form(s);
        if (b.dataset.act === 'delete') this.remove(s);
      });
    },

    async load() {
      try {
        const res = await API.suppliers({ limit: 300 });
        this.state.suppliers = Array.isArray(res) ? res : (res.items || []);
        this.renderKpis(); this.renderTable();
      } catch (err) {
        Utils.$('#sup-table').innerHTML = Utils.errorState(err.message, 'sup-retry');
        Utils.$('#sup-table [data-action]')?.addEventListener('click', () => this.load());
      }
    },

    renderKpis() {
      const s = this.state.suppliers;
      const cards = [
        ['Total suppliers', s.length, 'truck', 'navy'],
        ['Active', s.filter((x) => String(x.status || 'Active') === 'Active').length, 'circle-check', 'green'],
        ['Total purchases', Utils.money(Utils.sum(s, (x) => Number(x.totalPurchases))), 'file-plus-2', 'blue'],
        ['Outstanding balances', Utils.money(Utils.sum(s, (x) => Number(x.balance))), 'wallet', 'amber'],
        ['With email', s.filter((x) => x.email).length, 'mail', 'purple'],
        ['With phone', s.filter((x) => x.phone).length, 'phone', 'green'],
        ['Products supplied', Utils.number(Utils.sum(s, (x) => Number(x.productCount))), 'package', 'blue'],
        ['Average spend', Utils.money(s.length ? Utils.sum(s, (x) => Number(x.totalPurchases)) / s.length : 0), 'chart-line', 'purple']
      ];
      Utils.$('#sup-kpis').innerHTML = cards.map(([l, v, i, t]) =>
        '<div class="stat-card"><div class="stat-top"><div><div class="stat-label">' + l + '</div><div class="stat-value">' + v + '</div></div>' +
        '<span class="stat-icon ' + t + '"><i data-lucide="' + i + '"></i></span></div></div>').join('');
      Utils.repaintIcons(Utils.$('#sup-kpis'));
    },

    renderTable() {
      const q = (Utils.$('#sup-q')?.value || '').toLowerCase();
      const rows = this.state.suppliers.filter((s) => !q || (s.name + ' ' + (s.contactPerson || '') + ' ' + (s.phone || '')).toLowerCase().includes(q));
      Utils.$('#sup-table').innerHTML = Utils.table([
        { label: 'Supplier', key: 'name', render: (s) => '<div class="cell-product"><span class="cell-avatar">' + Utils.esc(String(s.name).charAt(0).toUpperCase()) + '</span>' +
          '<div><span class="cell-main">' + Utils.esc(s.name) + '</span><span class="cell-sub">' + Utils.esc(s.contactPerson || '') + '</span></div></div>' },
        { label: 'Phone', key: 'phone' }, { label: 'Email', key: 'email' },
        { label: 'Products', key: 'productCount', align: 'right' },
        { label: 'Purchases', key: 'purchaseCount', align: 'right' },
        { label: 'Total purchase', key: 'totalPurchases', align: 'right', render: (s) => Utils.money(s.totalPurchases) },
        { label: 'Balance', key: 'balance', align: 'right', render: (s) => Number(s.balance) > 0 ? '<span class="text-danger font-bold">' + Utils.money(s.balance) + '</span>' : Utils.money(0) },
        { label: 'Status', key: 'status', render: (s) => Utils.badge(s.status || 'Active', String(s.status || 'Active').toLowerCase() === 'active' ? 'success' : 'danger') },
        { label: 'Actions', align: 'right', render: (s) => '<div class="action-group">' +
          '<button class="btn btn-ghost btn-sm btn-icon" data-act="view" title="Supplier report"><i data-lucide="chart-line"></i></button>' +
          (Auth.can('suppliers.edit') ? '<button class="btn btn-ghost btn-sm btn-icon" data-act="edit" title="Edit"><i data-lucide="pencil"></i></button>' +
            '<button class="btn btn-ghost btn-sm btn-icon" data-act="delete" title="Delete"><i data-lucide="trash-2"></i></button>' : '') + '</div>' }
      ], rows, { empty: 'No suppliers registered yet.' });
      Utils.repaintIcons(Utils.$('#sup-table'));
    },

    form(s) {
      const isEdit = !!s?.id; s = s || {};
      Utils.modal({
        title: isEdit ? 'Edit supplier' : 'Add supplier', icon: 'truck', size: 'md', confirmText: isEdit ? 'Save changes' : 'Add supplier',
        body: '<form id="sup-form">' +
          '<div class="form-group"><label class="form-label">Supplier name <span class="req">*</span></label><input class="form-control" name="name" value="' + Utils.attr(s.name) + '" required></div>' +
          '<div class="form-row"><div class="form-group"><label class="form-label">Contact person</label><input class="form-control" name="contactPerson" value="' + Utils.attr(s.contactPerson) + '"></div>' +
          '<div class="form-group"><label class="form-label">Phone</label><input class="form-control" name="phone" value="' + Utils.attr(s.phone) + '"></div></div>' +
          '<div class="form-group"><label class="form-label">Email</label><input class="form-control" name="email" type="email" value="' + Utils.attr(s.email) + '"></div>' +
          '<div class="form-group"><label class="form-label">Address</label><input class="form-control" name="address" value="' + Utils.attr(s.address) + '"></div>' +
          '<div class="form-row"><div class="form-group"><label class="form-label">Payment terms</label><input class="form-control" name="paymentTerms" value="' + Utils.attr(s.paymentTerms) + '" placeholder="e.g. Net 30"></div>' +
          '<div class="form-group"><label class="form-label">Status</label><select class="form-select" name="status"><option' + (String(s.status || 'Active') === 'Active' ? ' selected' : '') + '>Active</option><option' + (s.status === 'Inactive' ? ' selected' : '') + '>Inactive</option></select></div></div>' +
          '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-control" name="notes">' + Utils.esc(s.notes) + '</textarea></div>' +
          (isEdit ? '<input type="hidden" name="id" value="' + Utils.attr(s.id) + '">' : '') + '</form>',
        onConfirm: async (el) => {
          const form = Utils.$('#sup-form', el), data = Utils.formData(form);
          const v = Utils.validate(data, { name: { required: true, min: 2 }, email: { email: true }, phone: { phone: true } });
          if (!v.ok) { Utils.showFormErrors(form, v.errors); return false; }
          await API.saveSupplier(data);
          Utils.toast(isEdit ? 'Supplier updated' : 'Supplier added', 'success'); this.load(); return true;
        }
      });
    },

    async report(s) {
      if (!s) return;
      let r = {};
      try { r = await API.supplierReport(s.id); } catch (_) {}
      const purchases = r.purchases || [];
      const products = r.products || [];
      Utils.modal({
        title: 'Supplier report · ' + s.name, icon: 'chart-line', size: 'xl', showConfirm: false, cancelText: 'Close',
        body: '<div class="kpi-grid secondary">' +
          '<div class="stat-card"><div class="stat-label">Total purchases</div><div class="stat-value">' + Utils.money(r.totalPurchases || s.totalPurchases) + '</div></div>' +
          '<div class="stat-card"><div class="stat-label">Purchase orders</div><div class="stat-value">' + Utils.number(purchases.length || s.purchaseCount) + '</div></div>' +
          '<div class="stat-card"><div class="stat-label">Products supplied</div><div class="stat-value">' + Utils.number(products.length || s.productCount) + '</div></div>' +
          '<div class="stat-card"><div class="stat-label">Outstanding</div><div class="stat-value">' + Utils.money(r.balance || s.balance) + '</div></div></div>' +
          '<h4 class="section-title mt-3"><i data-lucide="package"></i> Products</h4>' +
          Utils.table([{ label: 'Product', key: 'name' }, { label: 'SKU', key: 'sku' }, { label: 'Stock', key: 'stock', align: 'right' }], products, { empty: 'No linked products found.' }) +
          '<h4 class="section-title mt-3"><i data-lucide="file-plus-2"></i> Purchase history</h4>' +
          Utils.table([
            { label: 'Purchase ID', key: 'id' }, { label: 'Date', key: 'date', render: (p) => Utils.date(p.date) },
            { label: 'Reference', key: 'reference' }, { label: 'Total', key: 'total', align: 'right', render: (p) => Utils.money(p.total) },
            { label: 'Status', key: 'status', render: (p) => Utils.statusBadge(p.received ? 'Received' : p.status || 'Pending') }
          ], purchases, { empty: 'No purchases recorded for this supplier.' })
      });
    },

    async remove(s) {
      if (!s) return;
      const ok = await Utils.confirm('Delete supplier', 'Remove ' + s.name + ' from the supplier directory?', { danger: true, confirmText: 'Delete' });
      if (!ok) return;
      try { await API.deleteSupplier(s.id); Utils.toast('Supplier removed', 'success'); this.load(); }
      catch (e) { Utils.toast(e.message, 'error'); }
    },

    export() {
      Utils.exportCSV('suppliers', this.state.suppliers, [
        { label: 'Supplier ID', key: 'id' }, { label: 'Name', key: 'name' }, { label: 'Contact Person', key: 'contactPerson' },
        { label: 'Phone', key: 'phone' }, { label: 'Email', key: 'email' }, { label: 'Address', key: 'address' },
        { label: 'Products', key: 'productCount' }, { label: 'Purchases', key: 'purchaseCount' },
        { label: 'Total Purchases', key: 'totalPurchases' }, { label: 'Balance', key: 'balance' }, { label: 'Status', key: 'status' }
      ]);
    }
  };

  window.Page = Page;
})();
