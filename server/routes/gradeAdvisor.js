const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { getToken }                      = require('../services/firebaseAuth');
const { buildFlags, fetchPlayerDoc }    = require('../utils/firestore');
const { fetchPsaPop }                   = require('../services/psaPop');
const { fetchEbaySoldPrices }           = require('../services/cardladder');

const DEFAULT_GRADING_FEE = 19;

function scoreCard(card, flags = []) {
  let score = 0;

  if (card.is_rookie) {
    const sport = (card.sport || '').toLowerCase();
    if (['football', 'basketball', 'baseball'].includes(sport)) score += 30;
    else if (sport === 'hockey') score += 15;
  }
  if (card.is_auto) score += 25;
  if (card.is_ssp)  score += 25;
  if (card.is_mem)  score += 10;

  if (card.serial_number) {
    const serial = String(card.serial_number).replace(/\//g, '').trim();
    const n = parseInt(serial, 10);
    if (!isNaN(n)) {
      if (n <= 10)       score += 40;
      else if (n <= 25)  score += 35;
      else if (n <= 49)  score += 35;
      else if (n <= 100) score += 25;
      else if (n <= 249) score += 15;
      else if (n <= 499) score += 10;
    }
  }

  const brand = (card.brand    || '').toLowerCase();
  const set   = (card.card_set || '').toLowerCase();
  if (brand.includes('prizm')  || set.includes('prizm'))  score += 10;
  if (brand.includes('chrome') || set.includes('chrome')) score += 10;
  if (brand.includes('select') || set.includes('select')) score += 8;
  if (brand.includes('optic')  || set.includes('optic'))  score += 6;

  const flagKeys = flags.map(f => f.key);
  if (flagKeys.includes('breakout'))      score += 15;
  if (flagKeys.includes('volume_spike'))  score += 10;
  if (flagKeys.includes('sell_pressure')) score -= 15;
  if (flagKeys.includes('dip_buy'))       score += 5;

  const condition = (card.raw_condition || '').toLowerCase();
  if (['gem-mt', 'mint'].includes(condition)) score += 20;
  else if (condition === 'nm-mt')             score += 10;
  else if (['nm', 'ex'].includes(condition))  score += 5;

  return score;
}

function psa10Multiplier(score, pop10) {
  let base;
  if (score >= 60) base = 4.0;
  else if (score >= 45) base = 3.0;
  else if (score >= 35) base = 2.2;
  else if (score >= 25) base = 1.6;
  else base = 1.2;

  if (pop10 === null || pop10 === undefined) return base;
  if (pop10 === 0)    return base * 2.0;
  if (pop10 <= 5)     return base * 1.7;
  if (pop10 <= 15)    return base * 1.4;
  if (pop10 <= 50)    return base * 1.1;
  if (pop10 <= 150)   return base * 0.9;
  if (pop10 <= 500)   return base * 0.75;
  return base * 0.6;
}

function verdict(score, rawCondition) {
  const cond = (rawCondition || '').toLowerCase();
  const belowMint = cond !== '' && !['gem-mt', 'mint', 'nm-mt'].includes(cond);
  if (score >= 40 && !belowMint) return 'send';
  if (score >= 40 && belowMint)  return 'inspect';
  if (score >= 25)               return 'check';
  return 'skip';
}

// GET /api/grade-advisor/analyze
router.get('/analyze', async (req, res) => {
  const fee = parseFloat(req.query.fee) || DEFAULT_GRADING_FEE;

  let token;
  try {
    token = await getToken();
  } catch {
    token = null;
  }

  try {
    const cards = db.prepare(`
      SELECT * FROM cards
      WHERE status = 'owned' AND (is_graded = 0 OR is_graded IS NULL)
    `).all();

    // Fetch Firestore docs for unique players in parallel
    const uniquePlayers = [...new Set(cards.map(c => c.player_name?.trim()).filter(Boolean))];
    const playerFlagsMap = {};

    if (token) {
      await Promise.all(
        uniquePlayers.map(async (name) => {
          try {
            const f = await fetchPlayerDoc(token, name);
            playerFlagsMap[name] = f ? buildFlags(f) : [];
          } catch {
            playerFlagsMap[name] = [];
          }
        })
      );
    }

    const queueRows = db.prepare('SELECT card_id, id FROM grading_queue').all();
    const queueMap  = {};
    for (const row of queueRows) queueMap[row.card_id] = row.id;

    // Load cached pop data
    const popRows = db.prepare('SELECT card_id, pop10, pop9, pop_total FROM psa_pop_cache').all();
    const popMap = {};
    for (const r of popRows) popMap[r.card_id] = r;

    const results = cards.map(card => {
      const flags = playerFlagsMap[card.player_name?.trim()] || [];
      const score = scoreCard(card, flags);
      const pop   = popMap[card.id] ?? null;
      const mult  = psa10Multiplier(score, pop?.pop10 ?? null);
      const base  = card.current_value || 0;
      const est_psa10    = base * mult;
      const est_psa9     = est_psa10 * 0.45;
      const roi_best      = est_psa10 - base - fee;
      const roi_realistic = est_psa9  - base - fee;
      const v = verdict(score, card.raw_condition);
      const queue_id = queueMap[card.id] ?? null;

      return {
        id: card.id, player_name: card.player_name, year: card.year,
        brand: card.brand, card_set: card.card_set, card_number: card.card_number,
        parallel: card.parallel, serial_number: card.serial_number, sport: card.sport,
        is_auto: card.is_auto, is_mem: card.is_mem, is_numbered: card.is_numbered,
        is_ssp: card.is_ssp, is_rookie: card.is_rookie, is_insert: card.is_insert,
        raw_condition: card.raw_condition, current_value: card.current_value,
        purchase_price: card.purchase_price,
        score, verdict: v, est_psa10, est_psa9, roi_best, roi_realistic,
        flags,
        pop_data: pop ? { pop10: pop.pop10, pop9: pop.pop9, popTotal: pop.pop_total } : null,
        in_queue: queue_id !== null,
        queue_id,
      };
    });

    const VERDICT_ORDER = { send: 0, inspect: 1, check: 2, skip: 3 };
    results.sort((a, b) => {
      const vDiff = VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict];
      return vDiff !== 0 ? vDiff : b.score - a.score;
    });

    res.json(results);
  } catch (err) {
    console.error('[grade-advisor] analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/grade-advisor/queue
router.post('/queue', (req, res) => {
  const { card_id, self_grade, notes, verdict: v, roi_best, roi_realistic, score } = req.body;
  if (!card_id) return res.status(400).json({ error: 'card_id required' });

  try {
    db.prepare('DELETE FROM grading_queue WHERE card_id = ?').run(card_id);
    const result = db.prepare(`
      INSERT INTO grading_queue (card_id, self_grade, notes, verdict, roi_best, roi_realistic, score)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(card_id, self_grade || null, notes || null, v || null, roi_best ?? null, roi_realistic ?? null, score ?? null);

    res.json(db.prepare('SELECT * FROM grading_queue WHERE id = ?').get(Number(result.lastInsertRowid)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/grade-advisor/queue/:id
router.delete('/queue/:id', (req, res) => {
  db.prepare('DELETE FROM grading_queue WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /api/grade-advisor/queue
router.get('/queue', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT gq.*, c.player_name, c.year, c.brand, c.card_set, c.card_number,
             c.parallel, c.serial_number, c.sport, c.is_auto, c.is_mem,
             c.is_ssp, c.is_rookie, c.current_value, c.raw_condition
      FROM grading_queue gq
      JOIN cards c ON gq.card_id = c.id
      ORDER BY gq.added_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/grade-advisor/pop/:cardId
router.get('/pop/:cardId', async (req, res) => {
  const cardId = parseInt(req.params.cardId, 10);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  try {
    const pop = await fetchPsaPop(card.player_name, card.year, card.brand, card.card_set, card.card_number);
    if (!pop) return res.json({ notFound: true });

    // Upsert into cache
    db.prepare(`
      INSERT INTO psa_pop_cache (card_id, pop10, pop9, pop_total, card_name, fetched_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(card_id) DO UPDATE SET
        pop10 = excluded.pop10, pop9 = excluded.pop9,
        pop_total = excluded.pop_total, card_name = excluded.card_name,
        fetched_at = excluded.fetched_at
    `).run(cardId, pop.pop10 ?? 0, pop.pop9 ?? 0, pop.popTotal ?? 0, pop.cardName || null);

    res.json({ pop10: pop.pop10, pop9: pop.pop9, popTotal: pop.popTotal, cardName: pop.cardName, url: pop.url });
  } catch (err) {
    console.error('[grade-advisor] pop error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/grade-advisor/ebay-comps/:cardId
router.get('/ebay-comps/:cardId', async (req, res) => {
  const cardId = parseInt(req.params.cardId, 10);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  try {
    const comps = await fetchEbaySoldPrices(card.player_name, card.year, card.brand, card.card_set, card.card_number);
    if (!comps) return res.json({ notFound: true });
    res.json(comps);
  } catch (err) {
    console.error('[grade-advisor] ebay-comps error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/grade-advisor/queue/:id
router.put('/queue/:id', (req, res) => {
  const { received_grade, received_at } = req.body;
  try {
    db.prepare(`UPDATE grading_queue SET received_grade = ?, received_at = ? WHERE id = ?`)
      .run(received_grade || null, received_at || null, req.params.id);
    const item = db.prepare('SELECT * FROM grading_queue WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Queue item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
