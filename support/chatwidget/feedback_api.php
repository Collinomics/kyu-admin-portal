<?php
/**
 * ============================================================================
 *  feedback_api.php — RECEIVES 👍/👎 FROM THE WIDGET
 * ============================================================================
 *  POST /api/feedback_api.php
 *
 *  Body: { "turn_id": 42, "feedback": "like" | "dislike" | null,
 *          "client_id": "anonymous browser id" }
 *
 *  Attaches (or clears) the visitor's feedback on one chat turn, matched
 *  by the turn_id the backend returned with that answer. Nothing else —
 *  no question/answer text, no PII (FR3.12).
 * ============================================================================
 */

declare(strict_types=1);

require_once __DIR__ . '/http_security.php';
apply_cors('PUBLIC_WIDGET_ORIGINS', ['POST', 'OPTIONS']);

header('Content-Type: application/json');

require __DIR__ . '/monitor.php';

$body = json_decode(file_get_contents('php://input'), true);
$turnId   = (int)($body['turn_id'] ?? 0);
$feedback = $body['feedback'] ?? null;
$clientId = substr(trim((string) ($body['client_id'] ?? '')), 0, 64);

// whitelist the allowed values - anything else is treated as "cleared"
if (!in_array($feedback, ['like', 'dislike'], true)) {
    $feedback = null;
}

if ($turnId <= 0 || !preg_match('/^[a-zA-Z0-9-]{8,64}$/', $clientId)) {
    http_response_code(400);
    echo json_encode(['error' => 'valid turn_id and client_id are required.']);
    exit;
}

if (!set_turn_feedback($turnId, $clientId, $feedback)) {
    http_response_code(404);
    echo json_encode(['error' => 'chat turn not found.']);
    exit;
}
echo json_encode(['ok' => true, 'feedback' => $feedback]);
