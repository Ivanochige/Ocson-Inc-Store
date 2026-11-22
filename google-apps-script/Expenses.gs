/* ==========================================================================
   Ocson Inc. Store — Expenses.gs
   ========================================================================== */

var EXP_CATEGORIES = ['Rent','Transport','Salaries','Utilities','Marketing','Packaging','Internet','Maintenance','Other'];

function EXP_public(e) {
  return { id: e.id, date: e.date, category: e.category, description: e.description,
    amount: DB_num(e.amount), paymentMethod: e.paymentMethod, user: e.user, notes: e.notes };
}

function EXP_list(params) {
  var from = DB_date(params.from), to = DB_date(params.to);
  var rows = DB_filter('Expenses', function (e) {
    var day = DB_date(e.date);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
  rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  var limit = Math.min(3000, Math.max(1, DB_int(params.limit) || 300));
  return rows.slice(0, limit).map(EXP_public);
}

function EXP_summary(params) {
  var rows = EXP_list({ from: params.from, to: params.to, limit: 3000 });
  var byCategory = {}, byMethod = {};
  var total = 0;
  rows.forEach(function (e) {
    total += DB_num(e.amount);
    byCategory[e.category] = (byCategory[e.category] || 0) + DB_num(e.amount);
    byMethod[e.paymentMethod || 'Cash'] = (byMethod[e.paymentMethod || 'Cash'] || 0) + DB_num(e.amount);
  });
  return { total: total, count: rows.length, byCategory: byCategory, byMethod: byMethod };
}

function EXP_save(p, session, req) {
  DB_assertFresh(req && req.requestId);
  var category = DB_clean(p.category);
  if (EXP_CATEGORIES.indexOf(category) < 0) fail('Select a valid expense category.', 'VALIDATION');
  var amount = DB_num(p.amount);
  if (amount <= 0) fail('Amount must be greater than zero.', 'VALIDATION');
  var description = DB_clean(p.description);
  if (description.length < 3) fail('Description is required.', 'VALIDATION');
  var expense = {
    id: p.id ? p.id : DB_id('EXP'), date: DB_date(p.date) || DB_now().slice(0, 10),
    category: category, description: description, amount: amount,
    paymentMethod: DB_clean(p.paymentMethod) || 'Cash',
    user: DB_clean(p.user) || (session ? session.name : 'system'),
    userId: session ? session.id : '', notes: DB_clean(p.notes), requestId: req.requestId || ''
  };
  if (p.id) {
    if (!DB_find('Expenses', p.id)) fail('Expense not found.', 'NOT_FOUND');
    DB_update('Expenses', p.id, expense);
  } else DB_insert('Expenses', expense);
  DB_log(p.id ? 'UPDATE' : 'CREATE', 'Expenses', expense.id, category + ' · ' + amount, session, req.requestId);
  return { data: EXP_public(expense) };
}

function EXP_delete(p, session, req) {
  DB_assertFresh(req && req.requestId);
  var e = DB_find('Expenses', p.id || p);
  if (!e) fail('Expense not found.', 'NOT_FOUND');
  DB_remove('Expenses', e.id);
  DB_log('DELETE', 'Expenses', e.id, 'Expense removed', session, req.requestId);
  return { data: { id: e.id, deleted: true } };
}
