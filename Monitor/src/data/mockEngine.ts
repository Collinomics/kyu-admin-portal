// Mock monitoring engine — deterministic seeded history + a live tail that
// evolves in real time. This stands in for the real backend (Chat API,
// document service and persistent storage) until it is built; the service layer
// (services/monitoringService.ts) is the only module that touches this file,
// so swapping to a real API happens in one place.

import { mulberry32, range, irange, pick, pickWeighted } from "../lib/rng";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Channel = "web" | "mobile" | "api";

export interface HourPoint {
  ts: number; // epoch ms of the hour start
  messages: number;
  usersOnline: number;
  avgResponseMs: number;
  errorRate: number; // percent, 0-100
  tokens: number;
  byChannel: Record<Channel, number>;
}

export interface DayPoint {
  ts: number; // epoch ms of the day start
  messages: number;
  newUsers: number;
  sessions: number;
  avgResponseMs: number;
  errorRate: number;
  tokens: number;
}

export type EndpointStatus = "good" | "warning" | "serious" | "critical";

export interface ApiEndpoint {
  id: string;
  name: string;
  group: string;
  base: string;
  status: EndpointStatus;
  statusNote: string;
  uptime30d: number; // percent
  latencyMs: number;
  latencySeries: number[]; // last 24 samples (3-min buckets)
  region: string;
}

export type AuditAction =
  | "chat.message"
  | "chat.feedback"
  | "chat.session"
  | "auth.login"
  | "auth.signup"
  | "doc.upload"
  | "doc.chunked"
  | "doc.reindex"
  | "doc.failed"
  | "config.update"
  | "api.error"
  | "index.health";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditEvent {
  id: string;
  ts: number;
  actor: string;
  action: AuditAction;
  severity: AuditSeverity;
  detail: string;
  ip: string;
  sessionId: string;
}

export type DocStatus =
  | "uploaded"
  | "parsing"
  | "chunking"
  | "indexing"
  | "indexed"
  | "failed";

export type DocType = "pdf" | "xlsx" | "xls" | "csv";

export interface DocRecord {
  id: string;
  name: string;
  type: DocType;
  sizeKb: number;
  status: DocStatus;
  progress: number; // 0-100 within current stage
  chunks: number;
  tokens: number;
  uploadedAt: number;
  indexedAt: number | null;
  log: string[];
}

export interface OverviewSeries {
  hourly: HourPoint[];
  daily: DayPoint[];
}

export interface TopProgramme {
  name: string;
  queries: number;
  share: number; // percent of all programme queries
}

export interface OverviewTotals {
  messages: number;
  sessions: number;
  avgResponseMs: number;
  errorRate: number;
  tokens: number;
  totalUsers: number;
  newUsers: number;
  satisfied: number; // percent of chats with no fallback / no error
}

export interface LiveSnapshot {
  now: number;
  usersOnline: number;
  messagesToday: number;
  tokensToday: number;
  endpointLatency: Record<string, number>;
  recentEvents: AuditEvent[];
  apiOverall: EndpointStatus;
  lastTick: number;
}

// ---------------------------------------------------------------------------
// Deterministic history (seeded)
// ---------------------------------------------------------------------------

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const SEED = 20260826;

const fmtHour = (d: Date) => {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x.getTime();
};
const fmtDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

function generateHistory(): OverviewSeries {
  const rnd = mulberry32(SEED);
  const now = Date.now();
  const startHour = fmtHour(new Date(now - 14 * DAY));

  // diurnal peak ~12:30pm local; weekday effect; slight growth over window
  const hourly: HourPoint[] = [];
  const hours = 14 * 24;
  for (let i = 0; i < hours; i++) {
    const ts = startHour + i * HOUR;
    const h = new Date(ts).getHours();
    const dow = new Date(ts).getDay(); // 0 Sun .. 6 Sat
    const peak = Math.exp(-((h - 12.5) ** 2) / (2 * 3.6 ** 2));
    const weekday = dow === 0 ? 0.42 : dow === 6 ? 0.55 : 1;
    const growth = 1 + 0.22 * (i / hours);
    const noise = range(rnd, 0.78, 1.22);
    const messages = Math.round(14 + 168 * peak * weekday * growth * noise);

    const usersOnline = Math.max(
      4,
      Math.round(messages * 0.24 + 10 * peak * weekday + range(rnd, -6, 10)),
    );
    const spike = rnd() < 0.028;
    const avgResponseMs = Math.round(
      range(rnd, 780, 1150) + (spike ? range(rnd, 1600, 3200) : 0),
    );
    const errorRate =
      (rnd() < 0.02 ? range(rnd, 3.5, 8.5) : range(rnd, 0.3, 1.8)) * (spike ? 1.4 : 1);
    const tokens = Math.round(messages * range(rnd, 320, 620));

    const web = range(rnd, 0.46, 0.62);
    const mobile = range(rnd, 0.24, 0.36);
    const byChannel: Record<Channel, number> = {
      web: Math.round(messages * web),
      mobile: Math.round(messages * mobile),
      api: Math.max(0, messages - Math.round(messages * web) - Math.round(messages * mobile)),
    };

    hourly.push({ ts, messages, usersOnline, avgResponseMs, errorRate, tokens, byChannel });
  }

  // 90 days of daily aggregates (overlaps the hourly window; charts pick one)
  const daily: DayPoint[] = [];
  const startDay = fmtDay(new Date(now - 89 * DAY));
  for (let i = 0; i < 90; i++) {
    const ts = startDay + i * DAY;
    const dow = new Date(ts).getDay();
    const weekday = dow === 0 ? 0.45 : dow === 6 ? 0.58 : 1;
    const growth = 1 + 0.28 * (i / 90);
    const noise = range(rnd, 0.8, 1.2);
    const messages = Math.round(3800 * weekday * growth * noise);
    const newUsers = Math.round(range(rnd, 14, 42) * weekday * growth);
    const sessions = Math.round(messages * range(rnd, 0.16, 0.24));
    const avgResponseMs = Math.round(range(rnd, 820, 1120));
    const errorRate = rnd() < 0.06 ? range(rnd, 2.5, 7) : range(rnd, 0.4, 1.6);
    const tokens = Math.round(messages * range(rnd, 330, 580));
    daily.push({ ts, messages, newUsers, sessions, avgResponseMs, errorRate, tokens });
  }

  return { hourly, daily };
}

const PROGRAMMES: [string, number][] = [
  ["BSc Computer Science", 100],
  ["BSc Software Engineering", 78],
  ["B. Information Technology", 66],
  ["BSc Civil Engineering", 54],
  ["BBA (Business Administration)", 49],
  ["B. Education (Science)", 44],
  ["BSc Statistics & Economics", 32],
  ["B. Nursing Science", 27],
  ["Diploma in Electrical Eng.", 22],
  ["BSc Quantity Surveying", 19],
];

function generateTopProgrammes(): TopProgramme[] {
  const rnd = mulberry32(SEED + 7);
  const noise = (w: number) => Math.round(w * range(rnd, 0.92, 1.08));
  const queries = PROGRAMMES.map(([, w]) => noise(w));
  const sum = queries.reduce((a, b) => a + b, 0);
  return PROGRAMMES.map(([name], i) => ({
    name,
    queries: queries[i] * 34, // scale to ~30-day totals
    share: (queries[i] / sum) * 100,
  }));
}

const ENDPOINT_DEFS = [
  { id: "chat", name: "Chat API", group: "Core", base: "https://chat.kyu-assist.app/v1", region: "ug-kampala" },
  { id: "auth", name: "Auth API", group: "Core", base: "https://auth.kyu-assist.app/v1", region: "ug-kampala" },
  { id: "docs", name: "Document Service", group: "Knowledge", base: "https://docs.kyu-assist.app/v1", region: "eu-frankfurt" },
  { id: "embed", name: "Embeddings API", group: "Knowledge", base: "https://embed.kyu-assist.app/v1", region: "eu-frankfurt" },
  { id: "data", name: "Protected data service", group: "Data", base: "internal", region: "ug-kampala" },
];

function generateEndpoints(): ApiEndpoint[] {
  const rnd = mulberry32(SEED + 11);
  return ENDPOINT_DEFS.map((d, i) => {
    const base = d.id === "embed" ? 420 : d.id === "docs" ? 310 : d.id === "db" ? 38 : 150;
    const series = Array.from({ length: 24 }, (_, k) =>
      Math.max(6, Math.round(base + Math.sin(k / 3 + i) * base * 0.18 + range(rnd, -base * 0.12, base * 0.12))),
    );
    const degraded = d.id === "embed"; // one endpoint in a degraded window
    return {
      id: d.id,
      name: d.name,
      group: d.group,
      base: d.base,
      status: degraded ? "warning" : "good",
      statusNote: degraded ? "Elevated latency — queue backing up" : "Operating normally",
      uptime30d: degraded ? 99.42 : 99.9 + (i % 3) * 0.03,
      latencyMs: degraded ? 640 : series[series.length - 1],
      latencySeries: series,
      region: d.region,
    };
  });
}

const CHAT_DETAILS = [
  "Asked about admission requirements for {p}",
  "Compared {p} with similar programmes",
  "Requested cutoff points for {p}",
  "Enquired about fee structure for {p}",
  "Asked how to apply for {p}",
  "Asked about intake dates for {p}",
  "Asked about diploma vs degree entry for {p}",
  "Requested programme duration for {p}",
];

function generateAuditEvents(): AuditEvent[] {
  const rnd = mulberry32(SEED + 23);
  const now = Date.now();
  const events: AuditEvent[] = [];
  const n = 186;
  for (let i = 0; i < n; i++) {
    const ts = now - Math.floor(rnd() ** 1.4 * 30 * DAY) - irange(rnd, 0, 60) * 60_000;
    const prog = pick(rnd, PROGRAMMES)[0];
    const isChat = rnd() < 0.62;
    const isAdmin = rnd() < 0.1;
    const isError = rnd() < 0.045;

    let action: AuditAction;
    let severity: AuditSeverity;
    let detail: string;
    let actorName: string;

    if (isChat) {
      action = rnd() < 0.9 ? "chat.message" : "chat.session";
      severity = "info";
      actorName = "anonymous";
      detail = pick(rnd, CHAT_DETAILS).replace("{p}", prog);
    } else if (isAdmin) {
      action = pickWeighted(rnd, [
        ["config.update", 1],
        ["doc.upload", 2],
        ["doc.reindex", 3],
        ["auth.login", 1],
      ] as [AuditAction, number][]);
      severity = action === "doc.reindex" && rnd() < 0.15 ? "warning" : "info";
      actorName = pick(rnd, ["m.asiimwe", "n.owino"]);
      detail =
        action === "doc.upload"
          ? `Uploaded "${pick(rnd, ["Fees_Structure_2026_2027.xlsx", "Admission_Requirements_2026.pdf", "Cutoff_Points_2025.xlsx"])}"`
          : action === "doc.reindex"
            ? `Triggered reindex of knowledge base (${irange(rnd, 12, 14)} documents)`
            : action === "config.update"
              ? `Updated system prompt template to v${irange(rnd, 3, 6)}`
              : "Signed in to the monitoring console";
    } else if (isError) {
      action = rnd() < 0.7 ? "api.error" : "doc.failed";
      severity = rnd() < 0.6 ? "warning" : "critical";
      actorName = "system";
      detail =
        action === "api.error"
          ? `Embeddings API timeout after ${irange(rnd, 15, 40)}s (attempt ${irange(rnd, 2, 4)})`
          : `Chunking failed for "${pick(rnd, ["Student_Handbook_2026.pdf", "Orientation_Schedule.pdf"])}" — malformed page layout`;
    } else {
      action = pickWeighted(rnd, [
        ["index.health", 2],
        ["doc.chunked", 4],
        ["auth.signup", 1],
      ] as [AuditAction, number][]);
      severity = "info";
      actorName = action === "doc.chunked" ? "embedding-worker" : "system";
      detail =
        action === "doc.chunked"
          ? `Chunked "${pick(rnd, ["2026_2027_Undergraduate_Programmes.xlsx", "Programme_Comparison_Engineering.xlsx"])}" into ${irange(rnd, 180, 640)} chunks`
          : action === "index.health"
            ? "Index health check passed — all shards responsive"
            : "New applicant created an account";
    }

    events.push({
      id: `evt-${(3000 + i).toString(36)}${irange(rnd, 10, 99)}`,
      ts,
      actor: actorName,
      action,
      severity,
      detail,
      ip: `196.43.${irange(rnd, 2, 254)}.${irange(rnd, 2, 254)}`,
      sessionId: `sess_${(100000 + irange(rnd, 0, 899999)).toString(36)}`,
    });
  }
  return events.sort((a, b) => b.ts - a.ts);
}

const DOC_SEED: [string, DocType, number, number, number][] = [
  ["2026_2027_Undergraduate_Programmes.xlsx", "xlsx", 2410, 1248, 486_400],
  ["Admission_Requirements_2026.pdf", "pdf", 1850, 842, 401_900],
  ["Programme_Comparison_Engineering.xlsx", "xlsx", 940, 512, 198_300],
  ["Fees_Structure_2026_2027.xlsx", "xlsx", 1230, 690, 265_700],
  ["Diploma_Programmes_Catalogue.pdf", "pdf", 2210, 1004, 389_200],
  ["Graduate_School_Programmes.pdf", "pdf", 1570, 730, 312_800],
  ["Entry_Schemes_Guide.pdf", "pdf", 1180, 468, 188_400],
  ["Cutoff_Points_2025.xlsx", "xlsx", 760, 396, 143_900],
  ["Distance_Learning_Programmes.pdf", "pdf", 1020, 442, 172_600],
  ["Scholarships_and_Bursaries.pdf", "pdf", 890, 354, 138_100],
  ["Accommodation_Guide.pdf", "pdf", 640, 288, 96_400],
  ["Student_Handbook_2026.pdf", "pdf", 3200, 1410, 542_800],
  ["FAQ_Admissions.xlsx", "xlsx", 520, 258, 88_300],
  ["Orientation_Schedule.pdf", "pdf", 410, 196, 64_200],
];

function generateDocuments(): DocRecord[] {
  const rnd = mulberry32(SEED + 31);
  const now = Date.now();
  return DOC_SEED.map(([name, type, sizeKb, chunks, tokens], i) => {
    const daysAgo = Math.floor((rnd() ** 0.7) * 40) + 1;
    const uploadedAt = now - daysAgo * DAY - irange(rnd, 0, 18) * HOUR;
    const failed = i === 13; // Orientation_Schedule failed chunking
    const indexing = i === 12; // FAQ is currently re-indexing
    return {
      id: `doc-${(i + 1).toString(36)}`,
      name,
      type,
      sizeKb,
      status: failed ? "failed" : indexing ? "indexing" : "indexed",
      progress: indexing ? 62 : 100,
      chunks: failed ? 0 : chunks,
      tokens: failed ? 0 : tokens,
      uploadedAt,
      indexedAt: failed ? null : uploadedAt + 14 * 60_000,
      log: failed
        ? [
            "PDF uploaded",
            "Parsing pages…",
            "Parsed 38 pages",
            "Chunking failed — malformed page layout on p.12",
          ]
        : [
            "PDF uploaded",
            "Parsing pages…",
            `Parsed ${Math.max(8, Math.round(chunks / 40))} pages`,
            `Split into ${chunks} chunks`,
            "Embeddings computed",
            "Indexed into vector store",
          ],
    };
  });
}

// ---------------------------------------------------------------------------
// Live engine — evolves the tail in real time
// ---------------------------------------------------------------------------

export class LiveEngine {
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private snap: LiveSnapshot;

  constructor() {
    const seeded = mulberry32(SEED + 99);
    this.snap = {
      now: Date.now(),
      usersOnline: 143,
      messagesToday: 1187,
      tokensToday: 542_000,
      endpointLatency: { chat: 152, auth: 88, docs: 318, embed: 640, db: 41 },
      recentEvents: [
        {
          id: "evt-live-seed1",
          ts: Date.now() - 12_000,
          actor: "anonymous",
          action: "chat.message",
          severity: "info",
          detail: "Compared BSc Software Engineering with BSc Computer Science",
          ip: "196.43.12.88",
          sessionId: "sess_k9x2m",
        },
        {
          id: "evt-live-seed2",
          ts: Date.now() - 4_000,
          actor: "anonymous",
          action: "chat.session",
          severity: "info",
          detail: "Session started (web widget)",
          ip: "154.160.9.71",
          sessionId: "sess_2rv8p",
        },
      ],
      apiOverall: "good",
      lastTick: Date.now(),
    };
    void seeded;
  }

  get snapshot(): LiveSnapshot {
    return this.snap;
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0) this.stop();
    };
  };

  private start() {
    this.timer = setInterval(() => this.tick(), 3000);
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emit() {
    for (const cb of this.listeners) cb();
  }

  private tick() {
    const rnd = Math.random;
    const s = this.snap;
    s.now = Date.now();
    // online users: slow random walk, bounded
    s.usersOnline = Math.min(470, Math.max(22, s.usersOnline + Math.round((rnd() - 0.48) * 26)));
    // a message lands every ~2.5s on average
    if (rnd() < 0.82) {
      s.messagesToday += 1;
      s.tokensToday += 300 + Math.round(rnd() * 600);
    }
    // endpoint latency walks
    for (const [id, v] of Object.entries(s.endpointLatency)) {
      const base = id === "embed" ? 640 : id === "docs" ? 318 : id === "db" ? 40 : 150;
      s.endpointLatency[id] = Math.max(6, Math.round(v + (rnd() - 0.5) * base * 0.08));
    }
    // occasionally emit a live audit event
    if (rnd() < 0.4) {
      const prog = pick(rnd, PROGRAMMES)[0];
      const isErr = rnd() < 0.05;
      const ev: AuditEvent = isErr
        ? {
            id: `evt-live-${s.now.toString(36)}`,
            ts: s.now,
            actor: "system",
            action: "api.error",
            severity: "warning",
            detail: "Chat API retried request after upstream timeout",
            ip: "10.0.3.14",
            sessionId: "-",
          }
        : {
            id: `evt-live-${s.now.toString(36)}`,
            ts: s.now,
            actor: "anonymous",
            action: rnd() < 0.85 ? "chat.message" : "chat.session",
            severity: "info",
            detail: rnd() < 0.85
              ? pick(rnd, CHAT_DETAILS).replace("{p}", prog)
              : "Session started (web widget)",
            ip: `196.43.${Math.floor(rnd() * 253) + 2}.${Math.floor(rnd() * 253) + 2}`,
            sessionId: `sess_${Math.floor(rnd() * 1e6).toString(36)}`,
          };
      s.recentEvents = [ev, ...s.recentEvents].slice(0, 40);
    }
    s.apiOverall = s.endpointLatency.embed > 1200 ? "warning" : "good";
    s.lastTick = s.now;
    this.emit();
  }

  /** Simulate a user action (used by upload/reindex flows so the audit log reacts). */
  pushEvent(ev: Omit<AuditEvent, "id" | "ts" | "ip"> & { ip?: string }) {
    this.snap.recentEvents = [
      {
        ...ev,
        id: `evt-live-${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`,
        ts: Date.now(),
        ip: ev.ip ?? `196.43.${Math.floor(Math.random() * 253) + 2}.${Math.floor(Math.random() * 253) + 2}`,
      },
      ...this.snap.recentEvents,
    ].slice(0, 40);
    this.emit();
  }
}

// ---------------------------------------------------------------------------
// Assembled mock store
// ---------------------------------------------------------------------------

let _store: {
  series: OverviewSeries;
  topProgrammes: TopProgramme[];
  endpoints: ApiEndpoint[];
  audit: AuditEvent[];
  documents: DocRecord[];
  live: LiveEngine;
} | null = null;

export function getStore() {
  if (!_store) {
    _store = {
      series: generateHistory(),
      topProgrammes: generateTopProgrammes(),
      endpoints: generateEndpoints(),
      audit: generateAuditEvents(),
      documents: generateDocuments(),
      live: new LiveEngine(),
    };
  }
  return _store;
}

export const TOTAL_USERS_BASE = 6842;
