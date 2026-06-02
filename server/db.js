const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'cardtracker.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    year INTEGER,
    brand TEXT,
    card_set TEXT,
    card_number TEXT,
    sport TEXT CHECK(sport IN ('baseball','football','basketball','hockey','soccer')),
    parallel TEXT,
    serial_number TEXT,
    is_auto INTEGER DEFAULT 0,
    is_mem INTEGER DEFAULT 0,
    is_numbered INTEGER DEFAULT 0,
    is_graded INTEGER DEFAULT 0,
    grading_company TEXT,
    grade TEXT,
    raw_condition TEXT,
    purchase_price REAL,
    purchase_date TEXT,
    purchased_from TEXT,
    current_value REAL,
    last_price_check TEXT,
    status TEXT DEFAULT 'owned' CHECK(status IN ('owned','sold','watchlist')),
    notes TEXT,
    image_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sales_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER REFERENCES cards(id),
    sale_price REAL NOT NULL,
    sale_date TEXT,
    platform TEXT,
    profit_loss REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER REFERENCES cards(id),
    date TEXT,
    price REAL,
    source TEXT
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_query TEXT,
    target_price REAL,
    alert_threshold REAL,
    sport TEXT,
    last_checked TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
