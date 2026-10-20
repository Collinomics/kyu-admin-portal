<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('faculties', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code', 30)->unique();
            $table->string('name')->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('departments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('faculty_id')->constrained()->restrictOnDelete();
            $table->string('code', 30);
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['faculty_id', 'code']);
            $table->unique(['faculty_id', 'name']);
        });

        Schema::create('user_assignments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('role', 32);
            $table->foreignUuid('faculty_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignUuid('department_id')->nullable()->constrained()->restrictOnDelete();
            $table->uuid('programme_id')->nullable()->index();
            $table->uuid('application_call_id')->nullable()->index();
            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable()->index();
            $table->text('instructions')->nullable();
            $table->boolean('prior_review')->default(false);
            $table->json('permissions')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->foreignUuid('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['user_id', 'role', 'is_active']);
        });

        Schema::create('onboarding_challenges', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('otp_hash');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('expires_at')->index();
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('onboarding_challenges');
        Schema::dropIfExists('user_assignments');
        Schema::dropIfExists('departments');
        Schema::dropIfExists('faculties');
    }
};
