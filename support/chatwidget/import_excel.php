<?php
/**
 * ============================================================================
 *  import_excel.php — LOADS THE REAL KYAMBOGO CATALOGUE
 * ============================================================================
 *  Reads programmes_export.json (produced by export_excel.py from the three
 *  Excel files), chunks each programme, embeds every chunk via NVIDIA and
 *  inserts into programme_chunks.
 *
 *  - Replaces the 3 demo programmes from seed_demo.php with the real data.
 *  - Safe to re-run: deterministic ids + ON CONFLICT DO NOTHING, so an
 *    interrupted run only continues with what's still missing.
 *
 *  Run:  php import_excel.php     (needs PGPORT/PGPASSWORD/NVIDIA_API_KEY env)
 * ============================================================================
 */

declare(strict_types=1);

set_time_limit(0); // a full import embeds hundreds of chunks - no script limit

require_once __DIR__ . '/sync_publish.php'; // brings config.php, db.php and the chunk/embed helpers

$json = file_get_contents(__DIR__ . '/programmes_export.json');
$programmes = json_decode($json, true);
if (!is_array($programmes)) {
    fwrite(STDERR, "programmes_export.json missing or invalid - run export_excel.py first\n");
    exit(1);
}

$pdo = db();

// the demo data served its purpose - the real catalogue replaces it
$pdo->exec("DELETE FROM programme_chunks WHERE programme_id IN
    ('bsc-computer-science', 'bsc-software-engineering', 'bsc-information-technology')");

$stmt = $pdo->prepare(
    'INSERT INTO programme_chunks
        (id, programme_id, programme_name, section, chunk_text, embedding, published, updated_at)
     VALUES
        (:id, :programme_id, :programme_name, :section, :chunk_text, :embedding::vector, TRUE, now())
     ON CONFLICT (id) DO NOTHING'
);

$totalChunks = 0;
foreach ($programmes as $p) {
    $totalChunks += count(chunk_programme($p));
}
echo count($programmes) . " programmes, ~{$totalChunks} chunks to embed\n";

$done = 0;
$inserted = 0;
$failed = 0;

foreach ($programmes as $p) {
    $chunks = chunk_programme($p);
    foreach ($chunks as $i => $chunk) {
        $vector = nvidia_embed_text($chunk['text']);
        if (empty($vector)) {
            $failed++;
            fwrite(STDERR, "embed failed: {$p['id']} chunk $i\n");
            continue;
        }
        $stmt->execute([
            ':id' => hash_point_id($p['id'], $i),
            ':programme_id' => $p['id'],
            ':programme_name' => $p['name'],
            ':section' => $chunk['section'],
            ':chunk_text' => $chunk['text'],
            ':embedding' => to_pgvector($vector),
        ]);
        $inserted += $stmt->rowCount();
        $done++;
        if ($done % 20 === 0) {
            echo "  {$done}/{$totalChunks} chunks done\n";
        }
    }
}

echo "Done: {$inserted} new chunks inserted, {$failed} failed.\n";
