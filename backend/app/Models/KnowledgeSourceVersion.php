<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KnowledgeSourceVersion extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'validation_summary' => 'array',
            'progress' => 'integer',
            'size_bytes' => 'integer',
            'version' => 'integer',
            'reviewed_at' => 'datetime',
            'released_at' => 'datetime',
        ];
    }

    public function source(): BelongsTo
    {
        return $this->belongsTo(KnowledgeSource::class, 'knowledge_source_id');
    }

    public function findings(): HasMany
    {
        return $this->hasMany(KnowledgeSourceFinding::class);
    }

    public function chunks(): HasMany
    {
        return $this->hasMany(KnowledgeSourceChunk::class)->orderBy('sequence');
    }
}
