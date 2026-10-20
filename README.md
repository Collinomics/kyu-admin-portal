# Kyambogo University Programme Catalogue System

Administrative portal for staff accounts, programme profiling and approval,
admissions calls, audit history, and AI-assistant monitoring.

## Current state

- The React/TypeScript application serves the public programme catalogue at `/`
  and the authenticated staff portal under `/admin`.
- Core staff modules and the public catalogue use the Laravel API and shared
  Supabase database; published programmes are the public source of truth.
- The supplied AI monitor is embedded under `/admin/ai-monitor` with isolated styles.
- The supplied PHP AI service is in `support/chatwidget`; its tables and functions
  now run privately in the shared Supabase database under the restricted `ai_runtime` role.
- A Laravel 12/Sanctum backend lives in `backend` and enforces authentication,
  delegation, programme workflow, admissions, settings and audit policy.
- The canonical database currently contains 163 imported programmes and 121
  affiliated institutions, with publication events queued for AI indexing.

`programme_chunks` is a derived AI search index, not the programme catalogue. The
catalogue owned by the main PCS backend is the source of truth.

## Local frontend

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run lint
npm run build
```

See [the integration contract](docs/backend-integration-contract.md),
[public catalogue integration notes](docs/public-catalogue-integration.md), and
[deployment security notes](docs/deployment-security.md). The current role-by-role
workflow, known readiness gaps, and acceptance order are maintained in
[the system flow and acceptance plan](docs/system-flow-and-acceptance-plan.md).

Backend setup and tests are documented in [backend/README.md](backend/README.md).
