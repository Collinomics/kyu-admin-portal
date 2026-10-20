<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KnowledgeSourceChunk extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['metadata' => 'array', 'sequence' => 'integer'];
    }

    public function version(): BelongsTo
    {
        return $this->belongsTo(KnowledgeSourceVersion::class, 'knowledge_source_version_id');
    }
}
