import { useState, useEffect } from 'react';
import axios from 'axios';

const SPORTS = ['baseball', 'football', 'basketball', 'hockey', 'soccer'];
const inp = 'bg-[#0d1120] border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-blue-500 w-full';
const EMPTY = { search_query: '', target_price: '', alert_threshold: '', sport: '' };

export default function WatchlistView() {
  const [items, setItems]   = useState([]);
  const [form, setForm]     = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => axios.get('/api/watchlist/market-data').then(r => setItems(r.data));

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleAdd = async () => {
    if (!form.search_query.trim()) return;
    await axios.post('/api/watchlist', form);
    setForm(EMPTY);
    setAdding(false);
    load();
  };

  const handleDelete = async (id) => {
    await axios.delete(`/api/watchlist/${id}`);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-gray-200 font-semibold">Watchlist</h2>
          <p className="text-gray-700 text-xs mt-0.5">Track search queries and target prices for cards you want to buy.</p>
        </div>
        <button onClick={() => setAdding(a => !a)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded transition-colors font-medium">
          {adding ? 'Cancel' : '+ Add Watch'}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-[#161b27] border border-gray-700 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-4 gap-3 mb-3">
            <div className="col-span-2">
              <label className="block text-[11px] text-gray-600 uppercase tracking-widest mb-1">Search Query</label>
              <input className={inp} value={form.search_query}
                onChange={e => upd('search_query', e.target.value)}
                placeholder="e.g. 2020 Topps Chrome Trout PSA 10" autoFocus />
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 uppercase tracking-widest mb-1">Target Price ($)</label>
              <input type="number" step="0.01" className={inp} value={form.target_price}
                onChange={e => upd('target_price', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 uppercase tracking-widest mb-1">Alert At ($)</label>
              <input type="number" step="0.01" className={inp} value={form.alert_threshold}
                onChange={e => upd('alert_threshold', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 uppercase tracking-widest mb-1">Sport</label>
              <select className={inp} value={form.sport} onChange={e => upd('sport', e.target.value)}>
                <option value="">All sports</option>
                {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleAdd}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded transition-colors">
            Add to Watchlist
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-[#161b27] border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-[#0f1117] text-left">
              {['Search Query', 'Sport', 'Target Price', 'Alert At', 'Last Checked', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-gray-600 text-xs uppercase tracking-wider font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-700">Loading…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-14 text-center text-gray-700">
                  Nothing on the watchlist yet. Add a search query above to track a card.
                </td>
              </tr>
            )}
            {items.map((item, i) => (
              <tr key={item.id} className={`border-b border-gray-800/40 hover:bg-[#1a2035] transition-colors ${i % 2 === 0 ? '' : 'bg-[#111620]/40'}`}>
                <td className="px-4 py-2.5">
                  <div className="text-gray-200">{item.search_query}</div>
                  {item.marketData && !item.marketData.notFound && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {item.marketData.currentIndex != null && (
                        <span className="text-gray-600 text-xs font-mono">
                          idx {Math.round(item.marketData.currentIndex)}
                        </span>
                      )}
                      {item.marketData.monthlyPercentChange != null && (
                        <span className={`text-xs font-mono font-semibold ${item.marketData.monthlyPercentChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {item.marketData.monthlyPercentChange >= 0 ? '+' : ''}
                          {(item.marketData.monthlyPercentChange * 100).toFixed(1)}%
                        </span>
                      )}
                      {item.marketData.flags?.slice(0, 3).map(flag => (
                        <span key={flag.key} className="text-[11px]" title={flag.label}>
                          {flag.emoji}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-500 capitalize text-sm">{item.sport || '—'}</td>
                <td className="px-4 py-2.5 text-gray-300 font-mono">{item.target_price ? `$${Number(item.target_price).toFixed(2)}` : '—'}</td>
                <td className="px-4 py-2.5 text-gray-400 font-mono">{item.alert_threshold ? `$${Number(item.alert_threshold).toFixed(2)}` : '—'}</td>
                <td className="px-4 py-2.5 text-gray-700 text-xs font-mono">{item.last_checked || 'Never'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => handleDelete(item.id)}
                    className="text-xs text-gray-800 hover:text-red-500 transition-colors">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
