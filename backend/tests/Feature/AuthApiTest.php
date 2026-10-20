<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Faculty;
use App\Models\User;
use App\Models\UserAssignment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_signed_in_administrator_identity_includes_their_governed_faculty(): void
    {
        $faculty = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science']);
        $dean = User::factory()->create(['role' => UserRole::DEAN, 'status' => UserStatus::ACTIVE]);
        UserAssignment::create([
            'user_id' => $dean->id,
            'role' => UserRole::DEAN,
            'faculty_id' => $faculty->id,
            'is_active' => true,
        ]);

        $this->actingAs($dean, 'sanctum')->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.faculty', 'Faculty of Science')
            ->assertJsonPath('data.department', null);
    }

    public function test_active_user_can_login_read_identity_and_logout(): void
    {
        $user = User::factory()->create(['password' => 'Kyu-Test-2026!']);

        $login = $this->postJson('/api/v1/auth/login', [
            'email' => strtoupper($user->email),
            'password' => 'Kyu-Test-2026!',
            'device_name' => 'test-suite',
        ]);

        $login->assertOk()
            ->assertJsonPath('data.user.id', $user->id)
            ->assertJsonPath('data.user.role', 'COORDINATOR')
            ->assertJsonStructure(['data' => ['token']]);

        $token = $login->json('data.token');
        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertOk()->assertJsonPath('data.email', $user->email);

        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
    }

    public function test_five_bad_passwords_lock_the_account(): void
    {
        $user = User::factory()->create(['password' => 'Correct-Password!']);
        $user->createToken('already-signed-in-device');

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $response = $this->postJson('/api/v1/auth/login', [
                'email' => $user->email,
                'password' => 'Wrong-Password!',
            ]);
            $attempt < 5
                ? $response->assertUnprocessable()
                : $response->assertStatus(423)->assertJsonPath('code', 'ACCOUNT_LOCKED');
        }

        $user->refresh();
        $this->assertSame(UserStatus::LOCKED, $user->status);
        $this->assertSame(5, $user->failed_login_attempts);
        $this->assertTrue($user->locked_until->isFuture());
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_pending_suspended_and_inactive_accounts_cannot_login(): void
    {
        foreach ([UserStatus::PENDING, UserStatus::SUSPENDED, UserStatus::INACTIVE] as $status) {
            $user = User::factory()->create(['status' => $status, 'password' => 'Correct-Password!']);
            $this->postJson('/api/v1/auth/login', [
                'email' => $user->email,
                'password' => 'Correct-Password!',
            ])->assertForbidden();
        }
    }

    public function test_an_expired_temporary_lock_is_cleared_by_a_valid_login(): void
    {
        $user = User::factory()->create([
            'status' => UserStatus::LOCKED,
            'password' => 'Correct-Password!',
            'failed_login_attempts' => 5,
            'locked_until' => now()->subSecond(),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'Correct-Password!',
        ])->assertOk();

        $user->refresh();
        $this->assertSame(UserStatus::ACTIVE, $user->status);
        $this->assertSame(0, $user->failed_login_attempts);
        $this->assertNull($user->locked_until);
    }

    public function test_a_stale_token_cannot_bypass_a_later_account_suspension(): void
    {
        $user = User::factory()->create(['status' => UserStatus::ACTIVE]);
        $token = $user->createToken('existing-session')->plainTextToken;
        $user->update(['status' => UserStatus::SUSPENDED]);

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertForbidden()
            ->assertJsonPath('code', 'ACCOUNT_UNAVAILABLE');

        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
    }

    public function test_reauthentication_requires_the_current_password(): void
    {
        $user = User::factory()->create(['password' => 'Correct-Password!']);
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/auth/reauthenticate', ['password' => 'wrong'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'INVALID_PASSWORD');
    }

    public function test_forgot_password_issues_a_real_token_without_disclosing_unknown_accounts(): void
    {
        Mail::fake();
        $user = User::factory()->create(['status' => UserStatus::ACTIVE]);

        $this->postJson('/api/v1/auth/password/forgot', ['email' => strtoupper($user->email)])
            ->assertOk()->assertJsonPath('data.message', 'If an eligible account exists for that email, a secure reset link has been issued.');
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email]);
        $this->assertDatabaseHas('audit_events', ['action' => 'auth.password_reset_requested', 'actor_id' => $user->id]);
        Mail::assertSentCount(1);

        $this->postJson('/api/v1/auth/password/forgot', ['email' => 'unknown@kyu.ac.ug'])
            ->assertOk()->assertJsonMissingPath('data.development_url');
        Mail::assertSentCount(1);
    }

    public function test_password_reset_unlocks_account_revokes_sessions_and_consumes_token(): void
    {
        $user = User::factory()->create([
            'status' => UserStatus::LOCKED,
            'password' => 'Old-Password-2026!',
            'failed_login_attempts' => 5,
            'locked_until' => now()->addMinutes(15),
        ]);
        $user->createToken('existing-session');
        $token = Password::broker()->createToken($user);

        $payload = [
            'email' => $user->email,
            'token' => $token,
            'password' => 'New-Password-2026!',
            'password_confirmation' => 'New-Password-2026!',
        ];
        $this->postJson('/api/v1/auth/password/reset', $payload)
            ->assertOk()->assertJsonPath('data.reset', true);

        $user->refresh();
        $this->assertSame(UserStatus::ACTIVE, $user->status);
        $this->assertTrue(Hash::check('New-Password-2026!', $user->password));
        $this->assertSame(0, $user->failed_login_attempts);
        $this->assertNull($user->locked_until);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
        $this->assertDatabaseHas('audit_events', ['action' => 'auth.password_reset_completed', 'actor_id' => $user->id]);

        $this->postJson('/api/v1/auth/password/reset', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('token');
    }

    public function test_user_can_update_only_their_personal_profile_photo_and_password(): void
    {
        Storage::fake('local');
        $user = User::factory()->create(['password' => 'Current-Password!']);

        $response = $this->actingAs($user, 'sanctum')->post('/api/v1/auth/profile', [
            'title' => 'Dr.', 'first_name' => 'Updated', 'last_name' => 'Person',
            'photo' => UploadedFile::fake()->createWithContent(
                'avatar.png',
                base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
            ),
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.name', 'Dr. Updated Person')
            ->assertJsonPath('data.email', $user->email)
            ->assertJsonPath('data.has_profile_photo', true);

        $path = 'profile-photos/'.$user->id.'.png';
        Storage::disk('local')->assertExists($path);
        $this->actingAs($user, 'sanctum')->get('/api/v1/auth/profile-photo')->assertOk();
        $this->actingAs($user, 'sanctum')->putJson('/api/v1/auth/password', [
            'current_password' => 'Current-Password!',
            'password' => 'New-Personal-Password!2',
            'password_confirmation' => 'New-Personal-Password!2',
        ])->assertOk()->assertJsonPath('data.changed', true);
        $this->assertTrue(Hash::check('New-Personal-Password!2', $user->fresh()->password));
        $this->assertDatabaseHas('audit_events', ['action' => 'profile.updated', 'actor_id' => $user->id]);
        $this->assertDatabaseHas('audit_events', ['action' => 'profile.password_changed', 'actor_id' => $user->id]);
        $this->assertNotEmpty($response->json('data.profile_updated_at'));
    }
}
