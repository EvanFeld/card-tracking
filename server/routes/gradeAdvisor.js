const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { getToken }                     = require('../services/firebaseAuth');
const { buildFlags, fetchPlayerDoc }   = require('../utils/firestore');

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

function psa10Multiplier(score) {
  if (score >= 60) return 4.0;
  if (score >= 45) return 3.0;
  if (score >= 35) return 2.2;
  if (score >= 25) return 1.6;
  return 1.2;
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

    const results = cards.map(card => {
      const flags = playerFlagsMap[card.player_name?.trim()] || [];
      const score = scoreCard(card, flags);
      const mult  = psa10Multiplier(score);
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

module.exports = router;
