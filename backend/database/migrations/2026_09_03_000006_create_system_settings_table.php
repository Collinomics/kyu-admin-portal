<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('system_settings', function (Blueprint $table) {
            $table->string('key', 100)->primary();
            $table->json('value');
            $table->foreignUuid('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        DB::table('system_settings')->insert([
            ['key' => 'closing_soon_days', 'value' => json_encode(7), 'created_at' => now(), 'updated_at' => now()],
            ['key' => 'session_timeout_minutes', 'value' => json_encode(30), 'created_at' => now(), 'updated_at' => now()],
            ['key' => 'max_failed_login_attempts', 'value' => json_encode(5), 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('system_settings');
    }
};
