<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\ApplicationCall;
use App\Models\Department;
use App\Models\Faculty;
use App\Models\Programme;
use App\Models\User;
use App\Models\UserAssignment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApplicationCallApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_registrar_can_create_and_publish_a_call_for_a_published_programme(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $programme = Programme::create(['code' => 'BTE', 'name' => 'Bachelor of Test Engineering', 'category' => 'Undergraduate', 'status' => 'published']);

        $created = $this->actingAs($registrar, 'sanctum')->postJson('/api/v1/application-calls', [
            'programme_id' => $programme->id,
            'intake' => '2026/2027 Main Intake',
            'opening_date' => '2026-09-01',
            'deadline' => '2026-12-01',
            'requirements' => 'Two principal passes.',
            'publish' => false,
        ])->assertCreated()->assertJsonPath('data.status', 'draft');

        $this->actingAs($registrar, 'sanctum')->postJson('/api/v1/application-calls/'.$created->json('data.id').'/publish')
            ->assertOk()->assertJsonPath('data.status', 'open');

        $this->assertDatabaseHas('audit_events', ['action' => 'application_call.published']);
    }

    public function test_a_call_cannot_be_created_for_an_unpublished_programme(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $programme = Programme::create(['code' => 'DRF', 'name' => 'Draft Programme', 'category' => 'Diploma', 'status' => 'draft']);

        $this->actingAs($registrar, 'sanctum')->postJson('/api/v1/application-calls', [
            'programme_id' => $programme->id,
            'intake' => 'Draft Intake',
            'opening_date' => '2026-09-01',
            'deadline' => '2026-12-01',
            'publish' => true,
        ])->assertUnprocessable();
    }

    public function test_officer_sees_only_delegated_calls_and_close_permission_is_enforced(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $officer = User::factory()->create(['role' => UserRole::ADMISSIONS_OFFICER]);
        $programme = Programme::create(['code' => 'BTE', 'name' => 'Bachelor of Test Engineering', 'category' => 'Undergraduate', 'status' => 'published']);
        $assigned = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Assigned', 'opening_date' => '2026-09-01', 'deadline' => '2026-12-01', 'status' => 'open']);
        ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Hidden', 'opening_date' => '2026-09-01', 'deadline' => '2026-12-02', 'status' => 'open']);
        UserAssignment::create([
            'user_id' => $officer->id, 'role' => UserRole::ADMISSIONS_OFFICER,
            'application_call_id' => $assigned->id, 'permissions' => ['create' => false, 'monitor' => true, 'close' => false],
            'is_active' => true, 'assigned_by' => $registrar->id,
        ]);

        $this->actingAs($officer, 'sanctum')->getJson('/api/v1/application-calls')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.intake', 'Assigned');

        $this->actingAs($officer, 'sanctum')->getJson('/api/v1/application-calls?search=Assigned')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $assigned->id);
        $this->actingAs($officer, 'sanctum')->getJson('/api/v1/application-calls?search=Hidden')
            ->assertOk()->assertJsonPath('meta.total', 0);

        $this->actingAs($officer, 'sanctum')->postJson("/api/v1/application-calls/{$assigned->id}/close", ['reason' => 'Capacity reached.'])
            ->assertForbidden();

        $this->actingAs($registrar, 'sanctum')->putJson("/api/v1/application-calls/{$assigned->id}/delegate", [
            'officer_id' => $officer->id,
            'permissions' => ['create' => false, 'monitor' => true, 'close' => true],
        ])->assertOk();

        $this->actingAs($officer, 'sanctum')->postJson("/api/v1/application-calls/{$assigned->id}/close", ['reason' => 'Capacity reached.'])
            ->assertOk()->assertJsonPath('data.status', 'closed');
    }

    public function test_calls_can_be_filtered_by_their_effective_status(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $programme = Programme::create(['code' => 'FLT', 'name' => 'Filter Test', 'category' => 'Undergraduate', 'status' => 'published']);
        $scheduled = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Scheduled Intake', 'opening_date' => today()->addDays(2), 'deadline' => today()->addMonth(), 'status' => 'open']);
        $closing = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Closing Intake', 'opening_date' => today()->subDay(), 'deadline' => today()->addDays(2), 'status' => 'open']);
        $open = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Open Intake', 'opening_date' => today()->subDay(), 'deadline' => today()->addMonth(), 'status' => 'open']);
        $draft = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Draft Intake', 'opening_date' => today()->addDay(), 'deadline' => today()->addMonth(), 'status' => 'draft']);

        foreach (['scheduled' => $scheduled, 'closing-soon' => $closing, 'open' => $open, 'draft' => $draft] as $status => $expected) {
            $this->actingAs($registrar, 'sanctum')->getJson("/api/v1/application-calls?status={$status}")
                ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $expected->id);
        }
    }

    public function test_registrar_can_edit_draft_and_scheduled_calls_but_not_an_open_call(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $programme = Programme::create(['code' => 'EDT', 'name' => 'Editable Call Test', 'category' => 'Undergraduate', 'status' => 'published']);
        $draft = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Draft Intake', 'opening_date' => today()->addDays(3), 'deadline' => today()->addMonth(), 'status' => 'draft']);
        $scheduled = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Scheduled Intake', 'opening_date' => today()->addDays(4), 'deadline' => today()->addMonths(2), 'status' => 'open']);
        $open = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Active Intake', 'opening_date' => today()->subDay(), 'deadline' => today()->addMonths(3), 'status' => 'open']);

        $payload = [
            'programme_id' => $programme->id,
            'intake' => 'Revised Draft Intake',
            'opening_date' => today()->addDays(5)->toDateString(),
            'deadline' => today()->addMonths(4)->toDateString(),
            'requirements' => 'Revised requirements.',
        ];
        $this->actingAs($registrar, 'sanctum')->putJson("/api/v1/application-calls/{$draft->id}", $payload)
            ->assertOk()->assertJsonPath('data.intake', 'Revised Draft Intake');

        $payload['intake'] = 'Revised Scheduled Intake';
        $this->actingAs($registrar, 'sanctum')->putJson("/api/v1/application-calls/{$scheduled->id}", $payload)
            ->assertOk()->assertJsonPath('data.can_edit', true);

        $payload['intake'] = 'Changed Active Intake';
        $this->actingAs($registrar, 'sanctum')->putJson("/api/v1/application-calls/{$open->id}", $payload)
            ->assertUnprocessable();
        $this->assertDatabaseHas('audit_events', ['action' => 'application_call.updated', 'target_id' => $draft->id]);
    }

    public function test_call_update_rejects_a_duplicate_programme_intake(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $programme = Programme::create(['code' => 'DUP', 'name' => 'Duplicate Call Test', 'category' => 'Undergraduate', 'status' => 'published']);
        ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Existing Intake', 'opening_date' => today()->addDays(2), 'deadline' => today()->addMonth(), 'status' => 'draft']);
        $editable = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Other Intake', 'opening_date' => today()->addDays(3), 'deadline' => today()->addMonths(2), 'status' => 'draft']);

        $this->actingAs($registrar, 'sanctum')->putJson("/api/v1/application-calls/{$editable->id}", [
            'programme_id' => $programme->id,
            'intake' => 'Existing Intake',
            'opening_date' => today()->addDays(3)->toDateString(),
            'deadline' => today()->addMonths(2)->toDateString(),
        ])->assertUnprocessable()->assertJsonValidationErrors('intake');
    }

    public function test_published_call_can_retain_today_as_its_opening_date(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $programme = Programme::create(['code' => 'TDY', 'name' => 'Today Call Test', 'category' => 'Undergraduate', 'status' => 'published']);
        $call = ApplicationCall::create([
            'programme_id' => $programme->id, 'intake' => 'Today Intake',
            'opening_date' => today(), 'deadline' => today()->addMonth(), 'status' => 'open',
        ]);

        $this->actingAs($registrar, 'sanctum')->putJson("/api/v1/application-calls/{$call->id}", [
            'programme_id' => $programme->id,
            'intake' => 'Today Intake Updated',
            'opening_date' => today()->toDateString(),
            'deadline' => today()->addMonths(2)->toDateString(),
        ])->assertOk()->assertJsonPath('data.opening_date', today()->toDateString());
    }

    public function test_application_calls_are_listed_with_currently_open_calls_first(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $programme = Programme::create(['code' => 'ORD', 'name' => 'Ordering Test', 'category' => 'Undergraduate', 'status' => 'published']);
        $closed = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Closed', 'opening_date' => today()->subMonth(), 'deadline' => today()->subDay(), 'status' => 'closed']);
        $draft = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Draft', 'opening_date' => today()->addDays(2), 'deadline' => today()->addMonth(), 'status' => 'draft']);
        $scheduled = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Scheduled', 'opening_date' => today()->addDay(), 'deadline' => today()->addMonth(), 'status' => 'open']);
        $current = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Open', 'opening_date' => today(), 'deadline' => today()->addMonth(), 'status' => 'open']);

        $response = $this->actingAs($registrar, 'sanctum')->getJson('/api/v1/application-calls?per_page=10')->assertOk();
        $this->assertSame([$current->id, $scheduled->id, $draft->id, $closed->id], collect($response->json('data'))->pluck('id')->all());
    }

    public function test_expired_calls_cannot_be_published(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $programme = Programme::create(['code' => 'EXP', 'name' => 'Expired Call Test', 'category' => 'Undergraduate', 'status' => 'published']);
        $draft = ApplicationCall::create([
            'programme_id' => $programme->id, 'intake' => 'Expired Draft',
            'opening_date' => today()->subMonth(), 'deadline' => today()->subDay(), 'status' => 'draft',
        ]);

        $this->actingAs($registrar, 'sanctum')->postJson("/api/v1/application-calls/{$draft->id}/publish")
            ->assertUnprocessable()->assertJsonValidationErrors('deadline');
        $this->actingAs($registrar, 'sanctum')->postJson('/api/v1/application-calls', [
            'programme_id' => $programme->id, 'intake' => 'Expired Immediate Call',
            'opening_date' => today()->subMonth()->toDateString(),
            'deadline' => today()->subDay()->toDateString(), 'publish' => true,
        ])->assertUnprocessable()->assertJsonValidationErrors('deadline');

        $this->assertDatabaseHas('application_calls', ['id' => $draft->id, 'status' => 'draft']);
    }

    public function test_delegation_requires_an_active_officer_and_records_canonical_scope(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $activeOfficer = User::factory()->create(['role' => UserRole::ADMISSIONS_OFFICER, 'status' => UserStatus::ACTIVE]);
        $suspendedOfficer = User::factory()->create(['role' => UserRole::ADMISSIONS_OFFICER, 'status' => UserStatus::SUSPENDED]);
        $faculty = Faculty::create(['code' => 'BUS', 'name' => 'Business School', 'is_active' => true]);
        $department = Department::create(['faculty_id' => $faculty->id, 'code' => 'MGT', 'name' => 'Management', 'is_active' => true]);
        $programme = Programme::create([
            'code' => 'BBA', 'name' => 'Bachelor of Business Administration', 'category' => 'Undergraduate',
            'faculty_id' => $faculty->id, 'department_id' => $department->id, 'status' => 'published',
        ]);
        $call = ApplicationCall::create([
            'programme_id' => $programme->id, 'intake' => 'Delegation Test',
            'opening_date' => today(), 'deadline' => today()->addMonth(), 'status' => 'open',
        ]);
        $permissions = ['create' => true, 'monitor' => true, 'close' => false];

        $this->actingAs($registrar, 'sanctum')->putJson("/api/v1/application-calls/{$call->id}/delegate", [
            'officer_id' => $suspendedOfficer->id, 'permissions' => $permissions,
        ])->assertUnprocessable()->assertJsonValidationErrors('officer_id');
        $this->actingAs($registrar, 'sanctum')->putJson("/api/v1/application-calls/{$call->id}/delegate", [
            'officer_id' => $activeOfficer->id,
            'permissions' => ['create' => false, 'monitor' => false, 'close' => false],
        ])->assertUnprocessable()->assertJsonValidationErrors('permissions');
        $this->actingAs($registrar, 'sanctum')->putJson("/api/v1/application-calls/{$call->id}/delegate", [
            'officer_id' => $activeOfficer->id, 'permissions' => $permissions,
        ])->assertOk();

        $this->assertDatabaseHas('user_assignments', [
            'user_id' => $activeOfficer->id, 'application_call_id' => $call->id,
            'programme_id' => $programme->id, 'faculty_id' => $faculty->id, 'department_id' => $department->id,
        ]);
    }

    public function test_officer_create_permission_is_limited_to_the_delegated_programme(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $officer = User::factory()->create(['role' => UserRole::ADMISSIONS_OFFICER]);
        $allowed = Programme::create(['code' => 'ALW', 'name' => 'Allowed Programme', 'category' => 'Undergraduate', 'status' => 'published']);
        $other = Programme::create(['code' => 'OTH', 'name' => 'Other Programme', 'category' => 'Undergraduate', 'status' => 'published']);
        $delegatedCall = ApplicationCall::create([
            'programme_id' => $allowed->id, 'intake' => 'Existing Intake',
            'opening_date' => today(), 'deadline' => today()->addMonth(), 'status' => 'open',
        ]);
        UserAssignment::create([
            'user_id' => $officer->id, 'role' => UserRole::ADMISSIONS_OFFICER,
            'programme_id' => $allowed->id, 'application_call_id' => $delegatedCall->id,
            'permissions' => ['create' => true, 'monitor' => true, 'close' => false], 'is_active' => true,
            'assigned_by' => $registrar->id,
        ]);

        $this->actingAs($officer, 'sanctum')->getJson('/api/v1/application-calls/options')
            ->assertOk()->assertJsonCount(1, 'data.programmes')->assertJsonPath('data.programmes.0.id', $allowed->id);
        $this->actingAs($officer, 'sanctum')->postJson('/api/v1/application-calls', [
            'programme_id' => $other->id, 'intake' => 'Unauthorized Intake',
            'opening_date' => today()->addDay()->toDateString(), 'deadline' => today()->addMonth()->toDateString(),
            'publish' => false,
        ])->assertForbidden();
        $this->actingAs($officer, 'sanctum')->postJson('/api/v1/application-calls', [
            'programme_id' => $allowed->id, 'intake' => 'Authorized Intake',
            'opening_date' => today()->addDay()->toDateString(), 'deadline' => today()->addMonth()->toDateString(),
            'publish' => false,
        ])->assertCreated();
    }

    public function test_dashboard_and_public_catalogue_use_the_same_effective_call_state(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $programme = Programme::create(['code' => 'SYN', 'name' => 'Synchronized Call Test', 'category' => 'Undergraduate', 'status' => 'published']);
        $scheduled = ApplicationCall::create([
            'programme_id' => $programme->id, 'intake' => 'Future Intake',
            'opening_date' => today()->addDays(10), 'deadline' => today()->addMonth(), 'status' => 'open',
        ]);
        $current = ApplicationCall::create([
            'programme_id' => $programme->id, 'intake' => 'Current Intake',
            'opening_date' => today()->subDay(), 'deadline' => today()->addDays(2), 'status' => 'open',
        ]);

        $dashboard = $this->actingAs($registrar, 'sanctum')->getJson('/api/v1/dashboard')
            ->assertOk()->assertJsonPath('data.counts.open_calls', 1)->assertJsonPath('data.counts.closing_soon_calls', 1);
        $this->assertTrue(collect($dashboard->json('data.focus_calls'))->contains(fn (array $call): bool =>
            $call['id'] === $scheduled->id && $call['effective_status'] === 'scheduled'
        ));
        $this->assertTrue(collect($dashboard->json('data.focus_calls'))->contains(fn (array $call): bool =>
            $call['id'] === $current->id && $call['effective_status'] === 'closing-soon'
        ));

        $this->getJson("/api/v1/catalogue/programmes/{$programme->id}")
            ->assertOk()->assertJsonPath('data.application.id', $current->id)->assertJsonPath('data.application.status', 'closing-soon');
        $this->actingAs($registrar, 'sanctum')->postJson("/api/v1/application-calls/{$current->id}/close", [
            'reason' => 'The available application places have been filled.',
        ])->assertOk();
        $this->getJson("/api/v1/catalogue/programmes/{$programme->id}")
            ->assertOk()->assertJsonPath('data.application.id', $scheduled->id)->assertJsonPath('data.application.status', 'scheduled');
    }

    public function test_expired_calls_are_closed_by_the_scheduler_command_with_an_audit_event(): void
    {
        $programme = Programme::create(['code' => 'AUT', 'name' => 'Automatic Closure Test', 'category' => 'Undergraduate', 'status' => 'published']);
        $expired = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Expired Intake', 'opening_date' => today()->subMonth(), 'deadline' => today()->subDay(), 'status' => 'open']);
        $current = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Current Intake', 'opening_date' => today()->subDay(), 'deadline' => today()->addDay(), 'status' => 'open']);

        $this->artisan('pcs:close-expired-calls')->assertSuccessful();

        $this->assertDatabaseHas('application_calls', ['id' => $expired->id, 'status' => 'closed']);
        $this->assertDatabaseHas('application_calls', ['id' => $current->id, 'status' => 'open']);
        $this->assertDatabaseHas('audit_events', ['action' => 'application_call.auto_closed', 'target_id' => $expired->id]);
    }

    public function test_registrar_can_reopen_a_closed_call_with_a_new_valid_window(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $officer = User::factory()->create(['role' => UserRole::ADMISSIONS_OFFICER]);
        $programme = Programme::create(['code' => 'ROP', 'name' => 'Reopen Test', 'category' => 'Undergraduate', 'status' => 'published']);
        $call = ApplicationCall::create([
            'programme_id' => $programme->id, 'intake' => 'Reopen Intake',
            'opening_date' => today()->subMonth(), 'deadline' => today()->subDay(),
            'status' => 'closed', 'closed_reason' => 'Previous window ended.', 'closed_at' => now(),
        ]);
        $payload = [
            'opening_date' => today()->toDateString(),
            'deadline' => today()->addMonth()->toDateString(),
            'reason' => 'The University approved an additional application period.',
        ];

        $this->actingAs($officer, 'sanctum')->postJson("/api/v1/application-calls/{$call->id}/reopen", $payload)->assertForbidden();
        $this->actingAs($registrar, 'sanctum')->postJson("/api/v1/application-calls/{$call->id}/reopen", $payload)
            ->assertOk()->assertJsonPath('data.status', 'open')->assertJsonPath('data.closed_reason', null);

        $this->assertDatabaseHas('application_calls', ['id' => $call->id, 'status' => 'open', 'closed_reason' => null]);
        $this->assertDatabaseHas('audit_events', ['action' => 'application_call.reopened', 'target_id' => $call->id]);
    }
}
