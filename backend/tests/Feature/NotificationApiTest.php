<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\ApplicationCall;
use App\Models\Department;
use App\Models\Faculty;
use App\Models\Programme;
use App\Models\User;
use App\Models\UserAssignment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_reviewer_receives_only_actionable_programmes_inside_their_scope(): void
    {
        $faculty = Faculty::create(['code' => 'SCI', 'name' => 'Science', 'is_active' => true]);
        $department = Department::create(['faculty_id' => $faculty->id, 'code' => 'CS', 'name' => 'Computing', 'is_active' => true]);
        $visible = Programme::create(['code' => 'VIS', 'name' => 'Visible Review', 'category' => 'Undergraduate', 'faculty_id' => $faculty->id, 'department_id' => $department->id, 'status' => 'submitted']);
        Programme::create(['code' => 'HID', 'name' => 'Hidden Review', 'category' => 'Undergraduate', 'status' => 'submitted']);
        Programme::create(['code' => 'PUB', 'name' => 'Already Published', 'category' => 'Undergraduate', 'faculty_id' => $faculty->id, 'department_id' => $department->id, 'status' => 'published']);
        $hod = User::factory()->create(['role' => UserRole::HOD]);
        UserAssignment::create(['user_id' => $hod->id, 'role' => UserRole::HOD, 'faculty_id' => $faculty->id, 'department_id' => $department->id, 'is_active' => true]);

        $response = $this->actingAs($hod, 'sanctum')->getJson('/api/v1/notifications')->assertOk()->assertJsonCount(1, 'data');
        $this->assertStringContainsString($visible->name, $response->json('data.0.text'));
        $this->assertStringContainsString('target='.urlencode($visible->id), $response->json('data.0.path'));
    }

    public function test_system_administrator_receives_real_deadline_and_security_alerts(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $locked = User::factory()->create(['email' => 'locked@kyu.ac.ug', 'locked_until' => now()->addMinutes(15), 'failed_login_attempts' => 5]);
        $programme = Programme::create(['code' => 'BTE', 'name' => 'Deadline Programme', 'category' => 'Undergraduate', 'status' => 'published']);
        $call = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Closing Intake', 'opening_date' => today()->subDay(), 'deadline' => today()->addDays(2), 'status' => 'open']);

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/notifications')->assertOk();
        $types = collect($response->json('data'))->pluck('type');
        $this->assertTrue($types->contains('deadline'));
        $this->assertTrue($types->contains('security'));
        $deadline = collect($response->json('data'))->firstWhere('type', 'deadline');
        $security = collect($response->json('data'))->firstWhere('type', 'security');
        $this->assertStringContainsString('target='.urlencode($call->id), $deadline['path']);
        $this->assertStringContainsString('target='.urlencode($locked->id), $security['path']);
    }

    public function test_notifications_require_authentication(): void
    {
        $this->getJson('/api/v1/notifications')->assertUnauthorized();
    }
}
