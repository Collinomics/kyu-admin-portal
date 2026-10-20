# Backend and AI integration contract

## 1. System boundary

The Laravel PCS backend is the only trusted application backend. It owns authentication,
authorization, users, organisational units, programme workflow, admissions calls,
and the system audit log in the private `pcs` schema of the shared Supabase PostgreSQL
database. This is an approved implementation change from the Module 0 document's
original MariaDB allocation so the system can use one database.

The AI service is subordinate. Its `programme_chunks` table in the restricted `ai`
schema is a rebuildable search
index containing only published programme data. It is not the source of truth for
editing, approval, permissions, or admissions.

```text
Administrator browser -> authenticated PCS API -> canonical PCS tables
                                           |-> AI console API (server token)
Public widget --------> public AI API ------|-> programme_chunks + monitor_events
Published programme -> outbox worker ------|-> rebuild that programme's chunks
```

## 2. Canonical entities

Use UUID primary keys in the API/PostgreSQL database. Replace the frontend's temporary numeric
mock IDs with strings when adding its service layer.

| Entity | Required ownership and important fields |
| --- | --- |
| `users` | email, password hash, title/name, role, status, lock state, last login |
| `faculties` | code, name, active state |
| `departments` | faculty ID, code, name, active state |
| `user_assignments` | user ID, scoped faculty/department/programme/call, dates, permissions |
| `programmes` | code, name, category, faculty/department, coordinator, six profile sections, workflow status, version |
| `programme_reviews` | programme/version, action, actor, comment, timestamp |
| `application_calls` | programme, intake, dates, requirements, state, close reason, creator |
| `audit_events` | actor, action, target, before/after metadata, IP, user agent, timestamp |
| `integration_outbox` | event type, aggregate ID/version, payload, attempts, processed/error timestamps |

Enforce unique case-insensitive emails, unique programme codes, valid date ranges,
and role-appropriate assignment scopes in the database. Store timestamps in UTC and
return ISO-8601 values.

## 3. Programme workflow

Allowed transitions must be explicit and checked on the server:

```text
draft --submit--> submitted --HOD forward--> hod-reviewed --Dean publish--> published
                            \--reject-------------------------------> rejected
published --approved edit/re-publish--> published at a new version
```

- Coordinator: edit an assigned programme and submit.
- HOD: review within the assigned department and forward/reject.
- Dean: publish/reject within the assigned faculty.
- System administrator: emergency/full access, always audited.
- Registrar/admissions officer: admissions actions allowed by assignment.

Every mutation performs backend authorization; hiding a button is not a security
control. Use optimistic concurrency (`version` or `If-Match`) to prevent lost edits.

## 4. Browser-facing API

Base path: `/api/v1`. Administrator endpoints require the PCS session, CSRF
protection for cookie authentication, server-side role/scope checks, and JSON errors
with stable `code` and safe `message` fields.

Minimum endpoints needed to replace the current mocks:

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/reauthenticate`
- `GET|POST /users`, `GET|PATCH /users/{id}`, `POST /users/{id}/reset-password`
- `GET /faculties`, `GET /departments`, `GET /programmes/options`
- `GET|POST /programmes`, `GET|PATCH /programmes/{id}`
- `POST /programmes/{id}/submit|forward|publish|reject|recommend`
- `GET|POST /application-calls`, `PATCH /application-calls/{id}`, `POST /application-calls/{id}/close`
- `GET /audit-events`
- `GET /admin/ai-monitor`, `GET|POST /admin/ai-settings`

Lists use `page`, `page_size`, `search`, sort, and domain filters. Return
`{ "data": [...], "meta": { "page": 1, "page_size": 25, "total": 100 } }`.

The AI administrator endpoints are same-origin PCS proxies. The PCS backend checks
that the session user is `SYSADMIN`, then calls the standalone PHP endpoints using
the server-only `PCS_CONSOLE_TOKEN`. Never place that token in Vite variables or JS.

## 5. Publication-to-AI indexing

Publishing and queueing must be one database transaction:

1. Validate the workflow state and actor scope.
2. Save the new immutable programme version and `published` state.
3. Append the system audit event.
4. Append `programme.published` to `integration_outbox` with ID and version.
5. Commit.
6. A worker calls/reuses `reindex_programme(id)` and marks the row processed.

Withdrawal queues `programme.unpublished` and removes that programme's chunks. The
worker must be idempotent. A scheduled reconciliation should compare published
catalogue versions with indexed versions and repair missed events.

`sync_publish.php` already contains the chunking entry point, but its two catalogue
fetch functions are stubs. Implement them against a read-only PCS endpoint or database
view; do not give the public chat service write access to canonical tables.

## 6. Migration order

1. Implement authentication/session and `/auth/me`; remove role selection and demo password.
2. Add a typed API client; switch users and organisational options from mocks.
3. Switch programmes/editor and implement server workflow actions.
4. Switch admissions calls and audit log.
5. Configure AI proxy URLs and replace remaining endpoint/document/account mocks.
6. Verify publish, indexing, retrieval, telemetry, feedback, and audits end-to-end.
