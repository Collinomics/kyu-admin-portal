// Number & time formatting shared by charts and tables.

const nf = new Intl.NumberFormat("en-US");

export const fmtInt = (v: number): string => nf.format(Math.round(v));

export const fmtCompact = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (abs >= 1000) return nf.format(Math.round(v));
  return String(Math.round(v));
};

export const fmtMs = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`);

export const fmtPct = (v: number, digits = 2): string => `${v.toFixed(digits)}%`;

export const fmtBytes = (kb: number): string =>
  kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const fmtClock = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export const fmtDay = (ts: number): string => {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

export const fmtDayDow = (ts: number): string => {
  const d = new Date(ts);
  return `${DOW[d.getDay()]} ${d.getDate()}`;
};

export const fmtDateTime = (ts: number): string => `${fmtDay(ts)} ${fmtClock(ts)}`;

export const fmtAgo = (ts: number): string => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 14 ? `${d}d ago` : fmtDay(ts);
};

/** Clean axis ticks: round to 1/2/5 × 10^n steps. */
export function niceTicks(max: number, count = 5): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.5; v += step) ticks.push(v);
  return ticks;
}

/** Spread `count` tick indexes evenly across n points. */
export function spreadTicks(n: number, count: number): number[] {
  if (n <= count) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>([0, n - 1]);
  const step = (n - 1) / (count - 1);
  for (let k = 1; k < count - 1; k++) out.add(Math.round(k * step));
  return [...out].sort((a, b) => a - b);
}
