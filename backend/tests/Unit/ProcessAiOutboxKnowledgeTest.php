<?php

namespace Tests\Unit;

use App\Console\Commands\ProcessAiOutbox;
use App\Enums\UserRole;
use App\Models\KnowledgeSource;
use App\Models\KnowledgeSourceVersion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use ReflectionMethod;
use Tests\TestCase;

class ProcessAiOutboxKnowledgeTest extends TestCase
{
    use RefreshDatabase;

    public function test_reviewed_knowledge_chunks_are_mapped_without_html_or_source_confusion(): void
    {
        $command = new ProcessAiOutbox;
        $chunksMethod = new ReflectionMethod($command, 'chunks');
        $typeMethod = new ReflectionMethod($command, 'sourceType');
        $levelMethod = new ReflectionMethod($command, 'level');
        $payload = [
            'title' => 'Approved cut-off guidance',
            'source_type' => 'cutoff-points',
            'chunks' => [['section' => 'Rules', 'text' => '<b>Official</b> score guidance']],
        ];

        $this->assertSame([['section' => 'Rules', 'text' => 'Official score guidance']], $chunksMethod->invoke($command, 'knowledge-source.published', $payload));
        $this->assertSame('knowledge_cutoff_points', $typeMethod->invoke($command, 'knowledge-source.published', $payload));
        $this->assertSame('knowledge', $levelMethod->invoke($command, 'knowledge-source.published', $payload));
    }

    public function test_ai_withdrawal_finalization_removes_the_canonical_source_and_private_file(): void
    {
        Storage::fake('knowledge');
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $source = KnowledgeSource::create([
            'title' => 'Withdrawn guidance',
            'source_type' => 'general-guidance',
            'status' => 'removal-pending',
            'created_by' => $admin->id,
        ]);
        $path = 'quarantine/'.$source->id.'/source.md';
        Storage::disk('knowledge')->put($path, 'Reviewed guidance.');
        KnowledgeSourceVersion::create([
            'knowledge_source_id' => $source->id,
            'version' => 1,
            'original_name' => 'source.md',
            'stored_path' => $path,
            'extension' => 'md',
            'mime_type' => 'text/markdown',
            'size_bytes' => 18,
            'sha256' => hash('sha256', 'Reviewed guidance.'),
            'status' => 'released',
            'scan_status' => 'passed',
            'extraction_status' => 'completed',
            'validation_status' => 'passed',
            'progress' => 100,
            'uploaded_by' => $admin->id,
        ]);

        $method = new ReflectionMethod(new ProcessAiOutbox, 'finalizeKnowledgeSourceRemoval');
        $method->invoke(new ProcessAiOutbox, (object) ['aggregate_id' => $source->id]);

        $this->assertDatabaseMissing('knowledge_sources', ['id' => $source->id]);
        Storage::disk('knowledge')->assertMissing($path);
    }
}
