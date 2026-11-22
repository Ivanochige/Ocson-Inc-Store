/* ==========================================================================
   Ocson Inc. Store — Shared UI / Formatting Utilities
   Pure vanilla JavaScript. No framework, no mock data.
   ========================================================================== */
(function () {
  'use strict';

  const U = {};

  /* ------------------------------ DOM helpers ------------------------------ */
  U.$ = (selector, root) => (root || document).querySelector(selector);
  U.$$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  U.esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  U.attr = (value) => U.esc(value);
  U.debounce = (fn, wait) => {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait || 250);
    };
  };
  U.createElement = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  /* ------------------------------ Formatting ------------------------------- */
  U.money = (value, opts) => {
    const n = Number(value || 0);
    const symbol = (opts && opts.symbol) || APP_CONFIG.CURRENCY_SYMBOL;
    const decimals = opts && opts.decimals != null ? opts.decimals : (Number.isInteger(n) ? 0 : 2);
    return symbol + ' ' + n.toLocaleString('en-UG', {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals
    });
  };
  U.number = (value, decimals) => Number(value || 0).toLocaleString('en-UG', {
    minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0
  });
  U.compact = (value) => {
    const n = Number(value || 0);
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  };
  U.percent = (value, total) => total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
  U.date = (value, opts) => {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    const options = (opts && opts.options) || { year: 'numeric', month: 'short', day: 'numeric' };
    return d.toLocaleDateString('en-UG', options);
  };
  U.datetime = (value) => U.date(value, { options: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } });
  U.timeAgo = (value) => {
    const diff = Date.now() - new Date(value).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
  };
  U.today = () => new Date().toISOString().slice(0, 10);
  U.monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  U.yearStart = () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  U.daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  U.formatPeriod = (period) => {
    const map = { today: 'Today', week: 'Last 7 days', month: 'This month', quarter: 'This quarter', year: 'This year', all: 'All time' };
    return map[period] || period || 'This month';
  };

  /* ------------------------------ Validation ------------------------------- */
  U.formData = (form) => {
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = typeof v === 'string' ? v.trim() : v; });
    return data;
  };
  U.validate = (data, rules) => {
    const errors = {};
    Object.keys(rules).forEach((field) => {
      const rule = rules[field];
      const value = data[field];
      const label = rule.label || field.replace(/_/g, ' ');
      if (rule.required && (value === '' || value == null || (Array.isArray(value) && !value.length))) {
        errors[field] = label + ' is required'; return;
      }
      if (value === '' || value == null) return;
      if (rule.min != null && String(value).length < rule.min) errors[field] = label + ' is too short';
      if (rule.max != null && String(value).length > rule.max) errors[field] = label + ' is too long';
      if (rule.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[field] = 'Enter a valid email address';
      if (rule.phone && !/^[+\d][\d\s()-]{6,}$/.test(value)) errors[field] = 'Enter a valid phone number';
      if (rule.numeric && isNaN(Number(value))) errors[field] = label + ' must be a number';
      if (rule.minValue != null && Number(value) < rule.minValue) errors[field] = label + ' must be at least ' + rule.minValue;
      if (rule.integer && !/^\d+$/.test(String(value))) errors[field] = label + ' must be a whole number';
      if (rule.oneOf && !rule.oneOf.includes(value)) errors[field] = 'Select a valid ' + label.toLowerCase();
      if (rule.pattern && !rule.pattern.test(value)) errors[field] = 'Invalid ' + label.toLowerCase();
      if (rule.match && value !== data[rule.match]) errors[field] = label + ' does not match';
    });
    return { ok: Object.keys(errors).length === 0, errors };
  };
  U.showFormErrors = (form, errors) => {
    U.$$('.field-error', form).forEach((e) => e.remove());
    U.$$('[data-field]', form).forEach((el) => el.classList.remove('is-invalid'));
    Object.keys(errors || {}).forEach((field) => {
      const input = U.$('[name="' + field + '"]', form);
      if (!input) return;
      input.classList.add('is-invalid');
      const msg = U.createElement('<div class="field-error">' + U.esc(errors[field]) + '</div>');
      input.closest('.form-group, .field')?.appendChild(msg);
    });
    const first = U.$('.is-invalid', form);
    if (first) first.focus();
  };

  /* ------------------------------- Feedback -------------------------------- */
  U.toast = (message, type, duration) => {
    const root = U.$('#toast-root') || document.body;
    const icons = { success: 'check-circle-2', error: 'circle-alert', warning: 'triangle-alert', info: 'info' };
    const el = U.createElement(
      '<div class="toast toast-' + (type || 'info') + '" role="status">' +
      '<i data-lucide="' + (icons[type] || 'info') + '" class="toast-icon"></i>' +
      '<span class="toast-message">' + U.esc(message) + '</span>' +
      '<button class="toast-close" type="button" aria-label="Close"><i data-lucide="x"></i></button></div>'
    );
    root.appendChild(el);
    if (window.lucide) window.lucide.createIcons({ nodes: [el] });
    const close = () => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 220); };
    U.$('.toast-close', el).addEventListener('click', close);
    setTimeout(close, duration || 4200);
    return el;
  };
  U.showLoading = (label) => {
    let root = U.$('#loading-root');
    if (!root) { root = U.createElement('<div id="loading-root"></div>'); document.body.appendChild(root); }
    root.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><p>' + U.esc(label || 'Loading…') + '</p></div>';
    root.classList.add('active');
  };
  U.hideLoading = () => {
    const root = U.$('#loading-root');
    if (root) { root.classList.remove('active'); root.innerHTML = ''; }
  };
  U.inlineLoading = (container, rows) => {
    if (container) container.innerHTML = '<div class="skeleton-list">' + Array.from({ length: rows || 5 }, () => '<div class="skeleton skeleton-row"></div>').join('') + '</div>';
  };
  U.emptyState = (title, message, actionHtml) =>
    '<div class="empty-state"><div class="empty-icon"><i data-lucide="inbox"></i></div>' +
    '<h3>' + U.esc(title || 'Nothing here yet') + '</h3>' +
    '<p>' + U.esc(message || 'Records will appear here once available.') + '</p>' +
    (actionHtml || '') + '</div>';
  U.errorState = (message, retryId) =>
    '<div class="empty-state error-state"><div class="empty-icon"><i data-lucide="circle-alert"></i></div>' +
    '<h3>Unable to load data</h3><p>' + U.esc(message) + '</p>' +
    '<button class="btn btn-primary" data-action="' + U.attr(retryId || 'retry') + '"><i data-lucide="refresh-cw"></i> Try again</button></div>';

  /* -------------------------------- Modal ---------------------------------- */
  let modalStack = [];
  U.modal = (options) => {
    const o = Object.assign({
      title: 'Dialog', body: '', size: 'md', confirmText: 'Save', cancelText: 'Cancel',
      showCancel: true, showConfirm: true, closeOnBackdrop: true, onConfirm: null,
      onOpen: null, footer: '', icon: ''
    }, options);
    const root = U.$('#modal-root') || document.body;
    const el = U.createElement(
      '<div class="modal-backdrop" role="dialog" aria-modal="true">' +
      '<div class="modal modal-' + o.size + '">' +
      '<div class="modal-header"><div class="modal-title-wrap">' +
      (o.icon ? '<span class="modal-icon"><i data-lucide="' + U.attr(o.icon) + '"></i></span>' : '') +
      '<h3 class="modal-title">' + U.esc(o.title) + '</h3></div>' +
      '<button type="button" class="icon-btn modal-x" aria-label="Close"><i data-lucide="x"></i></button></div>' +
      '<div class="modal-body">' + o.body + '</div>' +
      (o.showCancel || o.showConfirm || o.footer ?
        '<div class="modal-footer">' + o.footer +
        (o.showCancel ? '<button type="button" class="btn btn-ghost" data-modal-cancel>' + U.esc(o.cancelText) + '</button>' : '') +
        (o.showConfirm ? '<button type="button" class="btn btn-primary" data-modal-confirm>' + U.esc(o.confirmText) + '</button>' : '') +
        '</div>' : '') +
      '</div></div>'
    );
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    if (window.lucide) window.lucide.createIcons({ nodes: [el] });
    const close = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
      modalStack = modalStack.filter((m) => m !== api);
    };
    const confirmBtn = U.$('[data-modal-confirm]', el);
    if (confirmBtn && o.onConfirm) {
      confirmBtn.addEventListener('click', async () => {
        const original = confirmBtn.innerHTML;
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="btn-spinner"></span> Working…';
        try {
          const result = await o.onConfirm(el, close);
          if (result !== false) close();
        } catch (err) {
          U.toast(err.message || 'Something went wrong', 'error');
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = original;
        }
      });
    }
    U.$('[data-modal-cancel]', el)?.addEventListener('click', close);
    U.$('.modal-x', el).addEventListener('click', close);
    if (o.closeOnBackdrop) el.addEventListener('click', (e) => { if (e.target === el) close(); });
    const api = { el, close, body: U.$('.modal-body', el) };
    modalStack.push(api);
    if (o.onOpen) o.onOpen(api);
    setTimeout(() => { const f = U.$('input:not([type=hidden]), select, textarea', el); if (f) f.focus(); }, 120);
    return api;
  };
  U.confirm = (title, message, opts) => new Promise((resolve) => {
    const o = opts || {};
    const m = U.modal({
      title: title || 'Are you sure?', icon: o.danger ? 'triangle-alert' : 'help-circle',
      body: '<p class="confirm-text">' + U.esc(message || '') + '</p>',
      confirmText: o.confirmText || (o.danger ? 'Yes, continue' : 'Confirm'),
      cancelText: o.cancelText || 'Cancel',
      onConfirm: () => { resolve(true); return true; }
    });
    const cancelBtn = U.$('[data-modal-cancel]', m.el);
    const orig = cancelBtn.onclick;
    cancelBtn.addEventListener('click', () => resolve(false));
    U.$('.modal-x', m.el).addEventListener('click', () => resolve(false));
    m.el.addEventListener('click', (e) => { if (e.target === m.el) resolve(false); });
  });
  U.prompt = (title, label, defaultValue) => new Promise((resolve) => {
    const m = U.modal({
      title, body: '<div class="form-group"><label class="form-label">' + U.esc(label) + '</label>' +
        '<input class="form-control" name="prompt-value" value="' + U.attr(defaultValue || '') + '"></div>',
      onConfirm: (el) => { resolve(U.$('[name=prompt-value]', el).value); return true; }
    });
    U.$('[data-modal-cancel]', m.el).addEventListener('click', () => resolve(null));
    U.$('[name=prompt-value]', m.el).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); U.$('[data-modal-confirm]', m.el).click(); }
    });
  });

  /* --------------------------------- Tables -------------------------------- */
  /**
   * columns: [{label, key, width, align, render(row, index), className, sortable}]
   */
  U.table = (columns, rows, opts) => {
    const o = Object.assign({ empty: 'No records found.', emptyAction: '', tableClass: '' }, opts || {});
    if (!rows || !rows.length) return U.emptyState(o.emptyTitle || 'No records found', o.empty, o.emptyAction);
    const head = columns.map((c) =>
      '<th' + (c.width ? ' style="width:' + c.width + '"' : '') +
      (c.align ? ' class="text-' + c.align + '"' : '') +
      (c.sortable ? ' data-sort="' + U.attr(c.key) + '" role="button" tabindex="0"' : '') + '>' +
      U.esc(c.label) + (c.sortable ? '<i data-lucide="chevrons-up-down" class="sort-icon"></i>' : '') + '</th>'
    ).join('');
    const body = rows.map((row, i) =>
      '<tr' + (row.id ? ' data-id="' + U.attr(row.id) + '"' : '') + '>' +
      columns.map((c) => '<td' + (c.align ? ' class="text-' + c.align + '"' : '') + ' class="' + (c.className || '') + '">' +
        (c.render ? c.render(row, i) : U.esc(row[c.key] != null ? row[c.key] : '—')) + '</td>').join('') +
      '</tr>').join('');
    return '<div class="table-responsive"><table class="data-table ' + o.tableClass + '"><thead><tr>' + head +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  };
  U.sortRows = (rows, key, dir) => rows.slice().sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null) return 1; if (bv == null) return -1;
    const an = Number(av), bn = Number(bv);
    const cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : String(av).localeCompare(String(bv));
    return dir === 'desc' ? -cmp : cmp;
  });
  U.sortableTable = (container, columns, getRows, opts) => {
    let state = { key: opts && opts.defaultSort, dir: opts && opts.defaultDir || 'asc' };
    const render = () => {
      const rows = U.sortRows(getRows(), state.key, state.dir);
      container.innerHTML = U.table(columns, rows, opts);
      if (window.lucide) window.lucide.createIcons({ nodes: [container] });
    };
    container.addEventListener('click', (e) => {
      const th = e.target.closest('[data-sort]');
      if (!th) return;
      const key = th.dataset.sort;
      state.dir = state.key === key && state.dir === 'asc' ? 'desc' : 'asc';
      state.key = key;
      render();
    });
    render();
    return { render, get state() { return state; } };
  };
  U.badge = (text, tone) => '<span class="badge badge-' + (tone || 'neutral') + '">' + U.esc(String(text || '').replace(/_/g, ' ')) + '</span>';
  U.statusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    const tone = ['paid', 'completed', 'delivered', 'active', 'received', 'approved', 'available', 'converted', 'success']
      .includes(s) ? 'success' :
      ['pending', 'processing', 'confirmed', 'partial', 'low', 'in transit'].includes(s) ? 'warning' :
      ['cancelled', 'out of stock', 'inactive', 'damaged', 'refunded', 'rejected'].includes(s) ? 'danger' :
      ['ready', 'ready for collection', 'dispatched', 'draft'].includes(s) ? 'info' : 'neutral';
    return U.badge(s || '—', tone);
  };
  U.stockBadge = (qty, min) => {
    const n = Number(qty || 0), m = Number(min || 0);
    if (n <= 0) return U.badge('Out of stock', 'danger');
    if (n <= m) return U.badge('Low stock', 'warning');
    return U.badge('In stock', 'success');
  };

  /* --------------------------- Import / Export ----------------------------- */
  U.downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  U.exportCSV = (filename, rows, headers) => {
    if (!rows || !rows.length) { U.toast('No data to export', 'warning'); return; }
    const keys = headers || Object.keys(rows[0]);
    const names = keys.map((h) => typeof h === 'string' ? h : h.label);
    const vals = keys.map((h) => typeof h === 'string' ? h : h.key);
    const csv = [names, ...rows.map((r) => vals.map((k) => {
      const v = typeof k === 'function' ? k(r) : r[k];
      return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    }))].map((r) => r.join(',')).join('\r\n');
    U.downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }),
      filename + '_' + U.today() + '.csv');
    U.toast('CSV exported successfully', 'success');
  };
  U.exportPDF = (options) => {
    const o = Object.assign({ title: 'Report', subtitle: '', filename: 'report', columns: [], rows: [], orientation: 'landscape' }, options || {});
    if (!window.jspdf) { U.toast('PDF library is still loading', 'warning'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: o.orientation, unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
    const margin = 12;
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, pageW, 24, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(APP_CONFIG.APP_NAME.toUpperCase(), margin, 11);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(o.title, margin, 18);
    doc.setTextColor(30, 41, 59); doc.setFontSize(9);
    doc.text(o.subtitle || ('Generated ' + U.datetime(new Date())), margin, 32);
    const widths = o.columns.map((c) => c.width || Math.max(18, ((pageW - margin * 2) / o.columns.length)));
    const totalW = widths.reduce((a, b) => a + b, 0);
    let y = 40;
    const drawHead = () => {
      doc.setFillColor(241, 245, 249); doc.rect(margin, y, totalW, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(51, 65, 85);
      let x = margin;
      o.columns.forEach((c, i) => { doc.text(String(c.label).slice(0, 30), x + 2, y + 5); x += widths[i]; });
      y += 8;
    };
    drawHead();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    o.rows.forEach((row, idx) => {
      if (y > pageH - 18) { doc.addPage(); y = 16; drawHead(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); }
      if (idx % 2 === 1) { doc.setFillColor(249, 250, 251); doc.rect(margin, y, totalW, 7, 'F'); }
      doc.setTextColor(30, 41, 59);
      let x = margin;
      o.columns.forEach((c, i) => {
        const v = c.pdf ? c.pdf(row) : (row[c.key] != null ? row[c.key] : '—');
        doc.text(String(v).slice(0, 32), x + 2, y + 4.5);
        x += widths[i];
      });
      y += 7;
    });
    doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text('Generated by ' + APP_CONFIG.APP_NAME + ' · ' + U.datetime(new Date()), margin, pageH - 8);
    doc.save(o.filename + '_' + U.today() + '.pdf');
    U.toast('PDF exported successfully', 'success');
  };
  U.printHTML = (html, title) => {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { U.toast('Please allow pop-ups to print', 'warning'); return; }
    w.document.write('<!doctype html><html><head><title>' + U.esc(title || 'Print') + '</title>' +
      '<style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}h1,h2,h3{margin:0 0 8px}' +
      'table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:13px}' +
      'th{background:#f1f5f9}.muted{color:#64748b}.right{text-align:right}.total{font-weight:bold}' +
      '@media print{.no-print{display:none}}</style></head><body>' +
      '<div class="no-print"><button onclick="window.print()">Print / Save PDF</button></div>' + html + '</body></html>');
    w.document.close();
  };
  U.parseCSV = (text) => {
    const rows = []; let row = [], cell = '', quoted = false;
    text = text.replace(/^\ufeff/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false; else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const headers = (rows.shift() || []).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    return rows.filter((r) => r.some((c) => c !== '')).map((r) => {
      const obj = {}; headers.forEach((h, i) => { if (h) obj[h] = (r[i] || '').trim(); }); return obj;
    });
  };
  U.pickFile = (accept) => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept || '.csv,text/csv';
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
  U.readFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });

  /* --------------------------- Query / dates -------------------------------- */
  U.params = () => new URLSearchParams(location.search);
  U.dateRangeFor = (period) => {
    const today = U.today();
    switch (period) {
      case 'today': return { from: today, to: today };
      case 'week': return { from: U.daysAgo(7), to: today };
      case 'month': return { from: U.monthStart(), to: today };
      case 'quarter': {
        const d = new Date(), q = Math.floor(d.getMonth() / 3) * 3;
        return { from: new Date(d.getFullYear(), q, 1).toISOString().slice(0, 10), to: today };
      }
      case 'year': return { from: U.yearStart(), to: today };
      default: return { from: '', to: '' };
    }
  };
  U.groupBy = (arr, keyFn) => arr.reduce((acc, item) => {
    const key = keyFn(item); (acc[key] = acc[key] || []).push(item); return acc;
  }, {});
  U.sum = (arr, fn) => (arr || []).reduce((a, b) => a + Number(fn ? fn(b) : b || 0), 0);
  U.repaintIcons = (root) => { if (window.lucide) window.lucide.createIcons({ nodes: [root || document] }); };

  window.Utils = U;
})();
