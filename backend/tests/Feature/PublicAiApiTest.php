<?php

namespace Tests\Feature;

use App\Models\Programme;
use App\Services\PublicAiAssistant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class PublicAiApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_chat_accepts_only_a_published_programme_scope(): void
    {
        $published = Programme::create(['code' => 'PUB', 'name' => 'Published', 'category' => 'Undergraduate', 'status' => 'published']);
        $draft = Programme::create(['code' => 'DRF', 'name' => 'Draft', 'category' => 'Undergraduate', 'status' => 'draft']);
        $this->mock(PublicAiAssistant::class, function (MockInterface $mock) use ($published) {
            $mock->shouldReceive('chat')->once()->withArgs(fn ($question, $history, $programmeId, $clientId) =>
                $question === 'Tell me about this programme'
                && $history === []
                && $programmeId === $published->id
                && $clientId === 'browser-1234'
            )->andReturn(['answer' => 'Published answer', 'disclaimer' => null, 'turn_id' => 42]);
        });

        $this->postJson('/api/v1/catalogue/assistant/chat', [
            'question' => 'Tell me about this programme',
            'client_id' => 'browser-1234',
            'programme_id' => $published->id,
            'history' => [],
        ])->assertOk()->assertJsonPath('data.turn_id', 42);

        $this->postJson('/api/v1/catalogue/assistant/chat', [
            'question' => 'Tell me about this programme',
            'client_id' => 'browser-1234',
            'programme_id' => $draft->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('programme_id');
    }

    public function test_feedback_is_bound_to_the_anonymous_client_that_created_the_turn(): void
    {
        $this->mock(PublicAiAssistant::class, function (MockInterface $mock) {
            $mock->shouldReceive('feedback')->once()->with(77, 'browser-1234', 'like')->andReturn(true);
            $mock->shouldReceive('feedback')->once()->with(77, 'other-browser', 'dislike')->andReturn(false);
        });

        $this->postJson('/api/v1/catalogue/assistant/feedback', [
            'turn_id' => 77, 'client_id' => 'browser-1234', 'feedback' => 'like',
        ])->assertOk()->assertJsonPath('data.saved', true);

        $this->postJson('/api/v1/catalogue/assistant/feedback', [
            'turn_id' => 77, 'client_id' => 'other-browser', 'feedback' => 'dislike',
        ])->assertNotFound();
    }

    public function test_public_chat_can_stream_answer_events(): void
    {
        $this->mock(PublicAiAssistant::class, function (MockInterface $mock) {
            $mock->shouldReceive('chat')->once()->andReturnUsing(function ($question, $history, $programmeId, $clientId, $ipAddress, $onDelta) {
                $onDelta('Published ');
                $onDelta('answer');

                return ['answer' => 'Published answer', 'disclaimer' => null, 'turn_id' => 91];
            });
        });

        $response = $this->postJson('/api/v1/catalogue/assistant/chat', [
            'question' => 'Which programmes are available?',
            'client_id' => 'browser-1234',
            'history' => [],
            'stream' => true,
        ])->assertOk()->assertHeader('content-type', 'text/event-stream; charset=UTF-8');

        $content = $response->streamedContent();
        $this->assertStringContainsString('event: start', $content);
        $this->assertStringContainsString('"delta":"Published "', $content);
        $this->assertStringContainsString('event: done', $content);
        $this->assertStringContainsString('"turn_id":91', $content);
    }

    public function test_stream_failure_returns_a_safe_event_without_internal_details(): void
    {
        $this->mock(PublicAiAssistant::class, function (MockInterface $mock) {
            $mock->shouldReceive('chat')->once()->andThrow(new \RuntimeException('database host and secret details'));
        });

        $response = $this->postJson('/api/v1/catalogue/assistant/chat', [
            'question' => 'Which programmes are available?',
            'client_id' => 'browser-1234',
            'history' => [],
            'stream' => true,
        ])->assertOk();

        $content = $response->streamedContent();
        $this->assertStringContainsString('event: error', $content);
        $this->assertStringContainsString('temporarily unavailable', $content);
        $this->assertStringNotContainsString('database host', $content);
        $this->assertStringNotContainsString('secret details', $content);
    }
}
