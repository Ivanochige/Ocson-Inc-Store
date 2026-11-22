# Ocson Inc. Store

A complete, responsive stock, sales, inventory and business reporting web application built with **HTML5, CSS3 and Vanilla JavaScript**. Data is stored in **Google Sheets** and accessed exclusively through a **Google Apps Script** API. The frontend is deployed on **GitHub Pages**.

> No frameworks. No build step. No mock data. No credentials in the browser.

---

## 1. Features

| Module | What it does |
|---|---|
| Dashboard | 12 live KPIs, 7 interactive Chart.js charts, date filters, recent sales and stock alerts |
| Products | Full CRUD, duplicate SKU detection, CSV import/export, details, stock history, image URLs |
| Inventory | Stock additions, deductions, adjustments, damaged stock, returns, full movement ledger |
| Sales / POS | Product search, cart, discounts, cash / mobile money / bank transfer, receipts, printing, PDF receipts, refunds |
| Orders | 7-stage workflow, conversion to sale with **single** stock deduction and revenue posting |
| Customers | Registration, search, purchase history, spending, balances, walk-in support |
| Suppliers | Contacts, linked products, purchase history, outstanding balances, supplier reports |
| Purchases | Purchase orders, one-time receiving that increases inventory, reference numbers |
| Expenses | 9 categories, payment methods, responsible user, category analytics |
| Reports | 22 reports across Sales, Inventory and Financial groups with filters, search, sorting, CSV, PDF and print |
| Users | Four roles with server-enforced permissions; salted SHA-256 password hashes |
| Settings | Backend connection, company profile, categories, audit log, themes |

Design: dark navy + white + green, collapsible sidebar, responsive tables, modals, toasts, confirmation dialogs and light/dark themes.

---

## 2. Project structure

```
ocson-inc-store/
├── index.html              Dashboard
├── products.html  inventory.html  sales.html  orders.html
├── customers.html suppliers.html  purchases.html expenses.html
├── reports.html   users.html      settings.html
├── css/
│   ├── style.css           Variables, layout, forms, tables
│   ├── components.css      Cards, modals, toasts, POS components
│   ├── dashboard.css       KPI and chart layout
│   └── responsive.css      Tablet / mobile / print breakpoints
├── js/
│   ├── config.js           Public API URL and app constants
│   ├── utils.js            Formatting, validation, modal, toast, CSV/PDF/print
│   ├── api.js              Single action-based API client
│   ├── auth.js             Session + role gates
│   ├── app.js              Shell, sidebar, topbar, theme
│   ├── dashboard.js  products.js inventory.js sales.js orders.js
│   ├── customers.js  suppliers.js purchases.js expenses.js
│   ├── reports.js    users.js     settings.js
├── assets/images/  assets/icons/
├── google-apps-script/
│   ├── Code.gs  Database.gs  Authentication.gs  Products.gs  Inventory.gs
│   ├── Sales.gs Orders.gs    Purchases.gs       Customers.gs Suppliers.gs
│   ├── Expenses.gs Reports.gs Settings.gs
├── .github/workflows/deploy.yml
├── .gitignore  .nojekyll  README.md
```

**Frontend structure:** `HTML/CSS/JS → Google Apps Script API → Google Sheets`.

---

## 3. Backend setup (Google Apps Script + Google Sheets)

### Step 3.1 — Create the Google Sheet

1. Go to [sheets.new](https://sheets.new) and create a blank spreadsheet.
2. Name it **Ocson Inc. Store Database**.
3. Copy its ID from the address bar:
   `docs.google.com/spreadsheets/d/**THIS_IS_THE_ID**/edit`

### Step 3.2 — Create the Apps Script project

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Delete the default `Code.gs` content.
3. Create these files (exact names) and paste the matching file from `google-apps-script/`:

   `Code.gs`, `Database.gs`, `Authentication.gs`, `Products.gs`, `Inventory.gs`, `Sales.gs`, `Orders.gs`, `Purchases.gs`, `Customers.gs`, `Suppliers.gs`, `Expenses.gs`, `Reports.gs`, `Settings.gs`

4. In `Database.gs`, set the spreadsheet ID on line 1:

   ```javascript
   var DB_SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
   ```

   (Leave it empty only if the script is directly attached to the Sheet via *Extensions → Apps Script*.)

5. Save all files.

### Step 3.3 — Initialise the database

1. In the Apps Script editor, select `Code.gs` → choose `setupDatabase` in the function dropdown → **Run**.
2. Approve the OAuth consent screen (your own Google account).
3. This creates **18 worksheets**: Users, Products, Categories, Sales, Sale_Items, Inventory, Stock_Movements, Orders, Order_Items, Customers, Suppliers, Purchases, Purchase_Items, Expenses, Payments, Returns, Audit_Logs, Settings. It also seeds categories and default settings.

### Step 3.4 — Create the first administrator

1. Run `createDefaultAdmin()` once from `Authentication.gs`.
2. It prints: `Username: admin · Password: Admin@Ocson2026`.
3. Sign in, then change the password. Use `hashPassword('your-new-password')` in the Apps Script editor and paste the resulting `salt` and `passwordHash` into the `admin` row of the **Users** sheet.
4. Create further users in **Users → Add user**. Never type plain-text passwords into the sheet.

### Step 3.5 — Deploy the web app

1. **Deploy → New deployment → Web app**.
2. Description: `Ocson Store API v1`.
3. **Execute as: Me**.
4. **Who has access: Anyone**.
5. Click **Deploy**, approve permissions, then copy the URL ending in `/exec`.
6. After any backend code change: **Deploy → Manage deployments → Edit → Version: New version → Deploy**. The URL stays the same.

> The `/exec` URL is a public endpoint but not a database credential. Authorization is enforced on every request by the backend using expiring session tokens and role checks.

---

## 4. Frontend deployment (GitHub Pages)

### Step 4.1 — Push to GitHub

```bash
cd ocson-inc-store
git init
git add .
git commit -m "Initial Ocson Inc. Store"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ocson-inc-store.git
git push -u origin main
```

### Step 4.2 — Enable Pages

1. Repository → **Settings → Pages**.
2. **Build and deployment → Source: GitHub Actions**.
3. The included workflow `.github/workflows/deploy.yml` deploys automatically on every push to `main`.
4. Your site will be at `https://YOUR_USERNAME.github.io/ocson-inc-store/`.

### Step 4.3 — Connect the frontend to the backend

1. Open the deployed site.
2. On first load, paste the Apps Script `/exec` URL into the setup dialog (or go to **Settings → Backend API**).
3. Click **Test connection** — you should see `Connected … 18 sheets ready`.
4. Sign in with your administrator account.

The API URL is stored only in your browser's `localStorage` for connection convenience. Business data is never stored locally.

---

## 5. Security model

- Passwords are hashed with a per-user random salt using **SHA-256** server-side; no plain text in Sheets or frontend code.
- Sessions are random tokens stored in the Settings sheet with a **12-hour expiry** and invalidated on logout or user deactivation.
- Every request is authorised again by the backend using the role permission map in `Authentication.gs`.
- `LockService` serialises sales, refunds, stock movements, order conversion and purchase receiving.
- Every write validates input server-side, uses server-calculated prices/totals, and is audited in `Audit_Logs`.
- A unique client `requestId` plus audit checks prevent duplicate sales, refunds, orders and purchase receipts.
- The frontend only knows the public web app URL; the spreadsheet ID and all write operations remain server-side.

### Roles

| Role | Access |
|---|---|
| Administrator | Everything, including users and settings |
| Manager | Operations, orders, refunds, purchases, expenses, all reports |
| Sales Attendant | POS, sales history, orders, customers, reports |
| Storekeeper | Products, inventory, purchases, suppliers, reports |

---

## 6. Daily usage notes

- **Sale:** Products → select items → discount → payment method → Complete sale. Stock is deducted once and a receipt is generated with Print / PDF actions.
- **Purchase:** create the order (stock unchanged) → **Receive** once to add stock and record movements.
- **Order:** build the order → progress its status → **Convert** to create one sale and deduct stock exactly once.
- **Refund:** Sales history → refund icon → amount and reason. Stock is restored and a Returns record is written.
- **Reports:** choose a report, set dates, search, click a column header to sort, then CSV / PDF / Print.
- **Theme:** moon/sun icon in the top bar. Sidebar auto-collapses on smaller screens.

---

## 7. API actions (for reference)

`auth.login`, `auth.logout`, `auth.me`, `auth.changePassword`, `system.health`,
`dashboard.summary`, `dashboard.chart`,
`products.list|get|save|status|import|stockHistory`, `categories.list|save`,
`inventory.list|movements|move|adjust|damaged|return|valuation`,
`sales.list|get|items|create|refund`,
`orders.list|get|items|save|status|convert`,
`customers.list|get|save|delete|history`,
`suppliers.list|get|save|delete|report`,
`purchases.list|get|items|save|receive`,
`expenses.list|summary|save|delete`,
`reports.<type>`, `settings.list|save|audit`, `users.list|save|status`.

Request shape:

```json
{ "action": "products.list", "token": "<session>", "payload": {}, "requestId": "rq_..." }
```

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| “Backend API is not configured” | Use the first-run **Connect your backend** dialog, or sign in and go to Settings → Backend API → paste the `/exec` URL. |
| “Cannot reach the backend” | Use the **Test connection** button in the setup dialog. Confirm the URL ends in `/exec` (not `/dev`), the deployment is set to **Anyone**, and your internet connection is working. |
| “Invalid response from backend” | Redeploy with a **New version** after code changes. |
| `AUTH_REQUIRED` loop | Sign out, clear site data for the domain, sign in again. |
| `DUPLICATE_REQUEST` | Refresh the page; the original operation already succeeded. |
| `INSUFFICIENT_STOCK` | Adjust inventory first; negative stock is intentionally blocked. |
| Charts empty | Charts render only from real Sheets data; record sales/stock movements first. |
| CORS error | Requests use `text/plain` and no custom headers; make sure you are using the `/exec` URL, not `/dev`. |

---

## 9. Tech stack

HTML5 · CSS3 (custom properties, Grid, Flexbox) · Vanilla JavaScript ES6+ · Chart.js 4 · Lucide Icons · jsPDF · Google Apps Script · Google Sheets · GitHub Pages · GitHub Actions.

© Ocson Inc. Store.
