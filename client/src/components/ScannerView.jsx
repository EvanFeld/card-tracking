import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

function SectionHead({ label }) {
  return (
    <div className="text-gray-600 text-[11px] uppercase tracking-widest font-medium pb-2 border-b border-gray-800 mb-4">
      {label}
    </div>
  );
}

function StatusIcon({ status }) {
  if (status === 'success')   return <span className="text-emerald-400">✓</span>;
  if (status === 'not_found') return <span className="text-yellow-500">—</span>;
  return <span className="text-red-400">✗</span>;
}

export default function ScannerView() {
  // ── Bulk Refresh ──────────────────────────────────────────────────────────────
  const [scanning, setScanning]       = useState(false);
  const [progress, setProgress]       = useState(0);
  const [logEntries, setLogEntries]   = useState([]);
  const [summary, setSummary]         = useState(null);
  const logRef                        = useRef(null);

  // ── Opportunity Scan ──────────────────────────────────────────────────────────
  const [opLoading, setOpLoading]     = useState(false);
  const [opResults, setOpResults]     = useState(null);
  const [opError, setOpError]         = useState(null);

  // ── Market Intelligence ───────────────────────────────────────────────────────
  const [miLoading, setMiLoading]     = useState(false);
  const [miResults, setMiResults]     = useState(null);
  const [miError, setMiError]         = useState(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logEntries]);

  const handleBulkRefresh = () => {
    if (scanning) return;
    setScanning(true);
    setProgress(0);
    setLogEntries([]);
    setSummary(null);

    const es = new EventSource('/api/scanner/bulk-refresh');

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.done) {
        setSummary(data);
        setProgress(100);
        setScanning(false);
        es.close();
        return;
      }

      setProgress(Math.round((data.completed / data.total) * 100));
      setLogEntries(prev => [...prev, data]);
    };

    es.onerror = () => {
      setScanning(false);
      es.close();
    };
  };

  const handleMarketIntelligence = async () => {
    setMiLoading(true);
    setMiError(null);
    try {
      const res = await axios.get('/api/scanner/portfolio-intelligence');
      setMiResults(res.data);
    } catch {
      setMiError('Failed to fetch market intelligence.');
    } finally {
      setMiLoading(false);
    }
  };

  const handleOpportunityScan = async () => {
    setOpLoading(true);
    setOpError(null);
    try {
      const res = await axios.get('/api/scanner/opportunity-scan');
      setOpResults(res.data);
    } catch {
      setOpError('Failed to fetch opportunities.');
    } finally {
      setOpLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-10">

      {/* ── Section 1: Bulk Price Refresh ── */}
      <section>
        <SectionHead label="Bulk Price Refresh" />
        <p className="text-gray-600 text-xs mb-4">
          Refreshes all owned cards whose prices haven't been checked in the last 24 hours.
        </p>

        <button
          onClick={handleBulkRefresh}
          disabled={scanning}
          className="flex items-center gap-2 text-sm bg-blue-600/20 hover:bg-blue-600/40 disabled:opacity-50 disabled:cursor-not-allowed border border-blue-600/30 text-blue-400 px-4 py-2 rounded transition-colors"
        >
          {scanning ? (
            <>
              <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Refreshing…
            </>
          ) : (
            <>⚡ Refresh All Prices</>
          )}
        </button>

        {(scanning || logEntries.length > 0) && (
          <div className="mt-4 space-y-3">
            {/* Progress bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-gray-600 text-xs font-mono w-10 text-right">{progress}%</span>
            </div>

            {/* Live log */}
            <div
              ref={logRef}
              className="bg-[#0d1120] border border-gray-800 rounded-lg p-3 max-h-64 overflow-y-auto space-y-1"
            >
              {logEntries.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-xs font-mono">
                  <StatusIcon status={entry.status} />
                  <span className="text-gray-300 flex-1 truncate">{entry.playerName}</span>
                  {entry.status === 'success' && entry.newValue != null && (
                    <span className="text-emerald-400">${Number(entry.newValue).toFixed(2)}</span>
                  )}
                  {entry.status === 'not_found' && (
                    <span className="text-yellow-600">not found</span>
                  )}
                  {entry.status === 'error' && (
                    <span className="text-red-500">error</span>
                  )}
                  <div className="flex items-center gap-1 ml-1">
                    {entry.cardLadderUrl && (
                      <a href={entry.cardLadderUrl} target="_blank" rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-400 text-[10px] underline">CL</a>
                    )}
                    {entry.ebayListingUrl && (
                      <a href={entry.ebayListingUrl} target="_blank" rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-400 text-[10px] underline">eBay</a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {summary && (
              <div className="text-xs bg-gray-900/60 border border-gray-800 rounded px-4 py-2 text-gray-400">
                Done — <span className="text-emerald-400">{summary.succeeded} updated</span>
                {summary.notFound > 0 && <>, <span className="text-yellow-500">{summary.notFound} not found</span></>}
                {summary.errors > 0 && <>, <span className="text-red-400">{summary.errors} errors</span></>}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Section 2: Market Intelligence ── */}
      <section>
        <SectionHead label="Market Intelligence" />
        <p className="text-gray-600 text-xs mb-4">
          Scans owned players against Card Ladder index data and flags volume spikes, dip buys, breakouts, sell pressure, and undervalued cards.
        </p>

        <button
          onClick={handleMarketIntelligence}
          disabled={miLoading}
          className="flex items-center gap-2 text-sm bg-purple-600/20 hover:bg-purple-600/40 disabled:opacity-50 disabled:cursor-not-allowed border border-purple-600/30 text-purple-400 px-4 py-2 rounded transition-colors"
        >
          {miLoading ? (
            <>
              <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Scanning…
            </>
          ) : (
            <>🧠 Scan Portfolio</>
          )}
        </button>

        {miError && (
          <div className="mt-3 text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded px-3 py-2">
            {miError}
          </div>
        )}

        {miResults !== null && (
          <div className="mt-4">
            {miResults.length === 0 ? (
              <div className="bg-[#0d1120] border border-gray-800 rounded-lg px-4 py-8 text-center">
                <div className="text-gray-700 text-sm">No signals detected</div>
                <div className="text-gray-800 text-xs mt-1">All owned players are within normal market ranges</div>
              </div>
            ) : (
              <div className="bg-[#0d1120] border border-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-600 uppercase tracking-widest text-[10px]">
                      <th className="text-left px-4 py-2.5">Player</th>
                      <th className="text-right px-3 py-2.5">Index</th>
                      <th className="text-right px-3 py-2.5">Weekly</th>
                      <th className="text-right px-3 py-2.5">Monthly</th>
                      <th className="text-right px-3 py-2.5">Sales</th>
                      <th className="text-left px-3 py-2.5">Signals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {miResults.map((row, i) => {
                      const flagColors = {
                        yellow: 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30',
                        green:  'bg-emerald-400/15 text-emerald-400 border border-emerald-400/30',
                        blue:   'bg-blue-400/15 text-blue-400 border border-blue-400/30',
                        red:    'bg-red-400/15 text-red-400 border border-red-400/30',
                        purple: 'bg-purple-400/15 text-purple-400 border border-purple-400/30',
                      };
                      return (
                        <tr key={i} className={`border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors ${i === miResults.length - 1 ? 'border-b-0' : ''}`}>
                          <td className="px-4 py-3 text-gray-200 font-medium">
                            {row.player}
                            {row.category && <span className="ml-2 text-gray-600 text-[10px] capitalize">{row.category}</span>}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-300 font-mono">{row.currentIndex}</td>
                          <td className={`px-3 py-3 text-right font-mono ${row.weekly >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {row.weekly >= 0 ? '+' : ''}{(row.weekly * 100).toFixed(1)}%
                          </td>
                          <td className={`px-3 py-3 text-right font-mono ${row.monthly >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {row.monthly >= 0 ? '+' : ''}{(row.monthly * 100).toFixed(1)}%
                          </td>
                          <td className="px-3 py-3 text-right text-gray-500 font-mono">
                            {row.dailySales}
                            {row.avg30Sales > 0 && (
                              <span className="text-gray-700 text-[10px] ml-1">/{row.avg30Sales}</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {row.flags.map(flag => (
                                <span key={flag.key} className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${flagColors[flag.color]}`}>
                                  {flag.emoji} {flag.label}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Section 3: Opportunity Scanner ── */}
      <section>
        <SectionHead label="Opportunity Scanner" />
        <p className="text-gray-600 text-xs mb-4">
          Finds owned cards trading at least 20% below their recorded peak value.
        </p>

        <button
          onClick={handleOpportunityScan}
          disabled={opLoading}
          className="flex items-center gap-2 text-sm bg-blue-600/20 hover:bg-blue-600/40 disabled:opacity-50 disabled:cursor-not-allowed border border-blue-600/30 text-blue-400 px-4 py-2 rounded transition-colors"
        >
          {opLoading ? (
            <>
              <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Scanning…
            </>
          ) : (
            <>⚡ Scan for Opportunities</>
          )}
        </button>

        {opError && (
          <div className="mt-3 text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded px-3 py-2">
            {opError}
          </div>
        )}

        {opResults !== null && (
          <div className="mt-4">
            {opResults.length === 0 ? (
              <div className="bg-[#0d1120] border border-gray-800 rounded-lg px-4 py-8 text-center">
                <div className="text-gray-700 text-sm">No opportunities found</div>
                <div className="text-gray-800 text-xs mt-1">All cards are at or near their peak values</div>
              </div>
            ) : (
              <div className="bg-[#0d1120] border border-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-600 uppercase tracking-widest text-[10px]">
                      <th className="text-left px-4 py-2.5">Player</th>
                      <th className="text-left px-3 py-2.5">Brand / Set</th>
                      <th className="text-left px-3 py-2.5">Grade</th>
                      <th className="text-right px-3 py-2.5">Current</th>
                      <th className="text-right px-3 py-2.5">Peak</th>
                      <th className="text-right px-3 py-2.5">Drop</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {opResults.map((row, i) => (
                      <tr key={row.id}
                        className={`border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors ${i === opResults.length - 1 ? 'border-b-0' : ''}`}
                      >
                        <td className="px-4 py-2.5 text-gray-200 font-medium">{row.player_name}</td>
                        <td className="px-3 py-2.5 text-gray-500">
                          {[row.brand, row.card_set].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-400 font-mono">
                          {row.grading_company && row.grade
                            ? `${row.grading_company} ${row.grade}`
                            : row.grade || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-300 font-mono">
                          ${Number(row.current_value).toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-500 font-mono">
                          ${Number(row.peak_value).toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-red-400 font-mono font-semibold">
                          -{row.drop_pct}%
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {row.card_ladder_url ? (
                            <a href={row.card_ladder_url} target="_blank" rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-400 underline">
                              View →
                            </a>
                          ) : (
                            <span className="text-gray-700">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
