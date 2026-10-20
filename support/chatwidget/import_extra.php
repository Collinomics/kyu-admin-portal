<?php
/**
 * ============================================================================
 *  import_extra.php — SEEDS GENERAL UNIVERSITY INFO INTO THE CLOUD
 * ============================================================================
 *  The catalogue covers programmes; this adds everything else applicants
 *  ask about that isn't programme-specific — how to apply, admission
 *  lists, contacts, etc. Entries live in kyu_extra_info.json (edit that
 *  file and re-run this script to update the assistant's knowledge).
 *
 *  Same mechanism as import_supabase.php: chunk + embed + upsert by
 *  deterministic id, so re-runs only refresh what changed.
 *
 *  Run:  SUPA_URL=... SUPA_KEY=... NVIDIA_API_KEY=... php import_extra.php
 * ============================================================================
 */

declare(strict_types=1);

set_time_limit(0);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db_rest.php';
require_once __DIR__ . '/chunklib.php';

$json = file_get_contents(__DIR__ . '/kyu_extra_info.json');
$entries = json_decode($json, true);
if (!is_array($entries)) {
    fwrite(STDERR, "kyu_extra_info.json missing or invalid\n");
    exit(1);
}

$done = 0;
$failed = 0;

foreach ($entries as $entry) {
    foreach (chunk_programme($entry) as $i => $chunk) {
        $vector = nvidia_embed_text($chunk['text']);
        if (empty($vector)) {
            $failed++;
            fwrite(STDERR, "embed failed: {$entry['id']} chunk $i\n");
            continue;
        }
        supa_request('POST', '/rest/v1/programme_chunks', [
            'id'             => hash_point_id($entry['id'], $i),
            'programme_id'   => $entry['id'],
            'programme_name' => $entry['name'],
            'level'          => programme_level($entry),
            'section'        => $chunk['section'],
            'chunk_text'     => $chunk['text'],
            'embedding'      => to_pgvector($vector),
            'published'      => true,
        ], 'resolution=merge-duplicates');
        $done++;
    }
}

echo "Done: {$done} extra-info chunks sent, {$failed} failed.\n";
