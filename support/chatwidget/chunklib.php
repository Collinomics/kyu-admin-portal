<?php
/**
 * ============================================================================
 *  chunklib.php — CHUNKING + EMBEDDING HELPERS (NO DATABASE DEPENDENCY)
 * ============================================================================
 *  Shared by every importer regardless of where the data lands:
 *  the local PDO importer (import_excel.php -> db.php) and the cloud
 *  importer (import_supabase.php -> db_rest.php). Needs config.php loaded
 *  first (for NVIDIA_API_KEY / NVIDIA_BASE_URL / NVIDIA_EMBED_MODEL).
 * ============================================================================
 */

declare(strict_types=1);

/**
 * Splits a programme profile into small, section-scoped chunks. Keeping
 * sections separate (rather than one giant blob) is what lets retrieval
 * pull just the relevant part - e.g. only "admission requirements" - into
 * the model's context instead of the whole profile.
 */
function chunk_programme(array $programme): array
{
    $sections = [
        'overview' => $programme['overview'] ?? '',
        'structure' => $programme['structure'] ?? '',
        'admission_requirements' => $programme['admission_requirements'] ?? '',
        'career_prospects' => $programme['career_prospects'] ?? '',
    ];

    $chunks = [];
    foreach ($sections as $section => $text) {
        $text = trim(strip_tags((string) $text));
        if ($text === '') continue;
        // simple paragraph-level split; swap for a token-aware chunker if
        // any section regularly exceeds ~500 words
        foreach (preg_split('/\n{2,}/', $text) as $para) {
            $para = trim($para);
            if ($para !== '') {
                $chunks[] = ['section' => $section, 'text' => $para];
            }
        }
    }
    return $chunks;
}

/**
 * Embeds one chunk of stored text via NVIDIA. input_type 'passage' marks it
 * as catalogue content (as opposed to 'query' for user questions).
 */
function nvidia_embed_text(string $text): array
{
    $ch = curl_init(NVIDIA_BASE_URL . '/v1/embeddings');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . NVIDIA_API_KEY,
        ],
        CURLOPT_POSTFIELDS => json_encode([
            'model' => NVIDIA_EMBED_MODEL,
            'input' => [$text],
            'input_type' => 'passage',
        ]),
        CURLOPT_TIMEOUT => 20,
    ]);
    $raw = curl_exec($ch);
    $resp = json_decode($raw ?: '', true);
    return $resp['data'][0]['embedding'] ?? [];
}

// Deterministic row id so re-running a sync for the same programme/chunk
// index overwrites cleanly rather than accumulating duplicates.
function hash_point_id(string $programmeId, int $chunkIndex): string
{
    return substr(md5($programmeId . ':' . $chunkIndex), 0, 32);
}
