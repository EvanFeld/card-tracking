const puppeteer = require('puppeteer');

const SALES_BASE     = 'https://app.cardladder.com/sales-history';
const APP_HOME       = 'https://app.cardladder.com/';
const FIREBASE_KEY   = 'AIzaSyBqbxgaaGlpeb1F6HRvEW319OcuCsbkAHM';
const FIREBASE_AUTH  = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`;

// ── Session cache ─────────────────────────────────────────────────────────────
let sharedBrowser = null;
let sharedPage    = null;
let sessionActive = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function isBrowserAlive() {
  if (!sharedBrowser || !sharedPage) return false;
  try { await sharedBrowser.version(); return true; } catch { return false; }
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Browser lifecycle ─────────────────────────────────────────────────────────

async function launchBrowser() {
  console.log('[CardLadder] Launching Chromium...');
  sharedBrowser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--disable-blink-features=AutomationControlled']
  });
  const pages = await sharedBrowser.pages();
  sharedPage = pages[0] || await sharedBrowser.newPage();
  await sharedPage.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );
  await sharedPage.setViewport({ width: 1440, height: 900 });
  console.log('[CardLadder] Browser ready.');
}

// ── Firebase Auth REST API ────────────────────────────────────────────────────
// Calls Firebase directly, bypassing Card Ladder's reCAPTCHA Enterprise layer.

async function firebaseSignIn(email, password) {
  const res  = await fetch(FIREBASE_AUTH, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Firebase Auth: ${data.error?.message ?? res.status}`);
  }
  return data; // { localId, email, idToken, refreshToken, expiresIn, registered }
}

// ── Auth injection ────────────────────────────────────────────────────────────
// Writes Firebase auth state into both localStorage and IndexedDB so the
// React app recognises the session on page load.

async function injectAuthState(page, authData) {
  const authKey = `firebase:authUser:${FIREBASE_KEY}:[DEFAULT]`;
  const authVal = {
    uid:            authData.localId,
    email:          authData.email,
    emailVerified:  authData.registered || false,
    displayName:    null,
    isAnonymous:    false,
    providerData: [{
      providerId: 'password',
      uid:        authData.email,
      displayName: null,
      email:      authData.email,
      phoneNumber: null,
      photoURL:   null
    }],
    stsTokenManager: {
      refreshToken:   authData.refreshToken,
      accessToken:    authData.idToken,
      expirationTime: Date.now() + parseInt(authData.expiresIn) * 1000
    },
    createdAt:   Date.now().toString(),
    lastLoginAt: Date.now().toString(),
    apiKey:      FIREBASE_KEY,
    appName:     '[DEFAULT]'
  };

  return page.evaluate(async (key, val) => {
    // localStorage (Firebase v8 compat / some v9 builds)
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}

    // IndexedDB — firebaseLocalStorageDb (Firebase v9 modular default)
    await new Promise((resolve) => {
      const req = indexedDB.open('firebaseLocalStorageDb', 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
          db.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
        }
      };
      req.onsuccess = e => {
        try {
          const db = e.target.result;
          const tx = db.transaction('firebaseLocalStorage', 'readwrite');
          tx.objectStore('firebaseLocalStorage').put({ fbase_key: key, value: val });
          tx.oncomplete = resolve;
          tx.onerror    = resolve;
        } catch { resolve(); }
      };
      req.onerror = resolve;
    });

    return 'injected';
  }, authKey, authVal);
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function doLogin() {
  // 1. Authenticate via Firebase REST API (no reCAPTCHA)
  console.log('[CardLadder] Signing in via Firebase Auth REST API...');
  const authData = await firebaseSignIn(
    process.env.CARDLADDER_EMAIL,
    process.env.CARDLADDER_PASSWORD
  );
  console.log('[CardLadder] Firebase Auth OK. UID:', authData.localId);

  // 2. Load the app so we're on the right domain to write storage
  console.log('[CardLadder] Loading app domain...');
  await sharedPage.goto(APP_HOME, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 3. Inject auth state into localStorage + IndexedDB
  const result = await injectAuthState(sharedPage, authData);
  console.log('[CardLadder] Auth injection result:', result);

  // 4. Reload so the React app picks up the stored session
  console.log('[CardLadder] Reloading to apply session...');
  await sharedPage.reload({ waitUntil: 'networkidle2', timeout: 30000 });
  await delay(2000);

  const finalUrl = sharedPage.url();
  console.log('[CardLadder] Post-login URL:', finalUrl);

  if (finalUrl.includes('/login')) {
    await sharedPage.screenshot({ path: 'login-auth-fail.png' });
    console.log('[CardLadder] Still on /login after injection — check login-auth-fail.png');
    sessionActive = false;
    return false;
  }

  console.log('[CardLadder] Login successful.');
  sessionActive = true;
  return true;
}

async function getLoggedInPage() {
  if (sessionActive && await isBrowserAlive()) {
    const url = sharedPage.url();
    if (!url.includes('/login')) {
      console.log('[CardLadder] Reusing cached session. URL:', url);
      return sharedPage;
    }
    console.log('[CardLadder] Session expired — re-authenticating...');
    sessionActive = false;
  }

  if (!await isBrowserAlive()) await launchBrowser();

  const ok = await doLogin();
  return ok ? sharedPage : null;
}

// ── Query builder ─────────────────────────────────────────────────────────────

function buildQuery(playerName, cardSet, year, isGraded, grade) {
  const parts = [];
  if (playerName) parts.push(playerName.toLowerCase().trim());
  if (cardSet)    parts.push(cardSet.toLowerCase().trim());
  if (year)       parts.push(String(year).trim());
  if (isGraded && grade) parts.push(String(grade).trim());
  const q = parts.filter(Boolean).join(' ');
  console.log('[CardLadder] Query:', JSON.stringify(q));
  return q;
}

// ── Price extraction ──────────────────────────────────────────────────────────

async function extractPrices(page) {
  return page.evaluate(() => {
    // Dollar sign is required — avoids matching "100M+ sales" and other page counters.
    function parsePrice(raw) {
      if (!raw) return null;
      const m = raw.replace(/,/g, '').match(/\$([\d]+\.?\d*)/);
      const v = m ? parseFloat(m[1]) : null;
      return (v && v > 0.5) ? v : null;
    }

    const text  = document.body.innerText;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let recentSale = null;
    let avg30day   = null;

    // First $X.XX in page order (results are sorted date-desc, so first = most recent)
    for (const line of lines) {
      const p = parsePrice(line);
      if (p) { recentSale = p; break; }
    }

    // Look for avg / 30-day label then a $price within 5 lines
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].toLowerCase();
      if (l.includes('avg') || l.includes('average') || l.includes('30-day') || l.includes('30 day')) {
        for (let j = i; j < Math.min(i + 5, lines.length); j++) {
          const p = parsePrice(lines[j]);
          if (p) { avg30day = p; break; }
        }
        if (avg30day) break;
      }
    }

    return { recentSale, avg30day, pagePreview: text.slice(0, 1200) };
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

async function fetchCardLadderData(playerName, year, brand, cardSet, isGraded, grade) {
  try {
    const page = await getLoggedInPage();
    if (!page) return null;

    const queryString = buildQuery(playerName, cardSet, year, isGraded, grade);
    if (!queryString) { console.log('[CardLadder] Empty query.'); return null; }

    const searchUrl = `${SALES_BASE}?sort=date&direction=desc&q=${encodeURIComponent(queryString)}`;
    console.log('[CardLadder] Navigating to:', searchUrl);

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('[CardLadder] Search page URL:', page.url());

    // Wait up to 10 s for results content
    await page.waitForFunction(
      () => document.body.innerText.trim().length > 200,
      { timeout: 10000 }
    ).catch(() => console.log('[CardLadder] Content wait timed out — continuing.'));

    const snap = await page.evaluate(() => {
      const raw   = document.body.innerText;
      const low   = raw.toLowerCase();
      const empty = low.includes('0 result') || low.includes('no result') || low.includes('no sales')
                 || low.includes('nothing here') || low.includes('no data') || low.includes('no matches');
      const countMatch = raw.match(/(\d[\d,]*)\s*(?:result|sale|transaction)/i);
      return { empty, resultCount: countMatch ? countMatch[0] : null };
    });

    console.log('[CardLadder] Empty state:', snap.empty, '| Count text:', snap.resultCount ?? '(not detected)');

    if (snap.empty) {
      console.log('[CardLadder] No results — returning null.');
      return null;
    }

    const prices = await extractPrices(page);
    console.log('[CardLadder] recentSale:', prices.recentSale, '| avg30day:', prices.avg30day);
    console.log('[CardLadder] Page preview:\n' + prices.pagePreview);

    if (!prices.recentSale && !prices.avg30day) {
      console.log('[CardLadder] No price extracted.');
      return null;
    }

    return {
      recentSale:  prices.recentSale,
      avg30day:    prices.avg30day,
      lastChecked: new Date().toISOString()
    };

  } catch (err) {
    console.error('[CardLadder] Error:', err.message);
    sessionActive = false;
    return null;
  }
}

async function closeBrowser() {
  if (sharedBrowser) {
    console.log('[CardLadder] Closing shared browser...');
    try { await sharedBrowser.close(); } catch {}
    sharedBrowser = null;
    sharedPage    = null;
    sessionActive = false;
    console.log('[CardLadder] Browser closed.');
  }
}

module.exports = { fetchCardLadderData, closeBrowser };
