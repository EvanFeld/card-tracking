const NAV_ITEMS = [
  { id: 'collection', label: 'Collection',   icon: '▤' },
  { id: 'ledger',     label: 'Sales Ledger', icon: '$' },
  { id: 'watchlist',  label: 'Watchlist',    icon: '◎' },
  { id: 'analytics',  label: 'Analytics',    icon: '▲' },
  { id: 'scanner',    label: 'Scanner',      icon: '⚡' },
  { id: 'grading',    label: 'Grade Advisor', icon: '🔬' }
];

export default function Nav({ page, setPage }) {
  return (
    <nav className="w-44 bg-[#161b27] border-r border-gray-800 flex flex-col flex-shrink-0">
      <div className="px-4 py-4 border-b border-gray-800">
        <div className="text-blue-400 font-bold text-base tracking-tight leading-none">CardTracker</div>
        <div className="text-gray-600 text-xs mt-1">Portfolio Intelligence</div>
      </div>

      <ul className="mt-1 flex-1">
        {NAV_ITEMS.map(item => (
          <li key={item.id}>
            <button
              onClick={() => setPage(item.id)}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors border-r-2 ${
                page === item.id
                  ? 'bg-blue-600/15 text-blue-400 border-blue-500'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800/50 border-transparent'
              }`}
            >
              <span className="font-mono text-xs w-4 text-center opacity-70">{item.icon}</span>
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="px-4 py-3 border-t border-gray-800">
        <div className="text-gray-700 text-xs">v1.0.0 · Local</div>
      </div>
    </nav>
  );
}
