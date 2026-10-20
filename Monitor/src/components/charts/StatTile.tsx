// Stat tile — the figure contract: label (sentence case, no colon) · value
// (sans semibold, auto-compact) · delta (signed, vs a named period; color =
// direction × whether up is good) · 12-point sparkline (de-emphasis hue,
// last point in the accent).

import type { ReactNode } from "react";
import { Sparkline } from "./Sparkline";

interface StatTileProps {
  label: string;
  value: string;
  delta?: { text: string; dir: "up" | "down"; good: boolean; vs: string };
  spark?: number[];
  icon?: ReactNode;
  /** live badge — pulses the value */
  live?: boolean;
}

export function StatTile({ label, value, delta, spark, icon, live }: StatTileProps) {
  const deltaClass = delta ? `${delta.dir}-${delta.good ? "good" : "bad"}` : "";
  return (
    <div className="stat-tile">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="label">{label}</span>
        {live ? (
          <span className="live-dot good" title="Live" style={{ width: 7, height: 7 }} />
        ) : icon ? (
          <span style={{ color: "var(--ink-3)", display: "flex" }}>{icon}</span>
        ) : null}
      </div>
      <div className="value">{value}</div>
      {delta ? (
        <div className={`delta ${deltaClass}`}>
          <span>{delta.dir === "up" ? "▲" : "▼"} {delta.text}</span>
          <span className="vs">vs {delta.vs}</span>
        </div>
      ) : null}
      {spark ? (
        <div className="spark">
          <Sparkline values={spark} />
        </div>
      ) : null}
    </div>
  );
}
