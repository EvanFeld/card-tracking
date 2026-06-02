const express = require('express');
const router = express.Router();
const db = require('../db');
const { fetchCardLadderData } = require('../services/cardladder');

// POST /api/prices/refresh/:id
router.post('/refresh/:id', async (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  console.log(`[prices] Refreshing price for card #${card.id}: ${card.player_name}`);

  const result = await fetchCardLadderData(
    card.player_name,
    card.year,
    card.brand,
    card.card_set,
    card.is_graded,
    card.grade
  );

  if (!result) {
    return res.status(404).json({ error: 'Card not found on Card Ladder' });
  }

  const today = new Date().toISOString().split('T')[0];

  // Update card's current value and last_price_check
  db.prepare(`
    UPDATE cards
    SET current_value = ?, last_price_check = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(result.recentSale ?? result.avg30day, today, card.id);

  // Insert into price_history
  db.prepare(`
    INSERT INTO price_history (card_id, date, price, source)
    VALUES (?, ?, ?, 'cardladder')
  `).run(card.id, today, result.recentSale ?? result.avg30day);

  const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id);
  res.json({ card: updated, priceData: result });
});

module.exports = router;
