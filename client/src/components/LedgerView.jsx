import { useState, useEffect } from 'react';
import axios from 'axios';

function fmtMoney(val) {
  if (val === null || val === undefined) return '—';
  return `$${Number(val).toFixed(2)}`;
}

function plStyle(val) {
  if (val === null || val === undefined) return { text: '—', cls: 'text-gray-600' };
  const sign = val >= 0 ? '+' : '';
  return {
    text: `${sign}$${Math.abs(val).toFixed(2)}`,
    cls:  val >= 0 ? 'text-emerald-400' : 'text-red-400'
  };
}

export default function LedgerView() {
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get('/api/ledger'),
      axios.get('/api/ledger/summary')
    ]).then(([e, s]) => {
      setEntries(e.data);
      setSummary(s.data);
    }).finally(() => setLoading(false));
  }, []);

  const summaryCards = summary ? [
    { label: 'Total Sales',    value: summary.total_sales,  fmt: v => v,                                         cls: 'text-gray-300' },
    { label: 'Total Revenue',  value: summary.total_revenue, fmt: fmtMoney,                                       cls: 'text-blue-400' },
    { label: 'Total Profit',   value: summary.total_profit, fmt: v => `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`, cls: summary.total_profit >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Avg Per Sale',   value: summary.avg_profit,   fmt: v => `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`, cls: summary.avg_profit >= 0 ? 'text-emerald-400' : 'text-red-400' }
  ] : [];

  return (
    <div className="p-5">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {summaryCards.map(m => (
          <div key={m.label} className="bg-[#161b27] border border-gray-800 rounded-lg px-4 py-3">
            <div className="text-gray-600 text-xs uppercase tracking-widest mb-1.5">{m.label}</div>
            <div className={`text-2xl font-semibold font-mono ${m.cls}`}>{m.fmt(m.value)}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[#161b27] border border-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <span className="text-gray-400 text-sm font-medium">Sales History</span>
          <span className="text-gray-700 text-xs">{entries.length} record{entries.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left bg-[#0f1117]">
                {['Player', 'Year / Brand', 'Set', 'Cost Basis', 'Sale Price', 'P&L', 'Platform', 'Date'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-gray-600 text-xs uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-700">Loading…</td></tr>
              )}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-14 text-center text-gray-700">No sales recorded yet. Mark a card as sold from the Collection view.</td></tr>
              )}
              {entries.map((e, i) => {
                const pl = plStyle(e.profit_loss);
                return (
                  <tr key={e.id} className={`border-b border-gray-800/40 hover:bg-[#1a2035] transition-colors ${i % 2 === 0 ? '' : 'bg-[#111620]/50'}`}>
                    <td className="px-4 py-2.5 text-gray-200 font-medium">{e.player_name || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs whitespace-nowrap">{[e.year, e.brand].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[120px] truncate">{e.card_set || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono">{fmtMoney(e.purchase_price)}</td>
                    <td className="px-4 py-2.5 text-gray-100 font-mono font-semibold">{fmtMoney(e.sale_price)}</td>
                    <td className={`px-4 py-2.5 font-mono font-semibold ${pl.cls}`}>{pl.text}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{e.platform || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{e.sale_date || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
