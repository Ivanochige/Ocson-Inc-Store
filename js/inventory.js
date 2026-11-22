/* ==========================================================================
   Ocson Inc. Store — Inventory, stock movements and adjustments
   ========================================================================== */
(function () {
  'use strict';

  const TYPES = ['ADD', 'DEDUCT', 'ADJUST', 'DAMAGED', 'RETURN'];
  const Page = {
    title: 'Inventory',
    subtitle: 'Stock levels, movements and adjustments',
    state: { tab: 'stock', products: [], movements: [], q: '' },

    async init() {
      this.render();
      this.bind();
      await this.load();
    },

    render() {
      Utils.$('#page-body').innerHTML =
        '<div class="page-heading"><div><h2>Stock control</h2><p>Every movement is recorded with quantity, previous/new stock, user and reason.</p></div>' +
        '<div class="row">' + (Auth.can('inventory.edit') ?
          '<button class="btn btn-ghost" id="inv-return"><i data-lucide="undo-2"></i> Product return</button>' +
          '<button class="btn btn-ghost" id="inv-damaged"><i data-lucide="triangle-alert"></i> Damaged stock</button>' +
          '<button class="btn btn-primary" id="inv-move"><i data-lucide="arrow-left-right"></i> New movement</button>' : '') + '</div></div>' +
        '<div id="inv-kpis" class="kpi-grid secondary mb-3"></div>' +
        '<div class="card"><div class="card-body">' +
        '<div class="tabs">' +
        [['stock', 'Current stock', 'boxes'], ['movements', 'Stock history', 'history'], ['low', 'Low & out of stock', 'triangle-alert']]
          .map(([k, l, ic]) => '<button class="tab' + (k === this.state.tab ? ' active' : '') + '" data-tab="' + k + '"><i data-lucide="' + ic + '"></i> ' + l + '</button>').join('') +
        '</div>' +
        '<div class="filter-bar"><input class="form-control search-input" id="inv-q" placeholder="Search product or SKU…">' +
        '<span class="grow"></span><button class="btn btn-ghost btn-sm" id="inv-export"><i data-lucide="file-down"></i> Export CSV</button></div>' +
        '<div id="inv-content"><div class="skeleton-list">' + Array.from({ length: 6 }, () => '<div class="skeleton skeleton-row"></div>').join('') + '</div></div>' +
        '</div></div>';
      Utils.repaintIcons(Utils.$('#page-body'));
    },

    bind() {
      Utils.$$('.tab').forEach((t) => t.addEventListener('click', () => {
        Utils.$$('.tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active'); this.state.tab = t.dataset.tab; this.renderContent();
      }));
      Utils.$('#inv-q').addEventListener('input', Utils.debounce((e) => { this.state.q = e.target.value; this.renderContent(); }, 250));
      Utils.$('#inv-move')?.addEventListener('click', () => this.moveModal());
      Utils.$('#inv-damaged')?.addEventListener('click', () => this.moveModal('DAMAGED'));
      Utils.$('#inv-return')?.addEventListener('click', () => this.moveModal('RETURN'));
      Utils.$('#inv-export').addEventListener('click', () => this.export());
      Utils.$('#inv-content').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = btn.closest('[data-id]')?.dataset.id;
        if (btn.dataset.act === 'move') this.moveModal('ADD', id);
      });
    },

    async load() {
      try {
        const [p, mv] = await Promise.all([API.products({ status: 'Active' }), API.stockMovements({ limit: 200 })]);
        this.state.products = Array.isArray(p) ? p : (p.items || []);
        this.state.movements = Array.isArray(mv) ? mv : (mv.items || []);
        this.renderKpis();
        this.renderContent();
      } catch (err) {
        Utils.$('#inv-content').innerHTML = Utils.errorState(err.message, 'inv-retry');
        Utils.$('#inv-content [data-action]')?.addEventListener('click', () => this.load());
      }
    },

    renderKpis() {
      const p = this.state.products;
      const total = Utils.sum(p, (x) => Number(x.stock));
      const value = Utils.sum(p, (x) => Number(x.stock) * Number(x.costPrice));
      const low = p.filter((x) => Number(x.stock) <= Number(x.minStock) && Number(x.stock) > 0).length;
      const out = p.filter((x) => Number(x.stock) <= 0).length;
      const cards = [
        ['Units on hand', Utils.number(total), 'boxes', 'blue'],
        ['Stock value (cost)', Utils.money(value), 'circle-dollar-sign', 'green'],
        ['Low stock items', String(low), 'triangle-alert', 'amber'],
        ['Out of stock', String(out), 'package-x', 'red'],
        ['Recorded movements', String(this.state.movements.length), 'history', 'purple'],
        ['Products tracked', String(p.length), 'package', 'navy'],
        ['Stock in (period)', Utils.number(Utils.sum(this.state.movements.filter((m) => /IN|ADD|RETURN|RECEIVE/i.test(m.type || '')), (m) => Number(m.quantity))), 'arrow-down-to-line', 'green'],
        ['Stock out (period)', Utils.number(Utils.sum(this.state.movements.filter((m) => /OUT|DEDUCT|DAMAGED|SALE/i.test(m.type || '')), (m) => Number(m.quantity))), 'arrow-up-from-line', 'red']
      ];
      Utils.$('#inv-kpis').innerHTML = cards.map(([l, v, i, t]) =>
        '<div class="stat-card"><div class="stat-top"><div><div class="stat-label">' + l + '</div><div class="stat-value">' + v + '</div></div>' +
        '<span class="stat-icon ' + t + '"><i data-lucide="' + i + '"></i></span></div></div>').join('');
      Utils.repaintIcons(Utils.$('#inv-kpis'));
    },

    renderContent() {
      const q = this.state.q.toLowerCase();
      const box = Utils.$('#inv-content');
      if (this.state.tab === 'movements') {
        const rows = this.state.movements.filter((m) => !q || JSON.stringify(m).toLowerCase().includes(q));
        box.innerHTML = Utils.table([
          { label: 'Movement ID', key: 'id', render: (m) => '<span class="font-mono text-xs">' + Utils.esc(m.id) + '</span>' },
          { label: 'Date', key: 'date', render: (m) => Utils.datetime(m.date) },
          { label: 'Product', key: 'productName', render: (m) => '<strong>' + Utils.esc(m.productName || m.productId || '—') + '</strong>' },
          { label: 'Type', key: 'type', render: (m) => Utils.badge(m.type || m.transactionType) },
          { label: 'Qty', key: 'quantity', align: 'right', render: (m) => Utils.number(m.quantity) },
          { label: 'Previous', key: 'previousStock', align: 'right' }, { label: 'New', key: 'newStock', align: 'right' },
          { label: 'User', key: 'user' }, { label: 'Reason', key: 'reason' }
        ], rows, { empty: 'No stock movements recorded yet.' });
      } else {
        const lowOnly = this.state.tab === 'low';
        const rows = this.state.products.filter((p) =>
          (!q || (p.name + ' ' + (p.sku || '')).toLowerCase().includes(q)) &&
          (!lowOnly || Number(p.stock) <= Number(p.minStock)));
        box.innerHTML = Utils.table([
          { label: 'Product', key: 'name', render: (p) => '<div class="cell-product"><span class="cell-avatar">' + Utils.esc(String(p.name).charAt(0)) + '</span>' +
            '<div><span class="cell-main">' + Utils.esc(p.name) + '</span><span class="cell-sub">' + Utils.esc(p.sku || '') + '</span></div></div>' },
          { label: 'Category', key: 'category' },
          { label: 'In stock', key: 'stock', align: 'right', render: (p) => '<strong>' + Utils.number(p.stock) + '</strong>' },
          { label: 'Minimum', key: 'minStock', align: 'right' },
          { label: 'Status', key: 'status', render: (p) => Utils.stockBadge(p.stock, p.minStock) },
          { label: 'Value (cost)', key: 'value', align: 'right', render: (p) => Utils.money(Number(p.stock) * Number(p.costPrice)) },
          { label: 'Action', align: 'right', render: (p) => Auth.can('inventory.edit') ?
            '<button class="btn btn-soft btn-sm" data-act="move" data-id="' + Utils.attr(p.id) + '"><i data-lucide="plus"></i> Move stock</button>' : '—' }
        ], rows, { empty: lowOnly ? 'No low-stock products. Great job!' : 'No products found.' });
      }
      Utils.repaintIcons(box);
    },

    moveModal(type, productId) {
      const products = this.state.products;
      if (!products.length) { Utils.toast('Load products first', 'warning'); return; }
      const m = Utils.modal({
        title: type ? 'Record ' + type.toLowerCase() + ' stock' : 'New stock movement',
        icon: 'arrow-left-right', size: 'md', confirmText: 'Record movement',
        body: '<form id="move-form">' +
          '<div class="form-group"><label class="form-label">Product <span class="req">*</span></label><select class="form-select" name="productId" required>' +
          products.map((p) => '<option value="' + Utils.attr(p.id) + '"' + (String(p.id) === String(productId) ? ' selected' : '') + '>' + Utils.esc(p.name) + ' (' + Utils.number(p.stock) + ' in stock)</option>').join('') +
          '</select></div>' +
          '<div class="form-group"><label class="form-label">Transaction type <span class="req">*</span></label><select class="form-select" name="type">' +
          TYPES.map((t) => '<option value="' + t + '"' + (t === (type || 'ADD') ? ' selected' : '') + '>' + t.replace('_', ' ') + '</option>').join('') + '</select></div>' +
          '<div class="form-row"><div class="form-group"><label class="form-label">Quantity <span class="req">*</span></label>' +
          '<input class="form-control" name="quantity" type="number" min="1" step="1" required></div>' +
          '<div class="form-group"><label class="form-label">Reference / document no.</label><input class="form-control" name="reference" placeholder="Optional"></div></div>' +
          '<div class="form-group"><label class="form-label">Reason <span class="req">*</span></label>' +
          '<textarea class="form-control" name="reason" required placeholder="e.g. Supplier delivery, damaged in transit, customer return…"></textarea></div>' +
          '<div class="alert alert-info"><i data-lucide="info"></i><div>ADJUST sets the stock to the quantity entered. Negative stock is blocked by the server.</div></div>' +
          '</form>',
        onConfirm: async (el) => {
          const form = Utils.$('#move-form', el);
          const data = Utils.formData(form);
          const v = Utils.validate(data, {
            productId: { required: true }, type: { required: true, oneOf: TYPES },
            quantity: { required: true, numeric: true, minValue: 1, integer: true }, reason: { required: true, min: 3 }
          });
          if (!v.ok) { Utils.showFormErrors(form, v.errors); return false; }
          if (data.type === 'DAMAGED' || data.type === 'DEDUCT') {
            const p = this.state.products.find((x) => String(x.id) === String(data.productId));
            if (p && Number(data.quantity) > Number(p.stock)) { Utils.toast('Insufficient stock. Available: ' + Utils.number(p.stock), 'error'); return false; }
          }
          await API.stockMove(data);
          Utils.toast('Stock movement recorded', 'success');
          await this.load();
          return true;
        }
      });
      return m;
    },

    export() {
      const p = this.state.products;
      Utils.exportCSV('inventory', p, [
        { label: 'Product ID', key: 'id' }, { label: 'Product', key: 'name' }, { label: 'SKU', key: 'sku' },
        { label: 'Category', key: 'category' }, { label: 'Stock', key: 'stock' }, { label: 'Minimum', key: 'minStock' },
        { label: 'Cost Price', key: 'costPrice' }, { label: 'Stock Value', key: 'value', pdf: (r) => Number(r.stock) * Number(r.costPrice),
          render: (r) => Number(r.stock) * Number(r.costPrice) }
      ]);
      Utils.exportCSV('stock_movements', this.state.movements, [
        { label: 'Movement ID', key: 'id' }, { label: 'Product ID', key: 'productId' }, { label: 'Product', key: 'productName' },
        { label: 'Type', key: 'type' }, { label: 'Quantity', key: 'quantity' }, { label: 'Previous Stock', key: 'previousStock' },
        { label: 'New Stock', key: 'newStock' }, { label: 'Date', key: 'date' }, { label: 'User', key: 'user' }, { label: 'Reason', key: 'reason' }
      ]);
    }
  };

  window.Page = Page;
})();
