/* ==========================================================================
   Ocson Inc. Store — Customer management
   ========================================================================== */
(function () {
  'use strict';

  const Page = {
    title: 'Customers', subtitle: 'Contacts, purchase history and balances',
    state: { customers: [], q: '' },

    async init() { this.render(); this.bind(); await this.load(); },

    render() {
      Utils.$('#page-body').innerHTML =
        '<div class="page-heading"><div><h2>Customer directory</h2><p>Registered customers and walk-in records, with spending and outstanding balances.</p></div>' +
        (Auth.can('customers.edit') ? '<button class="btn btn-primary" id="cust-add"><i data-lucide="user-plus"></i> Register customer</button>' : '') + '</div>' +
        '<div id="cust-kpis" class="kpi-grid secondary mb-3"></div>' +
        '<div class="card"><div class="card-body"><div class="filter-bar">' +
        '<input class="form-control search-input" id="cust-q" placeholder="Search name, phone, email…">' +
        '<button class="btn btn-ghost btn-sm" id="cust-export"><i data-lucide="file-down"></i> Export CSV</button></div>' +
        '<div id="cust-table"><div class="skeleton-list">' + Array.from({ length: 5 }, () => '<div class="skeleton skeleton-row"></div>').join('') + '</div></div>' +
        '</div></div>';
      Utils.repaintIcons(Utils.$('#page-body'));
    },

    bind() {
      Utils.$('#cust-add')?.addEventListener('click', () => this.form());
      Utils.$('#cust-q').addEventListener('input', Utils.debounce(() => this.renderTable(), 250));
      Utils.$('#cust-export').addEventListener('click', () => this.export());
      Utils.$('#cust-table').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const c = this.state.customers.find((x) => String(x.id) === String(b.closest('[data-id]')?.dataset.id));
        if (b.dataset.act === 'view') this.history(c);
        if (b.dataset.act === 'edit') this.form(c);
        if (b.dataset.act === 'delete') this.remove(c);
      });
    },

    async load() {
      try {
        const res = await API.customers({ limit: 500 });
        this.state.customers = Array.isArray(res) ? res : (res.items || []);
        this.renderKpis(); this.renderTable();
      } catch (err) {
        Utils.$('#cust-table').innerHTML = Utils.errorState(err.message, 'cust-retry');
        Utils.$('#cust-table [data-action]')?.addEventListener('click', () => this.load());
      }
    },

    renderKpis() {
      const c = this.state.customers;
      const cards = [
        ['Total customers', c.length, 'users', 'navy'],
        ['With purchases', c.filter((x) => Number(x.totalSpent) > 0).length, 'shopping-bag', 'green'],
        ['Total spending', Utils.money(Utils.sum(c, (x) => Number(x.totalSpent))), 'circle-dollar-sign', 'blue'],
        ['Outstanding balances', Utils.money(Utils.sum(c, (x) => Number(x.balance))), 'wallet', 'amber'],
        ['With email', c.filter((x) => x.email).length, 'mail', 'purple'],
        ['Walk-in records', c.filter((x) => /walk/i.test(x.name || '')).length, 'user-round', 'blue'],
        ['With phone', c.filter((x) => x.phone).length, 'phone', 'green'],
        ['New this month', c.filter((x) => new Date(x.dateAdded || x.createdAt) >= new Date(Utils.monthStart())).length, 'user-plus', 'purple']
      ];
      Utils.$('#cust-kpis').innerHTML = cards.map(([l, v, i, t]) =>
        '<div class="stat-card"><div class="stat-top"><div><div class="stat-label">' + l + '</div><div class="stat-value">' + v + '</div></div>' +
        '<span class="stat-icon ' + t + '"><i data-lucide="' + i + '"></i></span></div></div>').join('');
      Utils.repaintIcons(Utils.$('#cust-kpis'));
    },

    renderTable() {
      const q = (Utils.$('#cust-q')?.value || '').toLowerCase();
      const rows = this.state.customers.filter((c) => !q || (c.name + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase().includes(q));
      Utils.$('#cust-table').innerHTML = Utils.table([
        { label: 'Customer', key: 'name', render: (c) => '<div class="cell-product"><span class="cell-avatar">' + Utils.esc(String(c.name).charAt(0).toUpperCase()) + '</span>' +
          '<div><span class="cell-main">' + Utils.esc(c.name) + '</span><span class="cell-sub">' + Utils.esc(c.email || '') + '</span></div></div>' },
        { label: 'Phone', key: 'phone' }, { label: 'Address', key: 'address', render: (c) => Utils.esc(c.address || '—') },
        { label: 'Purchases', key: 'purchaseCount', align: 'right', render: (c) => Utils.number(c.purchaseCount) },
        { label: 'Total spent', key: 'totalSpent', align: 'right', render: (c) => '<strong>' + Utils.money(c.totalSpent) + '</strong>' },
        { label: 'Balance', key: 'balance', align: 'right', render: (c) => Number(c.balance) > 0 ? '<span class="text-danger font-bold">' + Utils.money(c.balance) + '</span>' : Utils.money(0) },
        { label: 'Added', key: 'dateAdded', render: (c) => Utils.date(c.dateAdded) },
        { label: 'Actions', align: 'right', render: (c) => '<div class="action-group">' +
          '<button class="btn btn-ghost btn-sm btn-icon" data-act="view" title="Purchase history"><i data-lucide="history"></i></button>' +
          (Auth.can('customers.edit') ? '<button class="btn btn-ghost btn-sm btn-icon" data-act="edit" title="Edit"><i data-lucide="pencil"></i></button>' +
            '<button class="btn btn-ghost btn-sm btn-icon" data-act="delete" title="Delete"><i data-lucide="trash-2"></i></button>' : '') + '</div>' }
      ], rows, { empty: 'No customers found. Register one to get started.' });
      Utils.repaintIcons(Utils.$('#cust-table'));
    },

    form(c) {
      const isEdit = !!c?.id; c = c || {};
      Utils.modal({
        title: isEdit ? 'Edit customer' : 'Register customer', icon: 'user-plus', size: 'md', confirmText: isEdit ? 'Save changes' : 'Register',
        body: '<form id="cust-form">' +
          '<div class="form-row"><div class="form-group"><label class="form-label">Full name <span class="req">*</span></label><input class="form-control" name="name" value="' + Utils.attr(c.name) + '" required></div>' +
          '<div class="form-group"><label class="form-label">Phone</label><input class="form-control" name="phone" value="' + Utils.attr(c.phone) + '"></div></div>' +
          '<div class="form-group"><label class="form-label">Email</label><input class="form-control" name="email" type="email" value="' + Utils.attr(c.email) + '"></div>' +
          '<div class="form-group"><label class="form-label">Address</label><input class="form-control" name="address" value="' + Utils.attr(c.address) + '"></div>' +
          '<div class="form-row"><div class="form-group"><label class="form-label">Opening balance</label><input class="form-control" name="balance" type="number" min="0" value="' + Utils.attr(c.balance || 0) + '"></div>' +
          '<div class="form-group"><label class="form-label">Notes</label><input class="form-control" name="notes" value="' + Utils.attr(c.notes) + '"></div></div>' +
          (isEdit ? '<input type="hidden" name="id" value="' + Utils.attr(c.id) + '">' : '') + '</form>',
        onConfirm: async (el) => {
          const form = Utils.$('#cust-form', el), data = Utils.formData(form);
          const v = Utils.validate(data, { name: { required: true, min: 2 }, email: { email: true }, phone: { phone: true }, balance: { numeric: true, minValue: 0 } });
          if (!v.ok) { Utils.showFormErrors(form, v.errors); return false; }
          const dupe = this.state.customers.find((x) => String(x.phone) === String(data.phone) && data.phone && String(x.id) !== String(data.id || ''));
          if (dupe) { Utils.toast('Another customer uses this phone number', 'warning'); return false; }
          await API.saveCustomer(data);
          Utils.toast(isEdit ? 'Customer updated' : 'Customer registered', 'success');
          this.load(); return true;
        }
      });
    },

    async history(c) {
      if (!c) return;
      let rows = [];
      try { const r = await API.customerHistory(c.id); rows = Array.isArray(r) ? r : (r.items || r.sales || []); } catch (e) { Utils.toast(e.message, 'error'); }
      Utils.modal({
        title: c.name, icon: 'user', size: 'lg', showConfirm: false, cancelText: 'Close',
        body: '<div class="kv-grid mb-3">' +
          '<div class="kv-item"><span class="kv-label">Phone</span><span class="kv-value">' + Utils.esc(c.phone || '—') + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Email</span><span class="kv-value">' + Utils.esc(c.email || '—') + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Total spending</span><span class="kv-value">' + Utils.money(c.totalSpent) + '</span></div>' +
          '<div class="kv-item"><span class="kv-label">Outstanding balance</span><span class="kv-value">' + Utils.money(c.balance) + '</span></div>' +
          '</div><h4 class="section-title"><i data-lucide="receipt-text"></i> Purchase history</h4>' +
          Utils.table([
            { label: 'Receipt', key: 'receiptNo', render: (s) => Utils.esc(s.receiptNo || s.id) },
            { label: 'Date', key: 'date', render: (s) => Utils.date(s.date) },
            { label: 'Method', key: 'paymentMethod', render: (s) => Utils.badge(s.paymentMethod) },
            { label: 'Total', key: 'total', align: 'right', render: (s) => Utils.money(s.total) }
          ], rows, { empty: 'No purchases recorded for this customer.' })
      });
    },

    async remove(c) {
      if (!c) return;
      const ok = await Utils.confirm('Delete customer', 'Remove ' + c.name + '? Purchase history remains intact.', { danger: true, confirmText: 'Delete' });
      if (!ok) return;
      try { await API.deleteCustomer(c.id); Utils.toast('Customer removed', 'success'); this.load(); }
      catch (e) { Utils.toast(e.message, 'error'); }
    },

    export() {
      Utils.exportCSV('customers', this.state.customers, [
        { label: 'Customer ID', key: 'id' }, { label: 'Name', key: 'name' }, { label: 'Phone', key: 'phone' },
        { label: 'Email', key: 'email' }, { label: 'Address', key: 'address' }, { label: 'Purchases', key: 'purchaseCount' },
        { label: 'Total Spending', key: 'totalSpent' }, { label: 'Balance', key: 'balance' }, { label: 'Date Added', key: 'dateAdded' }
      ]);
    }
  };

  window.Page = Page;
})();
