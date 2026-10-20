<?php

namespace App\Http\Controllers\Api\V1;

use App\Contracts\ManagedSecretStore;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AiMonitorController extends Controller
{
    public function __construct(private readonly ManagedSecretStore $secrets) {}

    public function monitor(Request $request): JsonResponse
    {
        return match ($request->query('endpoint', 'overview')) {
            'overview' => response()->json($this->overview($this->range($request))),
            'events' => response()->json($this->events($request)),
            'live' => response()->json($this->live()),
            'documents' => response()->json(['documents' => $this->documents()]),
            'doc-stats' => response()->json($this->documentStats()),
            default => response()->json(['code' => 'UNKNOWN_ENDPOINT', 'message' => 'Unknown monitor endpoint.'], 404),
        };
    }

    public function settings(Request $request): JsonResponse
    {
        return match ($request->query('endpoint', 'get')) {
            'get' => response()->json([
                'settings' => DB::connection('pgsql_ai')->table('monitor_settings')->pluck('value', 'key'),
                'api_key_set' => collect($this->secrets->statuses())->contains(
                    fn (array $status) => $status['key'] === 'nvidia_api_key' && ($status['available'] ?? false)
                ) || (string) config('services.nvidia.api_key') !== '',
            ]),
            'activity' => response()->json(['activity' => $this->activity()]),
            'put' => $this->putSetting($request),
            'clear_events' => $this->clearEvents($request),
            default => response()->json(['code' => 'UNKNOWN_ENDPOINT', 'message' => 'Unknown settings endpoint.'], 404),
        };
    }

    private function overview(string $range): array
    {
        return Cache::store('file')->remember("ai-monitor:overview:{$range}", now()->addSeconds(15), function () use ($range): array {
            $startedAt = microtime(true);
            $row = DB::connection('pgsql_ai')->selectOne(<<<'SQL'
            select json_build_object(
                'trend', coalesce((select json_agg(row_to_json(t)) from ai.overview_trend(?) t), '[]'::json),
                'totals', (select row_to_json(t) from ai.overview_totals(?) t),
                'previous', (select row_to_json(t) from ai.overview_prev(?) t),
                'top', coalesce((select json_agg(row_to_json(t)) from ai.top_programmes() t), '[]'::json),
                'heatmap', coalesce((select json_agg(row_to_json(t)) from ai.heatmap() t), '[]'::json),
                'feedback', (select row_to_json(t) from ai.feedback_counts(?) t),
                'guardrails', (select row_to_json(t) from ai.guardrail_counts(?) t),
                'documents', (select json_build_object(
                    'count', count(distinct programme_id),
                    'chunks', count(*),
                    'characters', coalesce(sum(length(chunk_text)), 0)
                ) from ai.programme_chunks where published = true and source_type like 'knowledge_%')
            ) as result
            SQL, [$range, $range, $range, $range, $range]);
            $data = json_decode((string) ($row->result ?? '{}'));
            $trend = collect($data->trend ?? [])->map(fn ($row) => [
                'ts' => (int) $row->ts,
                'messages' => (int) $row->messages,
                'usersOnline' => (int) $row->clients,
                'avgResponseMs' => (int) $row->avg_ms,
                'errorRate' => (float) $row->fallback_pct,
                'tokens' => (int) $row->tokens,
                'byChannel' => ['web' => (int) $row->messages, 'mobile' => 0, 'api' => 0],
            ])->all();
            $totals = $data->totals ?? (object) [];
            $previous = $data->previous ?? (object) [];
            $top = collect($data->top ?? []);
            $topTotal = max(1, (int) $top->sum(fn ($row) => (int) $row->queries));
            $heatmap = array_fill(0, 7, array_fill(0, 24, 0));
            foreach ($data->heatmap ?? [] as $cell) {
                $heatmap[(int) $cell->dow][(int) $cell->h] = (int) $cell->c;
            }
            $feedback = $data->feedback ?? (object) [];
            $guardrails = $data->guardrails ?? (object) [];
            $documents = $data->documents ?? (object) [];
            $likes = (int) ($feedback->likes ?? 0);
            $dislikes = (int) ($feedback->dislikes ?? 0);
            $rated = $likes + $dislikes;

            return [
                'range' => $range,
                'trend' => $trend,
                'channelTotals' => ['web' => (int) ($totals->messages ?? 0), 'mobile' => 0, 'api' => 0],
                'heatmap' => $heatmap,
                'totals' => [
                    'messages' => (int) ($totals->messages ?? 0),
                    'sessions' => (int) ($totals->sessions ?? 0),
                    'avgResponseMs' => (int) ($totals->avg_ms ?? 0),
                    'errorRate' => (float) ($totals->fallback_pct ?? 0),
                    'tokens' => (int) ($totals->tokens ?? 0),
                    'totalUsers' => (int) ($totals->total_clients ?? 0),
                    'newUsers' => (int) ($totals->sessions ?? 0),
                    'satisfied' => round(100 - (float) ($totals->fallback_pct ?? 0), 1),
                ],
                'prevTotals' => [
                    'messages' => (int) ($previous->messages ?? 0),
                    'avgResponseMs' => (int) ($previous->avg_ms ?? 0),
                    'errorRate' => (float) ($previous->fallback_pct ?? 0),
                    'newUsers' => 0,
                ],
                'topProgrammes' => $top->map(fn ($row) => [
                    'name' => (string) $row->name,
                    'queries' => (int) $row->queries,
                    'share' => round(100 * (int) $row->queries / $topTotal, 1),
                ])->values()->all(),
                'feedback' => compact('likes', 'dislikes', 'rated') + [
                    'positivePct' => $rated > 0 ? round(100 * $likes / $rated, 1) : null,
                ],
                'guardrails' => [
                    'precheck' => (int) ($guardrails->precheck ?? 0),
                    'postcheck' => (int) ($guardrails->postcheck ?? 0),
                    'offtopic' => (int) ($guardrails->offtopic ?? 0),
                ],
                'documentStats' => [
                    'count' => (int) ($documents->count ?? 0),
                    'chunks' => (int) ($documents->chunks ?? 0),
                    'tokens' => (int) ceil((int) ($documents->characters ?? 0) / 4),
                    'indexing' => DB::table('knowledge_sources')->whereIn('status', ['quarantined', 'processing', 'release-pending'])->count(),
                    'failed' => DB::table('knowledge_sources')->where('status', 'failed')->count(),
                ],
                'services' => [[
                    'id' => 'telemetry',
                    'name' => 'AI telemetry database',
                    'group' => 'Supabase',
                    'status' => 'good',
                    'latencyMs' => (int) round((microtime(true) - $startedAt) * 1000),
                    'statusNote' => 'Current aggregate query completed successfully',
                    'checkedAt' => now()->getTimestampMs(),
                ], $this->outboxHealth()],
            ];
        });
    }

    private function events(Request $request): array
    {
        $range = $this->range($request, '90d');
        $severity = in_array($request->query('severity'), ['warning', 'info'], true) ? $request->query('severity') : 'all';
        $action = $request->query('action') === 'chat.feedback' ? 'chat.feedback' : 'all';
        $page = max(1, (int) $request->query('page', 1));
        $pageSize = max(1, min(100, (int) $request->query('pageSize', 15)));
        $row = DB::connection('pgsql_ai')->selectOne(
            'select ai.events_page(?, ?, ?, ?, ?, ?) as result',
            [$range, $severity, $action, substr(trim((string) $request->query('q', '')), 0, 120), $page, $pageSize]
        );
        $result = json_decode((string) ($row->result ?? '{}'), true) ?: [];

        return [
            'events' => array_map(fn (array $event) => $this->event($event), $result['events'] ?? []),
            'total' => (int) ($result['total'] ?? 0),
            'page' => (int) ($result['page'] ?? $page),
            'pageCount' => (int) ($result['pageCount'] ?? 1),
        ];
    }

    private function live(): array
    {
        $row = DB::connection('pgsql_ai')->selectOne('select ai.live_stats() as result');
        $stats = json_decode((string) ($row->result ?? '{}'), true) ?: [];
        $now = (int) round(microtime(true) * 1000);

        return [
            'now' => $now,
            'usersOnline' => (int) ($stats['users_online'] ?? 0),
            'messagesToday' => (int) ($stats['messages_today'] ?? 0),
            'tokensToday' => (int) ($stats['tokens_today'] ?? 0),
            'endpointLatency' => (object) [],
            'recentEvents' => array_map(fn (array $event) => $this->event($event), $stats['recent'] ?? []),
            'apiOverall' => 'good',
            'lastTick' => $now,
        ];
    }

    private function documents(): array
    {
        $rows = DB::connection('pgsql_ai')->select(<<<'SQL'
            select programme_id, max(programme_name) as name, max(source_type) as source_type,
                max(source_version) as version, count(*) as chunks,
                coalesce(sum(length(chunk_text)), 0) as characters, max(updated_at) as indexed_at
            from ai.programme_chunks where published = true and source_type like 'knowledge_%'
            group by programme_id order by name
            SQL);

        return array_map(fn ($row) => [
            'id' => (string) $row->programme_id,
            'name' => (string) $row->name,
            'type' => 'database',
            'sizeKb' => max(1, (int) ceil((int) $row->characters / 1024)),
            'status' => 'indexed',
            'progress' => 100,
            'chunks' => (int) $row->chunks,
            'tokens' => (int) ceil((int) $row->characters / 4),
            'uploadedAt' => strtotime((string) $row->indexed_at) * 1000,
            'indexedAt' => strtotime((string) $row->indexed_at) * 1000,
            'log' => [sprintf('Published %s version %d indexed', $row->source_type, $row->version)],
        ], $rows);
    }

    private function documentStats(): array
    {
        return Cache::store('file')->remember('ai-monitor:document-stats', now()->addSeconds(15), function (): array {
            $row = DB::connection('pgsql_ai')->selectOne(<<<'SQL'
            select count(distinct programme_id) as count, count(*) as chunks,
                coalesce(sum(length(chunk_text)), 0) as characters
            from ai.programme_chunks where published = true and source_type like 'knowledge_%'
            SQL);

            return [
                'count' => (int) $row->count,
                'chunks' => (int) $row->chunks,
                'tokens' => (int) ceil((int) $row->characters / 4),
                'indexing' => DB::table('knowledge_sources')->whereIn('status', ['quarantined', 'processing', 'release-pending'])->count(),
                'failed' => DB::table('knowledge_sources')->where('status', 'failed')->count(),
            ];
        });
    }

    private function outboxHealth(): array
    {
        $query = DB::table('integration_outbox')
            ->whereNull('processed_at')
            ->whereIn('event_type', $this->aiPublicationEvents());
        $pending = (clone $query)->count();
        $repeatedFailures = (clone $query)->where('attempts', '>=', 3)->count();
        $stuck = (clone $query)->where('created_at', '<=', now()->subMinutes(15))->count();
        $oldest = (clone $query)->min('created_at');
        $status = $repeatedFailures > 0 ? 'serious' : ($stuck > 0 ? 'warning' : 'good');

        $note = $pending === 0
            ? 'No publication events are waiting for indexing'
            : "{$pending} publication event(s) pending";
        if ($repeatedFailures > 0) {
            $note .= "; {$repeatedFailures} have failed at least three times";
        } elseif ($stuck > 0) {
            $note .= "; {$stuck} have waited longer than 15 minutes";
        }
        if ($oldest) {
            $note .= '; oldest queued '.\Illuminate\Support\Carbon::parse($oldest)->diffForHumans();
        }

        return [
            'id' => 'publication-index',
            'name' => 'AI publication index queue',
            'group' => 'Application outbox',
            'status' => $status,
            'latencyMs' => 0,
            'statusNote' => $note,
            'checkedAt' => now()->getTimestampMs(),
        ];
    }

    private function aiPublicationEvents(): array
    {
        return [
            'programme.published', 'programme.unpublished',
            'affiliated-institution.published', 'affiliated-institution.unpublished',
            'knowledge-source.published', 'knowledge-source.unpublished',
        ];
    }

    private function putSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', Rule::in([
                'ai_status', 'maintenance_message', 'bot_name', 'accent_color',
                'greeting', 'rate_limit_per_hour', 'temperature', 'chat_models',
                'msg_precheck', 'msg_nochunks', 'msg_blocked', 'msg_error', 'msg_ratelimit',
                'msg_disclaimer', 'system_prompt', 'context_chunks', 'stream_speed_ms',
                'history_turns', 'suggestions', 'profile_avatar',
            ])],
            'value' => ['present', 'string', 'max:700000'],
            'current_password' => ['required', 'string', 'max:255'],
        ]);

        $this->confirmCurrentPassword($request, $data['current_password']);
        $this->validateSettingValue($data['key'], $data['value']);

        DB::connection('pgsql_ai')->table('monitor_settings')->upsert([
            ['key' => $data['key'], 'value' => $data['value'], 'updated_at' => now()],
        ], ['key'], ['value', 'updated_at']);
        $this->logActivity($request, 'settings.update', $data['key'].' updated');

        return response()->json(['ok' => true, 'key' => $data['key']]);
    }

    private function clearEvents(Request $request): JsonResponse
    {
        $data = $request->validate([
            'days' => ['required', 'integer', 'min:0', 'max:3650'],
            'current_password' => ['required', 'string', 'max:255'],
        ]);
        $this->confirmCurrentPassword($request, $data['current_password']);

        $query = DB::connection('pgsql_ai')->table('monitor_events');
        if ((int) $data['days'] > 0) {
            $query->where('ts', '<', now()->subDays((int) $data['days']));
        }
        $deleted = $query->delete();
        foreach (['today', '7d', '30d', '90d'] as $range) {
            Cache::store('file')->forget("ai-monitor:overview:{$range}");
        }
        $this->logActivity($request, 'danger.clear_events', "Deleted {$deleted} AI monitor events");

        return response()->json(['ok' => true, 'deleted' => $deleted]);
    }

    private function confirmCurrentPassword(Request $request, string $password): void
    {
        if (! Hash::check($password, (string) $request->user()->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'The current password is incorrect.',
            ]);
        }
    }

    private function validateSettingValue(string $key, string $value): void
    {
        $valid = match ($key) {
            'ai_status' => in_array($value, ['online', 'stopped'], true),
            'accent_color' => preg_match('/^#[0-9a-f]{6}$/i', $value) === 1,
            'rate_limit_per_hour' => filter_var($value, FILTER_VALIDATE_INT) !== false
                && (int) $value >= 1 && (int) $value <= 200,
            'temperature' => is_numeric($value) && (float) $value >= 0 && (float) $value <= 1,
            'context_chunks' => filter_var($value, FILTER_VALIDATE_INT) !== false
                && (int) $value >= 1 && (int) $value <= 12,
            'history_turns' => filter_var($value, FILTER_VALIDATE_INT) !== false
                && (int) $value >= 1 && (int) $value <= 20,
            'stream_speed_ms' => filter_var($value, FILTER_VALIDATE_INT) !== false
                && (int) $value >= 0 && (int) $value <= 200,
            'system_prompt' => str_contains($value, '{{context}}') && mb_strlen($value) <= 30000,
            'chat_models' => $this->validModelChain($value),
            'profile_avatar' => $value === '' || (
                strlen($value) <= 700000
                && preg_match('#^data:image/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\r\n]+$#', $value) === 1
            ),
            'bot_name' => $this->textLengthBetween($value, 1, 80),
            'greeting', 'maintenance_message', 'msg_precheck', 'msg_nochunks', 'msg_blocked',
            'msg_error', 'msg_ratelimit', 'msg_disclaimer' => $this->textLengthBetween($value, 1, 2000),
            'suggestions' => mb_strlen($value) <= 4000,
            default => false,
        };

        if (! $valid) {
            throw ValidationException::withMessages([
                'value' => "The value supplied for {$key} is invalid.",
            ]);
        }
    }

    private function validModelChain(string $value): bool
    {
        $models = array_values(array_filter(array_map('trim', preg_split('/\R/', $value) ?: [])));

        return count($models) >= 1
            && count($models) <= 3
            && collect($models)->every(fn (string $model) => preg_match('#^[A-Za-z0-9._:/-]{1,160}$#', $model) === 1);
    }

    private function textLengthBetween(string $value, int $min, int $max): bool
    {
        $length = mb_strlen(trim($value));

        return $length >= $min && $length <= $max;
    }

    private function activity(): array
    {
        return DB::connection('pgsql_ai')->table('console_activity')->latest('ts')->limit(50)->get()->map(fn ($row) => [
            'id' => 'ca-'.$row->id,
            'ts' => strtotime((string) $row->ts) * 1000,
            'actor' => (string) $row->actor,
            'action' => (string) $row->action,
            'detail' => (string) ($row->detail ?? ''),
        ])->all();
    }

    private function logActivity(Request $request, string $action, string $detail): void
    {
        DB::connection('pgsql_ai')->table('console_activity')->insert([
            'actor' => $request->user()->email,
            'action' => $action,
            'detail' => $detail,
            'ts' => now(),
        ]);
    }

    private function event(array $row): array
    {
        $fallback = (bool) ($row['fallback_used'] ?? false);
        $guardrail = $row['guardrail'] ?? null;
        $parts = ['Chat turn'];
        if (isset($row['question_len'])) {
            $parts[] = (int) $row['question_len'].' chars in';
        }
        if (isset($row['chunks_found'])) {
            $parts[] = (int) $row['chunks_found'].' chunks';
        }
        if (! empty($row['programme_name'])) {
            $parts[] = 'scoped to '.$row['programme_name'];
        }
        if ($guardrail) {
            $parts[] = 'guardrail: '.$guardrail;
        }
        if ($fallback) {
            $parts[] = 'fallback used';
        }
        if (! empty($row['feedback'])) {
            $parts[] = 'feedback: '.$row['feedback'];
        }

        $actor = ! empty($row['client_id'])
            ? 'visitor-'.substr(hash_hmac('sha256', (string) $row['client_id'], (string) config('app.key')), 0, 12)
            : 'anonymous';

        return [
            'id' => 'evt-'.$row['id'],
            'ts' => (int) ($row['ts_epoch'] ?? 0),
            'actor' => $actor,
            'action' => ! empty($row['feedback']) ? 'chat.feedback' : 'chat.message',
            'severity' => ($fallback || $guardrail) ? 'warning' : 'info',
            'detail' => implode(' · ', $parts),
            'ip' => '',
            'sessionId' => $actor,
        ];
    }

    private function range(Request $request, string $default = '7d'): string
    {
        $range = (string) $request->query('range', $default);

        return in_array($range, ['today', '7d', '30d', '90d'], true) ? $range : $default;
    }
}
