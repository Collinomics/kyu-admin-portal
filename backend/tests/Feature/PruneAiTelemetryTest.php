<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class PruneAiTelemetryTest extends TestCase
{
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
        Schema::connection('pgsql_ai')->create('monitor_events', function (Blueprint $table): void {
            $table->id();
            $table->timestamp('ts');
            $table->string('ip_address')->nullable();
        });
    }

    public function test_it_removes_expired_events_and_erases_ip_addresses_from_retained_events(): void
    {
        DB::connection('pgsql_ai')->table('monitor_events')->insert([
            ['ts' => now()->subDays(100), 'ip_address' => '203.0.113.10'],
            ['ts' => now()->subDay(), 'ip_address' => '203.0.113.11'],
        ]);

        $this->artisan('pcs:prune-ai-telemetry', ['--days' => 90])
            ->expectsOutputToContain('1 expired event(s) removed')
            ->assertSuccessful();

        $this->assertDatabaseCount('monitor_events', 1, 'pgsql_ai');
        $this->assertDatabaseHas('monitor_events', ['ip_address' => null], 'pgsql_ai');
    }
}
