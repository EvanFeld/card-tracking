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
    status TEXT DEFAULT 'owned' CHECK(status IN ('owned','sold','watchlist','whatnot')),
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

try { db.exec('ALTER TABLE price_history ADD COLUMN card_ladder_url TEXT'); } catch {}
try { db.exec('ALTER TABLE price_history ADD COLUMN ebay_listing_url TEXT'); } catch {}

try { db.exec('ALTER TABLE cards ADD COLUMN card_ladder_url TEXT'); } catch {}
try { db.exec('ALTER TABLE cards ADD COLUMN card_ladder_url_locked INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE cards ADD COLUMN ebay_sale_url_1 TEXT'); } catch {}
try { db.exec('ALTER TABLE cards ADD COLUMN ebay_sale_url_1_locked INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE cards ADD COLUMN ebay_sale_url_2 TEXT'); } catch {}
try { db.exec('ALTER TABLE cards ADD COLUMN ebay_sale_url_2_locked INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE cards ADD COLUMN ebay_sale_url_3 TEXT'); } catch {}
try { db.exec('ALTER TABLE cards ADD COLUMN ebay_sale_url_3_locked INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE cards ADD COLUMN is_insert INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE cards ADD COLUMN is_ssp    INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE cards ADD COLUMN is_rookie INTEGER DEFAULT 0'); } catch {}

try {
  db.exec(`
    UPDATE cards
    SET is_ssp = 1, serial_number = NULL
    WHERE TRIM(UPPER(serial_number)) = 'SSP'
      AND is_ssp = 0
  `);
  console.log('[db] SSP migration: moved SSP serial_number values to is_ssp flag');
} catch (e) {
  console.error('[db] SSP migration error:', e.message);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS grading_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
    self_grade TEXT,
    notes TEXT,
    verdict TEXT,
    roi_best REAL,
    roi_realistic REAL,
    score INTEGER,
    added_at TEXT DEFAULT (datetime('now'))
  );
`);

try { db.exec('ALTER TABLE grading_queue ADD COLUMN received_grade TEXT'); } catch {}
try { db.exec('ALTER TABLE grading_queue ADD COLUMN received_at TEXT'); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS psa_pop_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER UNIQUE REFERENCES cards(id) ON DELETE CASCADE,
    pop10 INTEGER,
    pop9 INTEGER,
    pop_total INTEGER,
    card_name TEXT,
    fetched_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrate status constraint to include 'whatnot' on existing databases
try {
  const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='cards'`).get();
  if (schema && !schema.sql.includes("'whatnot'")) {
    db.exec('PRAGMA foreign_keys=OFF');
    db.exec(`
      CREATE TABLE cards_migrated (
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
        status TEXT DEFAULT 'owned' CHECK(status IN ('owned','sold','watchlist','whatnot')),
        notes TEXT,
        image_url TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        card_ladder_url TEXT,
        card_ladder_url_locked INTEGER DEFAULT 0,
        ebay_sale_url_1 TEXT,
        ebay_sale_url_1_locked INTEGER DEFAULT 0,
        ebay_sale_url_2 TEXT,
        ebay_sale_url_2_locked INTEGER DEFAULT 0,
        ebay_sale_url_3 TEXT,
        ebay_sale_url_3_locked INTEGER DEFAULT 0
      )
    `);
    db.exec(`
      INSERT INTO cards_migrated
      SELECT id, player_name, year, brand, card_set, card_number, sport, parallel,
             serial_number, is_auto, is_mem, is_numbered, is_graded, grading_company,
             grade, raw_condition, purchase_price, purchase_date, purchased_from,
             current_value, last_price_check, status, notes, image_url, created_at,
             updated_at, card_ladder_url, card_ladder_url_locked,
             ebay_sale_url_1, ebay_sale_url_1_locked,
             ebay_sale_url_2, ebay_sale_url_2_locked,
             ebay_sale_url_3, ebay_sale_url_3_locked
      FROM cards
    `);
    db.exec('DROP TABLE cards');
    db.exec('ALTER TABLE cards_migrated RENAME TO cards');
    db.exec('PRAGMA foreign_keys=ON');
    console.log('[db] Migrated status constraint to include whatnot');
  }
} catch (e) {
  console.error('[db] Status constraint migration error:', e.message);
  try { db.exec('PRAGMA foreign_keys=ON'); } catch {}
}

module.exports = db;
