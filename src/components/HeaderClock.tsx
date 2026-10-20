import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';

const time = new Intl.DateTimeFormat('en-UG', { timeZone: 'Africa/Kampala', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const date = new Intl.DateTimeFormat('en-UG', { timeZone: 'Africa/Kampala', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

export default function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="hidden xl:flex items-center gap-2 border-l border-slate-200 pl-3 text-right" aria-label={`${date.format(now)}, ${time.format(now)} East Africa Time`}>
    <Clock3 size={16} className="text-kyu-blue" />
    <div className="leading-tight">
      <p className="font-mono text-xs font-bold text-slate-700">{time.format(now)}</p>
      <p className="text-[10px] text-slate-500">{date.format(now)} · EAT</p>
    </div>
  </div>;
}
