/* ==========================================================================
   Ocson Inc. Store — Settings.gs
   Public settings, audit trail and user administration.
   ========================================================================== */

function SETTINGS_list() {
  var out = {};
  DB_all('Settings').forEach(function (row) {
    if (String(row.key || '').indexOf('SESSION_') === 0) return; // never expose sessions
    if (String(row.key || '').indexOf('PWD_') === 0) return;
    out[row.key] = row.value;
  });
  Object.keys(DB_DEFAULT_SETTINGS).forEach(function (k) { if (!out[k]) out[k] = DB_DEFAULT_SETTINGS[k]; });
  return { settings: out };
}

function SETTINGS_save(p, session, req) {
  if (!session || session.role !== 'admin') fail('Only administrators can change system settings.', 'FORBIDDEN');
  var key = DB_clean(p.key);
  if (!key || key.indexOf('SESSION_') === 0) fail('Invalid setting key.', 'VALIDATION');
  DB_setSetting(key, p.value, session.name, req.requestId);
  DB_log('SETTING', 'Settings', key, 'Setting ' + key + ' updated', session, req.requestId);
  return { data: { key: key, value: String(p.value) } };
}

function SETTINGS_audit(p) {
  var rows = DB_all('Audit_Logs').slice().sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); });
  var limit = Math.min(500, Math.max(1, DB_int(p.limit) || 100));
  return rows.slice(0, limit).map(function (l) {
    return { id: l.id, timestamp: l.timestamp, user: l.user, userId: l.userId, action: l.action,
      entity: l.entity, recordId: l.recordId, details: l.details };
  });
}

/* ------------------------------- Users ------------------------------------ */
function USERS_public(u) {
  return { id: u.id, username: u.username, name: u.name, email: u.email, phone: u.phone,
    role: u.role, status: u.status || 'Active', dateAdded: u.dateAdded, lastLogin: u.lastLogin };
}

function USERS_list() {
  return DB_all('Users').map(USERS_public);
}

function USERS_save(p, session, req) {
  if (!session || session.role !== 'admin') fail('Only administrators can manage users.', 'FORBIDDEN');
  DB_assertFresh(req && req.requestId);
  var username = DB_clean(p.username).toLowerCase();
  var name = DB_clean(p.name);
  if (username.length < 3 || name.length < 2) fail('Username and name are required.', 'VALIDATION');
  if (!AUTH_PERMISSIONS[p.role]) fail('Select a valid role.', 'VALIDATION');
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) fail('Enter a valid email address.', 'VALIDATION');

  var existing = p.id ? DB_find('Users', p.id) : null;
  var duplicate = DB_findBy('Users', 'username', username);
  if (duplicate && String(duplicate.id) !== String(existing ? existing.id : '')) fail('Username is already taken.', 'DUPLICATE_USER');

  var data = { username: username, name: name, email: DB_clean(p.email), phone: DB_clean(p.phone),
    role: p.role, status: DB_clean(p.status) || 'Active', requestId: req.requestId || '' };
  var user;
  if (existing) {
    if (p.password) {
      if (String(p.password).length < 8) fail('Password must be at least 8 characters.', 'VALIDATION');
      var salt = Utilities.getUuid();
      data.salt = salt; data.passwordHash = AUTH_hash(p.password, salt);
    }
    user = DB_update('Users', existing.id, data);
    DB_log('UPDATE', 'Users', user.id, 'User updated', session, req.requestId);
  } else {
    if (!p.password || String(p.password).length < 8) fail('Password must be at least 8 characters.', 'VALIDATION');
    var newSalt = Utilities.getUuid();
    data.id = DB_id('USR'); data.dateAdded = DB_now(); data.lastLogin = '';
    data.salt = newSalt; data.passwordHash = AUTH_hash(p.password, newSalt);
    user = DB_insert('Users', data);
    DB_log('CREATE', 'Users', user.id, 'User created with role ' + p.role, session, req.requestId);
  }
  return { data: USERS_public(user) };
}

function USERS_status(p, session, req) {
  if (!session || session.role !== 'admin') fail('Only administrators can change user status.', 'FORBIDDEN');
  DB_assertFresh(req && req.requestId);
  var user = DB_find('Users', p.id);
  if (!user) fail('User not found.', 'NOT_FOUND');
  if (String(user.id) === String(session.id)) fail('You cannot disable your own account.', 'INVALID_STATE');
  var status = String(p.status).toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
  DB_update('Users', user.id, { status: status });
  if (status === 'Inactive') {
    DB_all('Settings').forEach(function (row) {
      if (String(row.key).indexOf('SESSION_') !== 0) return;
      try {
        var s = JSON.parse(row.value);
        if (s && String(s.userId) === String(user.id)) DB_update('Settings', row.key, { value: '' }, 'key');
      } catch (e) { /* ignore malformed session rows */ }
    });
  }
  DB_log('STATUS', 'Users', user.id, 'Status set to ' + status, session, req.requestId);
  return { data: { id: user.id, status: status } };
}
