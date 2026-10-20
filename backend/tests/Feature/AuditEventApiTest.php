<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditEventApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_system_administrator_can_filter_the_paginated_audit_trail(): void
    {
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        AuditEvent::create(['actor_id' => $admin->id, 'action' => 'programme.published', 'ip_address' => '127.0.0.1', 'created_at' => now()]);
        AuditEvent::create(['actor_id' => $admin->id, 'action' => 'auth.login_failed', 'ip_address' => '127.0.0.1', 'created_at' => now()]);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/audit-events?category=security&outcome=blocked&range=7d&per_page=10')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.action', 'auth.login_failed')
            ->assertJsonPath('data.0.category', 'security')
            ->assertJsonPath('data.0.outcome', 'blocked')
            ->assertJsonPath('meta.stats.recorded', 2)
            ->assertJsonPath('meta.stats.blocked', 1);
    }

    public function test_non_administrator_cannot_read_the_system_audit_trail(): void
    {
        $coordinator = User::factory()->create(['role' => UserRole::COORDINATOR]);

        $this->actingAs($coordinator, 'sanctum')->getJson('/api/v1/admin/audit-events')->assertForbidden();
    }
}
