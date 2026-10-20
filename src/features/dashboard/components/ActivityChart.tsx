interface Props { data: Array<{ month: string; value: number }>; loading?: boolean; }

export default function ActivityChart({ data, loading = false }: Props) {
  const max = Math.max(1, ...data.map((m) => m.value));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-700">System Activity</h3>
          <p className="text-[11px] text-slate-400">Recorded actions per month ({new Date().getFullYear()})</p>
        </div>
        <span className="text-[10px] font-mono text-slate-400">{loading ? 'loading…' : `peak ${Math.max(0, ...data.map((m) => m.value))}`}</span>
      </div>

      <div className="flex items-end gap-1.5 md:gap-2 h-44">
        {data.map((m) => (
          <div key={m.month} className="flex-1 h-full flex flex-col items-center justify-end gap-1" title={`${m.month}: ${m.value}`}>
            <div
              className="w-full max-w-[26px] rounded-t-md bg-gradient-to-t from-kyu-blue to-kyu-orange hover:opacity-75 transition-opacity cursor-pointer"
              style={{ height: `${(m.value / max) * 88}%` }}
            />
            <span className="text-[9px] font-semibold text-slate-400">{m.month}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
