<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProgrammeVersion extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = ['programme_id', 'version', 'snapshot', 'created_by', 'created_at'];

    protected function casts(): array
    {
        return ['snapshot' => 'array', 'created_at' => 'datetime'];
    }

    public function programme(): BelongsTo
    {
        return $this->belongsTo(Programme::class);
    }
}
