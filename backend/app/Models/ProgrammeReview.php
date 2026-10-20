<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProgrammeReview extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = ['programme_id', 'programme_version', 'action', 'actor_id', 'comment', 'created_at'];

    protected function casts(): array
    {
        return ['programme_version' => 'integer', 'created_at' => 'datetime'];
    }

    public function programme(): BelongsTo
    {
        return $this->belongsTo(Programme::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
