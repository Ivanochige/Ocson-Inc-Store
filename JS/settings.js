/* ==========================================================================
   Ocson Inc. Store — Settings, backend connection, categories, audit log
   ========================================================================== */
(function () {
  'use strict';

  const Page = {
    title: 'Settings', subtitle: 'Backend connection, company details and system preferences',
    state: { settings: {}, categories: [], logs: [], tab: 'general' },

    async init() {
      if (!Auth.can('settings.view')) {
        Utils.$('#page-body').innerHTML = Utils.emptyState('Access restricted', 'You do not have permission to view settings.');
        return;
      }
      this.render(); this.bind(); await this.load();
    },

    render() {
      const url = API.getUrl();
      Utils.$('#page-body').innerHTML =
        '<div class="page-heading"><div><h2>System settings</h2><p>Backend connection, company profile, categories and audit trail.</p></div></div>' +
        '<div class="tabs">' +
        [['general', 'General', 'settings'], ['backend', 'Backend API', 'link-2'], ['categories', 'Categories', 'layers'], ['audit', 'Audit log', 'scroll-text']]
          .map(([k, l, i]) => '<button class="tab' + (k === this.state.tab ? ' active' : '') + '" data-tab="' + k + '"><i data-lucide="' + i + '"></i> ' + l + '</button>').join('') + '</div>' +
        '<div id="set-content"></div>';
      Utils.repaintIcons(Utils.$('#page-body'));
      this.renderTab(url);
    },

    bind() {
      Utils.$$('.tab').forEach((t) => t.addEventListener('click', () => {
        Utils.$$('.tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active'); this.state.tab = t.dataset.tab; this.renderTab(API.getUrl()); this.loadTab();
      }));
      window.addEventListener('ocson:theme', () => {
        const sel = Utils.$('#set-theme'); if (sel) sel.value = document.documentElement.dataset.theme;
      });
    },

    renderTab(url) {
      const box = Utils.$('#set-content');
      if (this.state.tab === 'general') {
        box.innerHTML = '<div class="grid-2"><div class="card"><div class="card-header"><h3><i data-lucide="building-2"></i> Company profile</h3></div>' +
          '<div class="card-body"><form id="settings-form">' +
          '<div class="form-group"><label class="form-label">Company name</label><input class="form-control" name="companyName" value="' + Utils.attr(this.state.settings.companyName || APP_CONFIG.APP_NAME) + '"></div>' +
          '<div class="form-group"><label class="form-label">Currency</label><input class="form-control" name="currency" value="' + Utils.attr(this.state.settings.currency || 'UGX') + '"></div>' +
          '<div class="form-group"><label class="form-label">Currency symbol</label><input class="form-control" name="currencySymbol" value="' + Utils.attr(this.state.settings.currencySymbol || 'UGX') + '"></div>' +
          '<div class="form-group"><label class="form-label">Address</label><input class="form-control" name="address" value="' + Utils.attr(this.state.settings.address || '') + '"></div>' +
          '<div class="form-row"><div class="form-group"><label class="form-label">Phone</label><input class="form-control" name="phone" value="' + Utils.attr(this.state.settings.phone || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Email</label><input class="form-control" name="email" type="email" value="' + Utils.attr(this.state.settings.email || '') + '"></div></div>' +
          '<button type="submit" class="btn btn-primary"><i data-lucide="save"></i> Save settings</button></form></div></div>' +
          '<div class="card"><div class="card-header"><h3><i data-lucide="palette"></i> Appearance & preferences</h3></div><div class="card-body">' +
          '<div class="form-group"><label class="form-label">Theme</label><select class="form-select" id="set-theme"><option value="light"' + (document.documentElement.dataset.theme === 'light' ? ' selected' : '') + '>Light</option>' +
          '<option value="dark"' + (document.documentElement.dataset.theme === 'dark' ? ' selected' : '') + '>Dark</option></select></div>' +
          '<div class="form-group"><label class="form-label">Default report period</label><select class="form-select" id="set-period">' +
          ['today', 'week', 'month', 'quarter', 'year'].map((p) => '<option' + (p === APP_CONFIG.DEFAULT_DATE_RANGE ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></div>' +
          '<div class="alert alert-info"><i data-lucide="info"></i><div>Local preferences are kept in your browser only. All business data stays in Google Sheets via the backend API.</div></div>' +
          '<button class="btn btn-ghost" id="set-theme-save"><i data-lucide="check"></i> Apply preferences</button>' +
          '</div></div></div>';
        Utils.$('#settings-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const data = Utils.formData(e.target);
          try {
            for (const key of Object.keys(data)) await API.saveSetting(key, data[key]);
            Utils.toast('Settings saved to the backend', 'success');
          } catch (err) { Utils.toast(err.message, 'error'); }
        });
        Utils.$('#set-theme-save').addEventListener('click', () => {
          App.applyTheme(Utils.$('#set-theme').value);
          localStorage.setItem(APP_CONFIG.THEME_KEY, document.documentElement.dataset.theme);
          APP_CONFIG.DEFAULT_DATE_RANGE = Utils.$('#set-period').value;
          Utils.toast('Preferences applied', 'success');
        });
      } else if (this.state.tab === 'backend') {
        box.innerHTML = '<div class="card" style="max-width:760px"><div class="card-header"><h3><i data-lucide="link-2"></i> Google Apps Script connection</h3></div>' +
          '<div class="card-body">' +
          '<div class="alert ' + (url ? 'alert-info' : 'alert-warning') + '"><i data-lucide="' + (url ? 'plug-zap' : 'unplug') + '"></i><div>' +
          (url ? '<strong>Configured:</strong> <span class="font-mono text-xs">' + Utils.esc(url) + '</span>' : 'No backend URL configured. Deploy the Apps Script project and paste its web app URL below.') +
          '</div></div>' +
          '<form id="api-form"><div class="form-group"><label class="form-label">Web app URL</label>' +
          '<input class="form-control" name="url" value="' + Utils.attr(url) + '" placeholder="https://script.google.com/macros/s/.../exec" required>' +
          '<small class="form-hint">Deploy in Apps Script with <strong>Execute as: Me</strong> and <strong>Who has access: Anyone</strong>. The URL is not a secret.</small></div>' +
          '<div class="row"><button type="submit" class="btn btn-primary"><i data-lucide="save"></i> Save URL</button>' +
          '<button type="button" class="btn btn-ghost" id="api-test"><i data-lucide="activity"></i> Test connection</button></div></form>' +
          '<div id="api-test-result" class="mt-3"></div>' +
          '<h4 class="section-title mt-3"><i data-lucide="book-open"></i> Quick setup</h4>' +
          '<ol class="text-2" style="padding-left:20px;line-height:2">' +
          '<li>Copy the <code>google-apps-script/</code> folder into a new Apps Script project.</li>' +
          '<li>Run <code>setupDatabase()</code> once from Code.gs and authorise the script.</li>' +
          '<li>Run <code>createDefaultAdmin()</code>, then edit the generated password in the Users sheet hash using <code>hashPassword()</code>.</li>' +
          '<li>Deploy → New deployment → Web app (Anyone access) and copy the URL above.</li>' +
          '</ol></div></div>';
        Utils.$('#api-form').addEventListener('submit', (e) => {
          e.preventDefault();
          try { API.setUrl(Utils.formData(e.target).url); Utils.toast('Backend URL saved', 'success'); this.renderTab(API.getUrl()); }
          catch (err) { Utils.toast(err.message, 'error'); }
        });
        Utils.$('#api-test').addEventListener('click', async () => {
          const box = Utils.$('#api-test-result');
          box.innerHTML = '<div class="alert alert-info"><span class="btn-spinner"></span> Testing connection…</div>';
          try {
            const r = await API.request('system.health', {}, { silent: true });
            box.innerHTML = '<div class="alert alert-info"><i data-lucide="circle-check"></i><div><strong>Connected.</strong> ' +
              Utils.esc(r.service || 'Ocson backend') + ' v' + Utils.esc(r.version || '1.0') + ' · ' + (r.sheetCount || 18) + ' sheets ready.</div></div>';
          } catch (err) { box.innerHTML = '<div class="alert alert-danger"><i data-lucide="circle-alert"></i><div>' + Utils.esc(err.message) + '</div></div>'; }
        });
      } else if (this.state.tab === 'categories') {
        box.innerHTML = '<div class="card"><div class="card-header"><h3><i data-lucide="layers"></i> Product categories</h3>' +
          '<button class="btn btn-primary btn-sm" id="cat-add"><i data-lucide="plus"></i> Add category</button></div>' +
          '<div class="card-body"><div id="cat-list"><div class="skeleton skeleton-row"></div></div></div></div>';
        Utils.$('#cat-add').addEventListener('click', () => this.categoryForm());
      } else {
        box.innerHTML = '<div class="card"><div class="card-header"><h3><i data-lucide="scroll-text"></i> Audit log</h3>' +
          '<span class="badge badge-neutral" id="audit-count"></span></div><div class="card-body">' +
          '<div id="audit-list"><div class="skeleton-list">' + Array.from({ length: 5 }, () => '<div class="skeleton skeleton-row"></div>').join('') + '</div></div></div></div>';
      }
      Utils.repaintIcons(box);
    },

    async load() { await this.loadTab(); },

    async loadTab() {
      if (this.state.tab === 'general' || this.state.tab === 'backend') {
        try { const s = await API.settings(); this.state.settings = s.settings || s || {}; }
        catch (_) {}
      }
      if (this.state.tab === 'categories') {
        try {
          const r = await API.categories();
          this.state.categories = Array.isArray(r) ? r : (r.items || []);
          const box = Utils.$('#cat-list');
          box.innerHTML = Utils.table([
            { label: 'Category', key: 'name', render: (c) => '<strong>' + Utils.esc(c.name || c) + '</strong>' },
            { label: 'Description', key: 'description' },
            { label: 'Status', key: 'status', render: (c) => Utils.badge(c.status || 'Active') }
          ], this.state.categories, { empty: 'No categories yet.' });
          Utils.repaintIcons(box);
        } catch (err) { Utils.$('#cat-list').innerHTML = Utils.errorState(err.message, 'cat-retry'); }
      }
      if (this.state.tab === 'audit') {
        try {
          const r = await API.auditLogs({ limit: 100 });
          this.state.logs = Array.isArray(r) ? r : (r.items || []);
          Utils.$('#audit-count').textContent = this.state.logs.length + ' events';
          const box = Utils.$('#audit-list');
          box.innerHTML = Utils.table([
            { label: 'Timestamp', key: 'timestamp', render: (l) => Utils.datetime(l.timestamp || l.date) },
            { label: 'User', key: 'user' }, { label: 'Action', key: 'action', render: (l) => Utils.badge(l.action) },
            { label: 'Entity', key: 'entity' }, { label: 'Record ID', key: 'recordId' }, { label: 'Details', key: 'details' }
          ], this.state.logs, { empty: 'No audit events recorded yet.' });
          Utils.repaintIcons(box);
        } catch (err) { Utils.$('#audit-list').innerHTML = Utils.errorState(err.message, 'audit-retry'); }
      }
    },

    categoryForm() {
      Utils.modal({
        title: 'Add category', icon: 'layers', size: 'sm', confirmText: 'Add',
        body: '<form id="category-form"><div class="form-group"><label class="form-label">Category name <span class="req">*</span></label>' +
          '<input class="form-control" name="name" required></div>' +
          '<div class="form-group"><label class="form-label">Description</label><input class="form-control" name="description"></div></form>',
        onConfirm: async (el) => {
          const form = Utils.$('#category-form', el), data = Utils.formData(form);
          const v = Utils.validate(data, { name: { required: true, min: 2 } });
          if (!v.ok) { Utils.showFormErrors(form, v.errors); return false; }
          await API.saveCategory(data);
          Utils.toast('Category added', 'success'); this.loadTab(); return true;
        }
      });
    }
  };

  window.Page = Page;
})();
