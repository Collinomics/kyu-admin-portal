// Audit log — searchable, filterable, paginated event trail with CSV export
// and expandable rows. Refetches on the live tick; previous results hold at
// reduced opacity (no skeleton, no layout jump).

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, Search, ChevronDown, ChevronRight, Inbox } from "lucide-react";
import {
  fetchAudit,
  REAL_API,
  type AuditQuery,
  type RangeKey,
  RANGE_LABELS,
} from "../services/monitoringService";
import type { AuditAction, AuditEvent, AuditSeverity } from "../data/mockEngine";
import { fmtDateTime, fmtInt } from "../components/charts/format";
import { useBackgroundRefresh } from "../../../src/hooks/useBackgroundRefresh";
import { prefetchApi } from "../../../src/services/api";

const PAGE_SIZE = 15;

const ACTIONS: AuditAction[] = [
  "chat.message",
  "chat.feedback",
  "chat.session",
  "auth.login",
  "auth.signup",
  "doc.upload",
  "doc.chunked",
  "doc.reindex",
  "doc.failed",
  "config.update",
  "api.error",
  "index.health",
];

const SEVERITIES: AuditSeverity[] = ["info", "warning", "critical"];

function buildCsv(events: AuditEvent[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = ["time", "actor", "action", "severity", "detail", "session"];
  const rows = events.map((e) =>
    [new Date(e.ts).toISOString(), e.actor, e.action, e.severity, e.detail, e.sessionId].map(esc).join(","),
  );
  return [head.join(","), ...rows].join("\r\n");
}

export function AuditLogPage() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<AuditSeverity | "all">("all");
  const [action, setAction] = useState<AuditAction | "all">("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ events: AuditEvent[]; total: number; page: number; pageCount: number } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useBackgroundRefresh(async () => {
    const next = await fetchAudit({ search, severity, action, range, page, pageSize: PAGE_SIZE });
    setResult(next);
    setError("");
  }, "operational");

  useEffect(() => {
    if (!REAL_API) return;
    for (const targetPage of [page - 1, page + 1]) {
      if (targetPage < 1 || targetPage > (result?.pageCount ?? 1)) continue;
      const params = new URLSearchParams({ endpoint: "events", range, page: String(targetPage), pageSize: String(PAGE_SIZE) });
      if (search) params.set("q", search);
      if (severity !== "all") params.set("severity", severity);
      if (action !== "all") params.set("action", action);
      void prefetchApi(`/api/v1/admin/ai-monitor?${params}`);
    }
  }, [page, result?.pageCount, search, severity, action, range]);

  // Refetch when filters change. Background live polling is independent so
  // it cannot repeatedly enqueue the full audit query.
  useEffect(() => {
    let alive = true;
    const currentQuery: AuditQuery = { search, severity, action, range, page, pageSize: PAGE_SIZE };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setError("");
      fetchAudit(currentQuery).then((r) => {
        if (alive) setResult((prev) => (prev && prev.total > 0 && r.total === 0 && currentQuery.page > 1 ? prev : r));
      }).catch((reason) => {
        if (alive) setError(reason instanceof Error ? reason.message : "The audit trail could not be loaded.");
      });
    }, search ? 260 : 60);
    return () => {
      alive = false;
    };
  }, [search, severity, action, range, page]);

  const onExport = useCallback(async () => {
    setExporting(true);
    try {
      const all = await fetchAudit({ search, severity, action, range, page: 1, pageSize: 50_000 });
      const blob = new Blob([buildCsv(all.events)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kyu-audit-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The audit export could not be created.");
    } finally {
      setExporting(false);
    }
  }, [search, severity, action, range]);

  const events = result?.events ?? null;

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1>Audit Log</h1>
          <div className="sub">Every applicant interaction, admin action and system event</div>
        </div>
        <button className="btn" onClick={onExport} disabled={exporting || !result}>
          <Download size={15} />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {error && (
        <div className="card" role="alert" style={{ marginBottom: 14, borderColor: "rgba(208, 59, 59, 0.35)", color: "var(--status-critical)" }}>
          {error} No demo events have been substituted.
        </div>
      )}

      <div className="filter-row">
        <div className="filter-field">
          <Search size={14} />
          <input
            className="search"
            type="search"
            placeholder="Search detail, actor or action…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search audit log"
          />
        </div>
        <div className="filter-field">
          <label htmlFor="sev">Severity</label>
          <select id="sev" value={severity} onChange={(e) => { setSeverity(e.target.value as AuditSeverity | "all"); setPage(1); }}>
            <option value="all">All</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="act">Action</label>
          <select id="act" value={action} onChange={(e) => { setAction(e.target.value as AuditAction | "all"); setPage(1); }}>
            <option value="all">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="seg" role="tablist" aria-label="Date range">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
            <button key={k} className={range === k ? "on" : ""} onClick={() => { setRange(k); setPage(1); }} role="tab" aria-selected={range === k}>
              {RANGE_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="filter-spacer" />
        {result && (
          <span className="small muted">
            {fmtInt(result.total)} event{result.total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="card" style={{ padding: "8px 12px 12px" }}>
        <div className="chart-body">
          {events === null ? (
            <div className="empty-state">
              <div className="e-title">Loading audit trail…</div>
            </div>
          ) : events.length === 0 ? (
            <div className="empty-state">
              <Inbox size={28} />
              <div className="e-title">No events match the current filters</div>
              <div className="small">Try widening the date range or clearing the search</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 30 }} />
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Severity</th>
                    <th style={{ width: "38%" }}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => {
                    const open = expanded === e.id;
                    return (
                      <FragmentRow key={e.id}>
                        <tr
                          className="row-hover"
                          style={{ cursor: "pointer" }}
                          onClick={() => setExpanded(open ? null : e.id)}
                          aria-expanded={open}
                        >
                          <td style={{ color: "var(--ink-3)" }}>
                            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="nowrap">{fmtDateTime(e.ts)}</td>
                          <td className="mono" title={e.actor}>{e.actor.slice(0, 8)}…</td>
                          <td>
                            <span className="badge neutral" style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.68rem" }}>
                              {e.action}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${e.severity}`}>{e.severity}</span>
                          </td>
                          <td>{e.detail}</td>
                        </tr>
                        {open && (
                          <tr>
                            <td />
                            <td colSpan={5} style={{ background: "var(--surface-hover)", borderRadius: 8 }}>
                              <div className="small" style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 2px" }}>
                                <span>
                                  <strong>Event ID:</strong> <span className="mono">{e.id}</span>
                                </span>
                                <span>
                                  <strong>Session:</strong> <span className="mono">{e.sessionId}</span>
                                </span>
                                <span>
                                  <strong>Raw event:</strong>{" "}
                                  <code className="mono" style={{ fontSize: "0.72rem", wordBreak: "break-all" }}>
                                    {JSON.stringify(e)}
                                  </code>
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </FragmentRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {result && result.total > 0 && (
          <div className="pager">
            <span className="muted">
              Page {result.page} of {result.pageCount} · {PAGE_SIZE} per page
            </span>
            <div className="pages">
              <button onClick={() => setPage(1)} disabled={result.page <= 1} aria-label="First page">«</button>
              <button onClick={() => setPage(result.page - 1)} disabled={result.page <= 1} aria-label="Previous page">‹</button>
              {Array.from({ length: Math.min(5, result.pageCount) }, (_, i) => {
                const start = Math.max(1, Math.min(result.page - 2, result.pageCount - 4));
                const p = start + i;
                if (p > result.pageCount) return null;
                return (
                  <button key={p} className={p === result.page ? "on" : ""} onClick={() => setPage(p)}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage(result.page + 1)} disabled={result.page >= result.pageCount} aria-label="Next page">›</button>
              <button onClick={() => setPage(result.pageCount)} disabled={result.page >= result.pageCount} aria-label="Last page">»</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// tiny helper so each event renders as two <tr>s inside a fragment
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
