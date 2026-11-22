/* ==========================================================================
   Ocson Inc. Store — Reports & Analytics (server-calculated, exportable)
   ========================================================================== */
(function () {
  'use strict';

  const REPORTS = {
    'dailySales': { group: 'Sales', label: 'Daily sales', icon: 'calendar-days', cols: [['Period', 'period'], ['Transactions', 'count'], ['Revenue', 'revenue', 'money'], ['Cost', 'cogs', 'money'], ['Profit', 'profit', 'money']] },
    'weeklySales': { group: 'Sales', label: 'Weekly sales', icon: 'calendar-range', cols: [['Period', 'period'], ['Transactions', 'count'], ['Revenue', 'revenue', 'money'], ['Cost', 'cogs', 'money'], ['Profit', 'profit', 'money']] },
    'monthlySales': { group: 'Sales', label: 'Monthly sales', icon: 'calendar', cols: [['Month', 'period'], ['Transactions', 'count'], ['Revenue', 'revenue', 'money'], ['Cost', 'cogs', 'money'], ['Profit', 'profit', 'money']] },
    'annualSales': { group: 'Sales', label: 'Annual sales', icon: 'calendar-days', cols: [['Year', 'period'], ['Transactions', 'count'], ['Revenue', 'revenue', 'money'], ['Cost', 'cogs', 'money'], ['Profit', 'profit', 'money']] },
    'salesByProduct': { group: 'Sales', label: 'Sales by product', icon: 'package', cols: [['Product', 'name'], ['SKU', 'sku'], ['Units', 'quantity'], ['Revenue', 'revenue', 'money'], ['Cost', 'cogs', 'money'], ['Profit', 'profit', 'money']] },
    'salesByCategory': { group: 'Sales', label: 'Sales by category', icon: 'layers', cols: [['Category', 'name'], ['Units', 'quantity'], ['Revenue', 'revenue', 'money'], ['Share', 'share', 'percent']] },
    'salesByPaymentMethod': { group: 'Sales', label: 'Sales by payment method', icon: 'credit-card', cols: [['Method', 'name'], ['Transactions', 'count'], ['Revenue', 'revenue', 'money'], ['Share', 'share', 'percent']] },
    'salesBySalesperson': { group: 'Sales', label: 'Sales by salesperson', icon: 'user', cols: [['Salesperson', 'name'], ['Transactions', 'count'], ['Revenue', 'revenue', 'money'], ['Profit', 'profit', 'money']] },
    'currentStock': { group: 'Inventory', label: 'Current stock', icon: 'boxes', cols: [['Product', 'name'], ['SKU', 'sku'], ['Category', 'category'], ['In stock', 'stock'], ['Minimum', 'minStock'], ['Status', 'status'], ['Stock value', 'value', 'money']] },
    'stockValuation': { group: 'Inventory', label: 'Stock valuation', icon: 'circle-dollar-sign', cols: [['Product', 'name'], ['SKU', 'sku'], ['Quantity', 'stock'], ['Unit cost', 'costPrice', 'money'], ['Cost value', 'costValue', 'money'], ['Retail value', 'retailValue', 'money']] },
    'lowStock': { group: 'Inventory', label: 'Low stock', icon: 'triangle-alert', cols: [['Product', 'name'], ['SKU', 'sku'], ['In stock', 'stock'], ['Minimum', 'minStock'], ['Category', 'category'], ['Supplier', 'supplier']] },
    'outOfStock': { group: 'Inventory', label: 'Out of stock', icon: 'package-x', cols: [['Product', 'name'], ['SKU', 'sku'], ['Category', 'category'], ['Supplier', 'supplier'], ['Status', 'status']] },
    'stockMovement': { group: 'Inventory', label: 'Stock movement', icon: 'arrow-left-right', cols: [['Movement ID', 'id'], ['Date', 'date', 'date'], ['Product', 'productName'], ['Type', 'type'], ['Qty', 'quantity'], ['Previous', 'previousStock'], ['New', 'newStock'], ['User', 'user'], ['Reason', 'reason']] },
    'damagedStock': { group: 'Inventory', label: 'Damaged stock', icon: 'triangle-alert', cols: [['Movement ID', 'id'], ['Date', 'date', 'date'], ['Product', 'productName'], ['Qty', 'quantity'], ['Reason', 'reason'], ['User', 'user']] },
    'fastMoving': { group: 'Inventory', label: 'Fast-moving products', icon: 'zap', cols: [['Product', 'name'], ['SKU', 'sku'], ['Units sold', 'quantity'], ['Revenue', 'revenue', 'money'], ['Stock left', 'stock']] },
    'slowMoving': { group: 'Inventory', label: 'Slow-moving products', icon: 'snail', cols: [['Product', 'name'], ['SKU', 'sku'], ['Units sold', 'quantity'], ['Stock left', 'stock'], ['Stock value', 'value', 'money']] },
    'revenue': { group: 'Financial', label: 'Revenue', icon: 'trending-up', cols: [['Period', 'period'], ['Sales', 'count'], ['Gross revenue', 'revenue', 'money'], ['Refunds', 'refunds', 'money'], ['Net revenue', 'net', 'money']] },
    'cogs': { group: 'Financial', label: 'Cost of goods sold', icon: 'coins', cols: [['Period', 'period'], ['Product', 'name'], ['Units', 'quantity'], ['Unit cost', 'costPrice', 'money'], ['COGS', 'cogs', 'money']] },
    'grossProfit': { group: 'Financial', label: 'Gross profit', icon: 'chart-line', cols: [['Period', 'period'], ['Revenue', 'revenue', 'money'], ['Cost', 'cogs', 'money'], ['Gross profit', 'profit', 'money'], ['Margin', 'margin', 'percent']] },
    'operatingExpenses': { group: 'Financial', label: 'Operating expenses', icon: 'receipt', cols: [['Category', 'name'], ['Transactions', 'count'], ['Amount', 'amount', 'money'], ['Share', 'share', 'percent']] },
    'netProfit': { group: 'Financial', label: 'Net operating profit', icon: 'wallet', cols: [['Period', 'period'], ['Revenue', 'revenue', 'money'], ['COGS', 'cogs', 'money'], ['Gross profit', 'grossProfit', 'money'], ['Expenses', 'expenses', 'money'], ['Net profit', 'netProfit', 'money']] },
    'profitMargins': { group: 'Financial', label: 'Profit margins', icon: 'percent', cols: [['Product', 'name'], ['Revenue', 'revenue', 'money'], ['Cost', 'cogs', 'money'], ['Profit', 'profit', 'money'], ['Margin', 'margin', 'percent']] },
    'outstandingBalances': { group: 'Financial', label: 'Outstanding balances', icon: 'wallet', cols: [['Type', 'type'], ['Name', 'name'], ['Balance', 'balance', 'money'], ['Contact', 'contact']] }
  };

  const Page = {
    title: 'Reports', subtitle: 'Sales, inventory and financial analytics',
    state: { type: 'dailySales', rows: [], summary: null, from: Utils.monthStart(), to: Utils.today(), q: '', sort: '', dir: 'asc' },

    async init() { this.render(); this.bind(); await this.load(); },

    render() {
      const groups = [...new Set(Object.values(REPORTS).map((r) => r.group))];
      Utils.$('#page-body').innerHTML =
        '<div class="page-heading"><div><h2>Reports & analytics</h2><p>All figures are calculated from transactions in Google Sheets. Filter, sort and export any report.</p></div>' +
        '<button class="btn btn-ghost" id="rep-print"><i data-lucide="printer"></i> Print</button></div>' +
        '<div class="grid-2" style="grid-template-columns:260px minmax(0,1fr);align-items:start">' +
        '<div class="card"><div class="card-header"><h3><i data-lucide="folder-open"></i> Report library</h3></div>' +
        '<div class="card-body" style="padding:8px"><div id="rep-nav">' + groups.map((g) =>
          '<div class="nav-label" style="padding:10px 10px 6px">' + g.toUpperCase() + '</div>' +
          Object.keys(REPORTS).filter((k) => REPORTS[k].group === g).map((k) =>
            '<button class="nav-item nav-button' + (k === this.state.type ? ' active' : '') + '" data-report="' + k + '" style="' + (k === this.state.type ? '' : 'color:var(--text-2)') + '">' +
            '<i data-lucide="' + REPORTS[k].icon + '" class="nav-icon"></i><span>' + REPORTS[k].label + '</span></button>').join('')).join('') +
        '</div></div></div>' +
        '<div class="stack"><div class="card"><div class="card-body">' +
        '<div class="filter-bar"><input type="date" id="rep-from" class="form-control" value="' + Utils.attr(this.state.from) + '">' +
        '<span class="muted">to</span><input type="date" id="rep-to" class="form-control" value="' + Utils.attr(this.state.to) + '">' +
        '<button class="btn btn-primary btn-sm" id="rep-apply"><i data-lucide="filter"></i> Apply</button>' +
        '<input class="form-control search-input" id="rep-q" placeholder="Search within report…">' +
        '<button class="btn btn-ghost btn-sm" id="rep-csv"><i data-lucide="file-down"></i> CSV</button>' +
        '<button class="btn btn-ghost btn-sm" id="rep-pdf"><i data-lucide="file-text"></i> PDF</button></div>' +
        '<div id="rep-kpis" class="kpi-grid secondary"></div>' +
        '</div></div>' +
        '<div class="card"><div class="card-header"><h3><i data-lucide="chart-no-axes-combined"></i> <span id="rep-title">' + REPORTS[this.state.type].label + '</span></h3>' +
        '<span class="badge badge-neutral" id="rep-count"></span></div>' +
        '<div class="card-body"><div class="chart-box short mb-3"><canvas id="rep-chart"></canvas></div>' +
        '<div id="rep-table"><div class="skeleton-list">' + Array.from({ length: 5 }, () => '<div class="skeleton skeleton-row"></div>').join('') + '</div></div>' +
        '</div></div></div></div>';
      Utils.repaintIcons(Utils.$('#page-body'));
    },

    bind() {
      Utils.$$('[data-report]').forEach((b) => b.addEventListener('click', () => {
        this.state.type = b.dataset.report; this.state.q = '';
        Utils.$$('[data-report]').forEach((x) => { x.classList.toggle('active', x === b); x.style.color = ''; });
        Utils.$('#rep-q').value = '';
        Utils.$('#rep-title').textContent = REPORTS[this.state.type].label;
        this.load();
      }));
      Utils.$('#rep-apply').addEventListener('click', () => { this.state.from = Utils.$('#rep-from').value; this.state.to = Utils.$('#rep-to').value; this.load(); });
      Utils.$('#rep-q').addEventListener('input', Utils.debounce((e) => { this.state.q = e.target.value; this.renderTable(); }, 250));
      Utils.$('#rep-csv').addEventListener('click', () => this.exportCSV());
      Utils.$('#rep-pdf').addEventListener('click', () => this.exportPDF());
      Utils.$('#rep-print').addEventListener('click', () => this.print());
      window.addEventListener('ocson:theme', () => { if (this.state.rows.length) this.renderChart(); });
    },

    async load() {
      const box = Utils.$('#rep-table');
      Utils.inlineLoading(box, 5);
      try {
        const res = await API.report(this.state.type, { from: this.state.from, to: this.state.to });
        this.state.rows = Array.isArray(res) ? res : (res.rows || res.items || []);
        this.state.summary = res.summary || null;
        this.renderKpis(); this.renderTable(); this.renderChart();
      } catch (err) {
        box.innerHTML = Utils.errorState(err.message, 'rep-retry');
        box.querySelector('[data-action]')?.addEventListener('click', () => this.load());
      }
    },

    renderKpis() {
      const r = this.state.rows, cfg = REPORTS[this.state.type];
      const numericKeys = cfg.cols.filter((c) => ['money', 'percent', ''].includes(c[2])).slice(0, 3);
      const cards = numericKeys.map((c) => {
        const vals = r.map((x) => Number(x[c[1]]) || 0);
        const total = vals.reduce((a, b) => a + b, 0);
        const isMoney = c[2] === 'money';
        const value = c[2] === 'percent' ? (r.length ? (total / r.length).toFixed(1) + '%' : '0%') : isMoney ? Utils.money(total) : Utils.number(total);
        return '<div class="stat-card"><div class="stat-label">' + Utils.esc(c[0]) + ' (total)</div><div class="stat-value" style="font-size:19px">' + Utils.esc(value) + '</div></div>';
      });
      cards.push('<div class="stat-card"><div class="stat-label">Rows in report</div><div class="stat-value">' + r.length + '</div></div>');
      Utils.$('#rep-kpis').innerHTML = cards.join('');
    },

    value(row, col) {
      const v = row[col[1]];
      if (col[2] === 'money') return Utils.money(v);
      if (col[2] === 'percent') return Utils.esc(v == null ? '0%' : (String(v).includes('%') ? v : Number(v).toFixed(1) + '%'));
      if (col[2] === 'date') return Utils.date(v);
      if (col[1] === 'status' || col[1] === 'type') return Utils.badge(v);
      if (v == null || v === '') return '—';
      return Utils.esc(typeof v === 'object' ? JSON.stringify(v) : v);
    },

    filtered() {
      let rows = this.state.rows;
      if (this.state.q) {
        const q = this.state.q.toLowerCase();
        rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
      }
      if (this.state.sort) rows = Utils.sortRows(rows, this.state.sort, this.state.dir);
      return rows;
    },

    renderTable() {
      const cfg = REPORTS[this.state.type], rows = this.filtered();
      const cols = cfg.cols.map((c) => ({
        label: c[0], key: c[1], sortable: true, align: ['money', 'percent', ''].includes(c[2]) && /revenue|total|profit|cost|cogs|amount|quantity|stock|count|value|balance|qty/i.test(c[1]) ? 'right' : '',
        render: (r) => this.value(r, c)
      }));
      Utils.$('#rep-table').innerHTML = Utils.table(cols, rows, { empty: 'No data for this report and date range.' });
      Utils.$('#rep-count').textContent = rows.length + ' rows';
      Utils.$$('#rep-table [data-sort]').forEach((th) => th.addEventListener('click', () => {
        const key = th.dataset.sort;
        this.state.dir = this.state.sort === key && this.state.dir === 'asc' ? 'desc' : 'asc';
        this.state.sort = key;
        this.renderTable();
      }));
      Utils.repaintIcons(Utils.$('#rep-table'));
      this._csvRows = rows;
    },

    renderChart() {
      const canvas = Utils.$('#rep-chart');
      if (!canvas || !window.Chart) return;
      if (this._chart) { this._chart.destroy(); this._chart = null; }
      const rows = this.state.rows.slice(0, 12), cfg = REPORTS[this.state.type];
      const labelCol = cfg.cols[0], valueCol = cfg.cols.find((c) => c[2] === 'money') || cfg.cols.find((c) => /quantity|stock|count/i.test(c[1])) || cfg.cols[1];
      if (!rows.length || !valueCol) { canvas.style.display = 'none'; return; }
      canvas.style.display = '';
      const cs = getComputedStyle(document.documentElement);
      this._chart = new Chart(canvas.getContext('2d'), {
        type: cfg.group === 'Sales' ? 'line' : 'bar',
        data: {
          labels: rows.map((r) => String(r[labelCol[1]] || '').slice(0, 18)),
          datasets: [{ label: valueCol[0], data: rows.map((r) => Number(r[valueCol[1]]) || 0),
            backgroundColor: APP_CONFIG.CHART_COLORS[0], borderColor: APP_CONFIG.CHART_COLORS[0], borderRadius: 5, tension: .35, fill: cfg.group === 'Sales' }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: cs.getPropertyValue('--text-2').trim(), font: { size: 10 }, maxRotation: 40 }, grid: { display: false } },
            y: { ticks: { color: cs.getPropertyValue('--text-2').trim(), font: { size: 10 }, callback: (v) => Utils.compact(v) }, grid: { color: cs.getPropertyValue('--border').trim() } }
          }
        }
      });
    },

    exportCSV() {
      const cfg = REPORTS[this.state.type], rows = this._csvRows || this.state.rows;
      Utils.exportCSV(this.state.type, rows, cfg.cols.map((c) => ({ label: c[0], key: c[1] })));
    },
    exportPDF() {
      const cfg = REPORTS[this.state.type], rows = this._csvRows || this.state.rows;
      Utils.exportPDF({
        title: cfg.label + ' Report', subtitle: 'Period: ' + this.state.from + ' to ' + this.state.to,
        filename: this.state.type, rows,
        columns: cfg.cols.map((c) => ({ label: c[0], key: c[1], width: c[2] === 'money' || c[2] === 'percent' ? 30 : 42,
          pdf: (r) => c[2] === 'money' ? Utils.money(r[c[1]]) : (r[c[1]] == null ? '—' : String(r[c[1]])) }))
      });
    },
    print() {
      const cfg = REPORTS[this.state.type], rows = this._csvRows || this.state.rows;
      const html = '<h1>' + APP_CONFIG.APP_NAME + '</h1><h2>' + cfg.label + '</h2>' +
        '<p class="muted">Period: ' + this.state.from + ' to ' + this.state.to + ' · Generated ' + Utils.datetime(new Date()) + '</p>' +
        '<table><thead><tr>' + cfg.cols.map((c) => '<th>' + Utils.esc(c[0]) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + cfg.cols.map((c) => '<td>' + this.value(r, c) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table>';
      Utils.printHTML(html, cfg.label);
    }
  };

  window.Page = Page;
})();
