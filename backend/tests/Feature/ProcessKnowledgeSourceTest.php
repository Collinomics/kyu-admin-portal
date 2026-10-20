<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Jobs\ProcessKnowledgeSource;
use App\Models\KnowledgeSourceVersion;
use App\Models\User;
use App\Services\KnowledgeContentValidator;
use App\Services\KnowledgeFileInspector;
use App\Services\KnowledgeSourceExtractor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Tests\TestCase;

class ProcessKnowledgeSourceTest extends TestCase
{
    use RefreshDatabase;

    public function test_csv_is_extracted_but_incomplete_cutoff_data_stays_blocked_for_review(): void
    {
        Queue::fake();
        Storage::fake('knowledge');
        config()->set('knowledge.antivirus_binary', null);
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);

        $response = $this->actingAs($admin, 'sanctum')->post('/api/v1/admin/knowledge-sources', [
            'title' => 'Incomplete cut-off points',
            'source_type' => 'cutoff-points',
            'file' => UploadedFile::fake()->createWithContent('cutoffs.csv', "programme_code,academic_year,cutoff\nARD,2026/2027,45.2\n"),
        ], ['Accept' => 'application/json'])->assertCreated();

        $versionId = $response->json('data.latest_version.id');
        (new ProcessKnowledgeSource($versionId))->handle($this->passingInspector(), app(KnowledgeSourceExtractor::class), app(KnowledgeContentValidator::class));

        $version = KnowledgeSourceVersion::with(['source', 'chunks', 'findings'])->findOrFail($versionId);
        $this->assertSame('review-required', $version->status);
        $this->assertSame('completed', $version->extraction_status);
        $this->assertSame('issues-found', $version->validation_status);
        $this->assertSame('review-required', $version->source->status);
        $this->assertCount(1, $version->chunks);
        $this->assertStringContainsString('programme_code: ARD', $version->chunks->first()->content);
        $this->assertTrue($version->findings->contains('code', 'missing_cutoff_columns'));
        $this->assertSame('passed', $version->scan_status);
    }

    public function test_calculation_guidance_missing_required_rules_is_flagged_and_never_executed(): void
    {
        Queue::fake();
        Storage::fake('knowledge');
        config()->set('knowledge.antivirus_binary', null);
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);

        $response = $this->actingAs($admin, 'sanctum')->post('/api/v1/admin/knowledge-sources', [
            'title' => 'Cut-off calculator notes',
            'source_type' => 'calculation-rules',
            'file' => UploadedFile::fake()->createWithContent('rules.md', "# Formula\nScore = A + B\n"),
        ], ['Accept' => 'application/json'])->assertCreated();

        $versionId = $response->json('data.latest_version.id');
        (new ProcessKnowledgeSource($versionId))->handle($this->passingInspector(), app(KnowledgeSourceExtractor::class), app(KnowledgeContentValidator::class));

        $version = KnowledgeSourceVersion::with('findings')->findOrFail($versionId);
        $this->assertTrue($version->findings->contains('code', 'incomplete_calculation_guidance'));
        $this->assertTrue($version->findings->contains('code', 'deterministic_implementation_required'));
        $this->assertSame('issues-found', $version->validation_status);
    }

    public function test_release_requires_password_clean_scan_and_no_open_blocking_findings(): void
    {
        Queue::fake();
        Storage::fake('knowledge');
        config()->set('knowledge.antivirus_binary', null);
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);
        $response = $this->actingAs($admin, 'sanctum')->post('/api/v1/admin/knowledge-sources', [
            'title' => 'Approved admissions guide',
            'source_type' => 'admissions-policy',
            'file' => UploadedFile::fake()->createWithContent('guide.md', "# Applications\nApplicants must submit the published documents.\n"),
        ], ['Accept' => 'application/json'])->assertCreated();
        $versionId = $response->json('data.latest_version.id');
        $sourceId = $response->json('data.id');
        (new ProcessKnowledgeSource($versionId))->handle($this->passingInspector(), app(KnowledgeSourceExtractor::class), app(KnowledgeContentValidator::class));

        $this->postJson("/api/v1/admin/knowledge-sources/{$sourceId}/versions/{$versionId}/release", [
            'release_reason' => 'Approved after complete source review.',
            'current_password' => 'wrong-password',
        ])->assertUnprocessable()->assertJsonValidationErrors('current_password');

        $this->postJson("/api/v1/admin/knowledge-sources/{$sourceId}/versions/{$versionId}/release", [
            'release_reason' => 'Approved after complete source review.',
            'current_password' => 'Admin-Password-2026!',
        ])->assertOk()->assertJsonPath('data.status', 'release-pending');

        $this->assertDatabaseHas('knowledge_source_versions', ['id' => $versionId, 'status' => 'release-pending']);
        $this->assertDatabaseHas('integration_outbox', ['event_type' => 'knowledge-source.published', 'aggregate_id' => $sourceId]);
        $this->assertDatabaseHas('audit_events', ['action' => 'knowledge_source.release_requested']);
    }

    public function test_antivirus_failure_cannot_be_manually_overridden(): void
    {
        Queue::fake();
        Storage::fake('knowledge');
        config()->set('knowledge.antivirus_binary', null);
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN, 'password' => 'Admin-Password-2026!']);
        $response = $this->actingAs($admin, 'sanctum')->post('/api/v1/admin/knowledge-sources', [
            'title' => 'Guide awaiting scanner',
            'source_type' => 'general-guidance',
            'file' => UploadedFile::fake()->createWithContent('guide.md', "# Guide\nPublished information only.\n"),
        ], ['Accept' => 'application/json'])->assertCreated();
        $sourceId = $response->json('data.id');
        $versionId = $response->json('data.latest_version.id');
        (new ProcessKnowledgeSource($versionId))->handle(app(KnowledgeFileInspector::class), app(KnowledgeSourceExtractor::class), app(KnowledgeContentValidator::class));
        $findingId = KnowledgeSourceVersion::with('findings')->findOrFail($versionId)->findings->firstWhere('code', 'antivirus_unavailable')->id;

        $this->patchJson("/api/v1/admin/knowledge-sources/{$sourceId}/versions/{$versionId}/findings/{$findingId}", [
            'resolved' => true,
            'resolution_note' => 'Attempting an unsafe manual override.',
            'current_password' => 'Admin-Password-2026!',
        ])->assertUnprocessable()->assertJsonValidationErrors('finding');

        $this->assertDatabaseMissing('knowledge_source_findings', ['id' => $findingId, 'resolved_by' => $admin->id]);
    }

    public function test_successful_retry_resolves_obsolete_technical_failure_findings(): void
    {
        Queue::fake();
        Storage::fake('knowledge');
        $admin = User::factory()->create(['role' => UserRole::SYSADMIN]);
        $response = $this->actingAs($admin, 'sanctum')->post('/api/v1/admin/knowledge-sources', [
            'title' => 'Recovered document',
            'source_type' => 'general-guidance',
            'file' => UploadedFile::fake()->createWithContent('guide.md', "# Guide\nApproved catalogue guidance.\n"),
        ], ['Accept' => 'application/json'])->assertCreated();
        $versionId = $response->json('data.latest_version.id');
        $version = KnowledgeSourceVersion::findOrFail($versionId);
        foreach (['antivirus_failed', 'extraction_failed'] as $code) {
            $version->findings()->create([
                'severity' => 'error',
                'code' => $code,
                'message' => 'Temporary processing failure.',
                'blocks_release' => true,
            ]);
        }

        $job = new ProcessKnowledgeSource($versionId);
        $this->assertInstanceOf(WithoutOverlapping::class, $job->middleware()[0]);
        $job->handle($this->passingInspector(), app(KnowledgeSourceExtractor::class), app(KnowledgeContentValidator::class));

        $version->refresh();
        $this->assertSame('passed', $version->validation_status);
        $this->assertSame(0, $version->findings()->whereNull('resolved_at')->where('blocks_release', true)->count());
        $this->assertSame(2, $version->findings()->whereNotNull('resolved_at')->count());
    }

    private function passingInspector(): KnowledgeFileInspector
    {
        return new class extends KnowledgeFileInspector
        {
            public function scan(string $path): array
            {
                return ['status' => 'passed', 'fatal' => false, 'findings' => []];
            }
        };
    }
}
