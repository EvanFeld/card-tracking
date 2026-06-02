import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const BAR_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

function fmtMoney(val) {
  if (val === null || val === undefined) return '—';
  const abs  = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

function SectionHead({ label }) {
  return (
    <div className="text-gray-600 text-[11px] uppercase tracking-widest font-medium pb-2 border-b border-gray-800 mb-4">
      {label}
    </div>
  );
}

function EmptyState({ msg }) {
  return (
    <div className="bg-[#161b27] border border-gray-800 rounded-lg px-4 py-8 text-center">
      <div className="text-gray-700 text-sm">{msg}</div>
    </div>
  );
}

function DarkTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f1117] border border-gray-700 rounded px-3 py-2 text-xs shadow-lg">
      <div className="text-gray-500 mb-1">{label}</div>
      <div className="text-blue-400 font-mono font-semibold">
        {fmt ? fmt(payload[0].value) : payload[0].value}
      </div>
    </div>
  );
}

export default function AnalyticsView() {
  const [portfolioHistory, setPortfolioHistory] = useState([]);
  const [topPerformers,    setTopPerformers]    = useState([]);
  const [bySport,          setBySport]          = useState([]);
  const [salesPerf,        setSalesPerf]        = useState(null);
  const [loading,          setLoading]          = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get('/api/analytics/portfolio-history'),
      axios.get('/api/analytics/top-performers'),
      axios.get('/api/analytics/by-sport'),
      axios.get('/api/analytics/sales-performance'),
    ]).then(([ph, tp, bs, sp]) => {
      setPortfolioHistory(ph.data);
      setTopPerformers(tp.data);
      setBySport(bs.data);
      setSalesPerf(sp.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0d1120]">
        <div className="text-gray-700 text-sm">Loading analytics…</div>
      </div>
    );
  }

  const moneyFmt = v => `$${Number(v).toFixed(2)}`;

  return (
    <div className="bg-[#0d1120] px-6 py-5 space-y-8">

      {/* ── Section 1: Portfolio Value Over Time ── */}
      <section>
        <SectionHead label="Portfolio Value Over Time" />
        {portfolioHistory.length < 2 ? (
          <EmptyState msg="Refresh card prices to start tracking portfolio value over time" />
        ) : (
          <div className="bg-[#161b27] border border-gray-800 rounded-lg pt-4 pr-4 pb-2 pl-0">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={portfolioHistory} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2035" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#4b5563', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => v ? v.slice(5) : ''}
                />
                <YAxis
                  tick={{ fill: '#4b5563', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `$${v}`}
                  width={60}
                />
                <Tooltip content={<DarkTooltip fmt={moneyFmt} />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#60a5fa' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ── Section 2: Top Performers ── */}
      <section>
        <SectionHead label="Top Performers — Unrealized P&L" />
        {topPerformers.length === 0 ? (
          <EmptyState msg="Add cards with both purchase prices and current values to see rankings" />
        ) : (
          <div className="bg-[#161b27] border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['#', 'Card', 'Cost', 'Value', 'P&L', 'Return'].map((h, i) => (
                    <th key={h}
                      className={`text-[11px] text-gray-600 uppercase tracking-widest px-4 py-2.5 font-normal ${i <= 1 ? 'text-left' : 'text-right'} ${i === 0 ? 'w-8' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topPerformers.map((c, i) => {
                  const pos = c.profit >= 0;
                  const plCls = pos ? 'text-emerald-400' : 'text-red-400';
                  return (
                    <tr key={i} className="border-b border-gray-800/40 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5 text-gray-700 font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-gray-200 font-medium">{c.player_name}</div>
                        <div className="text-gray-600 text-xs">
                          {[c.brand, c.grade ? `Grade ${c.grade}` : null].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 font-mono">${Number(c.purchase_price).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-300 font-mono">${Number(c.current_value).toFixed(2)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-semibold ${plCls}`}>
                        {pos ? '+' : ''}${Math.abs(c.profit).toFixed(2)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono font-semibold ${plCls}`}>
                        {pos ? '+' : ''}{c.return_pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 3: Sport Breakdown ── */}
      <section>
        <SectionHead label="Sport Breakdown" />
        {bySport.length === 0 ? (
          <EmptyState msg="No sport data yet — assign sports to your owned cards" />
        ) : (
          <div className="bg-[#161b27] border border-gray-800 rounded-lg pt-4 pr-4 pb-2 pl-0">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bySport} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2035" vertical={false} />
                <XAxis
                  dataKey="sport"
                  tick={{ fill: '#4b5563', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: '#4b5563', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `$${v}`}
                  width={60}
                />
                <Tooltip content={<DarkTooltip fmt={moneyFmt} />} />
                <Bar dataKey="total_value" radius={[3, 3, 0, 0]}>
                  {bySport.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ── Section 4: Sales Performance ── */}
      <section>
        <SectionHead label="Sales Performance" />
        {!salesPerf || salesPerf.total_sales === 0 ? (
          <EmptyState msg="No sales recorded yet — sell a card to see performance stats" />
        ) : (
          <div className="bg-[#161b27] border border-gray-800 rounded-lg px-5 py-4 flex gap-8 flex-wrap">
            {[
              { label: 'Total Sales',    value: salesPerf.total_sales,          fmt: v => v,        color: 'text-blue-400' },
              { label: 'Total Revenue',  value: salesPerf.total_revenue,         fmt: fmtMoney,      color: 'text-gray-300' },
              { label: 'Total Profit',   value: salesPerf.total_profit,          fmt: fmtMoney,      color: (salesPerf.total_profit ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Avg / Sale',     value: salesPerf.avg_profit_per_sale,   fmt: fmtMoney,      color: (salesPerf.avg_profit_per_sale ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Best Sale',      value: salesPerf.best_sale,             fmt: fmtMoney,      color: 'text-emerald-400' },
              { label: 'Worst Sale',     value: salesPerf.worst_sale,            fmt: fmtMoney,      color: (salesPerf.worst_sale ?? 0) >= 0 ? 'text-gray-300' : 'text-red-400' },
            ].map(m => (
              <div key={m.label} className="flex flex-col min-w-0">
                <span className="text-gray-600 text-xs uppercase tracking-widest leading-none mb-1">{m.label}</span>
                <span className={`text-xl font-semibold font-mono leading-tight ${m.color}`}>{m.fmt(m.value)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
