/* ==========================================================================
   Ocson Inc. Store — Frontend Configuration
   --------------------------------------------------------------------------
   The API URL is NOT a database credential. It is the public HTTPS address of
   your own Google Apps Script web app. You may paste it in Settings → Backend
   API or set it here after deployment. It is stored locally in the browser
   (localStorage) ONLY for connection settings — never for business data.
   ========================================================================== */
(function () {
  'use strict';

  window.APP_CONFIG = {
    APP_NAME: 'Ocson Inc. Store',
    APP_VERSION: '1.0.0',
    API_URL: '', // e.g. https://script.google.com/macros/s/AKfycb.../exec
    CURRENCY: 'UGX',
    CURRENCY_SYMBOL: 'UGX',
    SESSION_KEY: 'ocson_session',
    API_URL_KEY: 'ocson_api_url',
    THEME_KEY: 'ocson_theme',
    SIDEBAR_KEY: 'ocson_sidebar',
    DEFAULT_DATE_RANGE: 'month',
    CHART_COLORS: ['#16a34a', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#6366f1'],
    LOW_STOCK_FALLBACK: 10
  };
})();
