/* ==========================================================================
   Ocson Inc. Store — Session & Role-Based Access Control (frontend gate only)
   Authorization is ALWAYS re-verified by the Apps Script backend.
   ========================================================================== */
(function () {
  'use strict';

  const PERMISSIONS = {
    admin: ['*'],
    manager: [
      'dashboard.view', 'products.view', 'products.edit', 'products.import',
      'inventory.view', 'inventory.edit', 'sales.view', 'sales.create', 'sales.refund',
      'orders.view', 'orders.edit', 'orders.convert', 'customers.view', 'customers.edit',
      'suppliers.view', 'suppliers.edit', 'purchases.view', 'purchases.edit',
      'expenses.view', 'expenses.edit', 'reports.view', 'settings.view'
    ],
    sales_attendant: [
      'dashboard.view', 'products.view', 'sales.view', 'sales.create',
      'orders.view', 'orders.edit', 'customers.view', 'customers.edit', 'reports.view'
    ],
    storekeeper: [
      'dashboard.view', 'products.view', 'products.edit', 'inventory.view', 'inventory.edit',
      'purchases.view', 'purchases.edit', 'suppliers.view', 'suppliers.edit', 'reports.view'
    ]
  };
  const ROLE_LABELS = {
    admin: 'Administrator', manager: 'Manager', sales_attendant: 'Sales Attendant', storekeeper: 'Storekeeper'
  };

  const Auth = {
    user: null,
    ready: false,

    role() { return (this.user && (this.user.role || this.user.Role)) || ''; },
    roleLabel() { return ROLE_LABELS[this.role()] || this.role() || 'User'; },
    name() { return (this.user && (this.user.name || this.user.Name)) || 'User'; },
    can(permission) {
      if (!this.user) return false;
      const perms = PERMISSIONS[this.role()] || [];
      return perms.includes('*') || perms.includes(permission);
    },
    navFor(page) {
      const map = {
        dashboard: 'dashboard.view', products: 'products.view', inventory: 'inventory.view',
        sales: 'sales.view', orders: 'orders.view', customers: 'customers.view',
        suppliers: 'suppliers.view', purchases: 'purchases.view', expenses: 'expenses.view',
        reports: 'reports.view', users: 'users.view', settings: 'settings.view'
      };
      return this.can(map[page] || 'dashboard.view');
    },

    async init() {
      if (!API.isConfigured()) { this.ready = true; return null; }
      if (!API.token()) { this.ready = true; return null; }
      try {
        const me = await API.me();
        this.user = me.user || me;
      } catch (e) {
        API.setToken('');
        this.user = null;
      }
      this.ready = true;
      return this.user;
    },

    async login(username, password) {
      const res = await API.login(username, password);
      this.user = res.user || res;
      return this.user;
    },

    async logout() {
      try { await API.logout(); } catch (_) { /* network offline: clear locally anyway */ }
      API.setToken('');
      this.user = null;
      location.href = 'index.html';
    },

    promptLogin(onSuccess) {
      if (this.user) { if (onSuccess) onSuccess(); return; }
      if (!API.isConfigured()) {
        const m = Utils.modal({
          title: 'Connect your backend', icon: 'link-2', size: 'md',
          body: '<p class="confirm-text">Before signing in, connect this app to your deployed Google Apps Script web app.</p>' +
            '<div class="form-group"><label class="form-label">Google Apps Script URL</label>' +
            '<input class="form-control" id="setup-api-url" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off">' +
            '<small class="form-hint">Use the <strong>web app</strong> URL ending in <code>/exec</code>, not a <code>/dev</code> test URL. Deploy with <strong>Execute as: Me</strong> and <strong>Who has access: Anyone</strong>.</small></div>' +
            '<div id="setup-api-result" class="mt-2"></div>',
          confirmText: 'Save & continue', showCancel: false,
          footer: '<button type="button" class="btn btn-ghost" id="setup-api-test"><i data-lucide="activity"></i> Test connection</button>',
          onOpen: (modal) => {
            Utils.$('#setup-api-test', modal.el).addEventListener('click', async (e) => {
              const button = e.currentTarget;
              const result = Utils.$('#setup-api-result', modal.el);
              const url = Utils.$('#setup-api-url', modal.el).value;
              const previous = API.getUrl();
              let applied = false;
              button.disabled = true;
              button.innerHTML = '<span class="btn-spinner"></span> Testing…';
              result.innerHTML = '';
              try {
                API.setUrl(url);
                applied = true;
                const r = await API.request('system.health', {}, { silent: true });
                result.innerHTML = '<div class="alert alert-info"><i data-lucide="circle-check"></i><div><strong>Connected.</strong> ' +
                  Utils.esc(r.service || 'Ocson backend') + ' v' + Utils.esc(r.version || '1.0') + ' · ' + (r.sheetCount || 18) + ' sheets ready. Click <strong>Save &amp; continue</strong>.</div></div>';
                Utils.repaintIcons(result);
              } catch (err) {
                if (applied) API.setUrl(previous);
                result.innerHTML = '<div class="alert alert-danger"><i data-lucide="circle-alert"></i><div>' + Utils.esc(err.message) + '</div></div>';
                Utils.repaintIcons(result);
              } finally {
                button.disabled = false;
                button.innerHTML = '<i data-lucide="activity"></i> Test connection';
                Utils.repaintIcons(modal.el);
              }
            });
          },
          onConfirm: (el) => {
            const url = Utils.$('#setup-api-url', el).value;
            try { API.setUrl(url); Utils.toast('Backend connected', 'success'); location.reload(); }
            catch (e) { Utils.toast(e.message, 'error'); return false; }
          }
        });
        return m;
      }
      const m = Utils.modal({
        title: 'Sign in to Ocson Inc. Store', icon: 'lock-keyhole', size: 'sm',
        closeOnBackdrop: false,
        body: '<form id="login-form" autocomplete="on">' +
          '<div class="login-brand"><span class="login-logo">O</span><div><strong>Ocson Inc. Store</strong><small>Retail Management Suite</small></div></div>' +
          '<div class="form-group"><label class="form-label" for="login-username">Username or email</label>' +
          '<input class="form-control" id="login-username" name="username" required autocomplete="username" placeholder="e.g. admin"></div>' +
          '<div class="form-group"><label class="form-label" for="login-password">Password</label>' +
          '<input class="form-control" id="login-password" name="password" type="password" required autocomplete="current-password" placeholder="••••••••"></div>' +
          '<div id="login-error" class="login-error" hidden></div>' +
          '<button type="submit" class="btn btn-primary btn-block"><i data-lucide="log-in"></i> Sign in securely</button>' +
          '<p class="login-help">Credentials are verified by the Google Apps Script backend. Passwords are salted and hashed server-side.</p>' +
          '</form>',
        showConfirm: false, showCancel: false
      });
      Utils.repaintIcons(m.el);
      Utils.$('#login-form', m.el).addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = Utils.$('button[type=submit]', e.target);
        const err = Utils.$('#login-error', e.target);
        btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Signing in…';
        err.hidden = true;
        try {
          await this.login(Utils.$('#login-username').value, Utils.$('#login-password').value);
          m.close();
          Utils.toast('Welcome back, ' + this.name(), 'success');
          if (onSuccess) onSuccess();
        } catch (ex) {
          err.textContent = ex.message || 'Invalid username or password';
          err.hidden = false;
        } finally {
          btn.disabled = false; btn.innerHTML = '<i data-lucide="log-in"></i> Sign in securely';
          Utils.repaintIcons(e.target);
        }
      });
      return m;
    }
  };

  window.addEventListener('ocson:auth-expired', () => {
    Utils.toast('Your session has expired. Please sign in again.', 'warning', 6000);
    setTimeout(() => Auth.promptLogin(() => location.reload()), 700);
  });

  window.Auth = Auth;
})();
