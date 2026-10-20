<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 100)->index();
            $table->string('target_type', 100)->nullable();
            $table->uuid('target_id')->nullable();
            $table->json('before_state')->nullable();
            $table->json('after_state')->nullable();
            $table->json('metadata')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->uuid('request_id')->nullable()->index();
            $table->timestamp('created_at')->useCurrent()->index();
            $table->index(['target_type', 'target_id']);
        });

        Schema::create('integration_outbox', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('event_type', 100)->index();
            $table->uuid('aggregate_id')->index();
            $table->unsignedInteger('aggregate_version');
            $table->json('payload');
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('available_at')->useCurrent()->index();
            $table->timestamp('processed_at')->nullable()->index();
            $table->text('last_error')->nullable();
            $table->timestamps();
            $table->unique(['event_type', 'aggregate_id', 'aggregate_version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('integration_outbox');
        Schema::dropIfExists('audit_events');
    }
};
