<?php

namespace App\Console\Commands;

use App\Contracts\ManagedSecretStore;
use Illuminate\Console\Command;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

class ProcessAiOutbox extends Command
{
    private string $apiKey = '';

    protected $signature = 'pcs:process-ai-outbox {--limit=25 : Maximum pending events to process}';

    protected $description = 'Create the restricted AI search index from canonical published catalogue events';

    public function handle(ManagedSecretStore $secrets): int
    {
        $limit = max(1, min((int) $this->option('limit'), 500));
        $events = DB::table('integration_outbox')
            ->whereNull('processed_at')
            ->where('available_at', '<=', now())
            ->whereIn('event_type', [
                'programme.published', 'programme.unpublished',
                'affiliated-institution.published', 'affiliated-institution.unpublished',
                'knowledge-source.published', 'knowledge-source.unpublished',
            ])
            ->orderBy('created_at')
            ->limit($limit)
            ->get();

        if ($events->isEmpty()) {
            $this->info('No pending AI publication events.');

            return self::SUCCESS;
        }

        $requiresEmbeddings = $events->contains(fn ($event) => ! str_ends_with((string) $event->event_type, '.unpublished'));
        if ($requiresEmbeddings) {
            try {
                $this->apiKey = $secrets->get('nvidia_api_key') ?: (string) config('services.nvidia.api_key');
            } catch (Throwable $exception) {
                report($exception);
                $this->error('The secure AI credential store is unavailable. No publication events were changed.');

                return self::FAILURE;
            }
            if ($this->apiKey === '') {
                $this->error('The AI integration credential is not configured. No publication events were changed.');

                return self::FAILURE;
            }
        }

        $processed = 0;
        $failed = 0;
        $bar = $this->output->createProgressBar($events->count());
        $bar->start();

        foreach ($events as $event) {
            try {
                $this->processEvent($event);
                if ($event->event_type === 'knowledge-source.published') {
                    $this->markKnowledgeSourceReleased($event);
                } elseif ($event->event_type === 'knowledge-source.unpublished') {
                    $this->finalizeKnowledgeSourceRemoval($event);
                }
                DB::table('integration_outbox')->where('id', $event->id)->update([
                    'processed_at' => now(), 'last_error' => null, 'updated_at' => now(),
                ]);
                $processed++;
            } catch (Throwable $exception) {
                $attempts = (int) $event->attempts + 1;
                DB::table('integration_outbox')->where('id', $event->id)->update([
                    'attempts' => $attempts,
                    'available_at' => now()->addMinutes(min(60, 2 ** min($attempts, 5))),
                    'last_error' => substr($exception->getMessage(), 0, 2000),
                    'updated_at' => now(),
                ]);
                $failed++;
            }
            $bar->advance();
        }

        $bar->finish();
        $this->newLine();
        $this->info("AI publication batch complete: {$processed} processed, {$failed} failed.");

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }

    private function processEvent(object $event): void
    {
        $payload = is_array($event->payload) ? $event->payload : json_decode((string) $event->payload, true);
        if (! is_array($payload)) {
            throw new RuntimeException('Publication event payload is invalid.');
        }

        if (str_ends_with((string) $event->event_type, '.unpublished')) {
            DB::connection('pgsql_ai')->delete(
                'delete from ai.programme_chunks where programme_id = ?',
                [(string) $event->aggregate_id]
            );

            return;
        }

        $chunks = $this->chunks($event->event_type, $payload);
        $embeddings = $this->embeddings(array_column($chunks, 'text'));
        if (count($embeddings) !== count($chunks)) {
            throw new RuntimeException('Embedding response count does not match the chunk count.');
        }

        DB::connection('pgsql_ai')->transaction(function () use ($event, $payload, $chunks, $embeddings): void {
            DB::connection('pgsql_ai')->delete(
                'delete from ai.programme_chunks where programme_id = ?',
                [(string) $event->aggregate_id]
            );

            foreach ($chunks as $index => $chunk) {
                $embedding = $embeddings[$index];
                if (! is_array($embedding) || count($embedding) !== 2048) {
                    throw new RuntimeException('NVIDIA returned an embedding with an unexpected dimension.');
                }
                DB::connection('pgsql_ai')->insert(<<<'SQL'
                    insert into ai.programme_chunks
                        (id, programme_id, programme_name, level, source_type, source_version,
                         section, chunk_text, embedding, published, updated_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?, cast(? as extensions.vector), true, now())
                    SQL, [
                    hash('sha256', $event->aggregate_id.':'.$index),
                    (string) $event->aggregate_id,
                    (string) ($payload['name'] ?? $payload['title'] ?? 'Unknown catalogue entry'),
                    $this->level($event->event_type, $payload),
                    $this->sourceType($event->event_type, $payload),
                    (int) $event->aggregate_version,
                    $chunk['section'],
                    $chunk['text'],
                    '['.implode(',', array_map('floatval', $embedding)).']',
                ]);
            }
        });
    }

    private function chunks(string $eventType, array $payload): array
    {
        if (str_starts_with($eventType, 'knowledge-source.')) {
            $chunks = collect($payload['chunks'] ?? [])->map(fn ($chunk) => [
                'section' => trim((string) ($chunk['section'] ?? 'general')) ?: 'general',
                'text' => trim(strip_tags((string) ($chunk['text'] ?? ''))),
            ])->filter(fn ($chunk) => $chunk['text'] !== '')->values()->all();
            if ($chunks === []) {
                throw new RuntimeException('Released knowledge source has no indexable reviewed content.');
            }

            return $chunks;
        }
        $studyModes = array_filter(array_map('trim', (array) ($payload['study_modes'] ?? [])));
        $catalogueFacts = array_filter([
            ! empty($payload['duration']) ? 'Duration: '.$payload['duration'] : null,
            ! empty($payload['campus']) ? 'Campus or learning centre: '.$payload['campus'] : null,
            $studyModes !== [] ? 'Study modes: '.implode(', ', $studyModes) : null,
        ]);

        $sections = str_starts_with($eventType, 'affiliated-')
            ? ['overview' => $payload['overview'] ?? '', 'offerings' => $payload['offerings'] ?? '']
            : [
                'catalogue_facts' => implode("\n", $catalogueFacts),
                'overview' => $payload['overview'] ?? '',
                'objective_impact' => $payload['objective_impact'] ?? '',
                'philosophy_originality' => $payload['philosophy_originality'] ?? '',
                'career_prospects' => $payload['career_prospects'] ?? '',
                'admission_requirements' => $payload['admission_requirements'] ?? '',
                'structure' => $payload['structure_content'] ?? '',
            ];

        $chunks = [];
        foreach ($sections as $section => $text) {
            foreach (preg_split('/\n{2,}/', trim(strip_tags((string) $text))) ?: [] as $paragraph) {
                $paragraph = trim($paragraph);
                if ($paragraph !== '') {
                    $chunks[] = ['section' => $section, 'text' => $paragraph];
                }
            }
        }
        if ($chunks === []) {
            throw new RuntimeException('Published catalogue entry has no indexable text.');
        }

        return $chunks;
    }

    private function embeddings(array $texts): array
    {
        $embeddings = [];
        foreach (array_chunk(array_values($texts), 32) as $batch) {
            $response = $this->nvidia()->post('/v1/embeddings', [
                'model' => config('services.nvidia.embed_model'),
                'input' => $batch,
                'input_type' => 'passage',
                'encoding_format' => 'float',
                'truncate' => 'END',
            ]);
            if (! $response->successful()) {
                throw new RuntimeException('NVIDIA embedding request failed with HTTP '.$response->status().'.');
            }

            $data = $response->json('data');
            if (! is_array($data) || count($data) !== count($batch)) {
                throw new RuntimeException('NVIDIA embedding response is invalid or incomplete.');
            }
            usort($data, static fn (array $a, array $b): int => ($a['index'] ?? 0) <=> ($b['index'] ?? 0));
            array_push($embeddings, ...array_column($data, 'embedding'));
        }

        return $embeddings;
    }

    private function nvidia(): PendingRequest
    {
        return Http::baseUrl(rtrim((string) config('services.nvidia.base_url'), '/'))
            ->withToken($this->apiKey)
            ->acceptJson()
            ->timeout(90)
            ->retry(2, 750, throw: false);
    }

    private function level(string $eventType, array $payload): string
    {
        if (str_starts_with($eventType, 'knowledge-source.')) {
            return 'knowledge';
        }
        if (str_starts_with($eventType, 'affiliated-')) {
            return 'affiliated';
        }

        return strtolower((string) ($payload['category'] ?? '')) === 'postgraduate'
            ? 'postgraduate'
            : 'undergraduate';
    }

    private function sourceType(string $eventType, array $payload): string
    {
        if (str_starts_with($eventType, 'knowledge-source.')) {
            return 'knowledge_'.preg_replace('/[^a-z0-9_]+/', '_', strtolower((string) ($payload['source_type'] ?? 'general')));
        }

        return str_starts_with($eventType, 'affiliated-') ? 'affiliated_institution' : 'programme';
    }

    private function markKnowledgeSourceReleased(object $event): void
    {
        $payload = is_array($event->payload) ? $event->payload : json_decode((string) $event->payload, true);
        $versionId = is_array($payload) ? ($payload['version_id'] ?? null) : null;
        if (! is_string($versionId) || $versionId === '') {
            throw new RuntimeException('Knowledge publication event is missing its canonical version identifier.');
        }

        DB::transaction(function () use ($event, $versionId): void {
            DB::table('knowledge_source_versions')
                ->where('knowledge_source_id', $event->aggregate_id)
                ->where('status', 'released')
                ->where('id', '<>', $versionId)
                ->update(['status' => 'superseded', 'updated_at' => now()]);
            $updated = DB::table('knowledge_source_versions')->where('id', $versionId)->where('knowledge_source_id', $event->aggregate_id)->update([
                'status' => 'released', 'released_at' => now(), 'released_by' => DB::raw('reviewed_by'), 'updated_at' => now(),
            ]);
            if ($updated !== 1) {
                throw new RuntimeException('The canonical knowledge source version could not be activated.');
            }
            DB::table('knowledge_sources')->where('id', $event->aggregate_id)->update([
                'status' => 'released', 'active_version_id' => $versionId, 'updated_at' => now(),
            ]);
        });
    }

    private function finalizeKnowledgeSourceRemoval(object $event): void
    {
        $source = DB::table('knowledge_sources')->where('id', $event->aggregate_id)->first();
        if (! $source) {
            return;
        }
        if ($source->status !== 'removal-pending') {
            throw new RuntimeException('The canonical knowledge source is not awaiting removal.');
        }

        $paths = DB::table('knowledge_source_versions')
            ->where('knowledge_source_id', $event->aggregate_id)
            ->pluck('stored_path')
            ->filter()
            ->values()
            ->all();
        if ($paths !== []) {
            Storage::disk('knowledge')->delete($paths);
        }
        DB::table('knowledge_sources')->where('id', $event->aggregate_id)->delete();
    }
}
