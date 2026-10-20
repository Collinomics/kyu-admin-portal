<?php

namespace App\Console\Commands;

use App\Models\AffiliatedInstitution;
use App\Models\Faculty;
use App\Models\Programme;
use App\Models\ProgrammeVersion;
use App\Support\CatalogueAcademicUnitResolver;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class ImportSuppliedCatalogue extends Command
{
    private ?array $academicUnitIds = null;

    protected $signature = 'pcs:import-supplied-catalogue
        {path? : JSON export path}
        {--refresh : Overwrite previously imported records from the same source references}';

    protected $description = 'Import supplied programme and affiliated-institution records into the canonical PCS catalogue';

    public function handle(): int
    {
        $path = $this->argument('path') ?: base_path('../support/chatwidget/programmes_export.json');
        $json = file_get_contents($path);
        $rows = $json === false ? null : json_decode($json, true);
        if (! is_array($rows)) {
            $this->error("Catalogue JSON is missing or invalid: {$path}");

            return self::FAILURE;
        }

        $counts = ['programmes' => 0, 'affiliates' => 0, 'skipped' => 0];
        DB::transaction(function () use ($rows, &$counts): void {
            if (! $this->option('refresh') && Programme::count() === 0 && AffiliatedInstitution::count() === 0) {
                $this->bulkInitialImport($rows, $counts);

                return;
            }
            foreach ($rows as $row) {
                if (! is_array($row) || empty($row['id']) || empty($row['name'])) {
                    throw new RuntimeException('Every supplied catalogue row must have an id and name.');
                }
                if (str_starts_with(strtolower((string) $row['id']), 'aff-')) {
                    $this->importAffiliate($row, $counts);
                } else {
                    $this->importProgramme($row, $counts);
                }
            }
        });

        $this->info(sprintf(
            'Canonical catalogue ready: %d programmes, %d affiliated institutions, %d existing records skipped.',
            $counts['programmes'], $counts['affiliates'], $counts['skipped']
        ));

        return self::SUCCESS;
    }

    private function importProgramme(array $row, array &$counts): void
    {
        $sourceRef = (string) $row['id'];
        $programme = Programme::where('source_ref', $sourceRef)->first();
        if ($programme && ! $this->option('refresh')) {
            $counts['skipped']++;

            return;
        }

        $attributes = [
            'code' => $this->programmeCode($row, $programme),
            'name' => trim((string) $row['name']),
            'category' => $this->programmeCategory($row),
            'faculty_id' => $this->academicUnitId($row),
            'status' => 'published',
            'version' => $programme?->version ?? 1,
            'overview' => $this->nullableText($row['overview'] ?? null),
            'objective_impact' => $this->nullableText($row['objective_impact'] ?? null),
            'philosophy_originality' => $this->nullableText($row['philosophy_originality'] ?? null),
            'career_prospects' => $this->nullableText($row['career_prospects'] ?? null),
            'admission_requirements' => $this->nullableText($row['admission_requirements'] ?? null),
            'structure_content' => $this->nullableText($row['structure'] ?? null),
            'published_at' => $programme?->published_at ?? now(),
        ];

        if ($programme) {
            $programme->fill($attributes)->save();
        } else {
            $programme = Programme::create(['source_ref' => $sourceRef, ...$attributes]);
        }

        $snapshot = $programme->only([
            'source_ref', 'code', 'name', 'category', 'faculty_id', 'status', 'overview',
            'objective_impact', 'philosophy_originality', 'career_prospects',
            'admission_requirements', 'structure_content',
        ]);
        ProgrammeVersion::firstOrCreate(
            ['programme_id' => $programme->id, 'version' => $programme->version],
            ['snapshot' => $snapshot, 'created_at' => now()]
        );
        $this->queuePublication('programme.published', $programme->id, $programme->version, $snapshot);
        $counts['programmes']++;
    }

    private function importAffiliate(array $row, array &$counts): void
    {
        $sourceRef = (string) $row['id'];
        $institution = AffiliatedInstitution::where('source_ref', $sourceRef)->first();
        if ($institution && ! $this->option('refresh')) {
            $counts['skipped']++;

            return;
        }

        $overview = trim((string) ($row['overview'] ?? ''));
        $parsed = $this->parseAffiliateOverview($overview);
        $attributes = [
            'name' => trim((string) $row['name']),
            'overview' => $this->nullableText($overview),
            ...$parsed,
            'is_published' => true,
            'version' => $institution?->version ?? 1,
            'published_at' => $institution?->published_at ?? now(),
        ];
        if ($institution) {
            $institution->fill($attributes)->save();
        } else {
            $institution = AffiliatedInstitution::create(['source_ref' => $sourceRef, ...$attributes]);
        }

        $this->queuePublication(
            'affiliated-institution.published',
            $institution->id,
            $institution->version,
            $institution->only(['source_ref', 'name', 'overview', 'institution_type', 'location', 'affiliation_status', 'offerings'])
        );
        $counts['affiliates']++;
    }

    private function programmeCategory(array $row): string
    {
        $id = strtolower((string) $row['id']);
        $name = strtolower((string) $row['name']);
        if (str_starts_with($id, 'pg-')) {
            return 'Postgraduate';
        }
        if (str_starts_with($name, 'diploma')) {
            return 'Diploma';
        }
        if (str_starts_with($name, 'certificate')) {
            return 'Vocational';
        }

        return 'Undergraduate';
    }

    private function programmeCode(array $row, ?Programme $existing): string
    {
        if ($existing) {
            return $existing->code;
        }
        $candidate = $this->baseProgrammeCode($row);
        if (Programme::where('code', $candidate)->exists()) {
            $candidate = substr($candidate, 0, 33).'-'.strtoupper(substr(sha1((string) $row['id']), 0, 6));
        }

        return $candidate;
    }

    private function baseProgrammeCode(array $row): string
    {
        $overview = (string) ($row['overview'] ?? '');
        preg_match('/(?:day|programme) programme code\s+([a-z0-9-]+)/i', $overview, $matches);
        $candidate = strtoupper((string) ($matches[1] ?? ''));
        if ($candidate === '') {
            $tail = preg_replace('/^(ug|pg)-/i', '', (string) $row['id']);
            $candidate = preg_match('/^[a-z0-9-]{2,20}$/i', (string) $tail)
                ? strtoupper((string) $tail)
                : 'PCS-'.strtoupper(substr(sha1((string) $row['id']), 0, 10));
        }

        return $candidate;
    }

    private function bulkInitialImport(array $rows, array &$counts): void
    {
        $now = now();
        $programmes = [];
        $versions = [];
        $affiliates = [];
        $outbox = [];
        $usedCodes = [];

        foreach ($rows as $row) {
            if (! is_array($row) || empty($row['id']) || empty($row['name'])) {
                throw new RuntimeException('Every supplied catalogue row must have an id and name.');
            }
            $sourceRef = (string) $row['id'];
            $id = (string) Str::uuid();
            if (str_starts_with(strtolower($sourceRef), 'aff-')) {
                $overview = trim((string) ($row['overview'] ?? ''));
                $parsed = $this->parseAffiliateOverview($overview);
                $payload = [
                    'source_ref' => $sourceRef,
                    'name' => trim((string) $row['name']),
                    'overview' => $this->nullableText($overview),
                    ...$parsed,
                ];
                $affiliates[] = [
                    'id' => $id, ...$payload, 'is_published' => true, 'version' => 1,
                    'published_at' => $now, 'created_at' => $now, 'updated_at' => $now,
                ];
                $eventType = 'affiliated-institution.published';
                $counts['affiliates']++;
            } else {
                $code = $this->baseProgrammeCode($row);
                if (isset($usedCodes[$code])) {
                    $code = substr($code, 0, 33).'-'.strtoupper(substr(sha1($sourceRef), 0, 6));
                }
                $usedCodes[$code] = true;
                $payload = [
                    'source_ref' => $sourceRef,
                    'code' => $code,
                    'name' => trim((string) $row['name']),
                    'category' => $this->programmeCategory($row),
                    'faculty_id' => $this->academicUnitId($row),
                    'status' => 'published',
                    'overview' => $this->nullableText($row['overview'] ?? null),
                    'objective_impact' => $this->nullableText($row['objective_impact'] ?? null),
                    'philosophy_originality' => $this->nullableText($row['philosophy_originality'] ?? null),
                    'career_prospects' => $this->nullableText($row['career_prospects'] ?? null),
                    'admission_requirements' => $this->nullableText($row['admission_requirements'] ?? null),
                    'structure_content' => $this->nullableText($row['structure'] ?? null),
                ];
                $programmes[] = [
                    'id' => $id, ...$payload, 'version' => 1, 'published_at' => $now,
                    'created_at' => $now, 'updated_at' => $now,
                ];
                $versions[] = [
                    'id' => (string) Str::uuid(), 'programme_id' => $id, 'version' => 1,
                    'snapshot' => json_encode($payload, JSON_THROW_ON_ERROR), 'created_at' => $now,
                ];
                $eventType = 'programme.published';
                $counts['programmes']++;
            }
            $outbox[] = [
                'id' => (string) Str::uuid(), 'event_type' => $eventType,
                'aggregate_id' => $id, 'aggregate_version' => 1,
                'payload' => json_encode($payload, JSON_THROW_ON_ERROR), 'attempts' => 0,
                'available_at' => $now, 'created_at' => $now, 'updated_at' => $now,
            ];
        }

        foreach (array_chunk($programmes, 80) as $chunk) {
            DB::table('programmes')->insert($chunk);
        }
        foreach (array_chunk($versions, 80) as $chunk) {
            DB::table('programme_versions')->insert($chunk);
        }
        foreach (array_chunk($affiliates, 80) as $chunk) {
            DB::table('affiliated_institutions')->insert($chunk);
        }
        foreach (array_chunk($outbox, 80) as $chunk) {
            DB::table('integration_outbox')->insert($chunk);
        }
    }

    private function parseAffiliateOverview(string $overview): array
    {
        $values = ['institution_type' => null, 'location' => null, 'affiliation_status' => null, 'offerings' => null];
        if (preg_match('/ is an? (.+?) institution located in (.+?) affiliated .*?status:\s*(.+?)\.\s*It offers:\s*(.+?)\.?$/iu', $overview, $matches)) {
            $values = [
                'institution_type' => trim($matches[1]),
                'location' => trim($matches[2]),
                'affiliation_status' => trim($matches[3]),
                'offerings' => trim($matches[4]),
            ];
        }

        return $values;
    }

    private function academicUnitId(array $row): string
    {
        $canonicalName = CatalogueAcademicUnitResolver::canonicalNameFromOverview($row['overview'] ?? null);
        if ($canonicalName === null) {
            throw new RuntimeException("Unable to detect the academic unit for supplied programme {$row['id']}.");
        }

        $this->academicUnitIds ??= Faculty::query()->where('is_active', true)->pluck('id', 'name')->all();
        $unitId = $this->academicUnitIds[$canonicalName] ?? null;
        if ($unitId === null) {
            throw new RuntimeException(
                "Academic unit '{$canonicalName}' is missing. Run the organisation seeder before importing the catalogue."
            );
        }

        return $unitId;
    }

    private function queuePublication(string $eventType, string $id, int $version, array $payload): void
    {
        DB::table('integration_outbox')->insertOrIgnore([
            'id' => (string) Str::uuid(),
            'event_type' => $eventType,
            'aggregate_id' => $id,
            'aggregate_version' => $version,
            'payload' => json_encode($payload, JSON_THROW_ON_ERROR),
            'attempts' => 0,
            'available_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function nullableText(mixed $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}
