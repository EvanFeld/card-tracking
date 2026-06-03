import { useState, useEffect } from 'react';

function SectionHead({ label }) {
  return (
    <div className="text-gray-600 text-[11px] uppercase tracking-widest font-medium pb-2 border-b border-gray-800 mb-4">
      {label}
    </div>
  );
}

function fmtROI(val) {
  if (val == null) return '—';
  const sign = val >= 0 ? '+' : '';
  return (
    <span className={val >= 0 ? 'text-emerald-400' : 'text-red-400'}>
      {sign}${Math.abs(val).toFixed(2)}
    </span>
  );
}

function fmtMoney(val) {
  if (val == null) return '—';
  return `$${Number(val).toFixed(2)}`;
}

const VERDICT_CONFIG = {
  send:    { label: '✅ Send',    cls: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
  inspect: { label: '🔍 Inspect', cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30'   },
  check:   { label: '⚠️ Check',   cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'   },
  skip:    { label: '❌ Skip',    cls: 'bg-gray-700/50 text-gray-500 border border-gray-700/40'          },
};

const VERDICT_ORDER = { send: 0, inspect: 1, check: 2, skip: 3 };

const FILTER_PILLS = [
  { key: 'all',     label: 'All'         },
  { key: 'send',    label: '✅ Send'      },
  { key: 'inspect', label: '🔍 Inspect'  },
  { key: 'check',   label: '⚠️ Check'    },
  { key: 'skip',    label: '❌ Skip'      },
];

function AttributeBadges({ card }) {
  const badges = [];
  if (card.is_auto)    badges.push({ label: 'AU',  cls: 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30' });
  if (card.is_mem)     badges.push({ label: 'MEM', cls: 'bg-purple-400/15 text-purple-400 border border-purple-400/30' });
  if (card.is_ssp)     badges.push({ label: 'SSP', cls: 'bg-orange-400/15 text-orange-400 border border-orange-400/30' });
  if (card.is_rookie)  badges.push({ label: 'RC',  cls: 'bg-emerald-400/15 text-emerald-400 border border-emerald-400/30' });
  if (card.is_insert)  badges.push({ label: 'INS', cls: 'bg-teal-400/15 text-teal-400 border border-teal-400/30' });
  if (card.serial_number) badges.push({ label: `/${card.serial_number}`, cls: 'bg-orange-400/15 text-orange-400 border border-orange-400/30' });
  if (badges.length === 0) return <span className="text-gray-700">—</span>;
  return (
    <div className="flex gap-1 flex-wrap">
      {badges.map(b => (
        <span key={b.label} className={`text-[10px] font-bold px-1 py-0.5 rounded ${b.cls}`}>{b.label}</span>
      ))}
    </div>
  );
}

function ScoreBadge({ score }) {
  const cls = score >= 40 ? 'text-emerald-400' : score >= 25 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`font-mono font-bold ${cls}`}>{score}</span>;
}

function SignalPills({ flags }) {
  if (!flags?.length) return <span className="text-gray-700">—</span>;
  const shown = flags.slice(0, 2);
  const extra = flags.length - 2;
  const COLOR_CLS = {
    yellow: 'bg-yellow-400/15 text-yellow-400',
    green:  'bg-emerald-400/15 text-emerald-400',
    blue:   'bg-blue-400/15 text-blue-400',
    red:    'bg-red-400/15 text-red-400',
    purple: 'bg-purple-400/15 text-purple-400',
  };
  return (
    <div className="flex gap-1 flex-wrap items-center">
      {shown.map(f => (
        <span key={f.key} className={`text-[11px] px-1 py-0.5 rounded ${COLOR_CLS[f.color]}`} title={f.label}>
          {f.emoji}
        </span>
      ))}
      {extra > 0 && <span className="text-gray-600 text-[10px]">+{extra}</span>}
    </div>
  );
}

export default function GradeAdvisorView() {
  const [gradingFee, setGradingFee] = useState(19);
  const [analyzing,  setAnalyzing]  = useState(false);
  const [results,    setResults]    = useState(null);
  const [filter,     setFilter]     = useState('all');

  const [queue,        setQueue]        = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);

  useEffect(() => { loadQueue(); }, []);

  const loadQueue = () => {
    setQueueLoading(true);
    fetch('/api/grade-advisor/queue')
      .then(r => r.json())
      .then(setQueue)
      .catch(() => setQueue([]))
      .finally(() => setQueueLoading(false));
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res  = await fetch(`/api/grade-advisor/analyze?fee=${gradingFee}`);
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error('[grade-advisor] analyze error:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleQueue = async (card) => {
    await fetch('/api/grade-advisor/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id:      card.id,
        verdict:      card.verdict,
        roi_best:     card.roi_best,
        roi_realistic: card.roi_realistic,
        score:        card.score,
      }),
    });
    setResults(prev => prev ? prev.map(r => r.id === card.id ? { ...r, in_queue: true } : r) : prev);
    loadQueue();
  };

  const handleDequeue = async (card) => {
    await fetch(`/api/grade-advisor/queue/${card.queue_id}`, { method: 'DELETE' });
    setResults(prev => prev ? prev.map(r => r.id === card.id ? { ...r, in_queue: false, queue_id: null } : r) : prev);
    loadQueue();
  };

  const handleRemoveFromQueue = async (queueId) => {
    await fetch(`/api/grade-advisor/queue/${queueId}`, { method: 'DELETE' });
    loadQueue();
    setResults(prev => prev ? prev.map(r => r.queue_id === queueId ? { ...r, in_queue: false, queue_id: null } : r) : prev);
  };

  const filtered = results
    ? (filter === 'all' ? results : results.filter(r => r.verdict === filter))
    : [];

  // Queue summary calculations
  const queueCost    = queue.length * gradingFee;
  const queueBest    = queue.reduce((s, r) => s + (r.roi_best    ?? 0), 0) + queueCost;
  const queueReal    = queue.reduce((s, r) => s + (r.roi_realistic ?? 0), 0) + queueCost;

  return (
    <div className="p-5 max-w-[1400px] mx-auto">

      {/* ── Analyzer ── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-gray-200 font-semibold text-base">Grade Advisor</h2>
            <p className="text-gray-700 text-xs mt-0.5">Score raw cards in your collection for grading ROI.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-gray-600 text-xs">Fee:</span>
              <span className="text-gray-600 text-xs">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={gradingFee}
                onChange={e => setGradingFee(parseFloat(e.target.value) || 0)}
                className="bg-[#0d1120] border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 font-mono w-16 focus:outline-none focus:border-cyan-500"
              />
              <span className="text-gray-700 text-xs">/card</span>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex items-center gap-2 bg-cyan-700/30 hover:bg-cyan-700/50 disabled:opacity-50 border border-cyan-600/40 text-cyan-400 text-sm px-4 py-2 rounded transition-colors font-medium"
            >
              {analyzing ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing…
                </>
              ) : '🔬 Analyze Collection'}
            </button>
          </div>
        </div>

        {results === null && !analyzing && (
          <div className="bg-[#161b27] border border-gray-800 rounded-lg px-6 py-12 text-center">
            <div className="text-gray-700 text-sm">Click Analyze Collection to score your raw cards.</div>
          </div>
        )}

        {results !== null && (
          <>
            {/* Filter pills */}
            <div className="flex gap-2 mb-3 flex-wrap">
              {FILTER_PILLS.map(p => {
                const count = p.key === 'all' ? results.length : results.filter(r => r.verdict === p.key).length;
                return (
                  <button
                    key={p.key}
                    onClick={() => setFilter(p.key)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      filter === p.key
                        ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
                        : 'border-gray-700 text-gray-600 hover:text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    {p.label} <span className="ml-1 opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="bg-[#161b27] border border-gray-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[1200px]">
                  <thead>
                    <tr className="bg-[#0f1117] border-b border-gray-800 text-left">
                      {['Player', 'Year', 'Brand / Set', 'Attributes', 'Condition', 'Score', 'Est PSA 10', 'Est PSA 9', 'ROI Best', 'ROI Realistic', 'Signals', 'Verdict', 'Action'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-gray-600 text-xs uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={13} className="px-4 py-10 text-center text-gray-700 text-sm">No cards match this filter.</td>
                      </tr>
                    )}
                    {filtered.map((card, i) => {
                      const vc = VERDICT_CONFIG[card.verdict];
                      const rowBg = i % 2 === 0 ? 'bg-[#0f1117]' : 'bg-[#111620]';
                      return (
                        <tr key={card.id} className={`${rowBg} border-b border-gray-900`}>
                          <td className="px-3 py-2 text-gray-100 font-medium whitespace-nowrap">{card.player_name}</td>
                          <td className="px-3 py-2 text-gray-500 font-mono text-right whitespace-nowrap">{card.year || '—'}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs max-w-[160px] truncate" title={[card.brand, card.card_set].filter(Boolean).join(' · ')}>
                            {[card.brand, card.card_set].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="px-3 py-2"><AttributeBadges card={card} /></td>
                          <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{card.raw_condition || '—'}</td>
                          <td className="px-3 py-2 text-center"><ScoreBadge score={card.score} /></td>
                          <td className="px-3 py-2 text-gray-300 font-mono text-right whitespace-nowrap">{fmtMoney(card.est_psa10)}</td>
                          <td className="px-3 py-2 text-gray-400 font-mono text-right whitespace-nowrap">{fmtMoney(card.est_psa9)}</td>
                          <td className="px-3 py-2 font-mono text-right whitespace-nowrap">{fmtROI(card.roi_best)}</td>
                          <td className="px-3 py-2 font-mono text-right whitespace-nowrap">{fmtROI(card.roi_realistic)}</td>
                          <td className="px-3 py-2"><SignalPills flags={card.flags} /></td>
                          <td className="px-3 py-2">
                            <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap ${vc.cls}`}>
                              {vc.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {card.in_queue ? (
                              <button
                                onClick={() => handleDequeue(card)}
                                className="text-[11px] bg-cyan-600/20 border border-cyan-600/40 text-cyan-400 px-2 py-0.5 rounded hover:bg-cyan-600/30 transition-colors"
                              >
                                ✓ In Queue
                              </button>
                            ) : card.verdict !== 'skip' ? (
                              <button
                                onClick={() => handleQueue(card)}
                                className="text-[11px] bg-gray-700/40 border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 px-2 py-0.5 rounded transition-colors"
                              >
                                + Queue
                              </button>
                            ) : (
                              <button
                                onClick={() => handleQueue(card)}
                                className="text-[11px] text-gray-800 hover:text-gray-600 px-2 py-0.5 rounded transition-colors"
                              >
                                + Queue
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length > 0 && (
                <div className="px-4 py-2 text-xs text-gray-700 border-t border-gray-900">
                  {filtered.length} card{filtered.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Divider ── */}
      <div className="border-t border-gray-800 mb-8" />

      {/* ── Submission Queue ── */}
      <section>
        <SectionHead label="Submission Queue" />

        {/* Summary strip */}
        {queue.length > 0 && (
          <div className="flex gap-6 bg-[#0f1117] border border-gray-800 rounded-lg px-5 py-3 mb-4 flex-wrap">
            <div>
              <span className="text-gray-600 text-xs uppercase tracking-wider">Cards</span>
              <div className="text-gray-200 font-mono font-semibold">{queue.length}</div>
            </div>
            <div>
              <span className="text-gray-600 text-xs uppercase tracking-wider">Est Grading Cost</span>
              <div className="text-gray-400 font-mono">${(queue.length * gradingFee).toFixed(2)}</div>
            </div>
            <div>
              <span className="text-gray-600 text-xs uppercase tracking-wider">Best Case Return</span>
              <div className={`font-mono font-semibold ${queueBest >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {queueBest >= 0 ? '+' : ''}${Math.abs(queueBest).toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-gray-600 text-xs uppercase tracking-wider">Realistic Return</span>
              <div className={`font-mono font-semibold ${queueReal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {queueReal >= 0 ? '+' : ''}${Math.abs(queueReal).toFixed(2)}
              </div>
            </div>
          </div>
        )}

        <div className="bg-[#161b27] border border-gray-800 rounded-lg overflow-hidden">
          {queueLoading ? (
            <div className="px-4 py-10 text-center text-gray-700 text-sm">Loading queue…</div>
          ) : queue.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-700 text-sm">
              No cards queued yet — run the analyzer and add cards to build your submission batch.
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#0f1117] border-b border-gray-800 text-left">
                  {['Player', 'Set', 'Condition', 'Your Notes', 'Est PSA 10', 'ROI (realistic)', 'Verdict', ''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-gray-600 text-xs uppercase tracking-wider font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map((item, i) => {
                  const vc = VERDICT_CONFIG[item.verdict] || VERDICT_CONFIG.check;
                  return (
                    <tr key={item.id} className={`border-b border-gray-900 ${i % 2 === 0 ? 'bg-[#0f1117]' : 'bg-[#111620]'}`}>
                      <td className="px-3 py-2 text-gray-100 font-medium whitespace-nowrap">{item.player_name}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs max-w-[180px] truncate" title={[item.brand, item.card_set].filter(Boolean).join(' · ')}>
                        {[item.brand, item.card_set].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{item.raw_condition || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs italic">{item.notes || '—'}</td>
                      <td className="px-3 py-2 text-gray-300 font-mono text-right whitespace-nowrap">
                        {item.roi_best != null ? fmtMoney((item.roi_best + (item.current_value || 0) + gradingFee)) : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-right whitespace-nowrap">{fmtROI(item.roi_realistic)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap ${vc.cls}`}>
                          {vc.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleRemoveFromQueue(item.id)}
                          className="text-xs text-gray-800 hover:text-red-500 transition-colors"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
