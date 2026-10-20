<?php

namespace App\Console\Commands;

use App\Models\AffiliatedInstitution;
use App\Models\Programme;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class VerifyCatalogue extends Command
{
    protected $signature = 'pcs:verify-catalogue';

    protected $description = 'Verify the imported canonical catalogue and pending AI publication events';

    public function handle(): int
    {
        $programmes = Programme::count();
        $publishedProgrammes = Programme::where('status', 'published')->count();
        $versions = DB::table('programme_versions')->count();
        $affiliates = AffiliatedInstitution::count();
        $publishedAffiliates = AffiliatedInstitution::where('is_published', true)->count();
        $outbox = DB::table('integration_outbox')
            ->whereIn('event_type', ['programme.published', 'affiliated-institution.published'])
            ->whereNull('processed_at')
            ->count();

        $this->table(['Check', 'Actual', 'Expected'], [
            ['Programmes', $programmes, 163],
            ['Published programmes', $publishedProgrammes, 163],
            ['Programme version snapshots', $versions, 163],
            ['Affiliated institutions', $affiliates, 121],
            ['Published affiliated institutions', $publishedAffiliates, 121],
            ['Pending AI publication events', $outbox, 284],
        ]);

        $valid = $programmes === 163
            && $publishedProgrammes === 163
            && $versions === 163
            && $affiliates === 121
            && $publishedAffiliates === 121
            && $outbox === 284;

        $valid
            ? $this->info('Canonical catalogue verification passed.')
            : $this->error('Canonical catalogue verification failed.');

        return $valid ? self::SUCCESS : self::FAILURE;
    }
}
