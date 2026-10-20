# AI service deployment security

## Immediate credential action

The supplied folder contained a live-looking Supabase service-role credential. Its
local copy has been removed, but removal does not revoke it. Rotate/revoke that key in
Supabase before deployment or further sharing, then inspect repository history and
shared archives for other copies.

## Server environment

Configure database and AI values through the web-server/process environment. Never
commit filled values. Never use a Vite
`VITE_*` variable for secrets because Vite embeds those values into browser bundles.

- `AI_DB_HOST`, `AI_DB_PORT`, `AI_DB_DATABASE`: Supabase pooler connection.
- `AI_DB_USERNAME`, `AI_DB_PASSWORD`: restricted `ai_runtime` login, never the
  Supabase administrator or service-role credential.
- `AI_DB_SSLMODE`: keep this as `require` for Supabase.
- `NVIDIA_API_KEY`: server-only model API key.
- `PCS_CONSOLE_TOKEN`: long random token used only from PCS backend to AI console API.
- `PUBLIC_WIDGET_ORIGINS`: comma-separated exact public website origins.
- `CONSOLE_ORIGINS`: exact PCS backend origins if cross-origin calls are required.
- `TRUST_PROXY_HEADERS`: enable only behind a configured trusted reverse proxy.

Serve PHP over HTTPS. Keep secrets, import scripts, SQL files, exports and CLI tools
outside the public web root or deny them at the web-server layer.

## Endpoint exposure

- Public: `chat_api.php`, `feedback_api.php`, `public_settings_api.php`.
- Administrator/server-only: `monitor_api.php`, `settings_api.php`.
- Maintenance only: importers, seed files, SQL and sync utilities.

Administrator endpoints fail closed without `PCS_CONSOLE_TOKEN`. The browser calls
the authenticated, same-origin PCS proxy paths:

```dotenv
VITE_MONITOR_API_URL=/api/v1/admin/ai-monitor
VITE_AI_SETTINGS_API_URL=/api/v1/admin/ai-settings
```

## Database rollout

Apply schema changes through the administrator-only Laravel commands, then run
`pcs:verify-catalogue` and `support/chatwidget/integration_smoke.php`. The `pcs`,
`ai`, `anon`, and `authenticated` access boundaries are checked automatically. The
chatbot no longer uses PostgREST or a Supabase service-role key.

Define prompt/answer retention, minimize stored IP data, restrict console access to
system administrators, and test restores before enabling destructive settings actions.
