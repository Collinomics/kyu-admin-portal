<?php

namespace App\Support;

final class CatalogueAcademicUnitResolver
{
    public const DISTANCE_EDUCATION_UNIT = 'Institute of Distance Education, E-Learning & Learning Centres';

    private const ALIASES = [
        'faculty of special needs and rehabilitation' => 'Faculty of Special Needs & Rehabilitation',
        'school of management and entrepreneurship' => 'School of Management & Entrepreneurship',
        'bushenyi learning center' => self::DISTANCE_EDUCATION_UNIT,
        'soroti learning center' => self::DISTANCE_EDUCATION_UNIT,
        'external learning center' => self::DISTANCE_EDUCATION_UNIT,
    ];

    public static function providerFromOverview(?string $overview): ?string
    {
        if (! preg_match('/offered by the (.+?)(?:\s+\(|\s+with fees|\.\s*$)/iu', trim((string) $overview), $matches)) {
            return null;
        }

        return trim($matches[1]);
    }

    public static function canonicalNameFromOverview(?string $overview): ?string
    {
        $provider = self::providerFromOverview($overview);
        if ($provider === null) {
            return null;
        }

        return self::ALIASES[mb_strtolower($provider)] ?? $provider;
    }
}
