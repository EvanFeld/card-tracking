const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/price-history/:cardId
router.get('/:cardId', (req, res) => {
  const rows = db.prepare(`
    SELECT id, card_id, date, price, source
    FROM price_history
    WHERE card_id = ?
    ORDER BY date ASC
  `).all(req.params.cardId);

  res.json(rows);
});

module.exports = router;
