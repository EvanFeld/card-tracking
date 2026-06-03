/*
 * Firestore exploration script — READ ONLY, never writes.
 *
 * Results summary (run 2026-06-03):
 * ─────────────────────────────────────────────
 * /config/indexSnapshot  → 200 — 37 sport/category segments, each with: dailyIndex,
 *                          dailySales, weeklyPercentChange, monthlyPercentChange,
 *                          quarterlyPercentChange, halfAnnualPercentChange,
 *                          annualPercentChange, fiveYearPercentChange,
 *                          yearToDatePercentChange, allTimePercentChange, totalCards
 * /config/trending       → 404 not found
 * /config/marketSummary  → 404 not found
 * /config/topPlayers     → 404 not found
 * /config/volumeLeaders  → 404 not found
 * /config/weeklyMovers   → 404 not found
 * /config/dailyMovers    → 404 not found
 * /players               → 200 — per-player docs keyed by player name.
 *                          Fields: player, category, dailyIndex, dailySales,
 *                          dailySalesTotal (date→int history), dailyIndexTotal
 *                          (date→double history), weeklyPercentChange,
 *                          monthlyPercentChange, quarterlyPercentChange,
 *                          halfAnnualPercentChange, annualPercentChange,
 *                          totalMarketCap, totalCards, totalValue, lastUpdated
 * /indexes               → 200 — sport/tier index docs (same shape as /players)
 * /market                → 403 no access
 * /sports                → 403 no access
 */

const { getToken } = require('../services/firebaseAuth');

const PROJECT_ID = 'cardladder-71d53';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function fsType(v) {
  if (!v || typeof v !== 'object') return typeof v;
  const keys = Object.keys(v);
  if (keys.length === 1) {
    if (keys[0] === 'stringValue')    return 'string';
    if (keys[0] === 'integerValue')   return 'integer';
    if (keys[0] === 'doubleValue')    return 'double';
    if (keys[0] === 'booleanValue')   return 'boolean';
    if (keys[0] === 'timestampValue') return 'timestamp';
    if (keys[0] === 'nullValue')      return 'null';
    if (keys[0] === 'arrayValue')     return `array[${(v.arrayValue?.values || []).length}]`;
    if (keys[0] === 'mapValue') {
      const subKeys = Object.keys(v.mapValue?.fields || {});
      return `map{${subKeys.join(', ')}}`;
    }
    if (keys[0] === 'referenceValue') return 'reference';
    if (keys[0] === 'geoPointValue')  return 'geoPoint';
    if (keys[0] === 'bytesValue')     return 'bytes';
  }
  return JSON.stringify(keys);
}

function summariseFields(fields, indent = '  ') {
  if (!fields || typeof fields !== 'object') { console.log(`${indent}(no fields)`); return; }
  for (const [k, v] of Object.entries(fields)) {
    const t = fsType(v);
    if (t.startsWith('map{')) {
      console.log(`${indent}${k}: map`);
      summariseFields(v.mapValue?.fields, indent + '  ');
    } else {
      console.log(`${indent}${k}: ${t}`);
    }
  }
}

async function probeDocument(token, path) {
  const url = `${BASE}/${path}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 404) { console.log(`  → 404 not found`); return null; }
    if (res.status === 403) { console.log(`  → 403 no access`); return null; }
    if (!res.ok)            { console.log(`  → HTTP ${res.status}`); return null; }
    const doc = await res.json();
    const fields = doc.fields;
    if (!fields) { console.log(`  → 200 but no fields`); return null; }
    console.log(`  → 200 OK — fields:`);
    summariseFields(fields);
    return doc;
  } catch (e) {
    console.log(`  → Error: ${e.message}`);
    return null;
  }
}

async function probeCollection(token, collection) {
  const url = `${BASE}/${collection}?pageSize=3`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 404) { console.log(`  → 404 not found`); return null; }
    if (res.status === 403) { console.log(`  → 403 no access`); return null; }
    if (!res.ok)            { console.log(`  → HTTP ${res.status}`); return null; }
    const body = await res.json();
    const docs = body.documents || [];
    if (!docs.length) {
      const keys = Object.keys(body);
      console.log(`  → 200 but no documents. Response keys: ${keys.join(', ')}`);
      return null;
    }
    console.log(`  → 200 OK — ${docs.length} doc(s) returned. First doc fields:`);
    summariseFields(docs[0].fields);
    return body;
  } catch (e) {
    console.log(`  → Error: ${e.message}`);
    return null;
  }
}

async function deepInspectIndexSnapshot(token) {
  console.log('\n=== DEEP INSPECT: config/indexSnapshot ===');
  const url = `${BASE}/config/indexSnapshot`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { console.log(`HTTP ${res.status}`); return; }
  const doc = await res.json();
  const fields = doc.fields || {};

  console.log('Top-level keys:', Object.keys(fields).join(', '));

  for (const [segKey, segVal] of Object.entries(fields)) {
    console.log(`\n  Segment: ${segKey}`);
    const segFields = segVal.mapValue?.fields;
    if (!segFields) { console.log('    (not a map)'); continue; }
    console.log('  Field names:', Object.keys(segFields).join(', '));

    // Show value types + sample values for financial fields
    const financialHints = [
      'weeklyPercentChange', 'quarterlyPercentChange', 'dailySales',
      'totalCards', 'currentIndex', 'averageIndex', 'baselineIndex',
      'monthlyPercentChange', 'volume', 'totalVolume', 'marketCap',
      'percentChange', 'trending'
    ];
    for (const [fk, fv] of Object.entries(segFields)) {
      const t = fsType(fv);
      const isFinancial = financialHints.some(h => fk.toLowerCase().includes(h.toLowerCase()));
      if (isFinancial || t.startsWith('map')) {
        if (t.startsWith('map')) {
          console.log(`    ${fk}: map — sub-keys: ${Object.keys(fv.mapValue?.fields || {}).join(', ')}`);
        } else {
          const raw = fv.doubleValue ?? fv.integerValue ?? fv.stringValue ?? '?';
          console.log(`    ${fk}: ${t} = ${raw}`);
        }
      }
    }
  }
}

async function main() {
  console.log('=== Card Ladder Firestore Explorer ===\n');

  let token;
  try {
    token = await getToken();
    console.log('Auth token obtained.\n');
  } catch (e) {
    console.error('Auth failed:', e.message);
    process.exit(1);
  }

  const docPaths = [
    'config/indexSnapshot',
    'config/trending',
    'config/marketSummary',
    'config/topPlayers',
    'config/volumeLeaders',
    'config/weeklyMovers',
    'config/dailyMovers',
  ];

  for (const p of docPaths) {
    console.log(`\n--- ${p} ---`);
    await probeDocument(token, p);
  }

  const collections = ['players', 'indexes', 'market', 'sports'];
  for (const c of collections) {
    console.log(`\n--- collection: ${c} ---`);
    await probeCollection(token, c);
  }

  await deepInspectIndexSnapshot(token);

  console.log('\n=== Done ===');
}

main().catch(e => { console.error(e); process.exit(1); });
