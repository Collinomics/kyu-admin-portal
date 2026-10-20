# PCS development flow

This roadmap is the working order for the Kyambogo University Programme Catalogue System. It reflects the code and database as they exist now, not the original prototype state.

## Working method

- Develop and test in the local VS Code project against the shared development Supabase database.
- Complete one functional phase at a time. Each phase ends with automated checks and a short browser test supplied to the project owner.
- Keep the EC2 instance as a stable preview. Deploy only after a meaningful group of phases is accepted locally.
- Keep `pcs` as the canonical application schema and `ai` as a restricted, rebuildable index of published catalogue information.
- Do not retain demo data or simulated success paths in a feature once its real backend is connected.
- Apply responsiveness, permissions, auditing, loading, empty, and failure states during each phase rather than postponing them.

## Phase 0 — Integrated foundation (implemented; acceptance baseline passes)

- React staff portal and public catalogue share one application and design system.
- Laravel/Sanctum API, Supabase schemas, runtime roles, migrations, and bootstrap administrator are operational.
- Authentication, user management, roles, programmes, admissions calls, audit events, settings, public catalogue, AI assistant, and AI Monitor have real API foundations.
- The supplied programme and affiliated-institution records are imported.
- All 163 programmes are assigned to 13 canonical academic units.
- Published programme data is indexed separately for the AI assistant.
- Temporary HTTPS EC2 preview is operational.

Checkpoint (6 September 2026): 71 backend tests and 752 assertions pass; frontend
lint passes with non-blocking Fast Refresh warnings; the production frontend build
passes. These automated checks are a baseline, not whole-system acceptance.

## Phase 1 — Local reliability, performance, and removal of remaining simulations (partly implemented; acceptance pending)

1. Replace the global header search's mock users, programmes, and calls with a role-scoped database search endpoint.
2. remove or implement simulated dashboard actions, beginning with the fake backup success message.
3. Audit all runtime imports of mock data and ensure production screens cannot silently fall back to demonstrations.
4. Improve login and AI Monitor perceived performance with query consolidation, request cancellation, sensible caching, and clear slow/error states.
5. Standardize pagination for every potentially long list and preserve filters while changing pages.

Browser checkpoint: sign in locally, search real users/programmes/calls from the header, reload every main page, test empty/error/loading states, and paginate long tables without full-page scrolling.

## Phase 2 — Organisation and staff-account lifecycle (implemented; role-flow acceptance pending)

1. Complete management of faculties, schools, departments, and active/inactive states instead of exposing them only as form options.
2. Verify role-scoped creation and visibility for System Administrator, Dean, HOD, Coordinator, Registrar, and Admissions Officer.
3. Complete onboarding delivery, resend, password reset, suspension/reactivation, lockout, and session revocation flows.
4. Make assignments understandable in the UI and reject inconsistent faculty/department/programme/call combinations on the server.
5. Confirm every sensitive account action appears in the audit log.

Browser checkpoint: use test accounts for each role and confirm that every role sees and changes only its assigned scope.

## Phase 3 — Programme governance workflow (critical implementation complete; browser acceptance pending)

1. Enrich imported programmes with departments and coordinators where authoritative information is available.
2. Verify create, edit, submit, HOD forward/reject, Dean publish/reject, and approved revision flows end to end.
3. Add clear review history and rejection comments to the programme view.
4. Enforce optimistic concurrency so two editors cannot silently overwrite one another.
5. Verify each publication creates an immutable version, audit event, and idempotent AI outbox event.

Browser checkpoint: take one test programme through the complete Coordinator → HOD → Dean workflow and confirm only publication makes it visible publicly and searchable by AI.

## Phase 4 — Admissions calls and public application state (critical implementation complete; browser acceptance pending)

1. Complete draft, publish, delegate, edit where permitted, manually close, and scheduled close behavior.
2. Enforce programme eligibility, date ranges, role permissions, and officer assignment rules.
3. Connect open/closing-soon/closed call state consistently to dashboards and the public programme page.
4. Configure the correct official application URL and ensure closed calls cannot show an active Apply button.
5. Add scheduler handling and auditing for automatic state changes.

Browser checkpoint: publish a test call, observe it on the public catalogue, delegate it, close it, and verify the public status changes immediately.

## Phase 5 — Complete the public catalogue

1. Polish programme discovery, filters, pagination, details, bookmarks, mobile layout, and accessible keyboard behavior.
2. Add the 121 published affiliated institutions as a properly designed searchable catalogue section if confirmed as public content.
3. Preserve a clear distinction between university programmes, learning-centre delivery, and affiliated-institution offerings.
4. Connect every public factual field to canonical published data and add useful no-results/recovery states.
5. Complete metadata needed for search engines, sharing, and stable programme links.

Browser checkpoint: browse on desktop and a narrow mobile viewport; search/filter programmes, open details, save items, inspect an affiliated institution, and follow an active application link.

## Phase 6 — Real AI knowledge-source operations

1. Replace the AI Monitor's unimplemented upload and reindex simulations with authenticated Laravel endpoints and queued jobs.
2. Define which source formats are authoritative and how Excel, CSV, and PDF content is validated, stored, parsed, versioned, and published.
3. Ensure uploaded material cannot bypass the canonical publication workflow or expose private data to the assistant.
4. Add job progress, failure logs, retries, reindexing, reconciliation, and safe removal behavior.
5. Keep document tables server-paginated and efficient with hundreds or thousands of records.

Browser checkpoint: upload a permitted test source, watch real processing stages, verify its published content through the assistant, reindex it, and inspect the corresponding monitor events.

## Phase 7 — AI assistant and monitoring hardening

1. Optimize monitor aggregation queries and avoid unnecessary sequential requests.
2. Verify real performance metrics, events, feedback, guardrails, CSV export, settings, kill switch, and maintenance behavior.
3. Test streaming, model fallback, rate limits, timeout recovery, empty retrieval, and interrupted connections.
4. Add scheduled outbox reconciliation and alerts for stuck or failed indexing work.
5. Review prompt and telemetry retention so questions/answers and personal data are not stored unnecessarily.

Browser checkpoint: exercise normal, comparison, irrelevant, sensitive, stopped, and failure scenarios and confirm each appears accurately in the AI Monitor.

## Phase 8 — Whole-system quality and acceptance

1. Test all supported roles and workflows on desktop, tablet, and mobile sizes.
2. Complete accessibility checks for keyboard navigation, focus, labels, contrast, dialogs, and screen-reader status messages.
3. Measure and improve initial load, API latency, bundle loading, database query count, and slow-network behavior.
4. Standardize validation errors, confirmations, toasts, pagination, dates/time zones, and recovery screens.
5. Expand automated tests around permission boundaries, migrations, queues, public-data leakage, and regression-prone UI services.

Browser checkpoint: perform a written role-by-role user acceptance checklist with no console errors or unexplained demo behavior.

## Phase 9 — Production readiness and controlled deployment

1. Configure the final domain, long-lived HTTPS, production email delivery, queues, scheduler, logs, health checks, and monitoring.
2. Rotate all development credentials and use least-privilege production secrets.
3. Establish automatic database backups and perform a documented restore test.
4. Configure retention, privacy notices, security headers, firewall/SSH restrictions, and dependency scanning.
5. Create a repeatable release process with migration, build, smoke-test, rollback, and post-deployment verification steps.
6. Deploy the accepted local release to EC2 or the final hosting environment only after approval.

Final checkpoint: complete production smoke tests for public browsing, every staff role, publication-to-AI indexing, email, backup recovery, and monitoring.

## Immediate order

Use [the system flow and acceptance plan](system-flow-and-acceptance-plan.md) as the
authoritative execution checklist. Phase 4 is the next implementation phase, but
the short readiness gate in that document must be completed before the full browser
acceptance session.

Phase 4 remains next in this order:

1. complete draft, publish, delegation, editing and closure behavior;
2. enforce programme, date, role and officer rules;
3. synchronize call states with staff dashboards and public pages;
4. configure the official application URL and safe Apply behavior;
5. add scheduled automatic closure and auditing.
