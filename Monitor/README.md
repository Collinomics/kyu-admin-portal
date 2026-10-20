# Kyambogo Monitor

Monitoring console for the **Kyambogo University AI Admissions Assistant** — the
chat widget that guides applicants through the programme catalogue and compares
programmes.

![stack](https://img.shields.io/badge/React%2019-Vite%208-1b5ea9) ![charts](https://img.shields.io/badge/charts-custom%20SVG%20%2F%20validated%20palette-f8b13a)

## Pages

| Page | What it shows |
|---|---|
| **Dashboard** | Live KPI row (users online, applicants reached, messages), message trends, response time vs SLA, fallback rate vs SLO, messages by channel, traffic heatmap, top programme queries, API status per service, system-health meters, response feedback (👍/👎) and guardrail tiles, live activity stream |
| **Audit Log** | Searchable / filterable event trail (severity, action, date range, client IPs), pagination, expandable raw events, CSV export — refetches on every live tick |
| **Data Sources** | Upload Excel / PDF documents → they run through the ingestion pipeline (parse → chunk → embed → index) with live progress, chunk/token counts, per-document pipeline logs, and one-click reindex |
| **Settings** | Chatbase-style console: **AI control** (force-stop the assistant → maintenance or 404 message, stored in Postgres and enforced by chat_api.php on every turn), **chat interface** (assistant name, accent colour, greeting — the widget reads them live), **rate limiting** (messages/min per visitor), **console activity** (every settings change and danger-zone action, with the actor), and a **danger zone** (clear chat events older than N days — programme_chunks is never touched) |
| **Account** | Super-admin profile: set profile picture, name and email, change password, and manage console members (invite, roles, remove) — every mutation lands in the audit trail |

**Shell**: navbar (logo, name, amber motto, status, clock, user profile,
theme) + a desktop sidebar — navigation, a top-programme-queries panel
(pushed to the bottom), and a copyright footer; the sidebar collapses into
a hamburger menu on mobile.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (use another port if 5173 is busy)
npm run build
```

## Colors & charts

Brand: Kyambogo blue `#1B5EA9` and amber `#F8B13A`. The chart palette is the
brand-anchored instance of a validated data-viz method — every series hue and
ramp passed a six-check validator (CVD separation, lightness band, chroma
floor, contrast) in both light and dark mode:

- [`docs/palette.md`](docs/palette.md) — the documented palette instance
- [`docs/validation.md`](docs/validation.md) — validator output, all gates
- `scripts/validate_palette.js` — re-run before changing any slot:
  `node scripts/validate_palette.js "#1B5EA9,#D98A13,#1baf7a" --mode light`

Charts are hand-built SVG components (`src/components/charts/`) — 2px lines,
~10% area washes, 2px surface gaps, crosshair tooltips, legends, keyboard
navigation, and a **table view toggle** on every chart card (the WCAG-clean
twin). Dark mode is a separate selected theme (`[data-theme]`), persisted, and
toggles from the navbar.

**Responsive** down to phone widths: hamburger nav below 860px, grids collapse
to single columns, and wide charts (heatmap, dense bars, service tables) scroll
horizontally inside their cards instead of stretching the page. Verified by
`node scripts/mobile-check.mjs` (headless Chrome via CDP — asserts no page
overflow, menu behavior, and scroll-region containment at 390px on every
route).

## Data: live Postgres, mock fallback

The dashboard reads **real telemetry from the chat widget's Postgres
database** through a small PHP analytics API. The widget already logs every
chat turn into `monitor_events` (via `monitor.php`); `monitor_api.php` in the
chatwidget backend (`c:/Users/HP/Downloads/chatwidget/`) aggregates that into
the JSON the dashboard renders.

Wiring:

1. Start the chatwidget backend with its database env vars:
   ```bash
   set PGPORT=5433
   set PGPASSWORD=pcs
   php -S 127.0.0.1:8080
   ```
2. `VITE_MONITOR_API_URL=http://127.0.0.1:8080/monitor_api.php` is set in
   `.env` (see `.env.example`).

With the URL set, the Dashboard and Audit Log pages show real data — every
chat turn and 👍/👎 the widget logs appears here (the live tick polls the PHP
`/live` endpoint every 4 s). If the PHP API is unreachable, every call falls
back to the seeded mock engine (`src/data/mockEngine.ts`), so the dashboard
never blanks.

Real settings (Settings page) live in `monitor_settings` +
`console_activity` via `settings_api.php`, and `chat_api.php` enforces the
force-stop and rate limit on every turn.

Still mocked until the backend exposes them (marked with TODO comments in
`src/services/monitoringService.ts`): endpoint/service health, document
ingestion (the real pipeline lives in `sync_publish.php`), and account
members (localStorage).

## Logo

The navbar shows an inline crest fallback. To use the official logo, drop it
at `public/kyambogo-logo.png` — it is picked up automatically (any size; it is
scaled to fit a 40 px tile).

## Project layout

```
src/
  components/        navbar, crest, chart components
  data/              mock engine (seeded history + live tail)
  hooks/             useTheme, useLive
  pages/             OverviewPage (Dashboard), AuditLogPage, DocumentsPage
                     (Data Sources), SettingsPage, AccountPage
  services/          monitoringService.ts — the single API surface
  styles/            palette.css (validated tokens), global.css, charts.css
scripts/
  validate_palette.js   palette validator (the six checks)
  palette-check.mjs     OKLab measurement helper
  mobile-check.mjs      headless-Chrome mobile layout verification
docs/
  palette.md / validation.md
```
