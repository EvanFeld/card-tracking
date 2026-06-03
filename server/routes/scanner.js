const express = require('express');
const router = express.Router();
const db = require('../db');
const { fetchCardLadderData } = require('../services/cardladder');
const { getToken } = require('../services/firebaseAuth');

const PLAYERS_BASE = 'https://firestore.googleapis.com/v1/projects/cardladder-71d53/databases/(default)/documents/players';

function unwrapFsField(field) {
  if (!field) return null;
  if ('doubleValue'  in field) return field.doubleValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('stringValue'  in field) return field.stringValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('mapValue'     in field) {
    const out = {};
    for (const [k, v] of Object.entries(field.mapValue.fields || {})) out[k] = unwrapFsField(v);
    return out;
  }
  return null;
}

function rollingAvg(mapField, days) {
  if (!mapField?.mapValue?.fields) return null;
  const cutoff = Date.now() - days * 86400000;
  const vals = [];
  for (const [k, v] of Object.entries(mapField.mapValue.fields)) {
    const [mm, dd, yyyy] = k.split('/');
    if (new Date(`${yyyy}-${mm}-${dd}`).getTime() >= cutoff) {
      const val = unwrapFsField(v);
      if (val != null) vals.push(val);
    }
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// GET /api/scanner/bulk-refresh  (SSE — EventSource only supports GET)
router.get('/bulk-refresh', async (req, res) => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cards = db.prepare(`
    SELECT * FROM cards
    WHERE status = 'owned'
      AND (last_price_check IS NULL OR last_price_check < ?)
    ORDER BY player_name ASC
  `).all(cutoff.split('T')[0]);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const total = cards.length;
  let succeeded = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    let status = 'success';
    let newValue = null;
    let cardLadderUrl = null;
    let ebayListingUrl = null;

    try {
      const manualCardLadderUrl = card.card_ladder_url_locked === 1 && card.card_ladder_url
        ? card.card_ladder_url : null;
      const ebayUrls = [
        card.ebay_sale_url_1_locked === 1 && card.ebay_sale_url_1 ? card.ebay_sale_url_1 : null,
        card.ebay_sale_url_2_locked === 1 && card.ebay_sale_url_2 ? card.ebay_sale_url_2 : null,
        card.ebay_sale_url_3_locked === 1 && card.ebay_sale_url_3 ? card.ebay_sale_url_3 : null,
      ].filter(Boolean);

      const result = await fetchCardLadderData(
        card.player_name, card.year, card.brand, card.card_set, card.card_number,
        { manualCardLadderUrl, ebayUrls }
      );

      if (!result) {
        status = 'not_found';
        notFound++;
      } else {
        newValue = result.recentSale ?? result.avg30day;
        cardLadderUrl = result.cardLadderUrl ?? null;
        ebayListingUrl = result.ebayListingUrl ?? null;
        const today = new Date().toISOString().split('T')[0];

        db.prepare(`
          UPDATE cards SET current_value = ?, last_price_check = ?, updated_at = datetime('now') WHERE id = ?
        `).run(newValue, today, card.id);

        db.prepare(`
          INSERT INTO price_history (card_id, date, price, source, card_ladder_url, ebay_listing_url)
          VALUES (?, ?, ?, 'cardladder', ?, ?)
        `).run(card.id, today, newValue, cardLadderUrl, ebayListingUrl);

        succeeded++;
      }
    } catch (err) {
      console.error(`[scanner] Error for card #${card.id}:`, err.message);
      status = 'error';
      errors++;
    }

    res.write(`data: ${JSON.stringify({
      cardId: card.id,
      playerName: card.player_name,
      status,
      newValue,
      cardLadderUrl,
      ebayListingUrl,
      completed: i + 1,
      total
    })}\n\n`);

    if (i < cards.length - 1) await delay(2500);
  }

  res.write(`data: ${JSON.stringify({ done: true, total, succeeded, notFound, errors })}\n\n`);
  res.end();
});

// GET /api/scanner/opportunity-scan
router.get('/opportunity-scan', (req, res) => {
  const rows = db.prepare(`
    SELECT
      c.id,
      c.player_name,
      c.brand,
      c.card_set,
      c.grade,
      c.grading_company,
      c.current_value,
      MAX(ph.price) AS peak_value,
      ROUND((1.0 - c.current_value / MAX(ph.price)) * 100, 1) AS drop_pct,
      (
        SELECT ph2.card_ladder_url FROM price_history ph2
        WHERE ph2.card_id = c.id
        ORDER BY ph2.date DESC
        LIMIT 1
      ) AS card_ladder_url
    FROM cards c
    JOIN price_history ph ON ph.card_id = c.id
    WHERE c.status = 'owned'
      AND c.current_value IS NOT NULL
    GROUP BY c.id
    HAVING c.current_value <= MAX(ph.price) * 0.8
    ORDER BY drop_pct DESC
  `).all();

  res.json(rows);
});

// GET /api/scanner/portfolio-intelligence
router.get('/portfolio-intelligence', async (req, res) => {
  const players = db.prepare(
    `SELECT DISTINCT TRIM(player_name) AS player_name FROM cards WHERE status = 'owned' ORDER BY player_name ASC`
  ).all().map(r => r.player_name);

  let token;
  try {
    token = await getToken();
  } catch (err) {
    return res.status(503).json({ error: 'Firebase auth failed' });
  }

  const flagged = [];

  for (const playerName of players) {
    try {
      const url  = `${PLAYERS_BASE}/${encodeURIComponent(playerName.trim())}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) continue;
      const doc = await resp.json();
      const f   = doc.fields;
      if (!f) continue;

      const currentIndex = unwrapFsField(f.dailyIndex);
      if (!currentIndex) continue;

      const dailySales = unwrapFsField(f.dailySales) ?? 0;
      const weekly     = unwrapFsField(f.weeklyPercentChange) ?? 0;
      const monthly    = unwrapFsField(f.monthlyPercentChange) ?? 0;
      const category   = unwrapFsField(f.category) ?? '';

      const avg30Sales  = rollingAvg(f.dailySalesTotal, 30) ?? dailySales;
      const avg180Index = rollingAvg(f.dailyIndexTotal, 180);

      const flags = [];

      if (avg30Sales > 0 && dailySales > avg30Sales * 1.5)
        flags.push({ key: 'volume_spike',  label: 'Volume Spike',  emoji: '🔥', color: 'yellow' });

      if (monthly <= -0.10 && dailySales >= avg30Sales * 0.75)
        flags.push({ key: 'dip_buy',       label: 'Dip Buy',       emoji: '📉', color: 'green'  });

      if (weekly >= 0.15)
        flags.push({ key: 'breakout',      label: 'Breakout',      emoji: '📈', color: 'blue'   });

      if (monthly < -0.05 && dailySales < avg30Sales * 0.5)
        flags.push({ key: 'sell_pressure', label: 'Sell Pressure', emoji: '⚠️', color: 'red'    });

      if (avg180Index && currentIndex < avg180Index * 0.85)
        flags.push({ key: 'undervalued',   label: 'Undervalued',   emoji: '💎', color: 'purple' });

      if (!flags.length) continue;

      flagged.push({
        player: playerName,
        currentIndex: Math.round(currentIndex),
        weekly,
        monthly,
        dailySales,
        avg30Sales: Math.round(avg30Sales),
        category,
        flags,
      });
    } catch (err) {
      console.error(`[portfolio-intelligence] ${playerName}:`, err.message);
    }
  }

  res.json(flagged.sort((a, b) => b.flags.length - a.flags.length));
});

module.exports = router;
