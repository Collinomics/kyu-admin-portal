<?php

/** Compatibility layer using the restricted ai_runtime PostgreSQL role. */

declare(strict_types=1);

require_once __DIR__ . '/db.php';

function supa_request(string $method, string $path, ?array $body = null, string $prefer = ''): array
{
    if ($method === 'POST' && $path === '/rest/v1/programme_chunks') {
        upsert_programme_chunk($body ?? []);
        return [];
    }
    if ($method !== 'POST' || !preg_match('#^/rest/v1/rpc/([a-z_]+)$#', $path, $matches)) {
        throw new RuntimeException('Unsupported legacy database operation.');
    }
    $function = $matches[1];
    $allowed = [
        'recent_turns', 'recent_turns_by_ip', 'search_chunks', 'catalogue_stats',
        'overview_trend', 'overview_totals', 'overview_prev', 'top_programmes',
        'heatmap', 'feedback_counts', 'guardrail_counts', 'events_page', 'live_stats',
    ];
    if (!in_array($function, $allowed, true)) throw new RuntimeException('Unknown AI database function.');

    $placeholders = [];
    $bindings = [];
    foreach ($body ?? [] as $name => $value) {
        if (!preg_match('/^p_[a-z_]+$/', (string) $name)) throw new RuntimeException('Invalid AI database parameter.');
        $placeholder = ':arg_' . count($bindings);
        $placeholders[] = $placeholder;
        $bindings[$placeholder] = $value;
    }
    $statement = db()->prepare(sprintf('select * from ai.%s(%s)', $function, implode(', ', $placeholders)));
    $statement->execute($bindings);
    $rows = $statement->fetchAll();
    if (in_array($function, ['recent_turns', 'recent_turns_by_ip'], true)) {
        return [(int) (array_values($rows[0] ?? [0])[0])];
    }
    if (in_array($function, ['events_page', 'live_stats'], true)) {
        $value = array_values($rows[0] ?? ['{}'])[0];
        return [is_array($value) ? $value : (json_decode((string) $value, true) ?: [])];
    }
    return $rows;
}

function get_setting(string $key, ?string $default = null): ?string
{
    $statement = db()->prepare('select value from ai.monitor_settings where key = :key');
    $statement->execute([':key' => $key]);
    $value = $statement->fetchColumn();
    return $value === false ? $default : (string) $value;
}

function get_all_settings(): array
{
    $settings = [];
    foreach (db()->query('select key, value from ai.monitor_settings order by key')->fetchAll() as $row) {
        $settings[(string) $row['key']] = (string) ($row['value'] ?? '');
    }
    return $settings;
}

function set_setting(string $key, string $value): void
{
    $statement = db()->prepare('insert into ai.monitor_settings (key, value) values (:key, :value) on conflict (key) do update set value = excluded.value, updated_at = now()');
    $statement->execute([':key' => $key, ':value' => $value]);
}

function clear_events(int $days): int
{
    if ($days <= 0) return db()->exec('delete from ai.monitor_events');
    $statement = db()->prepare('delete from ai.monitor_events where ts < now() - make_interval(days => :days)');
    $statement->bindValue(':days', $days, PDO::PARAM_INT);
    $statement->execute();
    return $statement->rowCount();
}

function get_console_activity(int $limit = 50): array
{
    $statement = db()->prepare('select id, ts, actor, action, detail from ai.console_activity order by ts desc limit :limit');
    $statement->bindValue(':limit', max(1, min($limit, 100)), PDO::PARAM_INT);
    $statement->execute();
    return $statement->fetchAll();
}

function log_chat_turn(array $event): ?int
{
    $statement = db()->prepare('insert into ai.monitor_events (event_type, client_id, duration_ms, question_len, programme_id, chunks_found, model_used, guardrail, fallback_used, answer_len, ip_address) values (:event_type, :client_id, :duration_ms, :question_len, :programme_id, :chunks_found, :model_used, :guardrail, :fallback_used, :answer_len, cast(:ip_address as inet)) returning id');
    $statement->execute([
        ':event_type' => $event['event_type'] ?? 'chat_turn', ':client_id' => $event['client_id'] ?? null,
        ':duration_ms' => $event['duration_ms'] ?? null, ':question_len' => $event['question_len'] ?? null,
        ':programme_id' => $event['programme_id'] ?? null, ':chunks_found' => $event['chunks_found'] ?? null,
        ':model_used' => $event['model_used'] ?? null, ':guardrail' => $event['guardrail'] ?? null,
        ':fallback_used' => (bool) ($event['fallback_used'] ?? false), ':answer_len' => $event['answer_len'] ?? null,
        ':ip_address' => $event['ip_address'] ?? null,
    ]);
    $id = $statement->fetchColumn();
    return $id === false ? null : (int) $id;
}

function set_turn_feedback(int $turnId, string $clientId, ?string $feedback): bool
{
    $statement = db()->prepare('update ai.monitor_events set feedback = :feedback, feedback_ts = now() where id = :id and client_id = :client_id');
    $statement->execute([':feedback' => $feedback, ':id' => $turnId, ':client_id' => $clientId]);
    return $statement->rowCount() === 1;
}

function count_recent_turns(string $clientId, int $minutes = 1): int
{
    return (int) (supa_request('POST', '/rest/v1/rpc/recent_turns', ['p_client_id' => $clientId, 'p_minutes' => $minutes])[0] ?? 0);
}

function count_recent_turns_by_ip(string $ipAddress, int $minutes = 1): int
{
    return (int) (supa_request('POST', '/rest/v1/rpc/recent_turns_by_ip', ['p_ip_address' => $ipAddress, 'p_minutes' => $minutes])[0] ?? 0);
}

function pgvector_search(array $vector, ?string $programmeId, int $topK): array
{
    if ($vector === []) return [];
    return supa_request('POST', '/rest/v1/rpc/search_chunks', [
        'p_query_embedding' => to_pgvector($vector), 'p_programme_id' => $programmeId, 'p_top_k' => $topK,
    ]);
}

function build_catalogue_stats(): string
{
    $rows = supa_request('POST', '/rest/v1/rpc/catalogue_stats', []);
    return implode("\n", array_map(static fn (array $row): string => sprintf(
        '- %s: %d', ucfirst((string) $row['level']), (int) $row['programmes']
    ), $rows));
}

function log_console_action(string $actor, string $action, string $detail): void
{
    $statement = db()->prepare('insert into ai.console_activity (actor, action, detail) values (:actor, :action, :detail)');
    $statement->execute([':actor' => $actor, ':action' => $action, ':detail' => $detail]);
}

function programme_level(array $programme): string
{
    $id = strtolower((string) ($programme['id'] ?? ''));
    return match (true) {
        str_starts_with($id, 'ug-') => 'undergraduate',
        str_starts_with($id, 'pg-') => 'postgraduate',
        str_starts_with($id, 'aff-') => 'affiliated',
        default => 'unknown',
    };
}

function upsert_programme_chunk(array $row): void
{
    $statement = db()->prepare('insert into ai.programme_chunks (id, programme_id, programme_name, level, section, chunk_text, embedding, published, updated_at) values (:id, :programme_id, :programme_name, :level, :section, :chunk_text, cast(:embedding as extensions.vector), :published, now()) on conflict (id) do update set programme_id = excluded.programme_id, programme_name = excluded.programme_name, level = excluded.level, section = excluded.section, chunk_text = excluded.chunk_text, embedding = excluded.embedding, published = excluded.published, updated_at = now()');
    $statement->execute([
        ':id' => (string) ($row['id'] ?? ''), ':programme_id' => (string) ($row['programme_id'] ?? ''),
        ':programme_name' => (string) ($row['programme_name'] ?? ''), ':level' => (string) ($row['level'] ?? 'unknown'),
        ':section' => (string) ($row['section'] ?? ''), ':chunk_text' => (string) ($row['chunk_text'] ?? ''),
        ':embedding' => (string) ($row['embedding'] ?? ''), ':published' => (bool) ($row['published'] ?? false),
    ]);
}

