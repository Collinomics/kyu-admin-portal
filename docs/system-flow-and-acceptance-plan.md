# PCS system flow and acceptance plan

This is the working map for implementation and whole-system acceptance. It was
reconciled against the React routes and services, Laravel API routes and controllers,
database models and migrations, automated tests, AI monitor integration, and EC2
deployment scripts on 6 September 2026.

## 1. Non-negotiable system flow

```text
System Administrator
  -> maintains organisation units and shared settings
  -> creates Dean, Registrar, HOD, Coordinator, and Admissions Officer accounts

Dean
  -> creates HOD inside an assigned faculty or school
  -> receives HOD-reviewed programmes
  -> publishes or rejects them

HOD
  -> sees programmes throughout the assigned faculty or school
  -> creates and assigns Programme Coordinators in that faculty or school
  -> forwards or rejects submitted programme profiles

Programme Coordinator
  -> sees assigned programme records
  -> edits six governed sections and catalogue metadata
  -> submits a draft or corrected profile for HOD review

Registrar
  -> creates Admissions Officers
  -> creates, publishes, delegates, monitors, and closes application calls

Admissions Officer
  -> sees only assigned calls
  -> performs only explicitly delegated create, monitor, or close actions

Published programme
  -> immutable public snapshot
  -> public catalogue and programme detail page
  -> application status from a real published call
  -> publication outbox event
  -> derived AI search index
  -> public AI answer and AI Monitor telemetry
```

The canonical `pcs` programme record and its published snapshot are the source of
truth. The `ai.programme_chunks` collection is a rebuildable search index and must
never become an editing source.

## 2. Current verified baseline

- 46 Laravel API routes are registered.
- 71 backend tests pass with 752 assertions.
- TypeScript and the Vite production build pass.
- Lint passes with nine non-blocking Fast Refresh file-organization warnings.
- The EC2 homepage and public catalogue API return HTTP 200.
- Protected EC2 API requests with the correct JSON request header return HTTP 401
  when unauthenticated.
- All current database migrations are applied on EC2.

## 3. Readiness gaps found during reconciliation

These gaps must not be mistaken for browser styling work.

### Priority A — fix before whole-system acceptance

1. **Resolved in Phase 1 — Coordinator creation policy.** Only the System
   Administrator creates canonical programme records. Coordinators edit and submit
   assigned records; the dashboard, UI, role matrix, API and tests now agree.
2. **Resolved in the critical admissions pass — application-call editing.** Draft
   and not-yet-opened scheduled calls can be edited by authorized users, with
   server-side scope checks, validation and audit history.
3. **Resolved in the critical admissions pass — automatic call closure.** The
   audited `pcs:close-expired-calls` command is scheduled hourly and EC2 runs the
   Laravel scheduler as a managed service.
4. **Scheduler resolved; production credential still required — publication-to-AI
   processing.** `pcs:process-ai-outbox` is invoked every five minutes through the
   managed EC2 scheduler and retains retry/failure details. The 6 September live
   check found `NVIDIA_API_KEY` missing, so events cannot be embedded until that
   deployment secret is supplied.
5. **Production email delivery is not ready for acceptance.** Current EC2 evidence
   shows onboarding mail being written to the Laravel log. Real onboarding and
   password-reset acceptance requires the approved KYU mail transport.
6. **Resolved in Phase 1 — reload-stable programme URLs.** A fresh tab or reload now
   restores the programme from its URL through the public API, while catalogue Back,
   Forward, Escape and direct-link close behaviour preserve the correct history.

### Priority B — complete after the core transaction flow

1. The AI Monitor still contains mock/local fallbacks. Document upload and reindex
   explicitly throw `not implemented` in real mode, and console account/member data
   is always local mock data.
2. The standalone `sync_publish.php` still contains catalogue-fetch stubs. Laravel's
   outbox processor is the implemented indexing path; documentation and runtime code
   should use one authoritative mechanism.
3. `pcs:verify-catalogue` expects 284 pending outbox rows, which describes the state
   before initial indexing and conflicts with `pcs:verify-ai-retrieval`, which expects
   zero pending events. Split import verification from operational reconciliation.
4. Affiliated institutions exist in canonical and AI data but have no confirmed
   public catalogue section.
5. Dashboard wording still includes `Admissions connection pending`, although real
   calls are connected. Role focus rows display useful records but do not open their
   target records directly.
6. The configured session timeout controls the client-side lock screen, while API
   tokens have a hard-coded eight-hour expiry. Test and document both boundaries.
7. Search and notification links set filters correctly, but acceptance must verify
   each target record is visible within the receiving role's scope.

## 4. Revised implementation phases

### Phase A — acceptance harness and safe test data

- Create named test accounts for every role and record their faculty, department,
  programme, call, and assignment scope.
- Select one disposable programme and one application call for lifecycle testing.
- Record the initial public snapshot, AI index version, outbox count, and audit count.
- Confirm mail delivery mode and do not use real applicant data.

Exit: every tester knows which account and record to use, and production-like tests
cannot damage the imported catalogue.

### Phase B — authentication and account lifecycle

- Login, logout, session restoration, inactivity warning, lock and reauthentication.
- Failed-login lockout and recovery.
- Create account -> receive OTP -> verify -> set strong password -> first login.
- Resend OTP, forgot password, one-time reset, token revocation, suspension,
  reactivation, inactive account, and expired assignment.
- Confirm safe errors and corresponding audit events.

Exit: all six roles can authenticate only in valid states and cannot cross account
or assignment boundaries.

### Phase C — organisation and delegated authority

- System Administrator creates/edits/activates/deactivates faculties and departments.
- Dean creates HOD only in the assigned faculty/school.
- HOD sees faculty/school programmes and assigns a Coordinator only within that scope.
- Registrar creates an Admissions Officer and must select a real eligible call.
- Verify every dropdown persists and displays the selected record after submission.

Exit: invalid faculty/department/programme/call combinations are rejected in both UI
and API; valid assignments immediately affect visibility.

### Phase D — programme governance transaction

- Confirm the resolved policy: System Administrator creates the canonical record;
  the assigned Coordinator edits and submits it.
- Coordinator saves a draft, edits all metadata, and submits it.
- HOD receives notification/search/dashboard entry, opens the programme, rejects it
  once with comments, then forwards the corrected version.
- Dean receives it, recommends if required, rejects or publishes it.
- Simulate concurrent edits and confirm HTTP 409 recovery.
- Confirm version history, review history, audit event, immutable public snapshot,
  and exactly one idempotent outbox event.

Exit: the public catalogue changes only after publication; an in-progress revision
does not overwrite the currently published snapshot.

### Phase E — admissions lifecycle

- Implement permitted editing with server authorization and audit history.
- Create draft -> edit -> publish -> scheduled/open/closing-soon -> delegate -> close.
- Test create/monitor/close permission combinations for the Admissions Officer.
- Add and verify scheduled automatic closure independently of page visits.
- Confirm only published programmes can receive calls and duplicate intake/date
  errors are understandable.
- Confirm the public status and Apply action change immediately and never remain
  active after closure.

Exit: one test call completes the full lifecycle with consistent dashboard, staff,
public, notification, and audit state.

### Phase F — public catalogue and programme details

- Search, academic-unit filter, level filter, reset, no results, pagination, loading,
  offline and error recovery.
- Open a programme, use section navigation, sticky Programme Essentials, Apply,
  bookmark, related programmes, back-to-catalogue, browser Back and Forward.
- Verify the Phase 1 reload-stable programme URLs with direct/shared links, Back,
  Forward and Escape in the deployed build.
- Test desktop, tablet, narrow mobile, browser zoom, keyboard, focus order, dialogs,
  reduced motion, and screen-reader labels.
- Decide whether affiliated institutions are public before implementing that section.

Exit: every public link has a real target and the same published facts appear on the
card, detail page, application status, and AI context.

### Phase G — AI publication, assistant, and monitor

- Schedule outbox processing with retries, failure visibility, reconciliation, and
  idempotency.
- Publish a changed programme and confirm the matching AI source version is rebuilt.
- Test normal, comparison, eligibility, no-context, unrelated, sensitive, stopped,
  rate-limited, fallback, timeout, interrupted stream, and feedback flows.
- Remove silent production mock fallbacks or label unavailable features clearly.
- Implement or remove document upload/reindex and mock console-account controls.
- Verify telemetry contains operational metadata without stored questions/answers.

Exit: every AI screen represents real state, and the assistant cannot expose draft,
private, or cross-scope information.

### Phase H — cross-system quality and production readiness

- Exercise every header search result, notification, dashboard action, CTA, external
  portal link, empty state, retry, confirmation, toast, pagination control, and 404.
- Check console/network errors and API latency under a slow connection.
- Configure final domain/HTTPS, approved email transport, queue worker, scheduler,
  health checks, logs, backups, restore test, retention, secrets rotation, firewall,
  and security headers.
- Use `deploy/update-release.sh` as the release path, including rollback snapshot,
  migrations, cache rebuild, worker/PHP reload, and post-deploy smoke checks.

Exit: written role-by-role acceptance is signed off and the deployed release passes
the same smoke checks as the accepted local build.

## 5. Whole-system browser test order

Run the session in dependency order:

1. Anonymous public baseline.
2. System Administrator organisation/settings and top-level account creation.
3. New-account onboarding and authentication recovery.
4. Dean -> HOD -> Coordinator delegation chain.
5. Coordinator -> HOD -> Dean programme governance chain.
6. Registrar -> Admissions Officer delegation chain.
7. Application-call lifecycle and public Apply state.
8. Publication outbox -> AI index -> public assistant -> AI Monitor.
9. Search, notifications, audit evidence, responsive/accessibility pass.
10. Logout, session revocation, health checks, and final data reconciliation.

For every step record: actor, starting state, action, expected UI, expected database
or API state, expected audit event, expected notification/target link, actual result,
and screenshot or error reference.

## 6. Automated checks required at each implementation checkpoint

```bash
npm run lint
npm run build
cd backend
php artisan test --compact
php artisan route:list --path=api/v1 --except-vendor
```

Add targeted tests before fixing any failed acceptance step. Do not run database-
resetting automated tests against EC2. Production verification must use non-mutating
health checks or deliberately prepared disposable acceptance records.
