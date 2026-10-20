<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('programmes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('source_ref', 160)->nullable()->unique();
            $table->string('code', 40)->unique();
            $table->string('name');
            $table->string('category', 32)->index();
            $table->foreignUuid('faculty_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignUuid('department_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignUuid('coordinator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 32)->default('draft')->index();
            $table->unsignedInteger('version')->default(1);
            $table->text('overview')->nullable();
            $table->text('objective_impact')->nullable();
            $table->text('philosophy_originality')->nullable();
            $table->text('career_prospects')->nullable();
            $table->text('admission_requirements')->nullable();
            $table->text('structure_content')->nullable();
            $table->text('rejection_comment')->nullable();
            $table->timestamp('published_at')->nullable()->index();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('programme_versions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('programme_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->json('snapshot');
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['programme_id', 'version']);
        });

        Schema::create('programme_reviews', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('programme_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('programme_version');
            $table->string('action', 32)->index();
            $table->foreignUuid('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('comment')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });

        Schema::create('affiliated_institutions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('source_ref', 160)->unique();
            $table->string('name');
            $table->text('overview')->nullable();
            $table->string('institution_type', 60)->nullable();
            $table->string('location', 120)->nullable();
            $table->string('affiliation_status', 80)->nullable();
            $table->text('offerings')->nullable();
            $table->boolean('is_published')->default(false)->index();
            $table->unsignedInteger('version')->default(1);
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
        });

        Schema::table('user_assignments', function (Blueprint $table) {
            $table->foreign('programme_id')->references('id')->on('programmes')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('user_assignments', function (Blueprint $table) {
            $table->dropForeign(['programme_id']);
        });
        Schema::dropIfExists('affiliated_institutions');
        Schema::dropIfExists('programme_reviews');
        Schema::dropIfExists('programme_versions');
        Schema::dropIfExists('programmes');
    }
};
