<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApplicationCall extends Model
{
    use HasUuids;

    protected $fillable = [
        'programme_id', 'intake', 'opening_date', 'deadline', 'requirements', 'status',
        'closed_reason', 'published_at', 'closed_at', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'opening_date' => 'date',
            'deadline' => 'date',
            'published_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function programme(): BelongsTo
    {
        return $this->belongsTo(Programme::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(UserAssignment::class);
    }
}
