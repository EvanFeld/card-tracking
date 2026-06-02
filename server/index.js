require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const cardsRouter = require('./routes/cards');
const ledgerRouter = require('./routes/ledger');
const watchlistRouter = require('./routes/watchlist');
const pricesRouter = require('./routes/prices');
const priceHistoryRouter = require('./routes/priceHistory');
const analyticsRouter   = require('./routes/analytics');
const scannerRouter     = require('./routes/scanner');
const { closeBrowser } = require('./services/cardladder');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/cards', cardsRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/price-history', priceHistoryRouter);
app.use('/api/analytics',    analyticsRouter);
app.use('/api/scanner',      scannerRouter);
app.use('/api/player-index', require('./routes/playerIndex'));

const server = app.listen(PORT, () => {
  console.log(`CardTracker API running on http://localhost:${PORT}`);
});

async function shutdown(signal) {
  console.log(`\n[server] ${signal} received — shutting down...`);
  await closeBrowser();
  server.close(() => {
    console.log('[server] HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
