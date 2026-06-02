import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import CollectionView from './components/CollectionView';
import LedgerView from './components/LedgerView';
import WatchlistView from './components/WatchlistView';
import AnalyticsView from './components/AnalyticsView';
import ScannerView from './components/ScannerView';
import useCardStore from './store/cardStore';

export default function App() {
  const [page, setPage] = useState('collection');
  const { fetchCards, fetchSummary } = useCardStore();

  useEffect(() => {
    fetchCards();
    fetchSummary();
  }, []);

  return (
    <Layout page={page} setPage={setPage}>
      {page === 'collection' && <CollectionView />}
      {page === 'ledger'     && <LedgerView />}
      {page === 'watchlist'  && <WatchlistView />}
      {page === 'analytics'  && <AnalyticsView />}
      {page === 'scanner'    && <ScannerView />}
    </Layout>
  );
}
