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

class UserAssignmentScopeTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_started_and_unexpired_assignments_are_effective(): void
    {
        $user = User::factory()->create(['role' => UserRole::COORDINATOR]);
        $expired = UserAssignment::create(['user_id' => $user->id, 'role' => $user->role, 'starts_on' => now()->subMonth(), 'ends_on' => now()->subDay(), 'is_active' => true]);
        $future = UserAssignment::create(['user_id' => $user->id, 'role' => $user->role, 'starts_on' => now()->addDay(), 'ends_on' => now()->addMonth(), 'is_active' => true]);
        $current = UserAssignment::create(['user_id' => $user->id, 'role' => $user->role, 'starts_on' => now()->subDay(), 'ends_on' => now()->addDay(), 'is_active' => true]);

        $this->assertFalse($expired->isEffective());
        $this->assertFalse($future->isEffective());
        $this->assertTrue($current->isEffective());
        $this->assertEquals([$current->id], UserAssignment::effective()->pluck('id')->all());
    }

    public function test_expired_coordinator_assignment_cannot_be_bypassed_by_programme_owner_field(): void
    {
        $coordinator = User::factory()->create(['role' => UserRole::COORDINATOR]);
        $programme = Programme::create(['code' => 'EXP', 'name' => 'Expired Scope Programme', 'category' => 'Undergraduate', 'status' => 'draft', 'coordinator_id' => $coordinator->id]);
        $assignment = UserAssignment::create([
            'user_id' => $coordinator->id, 'role' => $coordinator->role, 'programme_id' => $programme->id,
            'starts_on' => now()->subMonth(), 'ends_on' => now()->subDay(), 'is_active' => true,
        ]);

        $this->actingAs($coordinator, 'sanctum')->getJson('/api/v1/programmes')
            ->assertOk()->assertJsonCount(0, 'data');

        $assignment->update(['ends_on' => now()->addDay()]);
        $this->actingAs($coordinator, 'sanctum')->getJson('/api/v1/programmes')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $programme->id);
    }

    public function test_legacy_programme_assignments_can_be_backfilled_to_their_canonical_unit(): void
    {
        $faculty = Faculty::create(['code' => 'BE', 'name' => 'School of Built Environment']);
        $department = Department::create(['faculty_id' => $faculty->id, 'code' => 'ARC', 'name' => 'Architecture']);
        $programme = Programme::create([
            'code' => 'ARD', 'name' => 'Bachelor of Architecture', 'category' => 'Undergraduate',
            'faculty_id' => $faculty->id, 'department_id' => $department->id,
        ]);
        $coordinator = User::factory()->create(['role' => UserRole::COORDINATOR]);
        $assignment = UserAssignment::create([
            'user_id' => $coordinator->id, 'role' => $coordinator->role,
            'programme_id' => $programme->id, 'is_active' => true,
        ]);

        $migration = require database_path('migrations/2026_09_06_000009_backfill_assignment_organisation_scope.php');
        $migration->up();

        $assignment->refresh();
        $this->assertSame($faculty->id, $assignment->faculty_id);
        $this->assertSame($department->id, $assignment->department_id);
    }
}
