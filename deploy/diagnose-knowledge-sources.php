<?php

declare(strict_types=1);

use App\Models\KnowledgeSourceVersion;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require '/var/www/kyu-portal/backend/vendor/autoload.php';

$app = require '/var/www/kyu-portal/backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$versions = KnowledgeSourceVersion::query()
    ->with(['source:id,title,status', 'findings:id,knowledge_source_version_id,severity,code,message,blocks_release,resolved_at,created_at'])
    ->latest()
    ->limit(10)
    ->get()
    ->map(static fn (KnowledgeSourceVersion $version): array => [
        'source' => $version->source?->title,
        'source_status' => $version->source?->status,
        'version_status' => $version->status,
        'scan_status' => $version->scan_status,
        'extraction_status' => $version->extraction_status,
        'validation_status' => $version->validation_status,
        'progress' => $version->progress,
        'findings' => $version->findings->map(static fn ($finding): array => [
            'severity' => $finding->severity,
            'code' => $finding->code,
            'blocks_release' => (bool) $finding->blocks_release,
            'resolved' => $finding->resolved_at !== null,
            'message' => $finding->message,
            'created_at' => $finding->created_at?->toAtomString(),
        ])->values()->all(),
        'updated_at' => $version->updated_at?->toAtomString(),
    ])->values()->all();

echo json_encode([
    'queue_connection' => config('queue.default'),
    'pending_jobs' => DB::table('jobs')->count(),
    'failed_jobs' => DB::table('failed_jobs')->count(),
    'versions' => $versions,
], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR).PHP_EOL;
