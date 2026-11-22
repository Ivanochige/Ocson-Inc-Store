/* ==========================================================================
   Ocson Inc. Store — Dashboard (all figures computed by the backend)
   ========================================================================== */
(function () {
  'use strict';

  const Page = {
    title: 'Dashboard',
    subtitle: 'Live overview of sales, stock and profitability',
    state: { period: 'month', from: '', to: '', data: null },
    charts: {},

    async init() {
      this.renderFilters();
      this.renderSkeleton();
      this.bind();
      await this.load();
    },

    renderFilters() {
      const body = Utils.$('#page-body');
      body.innerHTML =
        '<div class="dashboard-filters no-print">' +
        '<div class="period-tabs">' +
        [['today', 'Today'], ['week', '7 days'], ['month', 'This month'], ['quarter', 'Quarter'], ['year', 'Year'], ['all', 'All']]
          .map(([v, l]) => '<button class="period-tab' + (v === this.state.period ? ' active' : '') + '" data-period="' + v + '">' + l + '</button>').join('') +
        '</div>' +
        '<div class="date-range"><input type="date" id="dash-from" class="form-control" title="From date">' +
        '<span class="muted">to</span><input type="date" id="dash-to" class="form-control" title="To date">' +
        '<button class="btn btn-ghost btn-sm" id="dash-apply"><i data-lucide="filter"></i> Apply</button>' +
        '<button class="btn btn-primary btn-sm" id="dash-refresh"><i data-lucide="refresh-cw"></i> Refresh</button>' +
        '</div></div>' +
        '<div id="dash-content"></div>';
      Utils.repaintIcons(body);
    },

    renderSkeleton() {
      Utils.$('#dash-content').innerHTML =
        '<div class="kpi-grid">' + Array.from({ length: 8 }, () => '<div class="stat-card"><div class="skeleton" style="height:12px;width:60%"></div><div class="skeleton" style="height:28px;width:75%;margin-top:14px"></div><div class="skeleton" style="height:10px;width:40%;margin-top:10px"></div></div>').join('') + '</div>' +
        '<div class="chart-grid"><div class="card"><div class="card-body"><div class="skeleton" style="height:250px"></div></div></div><div class="card"><div class="card-body"><div class="skeleton" style="height:250px"></div></div></div></div>';
    },

    bind() {
      Utils.$$('.period-tab').forEach((btn) => btn.addEventListener('click', () => {
        Utils.$$('.period-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.period = btn.dataset.period;
        const r = Utils.dateRangeFor(this.state.period);
        this.state.from = r.from; this.state.to = r.to;
        Utils.$('#dash-from').value = r.from;
        Utils.$('#dash-to').value = r.to;
        this.load();
      }));
      Utils.$('#dash-apply').addEventListener('click', () => {
        this.state.from = Utils.$('#dash-from').value;
        this.state.to = Utils.$('#dash-to').value;
        this.state.period = 'custom';
        this.load();
      });
      Utils.$('#dash-refresh').addEventListener('click', () => this.load());
      window.addEventListener('ocson:theme', () => { if (this.state.data) this.renderCharts(this.state.data.charts || {}); });
    },

    async load() {
      const container = Utils.$('#dash-content');
      Utils.inlineLoading(container, 4);
      try {
        const data = await API.dashboard({ period: this.state.period, from: this.state.from, to: this.state.to });
        this.state.data = data;
        this.render(data);
      } catch (err) {
        container.innerHTML = Utils.errorState(err.message, 'dash-retry');
        container.querySelector('[data-action]')?.addEventListener('click', () => this.load());
      }
    },

    kpi(label, value, icon, tone, foot) {
      return '<div class="stat-card fade-up"><div class="stat-top"><div><div class="stat-label">' + Utils.esc(label) + '</div>' +
        '<div class="stat-value">' + value + '</div></div><span class="stat-icon ' + tone + '"><i data-lucide="' + icon + '"></i></span></div>' +
        '<div class="stat-foot">' + (foot || '') + '</div></div>';
    },

    render(d) {
      const m = (v) => Utils.money(v);
      const html =
        '<div class="kpi-grid">' +
        this.kpi('Total Sales Today', m(d.salesToday), 'calendar-days', 'green', 'Transactions: ' + Utils.number(d.todayCount || 0)) +
        this.kpi('Sales This Month', m(d.salesMonth), 'trending-up', 'blue', Utils.esc(Utils.formatPeriod(this.state.period))) +
        this.kpi('Total Revenue', m(d.revenue), 'circle-dollar-sign', 'green', 'Filtered period · ' + Utils.number(d.transactionCount || 0) + ' sales') +
        this.kpi('Cost of Goods Sold', m(d.cogs), 'coins', 'amber', 'Based on cost price') +
        this.kpi('Gross Profit', m(d.grossProfit), 'chart-line', 'purple', 'Margin ' + (d.grossMargin || '0') + '%') +
        this.kpi('Net Operating Profit', m(d.netProfit), 'wallet', 'green', 'After operating expenses') +
        this.kpi('Total Products', Utils.number(d.totalProducts), 'package', 'navy', 'Active catalogue') +
        this.kpi('Total Stock Quantity', Utils.number(d.totalStock), 'boxes', 'blue', 'Units on hand') +
        '</div>' +
        '<div class="kpi-grid secondary">' +
        this.kpi('Low Stock Products', Utils.number(d.lowStock), 'triangle-alert', 'amber', 'At or below minimum') +
        this.kpi('Out-of-Stock Products', Utils.number(d.outOfStock), 'package-x', 'red', 'Requires restocking') +
        this.kpi('Pending Orders', Utils.number(d.pendingOrders), 'clipboard-list', 'blue', 'Awaiting processing') +
        this.kpi('Total Expenses', m(d.totalExpenses), 'receipt', 'red', 'Operating costs') +
        '</div>' +
        (d.lowStock > 0 || d.outOfStock > 0 ?
          '<div class="alert alert-warning"><i data-lucide="triangle-alert"></i><div><strong>Stock attention needed.</strong> ' +
          (d.lowStock || 0) + ' product(s) low, ' + (d.outOfStock || 0) + ' out of stock. <a href="inventory.html" class="font-bold">Open inventory →</a></div></div>' : '') +
        '<div class="highlight-strip">' +
        '<div class="highlight-item green"><div class="label">AVERAGE SALE</div><div class="value">' + m(d.avgSale) + '</div><div class="foot">Per completed transaction</div></div>' +
        '<div class="highlight-item navy"><div class="label">GROSS MARGIN</div><div class="value">' + (d.grossMargin || '0') + '%</div><div class="foot">Revenue vs cost of goods</div></div>' +
        '<div class="highlight-item amber"><div class="label">STOCK VALUE</div><div class="value">' + m(d.stockValue) + '</div><div class="foot">At current cost price</div></div>' +
        '</div>' +
        '<div class="chart-grid">' +
        this.chartCard('Daily Sales Trends', 'dailySalesChart', 'Trend of completed sales', 'line') +
        this.chartCard('Monthly Revenue', 'monthlyRevenueChart', 'Revenue by month', 'bar') +
        '</div>' +
        '<div class="chart-grid">' +
        this.chartCard('Sales by Category', 'categoryChart', 'Revenue contribution', 'doughnut') +
        this.chartCard('Top-Selling Products', 'topProductsChart', 'By units sold', 'bar') +
        '</div>' +
        '<div class="chart-grid">' +
        this.chartCard('Payment Methods', 'paymentChart', 'Revenue by method', 'pie') +
        this.chartCard('Profit Performance', 'profitChart', 'Revenue, cost and profit', 'bar') +
        '</div>' +
        '<div class="chart-grid">' +
        this.chartCard('Inventory Movement', 'inventoryChart', 'Stock in vs stock out', 'line') +
        '<div class="card"><div class="card-header"><h3><i data-lucide="activity"></i> Recent Sales</h3><a href="sales.html" class="btn btn-ghost btn-sm">View all</a></div>' +
        '<div class="card-body pad-sm">' + this.recentSales(d.recentSales || []) + '</div></div>' +
        '</div>';
      const root = Utils.$('#dash-content');
      root.innerHTML = html;
      Utils.repaintIcons(root);
      this.renderCharts(d.charts || {});
    },

    chartCard(title, id, subtitle, type) {
      return '<div class="card chart-card"><div class="card-header"><h3><i data-lucide="' +
        (type === 'line' ? 'chart-line' : type === 'bar' ? 'chart-column' : 'chart-pie') + '"></i> ' + Utils.esc(title) +
        '</h3><span class="badge badge-neutral">' + Utils.esc(this.state.period) + '</span></div>' +
        '<div class="card-body"><div class="chart-box"><canvas id="' + id + '"></canvas></div>' +
        '<p class="form-hint mt-2">' + Utils.esc(subtitle) + ' · source: Google Sheets</p></div></div>';
    },

    recentSales(rows) {
      if (!rows.length) return Utils.emptyState('No sales yet', 'Completed sales will appear here.');
      return '<div class="activity-list">' + rows.slice(0, 6).map((s) =>
        '<div class="activity-row"><span class="activity-icon"><i data-lucide="receipt-text"></i></span>' +
        '<div class="activity-main"><strong>' + Utils.esc(s.receiptNo || s.id) + ' · ' + Utils.esc(s.customer || 'Walk-in') + '</strong>' +
        '<small>' + Utils.date(s.date) + ' · ' + Utils.esc(s.method || 'Cash') + '</small></div>' +
        '<span class="activity-value">' + Utils.money(s.total) + '</span></div>').join('') + '</div>';
    },

    chartTheme() {
      const cs = getComputedStyle(document.documentElement);
      return {
        text: cs.getPropertyValue('--text-2').trim() || '#475569',
        grid: cs.getPropertyValue('--border').trim() || '#e2e8f0',
        surface: cs.getPropertyValue('--surface').trim() || '#fff'
      };
    },

    draw(id, config) {
      const canvas = Utils.$('#' + id);
      if (!canvas) return;
      if (this.charts[id]) { this.charts[id].destroy(); delete this.charts[id]; }
      this.charts[id] = new Chart(canvas.getContext('2d'), config);
    },

    renderCharts(c) {
      const t = this.chartTheme(), colors = APP_CONFIG.CHART_COLORS;
      Chart.defaults.font.family = "'Inter', sans-serif";
      Chart.defaults.color = t.text;
      const base = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0b1526', padding: 10, cornerRadius: 8 } },
        scales: {
          x: { grid: { display: false }, ticks: { color: t.text, font: { size: 10 }, maxRotation: 40, minRotation: 0 } },
          y: { grid: { color: t.grid }, border: { display: false }, ticks: { color: t.text, font: { size: 10 }, callback: (v) => Utils.compact(v) } }
        }
      };
      const line = (data) => Object.assign({}, base, {
        type: 'line',
        data: {
          labels: data.labels || [],
          datasets: [{ label: 'Sales', data: data.values || [], borderColor: colors[0], backgroundColor: 'rgba(22,163,74,.12)',
            fill: true, tension: .38, pointRadius: 3, pointBackgroundColor: colors[0], borderWidth: 2.5 }]
        }
      });
      this.draw('dailySalesChart', line(c.dailySales));
      this.draw('monthlyRevenueChart', Object.assign({}, base, {
        type: 'bar',
        data: { labels: (c.monthlyRevenue || {}).labels || [], datasets: [{ label: 'Revenue', data: (c.monthlyRevenue || {}).values || [],
          backgroundColor: colors[1], borderRadius: 6, maxBarThickness: 42 }] }
      }));
      this.draw('categoryChart', {
        type: 'doughnut',
        data: { labels: (c.byCategory || {}).labels || [], datasets: [{ data: (c.byCategory || {}).values || [], backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 10 } } } } }
      });
      this.draw('topProductsChart', Object.assign({}, base, {
        type: 'bar',
        indexAxis: 'y',
        data: { labels: (c.topProducts || {}).labels || [], datasets: [{ label: 'Units', data: (c.topProducts || {}).values || [],
          backgroundColor: colors[2], borderRadius: 6, maxBarThickness: 22 }] }
      }));
      this.draw('paymentChart', {
        type: 'pie',
        data: { labels: (c.paymentMethods || {}).labels || [], datasets: [{ data: (c.paymentMethods || {}).values || [], backgroundColor: [colors[0], colors[1], colors[2]], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, usePointStyle: true, font: { size: 10 } } } } }
      });
      this.draw('profitChart', Object.assign({}, base, {
        type: 'bar',
        data: { labels: (c.profit || {}).labels || [], datasets: [
          { label: 'Revenue', data: (c.profit || {}).revenue || [], backgroundColor: colors[1], borderRadius: 5 },
          { label: 'Cost', data: (c.profit || {}).cogs || [], backgroundColor: colors[2], borderRadius: 5 },
          { label: 'Profit', data: (c.profit || {}).profit || [], backgroundColor: colors[0], borderRadius: 5 }
        ] },
        options: Object.assign({}, base.options, { plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, usePointStyle: true, font: { size: 10 } } } } })
      }));
      this.draw('inventoryChart', Object.assign({}, base, {
        type: 'line',
        data: { labels: (c.inventoryMovement || {}).labels || [], datasets: [
          { label: 'Stock in', data: (c.inventoryMovement || {}).in || [], borderColor: colors[0], backgroundColor: 'rgba(22,163,74,.1)', fill: true, tension: .35, borderWidth: 2 },
          { label: 'Stock out', data: (c.inventoryMovement || {}).out || [], borderColor: colors[4], backgroundColor: 'rgba(239,68,68,.06)', fill: true, tension: .35, borderWidth: 2 }
        ] },
        options: Object.assign({}, base.options, { plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, usePointStyle: true, font: { size: 10 } } } } })
      }));
    }
  };

  window.Page = Page;
})();
