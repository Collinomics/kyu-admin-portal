<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('application_calls', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('programme_id')->constrained()->restrictOnDelete();
            $table->string('intake');
            $table->date('opening_date');
            $table->date('deadline')->index();
            $table->text('requirements')->nullable();
            $table->string('status', 20)->default('draft')->index();
            $table->text('closed_reason')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['programme_id', 'intake']);
        });

        Schema::table('user_assignments', function (Blueprint $table) {
            $table->foreign('application_call_id')->references('id')->on('application_calls')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('user_assignments', function (Blueprint $table) {
            $table->dropForeign(['application_call_id']);
        });
        Schema::dropIfExists('application_calls');
    }
};
