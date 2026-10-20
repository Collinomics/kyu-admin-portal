<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AiMonitorSettingsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('database.connections.pgsql_ai', [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
            'foreign_key_constraints' => true,
        ]);
        DB::purge('pgsql_ai');

        Schema::connection('pgsql_ai')->create('monitor_settings', function (Blueprint $table): void {
            $table->string('key')->primary();
            $table->text('value');
            $table->timestamp('updated_at')->nullable();
        });
        Schema::connection('pgsql_ai')->create('console_activity', function (Blueprint $table): void {
            $table->id();
            $table->string('actor');
            $table->string('action');
            $table->text('detail')->nullable();
            $table->timestamp('ts');
        });
        Schema::connection('pgsql_ai')->create('monitor_events', function (Blueprint $table): void {
            $table->id();
            $table->timestamp('ts');
        });
    }

    public function test_updating_ai_settings_requires_the_current_password(): void
    {
        $admin = User::factory()->create([
            'role' => UserRole::SYSADMIN,
            'password' => 'Admin-Password-2026!',
        ]);
        $url = '/api/v1/admin/ai-settings?endpoint=put';

        $this->actingAs($admin, 'sanctum')->postJson($url, [
            'key' => 'rate_limit_per_hour',
            'value' => '20',
        ])->assertUnprocessable()->assertJsonValidationErrors('current_password');

        $this->actingAs($admin, 'sanctum')->postJson($url, [
            'key' => 'rate_limit_per_hour',
            'value' => '20',
            'current_password' => 'incorrect-password',
        ])->assertUnprocessable()->assertJsonValidationErrors('current_password');

        $this->actingAs($admin, 'sanctum')->postJson($url, [
            'key' => 'rate_limit_per_hour',
            'value' => '20',
            'current_password' => 'Admin-Password-2026!',
        ])->assertOk()->assertJsonMissing(['value' => '20']);

        $this->assertDatabaseHas('monitor_settings', [
            'key' => 'rate_limit_per_hour',
            'value' => '20',
        ], 'pgsql_ai');
        $this->assertDatabaseHas('console_activity', [
            'actor' => $admin->email,
            'action' => 'settings.update',
        ], 'pgsql_ai');
    }

    public function test_ai_settings_reject_unsafe_or_ineffective_values(): void
    {
        $admin = User::factory()->create([
            'role' => UserRole::SYSADMIN,
            'password' => 'Admin-Password-2026!',
        ]);
        $url = '/api/v1/admin/ai-settings?endpoint=put';

        foreach ([
            ['key' => 'rate_limit_per_hour', 'value' => '500'],
            ['key' => 'accent_color', 'value' => 'javascript:red'],
            ['key' => 'system_prompt', 'value' => 'A prompt without the governed context placeholder'],
            ['key' => 'chat_models', 'value' => "valid/model\n<script>alert(1)</script>"],
            ['key' => 'embed_model', 'value' => 'uncontrolled/model-change'],
        ] as $payload) {
            $this->actingAs($admin, 'sanctum')->postJson($url, $payload + [
                'current_password' => 'Admin-Password-2026!',
            ])->assertUnprocessable();
        }

        $this->assertDatabaseCount('monitor_settings', 0, 'pgsql_ai');
    }

    public function test_clearing_ai_telemetry_requires_password_confirmation(): void
    {
        $admin = User::factory()->create([
            'role' => UserRole::SYSADMIN,
            'password' => 'Admin-Password-2026!',
        ]);
        DB::connection('pgsql_ai')->table('monitor_events')->insert([
            ['ts' => now()->subDays(120)],
            ['ts' => now()->subDay()],
        ]);
        $url = '/api/v1/admin/ai-settings?endpoint=clear_events';

        $this->actingAs($admin, 'sanctum')->postJson($url, [
            'days' => 90,
            'current_password' => 'wrong-password',
        ])->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->assertDatabaseCount('monitor_events', 2, 'pgsql_ai');

        $this->actingAs($admin, 'sanctum')->postJson($url, [
            'days' => 90,
            'current_password' => 'Admin-Password-2026!',
        ])->assertOk()->assertJsonPath('deleted', 1);

        $this->assertDatabaseCount('monitor_events', 1, 'pgsql_ai');
    }
}
