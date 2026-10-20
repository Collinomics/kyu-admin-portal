<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ClearStaleCatalogueImports extends Command
{
    protected $signature = 'pcs:clear-stale-catalogue-imports';

    protected $description = 'Terminate stale uncommitted PCS catalogue import transactions';

    public function handle(): int
    {
        $rows = DB::connection('pgsql_admin')->select(<<<'SQL'
            select pid, pg_terminate_backend(pid) as terminated
            from pg_stat_activity
            where pid <> pg_backend_pid()
              and usename = 'pcs_app'
              and xact_start < now() - interval '30 seconds'
              and (
                  state = 'idle in transaction'
                  or query ilike '%programmes%'
                  or query ilike '%affiliated_institutions%'
                  or query ilike '%programme_versions%'
              )
            SQL);

        $terminated = count(array_filter($rows, static fn ($row): bool => filter_var($row->terminated, FILTER_VALIDATE_BOOL)));
        $this->info("Terminated {$terminated} stale uncommitted catalogue import connection(s).");

        return self::SUCCESS;
    }
}
