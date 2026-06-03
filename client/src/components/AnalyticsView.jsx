import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const SPORT_BLUES = {
  baseball:   '#1d4ed8',
  football:   '#3b82f6',
  basketball: '#60a5fa',
  hockey:     '#93c5fd',
  other:      '#bfdbfe',
};
const WHATNOT_YELLOW = '#eab308';

const BAR_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

const MARKET_TIMEFRAMES = [
  { key: 'weekly',    label: 'Weekly',   field: 'weeklyPercentChange'     },
  { key: 'monthly',   label: 'Monthly',  field: 'monthlyPercentChange'    },
  { key: 'quarterly', label: 'Quarterly',field: 'quarterlyPercentChange'  },
  { key: '6month',    label: '6 Month',  field: 'halfAnnualPercentChange' },
  { key: 'annual',    label: 'Annual',   field: 'annualPercentChange'     },
  { key: 'ytd',       label: 'YTD',      field: 'yearToDatePercentChange' },
  { key: 'alltime',   label: 'All Time', field: 'allTimePercentChange'    },
];

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

const RANGES = ['3M', '6M', '1Y', 'All'];

function filterByRange(history, range) {
  if (range === 'All') return history;
  const days   = range === '3M' ? 90 : range === '6M' ? 180 : 365;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return history.filter(d => d.date >= cutoff);
}

function fmtPct(val) {
  if (val === null || val === undefined) return '—';
  const pct = (val * 100).toFixed(2);
  return `${val >= 0 ? '+' : ''}${pct}%`;
}

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function PlayerIndexCard({ data }) {
  const [range, setRange] = useState('1Y');
  const filtered = filterByRange(data.indexHistory, range);
  return (
    <div id={slugify(data.player)} className="bg-[#161b27] border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-gray-200 font-medium">{data.player}</div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                range === r ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-6 flex-wrap">
        <div className="flex flex-col">
          <span className="text-gray-600 text-xs uppercase tracking-widest leading-none mb-1">Index</span>
          <span className="text-xl font-semibold font-mono text-gray-200">
            {data.currentIndex != null ? data.currentIndex.toFixed(2) : '—'}
          </span>
        </div>
        {[
          { label: 'Daily',     key: 'daily'     },
          { label: 'Weekly',    key: 'weekly'     },
          { label: 'Monthly',   key: 'monthly'   },
          { label: 'Quarterly', key: 'quarterly' },
        ].map(({ label, key }) => {
          const val = data.percentChanges[key];
          const pos = val >= 0;
          return (
            <div key={key} className="flex flex-col">
              <span className="text-gray-600 text-xs uppercase tracking-widest leading-none mb-1">{label}</span>
              <span className={`text-base font-semibold font-mono ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPct(val)}
              </span>
            </div>
          );
        })}
      </div>
      {filtered.length < 2 ? (
        <div className="text-gray-700 text-sm py-4 text-center">Not enough data for selected range</div>
      ) : (
        <div className="pt-2 pr-4 pb-0 pl-0">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={filtered} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2035" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#4b5563', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => v ? v.slice(5) : ''}
                interval="preserveStartEnd"
                tickCount={6}
              />
              <YAxis
                tick={{ fill: '#4b5563', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => v.toFixed(0)}
                width={50}
              />
              <Tooltip content={<DarkTooltip fmt={v => v.toFixed(2)} />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#60a5fa' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function AnalyticsView() {
  const [portfolioHistory,   setPortfolioHistory]   = useState([]);
  const [topPerformers,      setTopPerformers]      = useState([]);
  const [salesPerf,          setSalesPerf]          = useState(null);
  const [loading,            setLoading]            = useState(true);
  const [portfolioBreakdown, setPortfolioBreakdown] = useState([]);
  const [whatnotAmmo,        setWhatnotAmmo]        = useState(null);
  const [playerIndex,        setPlayerIndex]        = useState([]);
  const [playerIndexLoading, setPlayerIndexLoading] = useState(true);
  const [marketPulse,        setMarketPulse]        = useState([]);
  const [selectedTimeframe,  setSelectedTimeframe]  = useState('monthly');

  useEffect(() => {
    Promise.all([
      axios.get('/api/analytics/portfolio-history'),
      axios.get('/api/analytics/top-performers'),
      axios.get('/api/analytics/sales-performance'),
      axios.get('/api/analytics/portfolio-breakdown'),
      axios.get('/api/analytics/whatnot-ammo'),
    ]).then(([ph, tp, sp, pb, wa]) => {
      setPortfolioHistory(ph.data);
      setTopPerformers(tp.data);
      setSalesPerf(sp.data);
      setPortfolioBreakdown(pb.data);
      setWhatnotAmmo(wa.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    axios.get('/api/player-index')
      .then(r => setPlayerIndex(r.data))
      .catch(console.error)
      .finally(() => setPlayerIndexLoading(false));
  }, []);

  useEffect(() => {
    axios.get('/api/market-pulse')
      .then(r => setMarketPulse(r.data))
      .catch(console.error);
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0d1120]">
        <div className="text-gray-700 text-sm">Loading analytics…</div>
      </div>
    );
  }

  const moneyFmt   = v => `$${Number(v).toFixed(2)}`;
  const activeTf   = MARKET_TIMEFRAMES.find(t => t.key === selectedTimeframe) || MARKET_TIMEFRAMES[2];
  const sortedPulse = [...marketPulse].sort((a, b) => (b[activeTf.field] ?? 0) - (a[activeTf.field] ?? 0));

  return (
    <div className="bg-[#0d1120] px-6 py-5 space-y-8">

      {/* ── Section 0: Market Pulse ── */}
      <section>
        <SectionHead label="Market Pulse" />
        {marketPulse.length === 0 ? (
          <EmptyState msg="Loading market data…" />
        ) : (
          <>
            <div className="flex gap-1 flex-wrap mb-3">
              {MARKET_TIMEFRAMES.map(tf => (
                <button
                  key={tf.key}
                  onClick={() => setSelectedTimeframe(tf.key)}
                  className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
                    selectedTimeframe === tf.key
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                      : 'text-gray-600 hover:text-gray-400 border border-transparent hover:border-gray-800'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3 flex-wrap">
              {sortedPulse.map(s => {
                const pct    = s[activeTf.field] ?? null;
                const pos    = pct != null ? pct >= 0 : true;
                const pctCls = pct != null ? (pos ? 'text-emerald-400' : 'text-red-400') : 'text-gray-600';
                const bgCls  = pct != null
                  ? (pos ? 'border-emerald-800/30 bg-emerald-900/10' : 'border-red-800/30 bg-red-900/10')
                  : 'border-gray-800/40';
                const sales  = s.dailySales != null
                  ? s.dailySales >= 1000
                    ? `$${(s.dailySales / 1000).toFixed(0)}k vol`
                    : `$${s.dailySales.toFixed(0)} vol`
                  : null;
                return (
                  <div key={s.sport}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${bgCls} min-w-[180px] flex-1`}>
                    <span className="text-2xl leading-none">{s.emoji}</span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-gray-400 text-xs font-medium">{s.label}</span>
                      <span className={`text-lg font-bold font-mono leading-tight ${pctCls}`}>
                        {pct != null ? `${pos ? '+' : ''}${(pct * 100).toFixed(2)}%` : '—'}
                      </span>
                      {s.dailyIndex != null && (
                        <span className="text-gray-600 text-[11px] font-mono leading-none mt-0.5">
                          idx {s.dailyIndex.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          {sales ? ` · ${sales}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ── Whatnot Ammo Panel ── */}
      {whatnotAmmo && whatnotAmmo.totalCards > 0 && (
        <section className="border-l-2 border-yellow-500/40 pl-4">
          <SectionHead label="Whatnot Ammo" />
          <div className="flex gap-6 flex-wrap">
            {[
              { label: 'Total Cards', value: whatnotAmmo.totalCards, fmt: v => v,    color: 'text-yellow-400' },
              { label: 'Total Value', value: whatnotAmmo.totalValue, fmt: fmtMoney,  color: 'text-gray-200' },
              { label: 'Autos',       value: whatnotAmmo.autos,      fmt: v => v,    color: 'text-gray-400' },
            ].map(m => (
              <div key={m.label} className="flex flex-col min-w-0">
                <span className="text-gray-600 text-xs uppercase tracking-widest leading-none mb-1">{m.label}</span>
                <span className={`text-xl font-semibold font-mono leading-tight ${m.color}`}>{m.fmt(m.value)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Section 1: Portfolio Breakdown ── */}
      <section>
        <SectionHead label="Portfolio Breakdown" />
        {portfolioBreakdown.length === 0 ? (
          <EmptyState msg="Add cards with current values to see portfolio breakdown" />
        ) : (() => {
          const total = portfolioBreakdown.reduce((s, r) => s + (r.value || 0), 0);
          return (
            <div className="bg-[#161b27] border border-gray-800 rounded-lg p-6 flex gap-8 flex-wrap items-center">
              <div className="w-[220px] h-[220px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={portfolioBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={90}
                      dataKey="value"
                    >
                      {portfolioBreakdown.map((row, i) => (
                        <Cell
                          key={i}
                          fill={row.type === 'whatnot' ? WHATNOT_YELLOW : (SPORT_BLUES[row.sport] || SPORT_BLUES.other)}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0;
                      return (
                        <div className="bg-[#0f1117] border border-gray-700 rounded px-3 py-2 text-xs shadow-lg">
                          <div className="text-gray-300 font-medium mb-1">{d.label}</div>
                          <div className="text-gray-200 font-mono">{fmtMoney(d.value)}</div>
                          <div className="text-gray-500">{d.count} card{d.count !== 1 ? 's' : ''} · {pct}%</div>
                        </div>
                      );
                    }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2 min-w-0">
                {portfolioBreakdown.map((row, i) => {
                  const color = row.type === 'whatnot' ? WHATNOT_YELLOW : (SPORT_BLUES[row.sport] || SPORT_BLUES.other);
                  const pct = total > 0 ? ((row.value / total) * 100).toFixed(1) : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-gray-400 text-sm w-32">{row.label}</span>
                      <span className="text-gray-200 font-mono text-sm">{fmtMoney(row.value)}</span>
                      <span className="text-gray-500 text-xs">{pct}%</span>
                    </div>
                  );
                })}
                <div className="mt-1 pt-2 border-t border-gray-800 flex items-center gap-3">
                  <span className="w-2.5 h-2.5 flex-shrink-0" />
                  <span className="text-gray-600 text-sm w-32">Total</span>
                  <span className="text-gray-300 font-mono text-sm font-semibold">{fmtMoney(total)}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </section>

      {/* ── Section 2: Portfolio Value Over Time ── */}
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

      {/* ── Section 3: Top Performers ── */}
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

      {/* ── Section 5: Player Index ── */}
      <section>
        <SectionHead label="Player Index — Card Ladder" />
        {playerIndexLoading ? (
          <EmptyState msg="Loading player indexes…" />
        ) : playerIndex.length === 0 ? (
          <EmptyState msg="No Card Ladder player data found for your owned cards" />
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {playerIndex.map(p => (
                <button
                  key={p.player}
                  onClick={() => document.getElementById(slugify(p.player))?.scrollIntoView({ behavior: 'smooth' })}
                  className="flex-shrink-0 px-3 py-1 text-[11px] font-medium rounded-full bg-[#1e2535] text-gray-400 hover:bg-[#2a3347] hover:text-gray-200 transition-colors border border-gray-700/50 whitespace-nowrap"
                >
                  {p.player}
                </button>
              ))}
            </div>
            {playerIndex.map(p => <PlayerIndexCard key={p.player} data={p} />)}
          </div>
        )}
      </section>

    </div>
  );
}
