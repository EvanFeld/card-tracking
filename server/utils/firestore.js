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

function buildFlags(f) {
  const currentIndex = unwrapFsField(f.dailyIndex);
  if (!currentIndex) return [];

  const dailySales  = unwrapFsField(f.dailySales)          ?? 0;
  const weekly      = unwrapFsField(f.weeklyPercentChange)  ?? 0;
  const monthly     = unwrapFsField(f.monthlyPercentChange) ?? 0;
  const avg30Sales  = rollingAvg(f.dailySalesTotal, 30)     ?? dailySales;
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

  return flags;
}

async function fetchPlayerDoc(token, playerName) {
  const url  = `${PLAYERS_BASE}/${encodeURIComponent(playerName.trim())}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;
  const doc = await resp.json();
  return doc.fields || null;
}

module.exports = { unwrapFsField, rollingAvg, buildFlags, fetchPlayerDoc, PLAYERS_BASE };
