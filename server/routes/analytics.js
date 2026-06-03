const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { getToken }                               = require('../services/firebaseAuth');
const { unwrapFsField, buildFlags, fetchPlayerDoc } = require('../utils/firestore');

// GET /api/analytics/portfolio-history
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

// GET /api/analytics/portfolio-breakdown
router.get('/portfolio-breakdown', (req, res) => {
  try {
    const sportRows = db.prepare(`
      SELECT
        sport,
        ROUND(COALESCE(SUM(current_value), 0), 2) AS value,
        COUNT(*) AS count,
        'collection' AS type
      FROM cards
      WHERE status = 'owned'
      GROUP BY sport
    `).all().map(r => ({
      ...r,
      label: r.sport ? r.sport.charAt(0).toUpperCase() + r.sport.slice(1) : 'Other',
      sport: r.sport || 'other',
    }));

    const whatnotRow = db.prepare(`
      SELECT
        ROUND(COALESCE(SUM(current_value), 0), 2) AS value,
        COUNT(*) AS count
      FROM cards
      WHERE status = 'whatnot'
    `).get();

    const rows = [
      ...sportRows,
      { label: 'Whatnot Ammo', sport: null, value: whatnotRow.value, count: whatnotRow.count, type: 'whatnot' },
    ].filter(r => r.value > 0 || r.count > 0);

    res.json(rows);
  } catch (err) {
    console.error('[analytics] portfolio-breakdown error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/whatnot-ammo
router.get('/whatnot-ammo', (req, res) => {
  try {
    const summary = db.prepare(`
      SELECT
        COUNT(*) AS totalCards,
        ROUND(COALESCE(SUM(current_value), 0), 2) AS totalValue,
        SUM(CASE WHEN is_auto = 1 THEN 1 ELSE 0 END) AS autos
      FROM cards
      WHERE status = 'whatnot'
    `).get();

    const byPlayer = db.prepare(`
      SELECT
        TRIM(player_name) AS player_name,
        COUNT(*) AS count,
        MAX(is_auto) AS is_auto,
        sport
      FROM cards
      WHERE status = 'whatnot'
      GROUP BY TRIM(player_name)
      ORDER BY count DESC
    `).all().map(p => ({ ...p, playerIndex: null }));

    res.json({ ...summary, byPlayer });
  } catch (err) {
    console.error('[analytics] whatnot-ammo error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/player-market/:playerName
router.get('/player-market/:playerName', async (req, res) => {
  let token;
  try {
    token = await getToken();
  } catch (err) {
    return res.status(503).json({ error: 'Firebase auth failed' });
  }

  const playerName = req.params.playerName;
  try {
    const f = await fetchPlayerDoc(token, playerName);
    if (!f) return res.json({ notFound: true });

    res.json({
      player:                  playerName,
      category:                unwrapFsField(f.category)               ?? '',
      currentIndex:            unwrapFsField(f.dailyIndex),
      dailySales:              unwrapFsField(f.dailySales)             ?? 0,
      weeklyPercentChange:     unwrapFsField(f.weeklyPercentChange)    ?? 0,
      monthlyPercentChange:    unwrapFsField(f.monthlyPercentChange)   ?? 0,
      quarterlyPercentChange:  unwrapFsField(f.quarterlyPercentChange) ?? 0,
      halfAnnualPercentChange: unwrapFsField(f.halfAnnualPercentChange)?? 0,
      annualPercentChange:     unwrapFsField(f.annualPercentChange)    ?? 0,
      flags:                   buildFlags(f),
    });
  } catch (err) {
    console.error(`[player-market] ${playerName}:`, err.message);
    res.json({ notFound: true });
  }
});

module.exports = router;
