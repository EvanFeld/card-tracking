const express = require('express');
const router = express.Router();
const db = require('../db');

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

module.exports = router;
