<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\PublicAiAssistant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class PublicAiController extends Controller
{
    public function __construct(private readonly PublicAiAssistant $assistant) {}

    public function configuration(): JsonResponse
    {
        return response()->json(['data' => $this->assistant->configuration()]);
    }

    public function chat(Request $request): JsonResponse|StreamedResponse
    {
        // NVIDIA inference can legitimately outlive PHP's 60-second development
        // limit while a model is warming up. The browser has its own bounded
        // timeout, and both route throttling and the per-client limit still apply.
        @set_time_limit(140);

        $data = $request->validate([
            'question' => ['required', 'string', 'max:2000'],
            'client_id' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[a-zA-Z0-9-]+$/'],
            'programme_id' => ['nullable', 'uuid', Rule::exists('programmes', 'id')->where('status', 'published')],
            'history' => ['nullable', 'array', 'max:16'],
            'history.*.role' => ['required', Rule::in(['user', 'assistant'])],
            'history.*.text' => ['required', 'string', 'max:4000'],
            'stream' => ['sometimes', 'boolean'],
        ]);

        if ($data['stream'] ?? false) {
            return response()->stream(function () use ($data, $request) {
                $sent = '';
                $this->event('start', ['status' => 'answering']);
                try {
                    $result = $this->assistant->chat(
                        trim($data['question']),
                        $data['history'] ?? [],
                        $data['programme_id'] ?? null,
                        $data['client_id'],
                        $request->ip(),
                        function (string $delta) use (&$sent) {
                            $sent .= $delta;
                            $this->event('answer', ['delta' => $delta]);
                        }
                    );
                    if ($sent === '' || $sent !== $result['answer']) {
                        $this->event('replace', ['answer' => $result['answer']]);
                    }
                    $this->event('done', ['disclaimer' => $result['disclaimer'], 'turn_id' => $result['turn_id']]);
                } catch (Throwable $exception) {
                    report($exception);
                    $this->event('error', ['message' => 'The assistant is temporarily unavailable. Please try again.']);
                }
            }, 200, [
                'Content-Type' => 'text/event-stream',
                'Cache-Control' => 'no-cache, no-transform',
                'X-Accel-Buffering' => 'no',
            ]);
        }

        return response()->json(['data' => $this->assistant->chat(
            trim($data['question']),
            $data['history'] ?? [],
            $data['programme_id'] ?? null,
            $data['client_id'],
            $request->ip()
        )]);
    }

    private function event(string $name, array $data): void
    {
        echo 'event: '.$name."\n";
        echo 'data: '.json_encode($data)."\n\n";
        if (ob_get_level() > 0) {
            @ob_flush();
        }
        flush();
    }

    public function feedback(Request $request): JsonResponse
    {
        $data = $request->validate([
            'turn_id' => ['required', 'integer', 'min:1'],
            'client_id' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[a-zA-Z0-9-]+$/'],
            'feedback' => ['nullable', Rule::in(['like', 'dislike'])],
        ]);
        abort_unless($this->assistant->feedback((int) $data['turn_id'], $data['client_id'], $data['feedback'] ?? null), 404);

        return response()->json(['data' => ['saved' => true, 'feedback' => $data['feedback'] ?? null]]);
    }
}
