const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/analytics/portfolio-history
// For each date in price_history, sums the most-recent price for every owned card
// on or before that date → daily total portfolio value over time.
router.get('/portfolio-history', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        d.date,
        COALESCE(SUM(ph_latest.price), 0) AS value
      FROM (SELECT DISTINCT date FROM price_history ORDER BY date) AS d
      CROSS JOIN (SELECT id FROM cards WHERE status = 'owned') AS owned_cards
      LEFT JOIN price_history ph_latest
        ON ph_latest.id = (
          SELECT ph.id
          FROM   price_history ph
          WHERE  ph.card_id = owned_cards.id AND ph.date <= d.date
          ORDER  BY ph.date DESC, ph.id DESC
          LIMIT  1
        )
      GROUP BY d.date
      HAVING value > 0
      ORDER BY d.date
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('[analytics] portfolio-history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/top-performers
// Top 10 owned cards by unrealized P&L (current_value - purchase_price).
router.get('/top-performers', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        player_name, brand, grade,
        purchase_price,
        current_value,
        ROUND(current_value - purchase_price, 2)                            AS profit,
        ROUND((current_value - purchase_price) / purchase_price * 100, 1)  AS return_pct
      FROM cards
      WHERE status         = 'owned'
        AND purchase_price IS NOT NULL AND purchase_price > 0
        AND current_value  IS NOT NULL
      ORDER BY profit DESC
      LIMIT 10
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('[analytics] top-performers error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/by-sport
// Total current_value and card count grouped by sport for owned cards.
router.get('/by-sport', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        COALESCE(sport, 'unknown') AS sport,
        ROUND(SUM(current_value), 2) AS total_value,
        COUNT(*) AS count
      FROM cards
      WHERE status = 'owned' AND current_value IS NOT NULL
      GROUP BY sport
      ORDER BY total_value DESC
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('[analytics] by-sport error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/sales-performance
// Aggregate stats across all sales_ledger entries.
router.get('/sales-performance', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT
        COUNT(*)                          AS total_sales,
        ROUND(SUM(sale_price),  2)        AS total_revenue,
        ROUND(SUM(profit_loss), 2)        AS total_profit,
        ROUND(AVG(profit_loss), 2)        AS avg_profit_per_sale,
        ROUND(MAX(profit_loss), 2)        AS best_sale,
        ROUND(MIN(profit_loss), 2)        AS worst_sale
      FROM sales_ledger
    `).get();
    res.json(row);
  } catch (err) {
    console.error('[analytics] sales-performance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
