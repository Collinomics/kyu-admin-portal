<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('programmes', function (Blueprint $table) {
            $table->string('duration', 60)->nullable();
            $table->string('campus', 120)->nullable();
            $table->json('study_modes')->nullable();
            $table->boolean('is_featured')->default(false)->index();
            $table->unsignedInteger('display_priority')->default(0)->index();
        });
    }

    public function down(): void
    {
        Schema::table('programmes', function (Blueprint $table) {
            $table->dropColumn(['duration', 'campus', 'study_modes', 'is_featured', 'display_priority']);
        });
    }
};
