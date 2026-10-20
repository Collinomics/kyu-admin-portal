// Meter — the unfilled track is a lighter step of the fill's own ramp
// (blue-on-blue for magnitude; status wash for state), so the whole bar
// reads as one scale. Never color-alone: label + value ship beside it.

interface MeterProps {
  value: number; // 0-100
  label: string;
  display: string;
  kind?: "info" | "status";
  statusValue?: number; // 0-100 where the fill sits on the status scale
}

export function Meter({ value, label, display, kind = "info", statusValue }: MeterProps) {
  const pct = Math.min(100, Math.max(0, value));
  const fill = kind === "status" ? `var(--status-${statusClass(statusValue ?? value)})` : "var(--series-1)";
  const track = kind === "status" ? `var(--status-${statusClass(statusValue ?? value)}-wash)` : "var(--ramp-1)";
  return (
    <div className="meter">
      <div className="meter-head">
        <span className="small" style={{ color: "var(--ink-2)", fontWeight: 600 }}>{label}</span>
        <span className="small mono-nums" style={{ fontWeight: 700 }}>{display}</span>
      </div>
      <div className="meter-track" style={{ background: track }}>
        <div className="meter-fill" style={{ width: `${pct}%`, background: fill }} />
      </div>
    </div>
  );
}

function statusClass(v: number): "good" | "warning" | "serious" | "critical" {
  if (v >= 97) return "good";
  if (v >= 90) return "warning";
  if (v >= 75) return "serious";
  return "critical";
}
