// 12-point sparkline — de-emphasis hue with the current point in the
// accent, per the stat-tile figure contract. No axes, no legend.

import { useMemo } from "react";

export function Sparkline({ values }: { values: number[] }) {
  const pts = useMemo(() => {
    if (values.length < 2) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const w = 100;
    const h = 24;
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - 2 - ((v - min) / span) * (h - 4);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [values]);

  if (!pts) return null;
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke="var(--deemph)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* last point in the accent */}
      {(() => {
        const [x, y] = pts.split(" ").slice(-1)[0].split(",").map(Number);
        return (
          <circle cx={x} cy={y} r={2.6} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={1.4} />
        );
      })()}
    </svg>
  );
}
