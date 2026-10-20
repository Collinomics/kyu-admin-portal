// Chart card — the container every chart mounts on. Owns the title/caption,
// the table-view toggle (the WCAG-clean twin of every chart), and the
// stale/reduced-opacity state while data refetches (no skeleton, no layout jump).

import { useRef, useState, type ReactNode } from "react";
import { Table2, ChartLine } from "lucide-react";
import { fmtInt, fmtPct, fmtMs, fmtBytes, fmtDateTime } from "./format";

export type TableCell = string | number | { v: string | number; align?: "left" | "right"; mono?: boolean };

export interface ChartTable {
  headers: string[];
  rows: TableCell[][];
}

interface ChartCardProps {
  title: string;
  hint?: string;
  table?: ChartTable;
  tools?: ReactNode;
  children: ReactNode;
  /** reduced opacity while a refetch is in flight */
  stale?: boolean;
  className?: string;
}

export function ChartCard({ title, hint, table, tools, children, stale, className }: ChartCardProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const bodyRef = useRef<HTMLDivElement>(null);

  const renderedCell = (c: TableCell): string => {
    if (typeof c === "string" || typeof c === "number") return String(c);
    return c.v.toString();
  };

  return (
    <div className={`card ${className ?? ""}`}>
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {hint ? <div className="hint">{hint}</div> : null}
        </div>
        <div className="tools">
          {tools}
          {table ? (
            <div className="seg" role="tablist" aria-label={`${title} view`}>
              <button
                className={view === "chart" ? "on" : ""}
                onClick={() => setView("chart")}
                aria-label="Chart view"
                title="Chart view"
              >
                <ChartLine size={14} style={{ verticalAlign: "-2px" }} />
              </button>
              <button
                className={view === "table" ? "on" : ""}
                onClick={() => setView("table")}
                aria-label="Table view"
                title="Table view"
              >
                <Table2 size={14} style={{ verticalAlign: "-2px" }} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div
        ref={bodyRef}
        className="chart-body"
        style={{ opacity: stale ? 0.55 : 1, transition: "opacity 180ms ease" }}
      >
        {view === "chart" || !table ? (
          children
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {table.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="row-hover">
                    {row.map((c, j) => {
                      const cell = typeof c === "object" ? c : { v: c };
                      return (
                        <td
                          key={j}
                          style={{
                            textAlign: cell.align ?? (j === 0 ? "left" : "right"),
                            fontFamily: cell.mono
                              ? "ui-monospace, Consolas, monospace"
                              : undefined,
                          }}
                        >
                          {renderedCell(c)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Reusable cell formatters for table views
export const cellInt = (v: number): TableCell => ({ v: fmtInt(v), align: "right" });
export const cellPct = (v: number, digits = 2): TableCell => ({ v: fmtPct(v, digits), align: "right" });
export const cellMs = (v: number): TableCell => ({ v: fmtMs(v), align: "right" });
export const cellBytes = (v: number): TableCell => ({ v: fmtBytes(v), align: "right" });
export const cellDateTime = (v: number): TableCell => ({ v: fmtDateTime(v), align: "left", mono: true });
export const cellText = (v: string): TableCell => ({ v, align: "left" });
