<?php

namespace Tests\Feature;

use App\Models\Faculty;
use App\Models\Programme;
use App\Support\CatalogueAcademicUnitResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NormalizeProgrammeAcademicUnitsTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_supplied_programme_provider_resolves_to_a_seeded_academic_unit(): void
    {
        $this->seed(\Database\Seeders\OrganisationSeeder::class);
        $rows = json_decode(
            file_get_contents(base_path('../support/chatwidget/programmes_export.json')),
            true,
            flags: JSON_THROW_ON_ERROR,
        );
        $unitNames = Faculty::pluck('name')->all();

        foreach ($rows as $row) {
            if (str_starts_with(strtolower((string) $row['id']), 'aff-')) {
                continue;
            }

            $canonicalName = CatalogueAcademicUnitResolver::canonicalNameFromOverview($row['overview'] ?? null);
            $this->assertNotNull($canonicalName, "No provider was detected for {$row['id']}.");
            $this->assertContains($canonicalName, $unitNames, "{$canonicalName} is not a seeded academic unit.");
        }
    }

    public function test_command_can_preview_and_then_assign_existing_imported_programmes(): void
    {
        $this->seed(\Database\Seeders\OrganisationSeeder::class);
        $programme = Programme::create([
            'source_ref' => 'ug-test',
            'code' => 'TEST',
            'name' => 'Learning Centre Test Programme',
            'category' => 'Undergraduate',
            'status' => 'published',
            'overview' => 'This programme is offered by the Soroti Learning Center (day programme).',
        ]);

        $this->artisan('pcs:normalize-programme-units', ['--dry-run' => true])
            ->expectsOutputToContain('1 programmes would be assigned')
            ->assertSuccessful();
        $this->assertNull($programme->fresh()->faculty_id);

        $this->artisan('pcs:normalize-programme-units')
            ->expectsOutputToContain('1 programmes assigned')
            ->assertSuccessful();

        $this->assertSame(
            Faculty::where('name', CatalogueAcademicUnitResolver::DISTANCE_EDUCATION_UNIT)->value('id'),
            $programme->fresh()->faculty_id,
        );
    }
}
