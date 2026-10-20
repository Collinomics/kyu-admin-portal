<?php

/** CLI smoke test for the restricted AI database data layer. */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/db_rest.php';

function smoke_assert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$access = db()->query(<<<'SQL'
    select current_user,
        has_schema_privilege(current_user, 'ai', 'USAGE') as ai_access,
        has_schema_privilege(current_user, 'pcs', 'USAGE') as pcs_access
    SQL)->fetch();

smoke_assert(str_starts_with((string) $access['current_user'], 'ai_runtime'), 'Unexpected database role.');
smoke_assert(filter_var($access['ai_access'], FILTER_VALIDATE_BOOL), 'AI schema is inaccessible.');
smoke_assert(!filter_var($access['pcs_access'], FILTER_VALIDATE_BOOL), 'AI role can access the PCS schema.');
smoke_assert(get_setting('ai_status') === 'online', 'Default AI status was not seeded.');

$overview = supa_request('POST', '/rest/v1/rpc/overview_totals', ['p_range' => '7d']);
$live = supa_request('POST', '/rest/v1/rpc/live_stats', []);
smoke_assert(isset($overview[0]['messages']), 'Overview function returned an invalid shape.');
smoke_assert(isset($live[0]['messages_today']), 'Live function returned an invalid shape.');

$rpcChecks = [
    ['/rest/v1/rpc/recent_turns', ['p_client_id' => 'smoke-test-client', 'p_minutes' => 1]],
    ['/rest/v1/rpc/recent_turns_by_ip', ['p_ip_address' => '127.0.0.1', 'p_minutes' => 1]],
    ['/rest/v1/rpc/catalogue_stats', []],
    ['/rest/v1/rpc/overview_trend', ['p_range' => '7d']],
    ['/rest/v1/rpc/overview_prev', ['p_range' => '7d']],
    ['/rest/v1/rpc/top_programmes', []],
    ['/rest/v1/rpc/heatmap', []],
    ['/rest/v1/rpc/feedback_counts', ['p_range' => '7d']],
    ['/rest/v1/rpc/guardrail_counts', ['p_range' => '7d']],
    ['/rest/v1/rpc/events_page', [
        'p_range' => '90d', 'p_severity' => 'all', 'p_action' => 'all',
        'p_q' => '', 'p_page' => 1, 'p_page_size' => 15,
    ]],
];
foreach ($rpcChecks as [$path, $parameters]) {
    supa_request('POST', $path, $parameters);
}
pgvector_search(array_fill(0, 2048, 0.0), null, 1);

db()->beginTransaction();
try {
    $turnId = log_chat_turn([
        'client_id' => 'smoke-test-client',
        'duration_ms' => 25,
        'question_len' => 12,
        'chunks_found' => 0,
        'fallback_used' => true,
        'answer_len' => 20,
        'ip_address' => '127.0.0.1',
    ]);
    smoke_assert($turnId !== null, 'Chat event insert failed.');
    smoke_assert(set_turn_feedback($turnId, 'smoke-test-client', 'like'), 'Feedback update failed.');
} finally {
    db()->rollBack();
}

echo json_encode([
    'ok' => true,
    'role' => $access['current_user'],
    'ai_access' => true,
    'pcs_access' => false,
    'settings' => count(get_all_settings()),
    'analytics_functions' => '13/13 working',
    'write_cycle' => 'working (rolled back)',
], JSON_PRETTY_PRINT) . PHP_EOL;
