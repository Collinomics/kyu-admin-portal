<?php

namespace App\Console\Commands;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class VerifyBootstrapAdmin extends Command
{
    protected $signature = 'pcs:verify-bootstrap-admin';

    protected $description = 'Verify the configured bootstrap administrator without exposing credentials';

    public function handle(): int
    {
        $email = strtolower(trim((string) env('PCS_BOOTSTRAP_ADMIN_EMAIL', 'sysadmin@kyu.ac.ug')));
        $password = (string) env('PCS_BOOTSTRAP_ADMIN_PASSWORD');
        $user = User::whereRaw('lower(email) = ?', [$email])->first();
        $valid = $user
            && $user->role === UserRole::SYSADMIN
            && $user->status === UserStatus::ACTIVE
            && Hash::check($password, $user->password);

        if (! $valid) {
            $this->table(['Check', 'Result'], [
                ['Account present', $user ? 'yes' : 'no'],
                ['System Administrator role', $user?->role === UserRole::SYSADMIN ? 'yes' : 'no'],
                ['Active status', $user?->status === UserStatus::ACTIVE ? 'yes' : 'no'],
                ['Configured password matches', $user && Hash::check($password, $user->password) ? 'yes' : 'no'],
            ]);
            $this->error('Bootstrap administrator verification failed.');

            return self::FAILURE;
        }

        $this->info('Bootstrap System Administrator credentials verified.');

        return self::SUCCESS;
    }
}
