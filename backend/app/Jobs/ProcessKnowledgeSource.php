<?php

namespace App\Jobs;

use App\Models\KnowledgeSourceVersion;
use App\Services\KnowledgeContentValidator;
use App\Services\KnowledgeFileInspector;
use App\Services\KnowledgeSourceExtractor;
use Illuminate\Bus\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

class ProcessKnowledgeSource implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;

    public int $timeout = 420;

    public function __construct(public readonly string $versionId)
    {
        $this->onQueue('knowledge');
    }

    public function middleware(): array
    {
        return [(new WithoutOverlapping('knowledge-source:'.$this->versionId))->dontRelease()->expireAfter(600)];
    }

    public function handle(KnowledgeFileInspector $inspector, KnowledgeSourceExtractor $extractor, KnowledgeContentValidator $validator): void
    {
        $version = KnowledgeSourceVersion::with('source')->find($this->versionId);
        if (! $version) {
            return;
        }
        if (! in_array($version->status, ['quarantined', 'processing', 'failed'], true)) {
            return;
        }

        $version->update(['status' => 'processing', 'scan_status' => 'processing', 'extraction_status' => 'pending', 'progress' => 20]);
        try {
            $path = Storage::disk('knowledge')->path($version->stored_path);
            $this->disconnectForExternalProcess($version);
            $scan = $inspector->scan($path);
            $version = $this->refreshAfterExternalProcess($version);
            foreach ($scan['findings'] as $finding) {
                $version->findings()->firstOrCreate(
                    ['code' => $finding['code'], 'resolved_at' => null],
                    $finding,
                );
            }
            $version->update(['scan_status' => $scan['status'], 'progress' => 30]);
            if ($scan['status'] !== 'passed') {
                $openFindings = $version->findings()->whereNull('resolved_at');
                $summary = [
                    'critical' => (clone $openFindings)->where('severity', 'critical')->count(),
                    'errors' => (clone $openFindings)->where('severity', 'error')->count(),
                    'warnings' => (clone $openFindings)->where('severity', 'warning')->count(),
                    'blocking' => (clone $openFindings)->where('blocks_release', true)->count(),
                ];
                $version->update([
                    'status' => 'failed',
                    'extraction_status' => 'blocked',
                    'validation_status' => 'blocked',
                    'progress' => 100,
                    'validation_summary' => $summary,
                ]);
                $version->source()->update(['status' => 'failed']);

                return;
            }

            $this->resolveRecoveredTechnicalFindings($version, ['antivirus_failed', 'antivirus_unavailable'], 'A later antivirus scan completed successfully.');

            $version->update(['extraction_status' => 'processing', 'progress' => 35]);
            $result = $extractor->extract($path, $version->extension);
            $this->resolveRecoveredTechnicalFindings($version, ['extraction_failed'], 'A later safe extraction completed successfully.');
            $version->update(['extraction_status' => 'completed', 'validation_status' => 'processing', 'progress' => 70]);
            $findings = array_merge(
                $result['findings'],
                $validator->validate($version->source->source_type, $result['chunks'], $result['metadata'])
            );
            $version->update(['progress' => 85]);

            DB::transaction(function () use ($version, $result, $findings): void {
                $version->chunks()->delete();
                foreach ($result['chunks'] as $sequence => $chunk) {
                    $version->chunks()->create([
                        'sequence' => $sequence + 1,
                        'section' => isset($chunk['section']) ? mb_substr((string) $chunk['section'], 0, 255) : null,
                        'content' => $chunk['content'],
                        'content_hash' => hash('sha256', $chunk['content']),
                        'metadata' => $chunk['metadata'] ?? [],
                    ]);
                }
                foreach ($findings as $finding) {
                    $existing = $version->findings()->where('code', $finding['code'])->whereNull('resolved_at')->exists();
                    if (! $existing) {
                        $version->findings()->create($finding);
                    }
                }
                $blocking = $version->findings()->where('blocks_release', true)->whereNull('resolved_at')->count();
                $summary = [
                    'critical' => $version->findings()->where('severity', 'critical')->whereNull('resolved_at')->count(),
                    'errors' => $version->findings()->where('severity', 'error')->whereNull('resolved_at')->count(),
                    'warnings' => $version->findings()->where('severity', 'warning')->whereNull('resolved_at')->count(),
                    'blocking' => $blocking,
                ];
                $version->update([
                    'status' => 'review-required',
                    'extraction_status' => 'completed',
                    'validation_status' => $blocking > 0 ? 'issues-found' : 'passed',
                    'progress' => 100,
                    'metadata' => array_merge($version->metadata ?? [], $result['metadata']),
                    'validation_summary' => $summary,
                ]);
                $version->source()->update(['status' => 'review-required']);
            });
        } catch (Throwable $exception) {
            Log::error('Knowledge source processing stage failed.', [
                'version_id' => $version->id,
                'exception_class' => $exception::class,
                'exception_message' => $exception->getMessage(),
            ]);
            $version->findings()->firstOrCreate(
                ['code' => 'extraction_failed', 'resolved_at' => null],
                ['severity' => 'error', 'message' => 'The document could not be safely extracted and requires administrator attention.', 'details' => [], 'blocks_release' => true]
            );
            $version->update([
                'status' => 'failed',
                'scan_status' => $version->scan_status === 'processing' ? 'failed' : $version->scan_status,
                'extraction_status' => 'failed',
                'validation_status' => 'blocked',
                'progress' => 100,
                'validation_summary' => ['critical' => 0, 'errors' => 1, 'warnings' => 0, 'blocking' => 1],
            ]);
            $version->source()->update(['status' => 'failed']);
            report($exception);
        }
    }

    private function resolveRecoveredTechnicalFindings(KnowledgeSourceVersion $version, array $codes, string $note): void
    {
        $version->findings()
            ->whereIn('code', $codes)
            ->whereNull('resolved_at')
            ->update([
                'resolved_at' => now(),
                'resolution_note' => $note,
                'updated_at' => now(),
            ]);
    }

    private function refreshAfterExternalProcess(KnowledgeSourceVersion $version): KnowledgeSourceVersion
    {
        $connection = $version->getConnectionName() ?: (string) config('database.default');
        if (config("database.connections.{$connection}.driver") !== 'sqlite') {
            DB::purge($connection);
            DB::reconnect($connection);
        }

        return KnowledgeSourceVersion::with('source')->findOrFail($version->id);
    }

    private function disconnectForExternalProcess(KnowledgeSourceVersion $version): void
    {
        $connection = $version->getConnectionName() ?: (string) config('database.default');
        if (config("database.connections.{$connection}.driver") !== 'sqlite') {
            DB::disconnect($connection);
        }
    }
}
