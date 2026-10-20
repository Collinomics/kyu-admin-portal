<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('knowledge_sources', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title', 160);
            $table->string('source_type', 50)->index();
            $table->text('description')->nullable();
            $table->string('status', 40)->default('quarantined')->index();
            $table->uuid('active_version_id')->nullable()->index();
            $table->foreignUuid('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('knowledge_source_versions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('knowledge_source_id')->constrained('knowledge_sources')->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->string('original_name', 255);
            $table->string('stored_path', 500);
            $table->string('extension', 12);
            $table->string('mime_type', 150);
            $table->unsignedBigInteger('size_bytes');
            $table->char('sha256', 64)->index();
            $table->string('status', 40)->default('quarantined')->index();
            $table->string('scan_status', 40)->default('pending')->index();
            $table->string('extraction_status', 40)->default('pending')->index();
            $table->string('validation_status', 40)->default('pending')->index();
            $table->unsignedTinyInteger('progress')->default(0);
            $table->json('metadata')->nullable();
            $table->json('validation_summary')->nullable();
            $table->foreignUuid('uploaded_by')->constrained('users')->restrictOnDelete();
            $table->foreignUuid('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUuid('released_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->timestamps();
            $table->unique(['knowledge_source_id', 'version']);
        });

        Schema::create('knowledge_source_findings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('knowledge_source_version_id')->constrained('knowledge_source_versions')->cascadeOnDelete();
            $table->string('severity', 20)->index();
            $table->string('code', 100)->index();
            $table->text('message');
            $table->string('location', 255)->nullable();
            $table->json('details')->nullable();
            $table->boolean('blocks_release')->default(false)->index();
            $table->foreignUuid('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->text('resolution_note')->nullable();
            $table->timestamps();
        });

        Schema::create('knowledge_source_chunks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('knowledge_source_version_id')->constrained('knowledge_source_versions')->cascadeOnDelete();
            $table->unsignedInteger('sequence');
            $table->string('section', 255)->nullable();
            $table->longText('content');
            $table->char('content_hash', 64)->index();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->unique(['knowledge_source_version_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('knowledge_source_chunks');
        Schema::dropIfExists('knowledge_source_findings');
        Schema::dropIfExists('knowledge_source_versions');
        Schema::dropIfExists('knowledge_sources');
    }
};
