/* ==========================================================================
   Ocson Inc. Store — Google Apps Script API client
   --------------------------------------------------------------------------
   All business data travels through this single, action-based API. The
   browser never talks to Google Sheets directly and never sees credentials.
   Requests use a simple JSON body (contentType text/plain) so no CORS
   preflight is required when calling a Google Apps Script web app.
   ========================================================================== */
(function () {
  'use strict';

  class ApiError extends Error {
    constructor(message, code, status) {
      super(message);
      this.name = 'ApiError';
      this.code = code || 'API_ERROR';
      this.status = status || 0;
    }
  }

  const API = {
    baseUrl: '',

    init() {
      this.baseUrl = (APP_CONFIG.API_URL || localStorage.getItem(APP_CONFIG.API_URL_KEY) || '').trim().replace(/\/$/, '');
      return this.baseUrl;
    },
    getUrl() { return this.baseUrl || this.init(); },
    setUrl(url) {
      const clean = String(url || '').trim().replace(/\/$/, '');
      if (clean && !/^https:\/\/script\.google\.com\//i.test(clean) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(clean)) {
        throw new Error('Enter a valid Google Apps Script (script.google.com) URL');
      }
      this.baseUrl = clean;
      if (clean) localStorage.setItem(APP_CONFIG.API_URL_KEY, clean);
      else localStorage.removeItem(APP_CONFIG.API_URL_KEY);
      return clean;
    },
    isConfigured() { return !!this.getUrl(); },

    token() { return sessionStorage.getItem(APP_CONFIG.SESSION_KEY) || ''; },
    setToken(token) {
      if (token) sessionStorage.setItem(APP_CONFIG.SESSION_KEY, token);
      else sessionStorage.removeItem(APP_CONFIG.SESSION_KEY);
    },

    async request(action, payload, opts) {
      const o = Object.assign({ silent: false, loading: false, loadingLabel: 'Please wait…', timeout: 45000 }, opts || {});
      const url = this.getUrl();
      if (!url) {
        const err = new ApiError('Backend API is not configured. Go to Settings → Backend API and paste your Google Apps Script web app URL.', 'NOT_CONFIGURED');
        if (!o.silent) Utils.toast(err.message, 'error', 6500);
        throw err;
      }
      const body = {
        action: action,
        token: this.token(),
        payload: payload || {},
        requestId: (payload && payload.requestId) || Utils.FN_id(),
        client: 'web'
      };
      if (o.loading) Utils.showLoading(o.loadingLabel);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), o.timeout);
      try {
        const res = await fetch(url, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body),
          signal: controller.signal,
          redirect: 'follow'
        });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); }
        catch (_) {
          throw new ApiError('The backend returned an invalid response. Check that the Apps Script deployment is set to "Anyone".', 'BAD_RESPONSE', res.status);
        }
        if (!json.ok) {
          if (json.code === 'AUTH_REQUIRED' || json.code === 'SESSION_EXPIRED') {
            this.setToken('');
            window.dispatchEvent(new CustomEvent('ocson:auth-expired'));
          }
          throw new ApiError(json.error || 'Request failed', json.code || 'API_ERROR', res.status);
        }
        if (json.token) this.setToken(json.token);
        return json.data !== undefined ? json.data : json;
      } catch (err) {
        if (err instanceof ApiError) { if (!o.silent) Utils.toast(err.message, 'error', 6000); throw err; }
        const friendly = err.name === 'AbortError'
          ? 'The request timed out. Check your internet connection and try again.'
          : 'Cannot reach the backend. Verify the API URL and your internet connection.';
        const apiErr = new ApiError(friendly, 'NETWORK_ERROR');
        if (!o.silent) Utils.toast(friendly, 'error', 6000);
        throw apiErr;
      } finally {
        clearTimeout(timer);
        if (o.loading) Utils.hideLoading();
      }
    },

    /* ------------------------------ Auth ---------------------------------- */
    login(username, password) { return this.request('auth.login', { username, password }, { silent: true }); },
    logout() { return this.request('auth.logout', {}, { silent: true }); },
    me() { return this.request('auth.me', {}, { silent: true }); },

    /* ---------------------------- Dashboard -------------------------------- */
    dashboard(filters) { return this.request('dashboard.summary', filters || {}); },
    chart(metric, filters) { return this.request('dashboard.chart', Object.assign({ metric }, filters || {})); },

    /* ---------------------------- Products --------------------------------- */
    products(params) { return this.request('products.list', params || {}); },
    product(id) { return this.request('products.get', { id }); },
    saveProduct(data) { return this.request('products.save', data); },
    setProductStatus(id, status) { return this.request('products.status', { id, status }); },
    importProducts(rows) { return this.request('products.import', { rows }); },
    productStockHistory(id) { return this.request('products.stockHistory', { id }); },
    categories() { return this.request('categories.list', {}); },
    saveCategory(data) { return this.request('categories.save', data); },

    /* ---------------------------- Inventory -------------------------------- */
    inventory(params) { return this.request('inventory.list', params || {}); },
    stockMovements(params) { return this.request('inventory.movements', params || {}); },
    stockMove(data) { return this.request('inventory.move', data); },
    stockAdjust(data) { return this.request('inventory.adjust', data); },
    receiveDamaged(data) { return this.request('inventory.damaged', data); },
    processReturn(data) { return this.request('inventory.return', data); },
    stockValuation() { return this.request('inventory.valuation', {}); },

    /* ------------------------------- Sales --------------------------------- */
    sales(params) { return this.request('sales.list', params || {}); },
    sale(id) { return this.request('sales.get', { id }); },
    createSale(data) { return this.request('sales.create', data); },
    refundSale(data) { return this.request('sales.refund', data); },
    saleItems(id) { return this.request('sales.items', { id }); },

    /* ------------------------------- Orders -------------------------------- */
    orders(params) { return this.request('orders.list', params || {}); },
    order(id) { return this.request('orders.get', { id }); },
    saveOrder(data) { return this.request('orders.save', data); },
    orderStatus(id, status) { return this.request('orders.status', { id, status }); },
    convertOrder(id, payment) { return this.request('orders.convert', Object.assign({ id }, payment || {})); },

    /* ----------------------------- Customers ------------------------------- */
    customers(params) { return this.request('customers.list', params || {}); },
    customer(id) { return this.request('customers.get', { id }); },
    saveCustomer(data) { return this.request('customers.save', data); },
    deleteCustomer(id) { return this.request('customers.delete', { id }); },
    customerHistory(id) { return this.request('customers.history', { id }); },

    /* ----------------------------- Suppliers ------------------------------- */
    suppliers(params) { return this.request('suppliers.list', params || {}); },
    supplier(id) { return this.request('suppliers.get', { id }); },
    saveSupplier(data) { return this.request('suppliers.save', data); },
    deleteSupplier(id) { return this.request('suppliers.delete', { id }); },
    supplierReport(id) { return this.request('suppliers.report', { id }); },

    /* ----------------------------- Purchases ------------------------------- */
    purchases(params) { return this.request('purchases.list', params || {}); },
    purchase(id) { return this.request('purchases.get', { id }); },
    savePurchase(data) { return this.request('purchases.save', data); },
    receivePurchase(id) { return this.request('purchases.receive', { id }); },
    purchaseItems(id) { return this.request('purchases.items', { id }); },

    /* ------------------------------ Expenses ------------------------------- */
    expenses(params) { return this.request('expenses.list', params || {}); },
    saveExpense(data) { return this.request('expenses.save', data); },
    deleteExpense(id) { return this.request('expenses.delete', { id }); },
    expenseSummary(params) { return this.request('expenses.summary', params || {}); },

    /* ------------------------------- Reports ------------------------------- */
    report(type, params) { return this.request('reports.' + type, params || {}); },

    /* --------------------------- Settings / Users -------------------------- */
    settings() { return this.request('settings.list', {}); },
    saveSetting(key, value) { return this.request('settings.save', { key, value }); },
    auditLogs(params) { return this.request('settings.audit', params || {}); },
    users() { return this.request('users.list', {}); },
    saveUser(data) { return this.request('users.save', data); },
    setUserStatus(id, status) { return this.request('users.status', { id, status }); }
  };

  // Short, collision-resistant client request id for duplicate-submission protection.
  Utils.FN_id = function () {
    return 'rq_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  };

  window.API = API;
})();
