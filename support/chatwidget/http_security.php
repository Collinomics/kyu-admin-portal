<?php
/** Shared HTTP boundary for the standalone AI service. */

declare(strict_types=1);

function security_env(string $name): string
{
    $value = getenv($name);
    if ($value !== false && trim($value) !== '') {
        return trim($value);
    }
    return defined($name) ? trim((string) constant($name)) : '';
}

function json_error(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(['error' => $message]);
    exit;
}

/**
 * Applies an exact-origin CORS allow-list. With no configured allow-list,
 * only same-origin/server-to-server requests (no Origin header) are accepted.
 */
function apply_cors(string $originsEnv, array $methods, bool $allowAuthorization = false): void
{
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    $allowed = array_values(array_filter(array_map(
        'trim',
        explode(',', security_env($originsEnv))
    )));

    if ($origin !== '') {
        if (!in_array($origin, $allowed, true)) {
            json_error(403, 'origin not allowed');
        }
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }

    header('Access-Control-Allow-Methods: ' . implode(', ', $methods));
    header('Access-Control-Allow-Headers: Content-Type' . ($allowAuthorization ? ', Authorization' : ''));

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Temporary server-to-server protection for the standalone console APIs.
 * The final PCS backend must authenticate its session and proxy these calls;
 * this token must never be embedded in browser JavaScript.
 */
function require_console_admin(): void
{
    $expected = security_env('PCS_CONSOLE_TOKEN');
    if ($expected === '') {
        json_error(503, 'console API is not configured');
    }

    $header = trim((string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $matches)
        || !hash_equals($expected, trim($matches[1]))) {
        header('WWW-Authenticate: Bearer');
        json_error(401, 'administrator authentication required');
    }
}
