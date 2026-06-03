import { useState } from 'react';
import useCardStore from '../store/cardStore';

const STATUS_PILL = {
  owned:     'text-emerald-400',
  sold:      'text-gray-600',
  watchlist: 'text-yellow-500',
  whatnot:   'text-yellow-400'
};

const STATUS_LABEL = {
  whatnot: 'Whatnot'
};

const SPORT_ABBR = {
  baseball:   'BB',
  football:   'FB',
  basketball: 'BKB',
  hockey:     'HK',
  soccer:     'SOC'
};

function fmtMoney(val) {
  if (val === null || val === undefined || val === '') return '—';
  return `$${Number(val).toFixed(2)}`;
}

function plData(purchase, current) {
  if (purchase == null || current == null) return { text: '—', cls: 'text-gray-700' };
  const diff = current - purchase;
  const pct  = purchase !== 0 ? ((diff / purchase) * 100).toFixed(0) : 0;
  const sign = diff >= 0 ? '+' : '';
  return {
    text: `${sign}$${Math.abs(diff).toFixed(2)} (${sign}${pct}%)`,
    cls:  diff >= 0 ? 'text-emerald-400' : 'text-red-400'
  };
}

const COLS = [
  { key: 'player_name',  label: 'Player',      align: 'left' },
  { key: 'year',         label: 'Year',         align: 'right' },
  { key: 'brand',        label: 'Brand',        align: 'left' },
  { key: 'card_set',     label: 'Set',          align: 'left' },
  { key: 'card_number',  label: '#',            align: 'right' },
  { key: 'sport',        label: 'Sport',        align: 'center' },
  { key: 'grade_display',label: 'Grade / Cond', align: 'left' },
  { key: 'purchase_price', label: 'Cost',       align: 'right' },
  { key: 'current_value',  label: 'Value',      align: 'right' },
  { key: 'pl',           label: 'P&L',          align: 'right' },
  { key: 'status',       label: 'Status',       align: 'left' }
];

const WHATNOT_COLS = [
  { key: 'player_name',   label: 'Player', align: 'left'   },
  { key: 'year',          label: 'Year',   align: 'right'  },
  { key: 'brand',         label: 'Brand',  align: 'left'   },
  { key: 'card_set',      label: 'Set',    align: 'left'   },
  { key: 'card_number',   label: '#',      align: 'right'  },
  { key: 'sport',         label: 'Sport',  align: 'center' },
  { key: 'current_value', label: 'Value',  align: 'right'  },
];

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

export default function CardTable() {
  const { cards, loading, setSelectedCard, filters } = useCardStore();
  const isWhatnotView = filters.status === 'whatnot';
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...cards].sort((a, b) => {
    let va, vb;
    if (sortKey === 'grade_display') {
      va = a.is_graded ? (a.grade || '') : (a.raw_condition || '');
      vb = b.is_graded ? (b.grade || '') : (b.raw_condition || '');
    } else if (sortKey === 'pl') {
      va = (a.current_value ?? 0) - (a.purchase_price ?? 0);
      vb = (b.current_value ?? 0) - (b.purchase_price ?? 0);
    } else {
      va = a[sortKey] ?? '';
      vb = b[sortKey] ?? '';
    }
    if (typeof va === 'number' && typeof vb === 'number') {
      return sortDir === 'asc' ? va - vb : vb - va;
    }
    return sortDir === 'asc'
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  return (
    <div className="overflow-x-auto">
      {loading && (
        <div className="px-4 py-2 text-xs text-gray-700 border-b border-gray-800">Loading...</div>
      )}
      <table className="w-full text-sm border-collapse min-w-[900px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[#161b27] border-b border-gray-800">
            {(isWhatnotView ? WHATNOT_COLS : COLS).map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`px-3 py-2.5 text-gray-500 text-xs uppercase tracking-wider font-medium cursor-pointer hover:text-gray-300 whitespace-nowrap select-none ${ALIGN[col.align]}`}
              >
                {col.label}
                <span className="ml-1 inline-block w-3">
                  {sortKey === col.key
                    ? <span className="text-blue-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    : <span className="text-gray-800">↕</span>}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && !loading && (
            <tr>
              <td colSpan={COLS.length} className="px-4 py-16 text-center text-gray-700 text-sm">
                No cards match the current filters. Add your first card above.
              </td>
            </tr>
          )}
          {sorted.map((card, i) => {
            const pl = plData(card.purchase_price, card.current_value);
            const rowBg = card.status === 'whatnot'
              ? (i % 2 === 0 ? 'bg-yellow-900/20' : 'bg-yellow-900/15')
              : (i % 2 === 0 ? 'bg-[#0f1117]' : 'bg-[#111620]');
            const playerCell = (
              <td className="px-3 py-2 text-gray-100 font-medium whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  {card.is_auto       ? <span className="text-yellow-400 text-[10px] font-bold bg-yellow-400/10 px-1 rounded">AU</span> : null}
                  {card.is_mem        ? <span className="text-purple-400 text-[10px] font-bold bg-purple-400/10 px-1 rounded">MEM</span> : null}
                  {card.serial_number ? <span className="text-orange-400 text-[10px] font-bold">{card.serial_number}</span> : null}
                  {card.player_name}
                </div>
              </td>
            );
            const sportCell = (
              <td className="px-3 py-2 text-center">
                {card.sport
                  ? <span className="text-[11px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded font-mono">{SPORT_ABBR[card.sport] || card.sport}</span>
                  : <span className="text-gray-800">—</span>}
              </td>
            );
            return (
              <tr
                key={card.id}
                onClick={() => setSelectedCard(card)}
                className={`${rowBg} border-b border-gray-900 cursor-pointer hover:bg-[#1c2840] transition-colors group`}
              >
                {playerCell}
                <td className="px-3 py-2 text-gray-500 font-mono text-right">{card.year || '—'}</td>
                <td className="px-3 py-2 text-gray-400">{card.brand || '—'}</td>
                <td className="px-3 py-2 text-gray-500 max-w-[140px] truncate" title={card.card_set}>{card.card_set || '—'}</td>
                <td className="px-3 py-2 text-gray-600 font-mono text-xs text-right">{card.card_number ? `#${card.card_number}` : '—'}</td>
                {sportCell}
                {!isWhatnotView && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    {card.is_graded
                      ? <span className="text-blue-300 font-mono text-xs">{[card.grading_company, card.grade].filter(Boolean).join(' ') || '—'}</span>
                      : <span className="text-gray-500 text-xs">{card.raw_condition || '—'}</span>
                    }
                  </td>
                )}
                {!isWhatnotView && (
                  <td className="px-3 py-2 text-gray-500 font-mono text-right">{fmtMoney(card.purchase_price)}</td>
                )}
                <td className="px-3 py-2 text-gray-100 font-mono font-semibold text-right">{fmtMoney(card.current_value)}</td>
                {!isWhatnotView && (
                  <>
                    <td className={`px-3 py-2 font-mono text-xs text-right ${pl.cls}`}>{pl.text}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium capitalize ${STATUS_PILL[card.status] || 'text-gray-500'}`}>
                        {STATUS_LABEL[card.status] || card.status}
                      </span>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length > 0 && (
        <div className="px-4 py-2 text-xs text-gray-700 border-t border-gray-900">
          {sorted.length} card{sorted.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
