import type { ReactNode } from 'react';

export type BadgeTone = 'green' | 'orange' | 'red' | 'gray' | 'blue' | 'yellow';

const tones: Record<BadgeTone, string> = {
  green: 'bg-green-100 text-green-700',
  orange: 'bg-kyu-orange/20 text-kyu-orange-dark',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-200 text-gray-600',
  blue: 'bg-kyu-blue/10 text-kyu-blue',
  yellow: 'bg-yellow-100 text-yellow-700',
};

export default function KyBadge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}