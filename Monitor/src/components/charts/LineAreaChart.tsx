// Line / area chart — mark specs per the dataviz method:
// 2px lines (round join/cap), ~10% area wash, hairline solid gridlines,
// >=8px end markers with a 2px surface ring, crosshair that snaps to the
// nearest data position, ONE tooltip listing every series at that x,
// keyboard navigation (arrow keys), legend for >=2 series, selective
// direct end-labels (collision-skipped), text in ink tokens — never the
// series color.

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMeasure } from "./useMeasure";
import { niceTicks, spreadTicks } from "./format";

export interface LineSeries {
  key: string;
  label: string;
  colorVar: string; // CSS custom property name, e.g. "--series-1"
  values: number[];
  area?: boolean;
}

interface LineAreaChartProps {
  xLabels: string[]; // one formatted label per point
  series: LineSeries[];
  height?: number;
  yFormat?: (v: number) => string;
  baseline?: { value: number; label: string };
  areaFor?: string; // series key to render as soft area (single-series emphasis)
}

const M = { top: 10, right: 16, bottom: 24, left: 50 };

export function LineAreaChart({
  xLabels,
  series,
  height = 240,
  yFormat = (v) => String(v),
  baseline,
  areaFor,
}: LineAreaChartProps) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const n = xLabels.length;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;

  const yMax = useMemo(() => {
    let max = 0;
    for (const s of series) for (const v of s.values) if (v > max) max = v;
    if (baseline && baseline.value > max) max = baseline.value;
    return max * 1.08;
  }, [series, baseline]);

  const yTicks = useMemo(() => niceTicks(yMax), [yMax]);
  const xTicks = useMemo(() => spreadTicks(n, Math.min(7, Math.max(3, Math.floor(width / 110)))), [n, width]);

  const xAt = (i: number) => (n <= 1 ? M.left + innerW / 2 : M.left + (innerW * i) / (n - 1));
  const yAt = (v: number) => M.top + innerH - (v / yMax) * innerH;

  const onMove = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const x = clientX - rect.left;
    const i = Math.round(((x - M.left) / innerW) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, i)));
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActive((a) => {
      if (a === null) return e.key === "ArrowRight" ? Math.min(n - 1, 4) : Math.max(0, n - 5);
      return e.key === "ArrowRight" ? Math.min(n - 1, a + 1) : Math.max(0, a - 1);
    });
  };

  const endLabels = useMemo(() => {
    if (series.length > 3 || n === 0) return new Map<string, number>();
    // last value per series, skip pairs closer than 18px to avoid collisions
    const placed: { key: string; y: number }[] = [];
    for (const s of series) {
      const v = s.values[n - 1];
      if (v == null) continue;
      const y = M.top + innerH - (v / yMax) * innerH;
      if (placed.every((p) => Math.abs(p.y - y) > 18)) placed.push({ key: s.key, y });
    }
    return new Map(placed.map((p) => [p.key, p.y]));
  }, [series, n, yMax, innerH]);

  if (width < 10) return <div ref={ref} style={{ height }} />;

  const areaSeries = series.find((s) => s.key === areaFor) ?? (series.length === 1 && series[0].area ? series[0] : null);
  const areaPath = areaSeries
    ? (() => {
        let d = "";
        areaSeries.values.forEach((v, i) => {
          d += `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
        });
        d += `L${xAt(n - 1).toFixed(1)},${(M.top + innerH).toFixed(1)}L${xAt(0).toFixed(1)},${(M.top + innerH).toFixed(1)}Z`;
        return d;
      })()
    : null;

  const activeIdx = active ?? (n > 0 ? n - 1 : 0);
  const tooltipLeft = Math.min(Math.max(xAt(activeIdx), 90), width - 150);

  return (
    <div ref={ref} className="lac">
      {series.length >= 2 && (
        <div className="lac-legend" aria-hidden="false">
          {series.map((s) => (
            <span key={s.key} className="lac-legend-item">
              <span className="line-key" style={{ background: `var(${s.colorVar})` }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div
        ref={wrapRef}
        style={{ position: "relative", height }}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setActive(null)}
        onFocus={() => setActive((a) => a ?? n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
        tabIndex={0}
        role="img"
        aria-label={`Chart: ${series.map((s) => s.label).join(", ")}`}
      >
        <svg width={width} height={height} style={{ display: "block" }}>
          {/* gridlines — solid hairlines, recessive */}
          {yTicks.map((t) => (
            <line
              key={t}
              x1={M.left}
              x2={width - M.right}
              y1={yAt(t)}
              y2={yAt(t)}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
          ))}
          {/* x axis */}
          <line x1={M.left} x2={width - M.right} y1={M.top + innerH} y2={M.top + innerH} stroke="var(--baseline)" strokeWidth={1} />

          {/* y tick labels (ink-3, tabular) */}
          {yTicks.map((t) => (
            <text
              key={t}
              x={M.left - 8}
              y={yAt(t) + 3.5}
              textAnchor="end"
              fontSize={10.5}
              fill="var(--ink-3)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {yFormat(t)}
            </text>
          ))}
          {/* x tick labels */}
          {xTicks.map((i) => (
            <text
              key={i}
              x={xAt(i)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              fontSize={10.5}
              fill="var(--ink-3)"
            >
              {xLabels[i]}
            </text>
          ))}

          {/* baseline (threshold) — solid hairline, neutral */}
          {baseline && (
            <g>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={yAt(baseline.value)}
                y2={yAt(baseline.value)}
                stroke="var(--baseline)"
                strokeWidth={1}
              />
              <text
                x={width - M.right - 4}
                y={yAt(baseline.value) - 5}
                textAnchor="end"
                fontSize={10}
                fill="var(--ink-2)"
                fontWeight={600}
              >
                {baseline.label}
              </text>
            </g>
          )}

          {/* area wash */}
          {areaPath && <path d={areaPath} fill={`var(${areaSeries!.colorVar}-wash)`} />}

          {/* series lines — 2px, round caps/joins */}
          {series.map((s) => (
            <polyline
              key={s.key}
              points={s.values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={`var(${s.colorVar})`}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* end markers — >=8px (r=4) with 2px surface ring */}
          {series.map((s) =>
            s.values[n - 1] != null ? (
              <circle
                key={`end-${s.key}`}
                cx={xAt(n - 1)}
                cy={yAt(s.values[n - 1])}
                r={4}
                fill={`var(${s.colorVar})`}
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            ) : null,
          )}

          {/* crosshair + active markers */}
          {active !== null && (
            <g>
              <line
                x1={xAt(activeIdx)}
                x2={xAt(activeIdx)}
                y1={M.top}
                y2={M.top + innerH}
                stroke="var(--ink-3)"
                strokeWidth={1}
              />
              {series.map((s) =>
                s.values[activeIdx] != null ? (
                  <circle
                    key={`a-${s.key}`}
                    cx={xAt(activeIdx)}
                    cy={yAt(s.values[activeIdx])}
                    r={4.5}
                    fill={`var(${s.colorVar})`}
                    stroke="var(--surface-1)"
                    strokeWidth={2}
                  />
                ) : null,
              )}
            </g>
          )}

          {/* direct end labels — selective, collision-skipped, ink tokens */}
          {series.map((s) => {
            const y = endLabels.get(s.key);
            if (y == null) return null;
            return (
              <text
                key={`el-${s.key}`}
                x={xAt(n - 1) - 9}
                y={y - 8}
                textAnchor="end"
                fontSize={10.5}
                fontWeight={700}
                fill="var(--ink-2)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {yFormat(s.values[n - 1])}
              </text>
            );
          })}
        </svg>

        {/* tooltip — one readout, every series at the active x */}
        {active !== null && (
          <div
            className="chart-tip"
            style={{ left: tooltipLeft, top: 6 }}
            role="tooltip"
          >
            <div className="tip-x">{xLabels[activeIdx]}</div>
            {series.map((s) =>
              s.values[activeIdx] != null ? (
                <div className="tip-row" key={s.key}>
                  <span className="line-key" style={{ background: `var(${s.colorVar})` }} />
                  <span className="tip-label">{s.label}</span>
                  <span className="tip-value">{yFormat(s.values[activeIdx])}</span>
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
    </div>
  );
}
