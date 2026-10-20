<?php

namespace Tests\Feature;

use App\Models\ApplicationCall;
use App\Models\Faculty;
use App\Models\Programme;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicCatalogueApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_catalogue_exposes_a_lightweight_revision_for_silent_refresh_checks(): void
    {
        Programme::create(['code' => 'REV', 'name' => 'Revision Test', 'category' => 'Undergraduate', 'status' => 'published']);

        $first = $this->getJson('/api/v1/catalogue/revision')->assertOk()->json('data.revision');

        $this->assertIsString($first);
        $this->assertSame(64, strlen($first));
        $this->getJson('/api/v1/catalogue/programmes')->assertOk()->assertJsonPath('meta.revision', $first);
    }

    public function test_public_catalogue_exposes_only_published_programmes_and_public_call_information(): void
    {
        $faculty = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science', 'is_active' => true]);
        $published = Programme::create([
            'code' => 'BSC', 'name' => 'Bachelor of Science', 'category' => 'Undergraduate',
            'faculty_id' => $faculty->id, 'status' => 'published', 'overview' => 'Verified overview.',
            'duration' => '3 Years', 'campus' => 'Main Campus', 'study_modes' => ['Day', 'Evening'],
            'is_featured' => true, 'display_priority' => 25,
        ]);
        Programme::create(['code' => 'DRF', 'name' => 'Hidden Draft', 'category' => 'Undergraduate', 'status' => 'draft']);
        ApplicationCall::create([
            'programme_id' => $published->id, 'intake' => '2026/2027 Main Intake',
            'opening_date' => today()->subDay(), 'deadline' => today()->addDays(20), 'status' => 'open',
        ]);

        $this->getJson('/api/v1/catalogue/programmes?search=science')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $published->id)
            ->assertJsonPath('data.0.duration', '3 Years')
            ->assertJsonPath('data.0.campus', 'Main Campus')
            ->assertJsonPath('data.0.study_modes.0', 'Day')
            ->assertJsonPath('data.0.is_featured', true)
            ->assertJsonPath('data.0.display_priority', 25)
            ->assertJsonPath('data.0.application.intake', '2026/2027 Main Intake')
            ->assertJsonPath('summary.published_programmes', 1)
            ->assertJsonPath('configuration.results_per_page', 12)
            ->assertJsonPath('configuration.show_bookmarks', true)
            ->assertJsonCount(1, 'filters.faculties');

        $this->getJson("/api/v1/catalogue/programmes/{$published->id}")
            ->assertOk()->assertJsonPath('data.overview', 'Verified overview.');
    }

    public function test_public_catalogue_orders_with_approved_featured_values_not_pending_draft_values(): void
    {
        $featured = Programme::create([
            'code' => 'FTD',
            'name' => 'Featured Programme',
            'category' => 'Undergraduate',
            'status' => 'published',
            'is_featured' => false,
            'display_priority' => 0,
            'published_snapshot' => [
                'code' => 'FTD',
                'name' => 'Featured Programme',
                'category' => 'Undergraduate',
                'is_featured' => true,
                'display_priority' => 50,
            ],
        ]);
        Programme::create([
            'code' => 'PND',
            'name' => 'Pending Programme',
            'category' => 'Undergraduate',
            'status' => 'under-review',
            'is_featured' => true,
            'display_priority' => 100,
            'published_snapshot' => [
                'code' => 'PND',
                'name' => 'Pending Programme',
                'category' => 'Undergraduate',
                'is_featured' => false,
                'display_priority' => 0,
            ],
        ]);

        $this->getJson('/api/v1/catalogue/programmes')
            ->assertOk()
            ->assertJsonPath('data.0.id', $featured->id)
            ->assertJsonPath('data.0.is_featured', true)
            ->assertJsonPath('data.1.is_featured', false);
    }

    public function test_public_catalogue_lists_programmes_with_currently_open_calls_first(): void
    {
        $withoutCall = Programme::create(['code' => 'AAA', 'name' => 'Alphabetically First', 'category' => 'Undergraduate', 'status' => 'published', 'is_featured' => true]);
        $scheduled = Programme::create(['code' => 'SCH', 'name' => 'Scheduled Programme', 'category' => 'Undergraduate', 'status' => 'published']);
        $open = Programme::create(['code' => 'OPN', 'name' => 'Open Programme', 'category' => 'Undergraduate', 'status' => 'published']);
        ApplicationCall::create(['programme_id' => $scheduled->id, 'intake' => 'Scheduled', 'opening_date' => today()->addDay(), 'deadline' => today()->addMonth(), 'status' => 'open']);
        ApplicationCall::create(['programme_id' => $open->id, 'intake' => 'Open', 'opening_date' => today(), 'deadline' => today()->addMonth(), 'status' => 'open']);

        $response = $this->getJson('/api/v1/catalogue/programmes')->assertOk();
        $this->assertSame([$open->id, $scheduled->id, $withoutCall->id], collect($response->json('data'))->pluck('id')->all());
    }

    public function test_unpublished_programme_cannot_be_opened_publicly(): void
    {
        $draft = Programme::create(['code' => 'DRF', 'name' => 'Hidden Draft', 'category' => 'Undergraduate', 'status' => 'draft']);

        $this->getJson("/api/v1/catalogue/programmes/{$draft->id}")->assertNotFound();
    }

    public function test_malformed_programme_identifier_is_rejected_as_not_found(): void
    {
        $this->getJson('/api/v1/catalogue/programmes/not-a-valid-programme-id')
            ->assertNotFound();
    }

    public function test_public_catalogue_can_filter_related_programmes_by_academic_unit(): void
    {
        $firstFaculty = Faculty::create(['code' => 'SBE', 'name' => 'School of Built Environment', 'is_active' => true]);
        $secondFaculty = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science', 'is_active' => true]);
        $architecture = Programme::create([
            'code' => 'ARD', 'name' => 'Bachelor of Architecture', 'category' => 'Undergraduate',
            'faculty_id' => $firstFaculty->id, 'status' => 'published',
        ]);
        $surveying = Programme::create([
            'code' => 'LSD', 'name' => 'Bachelor of Land Surveying', 'category' => 'Undergraduate',
            'faculty_id' => $firstFaculty->id, 'status' => 'published',
        ]);
        Programme::create([
            'code' => 'BSC', 'name' => 'Bachelor of Science', 'category' => 'Undergraduate',
            'faculty_id' => $secondFaculty->id, 'status' => 'published',
        ]);

        $this->getJson("/api/v1/catalogue/programmes?faculty_id={$firstFaculty->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.faculty_id', $firstFaculty->id)
            ->assertJsonPath('data.1.faculty_id', $firstFaculty->id)
            ->assertJsonFragment(['id' => $architecture->id])
            ->assertJsonFragment(['id' => $surveying->id]);
    }

    public function test_public_catalogue_combines_academic_unit_and_study_level_filters(): void
    {
        $builtEnvironment = Faculty::create(['code' => 'SBE', 'name' => 'School of Built Environment', 'is_active' => true]);
        $science = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science', 'is_active' => true]);
        $matching = Programme::create([
            'code' => 'MAR', 'name' => 'Master of Architecture', 'category' => 'Postgraduate',
            'faculty_id' => $builtEnvironment->id, 'status' => 'published',
        ]);
        Programme::create([
            'code' => 'ARD', 'name' => 'Bachelor of Architecture', 'category' => 'Undergraduate',
            'faculty_id' => $builtEnvironment->id, 'status' => 'published',
        ]);
        Programme::create([
            'code' => 'MSC', 'name' => 'Master of Science', 'category' => 'Postgraduate',
            'faculty_id' => $science->id, 'status' => 'published',
        ]);

        $this->getJson("/api/v1/catalogue/programmes?faculty_id={$builtEnvironment->id}&category=Postgraduate")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $matching->id)
            ->assertJsonPath('data.0.category', 'Postgraduate')
            ->assertJsonPath('data.0.faculty_id', $builtEnvironment->id);
    }

    public function test_public_catalogue_prefers_a_current_call_and_ignores_expired_calls(): void
    {
        $programme = Programme::create([
            'code' => 'CALL', 'name' => 'Call Selection Programme',
            'category' => 'Undergraduate', 'status' => 'published',
        ]);
        ApplicationCall::create([
            'programme_id' => $programme->id, 'intake' => 'Expired Intake',
            'opening_date' => today()->subMonths(2), 'deadline' => today()->subDay(), 'status' => 'open',
        ]);
        $current = ApplicationCall::create([
            'programme_id' => $programme->id, 'intake' => 'Current Intake',
            'opening_date' => today()->subDay(), 'deadline' => today()->addMonth(), 'status' => 'open',
        ]);
        ApplicationCall::create([
            'programme_id' => $programme->id, 'intake' => 'Future Intake',
            'opening_date' => today()->addMonth(), 'deadline' => today()->addMonths(2), 'status' => 'open',
        ]);

        $this->getJson("/api/v1/catalogue/programmes/{$programme->id}")
            ->assertOk()
            ->assertJsonPath('data.application.id', $current->id)
            ->assertJsonPath('data.application.status', 'open');
    }
}
