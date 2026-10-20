<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Department;
use App\Models\Faculty;
use App\Models\Programme;
use App\Models\User;
use App\Models\UserAssignment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProgrammeGovernanceApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_complete_governance_flow_preserves_history_versions_and_one_ai_event(): void
    {
        [$admin, $coordinator, $hod, $dean, $faculty, $department] = $this->actors();
        $draft = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/programmes', $this->profile($faculty->id, $department->id, 'draft'))
            ->assertCreated()->assertJsonPath('data.version', 1);
        $programme = Programme::findOrFail($draft->json('data.id'));
        $programme->update(['coordinator_id' => $coordinator->id]);
        UserAssignment::create([
            'user_id' => $coordinator->id, 'role' => $coordinator->role, 'faculty_id' => $faculty->id,
            'department_id' => $department->id, 'programme_id' => $programme->id,
            'starts_on' => now()->subDay(), 'ends_on' => now()->addYear(), 'is_active' => true,
        ]);

        $this->actingAs($coordinator, 'sanctum')->putJson("/api/v1/programmes/{$programme->id}", $this->profile($faculty->id, $department->id, 'submit') + ['expected_version' => 1])
            ->assertOk()->assertJsonPath('data.status', 'submitted')->assertJsonPath('data.version', 2);
        $this->actingAs($hod, 'sanctum')->postJson("/api/v1/programmes/{$programme->id}/action", [
            'action' => 'forward', 'expected_version' => 2, 'expected_status' => 'submitted',
        ])->assertOk()->assertJsonPath('data.status', 'hod-reviewed');
        $this->actingAs($hod, 'sanctum')->postJson("/api/v1/programmes/{$programme->id}/action", [
            'action' => 'forward', 'expected_version' => 2, 'expected_status' => 'submitted',
        ])->assertStatus(409);

        $this->actingAs($dean, 'sanctum')->postJson("/api/v1/programmes/{$programme->id}/action", [
            'action' => 'reject', 'expected_version' => 2, 'expected_status' => 'hod-reviewed',
        ])->assertUnprocessable()->assertJsonValidationErrors('comment');
        $this->actingAs($dean, 'sanctum')->postJson("/api/v1/programmes/{$programme->id}/action", [
            'action' => 'reject', 'comment' => 'Clarify the graduate career outcomes.', 'expected_version' => 2, 'expected_status' => 'hod-reviewed',
        ])->assertOk()->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.rejection_comment', 'Clarify the graduate career outcomes.');

        $this->actingAs($coordinator, 'sanctum')->putJson("/api/v1/programmes/{$programme->id}", $this->profile($faculty->id, $department->id, 'submit', 'Revised careers') + ['expected_version' => 2])
            ->assertOk()->assertJsonPath('data.status', 'submitted')->assertJsonPath('data.version', 3)->assertJsonPath('data.rejection_comment', null);
        $this->actingAs($hod, 'sanctum')->postJson("/api/v1/programmes/{$programme->id}/action", [
            'action' => 'forward', 'expected_version' => 3, 'expected_status' => 'submitted',
        ])->assertOk();
        $published = $this->actingAs($dean, 'sanctum')->postJson("/api/v1/programmes/{$programme->id}/action", [
            'action' => 'publish', 'expected_version' => 3, 'expected_status' => 'hod-reviewed',
        ])->assertOk()->assertJsonPath('data.status', 'published')->assertJsonPath('data.version', 3);

        $published->assertJsonPath('data.reviews.0.action', 'draft');
        $this->assertGreaterThanOrEqual(7, count($published->json('data.reviews')));
        $this->assertDatabaseCount('programme_versions', 3);
        $this->assertDatabaseHas('programme_versions', ['programme_id' => $programme->id, 'version' => 1]);
        $this->assertDatabaseHas('programme_versions', ['programme_id' => $programme->id, 'version' => 2]);
        $this->assertDatabaseHas('programme_versions', ['programme_id' => $programme->id, 'version' => 3]);
        $this->assertDatabaseCount('integration_outbox', 1);
        $this->assertDatabaseHas('integration_outbox', ['event_type' => 'programme.published', 'aggregate_id' => $programme->id, 'aggregate_version' => 3]);
        $this->assertDatabaseHas('audit_events', ['action' => 'programme.publish', 'target_id' => $programme->id]);

        $this->actingAs($coordinator, 'sanctum')->putJson("/api/v1/programmes/{$programme->id}", $this->profile($faculty->id, $department->id, 'submit', 'Approved revision careers') + ['expected_version' => 3])
            ->assertOk()->assertJsonPath('data.status', 'submitted')->assertJsonPath('data.version', 4)
            ->assertJsonPath('data.live_version', 3);
        $this->getJson("/api/v1/catalogue/programmes/{$programme->id}")
            ->assertOk()->assertJsonPath('data.career_prospects', 'Revised careers');
        $this->actingAs($hod, 'sanctum')->postJson("/api/v1/programmes/{$programme->id}/action", [
            'action' => 'forward', 'expected_version' => 4, 'expected_status' => 'submitted',
        ])->assertOk();
        $this->actingAs($dean, 'sanctum')->postJson("/api/v1/programmes/{$programme->id}/action", [
            'action' => 'publish', 'expected_version' => 4, 'expected_status' => 'hod-reviewed',
        ])->assertOk();
        $this->getJson("/api/v1/catalogue/programmes/{$programme->id}")
            ->assertOk()->assertJsonPath('data.career_prospects', 'Approved revision careers');
        $this->assertDatabaseCount('programme_versions', 4);
        $this->assertDatabaseCount('integration_outbox', 2);
        $this->assertDatabaseHas('integration_outbox', ['event_type' => 'programme.published', 'aggregate_id' => $programme->id, 'aggregate_version' => 4]);
    }

    public function test_review_actions_are_rejected_outside_their_role_and_workflow_stage(): void
    {
        [$admin, $coordinator, $hod, $dean, $faculty, $department] = $this->actors();
        $programmeId = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/programmes', $this->profile($faculty->id, $department->id, 'draft'))
            ->assertCreated()->json('data.id');
        Programme::whereKey($programmeId)->update(['coordinator_id' => $coordinator->id]);
        UserAssignment::create([
            'user_id' => $coordinator->id, 'role' => $coordinator->role,
            'faculty_id' => $faculty->id, 'department_id' => $department->id,
            'programme_id' => $programmeId, 'is_active' => true,
        ]);

        foreach ([
            [$hod, 'reject'],
            [$dean, 'recommend'],
            [$admin, 'forward'],
        ] as [$actor, $action]) {
            $this->actingAs($actor, 'sanctum')->postJson("/api/v1/programmes/{$programmeId}/action", [
                'action' => $action, 'comment' => 'Not available here.',
                'expected_version' => 1, 'expected_status' => 'draft',
            ])->assertForbidden();
        }

        $this->actingAs($coordinator, 'sanctum')->putJson("/api/v1/programmes/{$programmeId}", $this->profile($faculty->id, $department->id, 'submit') + ['expected_version' => 1])
            ->assertOk()->assertJsonPath('data.status', 'submitted');
        $this->actingAs($dean, 'sanctum')->postJson("/api/v1/programmes/{$programmeId}/action", [
            'action' => 'reject', 'comment' => 'Wrong review stage.',
            'expected_version' => 2, 'expected_status' => 'submitted',
        ])->assertForbidden();
        $this->actingAs($hod, 'sanctum')->postJson("/api/v1/programmes/{$programmeId}/action", [
            'action' => 'reject', 'comment' => 'Correct the overview.',
            'expected_version' => 2, 'expected_status' => 'submitted',
        ])->assertOk()->assertJsonPath('data.status', 'rejected');
    }

    public function test_direct_submit_action_cannot_bypass_profile_completeness_rules(): void
    {
        [$admin, $coordinator, , , $faculty, $department] = $this->actors();
        $profile = $this->profile($faculty->id, $department->id, 'draft');
        $profile['overview'] = '';
        $programmeId = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/programmes', $profile)
            ->assertCreated()->json('data.id');
        Programme::whereKey($programmeId)->update(['coordinator_id' => $coordinator->id]);
        UserAssignment::create([
            'user_id' => $coordinator->id, 'role' => $coordinator->role,
            'faculty_id' => $faculty->id, 'department_id' => $department->id,
            'programme_id' => $programmeId, 'is_active' => true,
        ]);

        $this->actingAs($coordinator, 'sanctum')->postJson("/api/v1/programmes/{$programmeId}/action", [
            'action' => 'submit', 'expected_version' => 1, 'expected_status' => 'draft',
        ])->assertUnprocessable()->assertJsonValidationErrors('overview');

        $this->assertDatabaseHas('programmes', ['id' => $programmeId, 'status' => 'draft']);
    }

    public function test_dean_recommendation_requires_a_note_and_remains_advisory(): void
    {
        [$admin, $coordinator, $hod, $dean, $faculty, $department] = $this->actors();
        $programmeId = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/programmes', $this->profile($faculty->id, $department->id, 'draft'))
            ->assertCreated()->json('data.id');
        Programme::whereKey($programmeId)->update(['coordinator_id' => $coordinator->id]);
        UserAssignment::create([
            'user_id' => $coordinator->id, 'role' => $coordinator->role,
            'faculty_id' => $faculty->id, 'department_id' => $department->id,
            'programme_id' => $programmeId, 'is_active' => true,
        ]);
        $this->actingAs($coordinator, 'sanctum')->putJson("/api/v1/programmes/{$programmeId}", $this->profile($faculty->id, $department->id, 'submit') + ['expected_version' => 1])->assertOk();
        $this->actingAs($hod, 'sanctum')->postJson("/api/v1/programmes/{$programmeId}/action", [
            'action' => 'forward', 'expected_version' => 2, 'expected_status' => 'submitted',
        ])->assertOk();

        $this->actingAs($dean, 'sanctum')->postJson("/api/v1/programmes/{$programmeId}/action", [
            'action' => 'recommend', 'expected_version' => 2, 'expected_status' => 'hod-reviewed',
        ])->assertUnprocessable()->assertJsonValidationErrors('comment');
        $response = $this->actingAs($dean, 'sanctum')->postJson("/api/v1/programmes/{$programmeId}/action", [
            'action' => 'recommend', 'comment' => 'Confirm the professional accreditation wording.',
            'expected_version' => 2, 'expected_status' => 'hod-reviewed',
        ])->assertOk()->assertJsonPath('data.status', 'hod-reviewed')->assertJsonPath('data.version', 2);

        $this->assertTrue(collect($response->json('data.reviews'))->contains(fn (array $review): bool =>
            $review['action'] === 'recommend' && $review['comment'] === 'Confirm the professional accreditation wording.'
        ));
        $this->assertDatabaseCount('integration_outbox', 0);
    }

    public function test_stale_editor_cannot_overwrite_a_newer_programme_version(): void
    {
        [$admin, , , , $faculty, $department] = $this->actors();
        $programmeId = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/programmes', $this->profile($faculty->id, $department->id, 'draft'))
            ->assertCreated()->json('data.id');

        $this->actingAs($admin, 'sanctum')->putJson("/api/v1/programmes/{$programmeId}", $this->profile($faculty->id, $department->id, 'draft', 'First editor') + ['expected_version' => 1])
            ->assertOk()->assertJsonPath('data.version', 2);
        $this->actingAs($admin, 'sanctum')->putJson("/api/v1/programmes/{$programmeId}", $this->profile($faculty->id, $department->id, 'draft', 'Stale editor') + ['expected_version' => 1])
            ->assertStatus(409)->assertJsonPath('message', 'This programme was changed by another user. Close the editor, review the latest version and try again.');

        $this->assertSame('First editor', Programme::findOrFail($programmeId)->career_prospects);
        $this->assertDatabaseCount('programme_versions', 2);
    }

    public function test_coordinator_cannot_create_a_canonical_programme_or_move_an_assignment_between_units(): void
    {
        [$admin, $coordinator, , , $faculty, $department] = $this->actors();
        $otherFaculty = Faculty::create(['code' => 'ART', 'name' => 'Faculty of Arts', 'is_active' => true]);
        $otherDepartment = Department::create(['faculty_id' => $otherFaculty->id, 'code' => 'LIT', 'name' => 'Literature', 'is_active' => true]);

        $programmeId = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/programmes', $this->profile($faculty->id, $department->id, 'draft'))
            ->assertCreated()->json('data.id');
        Programme::whereKey($programmeId)->update(['coordinator_id' => $coordinator->id]);
        UserAssignment::create([
            'user_id' => $coordinator->id, 'role' => $coordinator->role,
            'faculty_id' => $faculty->id, 'department_id' => $department->id,
            'programme_id' => $programmeId, 'starts_on' => now()->subDay(),
            'ends_on' => now()->addYear(), 'is_active' => true,
        ]);

        $this->actingAs($coordinator, 'sanctum')
            ->postJson('/api/v1/programmes', $this->profile($faculty->id, $department->id, 'draft'))
            ->assertForbidden();

        $this->actingAs($coordinator, 'sanctum')
            ->putJson("/api/v1/programmes/{$programmeId}", $this->profile($otherFaculty->id, $otherDepartment->id, 'draft') + ['expected_version' => 1])
            ->assertUnprocessable()->assertJsonValidationErrors('faculty_id');

        $programme = Programme::findOrFail($programmeId);
        $this->assertSame($faculty->id, $programme->faculty_id);
        $this->assertSame($department->id, $programme->department_id);
    }

    public function test_programme_editor_options_are_limited_to_the_coordinators_assigned_unit(): void
    {
        [$admin, $coordinator, , , $faculty, $department] = $this->actors();
        $otherFaculty = Faculty::create(['code' => 'BUS', 'name' => 'Business School', 'is_active' => true]);
        Department::create(['faculty_id' => $otherFaculty->id, 'code' => 'MGT', 'name' => 'Management', 'is_active' => true]);
        $programmeId = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/programmes', $this->profile($faculty->id, $department->id, 'draft'))
            ->assertCreated()->json('data.id');
        UserAssignment::create([
            'user_id' => $coordinator->id, 'role' => $coordinator->role,
            'programme_id' => $programmeId, 'starts_on' => now()->subDay(),
            'ends_on' => now()->addYear(), 'is_active' => true,
        ]);

        $response = $this->actingAs($coordinator, 'sanctum')->getJson('/api/v1/programmes/options')->assertOk();
        $response->assertJsonCount(1, 'data.faculties')->assertJsonPath('data.faculties.0.id', $faculty->id);
    }

    public function test_published_programme_can_be_governably_unpublished(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $programme = Programme::create([
            'code' => 'UNP', 'name' => 'Unpublish Test', 'category' => 'Undergraduate',
            'status' => 'published', 'version' => 1, 'published_at' => now(),
            'published_snapshot' => ['name' => 'Unpublish Test', 'version' => 1],
        ]);

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/programmes/{$programme->id}/action", [
            'action' => 'unpublish',
            'comment' => 'Temporarily withdrawn for an approved content correction.',
            'expected_version' => 1,
            'expected_status' => 'published',
        ])->assertOk()->assertJsonPath('data.status', 'hod-reviewed');

        $programme->refresh();
        $this->assertNull($programme->published_snapshot);
        $this->assertNull($programme->published_at);
        $this->getJson("/api/v1/catalogue/programmes/{$programme->id}")->assertNotFound();
        $this->assertDatabaseHas('integration_outbox', ['event_type' => 'programme.unpublished', 'aggregate_id' => $programme->id]);
        $this->assertDatabaseHas('audit_events', ['action' => 'programme.unpublish', 'target_id' => $programme->id]);
    }

    private function actors(): array
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $coordinator = User::factory()->create(['role' => UserRole::COORDINATOR]);
        $hod = User::factory()->create(['role' => UserRole::HOD]);
        $dean = User::factory()->create(['role' => UserRole::DEAN]);
        $faculty = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science', 'is_active' => true]);
        $department = Department::create(['faculty_id' => $faculty->id, 'code' => 'CS', 'name' => 'Computer Science', 'is_active' => true]);
        UserAssignment::create(['user_id' => $hod->id, 'role' => $hod->role, 'faculty_id' => $faculty->id, 'department_id' => $department->id, 'is_active' => true]);
        UserAssignment::create(['user_id' => $dean->id, 'role' => $dean->role, 'faculty_id' => $faculty->id, 'is_active' => true]);

        return [$admin, $coordinator, $hod, $dean, $faculty, $department];
    }

    private function profile(string $facultyId, string $departmentId, string $intent, string $careers = 'Software engineering'): array
    {
        return [
            'name' => 'Bachelor of Information Technology', 'code' => 'BIT', 'category' => 'Undergraduate',
            'faculty_id' => $facultyId, 'department_id' => $departmentId, 'intent' => $intent,
            'overview' => 'Programme overview', 'objective_impact' => 'Programme impact',
            'philosophy_originality' => 'Programme philosophy', 'career_prospects' => $careers,
            'admission_requirements' => 'Admission requirements', 'structure_content' => 'Programme structure',
        ];
    }
}
