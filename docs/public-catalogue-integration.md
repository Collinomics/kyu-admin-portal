# Public catalogue integration

The frontend submitted in `support/my-app` was reviewed and adapted into the main
React/Vite application. Its useful catalogue design and interactions now live in
`src/features/catalogue`.

## Integration decisions

- `/` is the public catalogue; `/admin/*` remains the authenticated staff portal.
- Published programme records come from the PCS database through the read-only
  `/api/v1/catalogue/programmes` endpoints.
- Draft, submitted, reviewed and rejected records are never returned publicly.
- Application status and deadlines come from real published application calls.
- Public bookmarks contain only programme UUIDs and remain local to the visitor's
  browser; no personal or authentication information is stored there.
- The submitted localStorage signup/login implementation was discarded. Staff
  authentication continues through Laravel Sanctum, and public applicant accounts
  will only be added if a real requirement and backend workflow are approved.
- The submitted rule-based AI simulation was discarded. The floating assistant
  now uses the real NVIDIA-backed service and the shared Supabase database.
- Retrieval is restricted in the database to indexed chunks whose source is
  published. A programme-specific conversation is also scoped to the selected
  published programme UUID.
- Anonymous AI telemetry stores operational metadata for the administrator's AI
  Monitor, but does not store the visitor's question or the generated answer.
- NVIDIA output is relayed through Laravel as server-sent events, allowing the
  visitor to see the checked answer progressively while it is generated.
- The integrated widget retains tab-session history, safe Markdown and tables,
  expandable comparisons, sharing, feedback, a teaser and console-managed
  branding without exposing the NVIDIA key to the browser.
- Sensitive-data, prompt-disclosure, internal-system and unrelated political or
  religious requests are rejected before model inference. Output is checked again
  before it is returned to the visitor.

## Removed duplicate scaffolding

The separate Create React App package, lock file, router, public HTML shell, global
CSS, duplicate logo, hardcoded sample programmes, prototype authentication and
simulated AI are not runtime dependencies of the integrated catalogue.
