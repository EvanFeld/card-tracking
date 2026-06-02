const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/summary', (req, res) => {
  res.json(db.prepare(`
    SELECT
      COUNT(*) as total_sales,
      COALESCE(SUM(sale_price), 0) as total_revenue,
      COALESCE(SUM(profit_loss), 0) as total_profit,
      COALESCE(AVG(profit_loss), 0) as avg_profit
    FROM sales_ledger
  `).get());
});

router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT sl.*, c.player_name, c.year, c.brand, c.card_set, c.purchase_price
    FROM sales_ledger sl
    LEFT JOIN cards c ON sl.card_id = c.id
    ORDER BY sl.sale_date DESC, sl.created_at DESC
  `).all());
});

module.exports = router;
