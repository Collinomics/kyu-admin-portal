<?php
/**
 * ============================================================================
 *  monitor.php — STRUCTURED EVENT LOGGING FOR THE ANALYSIS TOOL
 * ============================================================================
 *  Every chat turn and every 👍/👎 tap becomes one row in monitor_events
 *  (same database as programme_chunks, clearly separated tables).
 *
 *  PRIVACY: no question text, no answer text, no names. Lengths, counts,
 *  timings and an anonymous per-browser client_id. The client IP is stored
 *  (ip_address) for the audit trail — it is personal data, so keep access
 *  to this console restricted to authorised staff.
 * ============================================================================
 */

declare(strict_types=1);

// NOTE: log_chat_turn() and set_turn_feedback() now live in db_rest.php
// (the REST data layer used by the hosted stack) — this file only keeps
// the DB-independent helpers below.

/**
 * Best-effort client IP for the audit log.
 * REMOTE_ADDR is the direct peer. If a trusted reverse proxy sits in front
 * (Apache/nginx in production), it stamps the real client into
 * X-Forwarded-For - but that header is spoofable by anyone who reaches PHP
 * directly, so only trust it when you KNOW a proxy is in front.
 */
function client_ip(): ?string
{
    $trustProxy = strtolower((string) (getenv('TRUST_PROXY_HEADERS') ?: (defined('TRUST_PROXY_HEADERS') ? constant('TRUST_PROXY_HEADERS') : '0')));
    $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if (in_array($trustProxy, ['1', 'true', 'yes'], true) && $xff !== '') {
        $parts = explode(',', $xff);
        $candidate = trim($parts[0]);
        return filter_var($candidate, FILTER_VALIDATE_IP) ? $candidate : null;
    }
    $candidate = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    return filter_var($candidate, FILTER_VALIDATE_IP) ? $candidate : null;
}

/** Milliseconds since a hrtime() snapshot (monotonic, safe to compare). */
function elapsed_ms(int $start): int
{
    return (int) round((hrtime(true) - $start) / 1_000_000);
}
