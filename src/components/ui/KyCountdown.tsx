import { useEffect, useState } from 'react';

interface Props {
  seconds: number;         // e.g. 900 for 15 min, 30 for resend cooldown
  onExpire?: () => void;   // optional callback when it hits zero
  label: string;           // shown to the left of the digits
  accent?: 'orange' | 'blue';
}

const pad = (n: number) => String(n).padStart(2, '0');

export default function KyCountdown({ seconds, onExpire, label, accent = 'blue' }: Props) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (remaining <= 0) {
      onExpire?.();
      return;
    }
    const t = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(t);
  }, [remaining, onExpire]);

  const pct = (remaining / seconds) * 100;
  const bar = accent === 'orange' ? 'bg-kyu-orange' : 'bg-kyu-blue';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className="text-gray-500">{label}</span>
        <span className="font-bold text-gray-700">{pad(Math.floor(remaining / 60))}:{pad(remaining % 60)}</span>
      </div>
      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${bar} transition-all duration-1000`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}