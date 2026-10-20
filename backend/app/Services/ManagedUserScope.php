<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class ManagedUserScope
{
    public function query(User $actor): Builder
    {
        if ($actor->role === UserRole::SYSADMIN) {
            return User::query();
        }

        $facultyIds = $actor->assignments()->effective()->pluck('faculty_id')->filter()->unique()->values();

        return match ($actor->role) {
            UserRole::REGISTRAR => User::query()->where('role', UserRole::ADMISSIONS_OFFICER->value),
            UserRole::DEAN => User::query()
                ->where('role', UserRole::HOD->value)
                ->whereHas('assignments', fn (Builder $query) => $query->whereIn('faculty_id', $facultyIds)),
            UserRole::HOD => User::query()
                ->where('role', UserRole::COORDINATOR->value)
                ->whereHas('assignments', fn (Builder $query) => $query->whereIn('faculty_id', $facultyIds)),
            default => User::query()->whereRaw('1 = 0'),
        };
    }

    public function contains(User $actor, User $target): bool
    {
        return $this->query($actor)->whereKey($target->id)->exists();
    }
}
