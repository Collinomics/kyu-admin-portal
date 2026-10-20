<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call(OrganisationSeeder::class);

        $password = env('PCS_BOOTSTRAP_ADMIN_PASSWORD');
        if (! is_string($password) || strlen($password) < 12) {
            throw new \RuntimeException('Set PCS_BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters) before seeding.');
        }

        $user = User::firstOrCreate(
            ['email' => strtolower(trim((string) env('PCS_BOOTSTRAP_ADMIN_EMAIL', 'sysadmin@kyu.ac.ug')))],
            [
                'title' => 'Mr',
                'first_name' => 'System',
                'last_name' => 'Administrator',
                'role' => UserRole::SYSADMIN,
                'status' => UserStatus::ACTIVE,
                'staff_status' => 'permanent',
                'email_verified_at' => now(),
                'password' => $password,
                'must_change_password' => false,
                'password_changed_at' => now(),
            ]
        );

        // Repair an account created by the earlier bootstrap seeder, which
        // inherited the table's pending default. Never alter an unrelated or
        // differently-passworded existing account.
        if (! $user->wasRecentlyCreated
            && $user->role === UserRole::SYSADMIN
            && $user->status === UserStatus::PENDING
            && Hash::check($password, $user->password)) {
            $user->forceFill([
                'status' => UserStatus::ACTIVE,
                'staff_status' => $user->staff_status ?: 'permanent',
                'email_verified_at' => $user->email_verified_at ?: now(),
                'must_change_password' => false,
                'password_changed_at' => $user->password_changed_at ?: now(),
            ])->save();
        }
    }
}
