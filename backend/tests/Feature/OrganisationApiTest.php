<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Department;
use App\Models\Faculty;
use App\Models\AffiliatedInstitution;
use App\Models\User;
use App\Models\UserAssignment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrganisationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_system_administrator_can_browse_published_affiliates_but_other_roles_cannot(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $dean = User::factory()->create(['role' => UserRole::DEAN]);
        AffiliatedInstitution::create(['source_ref' => 'aff-1', 'name' => 'Alpha Institute', 'location' => 'Kampala', 'is_published' => true]);
        AffiliatedInstitution::create(['source_ref' => 'aff-2', 'name' => 'Hidden Institute', 'location' => 'Jinja', 'is_published' => false]);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/affiliated-institutions?search=Kampala')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Alpha Institute')
            ->assertJsonPath('meta.total', 1);
        $this->actingAs($dean, 'sanctum')->getJson('/api/v1/admin/affiliated-institutions')->assertForbidden();
    }

    public function test_only_system_administrator_can_manage_organisation_units(): void
    {
        $dean = User::factory()->create(['role' => UserRole::DEAN]);

        $this->actingAs($dean, 'sanctum')->getJson('/api/v1/admin/organisation')->assertForbidden();
        $this->actingAs($dean, 'sanctum')->postJson('/api/v1/admin/organisation/faculties', [
            'code' => 'SCI', 'name' => 'Faculty of Science',
        ])->assertForbidden();
    }

    public function test_administrator_can_create_faculty_and_department_and_see_usage_counts(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);

        $facultyId = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/organisation/faculties', [
            'code' => 'sci', 'name' => 'Faculty of Science',
        ])->assertCreated()->assertJsonPath('data.code', 'SCI')->json('data.id');

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/organisation/departments', [
            'faculty_id' => $facultyId, 'code' => 'cs', 'name' => 'Computer Science',
        ])->assertCreated()->assertJsonPath('data.code', 'CS');

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/organisation')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonCount(1, 'data.0.departments')
            ->assertJsonPath('data.0.programmes_count', 0)->assertJsonPath('data.0.active_assignments_count', 0);
        $this->assertDatabaseHas('audit_events', ['action' => 'organisation.faculty_created']);
        $this->assertDatabaseHas('audit_events', ['action' => 'organisation.department_created']);
    }

    public function test_duplicate_unit_names_and_codes_are_rejected_case_insensitively(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science']);

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/organisation/faculties', [
            'code' => 'sci', 'name' => 'Different Name',
        ])->assertUnprocessable()->assertJsonValidationErrors('name');
    }

    public function test_deactivation_requires_password_and_rejects_units_with_active_staff(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);
        $hod = User::factory()->create(['role' => UserRole::HOD]);
        $faculty = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science']);
        $department = Department::create(['faculty_id' => $faculty->id, 'code' => 'CS', 'name' => 'Computer Science']);
        $assignment = UserAssignment::create([
            'user_id' => $hod->id, 'role' => UserRole::HOD, 'faculty_id' => $faculty->id,
            'department_id' => $department->id, 'is_active' => true,
        ]);

        $url = "/api/v1/admin/organisation/departments/{$department->id}";
        $payload = ['code' => 'CS', 'name' => 'Computer Science', 'is_active' => false];
        $this->actingAs($admin, 'sanctum')->patchJson($url, $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->actingAs($admin, 'sanctum')->patchJson($url, $payload + ['current_password' => 'Admin-Password-2026!'])
            ->assertUnprocessable()->assertJsonValidationErrors('department');

        $assignment->update(['is_active' => false]);
        $this->actingAs($admin, 'sanctum')->patchJson($url, $payload + ['current_password' => 'Admin-Password-2026!'])
            ->assertOk()->assertJsonPath('data.is_active', false);
        $this->assertDatabaseHas('audit_events', ['action' => 'organisation.department_updated']);
    }

    public function test_deactivating_a_faculty_also_removes_its_departments_from_active_use(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);
        $faculty = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science']);
        $department = Department::create(['faculty_id' => $faculty->id, 'code' => 'CS', 'name' => 'Computer Science']);

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/organisation/faculties/{$faculty->id}", [
            'code' => 'SCI', 'name' => 'Faculty of Science', 'is_active' => false,
            'current_password' => 'Admin-Password-2026!',
        ])->assertOk()->assertJsonPath('data.is_active', false);

        $this->assertFalse($department->fresh()->is_active);
    }

    public function test_staff_can_be_reactivated_while_an_unavailable_scope_is_safely_disabled(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);
        $faculty = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science']);
        $department = Department::create(['faculty_id' => $faculty->id, 'code' => 'CS', 'name' => 'Computer Science']);
        $hod = User::factory()->create(['role' => UserRole::HOD, 'created_by' => $admin->id]);
        UserAssignment::create([
            'user_id' => $hod->id, 'role' => UserRole::HOD,
            'faculty_id' => $faculty->id, 'department_id' => $department->id, 'is_active' => true,
        ]);

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/users/{$hod->id}/status", [
            'status' => UserStatus::INACTIVE->value,
        ])->assertOk();

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/organisation/faculties/{$faculty->id}", [
            'code' => 'SCI', 'name' => 'Faculty of Science', 'is_active' => false,
            'current_password' => 'Admin-Password-2026!',
        ])->assertOk();

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/users/{$hod->id}/status", [
            'status' => UserStatus::ACTIVE->value,
        ])->assertOk()->assertJsonPath('data.status', UserStatus::ACTIVE->value);

        $this->assertFalse($hod->assignments()->first()->is_active);
    }
}
