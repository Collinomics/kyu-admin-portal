// Overview — the main monitoring dashboard.
// One filter row (date presets) above everything it scopes; every chart,
// stat and table re-renders against the same slice. Charts hold their
// previous render at reduced opacity while a refetch is in flight.

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Users,
  MessagesSquare,
  FileStack,
  CircleCheck,
  CircleAlert,
  TriangleAlert as SerIcon,
  CircleX,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck,
  ShieldAlert,
  MessageCircleOff,
} from "lucide-react";
import { fetchOverview, type OverviewSlice, type RangeKey, type ServiceHealth, RANGE_LABELS } from "../services/monitoringService";
import { useLive } from "../hooks/useLive";
import { StatTile } from "../components/charts/StatTile";
import { LineAreaChart } from "../components/charts/LineAreaChart";
import { StackedBars } from "../components/charts/StackedBars";
import { HBars } from "../components/charts/HBars";
import { Heatmap } from "../components/charts/Heatmap";
import { Meter } from "../components/charts/Meter";
import { ChartCard, cellInt, cellMs, cellPct, cellText, type ChartTable } from "../components/charts/ChartCard";
import { fmtInt, fmtCompact, fmtMs, fmtPct, fmtClock, fmtDay, fmtDayDow, fmtAgo } from "../components/charts/format";
import { useBackgroundRefresh } from "../../../src/hooks/useBackgroundRefresh";

const pctChange = (cur: number, prev: number): string => {
  if (!prev) return "—";
  const d = ((cur - prev) / prev) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
};

const STATUS_ICON: Record<ServiceHealth["status"], typeof CircleCheck> = {
  good: CircleCheck,
  warning: CircleAlert,
  serious: SerIcon,
  critical: CircleX,
};

function EndpointRow({ ep }: { ep: ServiceHealth }) {
  const Icon = STATUS_ICON[ep.status];
  return (
    <tr className="row-hover">
      <td>
        <div className="cell-main">{ep.name}</div>
        <div className="cell-sub">{ep.group}</div>
      </td>
      <td>{ep.group}</td>
      <td>
        <span className={`status-pill ${ep.status}`}>
          <span className="dot" />
          <Icon size={12} />
          {ep.status === "good" ? "Operational" : ep.status === "warning" ? "Degraded" : ep.status === "serious" ? "Unstable" : "Down"}
        </span>
      </td>
      <td className="mono-nums">{fmtInt(ep.latencyMs)} ms</td>
      <td className="small" style={{ color: "var(--ink-2)", maxWidth: 220 }}>{ep.statusNote}</td>
    </tr>
  );
}

export function OverviewPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [slice, setSlice] = useState<OverviewSlice | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const live = useLive();

  useBackgroundRefresh(async () => {
    const next = await fetchOverview(range);
    setSlice(next);
    setError("");
  }, "operational");

  // Refetch when the administrator changes the reporting range. Live status
  // updates independently and must not trigger the full analytics workload.
  useEffect(() => {
    let alive = true;
    setError("");
    fetchOverview(range)
      .then((s) => alive && setSlice(s))
      .catch((reason) => alive && setError(reason instanceof Error ? reason.message : "Monitoring data could not be loaded."));
    return () => {
      alive = false;
    };
  }, [range, reloadKey]);

  const stale = slice !== null && slice.range !== range;

  const messagesTable: ChartTable | undefined = useMemo(() => {
    if (!slice) return undefined;
    return {
      headers: ["Time", "Messages", "Users online", "Tokens"],
      rows: slice.trend.map((p) => [
        cellText(range === "today" ? fmtClock(p.ts) : fmtDay(p.ts)),
        cellInt(p.messages),
        cellInt(p.usersOnline ?? 0),
        cellInt(p.tokens),
      ]),
    };
  }, [slice, range]);

  const channelsTable: ChartTable | undefined = useMemo(() => {
    if (!slice) return undefined;
    return {
      headers: ["Day", "Web", "Mobile", "API", "Total"],
      rows: slice.trend.map((p) => [
        cellText(range === "today" ? fmtClock(p.ts) : fmtDay(p.ts)),
        cellInt(p.byChannel?.web ?? 0),
        cellInt(p.byChannel?.mobile ?? 0),
        cellInt(p.byChannel?.api ?? 0),
        cellInt(p.messages),
      ]),
    };
  }, [slice, range]);

  if (!slice) {
    return (
      <main className="page">
        <div className="empty-state">
          <div className="e-title">{error ? "Monitoring data is unavailable" : "Loading monitoring data…"}</div>
          <div className="small">{error || "Preparing current monitoring information"}</div>
          {error && <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setReloadKey((value) => value + 1)}>Try again</button>}
        </div>
      </main>
    );
  }

  const t = slice.totals;
  const p = slice.prevTotals;
  const trend = slice.trend;
  const endpoints = slice.services;
  const docStats = slice.documentStats;
  const spark = (f: (v: (typeof trend)[number]) => number) => trend.slice(-12).map(f);

  const msgsUp = t.messages >= p.messages;

  const xLabels = slice.trend.map((pt) =>
    range === "today" ? fmtClock(pt.ts) : range === "7d" ? fmtDayDow(pt.ts) : fmtDay(pt.ts),
  );

  // real telemetry has no channel column (the widget is one web channel),
  // so series with no data anywhere are dropped before rendering
  const channelSeries = [
    { key: "web", label: "Web widget", colorVar: "--series-1", values: slice.trend.map((pt) => pt.byChannel?.web ?? 0) },
    { key: "mobile", label: "Mobile", colorVar: "--series-2", values: slice.trend.map((pt) => pt.byChannel?.mobile ?? 0) },
    { key: "api", label: "API", colorVar: "--series-3", values: slice.trend.map((pt) => pt.byChannel?.api ?? 0) },
  ].filter((s) => s.values.reduce((a, b) => a + b, 0) > 0);

  const topProg = slice.topProgrammes.slice(0, 10);
  const heatmapTable: ChartTable = {
    headers: ["Day", ...Array.from({ length: 24 }, (_, h) => `${h}h`)],
    rows: [1, 2, 3, 4, 5, 6, 0].map((d) => [
      cellText(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][[1, 2, 3, 4, 5, 6, 0].indexOf(d)]),
      ...slice.heatmap[d].map((v) => cellInt(v)),
    ]),
  };

  const telemetryLatency = endpoints[0]?.latencyMs ?? 0;
  const telemetryLatencyScale = Math.min(100, Math.round((telemetryLatency / 3000) * 100));

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Kyambogo AI Programme catalogue Assistant applicant chat, API health and knowledge-base telemetry</div>
        </div>
        <span className="badge info">
          <Activity size={12} /> Live telemetry
        </span>
      </div>

      {/* one filter row, scopes everything below */}
      <div className="filter-row">
        <span className="small" style={{ fontWeight: 700, color: "var(--ink-2)" }}>Range</span>
        <div className="seg" role="tablist" aria-label="Date range">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
            <button key={k} className={range === k ? "on" : ""} onClick={() => setRange(k)} role="tab" aria-selected={range === k}>
              {RANGE_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="filter-spacer" />
        <span className="small muted">All charts and stats reflect the selected range · live activity refreshes every 30 seconds</span>
      </div>

      {/* KPI row */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatTile label="Users online" value={fmtInt(live.usersOnline)} live spark={spark((v) => v.usersOnline ?? 0)} />
        <StatTile
          label="Total applicants reached"
          value={fmtCompact(t.totalUsers)}
          delta={{ text: `+${fmtInt(t.newUsers)}`, dir: "up", good: true, vs: RANGE_LABELS[range].toLowerCase() }}
          icon={<Users size={15} />}
        />
        <StatTile
          label={`Messages · ${RANGE_LABELS[range].toLowerCase()}`}
          value={fmtCompact(t.messages)}
          delta={{ text: pctChange(t.messages, p.messages), dir: msgsUp ? "up" : "down", good: msgsUp, vs: "previous period" }}
          icon={<MessagesSquare size={15} />}
          spark={spark((v) => v.messages)}
        />
        <StatTile
          label={docStats && docStats.indexing > 0 ? `Documents indexed · ${docStats.indexing} reindexing` : "Documents indexed"}
          value={docStats ? fmtInt(docStats.count) : "…"}
          icon={<FileStack size={15} />}
        />
      </div>

      {/* row 1 — messages + live activity (equal tiles, like row 2) */}
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <ChartCard
          title={`Applicant messages · ${RANGE_LABELS[range].toLowerCase()}`}
          hint="Conversations handled by the chat assistant"
          table={messagesTable}
          stale={stale}
        >
          <LineAreaChart
            xLabels={xLabels}
            series={[
              { key: "messages", label: "Messages", colorVar: "--series-1", values: slice.trend.map((v) => v.messages), area: true },
            ]}
            areaFor="messages"
            height={216}
            yFormat={fmtCompact}
          />
        </ChartCard>
        <div>
          <ChartCard title="Live activity" hint="Recent assistant and system events">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 216, overflowY: "auto" }}>
              {live.recentEvents.slice(0, 12).map((e) => (
                <div key={e.id} className="activity-item">
                  <span className={`badge ${e.severity === "critical" ? "critical" : e.severity === "warning" ? "warning" : "neutral"}`}>
                    {e.action}
                  </span>
                  <div className="activity-body">
                    <div className="small" style={{ fontWeight: 600 }}>{e.detail}</div>
                    <div className="small muted">
                      {e.actor} · {fmtAgo(e.ts)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      </div>

      {/* row 2 — response time + error rate */}
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <ChartCard
          title="Response time"
          hint="Average assistant reply latency"
          table={{
            headers: ["Time", "Avg response"],
            rows: slice.trend.map((p) => [cellText(range === "today" ? fmtClock(p.ts) : fmtDay(p.ts)), cellMs(p.avgResponseMs)]),
          }}
          stale={stale}
        >
          <LineAreaChart
            xLabels={xLabels}
            series={[{ key: "rt", label: "Avg response", colorVar: "--series-1", values: slice.trend.map((v) => v.avgResponseMs) }]}
            baseline={{ value: 1200, label: "SLA 1.2s" }}
            height={216}
            yFormat={fmtMs}
          />
        </ChartCard>
        <ChartCard
          title="Fallback rate"
          hint="Share of turns answered with the canned fallback (assistant couldn't answer)"
          table={{
            headers: ["Time", "Fallback rate"],
            rows: slice.trend.map((p) => [cellText(range === "today" ? fmtClock(p.ts) : fmtDay(p.ts)), cellPct(p.errorRate)]),
          }}
          stale={stale}
        >
          <LineAreaChart
            xLabels={xLabels}
            series={[{ key: "err", label: "Fallback rate", colorVar: "--series-1", values: slice.trend.map((v) => Number(v.errorRate.toFixed(2))) }]}
            baseline={{ value: 2, label: "SLO 2%" }}
            height={216}
            yFormat={(v) => fmtPct(v, 1)}
          />
        </ChartCard>
      </div>

      {/* row 3 — channels (wide); scrolls horizontally when bars get dense on phones */}
      <div style={{ marginBottom: 16 }}>
        <ChartCard title="Messages by channel" hint="Where applicant conversations arrive from" table={channelsTable} stale={stale}>
          <div className="chart-scroll">
            <div style={{ minWidth: Math.max(560, slice.trend.length * 9 + 90) }}>
              <StackedBars xLabels={xLabels} series={channelSeries} height={232} valueFormat={fmtCompact} />
            </div>
          </div>
        </ChartCard>
      </div>

      {/* row 4 — heatmap + top programmes; both scroll horizontally on phones */}
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <ChartCard title="Traffic pattern" hint="Average messages by weekday and hour (last 14 days)" table={heatmapTable}>
          <div className="chart-scroll">
            <div>
              <Heatmap grid={slice.heatmap} />
            </div>
          </div>
        </ChartCard>
        <ChartCard
          title="Top programme queries"
          hint="Programmes applicants ask about most"
          table={{
            headers: ["Programme", "Queries", "Share"],
            rows: topProg.map((pg) => [cellText(pg.name), cellInt(pg.queries), cellPct(pg.share, 1)]),
          }}
        >
          <div className="chart-scroll">
            <div style={{ minWidth: 470 }}>
              <HBars items={topProg.map((pg) => ({ label: pg.name, value: pg.queries }))} valueFormat={fmtInt} />
            </div>
          </div>
        </ChartCard>
      </div>

      {/* row 5 — API status (full width) */}
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="span-2">
          <ChartCard
            title="API status"
            hint="Backing services powering the assistant"
            table={{
              headers: ["Service", "Group", "Status", "Current latency", "Note"],
              rows: endpoints.map((ep) => [
                cellText(ep.name),
                cellText(ep.group),
                cellText(ep.status),
                cellMs(ep.latencyMs),
                cellText(ep.statusNote),
              ]),
            }}
            tools={
              <span className="small muted">checked {fmtAgo(endpoints[0]?.checkedAt ?? Date.now())}</span>
            }
          >
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Group</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((ep) => (
                    <EndpointRow key={ep.id} ep={ep} />
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ChartCard title="System health" hint="Capacity and quality gauges">
            <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 4 }}>
              <Meter
                label="Telemetry query latency"
                value={telemetryLatencyScale}
                display={`${fmtInt(telemetryLatency)} ms`}
                kind="status"
                statusValue={telemetryLatencyScale}
              />
              <Meter
                label="Assistant success rate"
                value={t.satisfied}
                display={fmtPct(t.satisfied, 1)}
                kind="info"
              />
              {docStats && (
                <div className="small muted" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span>{fmtCompact(docStats.chunks)} chunks across {docStats.count} documents</span>
                  <span>{fmtCompact(docStats.tokens)} tokens in approved indexed knowledge</span>
                </div>
              )}
            </div>
          </ChartCard>

          <ChartCard
            title="Response feedback"
            hint="👍/👎 taps on AI answers"
            table={{
              headers: ["Rating", "Count"],
              rows: [
                [cellText("Likes"), cellInt(slice.feedback.likes)],
                [cellText("Dislikes"), cellInt(slice.feedback.dislikes)],
                [cellText("Positive share"), cellPct(slice.feedback.positivePct ?? 0, 1)],
              ],
            }}
          >
            {slice.feedback.rated === 0 ? (
              <div className="empty-state" style={{ padding: "26px 12px" }}>
                <div className="e-title">No ratings yet</div>
                <div className="small">Applicants haven't tapped 👍/👎 on any responses in this range</div>
              </div>
            ) : (
              <div className="feedback-body">
                <div className="feedback-counts">
                  <div className="feedback-count">
                    <ThumbsUp size={16} style={{ color: "var(--status-good)" }} />
                    <div>
                      <div className="fb-value">{fmtInt(slice.feedback.likes)}</div>
                      <div className="small muted">likes</div>
                    </div>
                  </div>
                  <div className="feedback-count">
                    <ThumbsDown size={16} style={{ color: "var(--status-critical)" }} />
                    <div>
                      <div className="fb-value">{fmtInt(slice.feedback.dislikes)}</div>
                      <div className="small muted">dislikes</div>
                    </div>
                  </div>
                </div>
                <div className="fb-bar" aria-hidden="true">
                  <div
                    className="fb-seg likes"
                    style={{ width: `${slice.feedback.positivePct ?? 50}%` }}
                  />
                  <div className="fb-seg dislikes" style={{ width: `${100 - (slice.feedback.positivePct ?? 50)}%` }} />
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>
                  {fmtPct(slice.feedback.positivePct ?? 0, 1)} positive · {fmtInt(slice.feedback.rated)} rated
                  turn{slice.feedback.rated === 1 ? "" : "s"}
                </div>
              </div>
            )}
          </ChartCard>

          <ChartCard
            title="Guardrails"
            hint="Safety layer — questions screened before the AI, answers re-checked after"
            table={{
              headers: ["Check", "Count"],
              rows: [
                [cellText("Precheck refusals"), cellInt(slice.guardrails.precheck)],
                [cellText("Postcheck scrubs"), cellInt(slice.guardrails.postcheck)],
                [cellText("Off-topic redirects"), cellInt(slice.guardrails.offtopic)],
              ],
            }}
          >
            {slice.guardrails.precheck + slice.guardrails.postcheck + slice.guardrails.offtopic === 0 ? (
              <div className="empty-state" style={{ padding: "26px 12px" }}>
                <div className="e-title">No guardrail triggers</div>
                <div className="small">Nothing was refused, scrubbed or redirected in this range</div>
              </div>
            ) : (
              <div className="feedback-body">
                <div className="feedback-counts" style={{ flexDirection: "column", gap: 10 }}>
                  <div className="feedback-count">
                    <ShieldCheck size={16} style={{ color: "var(--series-1)" }} />
                    <div>
                      <div className="fb-value">{fmtInt(slice.guardrails.precheck)}</div>
                      <div className="small muted">precheck refusals</div>
                    </div>
                  </div>
                  <div className="feedback-count">
                    <ShieldAlert size={16} style={{ color: "var(--series-2)" }} />
                    <div>
                      <div className="fb-value">{fmtInt(slice.guardrails.postcheck)}</div>
                      <div className="small muted">postcheck scrubs</div>
                    </div>
                  </div>
                  <div className="feedback-count">
                    <MessageCircleOff size={16} style={{ color: "var(--series-3)" }} />
                    <div>
                      <div className="fb-value">{fmtInt(slice.guardrails.offtopic)}</div>
                      <div className="small muted">off-topic redirects</div>
                    </div>
                  </div>
                </div>
                <div className="small muted">
                  Guardrail triggers appear as <strong>warnings</strong> in the audit log with the
                  stage recorded — no question or answer text is ever stored.
                </div>
              </div>
            )}
          </ChartCard>
        </div>
      </div>
    </main>
  );
}
