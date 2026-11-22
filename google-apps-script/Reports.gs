/* ==========================================================================
   Ocson Inc. Store — Reports.gs
   All dashboard and report figures are computed server-side from Sheets data.
   ========================================================================== */

/* --------------------------- Shared range helpers -------------------------- */
function RPT_rangeFor(period) {
  var now = new Date();
  var to = DB_now().slice(0, 10);
  var from = '';
  if (period === 'today') from = to;
  else if (period === 'week') from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  else if (period === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  else if (period === 'quarter') from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().slice(0, 10);
  else if (period === 'year') from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  return { from: from, to: to };
}

function RPT_range(params) {
  if (params && (params.from || params.to)) return { from: DB_date(params.from), to: DB_date(params.to) };
  return RPT_rangeFor(params ? params.period : 'month');
}

function RPT_inRange(day, range) {
  if (!day) return false;
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

function RPT_sales(range, includeRefunded) {
  return DB_filter('Sales', function (s) {
    if (!RPT_inRange(DB_date(s.date), range)) return false;
    if (!includeRefunded && String(s.status).toLowerCase() === 'refunded') return false;
    return true;
  });
}

function RPT_expenses(range) {
  return DB_filter('Expenses', function (e) { return RPT_inRange(DB_date(e.date), range); });
}

function RPT_itemsFor(sales) {
  var ids = {};
  sales.forEach(function (s) { ids[String(s.id)] = true; });
  return DB_filter('Sale_Items', function (i) { return ids[String(i.saleId)] === true; });
}

function RPT_group(rows, keyFn) {
  var out = {};
  rows.forEach(function (r) { var k = String(keyFn(r) || 'Unspecified'); (out[k] = out[k] || []).push(r); });
  return out;
}

function RPT_weekKey(date) {
  var d = new Date(date);
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + '-W' + ('0' + week).slice(-2);
}

function RPT_monthKey(date) { return String(date || '').slice(0, 7); }
function RPT_yearKey(date) { return String(date || '').slice(0, 4); }

function RPT_net(s) { return Math.max(0, DB_num(s.total) - DB_num(s.refunded)); }
function RPT_profit(s) { return RPT_net(s) - DB_num(s.cogs); }

function RPT_aggregateSales(sales) {
  var revenue = 0, cogs = 0, refunds = 0;
  sales.forEach(function (s) { revenue += RPT_net(s); cogs += DB_num(s.cogs); refunds += DB_num(s.refunded); });
  return { revenue: revenue, cogs: cogs, refunds: refunds, profit: revenue - cogs, count: sales.length };
}

/* ------------------------------- Dashboard -------------------------------- */
function DASH_summary(params) {
  setupDatabase();
  var range = RPT_range(params);
  var allSales = DB_all('Sales');
  var today = DB_now().slice(0, 10);
  var monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  var salesToday = allSales.filter(function (s) { return DB_date(s.date) === today && String(s.status).toLowerCase() !== 'refunded'; });
  var salesMonth = allSales.filter(function (s) { return DB_date(s.date) >= monthStart && String(s.status).toLowerCase() !== 'refunded'; });
  var sales = RPT_sales(range, false);
  var agg = RPT_aggregateSales(sales);
  var expenses = RPT_expenses(range);
  var totalExpenses = Utils_sum(expenses, function (e) { return DB_num(e.amount); });
  var products = DB_all('Products');
  var low = products.filter(function (p) { return DB_int(p.stock) <= DB_int(p.minStock) && DB_int(p.stock) > 0; });
  var out = products.filter(function (p) { return DB_int(p.stock) <= 0; });
  var pending = DB_filter('Orders', function (o) { return o.status === 'Pending'; });
  var stockValue = Utils_sum(products, function (p) { return DB_int(p.stock) * DB_num(p.costPrice); });

  var recent = allSales.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 6)
    .map(function (s) { return { id: s.id, receiptNo: s.receiptNo, date: s.date, customer: s.customerName,
      total: DB_num(s.total), method: s.paymentMethod, status: s.status }; });

  var charts = DASH_charts(range, sales);
  var grossMargin = agg.revenue > 0 ? (agg.profit / agg.revenue * 100).toFixed(1) : '0';

  return {
    data: {
      period: params.period || 'custom', from: range.from, to: range.to,
      salesToday: Utils_sum(salesToday, RPT_net), todayCount: salesToday.length,
      salesMonth: Utils_sum(salesMonth, RPT_net),
      revenue: agg.revenue, cogs: agg.cogs, grossProfit: agg.profit, netProfit: agg.profit - totalExpenses,
      grossMargin: grossMargin, transactionCount: sales.length,
      avgSale: sales.length ? agg.revenue / sales.length : 0,
      totalProducts: products.filter(function (p) { return String(p.status || 'Active') === 'Active'; }).length,
      totalStock: Utils_sum(products, function (p) { return DB_int(p.stock); }),
      stockValue: stockValue,
      lowStock: low.length, outOfStock: out.length,
      pendingOrders: pending.length, totalExpenses: totalExpenses,
      recentSales: recent,
      lowStockItems: low.slice(0, 10).map(function (p) { return { name: p.name, stock: DB_int(p.stock), min: DB_int(p.minStock) }; }),
      charts: charts
    }
  };
}

function DASH_chart(metric, params) {
  var range = RPT_range(params);
  var charts = DASH_charts(range, RPT_sales(range, false));
  return charts[metric] || {};
}

function DASH_charts(range, sales) {
  /* Daily sales: fill every day in range (max 31 days) */
  var byDay = RPT_group(sales, function (s) { return DB_date(s.date); });
  var days = [], cursor = range.from ? new Date(range.from) : new Date(Date.now() - 13 * 86400000);
  var end = range.to ? new Date(range.to) : new Date();
  var guard = 0;
  while (cursor <= end && guard < 32) {
    var key = cursor.toISOString().slice(0, 10);
    days.push(key);
    cursor = new Date(cursor.getTime() + 86400000);
    guard++;
  }
  var dailyLabels = days.map(function (d) { return d.slice(5); });
  var dailyValues = days.map(function (d) {
    return Utils_sum(byDay[d] || [], function (s) { return RPT_net(s); });
  });

  /* Monthly revenue: last 12 months ending at range end */
  var byMonth = RPT_group(sales, function (s) { return RPT_monthKey(DB_date(s.date)); });
  var monthlyLabels = [], monthlyValues = [], months = [];
  var mDate = new Date(range.to ? range.to.slice(0, 7) + '-01' : DB_now().slice(0, 7) + '-01');
  for (var mi = 11; mi >= 0; mi--) {
    var d = new Date(mDate.getFullYear(), mDate.getMonth() - mi, 1);
    months.push(d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2));
  }
  months.forEach(function (m) {
    monthlyLabels.push(new Date(m + '-01').toLocaleDateString('en-UG', { month: 'short' }));
    monthlyValues.push(Utils_sum(byMonth[m] || [], function (s) { return RPT_net(s); }));
  });

  /* Category, product and payment breakdowns */
  var items = RPT_itemsFor(sales);
  var products = DB_all('Products');
  var byProductId = {};
  products.forEach(function (p) { byProductId[String(p.id)] = p; });
  var byCategory = {}, byProduct = {};
  items.forEach(function (i) {
    var p = byProductId[String(i.productId)];
    var cat = p ? (p.category || 'General') : 'General';
    var rev = DB_num(i.lineTotal);
    byCategory[cat] = (byCategory[cat] || 0) + rev;
    var key = i.productName || (p ? p.name : 'Unknown');
    if (!byProduct[key]) byProduct[key] = { revenue: 0, qty: 0 };
    byProduct[key].revenue += rev;
    byProduct[key].qty += DB_int(i.quantity);
  });
  var byMethod = RPT_group(sales, function (s) { return s.paymentMethod || 'Cash'; });

  var top = Object.keys(byProduct).map(function (k) { return { name: k, qty: byProduct[k].qty, revenue: byProduct[k].revenue }; })
    .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 8);

  /* Profit performance by month (same months) */
  var profitRevenue = [], profitCogs = [], profitValues = [];
  months.forEach(function (m) {
    var rows = byMonth[m] || [];
    var a = RPT_aggregateSales(rows);
    profitRevenue.push(a.revenue); profitCogs.push(a.cogs); profitValues.push(a.profit);
  });

  /* Inventory movement by day */
  var moves = DB_filter('Stock_Movements', function (m) { return RPT_inRange(DB_date(m.date), range); });
  var moveInByDay = RPT_group(moves.filter(function (m) { return /IN|ADD|RETURN|PURCHASE/i.test(m.type); }), function (m) { return DB_date(m.date); });
  var moveOutByDay = RPT_group(moves.filter(function (m) { return /OUT|DEDUCT|DAMAGED|SALE/i.test(m.type); }), function (m) { return DB_date(m.date); });

  return {
    dailySales: { labels: dailyLabels, values: dailyValues },
    monthlyRevenue: { labels: monthlyLabels, values: monthlyValues },
    byCategory: { labels: Object.keys(byCategory), values: Object.keys(byCategory).map(function (k) { return byCategory[k]; }) },
    topProducts: { labels: top.map(function (t) { return t.name; }), values: top.map(function (t) { return t.qty; }) },
    paymentMethods: { labels: Object.keys(byMethod), values: Object.keys(byMethod).map(function (k) { return Utils_sum(byMethod[k], RPT_net); }) },
    profit: { labels: monthlyLabels, revenue: profitRevenue, cogs: profitCogs, profit: profitValues },
    inventoryMovement: { labels: dailyLabels,
      in: days.map(function (d) { return Utils_sum(moveInByDay[d] || [], function (m) { return DB_num(m.quantity); }); }),
      out: days.map(function (d) { return Utils_sum(moveOutByDay[d] || [], function (m) { return DB_num(m.quantity); }); }) }
  };
}

/* -------------------------------- Reports --------------------------------- */
function REPORTS_run(type, params) {
  setupDatabase();
  var range = RPT_range(params);
  var sales = RPT_sales(range, false);
  var items = RPT_itemsFor(sales);
  var expenses = RPT_expenses(range);
  var products = DB_all('Products');
  var rows = [];

  function periodRows(keyFn) {
    var groups = RPT_group(sales, keyFn);
    return Object.keys(groups).sort().map(function (key) {
      var a = RPT_aggregateSales(groups[key]);
      return { period: key, count: a.count, revenue: a.revenue, refunds: a.refunds, net: a.revenue,
        cogs: a.cogs, profit: a.profit, margin: a.revenue ? (a.profit / a.revenue * 100) : 0 };
    });
  }

  switch (type) {
    case 'dailySales': rows = periodRows(function (s) { return DB_date(s.date); }); break;
    case 'weeklySales': rows = periodRows(function (s) { return RPT_weekKey(DB_date(s.date)); }); break;
    case 'monthlySales': rows = periodRows(function (s) { return RPT_monthKey(DB_date(s.date)); }); break;
    case 'annualSales': rows = periodRows(function (s) { return RPT_yearKey(DB_date(s.date)); }); break;

    case 'salesByProduct': {
      var byPid = RPT_group(items, function (i) { return i.productId; });
      rows = Object.keys(byPid).map(function (pid) {
        var list = byPid[pid];
        var p = DB_find('Products', pid);
        var revenue = Utils_sum(list, function (i) { return DB_num(i.lineTotal); });
        var cogs = Utils_sum(list, function (i) { return DB_num(i.lineCost); });
        return { name: p ? p.name : (list[0].productName || pid), sku: p ? p.sku : '',
          quantity: Utils_sum(list, function (i) { return DB_int(i.quantity); }),
          revenue: revenue, cogs: cogs, profit: revenue - cogs,
          margin: revenue ? ((revenue - cogs) / revenue * 100) : 0 };
      }).sort(function (a, b) { return b.revenue - a.revenue; });
      break;
    }
    case 'salesByCategory': {
      var byCat = RPT_group(items, function (i) {
        var p = DB_find('Products', i.productId); return p ? (p.category || 'General') : 'General';
      });
      var totalRev = Utils_sum(items, function (i) { return DB_num(i.lineTotal); });
      rows = Object.keys(byCat).map(function (k) {
        var rev = Utils_sum(byCat[k], function (i) { return DB_num(i.lineTotal); });
        return { name: k, quantity: Utils_sum(byCat[k], function (i) { return DB_int(i.quantity); }),
          revenue: rev, share: totalRev ? (rev / totalRev * 100).toFixed(1) : '0' };
      }).sort(function (a, b) { return b.revenue - a.revenue; });
      break;
    }
    case 'salesByPaymentMethod': {
      var byMethod = RPT_group(sales, function (s) { return s.paymentMethod || 'Cash'; });
      var total = Utils_sum(sales, RPT_net);
      rows = Object.keys(byMethod).map(function (k) {
        var rev = Utils_sum(byMethod[k], RPT_net);
        return { name: k, count: byMethod[k].length, revenue: rev, share: total ? (rev / total * 100).toFixed(1) : '0' };
      }).sort(function (a, b) { return b.revenue - a.revenue; });
      break;
    }
    case 'salesBySalesperson': {
      var byUser = RPT_group(sales, function (s) { return s.user || 'Unknown'; });
      rows = Object.keys(byUser).map(function (k) {
        var a = RPT_aggregateSales(byUser[k]);
        return { name: k, count: a.count, revenue: a.revenue, profit: a.profit };
      }).sort(function (a, b) { return b.revenue - a.revenue; });
      break;
    }

    case 'currentStock':
      rows = products.map(function (p) {
        var stock = DB_int(p.stock), min = DB_int(p.minStock);
        return { name: p.name, sku: p.sku, category: p.category, stock: stock, minStock: min,
          status: stock <= 0 ? 'Out of stock' : (stock <= min ? 'Low stock' : 'In stock'),
          value: stock * DB_num(p.costPrice) };
      }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      break;
    case 'stockValuation':
      rows = products.map(function (p) {
        var stock = DB_int(p.stock), cost = DB_num(p.costPrice);
        return { name: p.name, sku: p.sku, stock: stock, costPrice: cost,
          costValue: stock * cost, retailValue: stock * DB_num(p.sellingPrice) };
      }).sort(function (a, b) { return b.costValue - a.costValue; });
      break;
    case 'lowStock':
      rows = products.filter(function (p) { return DB_int(p.stock) <= DB_int(p.minStock) && DB_int(p.stock) > 0; })
        .map(function (p) { return { name: p.name, sku: p.sku, stock: DB_int(p.stock), minStock: DB_int(p.minStock),
          category: p.category, supplier: p.supplier }; });
      break;
    case 'outOfStock':
      rows = products.filter(function (p) { return DB_int(p.stock) <= 0; })
        .map(function (p) { return { name: p.name, sku: p.sku, category: p.category, supplier: p.supplier, status: 'Out of stock' }; });
      break;
    case 'stockMovement':
      rows = INV_movements({ from: range.from, to: range.to, limit: 1000 });
      break;
    case 'damagedStock':
      rows = INV_movements({ from: range.from, to: range.to, limit: 1000 })
        .filter(function (m) { return /DAMAGED/i.test(m.type); });
      break;
    case 'fastMoving':
    case 'slowMoving': {
      var sold = {};
      items.forEach(function (i) { sold[String(i.productId)] = (sold[String(i.productId)] || 0) + DB_int(i.quantity); });
      rows = products.map(function (p) {
        var qty = sold[String(p.id)] || 0;
        return { name: p.name, sku: p.sku, quantity: qty, stock: DB_int(p.stock),
          revenue: Utils_sum(items.filter(function (i) { return String(i.productId) === String(p.id); }), function (i) { return DB_num(i.lineTotal); }),
          value: DB_int(p.stock) * DB_num(p.costPrice) };
      });
      rows.sort(function (a, b) { return type === 'fastMoving' ? b.quantity - a.quantity : a.quantity - b.quantity; });
      rows = rows.slice(0, 25);
      break;
    }

    case 'revenue': rows = periodRows(function (s) { return DB_date(s.date); }); break;
    case 'cogs': {
      var byProductCost = RPT_group(items, function (i) { return i.productName || i.productId; });
      rows = Object.keys(byProductCost).map(function (k) {
        var list = byProductCost[k];
        return { period: range.from + ' → ' + range.to, name: k,
          quantity: Utils_sum(list, function (i) { return DB_int(i.quantity); }),
          costPrice: list.length ? DB_num(list[0].costPrice) : 0,
          cogs: Utils_sum(list, function (i) { return DB_num(i.lineCost); }) };
      }).sort(function (a, b) { return b.cogs - a.cogs; });
      break;
    }
    case 'grossProfit': rows = periodRows(function (s) { return DB_date(s.date); }); break;
    case 'operatingExpenses': {
      var byCatExp = RPT_group(expenses, function (e) { return e.category || 'Other'; });
      var totalExp = Utils_sum(expenses, function (e) { return DB_num(e.amount); });
      rows = Object.keys(byCatExp).map(function (k) {
        var amt = Utils_sum(byCatExp[k], function (e) { return DB_num(e.amount); });
        return { name: k, count: byCatExp[k].length, amount: amt, share: totalExp ? (amt / totalExp * 100).toFixed(1) : '0' };
      }).sort(function (a, b) { return b.amount - a.amount; });
      break;
    }
    case 'netProfit': {
      var expByDay = RPT_group(expenses, function (e) { return DB_date(e.date); });
      var byDaySales = RPT_group(sales, function (s) { return DB_date(s.date); });
      var keys = Object.keys(byDaySales).concat(Object.keys(expByDay)).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
      rows = keys.map(function (k) {
        var a = RPT_aggregateSales(byDaySales[k] || []);
        var ex = Utils_sum(expByDay[k] || [], function (e) { return DB_num(e.amount); });
        return { period: k, revenue: a.revenue, cogs: a.cogs, grossProfit: a.profit,
          expenses: ex, netProfit: a.profit - ex };
      });
      break;
    }
    case 'profitMargins': {
      var byPidMargin = RPT_group(items, function (i) { return i.productId; });
      rows = Object.keys(byPidMargin).map(function (pid) {
        var list = byPidMargin[pid], p = DB_find('Products', pid);
        var rev = Utils_sum(list, function (i) { return DB_num(i.lineTotal); });
        var c = Utils_sum(list, function (i) { return DB_num(i.lineCost); });
        return { name: p ? p.name : (list[0].productName || pid), revenue: rev, cogs: c,
          profit: rev - c, margin: rev ? ((rev - c) / rev * 100).toFixed(1) : '0' };
      }).sort(function (a, b) { return b.profit - a.profit; });
      break;
    }
    case 'outstandingBalances': {
      var cust = CUST_list({ limit: 2000 }).filter(function (c) { return DB_num(c.balance) > 0; })
        .map(function (c) { return { type: 'Customer', name: c.name, balance: DB_num(c.balance), contact: c.phone || c.email }; });
      var supp = SUPP_list({ limit: 2000 }).filter(function (s) { return DB_num(s.balance) > 0; })
        .map(function (s) { return { type: 'Supplier', name: s.name, balance: DB_num(s.balance), contact: s.phone || s.email }; });
      rows = cust.concat(supp);
      break;
    }
    default: fail('Unknown report type: ' + type, 'UNKNOWN_REPORT');
  }

  var totalRevenue = Utils_sum(sales, RPT_net);
  var totalCogs = Utils_sum(sales, function (s) { return DB_num(s.cogs); });
  var totalExpenses = Utils_sum(expenses, function (e) { return DB_num(e.amount); });
  return { data: { rows: rows,
    summary: {
      from: range.from, to: range.to, revenue: totalRevenue, cogs: totalCogs,
      grossProfit: totalRevenue - totalCogs, expenses: totalExpenses,
      netProfit: totalRevenue - totalCogs - totalExpenses,
      transactions: sales.length, expensesCount: expenses.length
    } } };
}
