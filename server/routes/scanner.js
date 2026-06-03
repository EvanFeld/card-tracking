const express = require('express');
const router = express.Router();
const db = require('../db');
const { fetchCardLadderData } = require('../services/cardladder');
const { getToken } = require('../services/firebaseAuth');
const { unwrapFsField, rollingAvg, buildFlags, fetchPlayerDoc, PLAYERS_BASE } = require('../utils/firestore');

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
      const f = await fetchPlayerDoc(token, playerName);
      if (!f) continue;

      const currentIndex = unwrapFsField(f.dailyIndex);
      if (!currentIndex) continue;

      const flags = buildFlags(f);
      if (!flags.length) continue;

      flagged.push({
        player:       playerName,
        currentIndex: Math.round(currentIndex),
        weekly:       unwrapFsField(f.weeklyPercentChange)  ?? 0,
        monthly:      unwrapFsField(f.monthlyPercentChange) ?? 0,
        dailySales:   unwrapFsField(f.dailySales)           ?? 0,
        avg30Sales:   Math.round(rollingAvg(f.dailySalesTotal, 30) ?? unwrapFsField(f.dailySales) ?? 0),
        category:     unwrapFsField(f.category) ?? '',
        flags,
      });
    } catch (err) {
      console.error(`[portfolio-intelligence] ${playerName}:`, err.message);
    }
  }

  res.json(flagged.sort((a, b) => b.flags.length - a.flags.length));
});

// GET /api/scanner/whatnot-signals
router.get('/whatnot-signals', async (req, res) => {
  const players = db.prepare(
    `SELECT DISTINCT TRIM(player_name) AS player_name FROM cards WHERE status = 'whatnot'`
  ).all().map(r => r.player_name);

  let token;
  try {
    token = await getToken();
  } catch (err) {
    return res.status(503).json({ error: 'Firebase auth failed' });
  }

  const signals = {};

  for (const playerName of players) {
    try {
      const f = await fetchPlayerDoc(token, playerName);
      if (!f) continue;
      const flags = buildFlags(f);
      if (flags.length) signals[playerName] = flags;
    } catch (err) {
      console.error(`[whatnot-signals] ${playerName}:`, err.message);
    }
  }

  res.json(signals);
});

module.exports = router;
