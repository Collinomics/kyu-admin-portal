<?php

namespace Tests\Unit;

use App\Contracts\ManagedSecretStore;
use App\Services\PublicAiAssistant;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use ReflectionMethod;
use Tests\TestCase;

class PublicAiAssistantHardeningTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config()->set('database.connections.pgsql_ai', [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
            'foreign_key_constraints' => true,
        ]);
        DB::purge('pgsql_ai');
        Schema::connection('pgsql_ai')->create('monitor_settings', function (Blueprint $table): void {
            $table->string('key')->primary();
            $table->text('value');
        });
    }

    public function test_chat_completion_uses_the_next_approved_model_after_an_upstream_failure(): void
    {
        DB::connection('pgsql_ai')->table('monitor_settings')->insert([
            ['key' => 'chat_models', 'value' => "primary/model\nbackup/model"],
            ['key' => 'temperature', 'value' => '0.2'],
        ]);
        Http::fakeSequence()
            ->push(['error' => 'temporarily unavailable'], 503)
            ->push(['choices' => [['message' => ['content' => 'Published catalogue answer']]]], 200);

        $method = new ReflectionMethod(PublicAiAssistant::class, 'completion');
        [$answer, $model] = $method->invoke($this->assistant(), [
            ['role' => 'user', 'content' => 'Summarise this programme'],
        ]);

        $this->assertSame('Published catalogue answer', $answer);
        $this->assertSame('backup/model', $model);
        Http::assertSentCount(2);
    }

    public function test_model_html_is_removed_and_offtopic_marker_is_not_shown_to_visitors(): void
    {
        $method = new ReflectionMethod(PublicAiAssistant::class, 'normaliseModelAnswer');
        [$answer, $guardrail] = $method->invoke(
            $this->assistant(),
            "[OFFTOPIC]\n<b>Ask about programmes</b><br>Use official guidance &amp; sources."
        );

        $this->assertSame("Ask about programmes\nUse official guidance & sources.", $answer);
        $this->assertSame('offtopic', $guardrail);
        $this->assertStringNotContainsString('<b>', $answer);
        $this->assertStringNotContainsString('<br>', $answer);
    }

    private function assistant(): PublicAiAssistant
    {
        $secrets = new class implements ManagedSecretStore
        {
            public function statuses(): array
            {
                return [];
            }

            public function get(string $key): ?string
            {
                return 'test-api-key';
            }

            public function replace(string $key, string $value): array
            {
                return [];
            }
        };

        return new PublicAiAssistant($secrets);
    }
}
