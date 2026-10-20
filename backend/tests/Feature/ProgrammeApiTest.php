<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Faculty;
use App\Models\Programme;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProgrammeApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_system_administrator_can_create_and_list_a_draft_programme(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);

        $created = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/programmes', [
            'name' => 'Bachelor of Test Engineering',
            'code' => 'bte',
            'category' => 'Undergraduate',
            'intent' => 'draft',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'BTE')
            ->assertJsonPath('data.status', 'draft');

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/programmes?per_page=10&search=BTE')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $created->json('data.id'))
            ->assertJsonPath('meta.total', 1);

        $this->assertDatabaseHas('programme_versions', ['programme_id' => $created->json('data.id'), 'version' => 1]);
        $this->assertDatabaseHas('audit_events', ['action' => 'programme.created']);
    }

    public function test_publishing_creates_a_version_and_catalogue_outbox_event(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $faculty = Faculty::create(['code' => 'FTE', 'name' => 'Faculty of Test Engineering']);
        $programme = Programme::create([
            'code' => 'BTE', 'name' => 'Bachelor of Test Engineering', 'category' => 'Undergraduate',
            'faculty_id' => $faculty->id, 'status' => 'draft', 'version' => 1, 'created_by' => $admin->id,
        ]);

        $this->actingAs($admin, 'sanctum')->putJson("/api/v1/programmes/{$programme->id}", [
            'name' => $programme->name,
            'code' => $programme->code,
            'category' => $programme->category,
            'faculty_id' => $faculty->id,
            'overview' => 'Overview',
            'objective_impact' => 'Impact',
            'philosophy_originality' => 'Philosophy',
            'career_prospects' => 'Careers',
            'admission_requirements' => 'Requirements',
            'structure_content' => 'Structure',
            'intent' => 'publish',
            'expected_version' => 1,
        ])->assertOk()
            ->assertJsonPath('data.status', 'published')
            ->assertJsonPath('data.version', 2);

        $this->assertDatabaseHas('programme_versions', ['programme_id' => $programme->id, 'version' => 2]);
        $this->assertDatabaseHas('integration_outbox', ['event_type' => 'programme.published', 'aggregate_id' => $programme->id, 'aggregate_version' => 2]);
    }

    public function test_only_safe_programme_deletion_is_allowed(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);
        $published = Programme::create(['code' => 'PUB', 'name' => 'Published', 'category' => 'Diploma', 'status' => 'published']);
        $draft = Programme::create(['code' => 'DRF', 'name' => 'Draft', 'category' => 'Diploma', 'status' => 'draft']);

        $this->actingAs($admin, 'sanctum')->deleteJson("/api/v1/programmes/{$published->id}", [
            'current_password' => 'Admin-Password-2026!',
        ])->assertUnprocessable();

        $this->actingAs($admin, 'sanctum')->deleteJson("/api/v1/programmes/{$draft->id}", [
            'current_password' => 'Admin-Password-2026!',
        ])->assertNoContent();

        $this->assertDatabaseMissing('programmes', ['id' => $draft->id]);
        $this->assertDatabaseHas('programmes', ['id' => $published->id]);
    }

    public function test_dashboard_uses_database_values(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        Programme::create(['code' => 'LIVE', 'name' => 'Live Programme', 'category' => 'Diploma', 'status' => 'published']);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/dashboard')
            ->assertOk()
            ->assertJsonPath('data.counts.accounts', 1)
            ->assertJsonPath('data.counts.programmes', 1)
            ->assertJsonPath('data.counts.published_programmes', 1)
            ->assertJsonCount(12, 'data.monthly_activity');
    }

    public function test_coordinator_can_load_programme_editor_options_without_admin_access(): void
    {
        $coordinator = User::factory()->create(['role' => UserRole::COORDINATOR]);

        $this->actingAs($coordinator, 'sanctum')->getJson('/api/v1/programmes/options')
            ->assertOk()
            ->assertJsonStructure(['data' => ['faculties', 'programmes', 'calls']]);

        $this->actingAs($coordinator, 'sanctum')->getJson('/api/v1/admin/users/options')->assertForbidden();
    }
}
