<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessKnowledgeSource;
use App\Models\KnowledgeSource;
use App\Models\KnowledgeSourceFinding;
use App\Models\KnowledgeSourceVersion;
use App\Services\AuditLogger;
use App\Services\KnowledgeFileInspector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

class KnowledgeSourceController extends Controller
{
    public function __construct(
        private readonly KnowledgeFileInspector $inspector,
        private readonly AuditLogger $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', Rule::in(['quarantined', 'processing', 'review-required', 'release-pending', 'released', 'failed', 'superseded', 'removal-pending'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);
        $query = KnowledgeSource::query()
            ->with(['versions' => fn ($query) => $query->with('findings')->withCount('chunks')->latest('version')->limit(1), 'creator:id,title,first_name,last_name,email'])
            ->latest();
        if ($search = trim((string) ($data['search'] ?? ''))) {
            $query->where(fn ($query) => $query->where('title', 'like', "%{$search}%")->orWhereHas('versions', fn ($version) => $version->where('original_name', 'like', "%{$search}%")));
        }
        if ($status = $data['status'] ?? null) {
            $query->where('status', $status);
        }
        $sources = $query->paginate((int) ($data['per_page'] ?? 15));

        return response()->json([
            'data' => collect($sources->items())->map(fn (KnowledgeSource $source) => $this->sourceData($source))->all(),
            'meta' => [
                'current_page' => $sources->currentPage(),
                'last_page' => $sources->lastPage(),
                'per_page' => $sources->perPage(),
                'total' => $sources->total(),
            ],
        ]);
    }

    public function show(KnowledgeSource $knowledgeSource): JsonResponse
    {
        $knowledgeSource->load(['versions' => fn ($query) => $query->with('findings')->withCount('chunks')->latest('version'), 'creator:id,title,first_name,last_name,email']);

        return response()->json(['data' => $this->sourceData($knowledgeSource, true)]);
    }

    public function destroy(Request $request, KnowledgeSource $knowledgeSource): JsonResponse
    {
        $data = $request->validate([
            'removal_reason' => ['required', 'string', 'min:10', 'max:2000'],
            'current_password' => ['required', 'string', 'max:1024'],
        ]);
        $this->confirmPassword($request, $data['current_password']);

        $knowledgeSource->load(['versions:id,knowledge_source_id,version,stored_path,status']);
        abort_if(in_array($knowledgeSource->status, ['processing', 'release-pending'], true), 409, 'Wait for the current processing operation to finish before removing this source.');
        if ($knowledgeSource->status === 'removal-pending') {
            return response()->json(['pending' => true, 'data' => $this->sourceData($knowledgeSource)], 202);
        }

        $reason = trim($data['removal_reason']);
        $snapshot = [
            'title' => $knowledgeSource->title,
            'source_type' => $knowledgeSource->source_type,
            'status' => $knowledgeSource->status,
            'versions' => $knowledgeSource->versions->map(fn (KnowledgeSourceVersion $version) => [
                'id' => $version->id,
                'version' => $version->version,
                'status' => $version->status,
            ])->all(),
        ];

        if ($knowledgeSource->active_version_id !== null || $knowledgeSource->status === 'released') {
            $activeVersion = $knowledgeSource->versions->firstWhere('id', $knowledgeSource->active_version_id)
                ?? $knowledgeSource->versions->sortByDesc('version')->first();
            DB::transaction(function () use ($knowledgeSource, $activeVersion, $reason): void {
                $locked = KnowledgeSource::query()->lockForUpdate()->findOrFail($knowledgeSource->id);
                abort_if(in_array($locked->status, ['processing', 'release-pending'], true), 409, 'Wait for the current processing operation to finish before removing this source.');
                $locked->update(['status' => 'removal-pending']);
                DB::table('integration_outbox')->insertOrIgnore([
                    'id' => (string) Str::uuid(),
                    'event_type' => 'knowledge-source.unpublished',
                    'aggregate_id' => $locked->id,
                    'aggregate_version' => (int) ($activeVersion?->version ?? 1),
                    'payload' => json_encode(['removal_reason' => $reason], JSON_THROW_ON_ERROR),
                    'attempts' => 0,
                    'available_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            });
            $this->audit->record($request, 'knowledge_source.removal_requested', $request->user(), [
                'removal_reason' => $reason,
                'requires_ai_withdrawal' => true,
            ], KnowledgeSource::class, $knowledgeSource->id, $snapshot, ['status' => 'removal-pending']);

            return response()->json([
                'pending' => true,
                'message' => 'The source is being withdrawn from the AI index before permanent removal.',
                'data' => $this->sourceData($knowledgeSource->fresh()->load(['versions' => fn ($query) => $query->with('findings')->withCount('chunks')->latest('version')->limit(1), 'creator:id,title,first_name,last_name,email'])),
            ], 202);
        }

        $paths = $knowledgeSource->versions->pluck('stored_path')->filter()->values()->all();
        $this->audit->record($request, 'knowledge_source.removed', $request->user(), [
            'removal_reason' => $reason,
            'requires_ai_withdrawal' => false,
        ], KnowledgeSource::class, $knowledgeSource->id, $snapshot);
        $knowledgeSource->delete();
        if ($paths !== []) {
            Storage::disk('knowledge')->delete($paths);
        }

        return response()->json(['removed' => true, 'pending' => false]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:160'],
            'source_type' => ['required', Rule::in(['general-guidance', 'admissions-policy', 'cutoff-points', 'calculation-rules'])],
            'description' => ['nullable', 'string', 'max:2000'],
            'file' => ['required', 'file', 'max:'.max(1, (int) config('knowledge.max_upload_kilobytes', 12288))],
        ]);

        $file = $data['file'];
        // Perform bounded structural checks in the request. Resource-intensive
        // malware scanning runs only after the file is stored in quarantine.
        $inspection = $this->inspector->inspect($file, false);
        if ($inspection['fatal']) {
            $this->audit->record($request, 'knowledge_source.upload_blocked', $request->user(), [
                'original_name' => mb_substr(basename($file->getClientOriginalName()), 0, 255),
                'sha256' => $inspection['sha256'],
                'finding_codes' => array_column($inspection['findings'], 'code'),
            ]);

            return response()->json([
                'code' => 'FILE_REJECTED',
                'message' => 'The file failed mandatory security checks and was not stored.',
                'findings' => $inspection['findings'],
            ], 422);
        }

        if (KnowledgeSourceVersion::query()->where('sha256', $inspection['sha256'])->exists()) {
            return response()->json([
                'code' => 'DUPLICATE_SOURCE_FILE',
                'message' => 'This exact file has already been uploaded.',
            ], 422);
        }

        $path = null;
        try {
            $source = DB::transaction(function () use ($request, $data, $file, $inspection, &$path): KnowledgeSource {
                $source = KnowledgeSource::create([
                    'title' => trim($data['title']),
                    'source_type' => $data['source_type'],
                    'description' => isset($data['description']) ? trim($data['description']) : null,
                    'status' => 'quarantined',
                    'created_by' => $request->user()->id,
                ]);
                $storedName = $source->id.'-v1.'.$inspection['extension'];
                $path = Storage::disk('knowledge')->putFileAs('quarantine/'.$source->id, $file, $storedName);
                $version = KnowledgeSourceVersion::create([
                    'knowledge_source_id' => $source->id,
                    'version' => 1,
                    'original_name' => mb_substr(basename($file->getClientOriginalName()), 0, 255),
                    'stored_path' => $path,
                    'extension' => $inspection['extension'],
                    'mime_type' => $inspection['mime_type'],
                    'size_bytes' => $file->getSize(),
                    'sha256' => $inspection['sha256'],
                    'status' => 'quarantined',
                    'scan_status' => $inspection['scan_status'],
                    'extraction_status' => 'pending',
                    'validation_status' => 'pending',
                    'progress' => 10,
                    'metadata' => ['stored_privately' => true],
                    'validation_summary' => $this->summary($inspection['findings']),
                    'uploaded_by' => $request->user()->id,
                ]);
                foreach ($inspection['findings'] as $finding) {
                    $version->findings()->create($finding);
                }

                return $source->load(['versions' => fn ($query) => $query->with('findings')->withCount('chunks')->latest('version')->limit(1), 'creator:id,title,first_name,last_name,email']);
            });
        } catch (Throwable $exception) {
            if ($path) {
                Storage::disk('knowledge')->delete($path);
            }
            throw $exception;
        }

        $this->audit->record($request, 'knowledge_source.uploaded_to_quarantine', $request->user(), [
            'source_type' => $source->source_type,
            'sha256' => $inspection['sha256'],
            'scan_status' => $inspection['scan_status'],
        ], KnowledgeSource::class, $source->id);

        $versionId = $source->versions->first()?->id;
        if ($versionId) {
            ProcessKnowledgeSource::dispatch($versionId)->afterCommit();
        }

        return response()->json(['data' => $this->sourceData($source)], 201);
    }

    public function resolveFinding(Request $request, KnowledgeSource $knowledgeSource, KnowledgeSourceVersion $version, KnowledgeSourceFinding $finding): JsonResponse
    {
        abort_unless($version->knowledge_source_id === $knowledgeSource->id && $finding->knowledge_source_version_id === $version->id, 404);
        $data = $request->validate([
            'resolved' => ['required', 'boolean'],
            'resolution_note' => ['required_if:resolved,true', 'nullable', 'string', 'min:10', 'max:2000'],
            'current_password' => ['required', 'string', 'max:1024'],
        ]);
        $this->confirmPassword($request, $data['current_password']);
        abort_if(in_array($knowledgeSource->status, ['released', 'release-pending'], true), 409, 'Released or pending versions cannot be modified.');

        $nonOverridable = ['antivirus_unavailable', 'antivirus_failed', 'malware_detected', 'extraction_failed'];
        if ($data['resolved'] && in_array($finding->code, $nonOverridable, true)) {
            throw ValidationException::withMessages(['finding' => ['This system-generated security finding cannot be overridden. Correct the underlying problem and process a new version.']]);
        }

        $before = ['resolved_at' => $finding->resolved_at?->toIso8601String()];
        $finding->update($data['resolved'] ? [
            'resolved_by' => $request->user()->id,
            'resolved_at' => now(),
            'resolution_note' => trim((string) $data['resolution_note']),
        ] : ['resolved_by' => null, 'resolved_at' => null, 'resolution_note' => null]);
        $this->refreshValidationSummary($version);
        $this->audit->record($request, $data['resolved'] ? 'knowledge_source.finding_resolved' : 'knowledge_source.finding_reopened', $request->user(), [
            'finding_code' => $finding->code,
            'resolution_note' => $data['resolved'] ? trim((string) $data['resolution_note']) : null,
        ], KnowledgeSourceFinding::class, $finding->id, $before, ['resolved_at' => $finding->fresh()->resolved_at?->toIso8601String()]);

        return $this->show($knowledgeSource->fresh());
    }

    public function reviewContent(Request $request, KnowledgeSource $knowledgeSource, KnowledgeSourceVersion $version): JsonResponse
    {
        abort_unless($version->knowledge_source_id === $knowledgeSource->id, 404);
        $data = $request->validate(['page' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $chunks = $version->chunks()->paginate((int) ($data['per_page'] ?? 25));

        return response()->json([
            'data' => collect($chunks->items())->map(fn ($chunk) => [
                'id' => $chunk->id,
                'sequence' => $chunk->sequence,
                'section' => $chunk->section,
                'content' => $chunk->content,
                'content_hash' => $chunk->content_hash,
                'metadata' => $chunk->metadata,
            ])->all(),
            'meta' => ['current_page' => $chunks->currentPage(), 'last_page' => $chunks->lastPage(), 'per_page' => $chunks->perPage(), 'total' => $chunks->total()],
        ]);
    }

    public function release(Request $request, KnowledgeSource $knowledgeSource, KnowledgeSourceVersion $version): JsonResponse
    {
        abort_unless($version->knowledge_source_id === $knowledgeSource->id, 404);
        $data = $request->validate([
            'release_reason' => ['required', 'string', 'min:10', 'max:2000'],
            'current_password' => ['required', 'string', 'max:1024'],
        ]);
        $this->confirmPassword($request, $data['current_password']);

        DB::transaction(function () use ($request, &$knowledgeSource, &$version): void {
            $knowledgeSource = KnowledgeSource::query()->lockForUpdate()->findOrFail($knowledgeSource->id);
            $version = KnowledgeSourceVersion::query()->with(['chunks', 'findings'])->lockForUpdate()->findOrFail($version->id);
            abort_if($knowledgeSource->status === 'release-pending' || $version->status === 'release-pending', 409, 'This source is already awaiting secure AI indexing.');
            abort_unless($version->status === 'review-required' && $version->extraction_status === 'completed', 409, 'Only a completely extracted version can be released.');
            if ($version->scan_status !== 'passed') {
                throw ValidationException::withMessages(['version' => ['A successful antivirus scan is required before release.']]);
            }
            if ($version->findings->contains(fn ($finding) => $finding->blocks_release && $finding->resolved_at === null)) {
                throw ValidationException::withMessages(['version' => ['Resolve every blocking finding before release.']]);
            }
            if ($version->chunks->isEmpty()) {
                throw ValidationException::withMessages(['version' => ['No reviewed content is available for indexing.']]);
            }

            $version->update([
                'status' => 'release-pending',
                'validation_status' => 'passed',
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
            ]);
            $knowledgeSource->update(['status' => 'release-pending']);
            DB::table('integration_outbox')->insertOrIgnore([
                'id' => (string) Str::uuid(),
                'event_type' => 'knowledge-source.published',
                'aggregate_id' => $knowledgeSource->id,
                'aggregate_version' => $version->version,
                'payload' => json_encode([
                    'version_id' => $version->id,
                    'title' => $knowledgeSource->title,
                    'source_type' => $knowledgeSource->source_type,
                    'chunks' => $version->chunks->map(fn ($chunk) => ['section' => $chunk->section, 'text' => $chunk->content])->all(),
                ], JSON_THROW_ON_ERROR),
                'attempts' => 0,
                'available_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        $this->audit->record($request, 'knowledge_source.release_requested', $request->user(), [
            'version' => $version->version,
            'release_reason' => trim($data['release_reason']),
        ], KnowledgeSource::class, $knowledgeSource->id);

        return $this->show($knowledgeSource->fresh());
    }

    private function sourceData(KnowledgeSource $source, bool $allVersions = false): array
    {
        $versions = $source->versions->map(fn (KnowledgeSourceVersion $version) => [
            'id' => $version->id,
            'version' => $version->version,
            'original_name' => $version->original_name,
            'extension' => $version->extension,
            'mime_type' => $version->mime_type,
            'size_bytes' => $version->size_bytes,
            'sha256' => $version->sha256,
            'status' => $version->status,
            'scan_status' => $version->scan_status,
            'extraction_status' => $version->extraction_status,
            'validation_status' => $version->validation_status,
            'progress' => $version->progress,
            'chunk_count' => (int) ($version->chunks_count ?? 0),
            'metadata' => $version->metadata,
            'validation_summary' => $version->validation_summary,
            'uploaded_at' => $version->created_at?->toIso8601String(),
            'reviewed_at' => $version->reviewed_at?->toIso8601String(),
            'released_at' => $version->released_at?->toIso8601String(),
            'findings' => $version->findings->map(fn ($finding) => [
                'id' => $finding->id,
                'severity' => $finding->severity,
                'code' => $finding->code,
                'message' => $finding->message,
                'location' => $finding->location,
                'blocks_release' => $finding->blocks_release,
                'resolved_at' => $finding->resolved_at?->toIso8601String(),
                'resolution_note' => $finding->resolution_note,
            ])->all(),
        ]);

        return [
            'id' => $source->id,
            'title' => $source->title,
            'source_type' => $source->source_type,
            'description' => $source->description,
            'status' => $source->status,
            'active_version_id' => $source->active_version_id,
            'created_at' => $source->created_at?->toIso8601String(),
            'created_by' => $source->creator?->name ?: $source->creator?->email,
            $allVersions ? 'versions' : 'latest_version' => $allVersions ? $versions->all() : $versions->first(),
        ];
    }

    private function summary(array $findings): array
    {
        return [
            'critical' => count(array_filter($findings, fn ($finding) => $finding['severity'] === 'critical')),
            'errors' => count(array_filter($findings, fn ($finding) => $finding['severity'] === 'error')),
            'warnings' => count(array_filter($findings, fn ($finding) => $finding['severity'] === 'warning')),
            'blocking' => count(array_filter($findings, fn ($finding) => $finding['blocks_release'])),
        ];
    }

    private function confirmPassword(Request $request, string $password): void
    {
        if (! Hash::check($password, $request->user()->password)) {
            throw ValidationException::withMessages(['current_password' => ['Your current password is incorrect.']]);
        }
    }

    private function refreshValidationSummary(KnowledgeSourceVersion $version): void
    {
        $open = $version->findings()->whereNull('resolved_at');
        $blocking = (clone $open)->where('blocks_release', true)->count();
        $version->update([
            'validation_status' => $blocking > 0 ? 'issues-found' : 'passed',
            'validation_summary' => [
                'critical' => (clone $open)->where('severity', 'critical')->count(),
                'errors' => (clone $open)->where('severity', 'error')->count(),
                'warnings' => (clone $open)->where('severity', 'warning')->count(),
                'blocking' => $blocking,
            ],
        ]);
    }
}
