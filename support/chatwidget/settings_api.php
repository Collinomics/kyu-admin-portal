<?php
/**
 * ============================================================================
 *  settings_api.php — READ/WRITE SETTINGS + DANGER-ZONE OPERATIONS
 * ============================================================================
 *  The dashboard's Settings page talks to this file. Unlike monitor_api.php
 *  (strictly read-only analytics) this one WRITES:
 *
 *    GET  settings_api.php?endpoint=get              -> all settings
 *    POST settings_api.php?endpoint=put              -> save one key/value
 *    POST settings_api.php?endpoint=clear_events     -> DANGER ZONE: delete
 *                                                       chat events older than
 *                                                       N days (body: days)
 *    GET  settings_api.php?endpoint=activity         -> recent console actions
 *
 *  Every write also lands in console_activity, so the Settings page's
 *  "Console activity" list shows who changed what. In production this file
 *  should sit behind the same access control as the rest of the console.
 * ============================================================================
 */

declare(strict_types=1);

require_once __DIR__ . '/db_rest.php';
require_once __DIR__ . '/http_security.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
apply_cors('CONSOLE_ORIGINS', ['GET', 'POST', 'OPTIONS'], true);
require_console_admin();

/** Best-effort actor name for the console log (the console sends it). */
function console_actor(): string
{
    $raw = json_decode(file_get_contents('php://input'), true);
    return substr(trim((string) ($raw['actor'] ?? 'admin')), 0, 80) ?: 'admin';
}

try {
    $endpoint = $_GET['endpoint'] ?? 'get';
    match ($endpoint) {
        'get'          => respond_get(),
        'put'          => respond_put(),
        'clear_events' => respond_clear_events(),
        'activity'     => respond_activity(),
        default        => throw new RuntimeException('Unknown endpoint: ' . $endpoint),
    };
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function respond_get(): void
{
    $settings = get_all_settings();
    // Remove any legacy stored secret. New secrets are environment-only.
    unset($settings['api_key']);
    $keySet = security_env('NVIDIA_API_KEY') !== '';
    echo json_encode(['settings' => $settings, 'api_key_set' => $keySet]);
}

function respond_put(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'POST required']);
        return;
    }
    $body = json_decode(file_get_contents('php://input'), true);
    $key = (string) ($body['key'] ?? '');
    $value = (string) ($body['value'] ?? '');
    $actor = (string) ($body['actor'] ?? 'admin');
    $allowedKeys = [
        'ai_status', 'maintenance_mode', 'maintenance_message',
        'bot_name', 'accent_color', 'greeting', 'rate_limit_per_min',
        'temperature', 'embed_model', 'chat_models', 'msg_precheck',
        'msg_nochunks', 'msg_blocked', 'msg_error', 'msg_ratelimit',
        'msg_disclaimer', 'system_prompt', 'context_chunks',
        'stream_speed_ms', 'history_turns', 'suggestions', 'profile_avatar',
    ];
    if (!in_array($key, $allowedKeys, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'setting is not editable through this API']);
        return;
    }
    $maxLength = $key === 'profile_avatar' ? 700000 : ($key === 'system_prompt' ? 20000 : 5000);
    if (strlen($value) > $maxLength) {
        http_response_code(422);
        echo json_encode(['error' => 'setting value is too large']);
        return;
    }
    set_setting($key, $value);
    // never write secret values into the console-activity log, and keep
    // large binary-ish values (avatar images) out of it too
    $logValue = $key === 'api_key'
        ? '•••••••• (hidden)'
        : ($key === 'profile_avatar'
            ? '<avatar image, ' . strlen($value) . ' bytes>'
            : $value);
    log_console_action($actor, 'settings.update', $key . ' = ' . (strlen($logValue) > 60 ? substr($logValue, 0, 60) . '…' : $logValue));
    echo json_encode(['ok' => true, 'key' => $key, 'value' => $key === 'api_key' ? '' : $value]);
}

function respond_clear_events(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'POST required']);
        return;
    }
    $body = json_decode(file_get_contents('php://input'), true);
    $days = (int) ($body['days'] ?? 0); // 0 = everything
    $actor = (string) ($body['actor'] ?? 'admin');

    $deleted = clear_events($days);
    log_console_action($actor, 'danger.clear_events', $days > 0 ? "deleted $deleted chat events older than $days days" : "deleted ALL $deleted chat events");
    echo json_encode(['ok' => true, 'deleted' => $deleted]);
}

function respond_activity(): void
{
    $rows = get_console_activity(50);
    $out = array_map(static fn (array $r): array => [
        'id'     => 'ca-' . $r['id'],
        'ts'     => (int) round((float) (new DateTime($r['ts']))->format('U.u') * 1000),
        'actor'  => (string) $r['actor'],
        'action' => (string) $r['action'],
        'detail' => (string) ($r['detail'] ?? ''),
    ], $rows);
    echo json_encode(['activity' => $out]);
}
