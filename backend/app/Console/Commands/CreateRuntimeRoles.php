<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use PDO;
use RuntimeException;

class CreateRuntimeRoles extends Command
{
    protected $signature = 'pcs:create-runtime-roles {--force : Allow execution in production}';

    protected $description = 'Create and verify least-privilege PCS and AI database login roles';

    public function handle(): int
    {
        if (app()->isProduction() && ! $this->option('force')) {
            $this->error('Refusing to change production roles without --force.');

            return self::FAILURE;
        }

        $adminConnection = config('database.connections.pgsql_admin.username') ? 'pgsql_admin' : 'pgsql';
        $adminUsername = (string) config("database.connections.{$adminConnection}.username");
        $adminPassword = (string) config("database.connections.{$adminConnection}.password");
        $separator = strpos($adminUsername, '.');
        if ($separator === false) {
            $this->error('Expected a Supavisor username in role.project-reference format.');

            return self::FAILURE;
        }

        $tenantSuffix = substr($adminUsername, $separator);
        $pcsPassword = (string) (env('PCS_RUNTIME_DB_PASSWORD') ?: bin2hex(random_bytes(32)));
        $aiPassword = (string) (env('AI_RUNTIME_DB_PASSWORD') ?: bin2hex(random_bytes(32)));
        $pdo = DB::connection($adminConnection)->getPdo();

        $this->upsertRole($adminConnection, $pdo, 'pcs_app', $pcsPassword);
        $this->upsertRole($adminConnection, $pdo, 'ai_runtime', $aiPassword);
        $this->applyGrants($adminConnection);

        $pcsUsername = 'pcs_app'.$tenantSuffix;
        $aiUsername = 'ai_runtime'.$tenantSuffix;
        $this->verifyLogin($pcsUsername, $pcsPassword, expectedPcs: true);
        $this->verifyLogin($aiUsername, $aiPassword, expectedPcs: false);

        $this->writeEnvironment([
            'SUPABASE_ADMIN_DB_USERNAME' => $adminUsername,
            'SUPABASE_ADMIN_DB_PASSWORD' => $adminPassword,
            'PCS_RUNTIME_DB_USERNAME' => $pcsUsername,
            'PCS_RUNTIME_DB_PASSWORD' => $pcsPassword,
            'AI_RUNTIME_DB_USERNAME' => $aiUsername,
            'AI_RUNTIME_DB_PASSWORD' => $aiPassword,
            'DB_USERNAME' => $pcsUsername,
            'DB_PASSWORD' => $pcsPassword,
        ]);

        $this->info('Runtime roles verified. Laravel now uses pcs_app; AI credentials are stored locally.');

        return self::SUCCESS;
    }

    private function upsertRole(string $connection, PDO $pdo, string $role, string $password): void
    {
        $exists = DB::connection($connection)->selectOne('select 1 from pg_roles where rolname = ?', [$role]);
        $quotedPassword = $pdo->quote($password);
        DB::connection($connection)->unprepared($exists
            ? "alter role {$role} with login password {$quotedPassword}"
            : "create role {$role} with login password {$quotedPassword}");
    }

    private function applyGrants(string $connection): void
    {
        DB::connection($connection)->unprepared(<<<'SQL'
            grant connect on database postgres to pcs_app, ai_runtime;

            grant usage on schema pcs to pcs_app;
            grant select, insert, update, delete on all tables in schema pcs to pcs_app;
            grant usage, select, update on all sequences in schema pcs to pcs_app;
            grant execute on all functions in schema pcs to pcs_app;
            alter default privileges for role postgres in schema pcs grant select, insert, update, delete on tables to pcs_app;
            alter default privileges for role postgres in schema pcs grant usage, select, update on sequences to pcs_app;
            alter default privileges for role postgres in schema pcs grant execute on functions to pcs_app;

            grant usage on schema ai, extensions to ai_runtime;
            grant select, insert, update, delete on all tables in schema ai to ai_runtime;
            grant usage, select, update on all sequences in schema ai to ai_runtime;
            grant execute on all functions in schema ai to ai_runtime;
            alter default privileges for role postgres in schema ai grant select, insert, update, delete on tables to ai_runtime;
            alter default privileges for role postgres in schema ai grant usage, select, update on sequences to ai_runtime;
            alter default privileges for role postgres in schema ai grant execute on functions to ai_runtime;

            revoke all on schema ai from pcs_app;
            revoke all on schema pcs from ai_runtime;
            SQL);
    }

    private function verifyLogin(string $username, string $password, bool $expectedPcs): void
    {
        $dsn = sprintf(
            'pgsql:host=%s;port=%s;dbname=%s;sslmode=%s',
            config('database.connections.pgsql.host'),
            config('database.connections.pgsql.port'),
            config('database.connections.pgsql.database'),
            config('database.connections.pgsql.sslmode'),
        );
        $pdo = new PDO($dsn, $username, $password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $row = $pdo->query(<<<'SQL'
            select
                has_schema_privilege(current_user, 'pcs', 'USAGE') as pcs_access,
                has_schema_privilege(current_user, 'ai', 'USAGE') as ai_access
            SQL)->fetch(PDO::FETCH_ASSOC);

        $pcsAccess = filter_var($row['pcs_access'], FILTER_VALIDATE_BOOL);
        $aiAccess = filter_var($row['ai_access'], FILTER_VALIDATE_BOOL);
        if ($pcsAccess !== $expectedPcs || $aiAccess === $expectedPcs) {
            throw new RuntimeException('Runtime role privilege verification failed.');
        }
    }

    private function writeEnvironment(array $values): void
    {
        $path = base_path('.env');
        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new RuntimeException('Unable to read the local .env file.');
        }

        foreach ($values as $key => $value) {
            $line = $key.'='.$this->encodeEnvironmentValue((string) $value);
            $pattern = '/^'.preg_quote($key, '/').'\s*=.*$/m';
            if (preg_match($pattern, $contents)) {
                $contents = (string) preg_replace($pattern, $line, $contents);
            } else {
                $contents .= PHP_EOL.$line;
            }
        }

        if (file_put_contents($path, $contents, LOCK_EX) === false) {
            throw new RuntimeException('Unable to update the local .env file.');
        }
    }

    private function encodeEnvironmentValue(string $value): string
    {
        return '"'.str_replace(['\\', '"', '$'], ['\\\\', '\\"', '\\$'], $value).'"';
    }
}
