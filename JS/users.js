/* ==========================================================================
   Ocson Inc. Store — User & role management (Administrator only)
   ========================================================================== */
(function () {
  'use strict';

  const ROLES = [
    { key: 'admin', label: 'Administrator', desc: 'Full system access including users and settings.' },
    { key: 'manager', label: 'Manager', desc: 'Manage operations, approve transactions and view all reports.' },
    { key: 'sales_attendant', label: 'Sales Attendant', desc: 'Record sales, manage orders and register customers.' },
    { key: 'storekeeper', label: 'Storekeeper', desc: 'Manage inventory, purchases and suppliers.' }
  ];
  const Page = {
    title: 'Users', subtitle: 'Accounts and role-based access control',
    state: { users: [] },

    async init() {
      if (!Auth.can('users.view')) {
        Utils.$('#page-body').innerHTML = Utils.emptyState('Access restricted', 'Only administrators can manage users.');
        return;
      }
      this.render(); this.bind(); await this.load();
    },

    render() {
      Utils.$('#page-body').innerHTML =
        '<div class="page-heading"><div><h2>System users</h2><p>Passwords are salted and hashed by the backend — never stored in plain text or in frontend code.</p></div>' +
        '<button class="btn btn-primary" id="user-add"><i data-lucide="user-plus"></i> Add user</button></div>' +
        '<div id="user-kpis" class="kpi-grid secondary mb-3"></div>' +
        '<div class="grid-2 mb-3">' + ROLES.map((r) =>
          '<div class="card"><div class="card-body row"><span class="stat-icon green"><i data-lucide="shield-check"></i></span>' +
          '<div><strong>' + r.label + '</strong><p class="muted text-sm mb-0">' + r.desc + '</p></div></div></div>').join('') + '</div>' +
        '<div class="card"><div class="card-body"><div id="user-table"><div class="skeleton-list">' +
        Array.from({ length: 5 }, () => '<div class="skeleton skeleton-row"></div>').join('') + '</div></div></div></div>';
      Utils.repaintIcons(Utils.$('#page-body'));
    },

    bind() {
      Utils.$('#user-add').addEventListener('click', () => this.form());
      Utils.$('#user-table').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const u = this.state.users.find((x) => String(x.id) === String(b.closest('[data-id]')?.dataset.id));
        if (b.dataset.act === 'edit') this.form(u);
        if (b.dataset.act === 'status') this.toggle(u);
      });
    },

    async load() {
      try {
        const res = await API.users();
        this.state.users = Array.isArray(res) ? res : (res.items || []);
        this.renderKpis(); this.renderTable();
      } catch (err) {
        Utils.$('#user-table').innerHTML = Utils.errorState(err.message, 'user-retry');
        Utils.$('#user-table [data-action]')?.addEventListener('click', () => this.load());
      }
    },

    renderKpis() {
      const u = this.state.users;
      const cards = [
        ['Total users', u.length, 'users', 'navy'],
        ['Active', u.filter((x) => String(x.status || 'Active') === 'Active').length, 'circle-check', 'green'],
        ['Administrators', u.filter((x) => x.role === 'admin').length, 'shield', 'purple'],
        ['Managers', u.filter((x) => x.role === 'manager').length, 'briefcase', 'blue'],
        ['Sales attendants', u.filter((x) => x.role === 'sales_attendant').length, 'shopping-cart', 'green'],
        ['Storekeepers', u.filter((x) => x.role === 'storekeeper').length, 'boxes', 'amber'],
        ['Inactive', u.filter((x) => String(x.status) === 'Inactive').length, 'circle-x', 'red'],
        ['Last login recorded', u.filter((x) => x.lastLogin).length, 'clock-3', 'blue']
      ];
      Utils.$('#user-kpis').innerHTML = cards.map(([l, v, i, t]) =>
        '<div class="stat-card"><div class="stat-top"><div><div class="stat-label">' + l + '</div><div class="stat-value">' + v + '</div></div>' +
        '<span class="stat-icon ' + t + '"><i data-lucide="' + i + '"></i></span></div></div>').join('');
      Utils.repaintIcons(Utils.$('#user-kpis'));
    },

    renderTable() {
      Utils.$('#user-table').innerHTML = Utils.table([
        { label: 'User', key: 'name', render: (u) => '<div class="cell-product"><span class="cell-avatar">' + Utils.esc(String(u.name).charAt(0).toUpperCase()) + '</span>' +
          '<div><span class="cell-main">' + Utils.esc(u.name) + '</span><span class="cell-sub">' + Utils.esc(u.username || '') + '</span></div></div>' },
        { label: 'Email', key: 'email' }, { label: 'Role', key: 'role', render: (u) => Utils.badge(ROLES.find((r) => r.key === u.role)?.label || u.role, u.role === 'admin' ? 'purple' : 'info') },
        { label: 'Status', key: 'status', render: (u) => Utils.statusBadge(u.status || 'Active') },
        { label: 'Last login', key: 'lastLogin', render: (u) => u.lastLogin ? Utils.datetime(u.lastLogin) : '—' },
        { label: 'Created', key: 'dateAdded', render: (u) => Utils.date(u.dateAdded) },
        { label: 'Actions', align: 'right', render: (u) => '<div class="action-group">' +
          '<button class="btn btn-ghost btn-sm btn-icon" data-act="edit" title="Edit"><i data-lucide="pencil"></i></button>' +
          '<button class="btn btn-ghost btn-sm btn-icon" data-act="status" title="Enable / disable"><i data-lucide="power"></i></button></div>' }
      ], this.state.users, { empty: 'No users found.' });
      Utils.repaintIcons(Utils.$('#user-table'));
    },

    form(u) {
      const isEdit = !!u?.id; u = u || {};
      Utils.modal({
        title: isEdit ? 'Edit user' : 'Add user', icon: 'user-cog', size: 'md', confirmText: isEdit ? 'Save changes' : 'Create user',
        body: '<form id="user-form">' +
          '<div class="form-row"><div class="form-group"><label class="form-label">Full name <span class="req">*</span></label><input class="form-control" name="name" value="' + Utils.attr(u.name) + '" required></div>' +
          '<div class="form-group"><label class="form-label">Username <span class="req">*</span></label><input class="form-control" name="username" value="' + Utils.attr(u.username) + '" required></div></div>' +
          '<div class="form-group"><label class="form-label">Email</label><input class="form-control" name="email" type="email" value="' + Utils.attr(u.email) + '"></div>' +
          '<div class="form-row"><div class="form-group"><label class="form-label">Role <span class="req">*</span></label><select class="form-select" name="role">' +
          ROLES.map((r) => '<option value="' + r.key + '"' + (r.key === u.role ? ' selected' : '') + '>' + r.label + '</option>').join('') + '</select></div>' +
          '<div class="form-group"><label class="form-label">Status</label><select class="form-select" name="status"><option' + (String(u.status || 'Active') === 'Active' ? ' selected' : '') + '>Active</option><option' + (u.status === 'Inactive' ? ' selected' : '') + '>Inactive</option></select></div></div>' +
          '<div class="form-group"><label class="form-label">' + (isEdit ? 'New password (leave blank to keep)' : 'Password <span class="req">*</span>') + '</label>' +
          '<input class="form-control" name="password" type="password" autocomplete="new-password" ' + (isEdit ? '' : 'required') + '>' +
          '<small class="form-hint">Minimum 8 characters. The backend stores only a salted SHA-256 hash.</small></div>' +
          (isEdit ? '<input type="hidden" name="id" value="' + Utils.attr(u.id) + '">' : '') + '</form>',
        onConfirm: async (el) => {
          const form = Utils.$('#user-form', el), data = Utils.formData(form);
          const rules = { name: { required: true, min: 2 }, username: { required: true, min: 3 }, email: { email: true }, role: { required: true, oneOf: ROLES.map((r) => r.key) } };
          if (!isEdit) rules.password = { required: true, min: 8 };
          if (data.password && data.password.length < 8) rules.password = { min: 8 };
          const v = Utils.validate(data, rules);
          if (!v.ok) { Utils.showFormErrors(form, v.errors); return false; }
          await API.saveUser(data);
          Utils.toast(isEdit ? 'User updated' : 'User created', 'success'); this.load(); return true;
        }
      });
    },

    async toggle(u) {
      if (!u) return;
      const next = String(u.status || 'Active') === 'Active' ? 'Inactive' : 'Active';
      const ok = await Utils.confirm('Change user status', 'Set ' + u.name + ' to ' + next + '?', { confirmText: 'Change' });
      if (!ok) return;
      try { await API.setUserStatus(u.id, next); Utils.toast('User is now ' + next, 'success'); this.load(); }
      catch (e) { Utils.toast(e.message, 'error'); }
    }
  };

  window.Page = Page;
})();
