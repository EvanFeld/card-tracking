# CardTracker

Local sports card collection tracker and market intelligence tool. Runs entirely on your machine — no cloud, no auth, no subscriptions.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js 24 · Express · node:sqlite (built-in, no native addons) |
| Frontend | React 18 · Vite · Tailwind CSS v3 |
| State | Zustand |
| Charts | Recharts v3 |
| HTTP | Axios |
| Scraper | Puppeteer v25 (Card Ladder price data via Firebase Auth bypass) |
| Database | SQLite (WAL mode, foreign keys on) |

---

## Setup

### Prerequisites

- Node.js 22 or later (built-in `node:sqlite` requires Node 22.5+; Node 24 recommended)
- A Card Ladder account (free tier works)

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/card-tracking.git
cd card-tracking
```

### 2. Configure environment

```bash
cp .env.example server/.env
```

Open `server/.env` and fill in your Card Ladder credentials:

```
CARDLADDER_EMAIL=your@email.com
CARDLADDER_PASSWORD=yourpassword
PORT=3001
```

### 3. Install dependencies

```bash
# Server
cd server
npm install

# Client
cd ../client
npm install
```

### 4. Start both servers

You need two terminals open simultaneously.

**Terminal 1 — API server:**

```bash
cd server
npm run dev
```

API runs at **http://localhost:3001**

**Terminal 2 — Frontend:**

```bash
cd client
npm run dev
```

App runs at **http://localhost:5173** — open this in your browser.

---

## Features

### Collection
- Sortable, filterable table of every card you own, have sold, or are watching
- Full card identity fields: player, year, brand, set, card number, sport, parallel, serial number
- Attribute flags: auto, memorabilia, numbered, graded
- Financial fields: purchase price, current value, purchase date, platform

### Card Drawer
- Slide-in detail panel for viewing and editing every field
- Unrealized P&L callout with dollar amount and return %
- **Refresh Price via Card Ladder** — scrapes live sales history and updates current value
- Price history sparkline chart (builds over time with each refresh)
- Two-step delete confirmation with inline cancel

### Summary Bar
Live portfolio value, total cost basis, total earned (realized), and net P&L — always visible at the top of every view.

### Sales Ledger
Full history of realized sales with per-sale profit/loss and aggregate stats (total revenue, total profit, avg per sale).

### Watchlist
Store search queries with target prices for cards you're hunting. Separate from the main collection.

### Analytics
Four data sections powered by dedicated server routes:
- **Portfolio Value Over Time** — daily total value chart built from price history
- **Top Performers** — ranked table of owned cards by unrealized P&L with green/red coloring
- **Sport Breakdown** — bar chart of total value by sport
- **Sales Performance** — stat cards: total sales, revenue, profit, avg/sale, best/worst sale

### Filter options (Collection view)

| Filter | Values |
|--------|--------|
| Player name | Partial text search |
| Sport | baseball / football / basketball / hockey / soccer |
| Brand | Partial text search |
| Graded/Raw | Toggle between graded only, raw only, or all |
| Grade | 1–10 (shown when Graded is selected) |
| Raw condition | Poor → GEM-MT (shown when Raw is selected) |
| Status | owned / sold / watchlist |

---

## API Reference

All routes are prefixed `/api`.

### Cards — `/api/cards`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/cards` | List cards with optional query filters |
| `GET` | `/api/cards/summary` | Portfolio totals (value, spent, earned, net) |
| `GET` | `/api/cards/:id` | Get single card |
| `POST` | `/api/cards` | Create card |
| `PUT` | `/api/cards/:id` | Update card fields |
| `DELETE` | `/api/cards/:id` | Delete card |
| `POST` | `/api/cards/:id/sell` | Mark sold + write to sales ledger |

### Prices — `/api/prices`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/prices/refresh/:id` | Scrape Card Ladder for this card's recent sale price |

### Price History — `/api/price-history`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/price-history/:cardId` | All price snapshots for a card (date ASC) |

### Sales Ledger — `/api/ledger`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/ledger` | All sales, joined with card info |
| `GET` | `/api/ledger/summary` | Aggregate: count, revenue, total profit, avg profit |

### Watchlist — `/api/watchlist`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/watchlist` | List items |
| `POST` | `/api/watchlist` | Create item |
| `PUT` | `/api/watchlist/:id` | Update item |
| `DELETE` | `/api/watchlist/:id` | Delete item |

### Analytics — `/api/analytics`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/analytics/portfolio-history` | Daily total portfolio value over time |
| `GET` | `/api/analytics/top-performers` | Top 10 owned cards by unrealized P&L |
| `GET` | `/api/analytics/by-sport` | Value and count grouped by sport |
| `GET` | `/api/analytics/sales-performance` | Aggregate sales stats |

---

## Database

SQLite file at `server/cardtracker.db`. WAL mode + foreign keys enabled. The file is excluded from git — it lives only on your machine.

### Tables

- `cards` — full card catalog with identity, grading, and financial fields
- `sales_ledger` — one row per sale, linked to `cards.id`
- `price_history` — time-series price snapshots per card (populated by Card Ladder scraper)
- `watchlist` — saved search queries with target/alert prices

---

## Project Structure

```
card-tracking/
├── .env.example              # Copy to server/.env and fill in credentials
├── server/
│   ├── index.js              # Express app entry + graceful shutdown
│   ├── db.js                 # SQLite init + schema (node:sqlite)
│   ├── services/
│   │   └── cardladder.js     # Puppeteer scraper + Firebase Auth bypass
│   └── routes/
│       ├── cards.js
│       ├── ledger.js
│       ├── watchlist.js
│       ├── prices.js
│       ├── priceHistory.js
│       └── analytics.js
└── client/
    ├── vite.config.js        # Proxies /api → localhost:3001
    └── src/
        ├── App.jsx
        ├── store/
        │   └── cardStore.js  # Zustand store + axios calls
        └── components/
            ├── Layout.jsx
            ├── Nav.jsx
            ├── SummaryBar.jsx
            ├── FilterBar.jsx
            ├── CardTable.jsx
            ├── CardDrawer.jsx
            ├── AddCardModal.jsx
            ├── CollectionView.jsx
            ├── LedgerView.jsx
            ├── WatchlistView.jsx
            └── AnalyticsView.jsx
```

---

## Roadmap

### Phase 3 — Market Scanner *(upcoming)*
- Scheduled background scraping across the full collection
- Price alert notifications when a card crosses a target threshold
- Bulk refresh for the entire portfolio in one click
- Market trend overlays on the Analytics charts

### Phase 4 — Electron Packaging *(upcoming)*
- Bundle the server + client into a single desktop app (no terminal required)
- Auto-launch on startup
- System tray icon with quick-add card shortcut
- Offline-first with optional cloud backup

---

## Notes

- The Card Ladder scraper authenticates via Firebase Auth REST API directly, bypassing the site's reCAPTCHA Enterprise layer. This works with any valid Card Ladder account.
- The SQLite database (`server/cardtracker.db`) is excluded from git. Back it up manually if needed — it contains your entire collection.
- `server/.env` is excluded from git. Never commit real credentials.
