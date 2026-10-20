import type { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  value: string | number;
  hint: string;
  tone: string;
  icon: LucideIcon;
  onClick?: () => void;
  onIntent?: () => void;
}

export default function StatCard({ label, value, hint, tone, icon: Icon, onClick, onIntent }: Props) {
  const content = <>
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tone}`}>
        <Icon size={18} />
      </div>
    </div>
    <p className="mt-1 text-2xl font-extrabold text-slate-800">{value}</p>
    <p className="mt-1 text-[11px] font-semibold text-slate-500">{hint}</p>
  </>;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onIntent}
        onFocus={onIntent}
        onTouchStart={onIntent}
        aria-label={`View ${label.toLowerCase()}`}
        className="group w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-kyu-blue/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-kyu-blue focus-visible:ring-offset-2"
      >
        {content}
        <span className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-kyu-blue opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">View details →</span>
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
      {content}
    </div>
  );
}
