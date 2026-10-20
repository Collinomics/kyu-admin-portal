# KYU PCS local setup guide

This package contains the project source code only. Generated dependencies, caches, databases, uploaded files and secret `.env` files are deliberately excluded.

## 1. Install the required software

Install:

- Node.js 20 or newer (Node.js 22 LTS is recommended)
- PHP 8.2 or newer, with `pdo_pgsql`, `pgsql`, `openssl`, `mbstring`, `fileinfo`, `curl`, `xml` and `zip` enabled
- Composer 2
- Git is optional
- ClamAV is optional for ordinary catalogue testing, but required to test secure knowledge-source uploads

Confirm the main tools in PowerShell:

```powershell
node --version
npm --version
php --version
composer --version
```

## 2. Extract and install dependencies

Extract the ZIP, open PowerShell in the extracted `kyu-admin-portal` folder, then run:

```powershell
npm install
Set-Location backend
composer install
Copy-Item .env.example .env
New-Item -ItemType Directory -Force bootstrap/cache, storage/app/private, storage/app/public, storage/framework/cache/data, storage/framework/sessions, storage/framework/testing, storage/framework/views, storage/logs | Out-Null
php artisan key:generate
```

Do not copy another person's real `.env` file or credentials into the package.

## 3. Configure the local backend

Open `backend/.env` and provide a development PostgreSQL/Supabase database connection:

```env
APP_ENV=local
APP_DEBUG=true
APP_URL=http://127.0.0.1:8000
FRONTEND_URL=http://localhost:5173

DB_CONNECTION=pgsql
DB_HOST=your-development-database-host
DB_PORT=5432
DB_DATABASE=postgres
DB_USERNAME=your-development-database-user
DB_PASSWORD=your-development-database-password
DB_SSLMODE=require
DB_SCHEMA=pcs
```

Use a separate development database. The database password and API keys must be shared through an approved password manager, never through the ZIP, email or source code.

For the AI assistant, either configure the existing AWS Secrets Manager development access or temporarily place a development-only NVIDIA key in `backend/.env`:

```env
AWS_SECRETS_MANAGER_ENABLED=false
NVIDIA_API_KEY=your-development-key
```

Never use or share the production API key. The catalogue and administration features can still be developed without an AI key, but AI answers will not work.

For local activation codes, this development-only setting may be enabled:

```env
PCS_SHOW_DEVELOPMENT_OTP=true
```

## 4. Prepare the database

From the `backend` folder run:

```powershell
php artisan migrate
php artisan db:seed
php artisan config:clear
```

Seeding a fresh system administrator requires temporary values in `backend/.env`:

```env
PCS_BOOTSTRAP_ADMIN_EMAIL=your-local-admin@example.com
PCS_BOOTSTRAP_ADMIN_PASSWORD=choose-a-strong-local-password
```

Run `php artisan db:seed`, confirm the account works, and then remove those two values from `.env` because they are bootstrap inputs, not permanent application settings.

## 5. Start the project

Use two PowerShell windows.

Backend window:

```powershell
Set-Location backend
php artisan serve
```

Frontend window, from the project root:

```powershell
npm run dev
```

Open `http://localhost:5173`. Vite automatically forwards `/api` requests to the Laravel server at `http://127.0.0.1:8000`.

For queued knowledge processing, use a third window:

```powershell
Set-Location backend
php artisan queue:work --tries=1
```

## 6. Quick verification

From the project root:

```powershell
npm run build
```

From `backend`:

```powershell
php artisan test
```

Then verify that you can sign in, open the public catalogue, open User Management, and load Admissions and Course Profiling.

## Common problems

- `Could not open input file: artisan`: run Laravel commands inside the `backend` folder.
- Database connection error: recheck the PostgreSQL host, username, password, SSL mode and network access.
- AI assistant returns a safe fallback: the development AI credential is missing, expired or inaccessible.
- Knowledge upload remains blocked: install/configure ClamAV and start the queue worker.
- Frontend shows old code: stop Vite, run `npm install`, then run `npm run dev` again.

## Security rules

- Never commit or send `.env` files, AWS keys, API keys, database passwords, PEM files, uploaded documents or production database exports.
- Use development credentials with minimum permissions.
- Keep `APP_DEBUG=false` outside local development.
- Do not point this copy at the production database.
