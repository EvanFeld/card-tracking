const puppeteer = require('puppeteer');
const fs   = require('fs');
const path = require('path');

const EBAY_COOKIE_FILE = path.join(__dirname, '.ebay-cookies.json');

const SALES_BASE     = 'https://app.cardladder.com/sales-history';
const APP_HOME       = 'https://app.cardladder.com/';
const FIREBASE_KEY   = process.env.CARDLADDER_FIREBASE_KEY;
const FIREBASE_AUTH  = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`;

// ── Session cache ─────────────────────────────────────────────────────────────
let sharedBrowser     = null;
let sharedPage        = null;
let sessionActive     = false;

let sharedEbayPage    = null;
let ebaySessionActive = false;

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
  return data;
}

// ── Auth injection ────────────────────────────────────────────────────────────

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
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}

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

// ── CardLadder Login ──────────────────────────────────────────────────────────

async function doLogin() {
  console.log('[CardLadder] Signing in via Firebase Auth REST API...');
  const authData = await firebaseSignIn(
    process.env.CARDLADDER_EMAIL,
    process.env.CARDLADDER_PASSWORD
  );
  console.log('[CardLadder] Firebase Auth OK. UID:', authData.localId);

  console.log('[CardLadder] Loading app domain...');
  await sharedPage.goto(APP_HOME, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const result = await injectAuthState(sharedPage, authData);
  console.log('[CardLadder] Auth injection result:', result);

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

// ── eBay Login ────────────────────────────────────────────────────────────────

async function loginEbay() {
  if (ebaySessionActive && sharedEbayPage) {
    try {
      const url = sharedEbayPage.url();
      if (!url.includes('signin.ebay.com')) {
        console.log('[eBay] Reusing cached session. URL:', url);
        return true;
      }
    } catch {}
    ebaySessionActive = false;
  }

  if (!await isBrowserAlive()) await launchBrowser();

  try {
    console.log('[eBay] Opening new page for eBay session...');
    sharedEbayPage = await sharedBrowser.newPage();
    await sharedEbayPage.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await sharedEbayPage.setViewport({ width: 1440, height: 900 });

    // Remove webdriver fingerprint before any navigation
    await sharedEbayPage.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      window.chrome = { runtime: {} };
    });
    await sharedEbayPage.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });

    // ── Try resuming from saved cookies ───────────────────────────────────────
    if (fs.existsSync(EBAY_COOKIE_FILE)) {
      try {
        console.log('[eBay] Found saved cookies — attempting session resume...');
        const savedCookies = JSON.parse(fs.readFileSync(EBAY_COOKIE_FILE, 'utf8'));
        await sharedEbayPage.goto('https://www.ebay.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sharedEbayPage.setCookie(...savedCookies);
        await sharedEbayPage.reload({ waitUntil: 'networkidle2', timeout: 30000 });

        const resumeUrl = sharedEbayPage.url();
        const isLoggedIn = await sharedEbayPage.evaluate(() =>
          !document.body.innerText.toLowerCase().includes('sign in') ||
          document.querySelector('#gh-ug') !== null ||
          document.querySelector('[data-testid="gh-ug"]') !== null
        ).catch(() => false);

        if (!resumeUrl.includes('signin') && isLoggedIn) {
          console.log('[eBay] Resumed session from cookies. URL:', resumeUrl);
          ebaySessionActive = true;
          return true;
        }

        console.log('[eBay] Saved cookies expired — deleting and re-logging in...');
        fs.unlinkSync(EBAY_COOKIE_FILE);
      } catch (e) {
        console.log('[eBay] Cookie resume failed:', e.message, '— falling back to full login.');
        try { fs.unlinkSync(EBAY_COOKIE_FILE); } catch {}
      }
    }

    // ── Full login flow ───────────────────────────────────────────────────────
    console.log('[eBay] Warming up on eBay homepage...');
    await sharedEbayPage.goto('https://www.ebay.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(2000);

    console.log('[eBay] Navigating to signin page...');
    await sharedEbayPage.goto('https://www.ebay.com/signin/', { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('[eBay] Signin page URL:', sharedEbayPage.url());

    await delay(3000);

    // Screenshot and structure dump for diagnostics
    await sharedEbayPage.screenshot({ path: 'ebay-signin-debug.png' }).catch(() => {});
    const pageInfo = await sharedEbayPage.evaluate(() => ({
      url:     location.href,
      title:   document.title,
      inputs:  Array.from(document.querySelectorAll('input')).map(el => ({
        id: el.id, name: el.name, type: el.type, placeholder: el.placeholder
      })),
      frames:  window.frames.length,
      bodySnip: document.body.innerHTML.slice(0, 500)
    })).catch(() => ({}));
    console.log('[eBay] Page info:', JSON.stringify(pageInfo, null, 2));

    const ebayEmail    = process.env.EBAY_EMAIL    || '';
    const ebayPassword = process.env.EBAY_PASSWORD || '';
    console.log('[eBay] EBAY_EMAIL raw:', JSON.stringify(ebayEmail), '| EBAY_PASSWORD raw:', JSON.stringify(ebayPassword));
    if (!ebayEmail || !ebayPassword) throw new Error('EBAY_EMAIL or EBAY_PASSWORD not set in .env');
    console.log('[eBay] Credentials loaded. Email:', ebayEmail);

    // Step 1 — Fill email
    await sharedEbayPage.waitForSelector('#userid', { timeout: 10000, visible: true });
    console.log('[eBay] Filling email (#userid)...');
    await sharedEbayPage.click('#userid');
    await sharedEbayPage.type('#userid', ebayEmail, { delay: 60 });

    // Step 2 — Click Continue (eBay two-step: email first, then password reveals)
    const continueSel = await sharedEbayPage.$('#signin-continue-btn') ? '#signin-continue-btn' : 'button[type="submit"]';
    console.log('[eBay] Clicking continue button (' + continueSel + ')...');
    await sharedEbayPage.click(continueSel);
    await delay(3000);
    console.log('[eBay] URL after continue:', sharedEbayPage.url());

    // Step 3 — Wait for password to become visible
    console.log('[eBay] Waiting for password field to appear...');
    await sharedEbayPage.waitForSelector('#pass', { timeout: 15000, visible: true });
    console.log('[eBay] Filling password (#pass)...');
    await sharedEbayPage.type('#pass', ebayPassword, { delay: 60 });

    await sharedEbayPage.screenshot({ path: 'server/ebay-before-submit.png' }).catch(() => {});

    // Step 4 — Submit
    console.log('[eBay] Submitting sign-in form...');
    await Promise.all([
      sharedEbayPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      sharedEbayPage.keyboard.press('Enter')
    ]);

    const finalUrl = sharedEbayPage.url();
    console.log('[eBay] Post-login URL:', finalUrl);

    if (finalUrl.includes('signin.ebay.com')) {
      console.log('[eBay] Still on signin page — login failed.');
      ebaySessionActive = false;
      return false;
    }

    console.log('[eBay] Login successful.');
    ebaySessionActive = true;

    // Save cookies for future restarts
    try {
      const cookies = await sharedEbayPage.cookies();
      fs.writeFileSync(EBAY_COOKIE_FILE, JSON.stringify(cookies, null, 2));
      console.log('[eBay] Session cookies saved to', EBAY_COOKIE_FILE, `(${cookies.length} cookies)`);
    } catch (e) {
      console.warn('[eBay] Could not save cookies:', e.message);
    }

    return true;
  } catch (err) {
    console.error('[eBay] Login error:', err.message);
    ebaySessionActive = false;
    return false;
  }
}

// ── Fetch prices from eBay sold listing URLs ──────────────────────────────────

async function fetchPricesFromEbayUrls(urls) {
  console.log('[eBay] fetchPricesFromEbayUrls called with', urls.length, 'URL(s):', urls);

  const ok = await loginEbay();
  if (!ok) {
    console.log('[eBay] Not logged in — aborting.');
    return null;
  }

  const collectedPrices = [];

  for (const url of urls) {
    try {
      console.log('[eBay] Navigating to:', url);
      await sharedEbayPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await delay(1000);
      console.log('[eBay] Page URL after nav:', sharedEbayPage.url());

      const price = await sharedEbayPage.evaluate(() => {
        function parsePrice(raw) {
          if (!raw) return null;
          const m = String(raw).replace(/,/g, '').match(/([\d]+\.?\d*)/);
          const v = m ? parseFloat(m[1]) : null;
          return (v && v > 0.5) ? v : null;
        }

        // 1. Structured data attribute
        const itemPropEl = document.querySelector('[itemprop="price"]');
        if (itemPropEl) {
          const v = parsePrice(itemPropEl.getAttribute('content') || itemPropEl.textContent);
          if (v) return v;
        }

        // 2. x-price-primary (modern eBay UI)
        const priceEl = document.querySelector('.x-price-primary span, .x-price-primary');
        if (priceEl) {
          const v = parsePrice(priceEl.textContent);
          if (v) return v;
        }

        // 3. Text scan — look for $X.XX or US $X.XX in first 80 lines
        const lines = document.body.innerText.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 80);
        for (const line of lines) {
          const m = line.replace(/,/g, '').match(/(?:US\s*)?\$\s*([\d]+\.?\d{2})/);
          if (m) {
            const v = parseFloat(m[1]);
            if (v > 0.5) return v;
          }
        }

        return null;
      });

      console.log('[eBay] Price scraped from', url, '→', price);
      if (price) collectedPrices.push(price);
    } catch (err) {
      console.error('[eBay] Error scraping', url, ':', err.message);
    }
  }

  if (collectedPrices.length === 0) {
    console.log('[eBay] No prices found from any URL.');
    return null;
  }

  const average = collectedPrices.reduce((a, b) => a + b, 0) / collectedPrices.length;
  console.log('[eBay] Collected prices:', collectedPrices, '→ average:', average.toFixed(2));

  return {
    recentSale:     Math.round(average * 100) / 100,
    avg30day:       null,
    lastChecked:    new Date().toISOString(),
    cardLadderUrl:  null,
    ebayListingUrl: urls[0] || null,
    sourceUrls:     urls
  };
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

// ── Price extraction — DOM-aware, three strategies, up to 5 prices ───────────

async function extractPrices(page) {
  return page.evaluate(() => {
    function parsePrice(raw) {
      if (!raw) return null;
      const m = String(raw).replace(/,/g, '').match(/\$([\d]+\.?\d*)/);
      const v = m ? parseFloat(m[1]) : null;
      return (v && v > 0.5) ? v : null;
    }

    function dedup(prices) {
      return prices.filter((p, i) =>
        prices.findIndex(q => Math.abs(q - p) < 0.01) === i
      );
    }

    const text = document.body.innerText;
    let salePrices = [];

    // Strategy 1 — CSS selector scan for price-bearing elements
    const priceSelectors = [
      '[class*="price"]',
      '[class*="sale-price"]',
      '[class*="sold-price"]',
      '[class*="transaction"] [class*="amount"]',
      'td[class*="price"]',
      'span[class*="price"]'
    ];
    for (const sel of priceSelectors) {
      if (salePrices.length >= 5) break;
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (salePrices.length >= 5) return;
          const p = parsePrice(el.textContent);
          if (p) salePrices.push(p);
        });
      } catch {}
    }
    salePrices = dedup(salePrices).slice(0, 5);

    // Strategy 2 — innerText line scan if Strategy 1 found nothing
    if (salePrices.length === 0) {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (salePrices.length >= 5) break;
        const p = parsePrice(line);
        if (p) salePrices.push(p);
      }
      salePrices = dedup(salePrices).slice(0, 5);
    }

    const recentSale = salePrices.length > 0
      ? Math.round((salePrices.reduce((a, b) => a + b, 0) / salePrices.length) * 100) / 100
      : null;

    // Strategy 3 — avg / 30-day label scan
    let avg30day = null;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
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

    return {
      recentSale,
      avg30day,
      saleCount:      salePrices.length,
      allPricesFound: salePrices,
      pagePreview:    text.slice(0, 1200)
    };
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

async function fetchCardLadderData(playerName, year, brand, cardSet, isGraded, grade, options = {}) {
  const { manualCardLadderUrl, ebayUrls } = options;

  // If locked eBay URLs provided, skip Card Ladder entirely
  if (ebayUrls && ebayUrls.length > 0) {
    console.log('[CardLadder] eBay URLs provided — delegating to fetchPricesFromEbayUrls');
    return fetchPricesFromEbayUrls(ebayUrls);
  }

  try {
    const page = await getLoggedInPage();
    if (!page) return null;

    let searchUrl;
    if (manualCardLadderUrl) {
      searchUrl = manualCardLadderUrl;
      console.log('[CardLadder] Using manual Card Ladder URL:', searchUrl);
    } else {
      const queryString = buildQuery(playerName, cardSet, year, isGraded, grade);
      if (!queryString) { console.log('[CardLadder] Empty query.'); return null; }
      searchUrl = `${SALES_BASE}?sort=date&direction=desc&q=${encodeURIComponent(queryString)}`;
      console.log('[CardLadder] Navigating to:', searchUrl);
    }

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('[CardLadder] Search page URL:', page.url());

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
      if (manualCardLadderUrl) {
        console.log('[CardLadder] Empty-state heuristic fired on a locked URL — ignoring and continuing to extraction.');
      } else {
        console.log('[CardLadder] No results — returning null.');
        return null;
      }
    }

    const prices = await extractPrices(page);
    console.log('[CardLadder] recentSale:', prices.recentSale, '| avg30day:', prices.avg30day,
                '| saleCount:', prices.saleCount, '| allPricesFound:', prices.allPricesFound);

    if (!prices.recentSale && !prices.avg30day) {
      console.log('[CardLadder] No price extracted. allPricesFound:', prices.allPricesFound);
      console.log('[CardLadder] Page preview:\n' + prices.pagePreview);
      return null;
    }

    console.log('[CardLadder] Extraction succeeded — saleCount:', prices.saleCount,
                '| allPricesFound:', prices.allPricesFound, '| recentSale:', prices.recentSale);

    const ebayListingUrl = await page.evaluate(() => {
      const saleIdParam = new URLSearchParams(location.search).get('saleId');
      if (saleIdParam) {
        const m = saleIdParam.match(/ebay-(\d+)/);
        if (m) return `https://www.ebay.com/itm/${m[1]}`;
      }
      const anchors = Array.from(document.querySelectorAll('a[href*="ebay.com/itm/"]'));
      if (anchors.length) {
        const m = anchors[0].href.match(/ebay\.com\/itm\/(\d+)/);
        if (m) return `https://www.ebay.com/itm/${m[1]}`;
      }
      const m2 = document.body.innerHTML.match(/ebay-(\d{10,})/);
      if (m2) return `https://www.ebay.com/itm/${m2[1]}`;
      return null;
    }).catch(() => null);

    console.log('[CardLadder] ebayListingUrl:', ebayListingUrl);

    return {
      recentSale:     prices.recentSale,
      avg30day:       prices.avg30day,
      lastChecked:    new Date().toISOString(),
      cardLadderUrl:  searchUrl,
      ebayListingUrl: ebayListingUrl ?? null
    };

  } catch (err) {
    console.error('[CardLadder] Error:', err.message);
    sessionActive = false;
    return null;
  }
}

async function closeBrowser() {
  if (sharedEbayPage) {
    console.log('[CardLadder] Closing eBay page...');
    try { await sharedEbayPage.close(); } catch {}
    sharedEbayPage    = null;
    ebaySessionActive = false;
  }
  if (sharedBrowser) {
    console.log('[CardLadder] Closing shared browser...');
    try { await sharedBrowser.close(); } catch {}
    sharedBrowser = null;
    sharedPage    = null;
    sessionActive = false;
    console.log('[CardLadder] Browser closed.');
  }
}

module.exports = { fetchCardLadderData, fetchPricesFromEbayUrls, loginEbay, closeBrowser };
