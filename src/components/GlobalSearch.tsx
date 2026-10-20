import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, BookOpen, Megaphone, LoaderCircle } from 'lucide-react';
import { searchPortal, type GlobalSearchResult } from '../services/globalSearchService';

export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      setError('');
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      searchPortal(term, controller.signal)
        .then(setResults)
        .catch((reason) => {
          if (!controller.signal.aborted) {
            setResults([]);
            setError(reason instanceof Error ? reason.message : 'Search is temporarily unavailable.');
          }
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const icons = { user: Users, programme: BookOpen, call: Megaphone } as const;
  const paths = { user: '/admin/users', programme: '/admin/programmes', call: '/admin/admissions' } as const;
  const showPanel = focused && q.trim().length >= 2;

  const openResult = (result: GlobalSearchResult) => {
    const params = new URLSearchParams({ search: result.search, target: result.id });
    navigate(`${paths[result.type]}?${params.toString()}`);
    setQ('');
    setFocused(false);
  };

  return (
    <div className="relative flex-1 max-w-md min-w-0">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={(event) => { if (event.key === 'Escape') setFocused(false); }}
        placeholder="Search people, programmes, calls…"
        aria-label="Search the staff portal"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-100 focus:bg-white border border-transparent focus:border-kyu-blue focus:outline-none focus:ring-2 focus:ring-kyu-blue/30 text-sm transition-colors"
      />
      {showPanel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFocused(false)} />
          <div id="global-search-results" className="absolute left-0 right-0 mt-2 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden" role="listbox">
            {loading ? (
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin" /> Searching secure records…</div>
            ) : error ? (
              <p className="px-4 py-4 text-sm text-red-600">{error}</p>
            ) : results.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500">No records in your access scope match “{q.trim()}”.</p>
            ) : (
              <ul className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {results.map((r) => {
                const Icon = icons[r.type];
                return (
                  <li key={`${r.type}-${r.id}`}>
                    <button onClick={() => openResult(r)} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-left" role="option">
                      <Icon size={15} className="text-kyu-blue shrink-0" />
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-800 truncate">{r.label}</span><span className="block text-[11px] text-gray-400 truncate">{r.sub}</span></span>
                    </button>
                  </li>
                );
              })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
