<?php

namespace App\Console\Commands;

use App\Models\ApplicationCall;
use App\Models\AuditEvent;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CloseExpiredApplicationCalls extends Command
{
    protected $signature = 'pcs:close-expired-calls {--limit=500 : Maximum calls to close in one run}';

    protected $description = 'Close published application calls whose deadline has passed and record an audit event';

    public function handle(): int
    {
        $limit = max(1, min((int) $this->option('limit'), 5000));
        $calls = ApplicationCall::query()
            ->where('status', 'open')
            ->whereDate('deadline', '<', today())
            ->oldest('deadline')
            ->limit($limit)
            ->get();

        $closed = 0;
        foreach ($calls as $call) {
            DB::transaction(function () use ($call, &$closed): void {
                $changed = ApplicationCall::query()
                    ->whereKey($call->id)
                    ->where('status', 'open')
                    ->update([
                        'status' => 'closed',
                        'closed_reason' => 'Automatically closed when the application deadline passed.',
                        'closed_at' => now(),
                        'updated_at' => now(),
                    ]);

                if ($changed !== 1) {
                    return;
                }

                AuditEvent::create([
                    'actor_id' => null,
                    'action' => 'application_call.auto_closed',
                    'target_type' => ApplicationCall::class,
                    'target_id' => $call->id,
                    'before_state' => ['status' => 'open'],
                    'after_state' => ['status' => 'closed'],
                    'metadata' => ['source' => 'scheduler'],
                    'request_id' => (string) Str::uuid(),
                    'created_at' => now(),
                ]);
                $closed++;
            });
        }

        $this->info("Closed {$closed} expired application call(s).");

        return self::SUCCESS;
    }
}
