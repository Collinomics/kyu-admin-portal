<?php

declare(strict_types=1);

use App\Enums\UserRole;
use App\Jobs\ProcessKnowledgeSource;
use App\Models\KnowledgeSource;
use App\Models\KnowledgeSourceVersion;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

require '/var/www/kyu-portal/backend/vendor/autoload.php';

$app = require '/var/www/kyu-portal/backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$title = 'EC2 controlled knowledge workflow smoke test';
$mode = $argv[1] ?? 'status';
$source = KnowledgeSource::query()->where('title', $title)->first();

if ($mode === 'create') {
    if ($source) {
        echo "SMOKE_SOURCE_ALREADY_EXISTS\n";
        exit(1);
    }
    $admin = User::query()->where('role', UserRole::SYSADMIN->value)->firstOrFail();
    $content = "# Controlled production workflow test\n\nThis temporary document verifies private quarantine, malware scanning, extraction and validation.\n";
    DB::transaction(function () use ($admin, $content, $title, &$source): void {
        $source = KnowledgeSource::create([
            'title' => $title,
            'source_type' => 'general-guidance',
            'description' => 'Temporary automated deployment verification; never released.',
            'status' => 'quarantined',
            'created_by' => $admin->id,
        ]);
        $path = 'quarantine/'.$source->id.'/'.$source->id.'-v1.md';
        Storage::disk('knowledge')->put($path, $content);
        $version = KnowledgeSourceVersion::create([
            'knowledge_source_id' => $source->id,
            'version' => 1,
            'original_name' => 'ec2-controlled-smoke-test.md',
            'stored_path' => $path,
            'extension' => 'md',
            'mime_type' => 'text/markdown',
            'size_bytes' => strlen($content),
            'sha256' => hash('sha256', $content),
            'status' => 'quarantined',
            'scan_status' => 'pending',
            'extraction_status' => 'pending',
            'validation_status' => 'pending',
            'progress' => 10,
            'metadata' => ['stored_privately' => true, 'deployment_smoke_test' => true],
            'validation_summary' => ['critical' => 0, 'errors' => 0, 'warnings' => 0, 'blocking' => 0],
            'uploaded_by' => $admin->id,
        ]);
        ProcessKnowledgeSource::dispatch($version->id);
    });
}

$source = KnowledgeSource::query()->where('title', $title)->first();
if (! $source) {
    echo "SMOKE_SOURCE_NOT_FOUND\n";
    exit($mode === 'cleanup' ? 0 : 1);
}

if ($mode === 'cleanup') {
    foreach ($source->versions as $version) {
        Storage::disk('knowledge')->delete($version->stored_path);
    }
    $source->delete();
    echo "SMOKE_SOURCE_REMOVED\n";
    exit(0);
}

$version = $source->versions()->with('findings')->latest('version')->firstOrFail();
echo json_encode([
    'source_status' => $source->status,
    'version_status' => $version->status,
    'scan_status' => $version->scan_status,
    'extraction_status' => $version->extraction_status,
    'validation_status' => $version->validation_status,
    'progress' => $version->progress,
    'chunks' => $version->chunks()->count(),
    'finding_codes' => $version->findings->pluck('code')->values()->all(),
    'pending_jobs' => DB::table('jobs')->count(),
    'failed_jobs' => DB::table('failed_jobs')->count(),
], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR).PHP_EOL;

exit($version->status === 'review-required' && $version->scan_status === 'passed' && $version->extraction_status === 'completed' ? 0 : 2);
