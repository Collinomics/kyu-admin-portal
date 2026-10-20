// Activity heatmap — weekday × hour grid of average messages.
// Sequential encoding: ONE hue (blue), 4 ordinal bins validated
// (docs/validation.md), plus the surface color for zero activity.
// Each cell carries its own hover/focus tooltip; a scale legend with
// "low → high" labels sits below.

import { useMemo, useRef, useState } from "react";
import { useMeasure } from "./useMeasure";
import { fmtInt } from "./format";

// grid[weekday 0-6 (Sun..Sat)][hour 0-23] -> avg messages
interface HeatmapProps {
  grid: number[][];
  dayLabels?: string[];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS_LABELED = [0, 3, 6, 9, 12, 15, 18, 21];
const M = { top: 6, right: 8, bottom: 30, left: 34 };

/** Map a value to one of the 4 validated ordinal bins (plus 0 = empty). */
function binOf(v: number, max: number): number {
  if (v <= 0) return 0;
  const edges = [0.18, 0.42, 0.68];
  for (let b = 0; b < edges.length; b++) if (v <= max * edges[b]) return b + 1;
  return 4;
}

export function Heatmap({ grid, dayLabels = DAYS }: HeatmapProps) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<[number, number] | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const cellH = 15;
  const gap = 3;
  const height = M.top + 7 * (cellH + gap) - gap + M.bottom;

  const max = useMemo(() => {
    let m = 0;
    for (const row of grid) for (const v of row) if (v > m) m = v;
    return m;
  }, [grid]);

  if (width < 10) return <div ref={ref} style={{ height }} />;

  // reorder Sun-first grid to Mon-first display
  const rows = [1, 2, 3, 4, 5, 6, 0];
  const innerW = width - M.left - M.right;
  const cellW = (innerW - 23 * gap) / 24;
  const xAt = (h: number) => M.left + h * (cellW + gap);
  const yAt = (d: number) => M.top + d * (cellH + gap);
  const rampFill = (bin: number) =>
    bin === 0 ? "var(--surface-hover)" : `var(--ramp-${bin})`;

  const cellTitle = (d: number, h: number) => {
    const v = grid[rows[d]][h];
    const when = `${dayLabels[d]} ${String(h).padStart(2, "0")}:00`;
    return v > 0 ? `${when} — avg ${fmtInt(v)} messages` : `${when} — quiet`;
  };

  return (
    <div ref={ref}>
      <div ref={wrapRef} style={{ position: "relative", height }}>
        <svg width={width} height={height} style={{ display: "block" }}>
          {rows.map((sunIdx, d) => (
            <text key={sunIdx} x={M.left - 8} y={yAt(d) + cellH / 2 + 3.5} textAnchor="end" fontSize={10.5} fill="var(--ink-3)" fontWeight={600}>
              {dayLabels[d]}
            </text>
          ))}
          {HOURS_LABELED.map((h) => (
            <text key={h} x={xAt(h) + cellW / 2} y={height - 8} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {String(h).padStart(2, "0")}
            </text>
          ))}
          {rows.map((sunIdx, d) =>
            Array.from({ length: 24 }, (_, h) => {
              const bin = binOf(grid[sunIdx][h], max);
              const isActive = active?.[0] === d && active?.[1] === h;
              return (
                <rect
                  key={`${sunIdx}-${h}`}
                  x={xAt(h)}
                  y={yAt(d)}
                  width={cellW}
                  height={cellH}
                  rx={3}
                  fill={rampFill(bin)}
                  stroke={isActive ? "var(--baseline)" : "none"}
                  strokeWidth={1.5}
                  onMouseEnter={() => setActive([d, h])}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive([d, h])}
                  onBlur={() => setActive(null)}
                  tabIndex={0}
                  role="img"
                  aria-label={cellTitle(d, h)}
                >
                  <title>{cellTitle(d, h)}</title>
                </rect>
              );
            }),
          )}
        </svg>

        {active && (
          <div
            className="chart-tip"
            style={{
              left: Math.min(Math.max(xAt(active[1]) + cellW / 2 - 60, 8), width - 170),
              top: Math.min(yAt(active[0]) - 8, height - 78),
            }}
            role="tooltip"
          >
            <div className="tip-x">{cellTitle(active[0], active[1])}</div>
          </div>
        )}

        {/* scale legend */}
        <div className="scale-legend">
          <span className="muted small">low</span>
          {[1, 2, 3, 4].map((b) => (
            <span key={b} className="scale-swatch" style={{ background: `var(--ramp-${b})` }} />
          ))}
          <span className="muted small">high</span>
        </div>
      </div>
    </div>
  );
}
