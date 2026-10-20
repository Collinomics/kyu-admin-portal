import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone: string; // classes for the icon chip
}

export default function KyStatCard({ label, value, hint, icon: Icon, tone }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold text-gray-800 leading-tight">{value}</p>
        <p className="text-xs text-gray-500 truncate">{label}</p>
        {hint && <p className="text-[10px] text-gray-400 truncate">{hint}</p>}
      </div>
    </div>
  );
}