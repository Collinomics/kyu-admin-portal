<?php
/**
 * ============================================================================
 *  import_supabase.php — LOADS THE REAL KYAMBOGO CATALOGUE INTO THE CLOUD
 * ============================================================================
 *  Reads programmes_export.json (produced by export_excel.py from the three
 *  Excel files), chunks each programme, embeds every chunk via NVIDIA and
 *  inserts into the Supabase database over HTTPS REST (db_rest.php).
 *
 *  Resumable: deterministic chunk ids + merge-duplicates upsert, so an
 *  interrupted run only continues with what's still missing.
 *
 *  Run:  SUPA_URL=... SUPA_KEY=... NVIDIA_API_KEY=... php import_supabase.php
 * ============================================================================
 */

declare(strict_types=1);

set_time_limit(0); // a full import embeds hundreds of chunks - no script limit

require_once __DIR__ . '/config.php';   // NVIDIA creds + models
require_once __DIR__ . '/db_rest.php';  // supa_request() + to_pgvector()
require_once __DIR__ . '/chunklib.php'; // chunk_programme, nvidia_embed_text, hash_point_id

$json = file_get_contents(__DIR__ . '/programmes_export.json');
$programmes = json_decode($json, true);
if (!is_array($programmes)) {
    fwrite(STDERR, "programmes_export.json missing or invalid - run export_excel.py first\n");
    exit(1);
}

$totalChunks = 0;
foreach ($programmes as $p) {
    $totalChunks += count(chunk_programme($p));
}
echo count($programmes) . " programmes, ~{$totalChunks} chunks to embed\n";

$done = 0;
$failed = 0;

foreach ($programmes as $p) {
    foreach (chunk_programme($p) as $i => $chunk) {
        $vector = nvidia_embed_text($chunk['text']);
        if (empty($vector)) {
            $failed++;
            fwrite(STDERR, "embed failed: {$p['id']} chunk $i\n");
            continue;
        }
        supa_request('POST', '/rest/v1/programme_chunks', [
            'id'             => hash_point_id($p['id'], $i),
            'programme_id'   => $p['id'],
            'programme_name' => $p['name'],
            'level'          => programme_level($p),
            'section'        => $chunk['section'],
            'chunk_text'     => $chunk['text'],
            'embedding'      => to_pgvector($vector), // '[0.1,0.2,...]' string
            'published'      => true,
        ], 'resolution=merge-duplicates');
        $done++;
        if ($done % 20 === 0) {
            echo "  {$done}/{$totalChunks} chunks done\n";
        }
    }
}

echo "Done: {$done} chunks sent, {$failed} failed.\n";
