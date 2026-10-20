<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('user_assignments')
            ->whereNotNull('programme_id')
            ->orderBy('id')
            ->each(function (object $assignment): void {
                $programme = DB::table('programmes')->where('id', $assignment->programme_id)->first(['faculty_id', 'department_id']);
                if (! $programme) {
                    return;
                }

                DB::table('user_assignments')->where('id', $assignment->id)->update([
                    'faculty_id' => $assignment->faculty_id ?: $programme->faculty_id,
                    'department_id' => $assignment->department_id ?: $programme->department_id,
                ]);
            });

        DB::table('user_assignments')
            ->whereNotNull('application_call_id')
            ->orderBy('id')
            ->each(function (object $assignment): void {
                $call = DB::table('application_calls')->where('id', $assignment->application_call_id)->first(['programme_id']);
                $programme = $call ? DB::table('programmes')->where('id', $call->programme_id)->first(['id', 'faculty_id', 'department_id']) : null;
                if (! $programme) {
                    return;
                }

                DB::table('user_assignments')->where('id', $assignment->id)->update([
                    'programme_id' => $assignment->programme_id ?: $programme->id,
                    'faculty_id' => $assignment->faculty_id ?: $programme->faculty_id,
                    'department_id' => $assignment->department_id ?: $programme->department_id,
                ]);
            });
    }

    public function down(): void
    {
        // Canonical scope values are valid data and must not be discarded on rollback.
    }
};
