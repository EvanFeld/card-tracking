import { useEffect } from 'react';
import useCardStore from '../store/cardStore';

const SPORTS = ['baseball', 'football', 'basketball', 'hockey', 'soccer'];
const CONDITIONS = ['Poor', 'Fair', 'Good', 'VG', 'EX', 'NM', 'NM-MT', 'MINT', 'GEM-MT'];
const PSA_GRADES = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'];

const sel = 'bg-[#0f1117] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-400 focus:outline-none focus:border-blue-500 cursor-pointer';
const inp = 'bg-[#0f1117] border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-blue-500';

export default function FilterBar({ onAdd }) {
  const { filters, setFilters, fetchCards } = useCardStore();

  const upd = (key, val) => setFilters({ ...filters, [key]: val });

  useEffect(() => {
    fetchCards();
  }, [JSON.stringify(filters)]);

  const clear = () => setFilters({
    sport: '', brand: '', graded: '', grade: '', raw_condition: '', status: 'owned', player_name: ''
  });

  const activeCount = Object.entries(filters).filter(([k, v]) => v !== '' && k !== 'status').length;

  return (
    <div className="bg-[#13192a] border-b border-gray-800 px-4 py-2 flex gap-2 flex-wrap items-center flex-shrink-0">
      <input
        type="text"
        placeholder="Search player..."
        value={filters.player_name}
        onChange={e => upd('player_name', e.target.value)}
        className={`${inp} w-40`}
      />

      <select value={filters.sport} onChange={e => upd('sport', e.target.value)} className={sel}>
        <option value="">All Sports</option>
        {SPORTS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
      </select>

      <input
        type="text"
        placeholder="Brand..."
        value={filters.brand}
        onChange={e => upd('brand', e.target.value)}
        className={`${inp} w-28`}
      />

      <select value={filters.graded} onChange={e => upd('graded', e.target.value)} className={sel}>
        <option value="">Graded / Raw</option>
        <option value="true">Graded only</option>
        <option value="false">Raw only</option>
      </select>

      {filters.graded === 'true' && (
        <select value={filters.grade} onChange={e => upd('grade', e.target.value)} className={sel}>
          <option value="">All Grades</option>
          {PSA_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      )}

      {filters.graded === 'false' && (
        <select value={filters.raw_condition} onChange={e => upd('raw_condition', e.target.value)} className={sel}>
          <option value="">All Conditions</option>
          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}

      {activeCount > 0 && (
        <button onClick={clear} className="text-gray-600 hover:text-gray-300 text-xs px-1.5 py-1.5 transition-colors">
          Clear ({activeCount})
        </button>
      )}

      <div className="flex-1" />

      {/* View mode toggle */}
      <div className="flex items-center bg-[#0d1120] border border-gray-700 rounded-full p-0.5 gap-0.5">
        <button
          onClick={() => upd('status', 'owned')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            filters.status === 'owned' || filters.status === ''
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Collection
        </button>
        <button
          onClick={() => upd('status', 'whatnot')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            filters.status === 'whatnot'
              ? 'bg-yellow-500 text-black'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          🟡 Whatnot Ammo
        </button>
      </div>

      <button
        onClick={onAdd}
        className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded transition-colors font-medium"
      >
        + Add Card
      </button>
    </div>
  );
}
