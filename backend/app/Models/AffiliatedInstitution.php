<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class AffiliatedInstitution extends Model
{
    use HasUuids;

    protected $fillable = [
        'source_ref', 'name', 'overview', 'institution_type', 'location',
        'affiliation_status', 'offerings', 'is_published', 'version', 'published_at',
    ];

    protected function casts(): array
    {
        return ['is_published' => 'boolean', 'version' => 'integer', 'published_at' => 'datetime'];
    }
}
