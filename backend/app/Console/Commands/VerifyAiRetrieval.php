<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class VerifyAiRetrieval extends Command
{
    protected $signature = 'pcs:verify-ai-retrieval';

    protected $description = 'Verify AI vector dimensions and semantic retrieval through ai_runtime';

    public function handle(): int
    {
        $state = DB::connection('pgsql_ai')->selectOne(<<<'SQL'
            select current_user,
                count(*) as chunks,
                coalesce(min(extensions.vector_dims(embedding)), 0) as min_dimensions,
                coalesce(max(extensions.vector_dims(embedding)), 0) as max_dimensions,
                max(programme_name) as sample_programme,
                count(distinct programme_id) as indexed_sources,
                count(distinct programme_id) filter (where source_type = 'programme') as programme_sources,
                count(distinct programme_id) filter (where source_type = 'affiliated_institution') as affiliate_sources
            from ai.programme_chunks
            SQL);

        if ((string) $state->current_user !== 'ai_runtime'
            || (int) $state->chunks === 0
            || (int) $state->min_dimensions !== 2048
            || (int) $state->max_dimensions !== 2048
            || (int) $state->indexed_sources !== 284
            || (int) $state->programme_sources !== 163
            || (int) $state->affiliate_sources !== 121) {
            throw new RuntimeException('Stored AI vector verification failed.');
        }

        $pending = DB::table('integration_outbox')
            ->whereNull('processed_at')
            ->whereIn('event_type', ['programme.published', 'affiliated-institution.published'])
            ->count();
        if ($pending !== 0) {
            throw new RuntimeException("{$pending} AI publication event(s) remain pending.");
        }

        $response = Http::baseUrl(rtrim((string) config('services.nvidia.base_url'), '/'))
            ->withToken((string) config('services.nvidia.api_key'))
            ->acceptJson()
            ->timeout(90)
            ->retry(2, 750, throw: false)
            ->post('/v1/embeddings', [
                'model' => config('services.nvidia.embed_model'),
                'input' => ['Tell me about '.(string) $state->sample_programme],
                'input_type' => 'query',
                'encoding_format' => 'float',
                'truncate' => 'END',
            ]);

        $embedding = $response->json('data.0.embedding');
        if (! $response->successful() || ! is_array($embedding) || count($embedding) !== 2048) {
            throw new RuntimeException('NVIDIA query embedding verification failed.');
        }

        $result = DB::connection('pgsql_ai')->selectOne(<<<'SQL'
            select programme_name, section
            from ai.programme_chunks
            where published = true
            order by embedding <=> cast(? as extensions.vector)
            limit 1
            SQL, ['['.implode(',', array_map('floatval', $embedding)).']']);

        $matched = (string) ($result->programme_name ?? '') === (string) $state->sample_programme;
        $this->table(['Check', 'Result'], [
            ['Database role', $state->current_user],
            ['Indexed chunks', $state->chunks],
            ['Indexed catalogue sources', $state->indexed_sources.' (163 programmes + 121 affiliates)'],
            ['Pending publication events', $pending],
            ['Vector dimensions', $state->min_dimensions],
            ['Top semantic match', $result->programme_name ?? 'none'],
        ]);

        if (! $matched) {
            $this->error('Semantic retrieval did not return the expected probe programme.');

            return self::FAILURE;
        }

        $this->info('AI vector storage and semantic retrieval verified.');

        return self::SUCCESS;
    }
}
