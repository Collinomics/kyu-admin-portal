<?php

namespace App\Models;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserAssignment extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'role' => UserRole::class,
            'starts_on' => 'date',
            'ends_on' => 'date',
            'permissions' => 'array',
            'prior_review' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function scopeEffective(Builder $query): Builder
    {
        $today = now()->toDateString();

        return $query->where('is_active', true)
            ->where(fn (Builder $query) => $query->whereNull('starts_on')->orWhereDate('starts_on', '<=', $today))
            ->where(fn (Builder $query) => $query->whereNull('ends_on')->orWhereDate('ends_on', '>=', $today));
    }

    public function scopeAllocated(Builder $query): Builder
    {
        return $query->effective()
            ->whereHas('user', fn (Builder $user) => $user->where('status', '!=', UserStatus::INACTIVE->value));
    }

    public function isEffective(): bool
    {
        $today = now()->startOfDay();

        return $this->is_active
            && (! $this->starts_on || $this->starts_on->startOfDay()->lte($today))
            && (! $this->ends_on || $this->ends_on->startOfDay()->gte($today));
    }

    public function faculty(): BelongsTo
    {
        return $this->belongsTo(Faculty::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function programme(): BelongsTo
    {
        return $this->belongsTo(Programme::class);
    }

    public function applicationCall(): BelongsTo
    {
        return $this->belongsTo(ApplicationCall::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
