/* ==========================================================================
   Ocson Inc. Store — Expense management
   ========================================================================== */
(function () {
  'use strict';

  const CATEGORIES = ['Rent', 'Transport', 'Salaries', 'Utilities', 'Marketing', 'Packaging', 'Internet', 'Maintenance', 'Other'];
  const METHODS = ['Cash', 'Mobile Money', 'Bank Transfer'];
  const Page = {
    title: 'Expenses', subtitle: 'Operating costs and category breakdown',
    state: { expenses: [], summary: null, q: '', category: '', from: Utils.monthStart(), to: Utils.today() },

    async init() { this.render(); this.bind(); await this.load(); },

    render() {
      Utils.$('#page-body').innerHTML =
        '<div class="page-heading"><div><h2>Expense register</h2><p>Every operating cost is captured with category, date, payment method and responsible user.</p></div>' +
        (Auth.can('expenses.edit') ? '<button class="btn btn-primary" id="exp-add"><i data-lucide="plus"></i> Record expense</button>' : '') + '</div>' +
        '<div class="dashboard-filters no-print"><div class="date-range">' +
        '<input type="date" id="exp-from" class="form-control" value="' + Utils.attr(this.state.from) + '"><span class="muted">to</span>' +
        '<input type="date" id="exp-to" class="form-control" value="' + Utils.attr(this.state.to) + '">' +
        '<button class="btn btn-primary btn-sm" id="exp-apply"><i data-lucide="filter"></i> Apply</button></div></div>' +
        '<div id="exp-kpis" class="kpi-grid secondary mb-3"></div>' +
        '<div class="chart-grid"><div class="card chart-card"><div class="card-header"><h3><i data-lucide="chart-pie"></i> Expenses by category</h3></div>' +
        '<div class="card-body"><div class="donut-wrap"><canvas id="exp-category-chart"></canvas></div></div></div>' +
        '<div class="card"><div class="card-header"><h3><i data-lucide="chart-column"></i> Category breakdown</h3></div><div class="card-body" id="exp-breakdown"></div></div></div>' +
        '<div class="card"><div class="card-body"><div class="filter-bar">' +
        '<input class="form-control search-input" id="exp-q" placeholder="Search description, category, user…">' +
        '<select class="form-select" id="exp-category"><option value="">All categories</option>' + CATEGORIES.map((c) => '<option>' + c + '</option>').join('') + '</select>' +
        '<button class="btn btn-ghost btn-sm" id="exp-export"><i data-lucide="file-down"></i> Export CSV</button>' +
        '<button class="btn btn-ghost btn-sm" id="exp-pdf"><i data-lucide="file-text"></i> Export PDF</button></div>' +
        '<div id="exp-table"><div class="skeleton-list">' + Array.from({ length: 5 }, () => '<div class="skeleton skeleton-row"></div>').join('') + '</div></div>' +
        '</div></div>';
      Utils.repaintIcons(Utils.$('#page-body'));
    },

    bind() {
      Utils.$('#exp-add')?.addEventListener('click', () => this.form());
      Utils.$('#exp-apply').addEventListener('click', () => { this.state.from = Utils.$('#exp-from').value; this.state.to = Utils.$('#exp-to').value; this.load(); });
      Utils.$('#exp-q').addEventListener('input', Utils.debounce(() => this.renderTable(), 250));
      Utils.$('#exp-category').addEventListener('change', (e) => { this.state.category = e.target.value; this.renderTable(); });
      Utils.$('#exp-export').addEventListener('click', () => this.export());
      Utils.$('#exp-pdf').addEventListener('click', () => this.pdf());
      Utils.$('#exp-table').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const x = this.state.expenses.find((i) => String(i.id) === String(b.closest('[data-id]')?.dataset.id));
        if (b.dataset.act === 'delete') this.remove(x);
      });
      window.addEventListener('ocson:theme', () => { if (this.state.summary) this.renderChart(this.state.summary); });
    },

    async load() {
      try {
        const [r, s] = await Promise.all([
          API.expenses({ from: this.state.from, to: this.state.to, limit: 400 }),
          API.expenseSummary({ from: this.state.from, to: this.state.to })
        ]);
        this.state.expenses = Array.isArray(r) ? r : (r.items || []);
        this.state.summary = s;
        this.renderKpis(); this.renderTable(); this.renderChart(s);
      } catch (err) {
        Utils.$('#exp-table').innerHTML = Utils.errorState(err.message, 'exp-retry');
        Utils.$('#exp-table [data-action]')?.addEventListener('click', () => this.load());
      }
    },

    renderKpis() {
      const e = this.state.expenses, s = this.state.summary || {};
      const byCat = s.byCategory || {};
      const cards = [
        ['Total expenses', Utils.money(s.total || Utils.sum(e, (x) => Number(x.amount))), 'receipt', 'red'],
        ['Transactions', e.length, 'arrow-left-right', 'navy'],
        ['Largest category', Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])[0] || '—', 'chart-pie', 'purple'],
        ['Daily average', Utils.money(e.length ? (s.total || Utils.sum(e, (x) => Number(x.amount))) / Math.max(1, Math.round((new Date(this.state.to) - new Date(this.state.from)) / 86400000) + 1) : 0), 'calendar-days', 'blue'],
        ['Cash payments', Utils.money(Utils.sum(e.filter((x) => x.paymentMethod === 'Cash'), (x) => Number(x.amount))), 'banknote', 'green'],
        ['Mobile Money', Utils.money(Utils.sum(e.filter((x) => x.paymentMethod === 'Mobile Money'), (x) => Number(x.amount))), 'smartphone', 'blue'],
        ['Bank Transfer', Utils.money(Utils.sum(e.filter((x) => x.paymentMethod === 'Bank Transfer'), (x) => Number(x.amount))), 'landmark', 'amber'],
        ['Categories used', Object.keys(byCat).length || new Set(e.map((x) => x.category)).size, 'layers', 'purple']
      ];
      Utils.$('#exp-kpis').innerHTML = cards.map(([l, v, i, t]) =>
        '<div class="stat-card"><div class="stat-top"><div><div class="stat-label">' + l + '</div><div class="stat-value" style="font-size:' + (String(v).length > 12 ? '17px' : '') + '">' + Utils.esc(v) + '</div></div>' +
        '<span class="stat-icon ' + t + '"><i data-lucide="' + i + '"></i></span></div></div>').join('');
      Utils.repaintIcons(Utils.$('#exp-kpis'));
      const max = Math.max(...Object.values(byCat), 1);
      Utils.$('#exp-breakdown').innerHTML = Object.keys(byCat).length ? Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
        '<div class="rank-row"><div class="rank-info"><strong>' + Utils.esc(k) + '</strong><div class="progress-track"><div class="progress-fill" style="width:' + (v / max * 100) + '%"></div></div></div>' +
        '<span class="rank-value">' + Utils.money(v) + '</span></div>').join('') : '<p class="muted">No expenses in this period.</p>';
    },

    renderTable() {
      const q = (Utils.$('#exp-q')?.value || '').toLowerCase();
      const rows = this.state.expenses.filter((e) => (!this.state.category || e.category === this.state.category) &&
        (!q || (e.description + ' ' + e.category + ' ' + (e.user || '')).toLowerCase().includes(q)));
      Utils.$('#exp-table').innerHTML = Utils.table([
        { label: 'Expense ID', key: 'id', render: (e) => '<span class="font-mono text-xs">' + Utils.esc(e.id) + '</span>' },
        { label: 'Date', key: 'date', render: (e) => Utils.date(e.date) },
        { label: 'Category', key: 'category', render: (e) => Utils.badge(e.category) },
        { label: 'Description', key: 'description', render: (e) => '<strong>' + Utils.esc(e.description || '—') + '</strong>' },
        { label: 'Method', key: 'paymentMethod', render: (e) => Utils.badge(e.paymentMethod || 'Cash') },
        { label: 'User', key: 'user' }, { label: 'Amount', key: 'amount', align: 'right', render: (e) => '<strong>' + Utils.money(e.amount) + '</strong>' },
        { label: 'Actions', align: 'right', render: (e) => Auth.can('expenses.edit') ?
          '<button class="btn btn-ghost btn-sm btn-icon" data-act="delete" title="Delete"><i data-lucide="trash-2"></i></button>' : '—' }
      ], rows, { empty: 'No expenses recorded in this period.' });
      Utils.repaintIcons(Utils.$('#exp-table'));
    },

    renderChart(s) {
      const canvas = Utils.$('#exp-category-chart');
      if (!canvas || !window.Chart) return;
      const byCat = s.byCategory || {};
      if (this._chart) { this._chart.destroy(); this._chart = null; }
      this._chart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels: Object.keys(byCat), datasets: [{ data: Object.values(byCat), backgroundColor: APP_CONFIG.CHART_COLORS, borderWidth: 0, hoverOffset: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, usePointStyle: true, font: { size: 10 } } } } }
      });
    },

    form() {
      Utils.modal({
        title: 'Record expense', icon: 'receipt', size: 'md', confirmText: 'Save expense',
        body: '<form id="exp-form">' +
          '<div class="form-row"><div class="form-group"><label class="form-label">Date <span class="req">*</span></label><input class="form-control" name="date" type="date" value="' + Utils.today() + '" required></div>' +
          '<div class="form-group"><label class="form-label">Category <span class="req">*</span></label><select class="form-select" name="category" required>' +
          CATEGORIES.map((c) => '<option>' + c + '</option>').join('') + '</select></div></div>' +
          '<div class="form-group"><label class="form-label">Description <span class="req">*</span></label><input class="form-control" name="description" required placeholder="e.g. November rent payment"></div>' +
          '<div class="form-row"><div class="form-group"><label class="form-label">Amount (UGX) <span class="req">*</span></label><input class="form-control" name="amount" type="number" min="1" step="0.01" required></div>' +
          '<div class="form-group"><label class="form-label">Payment method</label><select class="form-select" name="paymentMethod">' + METHODS.map((m) => '<option>' + m + '</option>').join('') + '</select></div></div>' +
          '<div class="form-group"><label class="form-label">Responsible user</label><input class="form-control" name="user" value="' + Utils.attr(Auth.name()) + '"></div>' +
          '</form>',
        onConfirm: async (el) => {
          const form = Utils.$('#exp-form', el), data = Utils.formData(form);
          const v = Utils.validate(data, { date: { required: true }, category: { required: true, oneOf: CATEGORIES }, description: { required: true, min: 3 }, amount: { required: true, numeric: true, minValue: 1 } });
          if (!v.ok) { Utils.showFormErrors(form, v.errors); return false; }
          await API.saveExpense(data);
          Utils.toast('Expense recorded', 'success'); this.load(); return true;
        }
      });
    },

    async remove(e) {
      if (!e) return;
      const ok = await Utils.confirm('Delete expense', 'Remove ' + Utils.money(e.amount) + ' (' + e.category + ')?', { danger: true, confirmText: 'Delete' });
      if (!ok) return;
      try { await API.deleteExpense(e.id); Utils.toast('Expense deleted', 'success'); this.load(); }
      catch (err) { Utils.toast(err.message, 'error'); }
    },

    export() {
      Utils.exportCSV('expenses', this.state.expenses, [
        { label: 'Expense ID', key: 'id' }, { label: 'Date', key: 'date' }, { label: 'Category', key: 'category' },
        { label: 'Description', key: 'description' }, { label: 'Amount', key: 'amount' },
        { label: 'Payment Method', key: 'paymentMethod' }, { label: 'User', key: 'user' }
      ]);
    },
    pdf() {
      Utils.exportPDF({
        title: 'Expense Report', subtitle: Utils.formatPeriod('custom') + ' · ' + this.state.from + ' to ' + this.state.to,
        filename: 'expenses', rows: this.state.expenses,
        columns: [
          { label: 'ID', key: 'id', width: 30 }, { label: 'Date', key: 'date', width: 26 }, { label: 'Category', key: 'category', width: 28 },
          { label: 'Description', key: 'description', width: 55 }, { label: 'Method', key: 'paymentMethod', width: 28 },
          { label: 'User', key: 'user', width: 30 }, { label: 'Amount', key: 'amount', width: 30, pdf: (r) => Utils.money(r.amount) }
        ]
      });
    }
  };

  window.Page = Page;
})();
