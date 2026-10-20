<?php
/**
 * ============================================================================
 *  monitor_api.php — READ-ONLY ANALYTICS FOR THE MONITORING DASHBOARD
 * ============================================================================
 *  Aggregates monitor_events into the JSON shapes the Kyambogo Monitor
 *  dashboard (Vite/React app) renders. This is the HOSTED version: all
 *  aggregation happens inside Supabase RPC functions (see supabase_setup.sql)
 *  and this file is a thin mapper over db_rest.php (PostgREST).
 *
 *    GET monitor_api.php?endpoint=overview&range=7d
 *    GET monitor_api.php?endpoint=events&page=1&pageSize=15&range=30d
 *    GET monitor_api.php?endpoint=live
 *
 *  RULES:
 *   - READ ONLY. Logging happens exclusively through log_chat_turn() /
 *     set_turn_feedback() in db_rest.php.
 *   - PRIVACY: built from lengths, counts and timings. No question text,
 *     no answer text, no names. Client IPs are included in event rows
 *     (audit trail) — treat the console as access-controlled.
 * ============================================================================
 */

declare(strict_types=1);

require_once __DIR__ . '/db_rest.php';
require_once __DIR__ . '/http_security.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
apply_cors('CONSOLE_ORIGINS', ['GET', 'OPTIONS'], true);
require_console_admin();

try {
    $endpoint = $_GET['endpoint'] ?? 'overview';
    match ($endpoint) {
        'overview' => respond_overview(),
        'events'   => respond_events(),
        'live'     => respond_live(),
        default    => throw new RuntimeException('Unknown endpoint: ' . $endpoint),
    };
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

/** A raw Supabase event row, reshaped into the dashboard's event format. */
function event_from_row(array $row): array
{
    $fallback = (bool) ($row['fallback_used'] ?? false);
    $guardrail = $row['guardrail'] ?? null;
    $parts = ['Chat turn'];
    if (isset($row['question_len'])) {
        $parts[] = (int) $row['question_len'] . ' chars in';
    }
    if (isset($row['chunks_found'])) {
        $parts[] = (int) $row['chunks_found'] . ' chunks';
    }
    if (isset($row['duration_ms'])) {
        $parts[] = round((int) $row['duration_ms'] / 1000, 1) . 's';
    }
    if (!empty($row['programme_name'])) {
        $parts[] = 'scoped to ' . $row['programme_name'];
    }
    if ($guardrail !== null) {
        $parts[] = 'guardrail: ' . $guardrail;
    }
    if ($fallback) {
        $parts[] = 'answered with the canned fallback';
    }
    if (!empty($row['model_used'])) {
        $parts[] = 'model ' . $row['model_used'];
    }
    if (!empty($row['feedback'])) {
        $parts[] = 'feedback: ' . $row['feedback'];
    }
    return [
        'id'        => 'evt-' . $row['id'],
        'ts'        => (int) ($row['ts_epoch'] ?? 0),
        'actor'     => $row['client_id'] ?: 'anonymous',
        'action'    => 'chat.message',
        'severity'  => ($fallback || $guardrail !== null) ? 'warning' : 'info',
        'detail'    => implode(' · ', $parts),
        'ip'        => $row['ip_address'] ?? '',
        'sessionId' => $row['client_id'] ?: '-',
    ];
}

// ---------------------------------------------------------------------------
// endpoint=overview
// ---------------------------------------------------------------------------
function respond_overview(): void
{
    $range = (string) ($_GET['range'] ?? '7d');
    if (!in_array($range, ['today', '7d', '30d', '90d'], true)) {
        $range = '7d';
    }

    $trendRows = supa_request('POST', '/rest/v1/rpc/overview_trend', ['p_range' => $range]);
    $trend = [];
    foreach ($trendRows as $r) {
        $messages = (int) ($r['messages'] ?? 0);
        $trend[] = [
            'ts'           => (int) ($r['ts'] ?? 0),
            'messages'     => $messages,
            'usersOnline'  => (int) ($r['clients'] ?? 0),
            'avgResponseMs'=> (int) ($r['avg_ms'] ?? 0),
            'errorRate'    => (float) ($r['fallback_pct'] ?? 0),
            'tokens'       => (int) ($r['tokens'] ?? 0),
            'byChannel'    => ['web' => $messages, 'mobile' => 0, 'api' => 0],
        ];
    }

    $totals = supa_request('POST', '/rest/v1/rpc/overview_totals', ['p_range' => $range]);
    $t = $totals[0] ?? [];
    $messages = (int) ($t['messages'] ?? 0);
    $fallbackPct = (float) ($t['fallback_pct'] ?? 0);

    $prevRows = supa_request('POST', '/rest/v1/rpc/overview_prev', ['p_range' => $range]);
    $p = $prevRows[0] ?? [];

    $topRows = supa_request('POST', '/rest/v1/rpc/top_programmes', []);
    $topSum = array_sum(array_column($topRows, 'queries')) ?: 1;
    $topProgrammes = array_map(static fn (array $r): array => [
        'name'    => (string) ($r['name'] ?? ''),
        'queries' => (int) ($r['queries'] ?? 0),
        'share'   => round(100 * (int) ($r['queries'] ?? 0) / $topSum, 1),
    ], $topRows);

    $heatmap = array_fill(0, 7, array_fill(0, 24, 0));
    foreach (supa_request('POST', '/rest/v1/rpc/heatmap', []) as $r) {
        $heatmap[(int) $r['dow']][(int) $r['h']] = (int) $r['c'];
    }

    $fbRows = supa_request('POST', '/rest/v1/rpc/feedback_counts', ['p_range' => $range]);
    $fb = $fbRows[0] ?? [];
    $likes = (int) ($fb['likes'] ?? 0);
    $dislikes = (int) ($fb['dislikes'] ?? 0);
    $rated = $likes + $dislikes;

    $grRows = supa_request('POST', '/rest/v1/rpc/guardrail_counts', ['p_range' => $range]);
    $gr = $grRows[0] ?? [];

    echo json_encode([
        'range'         => $range,
        'trend'         => $trend,
        'channelTotals' => ['web' => $messages, 'mobile' => 0, 'api' => 0],
        'heatmap'       => $heatmap,
        'totals'        => [
            'messages'     => $messages,
            'sessions'     => (int) ($t['sessions'] ?? 0),
            'avgResponseMs'=> (int) ($t['avg_ms'] ?? 0),
            'errorRate'    => $fallbackPct,
            'tokens'       => (int) ($t['tokens'] ?? 0),
            'totalUsers'   => (int) ($t['total_clients'] ?? 0),
            'newUsers'     => (int) ($t['sessions'] ?? 0),
            'satisfied'    => round(100 - $fallbackPct, 1),
        ],
        'prevTotals'    => [
            'messages'     => (int) ($p['messages'] ?? 0),
            'avgResponseMs'=> (int) ($p['avg_ms'] ?? 0),
            'errorRate'    => (float) ($p['fallback_pct'] ?? 0),
            'newUsers'     => 0,
        ],
        'topProgrammes' => $topProgrammes,
        'feedback'      => [
            'likes'       => $likes,
            'dislikes'    => $dislikes,
            'rated'       => $rated,
            'positivePct' => $rated > 0 ? round(100 * $likes / $rated, 1) : null,
        ],
        'guardrails'    => [
            'precheck'  => (int) ($gr['precheck'] ?? 0),
            'postcheck' => (int) ($gr['postcheck'] ?? 0),
            'offtopic'  => (int) ($gr['offtopic'] ?? 0),
        ],
    ]);
}

// ---------------------------------------------------------------------------
// endpoint=events — the audit log (paginated, filterable)
// ---------------------------------------------------------------------------
function respond_events(): void
{
    $range    = (string) ($_GET['range'] ?? '90d');
    if (!in_array($range, ['today', '7d', '30d', '90d'], true)) {
        $range = '90d';
    }
    $severity = (string) ($_GET['severity'] ?? 'all');
    $action   = (string) ($_GET['action'] ?? 'all');
    $q        = trim((string) ($_GET['q'] ?? ''));
    $page     = max(1, (int) ($_GET['page'] ?? 1));
    $pageSize = min(100, max(1, (int) ($_GET['pageSize'] ?? 15)));

    // the events_page RPC returns {events, total, page, pageCount} as jsonb;
    // rows are raw — reshape each through event_from_row()
    $result = supa_request('POST', '/rest/v1/rpc/events_page', [
        'p_range'     => $range,
        'p_severity'  => $severity,
        'p_action'    => $action,
        'p_q'         => $q,
        'p_page'      => $page,
        'p_page_size' => $pageSize,
    ]);
    $result = $result[0] ?? [];

    $events = array_map('event_from_row', (array) ($result['events'] ?? []));

    echo json_encode([
        'events'    => $events,
        'total'     => (int) ($result['total'] ?? 0),
        'page'      => (int) ($result['page'] ?? $page),
        'pageCount' => (int) ($result['pageCount'] ?? 1),
    ]);
}

// ---------------------------------------------------------------------------
// endpoint=live — the "now" numbers (polled every few seconds)
// ---------------------------------------------------------------------------
function respond_live(): void
{
    $result = supa_request('POST', '/rest/v1/rpc/live_stats', []);
    $s = $result[0] ?? [];

    $recent = array_map('event_from_row', (array) ($s['recent'] ?? []));
    $now = (int) round(microtime(true) * 1000);

    echo json_encode([
        'now'              => $now,
        'usersOnline'      => (int) ($s['users_online'] ?? 0),
        'messagesToday'    => (int) ($s['messages_today'] ?? 0),
        'tokensToday'      => (int) ($s['tokens_today'] ?? 0),
        'endpointLatency'  => new stdClass(), // infra health not in the DB yet
        'recentEvents'     => $recent,
        'apiOverall'       => 'good',
        'lastTick'         => $now,
    ]);
}
