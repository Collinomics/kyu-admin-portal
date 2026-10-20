<?php

namespace App\Console\Commands;

use App\Models\Faculty;
use App\Models\Programme;
use App\Support\CatalogueAcademicUnitResolver;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class NormalizeProgrammeAcademicUnits extends Command
{
    protected $signature = 'pcs:normalize-programme-units
        {--dry-run : Report changes without updating programme records}';

    protected $description = 'Assign supplied catalogue programmes to their canonical faculty, school or institute';

    public function handle(): int
    {
        $unitIds = Faculty::query()->where('is_active', true)->pluck('id', 'name');
        $changes = [];
        $unmatched = [];
        $unchanged = 0;

        Programme::query()
            ->whereNotNull('source_ref')
            ->select(['id', 'name', 'overview', 'faculty_id'])
            ->orderBy('name')
            ->each(function (Programme $programme) use ($unitIds, &$changes, &$unmatched, &$unchanged): void {
                $canonicalName = CatalogueAcademicUnitResolver::canonicalNameFromOverview($programme->overview);
                $unitId = $canonicalName === null ? null : $unitIds->get($canonicalName);

                if ($canonicalName === null || $unitId === null) {
                    $unmatched[] = [
                        'programme' => $programme->name,
                        'provider' => CatalogueAcademicUnitResolver::providerFromOverview($programme->overview) ?? 'Not detected',
                    ];

                    return;
                }

                if ($programme->faculty_id === $unitId) {
                    $unchanged++;

                    return;
                }

                $changes[] = ['id' => $programme->id, 'unit_id' => $unitId, 'unit' => $canonicalName];
            });

        if ($unmatched !== []) {
            $this->error('No database academic unit could be resolved for these supplied programmes:');
            $this->table(['Programme', 'Detected provider'], $unmatched);
            $this->warn('No records were changed. Seed the missing academic units or correct their catalogue overview first.');

            return self::FAILURE;
        }

        if (! $this->option('dry-run') && $changes !== []) {
            DB::transaction(function () use ($changes): void {
                foreach (collect($changes)->groupBy('unit_id') as $unitId => $unitChanges) {
                    Programme::whereIn('id', $unitChanges->pluck('id')->all())->update(['faculty_id' => $unitId]);
                }
            });
        }

        $byUnit = collect($changes)->countBy('unit')->sortKeys()->map(
            fn (int $count, string $unit): array => [$unit, $count]
        )->values()->all();
        if ($byUnit !== []) {
            $this->table(['Academic unit', 'Programmes'], $byUnit);
        }

        $verb = $this->option('dry-run') ? 'would be assigned' : 'assigned';
        $this->info(sprintf(
            '%d programmes %s; %d were already correct; 0 were unmatched.',
            count($changes),
            $verb,
            $unchanged,
        ));

        return self::SUCCESS;
    }
}
