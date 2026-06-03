const express = require('express');
const router = express.Router();
const db = require('../db');
const { getToken }                               = require('../services/firebaseAuth');
const { unwrapFsField, buildFlags, fetchPlayerDoc } = require('../utils/firestore');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM watchlist ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const { search_query, target_price, alert_threshold, sport } = req.body;
  const result = db.prepare(`
    INSERT INTO watchlist (search_query, target_price, alert_threshold, sport)
    VALUES (?, ?, ?, ?)
  `).run(search_query, target_price || null, alert_threshold || null, sport || null);
  res.status(201).json(db.prepare('SELECT * FROM watchlist WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { search_query, target_price, alert_threshold, sport } = req.body;
  db.prepare(`
    UPDATE watchlist SET search_query = ?, target_price = ?, alert_threshold = ?, sport = ?
    WHERE id = ?
  `).run(search_query, target_price || null, alert_threshold || null, sport || null, req.params.id);
  res.json(db.prepare('SELECT * FROM watchlist WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM watchlist WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /api/watchlist/market-data
router.get('/market-data', async (req, res) => {
  const items = db.prepare('SELECT * FROM watchlist ORDER BY created_at DESC').all();
  if (!items.length) return res.json([]);

  let token;
  try {
    token = await getToken();
  } catch {
    return res.json(items.map(item => ({ ...item, marketData: { notFound: true } })));
  }

  const result = [];
  for (const item of items) {
    let marketData = { notFound: true };
    try {
      const f = await fetchPlayerDoc(token, item.search_query);
      if (f) {
        marketData = {
          notFound:             false,
          currentIndex:         unwrapFsField(f.dailyIndex),
          weeklyPercentChange:  unwrapFsField(f.weeklyPercentChange)  ?? 0,
          monthlyPercentChange: unwrapFsField(f.monthlyPercentChange) ?? 0,
          dailySales:           unwrapFsField(f.dailySales)           ?? 0,
          flags:                buildFlags(f),
        };
      }
    } catch {}
    result.push({ ...item, marketData });
  }

  res.json(result);
});

module.exports = router;
