import { useState } from 'react';
import useCardStore from '../store/cardStore';

const SPORTS      = ['baseball', 'football', 'basketball', 'hockey', 'soccer'];
const CONDITIONS  = ['Poor', 'Fair', 'Good', 'VG', 'EX', 'NM', 'NM-MT', 'MINT', 'GEM-MT'];
const GRADING_COS = ['PSA', 'BGS', 'SGC', 'CGC', 'HGA', 'CSG'];
const GRADES      = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'];

const inp = 'bg-[#0d1120] border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-blue-500 w-full';

const EMPTY = {
  player_name: '', year: '', brand: '', card_set: '', card_number: '', sport: '',
  parallel: '', serial_number: '', is_auto: false, is_mem: false, is_numbered: false,
  is_graded: false, grading_company: '', grade: '', raw_condition: '',
  purchase_price: '', purchase_date: '', purchased_from: '', current_value: '',
  status: 'owned', notes: '', image_url: ''
};

function F({ label, children, span }) {
  return (
    <div className={span ? `col-span-${span}` : ''}>
      <label className="block text-[11px] text-gray-600 uppercase tracking-widest mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function AddCardModal({ onClose }) {
  const [form, setForm]       = useState(EMPTY);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const { createCard }        = useCardStore();

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleQuickAdd = () => {
    const next = !quickAdd;
    setQuickAdd(next);
    if (next) {
      setForm(f => ({ ...f, status: 'whatnot' }));
    } else {
      setForm(f => ({ ...f, status: 'owned' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.player_name.trim()) {
      setError('Player name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createCard(form);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Unknown error — check console.';
      setError(`Failed to add card: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#161b27] border border-gray-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="text-gray-100 font-semibold">Add New Card</div>
          <div className="flex items-center gap-3">
            {/* Quick Add toggle */}
            <button
              type="button"
              onClick={toggleQuickAdd}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
                quickAdd
                  ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                  : 'bg-gray-800/40 border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              ⚡ Quick Add
            </button>
            <button onClick={onClose} className="text-gray-700 hover:text-gray-300 text-xl transition-colors">×</button>
          </div>
        </div>

        {quickAdd && (
          <div className="px-5 py-2 bg-yellow-900/10 border-b border-yellow-800/20 text-yellow-600 text-xs">
            Quick Add mode — minimal fields, defaults to Whatnot Ammo status
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Core identity — always shown */}
          <div>
            <div className="text-gray-700 text-[11px] uppercase tracking-widest mb-3">Card Identity</div>
            <div className="grid grid-cols-3 gap-3">
              <F label="Player Name *" span={2}>
                <input required className={inp} value={form.player_name}
                  onChange={e => upd('player_name', e.target.value)} autoFocus />
              </F>
              <F label="Year">
                <input type="number" className={inp} value={form.year}
                  onChange={e => upd('year', e.target.value)} placeholder="2024" />
              </F>
              <F label="Brand">
                <input className={inp} value={form.brand}
                  onChange={e => upd('brand', e.target.value)} placeholder="Topps, Panini…" />
              </F>
              <F label="Set">
                <input className={inp} value={form.card_set}
                  onChange={e => upd('card_set', e.target.value)} placeholder="Chrome, Prizm…" />
              </F>
              <F label="Card #">
                <input className={inp} value={form.card_number}
                  onChange={e => upd('card_number', e.target.value)} placeholder="123" />
              </F>
              <F label="Sport">
                <select className={inp} value={form.sport} onChange={e => upd('sport', e.target.value)}>
                  <option value="">— Select —</option>
                  {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </F>

              <F label="Parallel">
                <input className={inp} value={form.parallel}
                  onChange={e => upd('parallel', e.target.value)} placeholder="Gold, Refractor…" />
              </F>
              {!quickAdd && (
                <F label="Serial #">
                  <input className={inp} value={form.serial_number}
                    onChange={e => upd('serial_number', e.target.value)} placeholder="/99, 1/1" />
                </F>
              )}
            </div>
          </div>

          {/* Attributes — simplified in quick add */}
          <div>
            <div className="text-gray-700 text-[11px] uppercase tracking-widest mb-3">Attributes</div>
            <div className="flex gap-4 flex-wrap">
              {(quickAdd
                ? [['is_auto', 'Auto'], ['is_numbered', 'Numbered'], ['is_insert', 'Insert']]
                : [['is_auto', 'Auto'], ['is_mem', 'Memorabilia'], ['is_numbered', 'Numbered'], ['is_graded', 'Graded'], ['is_insert', 'Insert']]
              ).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={!!form[k]}
                    onChange={() => upd(k, !form[k])}
                    className="w-3.5 h-3.5 accent-blue-500 cursor-pointer" />
                  <span className="text-sm text-gray-400">{l}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Grade / Condition — hidden in quick add */}
          {!quickAdd && (
            form.is_graded ? (
              <div className="grid grid-cols-2 gap-3">
                <F label="Grading Company">
                  <select className={inp} value={form.grading_company} onChange={e => upd('grading_company', e.target.value)}>
                    <option value="">—</option>
                    {GRADING_COS.map(g => <option key={g}>{g}</option>)}
                  </select>
                </F>
                <F label="Grade">
                  <select className={inp} value={form.grade} onChange={e => upd('grade', e.target.value)}>
                    <option value="">—</option>
                    {GRADES.map(g => <option key={g}>{g}</option>)}
                  </select>
                </F>
              </div>
            ) : (
              <F label="Raw Condition">
                <select className={inp} value={form.raw_condition} onChange={e => upd('raw_condition', e.target.value)}>
                  <option value="">—</option>
                  {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </F>
            )
          )}

          {/* Financials */}
          <div>
            <div className="text-gray-700 text-[11px] uppercase tracking-widest mb-3">Financials</div>
            <div className="grid grid-cols-3 gap-3">
              {!quickAdd && (
                <>
                  <F label="Purchase Price ($)">
                    <input type="number" step="0.01" min="0" className={inp}
                      value={form.purchase_price} onChange={e => upd('purchase_price', e.target.value)} placeholder="0.00" />
                  </F>
                  <F label="Purchase Date">
                    <input type="date" className={inp}
                      value={form.purchase_date} onChange={e => upd('purchase_date', e.target.value)} />
                  </F>
                  <F label="Purchased From">
                    <input className={inp} value={form.purchased_from}
                      onChange={e => upd('purchased_from', e.target.value)} placeholder="eBay, LCS…" />
                  </F>
                </>
              )}
              <F label="Current Value ($)">
                <input type="number" step="0.01" min="0" className={inp}
                  value={form.current_value} onChange={e => upd('current_value', e.target.value)} placeholder="0.00" />
              </F>
              <F label="Status">
                <select className={inp} value={form.status} onChange={e => upd('status', e.target.value)}>
                  <option value="owned">Owned</option>
                  <option value="watchlist">Watchlist</option>
                  <option value="whatnot">Whatnot Ammo</option>
                </select>
              </F>
            </div>
          </div>

          {/* Notes — hidden in quick add */}
          {!quickAdd && (
            <div>
              <div className="text-gray-700 text-[11px] uppercase tracking-widest mb-3">Notes</div>
              <textarea rows={2} className={`${inp} resize-none`}
                value={form.notes} onChange={e => upd('notes', e.target.value)}
                placeholder="Any details, provenance, lot info…" />
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1 pb-1">
            <button type="button" onClick={onClose}
              className="text-sm text-gray-600 hover:text-gray-300 px-3 py-2 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className={`text-sm disabled:opacity-50 text-white px-5 py-2 rounded-lg transition-colors font-medium ${
                quickAdd
                  ? 'bg-yellow-600 hover:bg-yellow-500'
                  : 'bg-blue-600 hover:bg-blue-500'
              }`}>
              {saving ? 'Adding…' : 'Add Card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
