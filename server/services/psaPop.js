const puppeteer = require('puppeteer');

// PSA Pop Report scraper
// Uses headless:'new' (Chrome headless shell) to bypass Cloudflare on psacard.com.
// The search form calls a JSONP endpoint on collectorsuniverse.com for autocomplete;
// once a result row appears in #tableResults, we click "Show Population" which
// calls /pop/getpopulationjson (not CF-protected) and renders counts in the DOM.

const PSA_SEARCH = 'https://www.psacard.com/pop/search';
const PSA_POP_JSON = 'https://www.psacard.com/pop/getpopulationjson';

function buildSearchQuery(playerName, year, brand, cardSet, cardNumber) {
  const parts = [playerName, year, brand, cardNumber].filter(Boolean);
  return parts.join(' ');
}

async function fetchPsaPop(playerName, year, brand, cardSet, cardNumber) {
  const query = buildSearchQuery(playerName, year, brand, cardSet, cardNumber);
  const searchUrl = `${PSA_SEARCH}?term=${encodeURIComponent(query)}`;
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1440, height: 900 });

    // Capture pop JSON responses
    let popJsonData = null;
    page.on('response', async r => {
      if (r.url().includes('getpopulationjson')) {
        try { popJsonData = await r.json().catch(() => null); } catch {}
      }
    });

    await page.goto(PSA_SEARCH, { waitUntil: 'networkidle2', timeout: 30000 });

    // Set the search term and submit
    await page.waitForSelector('#term', { timeout: 8000 });
    await page.evaluate(q => { document.getElementById('term').value = q; }, query);
    await page.click('#btnfind');

    // Wait for results to appear (or no-results state)
    let hasResults = false;
    try {
      await page.waitForFunction(
        () => {
          const rows = document.querySelectorAll('#tableResults tbody tr');
          return rows.length > 1 ||
            (rows.length === 1 && !rows[0].innerText.includes('No information'));
        },
        { timeout: 15000 }
      );
      hasResults = true;
    } catch {
      // No results within timeout
    }

    if (!hasResults) {
      console.log(`[psaPop] No results for query: ${query}`);
      return null;
    }

    // Get the first result row — extract spec data attributes for pop lookup
    const firstRowData = await page.evaluate(() => {
      const row = document.querySelector('#tableResults tbody tr');
      if (!row) return null;
      const showPopBtn = row.querySelector('.show-pop') || row.querySelector('a[data-spec]');
      const specId = showPopBtn?.getAttribute('data-spec') || showPopBtn?.getAttribute('data-id');
      const cardName = row.querySelector('td:first-child')?.innerText?.trim() ||
                       row.innerText.split('\t')[0]?.trim();
      return { specId, cardName, rowText: row.innerText.slice(0, 200) };
    });

    console.log(`[psaPop] First row: ${JSON.stringify(firstRowData)}`);

    if (!firstRowData?.specId && !firstRowData?.cardName) {
      console.log(`[psaPop] Could not extract specId from result row`);
    }

    // Click "Show Population" on the first result row
    const showPopClicked = await page.evaluate(() => {
      const btn = document.querySelector('#tableResults tbody tr .show-pop') ||
                  document.querySelector('#tableResults tbody tr a[data-spec]') ||
                  document.querySelector('#tableResults tbody tr a[href*="pop"]');
      if (btn) { btn.click(); return true; }
      return false;
    });

    if (showPopClicked) {
      // Wait for population data to load in DOM
      try {
        await page.waitForFunction(
          () => {
            const cells = document.querySelectorAll('#tableResults .grade-count, [class*="pop-count"], td[data-grade]');
            return cells.length > 0;
          },
          { timeout: 8000 }
        );
      } catch {
        // Pop might load differently — wait briefly and check
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // If we got the JSON via network interception, use it
    if (popJsonData?.PSAData) {
      return extractFromPopJson(popJsonData, firstRowData?.cardName, searchUrl);
    }

    // Otherwise read from DOM — pop data renders inline after clicking Show Population
    const domPop = await page.evaluate(() => {
      // Look for grade count cells that PSA renders in expanded rows
      const gradeRows = Array.from(document.querySelectorAll(
        '[class*="pop-data"] tr, .pop-details tr, #tableResults .child tr, tr.shown + tr tr'
      ));

      let pop10 = null, pop9 = null, popTotal = null;

      for (const row of gradeRows) {
        const cells = Array.from(row.querySelectorAll('td, th'));
        const text = row.innerText.toLowerCase();
        if (text.includes('10') && cells.length >= 2) {
          const val = parseInt(cells[cells.length - 1]?.innerText?.replace(/,/g, ''), 10);
          if (!isNaN(val)) pop10 = val;
        }
        if (text.includes('9') && !text.includes('9.5') && cells.length >= 2) {
          const val = parseInt(cells[cells.length - 1]?.innerText?.replace(/,/g, ''), 10);
          if (!isNaN(val)) pop9 = val;
        }
      }

      // Also scan for "Total" row
      const allRows = Array.from(document.querySelectorAll('#tableResults tr, .pop-table tr'));
      for (const row of allRows) {
        if (row.innerText.toLowerCase().includes('total')) {
          const lastCell = Array.from(row.querySelectorAll('td')).pop();
          const val = parseInt(lastCell?.innerText?.replace(/,/g, ''), 10);
          if (!isNaN(val) && val > 0) { popTotal = val; break; }
        }
      }

      // Fallback: scan all table cells for grade patterns
      if (pop10 === null) {
        const allCells = Array.from(document.querySelectorAll('#tableResults td'));
        for (let i = 0; i < allCells.length - 1; i++) {
          const label = allCells[i].innerText.trim();
          const nextVal = parseInt(allCells[i + 1]?.innerText?.replace(/,/g, ''), 10);
          if (label === '10' && !isNaN(nextVal)) pop10 = nextVal;
          if (label === '9' && !isNaN(nextVal)) pop9 = nextVal;
          if (label.toLowerCase().includes('total') && !isNaN(nextVal)) popTotal = nextVal;
        }
      }

      return { pop10, pop9, popTotal };
    });

    if (domPop.pop10 !== null || domPop.popTotal !== null) {
      return {
        pop10: domPop.pop10 ?? 0,
        pop9:  domPop.pop9  ?? 0,
        popTotal: domPop.popTotal ?? ((domPop.pop10 ?? 0) + (domPop.pop9 ?? 0)),
        cardName: firstRowData?.cardName || query,
        url: searchUrl,
      };
    }

    console.log(`[psaPop] Could not extract pop counts from DOM for: ${query}`);
    return null;

  } catch (err) {
    console.error('[psaPop] Error:', err.message);
    return null;
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

function extractFromPopJson(data, cardName, url) {
  const psa = data.PSAData;
  if (!psa) return null;
  // PSAData is typically an array of grade objects: { Grade, Count }
  const grades = Array.isArray(psa) ? psa : Object.values(psa);
  let pop10 = 0, pop9 = 0, popTotal = 0;
  for (const g of grades) {
    const grade = String(g.Grade || g.grade || '').trim();
    const count = parseInt(g.Count || g.count || 0, 10) || 0;
    popTotal += count;
    if (grade === '10') pop10 = count;
    if (grade === '9')  pop9  = count;
  }
  return { pop10, pop9, popTotal, cardName: cardName || '', url };
}

module.exports = { fetchPsaPop };
