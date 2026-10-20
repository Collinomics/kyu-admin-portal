<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleMatrixApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_system_administrator_can_read_the_server_enforced_role_matrix(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/role-matrix')
            ->assertOk()
            ->assertJsonPath('data.enforcement', 'server')
            ->assertJsonPath('data.editable', false)
            ->assertJsonCount(6, 'data.roles')
            ->assertJsonPath('data.capabilities.0.roles.sysadmin', 'yes');
    }

    public function test_non_system_administrator_cannot_read_the_role_matrix(): void
    {
        $dean = User::factory()->create(['role' => UserRole::DEAN]);

        $this->actingAs($dean, 'sanctum')->getJson('/api/v1/admin/role-matrix')->assertForbidden();
    }
}
