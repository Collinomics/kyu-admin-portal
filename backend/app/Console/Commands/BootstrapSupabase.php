<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BootstrapSupabase extends Command
{
    protected $signature = 'pcs:supabase-bootstrap {--force : Allow execution in production}';

    protected $description = 'Create the private PCS and AI schemas and enable pgvector';

    public function handle(): int
    {
        if (app()->isProduction() && ! $this->option('force')) {
            $this->error('Refusing to bootstrap production without --force.');

            return self::FAILURE;
        }

        $path = database_path('sql/001_bootstrap_supabase.sql');
        $sql = file_get_contents($path);
        if ($sql === false) {
            $this->error("Unable to read {$path}");

            return self::FAILURE;
        }

        $connection = config('database.connections.pgsql_admin.username') ? 'pgsql_admin' : 'pgsql';
        DB::connection($connection)->unprepared($sql);

        $state = DB::connection($connection)->selectOne(<<<'SQL'
            select
                case when to_regnamespace('pcs') is not null then 1 else 0 end as pcs_exists,
                case when to_regnamespace('ai') is not null then 1 else 0 end as ai_exists,
                case when exists (select 1 from pg_extension where extname = 'vector') then 1 else 0 end as vector_enabled,
                case when has_schema_privilege('anon', 'pcs', 'USAGE') then 1 else 0 end as anon_pcs_access,
                case when has_schema_privilege('authenticated', 'pcs', 'USAGE') then 1 else 0 end as authenticated_pcs_access,
                case when has_schema_privilege('anon', 'ai', 'USAGE') then 1 else 0 end as anon_ai_access,
                case when has_schema_privilege('authenticated', 'ai', 'USAGE') then 1 else 0 end as authenticated_ai_access
            SQL);

        $valid = (int) $state->pcs_exists === 1
            && (int) $state->ai_exists === 1
            && (int) $state->vector_enabled === 1
            && (int) $state->anon_pcs_access === 0
            && (int) $state->authenticated_pcs_access === 0
            && (int) $state->anon_ai_access === 0
            && (int) $state->authenticated_ai_access === 0;

        if (! $valid) {
            $this->error('Schema verification failed; inspect grants before continuing.');

            return self::FAILURE;
        }

        $this->info('Verified: pcs and ai are private, and vector is enabled.');

        return self::SUCCESS;
    }
}
