<?php
/**
 * Call reindex_programme($programmeId) from wherever your existing
 * publish/approve action commits (P1.2/P1.3 - Programme Publication).
 * It only ever re-embeds the one programme that changed.
 *
 * Example, inside your existing publish controller:
 *
 *   $programme->status = 'published';
 *   $programme->save();
 *   require_once __DIR__ . '/sync_publish.php';
 *   reindex_programme($programme->id);
 *
 * A nightly cron hitting reindex_all_published() is a good safety net in
 * case an individual publish event is ever missed.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/chunklib.php'; // chunk_programme, nvidia_embed_text, hash_point_id

function reindex_programme(string $programmeId): void
{
    $programme = fetch_published_programme($programmeId); // your existing DB layer
    if (!$programme) {
        // withdrawn/unpublished - remove any stale vectors for it
        pgvector_delete_by_programme($programmeId);
        return;
    }

    $chunks = chunk_programme($programme);

    // replace-in-place inside one transaction: clear old rows for this
    // programme, insert the fresh ones, so a reader never sees a mix of
    // stale and new chunks for the same programme
    $pdo = db();
    $pdo->beginTransaction();
    try {
        pgvector_delete_by_programme($programmeId);

        $stmt = $pdo->prepare(
            'INSERT INTO programme_chunks
                (id, programme_id, programme_name, section, chunk_text, embedding, published, updated_at)
             VALUES
                (:id, :programme_id, :programme_name, :section, :chunk_text, :embedding::vector, TRUE, now())'
        );

        foreach ($chunks as $i => $chunk) {
            $vector = nvidia_embed_text($chunk['text']);
            if (empty($vector)) continue;

            $stmt->execute([
                ':id' => hash_point_id($programmeId, $i),
                ':programme_id' => $programmeId,
                ':programme_name' => $programme['name'],
                ':section' => $chunk['section'],
                ':chunk_text' => $chunk['text'],
                ':embedding' => to_pgvector($vector),
            ]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        error_log('reindex_programme failed for ' . $programmeId . ': ' . $e->getMessage());
    }
}

function reindex_all_published(): void
{
    foreach (fetch_all_published_programme_ids() as $id) {
        reindex_programme($id);
    }
}

/**
 * Splits a programme profile into small, section-scoped chunks. Keeping
 * sections separate (rather than one giant blob) is what lets retrieval
 * pull just the relevant part - e.g. only "admission requirements" - into
 * the model's context instead of the whole profile.
 *
 * NOTE: chunk_programme(), nvidia_embed_text() and hash_point_id() now live
 * in chunklib.php so both importers (local PDO and cloud REST) can share
 * them. This file keeps only the PDO-specific parts.
 */

function pgvector_delete_by_programme(string $programmeId): void
{
    $stmt = db()->prepare('DELETE FROM programme_chunks WHERE programme_id = :programme_id');
    $stmt->execute([':programme_id' => $programmeId]);
}

/**
 * Replace these two with your actual data-layer calls - left as stubs
 * since they depend on your existing Module 1 (Course Profiling) schema.
 */
function fetch_published_programme(string $programmeId): ?array { /* ... */ return null; }
function fetch_all_published_programme_ids(): array { /* ... */ return []; }
