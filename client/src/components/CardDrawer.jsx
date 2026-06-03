import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import useCardStore from '../store/cardStore';

const SPORTS      = ['baseball', 'football', 'basketball', 'hockey', 'soccer'];
const CONDITIONS  = ['Poor', 'Fair', 'Good', 'VG', 'EX', 'NM', 'NM-MT', 'MINT', 'GEM-MT'];
const GRADING_COS = ['PSA', 'BGS', 'SGC', 'CGC', 'HGA', 'CSG'];
const GRADES      = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'];

const inp = 'bg-[#0d1120] border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 w-full';
const sel = `${inp} cursor-pointer`;

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-gray-600 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );
}

function ReadVal({ val, mono, cls }) {
  return (
    <span className={`text-sm py-1 ${mono ? 'font-mono' : ''} ${cls || 'text-gray-300'}`}>
      {val || <span className="text-gray-700">—</span>}
    </span>
  );
}

function SectionHead({ label }) {
  return <div className="text-gray-600 text-[11px] uppercase tracking-widest font-medium pb-2 border-b border-gray-800 mb-3">{label}</div>;
}

// Custom tooltip for the price chart
function PriceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f1117] border border-gray-700 rounded px-3 py-2 text-xs shadow-lg">
      <div className="text-gray-500 mb-1">{label}</div>
      <div className="text-blue-400 font-mono font-semibold">${Number(payload[0].value).toFixed(2)}</div>
    </div>
  );
}

export default function CardDrawer() {
  const { selectedCard, drawerOpen, closeDrawer, updateCard, deleteCard, sellCard, fetchSummary, fetchCards } = useCardStore();

  const [editing, setEditing]             = useState(false);
  const [form, setForm]                   = useState({});
  const [selling, setSelling]             = useState(false);
  const [saleForm, setSaleForm]           = useState({ sale_price: '', sale_date: '', platform: '' });
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saving, setSaving]               = useState(false);

  // Price refresh state
  const [refreshing, setRefreshing]       = useState(false);
  const [refreshError, setRefreshError]   = useState(null);
  const [liveCard, setLiveCard]           = useState(null);
  const [sourceUrls, setSourceUrls]       = useState({ cardLadderUrl: null, ebayListingUrl: null });

  // Price history state
  const [priceHistory, setPriceHistory]   = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (selectedCard) {
      setForm({ ...selectedCard });
      setEditing(false);
      setSelling(false);
      setDeleteConfirm(false);
      setRefreshError(null);
      setLiveCard(null);
      setSourceUrls({ cardLadderUrl: null, ebayListingUrl: null });
      setSaleForm({ sale_price: '', sale_date: new Date().toISOString().split('T')[0], platform: '' });
      // Fetch price history whenever a card is selected
      fetchPriceHistory(selectedCard.id);
    }
  }, [selectedCard?.id]);

  const fetchPriceHistory = async (cardId) => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`/api/price-history/${cardId}`);
      setPriceHistory(res.data);
    } catch {
      setPriceHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  if (!drawerOpen || !selectedCard) return null;

  // Use liveCard (post-refresh) if available, then form (edit mode), then original
  const displayed = editing ? form : (liveCard || selectedCard);

  const upd     = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updBool = (k)    => setForm(f => ({ ...f, [k]: f[k] ? 0 : 1 }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCard(selectedCard.id, form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await deleteCard(selectedCard.id);
    closeDrawer();
  };

  const handleSell = async () => {
    if (!saleForm.sale_price) return;
    await sellCard(selectedCard.id, {
      sale_price: parseFloat(saleForm.sale_price),
      sale_date:  saleForm.sale_date || new Date().toISOString().split('T')[0],
      platform:   saleForm.platform
    });
    setSelling(false);
    closeDrawer();
  };

  const handleLockToggle = async (lockField) => {
    const currentData = liveCard || selectedCard;
    const newVal = currentData[lockField] ? 0 : 1;
    setLiveCard({ ...currentData, [lockField]: newVal });
    await updateCard(selectedCard.id, { [lockField]: newVal });
  };

  const handleRefreshPrice = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await axios.post(`/api/prices/refresh/${selectedCard.id}`);
      setLiveCard(res.data.card);
      setSourceUrls({
        cardLadderUrl:  res.data.priceData?.cardLadderUrl  ?? null,
        ebayListingUrl: res.data.priceData?.ebayListingUrl ?? null
      });
      // Refresh price history chart
      await fetchPriceHistory(selectedCard.id);
      // Sync store state
      await fetchCards();
      // Update global summary bar
      fetchSummary();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to fetch price from Card Ladder.';
      setRefreshError(msg);
    } finally {
      setRefreshing(false);
    }
  };

  const data = displayed;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={closeDrawer} />

      <aside className="fixed right-0 top-0 h-full w-[500px] bg-[#161b27] border-l border-gray-800 z-50 flex flex-col shadow-2xl">
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0 gap-3">
          <div className="min-w-0">
            <div className="text-gray-100 font-semibold text-lg leading-tight truncate">{data.player_name}</div>
            <div className="text-gray-600 text-xs mt-0.5 truncate">
              {[data.year, data.brand, data.card_set, data.card_number ? `#${data.card_number}` : null].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="flex gap-1.5 items-center flex-shrink-0">
            {!editing && selectedCard.status === 'owned' && !selling && (
              <button onClick={() => setSelling(true)}
                className="text-xs bg-emerald-800/30 hover:bg-emerald-800/60 text-emerald-400 px-2.5 py-1.5 rounded transition-colors border border-emerald-800/40">
                Sell
              </button>
            )}
            {!editing ? (
              <button onClick={() => setEditing(true)}
                className="text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-2.5 py-1.5 rounded transition-colors border border-blue-600/30">
                Edit
              </button>
            ) : (
              <>
                <button onClick={() => { setEditing(false); setForm({ ...selectedCard }); }}
                  className="text-xs text-gray-600 hover:text-gray-300 px-2 py-1.5 transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded transition-colors">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
            <button onClick={closeDrawer}
              className="text-gray-700 hover:text-gray-300 text-xl leading-none px-1 ml-1 transition-colors">
              ×
            </button>
          </div>
        </div>

        {/* ── Sell panel ── */}
        {selling && (
          <div className="bg-emerald-950/40 border-b border-emerald-900/40 px-5 py-4 flex-shrink-0">
            <div className="text-emerald-400 text-xs uppercase tracking-widest font-medium mb-3">Record Sale</div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Field label="Sale Price ($)">
                <input type="number" step="0.01" min="0" className={inp}
                  value={saleForm.sale_price}
                  onChange={e => setSaleForm(f => ({ ...f, sale_price: e.target.value }))}
                  placeholder="0.00" autoFocus />
              </Field>
              <Field label="Sale Date">
                <input type="date" className={inp}
                  value={saleForm.sale_date}
                  onChange={e => setSaleForm(f => ({ ...f, sale_date: e.target.value }))} />
              </Field>
              <Field label="Platform">
                <input type="text" className={inp}
                  value={saleForm.platform}
                  onChange={e => setSaleForm(f => ({ ...f, platform: e.target.value }))}
                  placeholder="eBay, COMC…" />
              </Field>
            </div>
            {saleForm.sale_price && selectedCard.purchase_price && (
              <div className="text-xs mb-3">
                <span className="text-gray-600">P&L: </span>
                <span className={parseFloat(saleForm.sale_price) >= selectedCard.purchase_price ? 'text-emerald-400' : 'text-red-400'}>
                  {parseFloat(saleForm.sale_price) >= selectedCard.purchase_price ? '+' : ''}
                  ${(parseFloat(saleForm.sale_price) - selectedCard.purchase_price).toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleSell}
                className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-3 py-1.5 rounded transition-colors">
                Confirm Sale
              </button>
              <button onClick={() => setSelling(false)}
                className="text-gray-600 hover:text-gray-300 text-sm px-2 py-1.5 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* Identity */}
          <section>
            <SectionHead label="Card Identity" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Player Name">
                {editing
                  ? <input className={inp} value={form.player_name || ''} onChange={e => upd('player_name', e.target.value)} />
                  : <ReadVal val={data.player_name} />}
              </Field>
              <Field label="Year">
                {editing
                  ? <input type="number" className={inp} value={form.year || ''} onChange={e => upd('year', e.target.value)} />
                  : <ReadVal val={data.year} mono />}
              </Field>
              <Field label="Brand">
                {editing
                  ? <input className={inp} value={form.brand || ''} onChange={e => upd('brand', e.target.value)} />
                  : <ReadVal val={data.brand} />}
              </Field>
              <Field label="Set">
                {editing
                  ? <input className={inp} value={form.card_set || ''} onChange={e => upd('card_set', e.target.value)} />
                  : <ReadVal val={data.card_set} />}
              </Field>
              <Field label="Card #">
                {editing
                  ? <input className={inp} value={form.card_number || ''} onChange={e => upd('card_number', e.target.value)} />
                  : <ReadVal val={data.card_number} mono />}
              </Field>
              <Field label="Sport">
                {editing
                  ? <select className={sel} value={form.sport || ''} onChange={e => upd('sport', e.target.value)}>
                      <option value="">—</option>
                      {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  : <ReadVal val={data.sport} cls="text-gray-300 capitalize" />}
              </Field>
              <Field label="Parallel">
                {editing
                  ? <input className={inp} value={form.parallel || ''} onChange={e => upd('parallel', e.target.value)} placeholder="Gold, Prizm…" />
                  : <ReadVal val={data.parallel} />}
              </Field>
              <Field label="Serial #">
                {editing
                  ? <input className={inp} value={form.serial_number || ''} onChange={e => upd('serial_number', e.target.value)} placeholder="/99, /10, 1/1" />
                  : <ReadVal val={data.serial_number} mono cls="text-orange-400" />}
              </Field>
            </div>
          </section>

          {/* Attributes */}
          <section>
            <SectionHead label="Attributes" />
            <div className="flex gap-2 flex-wrap mb-4">
              {[['is_auto', 'Auto'], ['is_mem', 'Memorabilia'], ['is_numbered', 'Numbered'], ['is_graded', 'Graded'], ['is_insert', 'Insert']].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => editing && updBool(k)}
                  className={`text-xs px-3 py-1 rounded border transition-colors ${editing ? 'cursor-pointer' : 'cursor-default'} ${
                    data[k]
                      ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                      : 'border-gray-800 text-gray-700'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {data.is_graded ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Grading Co.">
                  {editing
                    ? <select className={sel} value={form.grading_company || ''} onChange={e => upd('grading_company', e.target.value)}>
                        <option value="">—</option>
                        {GRADING_COS.map(g => <option key={g}>{g}</option>)}
                      </select>
                    : <ReadVal val={data.grading_company} />}
                </Field>
                <Field label="Grade">
                  {editing
                    ? <select className={sel} value={form.grade || ''} onChange={e => upd('grade', e.target.value)}>
                        <option value="">—</option>
                        {GRADES.map(g => <option key={g}>{g}</option>)}
                      </select>
                    : <ReadVal val={data.grade} mono cls="text-blue-300 text-lg font-bold" />}
                </Field>
              </div>
            ) : (
              <Field label="Raw Condition">
                {editing
                  ? <select className={sel} value={form.raw_condition || ''} onChange={e => upd('raw_condition', e.target.value)}>
                      <option value="">—</option>
                      {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  : <ReadVal val={data.raw_condition} />}
              </Field>
            )}
          </section>

          {/* Financials */}
          <section>
            <SectionHead label="Financials" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Purchase Price">
                {editing
                  ? <input type="number" step="0.01" className={inp} value={form.purchase_price || ''} onChange={e => upd('purchase_price', e.target.value)} />
                  : <ReadVal val={data.purchase_price != null ? `$${Number(data.purchase_price).toFixed(2)}` : null} mono />}
              </Field>
              <Field label="Current Value">
                {editing
                  ? <input type="number" step="0.01" className={inp} value={form.current_value || ''} onChange={e => upd('current_value', e.target.value)} />
                  : <ReadVal val={data.current_value != null ? `$${Number(data.current_value).toFixed(2)}` : null} mono cls="text-gray-100 font-semibold" />}
              </Field>
              <Field label="Purchase Date">
                {editing
                  ? <input type="date" className={inp} value={form.purchase_date || ''} onChange={e => upd('purchase_date', e.target.value)} />
                  : <ReadVal val={data.purchase_date} />}
              </Field>
              <Field label="Last Price Check">
                {editing
                  ? <input type="date" className={inp} value={form.last_price_check || ''} onChange={e => upd('last_price_check', e.target.value)} />
                  : <ReadVal val={data.last_price_check} />}
              </Field>
              <Field label="Purchased From">
                {editing
                  ? <input className={inp} value={form.purchased_from || ''} onChange={e => upd('purchased_from', e.target.value)} placeholder="eBay, LCS, COMC…" />
                  : <ReadVal val={data.purchased_from} />}
              </Field>
              <Field label="Status">
                {editing
                  ? <select className={sel} value={form.status || 'owned'} onChange={e => upd('status', e.target.value)}>
                      <option value="owned">Owned</option>
                      <option value="sold">Sold</option>
                      <option value="watchlist">Watchlist</option>
                      <option value="whatnot">Whatnot Ammo</option>
                    </select>
                  : <ReadVal val={data.status} cls="text-gray-300 capitalize" />}
              </Field>
            </div>

            {/* Unrealized P&L callout */}
            {!editing && data.purchase_price != null && data.current_value != null && (
              <div className="mt-4 bg-gray-900/60 rounded-lg px-4 py-3 flex gap-6">
                {(() => {
                  const diff = data.current_value - data.purchase_price;
                  const pct  = data.purchase_price !== 0 ? ((diff / data.purchase_price) * 100).toFixed(1) : 0;
                  const cls  = diff >= 0 ? 'text-emerald-400' : 'text-red-400';
                  return (
                    <>
                      <div>
                        <div className="text-gray-700 text-xs uppercase tracking-widest mb-0.5">Unrealized P&L</div>
                        <div className={`font-mono font-bold text-base ${cls}`}>
                          {diff >= 0 ? '+' : ''}${Math.abs(diff).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-700 text-xs uppercase tracking-widest mb-0.5">Return</div>
                        <div className={`font-mono font-bold text-base ${cls}`}>
                          {diff >= 0 ? '+' : ''}{pct}%
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* ── Source Links ── */}
            {(() => {
              const SOURCE_LINKS = [
                { urlField: 'card_ladder_url',  lockField: 'card_ladder_url_locked',  label: 'Card Ladder' },
                { urlField: 'ebay_sale_url_1',  lockField: 'ebay_sale_url_1_locked',  label: 'eBay Sale 1' },
                { urlField: 'ebay_sale_url_2',  lockField: 'ebay_sale_url_2_locked',  label: 'eBay Sale 2' },
                { urlField: 'ebay_sale_url_3',  lockField: 'ebay_sale_url_3_locked',  label: 'eBay Sale 3' },
              ];
              return (
                <div className="mt-4">
                  <div className="text-gray-600 text-[11px] uppercase tracking-widest mb-2">Source Links</div>
                  <div className="space-y-2">
                    {SOURCE_LINKS.map(({ urlField, lockField, label }) => {
                      const urlVal = data[urlField] || '';
                      const locked = data[lockField] ? 1 : 0;
                      return (
                        <div key={urlField} className="flex items-center gap-2">
                          <span className="text-gray-600 text-[11px] w-20 flex-shrink-0">{label}</span>
                          {editing ? (
                            <input
                              className="bg-[#0d1120] border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500 flex-1 min-w-0"
                              value={urlVal}
                              onChange={e => upd(urlField, e.target.value)}
                              placeholder="https://..."
                            />
                          ) : (
                            <div className="flex-1 min-w-0">
                              {urlVal ? (
                                <a href={urlVal} target="_blank" rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 text-xs underline truncate block">
                                  {urlVal}
                                </a>
                              ) : (
                                <span className="text-gray-700 text-xs">—</span>
                              )}
                            </div>
                          )}
                          <button
                            onClick={() => editing ? upd(lockField, locked ? 0 : 1) : handleLockToggle(lockField)}
                            className="flex-shrink-0 text-sm leading-none p-1 rounded hover:bg-gray-800 transition-colors"
                            title={locked ? 'Locked — click to unlock' : 'Unlocked — click to lock'}
                          >
                            {locked ? '🔒' : '🔓'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── Refresh Price (Card Ladder) ── */}
            {!editing && (
              <div className="mt-4">
                <button
                  onClick={handleRefreshPrice}
                  disabled={refreshing}
                  className="flex items-center gap-2 text-xs bg-[#0d1120] hover:bg-[#131a2e] border border-gray-700 hover:border-blue-600/50 text-gray-400 hover:text-blue-400 px-3 py-2 rounded transition-colors disabled:opacity-60 disabled:cursor-not-allowed w-full justify-center"
                >
                  {refreshing ? (
                    <>
                      {/* Spinner */}
                      <svg className="animate-spin h-3.5 w-3.5 text-blue-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Fetching from Card Ladder…</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Refresh Price via Card Ladder</span>
                    </>
                  )}
                </button>

                {refreshError && (
                  <div className="mt-2 text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded px-3 py-2">
                    {refreshError}
                  </div>
                )}

                {liveCard && !refreshError && (
                  <div className="mt-2 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800/30 rounded px-3 py-2">
                    <div>Updated — value set to ${Number(liveCard.current_value).toFixed(2)}</div>
                    {(sourceUrls.cardLadderUrl || sourceUrls.ebayListingUrl) && (
                      <div className="mt-1 flex items-center gap-1 flex-wrap">
                        {sourceUrls.cardLadderUrl && (
                          <a href={sourceUrls.cardLadderUrl} target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline text-xs">
                            ↗ Card Ladder Results
                          </a>
                        )}
                        {sourceUrls.cardLadderUrl && sourceUrls.ebayListingUrl && (
                          <span className="text-gray-600">·</span>
                        )}
                        {sourceUrls.ebayListingUrl && (
                          <a href={sourceUrls.ebayListingUrl} target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline text-xs">
                            ↗ eBay Sold Listing
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Price History Chart ── */}
          {!editing && (
            <section>
              <SectionHead label="Price History" />
              {historyLoading ? (
                <div className="text-xs text-gray-700 py-4">Loading history…</div>
              ) : priceHistory.length < 2 ? (
                <div className="bg-[#0d1120] border border-gray-800 rounded-lg px-4 py-6 text-center">
                  <div className="text-gray-700 text-xs">No price history yet</div>
                  <div className="text-gray-800 text-xs mt-1">Hit Refresh Price to start tracking</div>
                </div>
              ) : (
                <div className="bg-[#0d1120] border border-gray-800 rounded-lg pt-3 pr-3 pb-1 pl-0">
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart
                      data={priceHistory}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    >
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
                        width={50}
                      />
                      <Tooltip content={<PriceTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: '#60a5fa' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="text-gray-800 text-[10px] text-right pr-1 pb-1">
                    {priceHistory.length} data point{priceHistory.length !== 1 ? 's' : ''} · source: card ladder
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Notes */}
          <section>
            <SectionHead label="Notes" />
            {editing
              ? <textarea rows={3} className={`${inp} resize-none`}
                  value={form.notes || ''} onChange={e => upd('notes', e.target.value)} />
              : <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">
                  {data.notes || <span className="text-gray-700">—</span>}
                </p>}
          </section>

          {/* Danger zone */}
          {!editing && (
            <section className="pt-2 border-t border-gray-800/60">
              {!deleteConfirm ? (
                <button onClick={() => setDeleteConfirm(true)}
                  className="text-xs text-gray-800 hover:text-red-500 transition-colors">
                  Delete this card…
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-red-400">Permanently delete? This cannot be undone.</span>
                  <button onClick={handleDelete}
                    className="text-xs bg-red-800 hover:bg-red-700 text-white px-2.5 py-1 rounded transition-colors">
                    Delete
                  </button>
                  <button onClick={() => setDeleteConfirm(false)}
                    className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                    Cancel
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
