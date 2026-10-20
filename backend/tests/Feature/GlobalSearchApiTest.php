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

class GlobalSearchApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_system_administrator_searches_real_users_programmes_and_calls(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        User::factory()->create(['first_name' => 'Architecture', 'last_name' => 'Officer', 'email' => 'architecture@kyu.ac.ug']);
        $programme = Programme::create(['code' => 'ARCH', 'name' => 'Bachelor of Architecture', 'category' => 'Undergraduate', 'status' => 'published']);
        ApplicationCall::create([
            'programme_id' => $programme->id,
            'intake' => 'Architecture September Intake',
            'opening_date' => today(),
            'deadline' => today()->addMonth(),
            'status' => 'open',
            'created_by' => $admin->id,
        ]);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/search?q=architecture')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.type', 'user')
            ->assertJsonPath('data.1.type', 'programme')
            ->assertJsonPath('data.2.type', 'call');
    }

    public function test_search_respects_programme_and_call_assignments(): void
    {
        $faculty = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science', 'is_active' => true]);
        $department = Department::create(['faculty_id' => $faculty->id, 'code' => 'CS', 'name' => 'Computer Science', 'is_active' => true]);
        $visible = Programme::create(['code' => 'VISIBLE', 'name' => 'Visible Search Programme', 'category' => 'Undergraduate', 'department_id' => $department->id, 'faculty_id' => $faculty->id, 'status' => 'published']);
        Programme::create(['code' => 'HIDDEN', 'name' => 'Hidden Search Programme', 'category' => 'Undergraduate', 'status' => 'published']);

        $hod = User::factory()->create(['role' => UserRole::HOD]);
        UserAssignment::create(['user_id' => $hod->id, 'role' => UserRole::HOD, 'faculty_id' => $faculty->id, 'department_id' => $department->id, 'is_active' => true]);

        $response = $this->actingAs($hod, 'sanctum')->getJson('/api/v1/search?q=search')->assertOk();
        $this->assertSame([$visible->id], collect($response->json('data'))->where('type', 'programme')->pluck('id')->all());

        $officer = User::factory()->create(['role' => UserRole::ADMISSIONS_OFFICER]);
        $assigned = ApplicationCall::create(['programme_id' => $visible->id, 'intake' => 'Assigned Search Intake', 'opening_date' => today(), 'deadline' => today()->addMonth(), 'status' => 'open']);
        ApplicationCall::create(['programme_id' => $visible->id, 'intake' => 'Hidden Search Intake', 'opening_date' => today(), 'deadline' => today()->addMonth(), 'status' => 'open']);
        UserAssignment::create(['user_id' => $officer->id, 'role' => UserRole::ADMISSIONS_OFFICER, 'application_call_id' => $assigned->id, 'permissions' => ['monitor' => true], 'is_active' => true]);

        $officerResponse = $this->actingAs($officer, 'sanctum')->getJson('/api/v1/search?q=search')->assertOk();
        $this->assertSame([$assigned->id], collect($officerResponse->json('data'))->where('type', 'call')->pluck('id')->all());
        $this->assertEmpty(collect($officerResponse->json('data'))->whereIn('type', ['user', 'programme']));
    }

    public function test_search_requires_authentication_and_a_meaningful_query(): void
    {
        $this->getJson('/api/v1/search?q=test')->assertUnauthorized();

        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/search?q=a')->assertUnprocessable();
    }
}
