// Horizontal bar chart for nominal categories — ONE series, so every bar
// wears the same slot-1 hue (never a value ramp on nominal data), values sit
// at the bar tip (outside the bar end), per-bar tooltip, no legend box
// (the title names the series).

import { useMemo, useRef, useState } from "react";
import { useMeasure } from "./useMeasure";
import { niceTicks } from "./format";

interface HBarsProps {
  items: { label: string; value: number }[];
  valueFormat?: (v: number) => string;
}

const BAR_H = 26;
const GAP = 10;
const M = { top: 8, right: 56, bottom: 20, left: 170 };

export function HBars({ items, valueFormat = (v) => String(v) }: HBarsProps) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const height = items.length * (BAR_H + GAP) + M.top + M.bottom;
  const innerW = Math.max(0, width - M.left - M.right);

  const yMax = useMemo(() => Math.max(1, ...items.map((i) => i.value)) * 1.06, [items]);
  const xTicks = useMemo(() => niceTicks(yMax, 4), [yMax]);

  if (width < 10) return <div ref={ref} style={{ height }} />;

  const xAt = (v: number) => M.left + (v / yMax) * innerW;
  const yAt = (i: number) => M.top + i * (BAR_H + GAP) + BAR_H / 2;

  return (
    <div ref={ref}>
      <div ref={wrapRef} style={{ position: "relative", height }}>
        <svg width={width} height={height} style={{ display: "block" }}>
          {xTicks.map((t) => (
            <line key={t} x1={xAt(t)} x2={xAt(t)} y1={M.top} y2={height - M.bottom} stroke="var(--gridline)" strokeWidth={1} />
          ))}
          <line x1={M.left} x2={M.left} y1={M.top} y2={height - M.bottom} stroke="var(--baseline)" strokeWidth={1} />
          {xTicks.map((t) => (
            <text key={t} x={xAt(t)} y={height - 4} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {valueFormat(t)}
            </text>
          ))}

          {items.map((it, i) => {
            const w = xAt(it.value) - M.left;
            const hovered = active === i;
            return (
              <g
                key={it.label}
                opacity={active === null || hovered ? 1 : 0.6}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                tabIndex={0}
              >
                <text x={M.left - 12} y={yAt(i) + 3.5} textAnchor="end" fontSize={11} fill="var(--ink-2)" fontWeight={600}>
                  {it.label}
                </text>
                {/* bar: square at baseline, 4px rounded at the data-end */}
                <rect x={M.left} y={yAt(i) - 7} width={Math.max(2, w)} height={14} rx={4} fill="var(--series-1)" />
                {/* value at the tip — outside the bar end, ink token */}
                <text x={xAt(it.value) + 7} y={yAt(i) + 3.5} fontSize={11} fontWeight={700} fill="var(--ink-1)" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {valueFormat(it.value)}
                </text>
                {/* transparent hit area — bigger than the mark */}
                <rect x={0} y={yAt(i) - (BAR_H + GAP) / 2} width={width} height={BAR_H + GAP} fill="transparent" />
              </g>
            );
          })}
        </svg>

        {active !== null && (
          <div className="chart-tip" style={{ left: Math.min(xAt(items[active].value) + 12, width - 150), top: yAt(active) - 14 }} role="tooltip">
            <div className="tip-x">{items[active].label}</div>
            <div className="tip-row">
              <span className="swatch sm" style={{ background: "var(--series-1)" }} />
              <span className="tip-label">Queries (30d)</span>
              <span className="tip-value">{valueFormat(items[active].value)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
