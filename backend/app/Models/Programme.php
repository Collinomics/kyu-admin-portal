<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Programme extends Model
{
    use HasUuids;

    protected $fillable = [
        'source_ref', 'code', 'name', 'category', 'faculty_id', 'department_id',
        'coordinator_id', 'status', 'version', 'overview', 'objective_impact',
        'philosophy_originality', 'career_prospects', 'admission_requirements',
        'structure_content', 'duration', 'campus', 'study_modes', 'is_featured',
        'display_priority', 'rejection_comment', 'published_at', 'created_by',
        'published_snapshot',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'published_at' => 'datetime',
            'published_snapshot' => 'array',
            'study_modes' => 'array',
            'is_featured' => 'boolean',
            'display_priority' => 'integer',
        ];
    }

    public function scopePubliclyAvailable(Builder $query): Builder
    {
        return $query->where(fn (Builder $query) => $query->where('status', 'published')->orWhereNotNull('published_snapshot'));
    }

    public function publishedValue(string $key): mixed
    {
        return $this->published_snapshot[$key] ?? $this->getAttribute($key);
    }

    public function faculty(): BelongsTo
    {
        return $this->belongsTo(Faculty::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function coordinator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'coordinator_id');
    }

    public function versions(): HasMany
    {
        return $this->hasMany(ProgrammeVersion::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(ProgrammeReview::class);
    }

    public function applicationCalls(): HasMany
    {
        return $this->hasMany(ApplicationCall::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
