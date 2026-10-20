// Loading placeholders for cards, tables and text lines
export default function KySkeleton({ variant = 'lines', rows = 4 }: { variant?: 'lines' | 'cards' | 'table'; rows?: number }) {
  const bar = 'animate-pulse rounded bg-gray-200';

  if (variant === 'cards') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className={`${bar} h-3 w-1/2`} />
            <div className={`${bar} h-6 w-1/3`} />
            <div className={`${bar} h-3 w-2/3`} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className={`${bar} h-8 w-full`} />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={`${bar} h-10 w-full`} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${bar} h-3.5`} style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}