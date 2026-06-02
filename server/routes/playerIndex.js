const express = require('express');
const router  = express.Router();
const db      = require('../db');

const FIREBASE_KEY  = process.env.CARDLADDER_FIREBASE_KEY;
const FIREBASE_AUTH = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`;
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/cardladder-71d53/databases/(default)/documents/players';

let cachedToken  = null;
let tokenExpiry  = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res  = await fetch(FIREBASE_AUTH, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      email:             process.env.CARDLADDER_EMAIL,
      password:          process.env.CARDLADDER_PASSWORD,
      returnSecureToken: true,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Firebase Auth: ${data.error?.message ?? res.status}`);
  cachedToken = data.idToken;
  tokenExpiry = Date.now() + (Number(data.expiresIn) - 60) * 1000;
  return cachedToken;
}

function unwrap(field) {
  if (!field) return null;
  if ('doubleValue'    in field) return field.doubleValue;
  if ('integerValue'   in field) return Number(field.integerValue);
  if ('stringValue'    in field) return field.stringValue;
  if ('timestampValue' in field) return field.timestampValue;
  if ('booleanValue'   in field) return field.booleanValue;
  if ('mapValue'       in field) {
    const out = {};
    for (const [k, v] of Object.entries(field.mapValue.fields || {})) out[k] = unwrap(v);
    return out;
  }
  return null;
}

function mmddToIso(s) {
  const [mm, dd, yyyy] = s.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

function mapToHistory(mapField) {
  if (!mapField?.mapValue?.fields) return [];
  return Object.entries(mapField.mapValue.fields)
    .map(([k, v]) => ({ date: mmddToIso(k), value: unwrap(v) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

router.get('/', async (req, res) => {
  const players = db.prepare(
    `SELECT DISTINCT TRIM(player_name) AS player_name FROM cards WHERE status = 'owned' ORDER BY player_name ASC`
  ).all().map(r => r.player_name);

  let token;
  try {
    token = await getToken();
  } catch (err) {
    console.error('[playerIndex] Auth failed:', err.message);
    return res.status(503).json({ error: 'Firebase auth failed' });
  }

  const results = [];
  for (const playerName of players) {
    const url = `${FIRESTORE_BASE}/${encodeURIComponent(playerName.trim())}`;
    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) {
        console.log(`[playerIndex] ${playerName}: Firestore returned ${resp.status} — skipping`);
        continue;
      }
      const doc = await resp.json();
      const f   = doc.fields;
      if (!f) continue;

      const currentIndex = unwrap(f.dailyIndex);
      if (!currentIndex) {
        console.log(`[playerIndex] ${playerName}: index is 0 — skipping`);
        continue;
      }

      results.push({
        player:      playerName,
        currentIndex,
        totalCards:  unwrap(f.totalCards),
        lastUpdated: unwrap(f.lastUpdated),
        percentChanges: {
          daily:     unwrap(f.dailyPercentChange),
          weekly:    unwrap(f.weeklyPercentChange),
          monthly:   unwrap(f.monthlyPercentChange),
          quarterly: unwrap(f.quarterlyPercentChange),
        },
        indexHistory: mapToHistory(f.dailyIndexTotal),
        salesHistory: mapToHistory(f.dailySalesTotal),
      });
    } catch (err) {
      console.error(`[playerIndex] Error fetching ${playerName}:`, err.message);
    }
  }

  res.json(results);
});

module.exports = router;
