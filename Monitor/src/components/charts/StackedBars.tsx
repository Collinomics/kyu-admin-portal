// Stacked bar chart — 2px surface gaps between segments and between bars
// (never strokes), <=24px-thick bars with a 4px rounded data-end,
// per-bar hover tooltip listing every segment, legend always present,
// direct in-segment labels only where they fit comfortably.

import { useMemo, useRef, useState } from "react";
import { useMeasure } from "./useMeasure";
import { niceTicks, spreadTicks } from "./format";

export interface StackSeries {
  key: string;
  label: string;
  colorVar: string;
  values: number[];
}

interface StackedBarsProps {
  xLabels: string[];
  series: StackSeries[];
  height?: number;
  valueFormat?: (v: number) => string;
}

const M = { top: 10, right: 14, bottom: 24, left: 50 };
const BAR_MAX = 24; // px — thin marks, never fill the slot

export function StackedBars({ xLabels, series, height = 240, valueFormat = (v) => String(v) }: StackedBarsProps) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const n = xLabels.length;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;

  const totals = useMemo(() => xLabels.map((_, i) => series.reduce((s, sr) => s + (sr.values[i] ?? 0), 0)), [xLabels, series]);
  const yMax = useMemo(() => Math.max(1, ...totals) * 1.08, [totals]);
  const yTicks = useMemo(() => niceTicks(yMax), [yMax]);
  const xTicks = useMemo(() => spreadTicks(n, Math.min(7, Math.max(3, Math.floor(width / 110)))), [n, width]);

  const slot = n > 0 ? innerW / n : 0;
  const barW = Math.min(BAR_MAX, Math.max(6, slot - 6));
  const yAt = (v: number) => M.top + innerH - (v / yMax) * innerH;
  const xCenter = (i: number) => M.left + slot * i + slot / 2;

  if (width < 10) return <div ref={ref} style={{ height }} />;

  const onMove = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const i = Math.floor((clientX - rect.left - M.left) / slot);
    setActive(i >= 0 && i < n ? i : null);
  };

  const tooltipLeft = active != null ? Math.min(Math.max(xCenter(active), 110), width - 160) : 0;

  return (
    <div ref={ref}>
      <div className="lac-legend">
        {series.map((s) => (
          <span key={s.key} className="lac-legend-item">
            <span className="swatch" style={{ background: `var(${s.colorVar})` }} />
            {s.label}
          </span>
        ))}
      </div>
      <div
        ref={wrapRef}
        style={{ position: "relative", height }}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setActive(null)}
      >
        <svg width={width} height={height} style={{ display: "block" }}>
          {yTicks.map((t) => (
            <line key={t} x1={M.left} x2={width - M.right} y1={yAt(t)} y2={yAt(t)} stroke="var(--gridline)" strokeWidth={1} />
          ))}
          <line x1={M.left} x2={width - M.right} y1={M.top + innerH} y2={M.top + innerH} stroke="var(--baseline)" strokeWidth={1} />
          {yTicks.map((t) => (
            <text key={t} x={M.left - 8} y={yAt(t) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--ink-3)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {valueFormat(t)}
            </text>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={xCenter(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={10.5} fill="var(--ink-3)">
              {xLabels[i]}
            </text>
          ))}

          {xLabels.map((_, i) => {
            const x = xCenter(i) - barW / 2;
            let acc = 0;
            const segs = series.map((s) => {
              const v = s.values[i] ?? 0;
              const seg = { key: s.key, v, y0: acc };
              acc += v;
              return seg;
            });
            const hovered = active === i;
            return (
              <g key={i} opacity={hovered ? 1 : active === null ? 1 : 0.72}>
                {segs.map((seg, k) => {
                  const yTop = yAt(seg.y0 + seg.v);
                  const yBot = yAt(seg.y0);
                  // 2px surface gap between segments (skip for zero-height segs)
                  const h = Math.max(0, yBot - yTop - 2);
                  const s = series[k];
                  return h > 0.5 ? (
                    <g key={seg.key}>
                      <rect x={x} y={yTop + 1} width={barW} height={h} rx={k === segs.length - 1 ? 4 : 0} fill={`var(${s.colorVar})`} />
                      {seg.v > 0.15 * totals[i] && h > 16 && barW > 34 && (
                        <text
                          x={x + barW / 2}
                          y={yTop + h / 2 + 3.5}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight={700}
                          fill="#ffffff"
                        >
                          {valueFormat(seg.v)}
                        </text>
                      )}
                    </g>
                  ) : null;
                })}
                {/* transparent hit area — bigger than the marks */}
                <rect x={x - 2} y={M.top} width={barW + 4} height={innerH} fill="transparent" />
              </g>
            );
          })}
        </svg>

        {active !== null && (
          <div className="chart-tip" style={{ left: tooltipLeft, top: 4 }} role="tooltip">
            <div className="tip-x">{xLabels[active]}</div>
            {series.map((s) => (
              <div className="tip-row" key={s.key}>
                <span className="swatch sm" style={{ background: `var(${s.colorVar})` }} />
                <span className="tip-label">{s.label}</span>
                <span className="tip-value">{valueFormat(s.values[active] ?? 0)}</span>
              </div>
            ))}
            <div className="tip-row total">
              <span className="swatch sm" style={{ background: "transparent" }} />
              <span className="tip-label">Total</span>
              <span className="tip-value">{valueFormat(totals[active])}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
