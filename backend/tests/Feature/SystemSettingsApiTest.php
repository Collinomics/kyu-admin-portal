<?php

namespace Tests\Feature;

use App\Contracts\ManagedSecretStore;
use App\Enums\UserRole;
use App\Models\Faculty;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SystemSettingsApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_system_administrator_can_update_shared_runtime_settings_with_password_confirmation(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);
        $faculty = Faculty::create(['code' => 'SCI', 'name' => 'Faculty of Science', 'is_active' => true]);

        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/system-settings', [
            'closing_soon_days' => 12,
            'session_timeout_minutes' => 45,
            'background_refresh_enabled' => true,
            'operational_refresh_seconds' => 10,
            'admin_refresh_seconds' => 15,
            'current_password' => 'wrong-password',
        ])->assertUnprocessable();

        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/system-settings', [
            'closing_soon_days' => 12,
            'session_timeout_minutes' => 45,
            'background_refresh_enabled' => false,
            'operational_refresh_seconds' => 20,
            'admin_refresh_seconds' => 25,
            'public_catalogue' => [
                'hero_badge' => 'Official KYU catalogue',
                'hero_title' => 'Find your programme.',
                'hero_accent' => 'Shape your future.',
                'hero_description' => 'Explore verified opportunities at Kyambogo University.',
                'results_per_page' => 9,
                'show_hero_statistics' => true,
                'show_card_descriptions' => false,
                'show_bookmarks' => true,
                'show_application_links' => true,
                'application_portal_url' => 'https://apply.kyu.ac.ug',
                'background_refresh_seconds' => 30,
                'academic_unit_colours' => [$faculty->id => '#147A55'],
            ],
            'current_password' => 'Admin-Password-2026!',
        ])->assertOk()
            ->assertJsonPath('data.closing_soon_days', 12)
            ->assertJsonPath('data.session_timeout_minutes', 45)
            ->assertJsonPath('data.background_refresh_enabled', false)
            ->assertJsonPath('data.operational_refresh_seconds', 20)
            ->assertJsonPath('data.admin_refresh_seconds', 25)
            ->assertJsonPath('data.public_catalogue.results_per_page', 9)
            ->assertJsonPath('data.public_catalogue.background_refresh_seconds', 30)
            ->assertJsonPath('data.public_catalogue.show_card_descriptions', false)
            ->assertJsonPath("data.public_catalogue.academic_unit_colours.{$faculty->id}", '#147A55');

        $this->assertDatabaseHas('audit_events', ['action' => 'system.settings_updated']);
    }


    public function test_catalogue_settings_reject_unsafe_links_and_invalid_colours(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);

        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/system-settings', [
            'closing_soon_days' => 7,
            'session_timeout_minutes' => 30,
            'public_catalogue' => array_replace(\App\Models\SystemSetting::publicCatalogueDefaults(), [
                'application_portal_url' => 'javascript:alert(1)',
                'academic_unit_colours' => ['unknown' => 'red'],
            ]),
            'current_password' => 'Admin-Password-2026!',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors([
                'public_catalogue.application_portal_url',
                'public_catalogue.academic_unit_colours.unknown',
            ]);
    }

    public function test_admin_refresh_intervals_allow_three_seconds_but_reject_lower_values(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);

        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/system-settings', [
            'closing_soon_days' => 7,
            'session_timeout_minutes' => 30,
            'operational_refresh_seconds' => 3,
            'admin_refresh_seconds' => 3,
            'current_password' => 'Admin-Password-2026!',
        ])->assertOk()
            ->assertJsonPath('data.operational_refresh_seconds', 3)
            ->assertJsonPath('data.admin_refresh_seconds', 3);

        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/system-settings', [
            'closing_soon_days' => 7,
            'session_timeout_minutes' => 30,
            'operational_refresh_seconds' => 2,
            'admin_refresh_seconds' => 2,
            'current_password' => 'Admin-Password-2026!',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['operational_refresh_seconds', 'admin_refresh_seconds']);
    }

    public function test_catalogue_defaults_can_be_restored_with_an_empty_academic_unit_colour_map(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);

        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/system-settings', [
            'closing_soon_days' => 7,
            'session_timeout_minutes' => 30,
            'public_catalogue' => \App\Models\SystemSetting::publicCatalogueDefaults(),
            'current_password' => 'Admin-Password-2026!',
        ])->assertOk()
            ->assertJsonPath('data.public_catalogue.academic_unit_colours', []);
    }

    public function test_all_authenticated_roles_can_read_runtime_policy_but_not_admin_settings(): void
    {
        $coordinator = User::factory()->create(['role' => UserRole::COORDINATOR]);

        $this->actingAs($coordinator, 'sanctum')->getJson('/api/v1/system-settings/runtime')
            ->assertOk()->assertJsonPath('data.session_timeout_minutes', 30)
            ->assertJsonPath('data.background_refresh_enabled', true)
            ->assertJsonPath('data.operational_refresh_seconds', 10)
            ->assertJsonPath('data.admin_refresh_seconds', 15);
        $this->actingAs($coordinator, 'sanctum')->getJson('/api/v1/admin/system-settings')->assertForbidden();
        $this->actingAs($coordinator, 'sanctum')->getJson('/api/v1/admin/system-settings/secrets')->assertForbidden();
    }

    public function test_system_administrator_can_replace_an_approved_write_only_credential(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);
        $fake = new class implements ManagedSecretStore
        {
            public ?string $received = null;

            public function statuses(): array
            {
                return [[
                    'key' => 'nvidia_api_key', 'label' => 'NVIDIA AI API key',
                    'description' => 'AI access', 'provider' => 'AWS Secrets Manager',
                    'configured' => true, 'available' => true, 'state' => 'ready',
                    'last_changed_at' => '2026-09-07T12:00:00+03:00',
                ]];
            }

            public function get(string $key): ?string
            {
                return null;
            }

            public function replace(string $key, string $value): array
            {
                $this->received = $value;

                return ['key' => $key, 'changed_at' => '2026-09-07T12:00:00+03:00'];
            }
        };
        $this->app->instance(ManagedSecretStore::class, $fake);
        $secret = 'nvapi-test-value-that-must-never-be-returned-or-audited';

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/system-settings/secrets')
            ->assertOk()
            ->assertJsonMissing([$secret]);

        $this->actingAs($admin, 'sanctum')->putJson('/api/v1/admin/system-settings/secrets/nvidia_api_key', [
            'value' => $secret,
            'change_reason' => 'Scheduled integration key rotation',
            'current_password' => 'Admin-Password-2026!',
        ])->assertOk()
            ->assertJsonPath('data.key', 'nvidia_api_key')
            ->assertJsonMissing([$secret]);

        $this->assertSame($secret, $fake->received);
        $event = \App\Models\AuditEvent::query()->where('action', 'system.credential_rotated')->firstOrFail();
        $this->assertStringNotContainsString($secret, $event->toJson());
        $this->assertSame('nvidia_api_key', $event->metadata['credential_key']);
    }

    public function test_credential_replacement_requires_the_current_password_and_an_allowlisted_key(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);
        $fake = $this->createMock(ManagedSecretStore::class);
        $fake->expects($this->never())->method('replace');
        $this->app->instance(ManagedSecretStore::class, $fake);

        $payload = [
            'value' => 'nvapi-test-value-that-is-long-enough',
            'change_reason' => 'Scheduled key rotation',
            'current_password' => 'incorrect-password',
        ];
        $this->actingAs($admin, 'sanctum')->putJson('/api/v1/admin/system-settings/secrets/nvidia_api_key', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->actingAs($admin, 'sanctum')->putJson('/api/v1/admin/system-settings/secrets/database_password', $payload)
            ->assertNotFound();
    }
}
