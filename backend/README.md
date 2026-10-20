# Kyambogo PCS API

Laravel 12 API for the canonical Supabase PostgreSQL-backed Programme Catalogue
System. Sanctum protects the versioned administrator API. Core PCS records and the
derived AI index share one physical database but use separate schemas and privileges.

## Local configuration

Copy `.env.example` to `.env`, generate the application key, and fill in the Supabase
Session pooler values. Keep `DB_SCHEMA=pcs` and `DB_SSLMODE=require`.

```bash
php artisan key:generate
php artisan pcs:supabase-bootstrap
php artisan migrate --database=pgsql_admin
php artisan pcs:create-runtime-roles
php artisan pcs:deploy-ai-schema
php artisan pcs:import-supplied-catalogue
```

To create the first System Administrator, set a strong
`PCS_BOOTSTRAP_ADMIN_PASSWORD` in `.env`, run `php artisan db:seed`, sign in, and then
remove that bootstrap value from the environment.

## Verification

```bash
php artisan test
vendor/bin/pint --test
php artisan route:list --path=api/v1
php artisan pcs:verify-catalogue
php ../support/chatwidget/integration_smoke.php
```

Schema-changing commands and migrations use `pgsql_admin`. Runtime web requests and
ordinary application commands use the restricted `pcs_app` account. The standalone
AI PHP service uses the separately restricted `ai_runtime` credentials; during local
development it reads those values from `backend/.env` without printing them.

The supplied initial catalogue is imported idempotently: 163 university programmes
go to `pcs.programmes`, while 121 affiliated institutions go to
`pcs.affiliated_institutions`. Re-running the import skips existing records unless
`--refresh` is explicitly supplied.

Implemented API endpoints:

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/reauthenticate`
- `POST /api/v1/auth/logout`
