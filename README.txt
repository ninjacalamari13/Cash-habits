Cash Habit — Downloadable Bundle
=================================
Files:
- index.html  — UI for Cash Habit (balance-first)
- app.js      — logic (localStorage, catalog CRUD, chart, undo/export, settings)

How to use:
1) Put both files in the same folder.
2) Open index.html in your browser (Safari/Chrome). Add to Home Screen if you want.
3) Press ⚙︎ Manage to add/edit/delete habits & vices.
4) Press ▲ or ▼ to open the selector, then Apply to log.
5) Settings ⚙︎ lets you set a starting balance and currency symbol.
6) Export downloads a CSV of all logs (timestamp, date, type, name, cash, points).

Storage keys:
- cashhabit.logs
- cashhabit.catalog
- cashhabit.settings

Migration:
- If you previously used Now Mode, the app will import `nowmode.logs` and `nowmode.catalog` on first run (it won't delete them).

Chart:
- Bars show daily net cash (green/red).
- Line shows cumulative balance (applies starting balance + all logs).

Note: Chart.js is loaded from a CDN.
