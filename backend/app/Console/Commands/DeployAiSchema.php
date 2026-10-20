<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class DeployAiSchema extends Command
{
    protected $signature = 'pcs:deploy-ai-schema {--force : Allow execution in production}';

    protected $description = 'Deploy and verify the private AI tables and database functions';

    public function handle(): int
    {
        if (app()->isProduction() && ! $this->option('force')) {
            $this->error('Refusing to deploy the AI schema in production without --force.');

            return self::FAILURE;
        }

        $path = database_path('sql/002_ai_runtime.sql');
        $sql = file_get_contents($path);
        if ($sql === false) {
            $this->error("Unable to read {$path}");

            return self::FAILURE;
        }

        DB::connection('pgsql_admin')->unprepared($sql);
        $state = DB::connection('pgsql_admin')->selectOne(<<<'SQL'
            select
                (select count(*) from information_schema.tables where table_schema = 'ai') as table_count,
                (select count(*) from information_schema.routines where routine_schema = 'ai') as routine_count,
                has_schema_privilege('ai_runtime', 'ai', 'USAGE') as ai_has_access,
                has_schema_privilege('pcs_app', 'ai', 'USAGE') as pcs_has_access,
                has_schema_privilege('anon', 'ai', 'USAGE') as anon_has_access,
                has_schema_privilege('authenticated', 'ai', 'USAGE') as authenticated_has_access
            SQL);

        $valid = (int) $state->table_count === 4
            && (int) $state->routine_count >= 13
            && filter_var($state->ai_has_access, FILTER_VALIDATE_BOOL)
            && ! filter_var($state->pcs_has_access, FILTER_VALIDATE_BOOL)
            && ! filter_var($state->anon_has_access, FILTER_VALIDATE_BOOL)
            && ! filter_var($state->authenticated_has_access, FILTER_VALIDATE_BOOL);

        if (! $valid) {
            $this->error('AI schema verification failed; inspect objects and grants.');

            return self::FAILURE;
        }

        $this->info("Verified private AI schema: {$state->table_count} tables and {$state->routine_count} functions.");

        return self::SUCCESS;
    }
}
