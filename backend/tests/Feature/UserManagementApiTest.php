<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Mail\PasswordResetLink;
use App\Models\ApplicationCall;
use App\Models\Department;
use App\Models\Faculty;
use App\Models\OnboardingChallenge;
use App\Models\Programme;
use App\Models\User;
use App\Models\UserAssignment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class UserManagementApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_accounts_are_listed_with_pending_verification_first(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'status' => UserStatus::ACTIVE]);
        User::factory()->create(['created_by' => $admin->id, 'status' => UserStatus::INACTIVE]);
        User::factory()->create(['created_by' => $admin->id, 'status' => UserStatus::ACTIVE]);
        User::factory()->create(['created_by' => $admin->id, 'status' => UserStatus::PENDING]);

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/users')->assertOk();

        $this->assertSame(
            ['pending', 'active', 'active', 'inactive'],
            collect($response->json('data'))->pluck('status')->all(),
        );
    }

    public function test_system_administrator_can_create_a_pending_staff_account(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/users', [
            'title' => 'Dr.',
            'first_name' => 'Jane',
            'last_name' => 'Namutebi',
            'email' => 'JANE.NAMUTEBI@KYU.AC.UG',
            'role' => UserRole::REGISTRAR->value,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.email', 'jane.namutebi@kyu.ac.ug')
            ->assertJsonPath('data.status', UserStatus::PENDING->value)
            ->assertJsonPath('data.role', UserRole::REGISTRAR->value);
        $this->assertDatabaseHas('users', ['email' => 'jane.namutebi@kyu.ac.ug', 'status' => 'pending']);
        $this->assertDatabaseCount('onboarding_challenges', 1);
        $this->assertDatabaseHas('audit_events', ['action' => 'user.created']);
    }

    public function test_development_server_can_explicitly_expose_the_code_to_the_creating_administrator(): void
    {
        Mail::fake();
        config(['app.expose_admin_onboarding_otp' => true]);
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Development', 'last_name' => 'Account',
            'email' => 'development.account@kyu.ac.ug',
            'role' => UserRole::REGISTRAR->value,
        ])->assertCreated()->assertJsonStructure(['onboarding' => ['development_otp']]);

        $this->assertMatchesRegularExpression('/^\d{6}$/', (string) $response->json('onboarding.development_otp'));
    }

    public function test_non_system_administrator_cannot_use_user_management_api(): void
    {
        $coordinator = User::factory()->create(['role' => UserRole::COORDINATOR]);

        $this->actingAs($coordinator, 'sanctum')->getJson('/api/v1/admin/users')->assertForbidden();
    }

    public function test_dean_can_only_create_and_see_hods_inside_their_assigned_faculty(): void
    {
        Mail::fake();
        $assignedFaculty = Faculty::create(['code' => 'SCI', 'name' => 'Science', 'is_active' => true]);
        $assignedDepartment = Department::create(['faculty_id' => $assignedFaculty->id, 'code' => 'CS', 'name' => 'Computer Science', 'is_active' => true]);
        $otherFaculty = Faculty::create(['code' => 'ART', 'name' => 'Arts', 'is_active' => true]);
        $otherDepartment = Department::create(['faculty_id' => $otherFaculty->id, 'code' => 'LIT', 'name' => 'Literature', 'is_active' => true]);
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $dean = User::factory()->create(['role' => UserRole::DEAN]);
        UserAssignment::create(['user_id' => $dean->id, 'role' => UserRole::DEAN, 'faculty_id' => $assignedFaculty->id, 'is_active' => true]);

        $created = $this->actingAs($dean, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Grace', 'last_name' => 'Nabirye', 'email' => 'grace.nabirye@kyu.ac.ug',
            'role' => UserRole::HOD->value, 'faculty_id' => $assignedFaculty->id, 'department_id' => $assignedDepartment->id,
        ])->assertCreated();

        $this->actingAs($dean, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Outside', 'last_name' => 'Scope', 'email' => 'outside.scope@kyu.ac.ug',
            'role' => UserRole::HOD->value, 'faculty_id' => $otherFaculty->id, 'department_id' => $otherDepartment->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('faculty_id');

        User::factory()->create(['role' => UserRole::HOD, 'created_by' => $admin->id]);
        $this->actingAs($dean, 'sanctum')->getJson('/api/v1/admin/users')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $created->json('data.id'));
        $this->actingAs($dean, 'sanctum')->getJson('/api/v1/admin/users/options')
            ->assertOk()->assertJsonCount(1, 'data.faculties')->assertJsonPath('data.faculties.0.id', $assignedFaculty->id)
            ->assertJsonCount(0, 'data.programmes')->assertJsonCount(0, 'data.calls');
    }

    public function test_valid_onboarding_code_activates_the_account_and_sets_password(): void
    {
        $user = User::factory()->create([
            'status' => UserStatus::PENDING,
            'email_verified_at' => null,
            'must_change_password' => true,
        ]);
        OnboardingChallenge::create([
            'user_id' => $user->id,
            'otp_hash' => Hash::make('123456'),
            'expires_at' => now()->addMinutes(15),
        ]);

        $this->postJson('/api/v1/auth/onboarding/verify', ['email' => $user->email, 'otp' => '123456'])
            ->assertOk()->assertJsonPath('data.verified', true);

        $this->postJson('/api/v1/auth/onboarding/complete', [
            'email' => $user->email,
            'otp' => '123456',
            'password' => 'Stronger-Password-2026!',
            'password_confirmation' => 'Stronger-Password-2026!',
        ])->assertOk()->assertJsonPath('data.activated', true);

        $user->refresh();
        $this->assertSame(UserStatus::ACTIVE, $user->status);
        $this->assertTrue(Hash::check('Stronger-Password-2026!', $user->password));
        $this->assertNotNull($user->email_verified_at);

        $this->postJson('/api/v1/auth/onboarding/complete', [
            'email' => $user->email,
            'otp' => '123456',
            'password' => 'Another-Password-2026!',
            'password_confirmation' => 'Another-Password-2026!',
        ])->assertUnprocessable()->assertJsonValidationErrors('otp');
    }

    public function test_onboarding_code_is_blocked_after_five_failed_attempts(): void
    {
        $user = User::factory()->create(['status' => UserStatus::PENDING, 'email_verified_at' => null]);
        $challenge = OnboardingChallenge::create([
            'user_id' => $user->id,
            'otp_hash' => Hash::make('123456'),
            'expires_at' => now()->addMinutes(15),
        ]);

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->postJson('/api/v1/auth/onboarding/verify', ['email' => $user->email, 'otp' => '999999'])
                ->assertUnprocessable()->assertJsonValidationErrors('otp');
        }

        $this->postJson('/api/v1/auth/onboarding/verify', ['email' => $user->email, 'otp' => '123456'])
            ->assertUnprocessable()->assertJsonValidationErrors('otp');
        $this->assertGreaterThanOrEqual(5, $challenge->fresh()->attempts);
    }

    public function test_resending_onboarding_consumes_every_previous_open_code(): void
    {
        Mail::fake();
        $user = User::factory()->create(['status' => UserStatus::PENDING, 'email_verified_at' => null]);
        $old = OnboardingChallenge::create([
            'user_id' => $user->id,
            'otp_hash' => Hash::make('123456'),
            'expires_at' => now()->addMinutes(15),
        ]);

        $this->postJson('/api/v1/auth/onboarding/resend', ['email' => strtoupper($user->email)])
            ->assertOk()->assertJsonMissingPath('data.development_otp');

        $this->assertNotNull($old->fresh()->consumed_at);
        $this->assertSame(1, OnboardingChallenge::where('user_id', $user->id)->whereNull('consumed_at')->count());
        $this->assertDatabaseHas('audit_events', ['action' => 'auth.onboarding_resent', 'actor_id' => $user->id]);
    }

    public function test_deactivating_a_top_level_account_requires_step_up_password(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);
        $dean = User::factory()->create(['role' => UserRole::DEAN]);

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/users/{$dean->id}/status", [
            'status' => UserStatus::INACTIVE->value,
        ])->assertUnprocessable();

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/users/{$dean->id}/status", [
            'status' => UserStatus::INACTIVE->value,
            'current_password' => 'Admin-Password-2026!',
        ])->assertOk()->assertJsonPath('data.status', UserStatus::INACTIVE->value);
    }

    public function test_admissions_officer_is_assigned_to_a_real_application_call(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $programme = Programme::create(['code' => 'BTE', 'name' => 'Bachelor of Test Engineering', 'category' => 'Undergraduate', 'status' => 'published']);
        $call = ApplicationCall::create([
            'programme_id' => $programme->id, 'intake' => '2026/2027 Main Intake',
            'opening_date' => '2026-09-01', 'deadline' => '2026-12-01', 'status' => 'open',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/users', [
            'title' => 'Mr.', 'first_name' => 'Isaac', 'last_name' => 'Walugembe',
            'email' => 'isaac.walugembe@kyu.ac.ug', 'role' => UserRole::ADMISSIONS_OFFICER->value,
            'staff_status' => 'permanent', 'application_call_id' => $call->id,
            'permissions' => ['create' => false, 'monitor' => true, 'close' => true],
        ])->assertCreated();

        $response->assertJsonPath('data.assignment.application_call_id', $call->id)
            ->assertJsonPath('data.assignment.permissions.close', true);
        $this->assertDatabaseHas('user_assignments', ['user_id' => $response->json('data.id'), 'application_call_id' => $call->id]);
    }

    public function test_inactive_organisation_units_are_excluded_and_rejected_for_new_assignments(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $faculty = Faculty::create(['code' => 'OLD', 'name' => 'Inactive Faculty', 'is_active' => false]);
        $department = Department::create(['faculty_id' => $faculty->id, 'code' => 'OLD-D', 'name' => 'Inactive Department', 'is_active' => false]);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/users/options')
            ->assertOk()->assertJsonCount(0, 'data.faculties');

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Inactive', 'last_name' => 'Dean', 'email' => 'inactive.dean@kyu.ac.ug',
            'role' => UserRole::DEAN->value, 'faculty_id' => $faculty->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('faculty_id');

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Inactive', 'last_name' => 'Hod', 'email' => 'inactive.hod@kyu.ac.ug',
            'role' => UserRole::HOD->value, 'faculty_id' => $faculty->id, 'department_id' => $department->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('faculty_id');
    }

    public function test_administrator_sends_reset_links_to_established_accounts_and_codes_to_pending_accounts(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $active = User::factory()->create(['role' => UserRole::REGISTRAR, 'created_by' => $admin->id]);
        $pending = User::factory()->create(['role' => UserRole::HOD, 'status' => UserStatus::PENDING, 'created_by' => $admin->id]);

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/users/{$active->id}/reset-password")
            ->assertOk()->assertJsonPath('delivery.kind', 'password_reset')->assertJsonPath('delivery.expires_in', 1800);
        Mail::assertSent(PasswordResetLink::class, fn (PasswordResetLink $mail) => $mail->hasTo($active->email));
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $active->email]);

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/users/{$pending->id}/reset-password")
            ->assertOk()->assertJsonPath('delivery.kind', 'onboarding')->assertJsonPath('delivery.expires_in', 900);
        $this->assertDatabaseHas('audit_events', ['action' => 'user.password_reset_issued', 'target_id' => $active->id]);
        $this->assertDatabaseHas('audit_events', ['action' => 'user.onboarding_resent', 'target_id' => $pending->id]);
    }

    public function test_onboarding_cannot_reactivate_an_established_or_suspended_account(): void
    {
        Mail::fake();
        $active = User::factory()->create(['status' => UserStatus::ACTIVE]);
        OnboardingChallenge::create([
            'user_id' => $active->id, 'otp_hash' => Hash::make('123456'), 'expires_at' => now()->addMinutes(15),
        ]);

        $this->postJson('/api/v1/auth/onboarding/complete', [
            'email' => $active->email, 'otp' => '123456',
            'password' => 'Replacement-Password-2026!', 'password_confirmation' => 'Replacement-Password-2026!',
        ])->assertUnprocessable()->assertJsonValidationErrors('otp');

        $this->postJson('/api/v1/auth/onboarding/resend', ['email' => $active->email])
            ->assertOk()->assertJsonMissingPath('data.development_otp');
        Mail::assertNothingSent();
        $this->assertSame(UserStatus::ACTIVE, $active->fresh()->status);
    }

    public function test_suspension_revokes_sessions_and_reactivation_restores_verified_account(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $faculty = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science']);
        $department = Department::create(['faculty_id' => $faculty->id, 'code' => 'CS', 'name' => 'Computer Science']);
        $programme = Programme::create(['code' => 'BCS', 'name' => 'Bachelor of Computer Science', 'category' => 'Undergraduate', 'faculty_id' => $faculty->id, 'department_id' => $department->id]);
        $coordinator = User::factory()->create(['role' => UserRole::COORDINATOR, 'created_by' => $admin->id]);
        UserAssignment::create([
            'user_id' => $coordinator->id, 'role' => $coordinator->role,
            'faculty_id' => $faculty->id, 'department_id' => $department->id,
            'programme_id' => $programme->id, 'is_active' => true,
        ]);
        $coordinator->createToken('active-browser');

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/users/{$coordinator->id}/status", [
            'status' => UserStatus::SUSPENDED->value,
        ])->assertOk()->assertJsonPath('data.status', UserStatus::SUSPENDED->value);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $coordinator->id]);

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/users/{$coordinator->id}/status", [
            'status' => UserStatus::ACTIVE->value,
        ])->assertOk()->assertJsonPath('data.status', UserStatus::ACTIVE->value);
    }

    public function test_pending_account_status_cannot_bypass_onboarding(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $pending = User::factory()->create([
            'role' => UserRole::COORDINATOR, 'status' => UserStatus::PENDING,
            'email_verified_at' => null, 'created_by' => $admin->id,
        ]);

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/users/{$pending->id}/status", [
            'status' => UserStatus::ACTIVE->value,
        ])->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->assertSame(UserStatus::PENDING, $pending->fresh()->status);
    }

    public function test_hod_and_registrar_can_only_create_their_delegated_account_types(): void
    {
        Mail::fake();
        $faculty = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science', 'is_active' => true]);
        $department = Department::create(['faculty_id' => $faculty->id, 'code' => 'CS', 'name' => 'Computer Science', 'is_active' => true]);
        $programme = Programme::create([
            'code' => 'BIT', 'name' => 'Bachelor of Information Technology', 'category' => 'Undergraduate',
            'status' => 'published', 'faculty_id' => $faculty->id, 'department_id' => $department->id,
        ]);
        $call = ApplicationCall::create([
            'programme_id' => $programme->id, 'intake' => '2026/2027 Main Intake',
            'opening_date' => now()->subDay(), 'deadline' => now()->addMonth(), 'status' => 'open',
        ]);
        $hod = User::factory()->create(['role' => UserRole::HOD]);
        UserAssignment::create(['user_id' => $hod->id, 'role' => $hod->role, 'faculty_id' => $faculty->id, 'department_id' => $department->id, 'is_active' => true]);
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);

        $this->actingAs($hod, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Programme', 'last_name' => 'Coordinator', 'email' => 'programme.coordinator@kyu.ac.ug',
            'role' => UserRole::COORDINATOR->value, 'programme_id' => $programme->id,
            'starts_on' => now()->toDateString(), 'ends_on' => now()->addYear()->toDateString(),
        ])->assertCreated()->assertJsonPath('data.role', UserRole::COORDINATOR->value);
        $this->actingAs($hod, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Wrong', 'last_name' => 'Role', 'email' => 'wrong.role@kyu.ac.ug',
            'role' => UserRole::ADMISSIONS_OFFICER->value, 'application_call_id' => $call->id,
        ])->assertForbidden();

        $this->actingAs($registrar, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Admissions', 'last_name' => 'Officer', 'email' => 'admissions.officer@kyu.ac.ug',
            'role' => UserRole::ADMISSIONS_OFFICER->value, 'application_call_id' => $call->id,
        ])->assertCreated()->assertJsonPath('data.role', UserRole::ADMISSIONS_OFFICER->value);
        $this->actingAs($registrar, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Wrong', 'last_name' => 'Coordinator', 'email' => 'wrong.coordinator@kyu.ac.ug',
            'role' => UserRole::COORDINATOR->value, 'programme_id' => $programme->id,
            'starts_on' => now()->toDateString(), 'ends_on' => now()->addYear()->toDateString(),
        ])->assertForbidden();
    }

    public function test_hod_can_view_and_assign_programmes_across_their_faculty(): void
    {
        Mail::fake();
        $faculty = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science', 'is_active' => true]);
        $computing = Department::create(['faculty_id' => $faculty->id, 'code' => 'CS', 'name' => 'Computer Science', 'is_active' => true]);
        $mathematics = Department::create(['faculty_id' => $faculty->id, 'code' => 'MTH', 'name' => 'Mathematics', 'is_active' => true]);
        $otherFaculty = Faculty::create(['code' => 'ART', 'name' => 'Faculty of Arts', 'is_active' => true]);
        $otherDepartment = Department::create(['faculty_id' => $otherFaculty->id, 'code' => 'LIT', 'name' => 'Literature', 'is_active' => true]);
        $computingProgramme = Programme::create(['code' => 'BCS', 'name' => 'Bachelor of Computer Science', 'category' => 'Undergraduate', 'status' => 'published', 'faculty_id' => $faculty->id, 'department_id' => $computing->id]);
        $mathematicsProgramme = Programme::create(['code' => 'BMT', 'name' => 'Bachelor of Mathematics', 'category' => 'Undergraduate', 'status' => 'published', 'faculty_id' => $faculty->id, 'department_id' => $mathematics->id]);
        $draftProgramme = Programme::create(['code' => 'DST', 'name' => 'Draft Science Programme', 'category' => 'Undergraduate', 'status' => 'draft', 'faculty_id' => $faculty->id, 'department_id' => $computing->id]);
        $outsideProgramme = Programme::create(['code' => 'BLT', 'name' => 'Bachelor of Literature', 'category' => 'Undergraduate', 'status' => 'published', 'faculty_id' => $otherFaculty->id, 'department_id' => $otherDepartment->id]);
        $hod = User::factory()->create(['role' => UserRole::HOD]);
        UserAssignment::create(['user_id' => $hod->id, 'role' => UserRole::HOD, 'faculty_id' => $faculty->id, 'department_id' => $computing->id, 'is_active' => true]);

        $options = $this->actingAs($hod, 'sanctum')->getJson('/api/v1/admin/users/options')->assertOk();
        $this->assertEqualsCanonicalizing(
            [$computingProgramme->id, $mathematicsProgramme->id, $draftProgramme->id],
            collect($options->json('data.programmes'))->pluck('id')->all(),
        );
        $mathematicsOption = collect($options->json('data.programmes'))->firstWhere('id', $mathematicsProgramme->id);
        $this->assertSame($faculty->name, $mathematicsOption['academic_unit']);
        $this->assertSame($mathematics->name, $mathematicsOption['department']);

        $visible = $this->actingAs($hod, 'sanctum')->getJson('/api/v1/programmes?per_page=100')->assertOk();
        $this->assertEqualsCanonicalizing(
            [$computingProgramme->id, $mathematicsProgramme->id, $draftProgramme->id],
            collect($visible->json('data'))->pluck('id')->all(),
        );

        $this->actingAs($hod, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Faculty', 'last_name' => 'Coordinator', 'email' => 'faculty.coordinator@kyu.ac.ug',
            'role' => UserRole::COORDINATOR->value, 'programme_id' => $mathematicsProgramme->id,
            'starts_on' => now()->toDateString(), 'ends_on' => now()->addYear()->toDateString(),
        ])->assertCreated()
            ->assertJsonPath('data.assignment.programme_id', $mathematicsProgramme->id)
            ->assertJsonPath('data.assignment.faculty_id', $faculty->id)
            ->assertJsonPath('data.assignment.department_id', $mathematics->id);

        $this->actingAs($hod, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Duplicate', 'last_name' => 'Coordinator', 'email' => 'duplicate.coordinator@kyu.ac.ug',
            'role' => UserRole::COORDINATOR->value, 'programme_id' => $mathematicsProgramme->id,
            'starts_on' => now()->addMonth()->toDateString(), 'ends_on' => now()->addMonths(6)->toDateString(),
        ])->assertUnprocessable()->assertJsonValidationErrors('programme_id');

        $this->actingAs($hod, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Outside', 'last_name' => 'Coordinator', 'email' => 'outside.coordinator@kyu.ac.ug',
            'role' => UserRole::COORDINATOR->value, 'programme_id' => $outsideProgramme->id,
            'starts_on' => now()->toDateString(), 'ends_on' => now()->addYear()->toDateString(),
        ])->assertUnprocessable()->assertJsonValidationErrors('programme_id');
    }

    public function test_registrar_options_expose_only_real_assignable_calls(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $programme = Programme::create(['code' => 'BTE', 'name' => 'Bachelor of Test Engineering', 'category' => 'Undergraduate', 'status' => 'published']);
        $draft = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Draft Intake', 'opening_date' => today(), 'deadline' => today()->addMonth(), 'status' => 'draft']);
        $open = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Open Intake', 'opening_date' => today(), 'deadline' => today()->addMonth(), 'status' => 'open']);
        ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Closed Intake', 'opening_date' => today()->subMonths(2), 'deadline' => today()->subMonth(), 'status' => 'closed']);
        $expired = ApplicationCall::create(['programme_id' => $programme->id, 'intake' => 'Expired Open Intake', 'opening_date' => today()->subMonths(2), 'deadline' => today()->subDay(), 'status' => 'open']);

        $response = $this->actingAs($registrar, 'sanctum')->getJson('/api/v1/admin/users/options')->assertOk();
        $this->assertEqualsCanonicalizing(
            [$draft->id, $open->id],
            collect($response->json('data.calls'))->pluck('id')->all(),
        );
        $this->actingAs($registrar, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Expired', 'last_name' => 'Officer', 'email' => 'expired.officer@kyu.ac.ug',
            'role' => UserRole::ADMISSIONS_OFFICER->value, 'application_call_id' => $expired->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('application_call_id');
    }

    public function test_coordinator_and_admissions_officer_can_receive_multiple_programme_assignments(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $faculty = Faculty::create(['code' => 'MUL', 'name' => 'Multi Assignment Faculty']);
        $department = Department::create(['faculty_id' => $faculty->id, 'code' => 'MUL-D', 'name' => 'Multi Assignment Department']);
        $first = Programme::create(['code' => 'MUL1', 'name' => 'First Programme', 'category' => 'Undergraduate', 'status' => 'published', 'faculty_id' => $faculty->id, 'department_id' => $department->id]);
        $second = Programme::create(['code' => 'MUL2', 'name' => 'Second Programme', 'category' => 'Undergraduate', 'status' => 'published', 'faculty_id' => $faculty->id, 'department_id' => $department->id]);
        $firstCall = ApplicationCall::create(['programme_id' => $first->id, 'intake' => 'First Intake', 'opening_date' => today(), 'deadline' => today()->addMonth(), 'status' => 'open']);
        $secondCall = ApplicationCall::create(['programme_id' => $second->id, 'intake' => 'Second Intake', 'opening_date' => today(), 'deadline' => today()->addMonth(), 'status' => 'open']);

        $coordinator = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Multi', 'last_name' => 'Coordinator', 'email' => 'multi.coordinator@kyu.ac.ug',
            'role' => UserRole::COORDINATOR->value, 'programme_ids' => [$first->id, $second->id],
            'starts_on' => today()->toDateString(), 'ends_on' => today()->addYear()->toDateString(),
        ])->assertCreated()->assertJsonCount(2, 'data.assignments');
        $this->assertSame(2, UserAssignment::where('user_id', $coordinator->json('data.id'))->count());

        $officer = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/users', [
            'first_name' => 'Multi', 'last_name' => 'Officer', 'email' => 'multi.officer@kyu.ac.ug',
            'role' => UserRole::ADMISSIONS_OFFICER->value, 'application_call_ids' => [$firstCall->id, $secondCall->id],
            'permissions' => ['create' => true, 'monitor' => true, 'close' => false],
        ])->assertCreated()->assertJsonCount(2, 'data.assignments');
        $this->assertSame(2, UserAssignment::where('user_id', $officer->json('data.id'))->count());
    }

    public function test_existing_reactivated_staff_can_receive_additional_assignments(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $coordinator = User::factory()->create(['role' => UserRole::COORDINATOR, 'status' => UserStatus::ACTIVE, 'created_by' => $admin->id]);
        $faculty = Faculty::create(['code' => 'REA', 'name' => 'Reassignment Faculty']);
        $programme = Programme::create(['code' => 'REA1', 'name' => 'Reassignment Programme', 'category' => 'Undergraduate', 'status' => 'published', 'faculty_id' => $faculty->id]);

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/users/{$coordinator->id}/assignments", [
            'programme_ids' => [$programme->id],
            'starts_on' => today()->toDateString(),
            'ends_on' => today()->addYear()->toDateString(),
        ])->assertOk()->assertJsonCount(1, 'data.assignments');

        $this->assertDatabaseHas('user_assignments', ['user_id' => $coordinator->id, 'programme_id' => $programme->id, 'is_active' => true]);
        $this->assertDatabaseHas('programmes', ['id' => $programme->id, 'coordinator_id' => $coordinator->id]);
        $this->assertDatabaseHas('audit_events', ['action' => 'user.assignments_added', 'target_id' => $coordinator->id]);
    }

    public function test_managers_see_centrally_created_accounts_inside_their_operational_scope(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR]);
        $officer = User::factory()->create(['role' => UserRole::ADMISSIONS_OFFICER, 'created_by' => $admin->id]);
        $unrelated = User::factory()->create(['role' => UserRole::HOD, 'created_by' => $admin->id]);

        $response = $this->actingAs($registrar, 'sanctum')->getJson('/api/v1/admin/users')->assertOk();

        $ids = collect($response->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($officer->id));
        $this->assertFalse($ids->contains($unrelated->id));
    }

    public function test_authorised_manager_can_remove_only_a_never_used_account(): void
    {
        $registrar = User::factory()->create(['role' => UserRole::REGISTRAR, 'password' => 'Manager-Password!']);
        $unused = User::factory()->create(['role' => UserRole::ADMISSIONS_OFFICER, 'status' => UserStatus::PENDING]);
        $used = User::factory()->create([
            'role' => UserRole::ADMISSIONS_OFFICER,
            'status' => UserStatus::INACTIVE,
            'last_login_at' => now()->subDay(),
        ]);

        $this->actingAs($registrar, 'sanctum')->deleteJson("/api/v1/admin/users/{$used->id}", [
            'current_password' => 'Manager-Password!',
        ])->assertUnprocessable()->assertJsonValidationErrors('user');
        $this->actingAs($registrar, 'sanctum')->deleteJson("/api/v1/admin/users/{$unused->id}", [
            'current_password' => 'Manager-Password!',
        ])->assertNoContent();

        $this->assertDatabaseMissing('users', ['id' => $unused->id]);
        $this->assertDatabaseHas('users', ['id' => $used->id]);
        $this->assertDatabaseHas('audit_events', ['action' => 'user.deleted', 'target_id' => $unused->id]);
    }
}
