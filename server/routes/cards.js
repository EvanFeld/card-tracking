const express = require('express');
const router = express.Router();
const db = require('../db');

// NOTE: /summary must be defined before /:id or Express matches 'summary' as an id param
router.get('/summary', (req, res) => {
  const portfolioValue = db.prepare(
    `SELECT COALESCE(SUM(current_value), 0) as val FROM cards WHERE status = 'owned'`
  ).get().val;

  const totalSpent = db.prepare(
    `SELECT COALESCE(SUM(purchase_price), 0) as val FROM cards`
  ).get().val;

  const totalEarned = db.prepare(
    `SELECT COALESCE(SUM(sale_price), 0) as val FROM sales_ledger`
  ).get().val;

  const net = portfolioValue + totalEarned - totalSpent;

  res.json({ portfolioValue, totalSpent, totalEarned, net });
});

router.get('/', (req, res) => {
  const { sport, brand, graded, grade, raw_condition, status, player_name } = req.query;

  let query = 'SELECT * FROM cards WHERE 1=1';
  const params = [];

  if (sport)        { query += ' AND sport = ?';           params.push(sport); }
  if (brand)        { query += ' AND brand LIKE ?';        params.push(`%${brand}%`); }
  if (graded === 'true')  { query += ' AND is_graded = 1'; }
  if (graded === 'false') { query += ' AND is_graded = 0'; }
  if (grade)        { query += ' AND grade = ?';           params.push(grade); }
  if (raw_condition){ query += ' AND raw_condition = ?';   params.push(raw_condition); }
  if (status)       { query += ' AND status = ?';          params.push(status); }
  if (player_name)  { query += ' AND player_name LIKE ?';  params.push(`%${player_name}%`); }

  query += ' ORDER BY created_at DESC';

  res.json(db.prepare(query).all(...params));
});

router.get('/:id', (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  res.json(card);
});

router.post('/', (req, res) => {
  console.log('[POST /api/cards] body:', JSON.stringify(req.body));

  if (!req.body || !req.body.player_name) {
    return res.status(400).json({ error: 'player_name is required' });
  }

  const {
    player_name, year, brand, card_set, card_number, sport, parallel,
    serial_number, is_auto, is_mem, is_numbered, is_graded, grading_company,
    grade, raw_condition, purchase_price, purchase_date, purchased_from,
    current_value, last_price_check, status, notes, image_url
  } = req.body;

  try {
    const result = db.prepare(`
      INSERT INTO cards (
        player_name, year, brand, card_set, card_number, sport, parallel,
        serial_number, is_auto, is_mem, is_numbered, is_graded, grading_company,
        grade, raw_condition, purchase_price, purchase_date, purchased_from,
        current_value, last_price_check, status, notes, image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      player_name,
      year        ? Number(year)         : null,
      brand       || null,
      card_set    || null,
      card_number || null,
      sport       || null,
      parallel    || null,
      serial_number   || null,
      is_auto     ? 1 : 0,
      is_mem      ? 1 : 0,
      is_numbered ? 1 : 0,
      is_graded   ? 1 : 0,
      grading_company || null,
      grade           || null,
      raw_condition   || null,
      purchase_price  ? Number(purchase_price)  : null,
      purchase_date   || null,
      purchased_from  || null,
      current_value   ? Number(current_value)   : null,
      last_price_check || null,
      status      || 'owned',
      notes       || null,
      image_url   || null
    );

    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(Number(result.lastInsertRowid));
    console.log('[POST /api/cards] inserted id:', result.lastInsertRowid, '→', card?.player_name);
    res.status(201).json(card);
  } catch (err) {
    console.error('[POST /api/cards] SQLite error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const allFields = [
    'player_name', 'year', 'brand', 'card_set', 'card_number', 'sport', 'parallel',
    'serial_number', 'is_auto', 'is_mem', 'is_numbered', 'is_graded', 'grading_company',
    'grade', 'raw_condition', 'purchase_price', 'purchase_date', 'purchased_from',
    'current_value', 'last_price_check', 'status', 'notes', 'image_url'
  ];
  const boolFields = new Set(['is_auto', 'is_mem', 'is_numbered', 'is_graded']);

  const updates = {};
  for (const f of allFields) {
    if (req.body[f] !== undefined) {
      updates[f] = boolFields.has(f) ? (req.body[f] ? 1 : 0) : req.body[f];
    }
  }

  if (Object.keys(updates).length > 0) {
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE cards SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`)
      .run(...Object.values(updates), req.params.id);
  }

  res.json(db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/:id/sell', (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const { sale_price, sale_date, platform } = req.body;
  if (!sale_price) return res.status(400).json({ error: 'sale_price is required' });

  const profit_loss = parseFloat(sale_price) - (card.purchase_price || 0);
  const resolvedDate = sale_date || new Date().toISOString().split('T')[0];

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE cards SET status = 'sold', updated_at = datetime('now') WHERE id = ?`)
      .run(req.params.id);
    db.prepare(`
      INSERT INTO sales_ledger (card_id, sale_price, sale_date, platform, profit_loss)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.params.id, parseFloat(sale_price), resolvedDate, platform || null, profit_loss);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({
    card: db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id),
    profit_loss
  });
});

module.exports = router;
