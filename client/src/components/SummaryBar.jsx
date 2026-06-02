import useCardStore from '../store/cardStore';

function fmtMoney(val) {
  if (val === null || val === undefined) return '—';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

export default function SummaryBar() {
  const { summary, cards } = useCardStore();

  const ownedCount = cards.filter(c => c.status === 'owned').length;

  const metrics = [
    {
      label: 'Portfolio Value',
      value: fmtMoney(summary?.portfolioValue),
      sub: `${ownedCount} card${ownedCount !== 1 ? 's' : ''}`,
      color: 'text-blue-400'
    },
    {
      label: 'Total Spent',
      value: fmtMoney(summary?.totalSpent),
      sub: 'all-time cost basis',
      color: 'text-gray-300'
    },
    {
      label: 'Total Earned',
      value: fmtMoney(summary?.totalEarned),
      sub: 'realized sales',
      color: 'text-emerald-400'
    },
    {
      label: 'Net P&L',
      value: fmtMoney(summary?.net),
      sub: 'value + earned − spent',
      color: summary?.net >= 0 ? 'text-emerald-400' : 'text-red-400'
    }
  ];

  return (
    <div className="bg-[#161b27] border-b border-gray-800 px-5 py-3 flex gap-8 flex-shrink-0">
      {metrics.map(m => (
        <div key={m.label} className="flex flex-col min-w-0">
          <span className="text-gray-600 text-xs uppercase tracking-widest leading-none mb-1">{m.label}</span>
          <span className={`text-xl font-semibold font-mono leading-tight ${m.color}`}>{m.value}</span>
          <span className="text-gray-700 text-xs leading-none mt-0.5">{m.sub}</span>
        </div>
      ))}
    </div>
  );
}
