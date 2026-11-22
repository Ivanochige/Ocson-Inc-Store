/* ==========================================================================
   Ocson Inc. Store — Authentication.gs
   Salted SHA-256 password hashes, expiring sessions and server-side RBAC.
   ========================================================================== */

var AUTH_SESSION_HOURS = 12;
var AUTH_PERMISSIONS = {
  admin: ['*'],
  manager: [
    'dashboard.view','products.view','products.edit','products.import',
    'inventory.view','inventory.edit','sales.view','sales.create','sales.refund',
    'orders.view','orders.edit','orders.convert','customers.view','customers.edit',
    'suppliers.view','suppliers.edit','purchases.view','purchases.edit',
    'expenses.view','expenses.edit','reports.view','settings.view'
  ],
  sales_attendant: [
    'dashboard.view','products.view','sales.view','sales.create',
    'orders.view','orders.edit','customers.view','customers.edit','reports.view'
  ],
  storekeeper: [
    'dashboard.view','products.view','products.edit','inventory.view','inventory.edit',
    'purchases.view','purchases.edit','suppliers.view','suppliers.edit','reports.view'
  ]
};

function AUTH_hex(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function AUTH_hash(password, salt) {
  return AUTH_hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + String(password)));
}

function AUTH_publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, name: u.name, email: u.email, phone: u.phone,
    role: u.role, status: u.status, dateAdded: u.dateAdded, lastLogin: u.lastLogin
  };
}

function AUTH_login(payload) {
  var username = DB_clean(payload.username).toLowerCase();
  var password = String(payload.password || '');
  if (!username || !password) fail('Username and password are required.', 'VALIDATION');
  var rows = DB_all('Users');
  var user = null;
  for (var i = 0; i < rows.length; i++) {
    var uName = String(rows[i].username || '').toLowerCase();
    var uMail = String(rows[i].email || '').toLowerCase();
    if (uName === username || uMail === username) { user = rows[i]; break; }
  }
  if (!user) fail('Invalid username or password.', 'AUTH_FAILED');
  if (String(user.status).toLowerCase() !== 'active') fail('This account is inactive. Contact your administrator.', 'ACCOUNT_INACTIVE');
  if (AUTH_hash(password, user.salt) !== user.passwordHash) fail('Invalid username or password.', 'AUTH_FAILED');

  var token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  var expires = Date.now() + AUTH_SESSION_HOURS * 3600000;
  DB_setSetting('SESSION_' + token, JSON.stringify({ userId: user.id, expiresAt: expires, createdAt: Date.now() }), user.name);
  DB_update('Users', user.id, { lastLogin: DB_now() });
  DB_log('LOGIN', 'Users', user.id, 'Successful sign-in', { id: user.id, name: user.name });
  return { token: token, user: AUTH_publicUser(user) };
}

function AUTH_resolve(token) {
  if (!token) return null;
  var raw = DB_getSetting('SESSION_' + token);
  if (!raw) return null;
  var data;
  try { data = JSON.parse(raw); } catch (e) { return null; }
  if (!data || !data.expiresAt || Date.now() > Number(data.expiresAt)) {
    DB_update('Settings', 'SESSION_' + token, { value: '' }, 'key');
    return null;
  }
  var user = DB_find('Users', data.userId);
  if (!user || String(user.status).toLowerCase() !== 'active') return null;
  return AUTH_publicUser(user);
}

function AUTH_logout(session, payload) {
  // The token itself is not in payload; clear via request token handled in Code.gs.
  if (session) DB_log('LOGOUT', 'Users', session.id, 'Signed out', session);
  return { success: true };
}

function AUTH_can(session, permission) {
  if (!session) return false;
  var perms = AUTH_PERMISSIONS[session.role] || [];
  return perms.indexOf('*') >= 0 || perms.indexOf(permission) >= 0;
}

function AUTH_require(session, permissions) {
  if (!session) fail('Your session has expired. Please sign in again.', 'AUTH_REQUIRED');
  var list = typeof permissions === 'string' ? [permissions] : (permissions || []);
  for (var i = 0; i < list.length; i++) {
    if (AUTH_can(session, list[i])) return true;
  }
  fail('You do not have permission to perform this action.', 'FORBIDDEN');
}

/** Optional helper: creates the first administrator. Run once from the editor. */
function createDefaultAdmin() {
  setupDatabase();
  if (DB_findBy('Users', 'username', 'admin')) return 'Administrator already exists.';
  var salt = Utilities.getUuid();
  var password = 'Admin@Ocson2026';
  DB_insert('Users', {
    id: DB_id('USR'), username: 'admin', name: 'System Administrator',
    email: 'admin@ocsoninc.com', phone: '', role: 'admin',
    passwordHash: AUTH_hash(password, salt), salt: salt, status: 'Active',
    dateAdded: DB_now(), lastLogin: ''
  });
  return 'Administrator created. Username: admin · Password (change after login): ' + password;
}

/** Generates a hash/salt pair for manual password resets in the Users sheet. */
function hashPassword(password) {
  var salt = Utilities.getUuid();
  return JSON.stringify({ salt: salt, passwordHash: AUTH_hash(password, salt) });
}

/** Changes the signed-in user's own password. */
function AUTH_changePassword(session, payload) {
  AUTH_require(session, 'dashboard.view');
  var current = DB_find('Users', session.id);
  if (!current) fail('User not found.', 'NOT_FOUND');
  if (AUTH_hash(String(payload.currentPassword || ''), current.salt) !== current.passwordHash) fail('Current password is incorrect.', 'AUTH_FAILED');
  var next = String(payload.newPassword || '');
  if (next.length < 8) fail('New password must be at least 8 characters.', 'VALIDATION');
  var salt = Utilities.getUuid();
  DB_update('Users', current.id, { salt: salt, passwordHash: AUTH_hash(next, salt) });
  DB_log('PASSWORD_CHANGE', 'Users', current.id, 'Password changed', session);
  return { success: true };
}
