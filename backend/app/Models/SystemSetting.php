<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SystemSetting extends Model
{
    public $incrementing = false;

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    protected $fillable = ['key', 'value', 'updated_by'];

    protected function casts(): array
    {
        return ['value' => 'json'];
    }

    public static function integer(string $key, int $default): int
    {
        $value = static::query()->whereKey($key)->value('value');
        if (is_string($value)) {
            $value = json_decode($value, true);
        }

        return is_numeric($value) ? (int) $value : $default;
    }

    public static function decoded(string $key, mixed $default = null): mixed
    {
        $value = static::query()->whereKey($key)->value('value');
        if (is_string($value)) {
            $value = json_decode($value, true);
        }

        return $value ?? $default;
    }

    public static function publicCatalogueDefaults(): array
    {
        return [
            'hero_badge' => 'Official published catalogue',
            'hero_title' => 'Choose a programme.',
            'hero_accent' => 'Build what comes next.',
            'hero_description' => 'Explore verified programmes, entry requirements, career pathways and live application windows—all in one place.',
            'results_per_page' => 12,
            'show_hero_statistics' => true,
            'show_card_descriptions' => true,
            'show_bookmarks' => true,
            'show_application_links' => true,
            'application_portal_url' => 'https://apply.kyu.ac.ug',
            'background_refresh_seconds' => 30,
            'academic_unit_colours' => [],
        ];
    }

    public static function publicCatalogue(): array
    {
        $stored = static::decoded('public_catalogue_configuration', []);
        if (! is_array($stored)) {
            $stored = [];
        }

        return array_replace(static::publicCatalogueDefaults(), $stored);
    }

    public static function integers(array $defaults): array
    {
        $stored = static::query()
            ->whereIn('key', array_keys($defaults))
            ->pluck('value', 'key');

        return collect($defaults)->mapWithKeys(function (int $default, string $key) use ($stored): array {
            $value = $stored->get($key);
            if (is_string($value)) {
                $value = json_decode($value, true);
            }

            return [$key => is_numeric($value) ? (int) $value : $default];
        })->all();
    }
}
