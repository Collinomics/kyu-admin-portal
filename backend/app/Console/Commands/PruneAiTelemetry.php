<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class PruneAiTelemetry extends Command
{
    protected $signature = 'pcs:prune-ai-telemetry {--days=90 : Retain telemetry newer than this many days}';

    protected $description = 'Remove expired AI telemetry and erase legacy visitor IP addresses';

    public function handle(): int
    {
        $days = max(30, min((int) $this->option('days'), 365));
        $connection = DB::connection('pgsql_ai');

        $anonymised = $connection->table('monitor_events')->whereNotNull('ip_address')->update([
            'ip_address' => null,
        ]);
        $deleted = $connection->table('monitor_events')->where('ts', '<', now()->subDays($days))->delete();

        $this->info("AI telemetry retention complete: {$deleted} expired event(s) removed; {$anonymised} legacy IP value(s) erased.");

        return self::SUCCESS;
    }
}
