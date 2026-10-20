interface AuditItem { id: string; time: string; actor: string; action: string; }
interface Props { events: AuditItem[]; loading?: boolean; }

export default function AuditFeed({ events, loading = false }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">Live Audit Trail</h3>
        <span className="text-[10px] font-mono text-gray-400">append-only</span>
      </div>
      {events.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-400">{loading ? 'Loading recent activity…' : 'No activity has been recorded yet.'}</p>
      ) : <ul className="divide-y divide-gray-50">
        {events.map((e) => (
          <li key={e.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-gray-50">
            <span className="font-mono text-[11px] text-gray-400 pt-0.5 shrink-0">{e.time}</span>
            <div className="min-w-0">
              <p className="text-sm text-gray-700">{e.action}</p>
              <p className="text-[11px] text-gray-400">
                actor: <span className="font-mono">{e.actor}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>}
    </div>
  );
}
