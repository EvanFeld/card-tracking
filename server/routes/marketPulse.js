const express = require('express');
const router  = express.Router();
const { getToken } = require('../services/firebaseAuth');

const FIRESTORE_DOC = 'https://firestore.googleapis.com/v1/projects/cardladder-71d53/databases/(default)/documents/config/indexSnapshot';

const SPORTS = ['baseball', 'basketball', 'football', 'hockey', 'soccer'];

const SPORT_META = {
  baseball:   { label: 'Baseball',   emoji: '⚾' },
  basketball: { label: 'Basketball', emoji: '🏀' },
  football:   { label: 'Football',   emoji: '🏈' },
  hockey:     { label: 'Hockey',     emoji: '🏒' },
  soccer:     { label: 'Soccer',     emoji: '⚽' },
};

function unwrapField(field) {
  if (!field) return null;
  if ('doubleValue'  in field) return field.doubleValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('stringValue'  in field) return field.stringValue;
  return null;
}

function unwrapMap(mapField) {
  if (!mapField?.mapValue?.fields) return {};
  const out = {};
  for (const [k, v] of Object.entries(mapField.mapValue.fields)) {
    out[k] = unwrapField(v);
  }
  return out;
}

router.get('/', async (req, res) => {
  try {
    const token = await getToken();
    const resp  = await fetch(FIRESTORE_DOC, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return res.status(502).json({ error: `Firestore ${resp.status}` });

    const doc    = await resp.json();
    const fields = doc.fields ?? {};

    const result = SPORTS.map(sport => {
      const data = unwrapMap(fields[sport]);
      return {
        sport,
        label:                  SPORT_META[sport].label,
        emoji:                  SPORT_META[sport].emoji,
        dailyIndex:             data.dailyIndex              ?? null,
        dailySales:             data.dailySales              ?? null,
        totalCards:             data.totalCards              ?? null,
        weeklyPercentChange:    data.weeklyPercentChange     ?? null,
        monthlyPercentChange:   data.monthlyPercentChange    ?? null,
        quarterlyPercentChange: data.quarterlyPercentChange  ?? null,
        halfAnnualPercentChange:data.halfAnnualPercentChange ?? null,
        annualPercentChange:    data.annualPercentChange     ?? null,
        yearToDatePercentChange:data.yearToDatePercentChange ?? null,
        allTimePercentChange:   data.allTimePercentChange    ?? null,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[marketPulse] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
