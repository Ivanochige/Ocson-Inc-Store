/* ==========================================================================
   Ocson Inc. Store — Application shell (sidebar, topbar, theme, routing)
   ========================================================================== */
(function () {
  'use strict';

  const NAV = [
    { page: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', href: 'index.html' },
    { page: 'products', label: 'Products', icon: 'package', href: 'products.html' },
    { page: 'inventory', label: 'Inventory', icon: 'boxes', href: 'inventory.html' },
    { page: 'sales', label: 'Sales / POS', icon: 'shopping-cart', href: 'sales.html' },
    { page: 'orders', label: 'Orders', icon: 'clipboard-list', href: 'orders.html' },
    { page: 'customers', label: 'Customers', icon: 'users', href: 'customers.html' },
    { page: 'suppliers', label: 'Suppliers', icon: 'truck', href: 'suppliers.html' },
    { page: 'purchases', label: 'Purchases', icon: 'file-plus-2', href: 'purchases.html' },
    { page: 'expenses', label: 'Expenses', icon: 'receipt', href: 'expenses.html' },
    { page: 'reports', label: 'Reports', icon: 'chart-no-axes-combined', href: 'reports.html' },
    { page: 'users', label: 'Users', icon: 'user-cog', href: 'users.html', permission: 'users.view' },
    { page: 'settings', label: 'Settings', icon: 'settings', href: 'settings.html', permission: 'settings.view' }
  ];

  const App = {
    currentPage: '',

    async boot() {
      API.init();
      this.currentPage = document.body.dataset.page || 'dashboard';
      this.applyTheme(localStorage.getItem(APP_CONFIG.THEME_KEY) || 'light');
      this.renderShell();
      this.bindShell();
      Utils.repaintIcons();
      await Auth.init();
      this.refreshShellUser();

      // First run: capture the Apps Script URL before any data request, then sign in.
      // Settings is permission-gated, so it cannot be used to bootstrap the connection.
      if (!API.isConfigured() || !Auth.user) {
        Auth.promptLogin(() => location.reload());
        return;
      }

      if (!Auth.can(this.currentPage === 'users' ? 'users.view' : (this.currentPage === 'settings' ? 'settings.view' : this.currentPage + '.view'))) {
        if (this.currentPage !== 'dashboard') {
          Utils.toast('You do not have access to that section', 'warning');
        }
      }
      const page = window.Page;
      if (page && typeof page.init === 'function') {
        try { await page.init(); }
        catch (err) {
          const main = Utils.$('#page-body');
          if (main) main.innerHTML = Utils.errorState(err.message || 'This section failed to load.');
          Utils.toast(err.message || 'Failed to load section', 'error');
        }
      }
    },

    renderShell() {
      const root = Utils.$('#app');
      if (!root) return;
      root.innerHTML =
        '<div class="app-layout">' +
        '<aside class="sidebar" id="sidebar">' +
        '<div class="sidebar-brand"><span class="brand-mark">O</span>' +
        '<div class="brand-text"><strong>Ocson Inc.</strong><span>STORE</span></div>' +
        '<button class="sidebar-close icon-btn" id="sidebar-close" aria-label="Close menu"><i data-lucide="x"></i></button></div>' +
        '<div class="sidebar-scroll"><div class="nav-label">WORKSPACE</div>' +
        '<nav class="sidebar-nav" id="sidebar-nav">' +
        NAV.map((n) => '<a class="nav-item' + (n.page === this.currentPage ? ' active' : '') + '" data-page="' + n.page + '"' +
          (n.permission ? ' data-permission="' + n.permission + '"' : '') + ' href="' + n.href + '">' +
          '<i data-lucide="' + n.icon + '" class="nav-icon"></i><span>' + n.label + '</span>' +
          (n.page === 'sales' ? '<span class="nav-shortcut">POS</span>' : '') + '</a>').join('') +
        '</nav>' +
        '<div class="sidebar-section"><div class="nav-label">SYSTEM</div>' +
        '<button class="nav-item nav-button" id="refresh-data"><i data-lucide="refresh-cw" class="nav-icon"></i><span>Refresh data</span></button>' +
        '<button class="nav-item nav-button" id="sidebar-logout"><i data-lucide="log-out" class="nav-icon"></i><span>Sign out</span></button>' +
        '</div></div>' +
        '<div class="sidebar-footer"><div class="sidebar-status"><span class="status-dot"></span><span id="backend-status">Checking backend…</span></div>' +
        '<small>v' + APP_CONFIG.APP_VERSION + ' · Made for Ocson Inc.</small></div>' +
        '</aside>' +
        '<div class="sidebar-overlay" id="sidebar-overlay"></div>' +
        '<div class="main-column">' +
        '<header class="topbar">' +
        '<button class="icon-btn menu-toggle" id="menu-toggle" aria-label="Toggle menu"><i data-lucide="menu"></i></button>' +
        '<div class="topbar-title"><h1 id="topbar-heading">' + (window.Page?.title || 'Dashboard') + '</h1>' +
        '<p id="topbar-subtitle">' + (window.Page?.subtitle || 'Overview of your business') + '</p></div>' +
        '<div class="topbar-actions">' +
        '<div class="topbar-search"><i data-lucide="search"></i>' +
        '<input type="text" id="global-search" placeholder="Search products, sales…" autocomplete="off">' +
        '<kbd>/</kbd></div>' +
        '<button class="icon-btn" id="theme-toggle" title="Toggle theme"><i data-lucide="moon"></i></button>' +
        '<button class="icon-btn notification-btn" id="notifications-btn" title="Notifications"><i data-lucide="bell"></i><span class="notif-dot" id="notif-dot" hidden></span></button>' +
        '<div class="user-menu-wrap"><button class="user-chip" id="user-chip">' +
        '<span class="avatar" id="user-avatar">U</span><span class="user-meta"><strong id="user-name">User</strong><small id="user-role">Role</small></span>' +
        '<i data-lucide="chevron-down" class="chev"></i></button>' +
        '<div class="user-dropdown" id="user-dropdown">' +
        '<a href="settings.html"><i data-lucide="settings"></i> Settings</a>' +
        '<button id="dropdown-logout"><i data-lucide="log-out"></i> Sign out</button></div></div>' +
        '</div></header>' +
        '<main class="content" id="main-content"><div id="page-body"></div></main>' +
        '</div></div>' +
        '<div id="modal-root"></div><div id="toast-root"></div>';
    },

    refreshShellUser() {
      const name = Utils.$('#user-name'), role = Utils.$('#user-role'), avatar = Utils.$('#user-avatar');
      if (name) name.textContent = Auth.name();
      if (role) role.textContent = Auth.roleLabel();
      if (avatar) avatar.textContent = (Auth.name() || 'U').charAt(0).toUpperCase();
      Utils.$$('[data-permission]').forEach((el) => {
        el.style.display = Auth.can(el.dataset.permission) ? '' : 'none';
      });
      const status = Utils.$('#backend-status');
      if (status) {
        status.textContent = API.isConfigured() ? 'Backend connected' : 'Backend not configured';
        status.parentElement.classList.toggle('offline', !API.isConfigured());
      }
      const dot = Utils.$('#notif-dot');
      if (dot) dot.hidden = true;
    },

    bindShell() {
      const sidebar = Utils.$('#sidebar'), overlay = Utils.$('#sidebar-overlay');
      const toggle = (open) => {
        sidebar.classList.toggle('open', open);
        overlay.classList.toggle('show', open);
        document.body.classList.toggle('sidebar-open', open);
      };
      Utils.$('#menu-toggle')?.addEventListener('click', () => toggle(!sidebar.classList.contains('open')));
      Utils.$('#sidebar-close')?.addEventListener('click', () => toggle(false));
      overlay?.addEventListener('click', () => toggle(false));
      Utils.$$('.nav-item[href]').forEach((a) => a.addEventListener('click', () => toggle(false)));

      Utils.$('#theme-toggle')?.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme(next);
        localStorage.setItem(APP_CONFIG.THEME_KEY, next);
        window.dispatchEvent(new CustomEvent('ocson:theme', { detail: next }));
      });

      const chip = Utils.$('#user-chip'), dropdown = Utils.$('#user-dropdown');
      chip?.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('show'); });
      document.addEventListener('click', () => dropdown?.classList.remove('show'));
      Utils.$('#dropdown-logout')?.addEventListener('click', () => Auth.logout());
      Utils.$('#sidebar-logout')?.addEventListener('click', () => Auth.logout());
      Utils.$('#refresh-data')?.addEventListener('click', () => location.reload());
      Utils.$('#notifications-btn')?.addEventListener('click', () => {
        Utils.modal({ title: 'Notifications', icon: 'bell', body: '<p class="muted">Low-stock alerts and system events will appear here after the backend is connected.</p>', showConfirm: false, cancelText: 'Close' });
      });

      const search = Utils.$('#global-search');
      search?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !search.value.trim()) return;
        const q = encodeURIComponent(search.value.trim());
        location.href = 'products.html?q=' + q;
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
          e.preventDefault(); search?.focus();
        }
        if (e.key === 'Escape') { dropdown?.classList.remove('show'); toggle(false); }
      });
    },

    applyTheme(theme) {
      document.documentElement.dataset.theme = theme || 'light';
      const icon = Utils.$('#theme-toggle i');
      if (icon) icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    }
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => App.boot());
})();
