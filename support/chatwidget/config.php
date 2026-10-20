<?php
/**
 * ============================================================================
 *  config.php — ALL THE SETTINGS OF THE ASSISTANT
 * ============================================================================
 *  Everything here reads from environment variables first, and falls back
 *  to a default if they are not set:
 *
 *    NVIDIA_API_KEY    your key from build.nvidia.com — REQUIRED, there is
 *                      no sensible default. Set it in your shell before
 *                      starting PHP:
 *                          set NVIDIA_API_KEY=nvapi-...
 *                      or set it via SetEnv in Apache's httpd.conf (the
 *                      XAMPP Apache service does NOT inherit your normal
 *                      shell environment variables).
 *
 *    NVIDIA_EMBED_MODEL  the model that turns text into search vectors.
 *                        If you switch models, CHECK ITS VECTOR DIMENSION —
 *                        schema.sql stores VECTOR(1024) for
 *                        nv-embedqa-e5-v5. A different dimension requires
 *                        rebuilding the table + index in schema.sql.
 *
 *    NVIDIA_CHAT_MODEL   the model that writes the answers.
 *
 *  Keep this file out of version control (.gitignore) and load real values
 *  from environment variables in production - these are placeholders.
 * ============================================================================
 */

// Console-managed values (the dashboard's Settings page) sit in the
// monitor_settings table. Precedence everywhere: environment variable
// (production secrets) > console setting > built-in default.
require_once __DIR__ . '/db_rest.php';

define('NVIDIA_BASE_URL', ai_database_env('NVIDIA_BASE_URL', 'NVIDIA_BASE_URL', 'https://integrate.api.nvidia.com'));

// Secrets are environment-only. They must never be stored in monitor_settings
// or accepted from a browser-facing administrator form.
define('NVIDIA_API_KEY', ai_database_env('NVIDIA_API_KEY', 'NVIDIA_API_KEY'));

// pick your models from build.nvidia.com's catalog.
// NOTE: nv-embedqa-e5-v5 (the original default) was retired by NVIDIA on
// 2026-08-25; the replacement below emits 2048-dim vectors, which is what
// schema.sql now stores. If you switch embedding models again, CHECK ITS
// VECTOR DIMENSION — a different dimension requires rebuilding the table
// and index in schema.sql and re-seeding.
define('NVIDIA_EMBED_MODEL', getenv('NVIDIA_EMBED_MODEL') ?: get_setting('embed_model') ?: 'nvidia/llama-nemotron-embed-vl-1b-v2');

// Chat models are tried IN ORDER — the first one that answers is used.
// NVIDIA retires/de-provisions models without warning (llama-3.1-70b-instruct
// died on this account 2026-08-26), so keep working spares in this list.
// The list itself can be overridden from the Settings page (one model per
// line in the "chat_models" setting).
// All four below were verified working on 2026-08-26.
$dbChatModels = get_setting('chat_models');
$dbChatModelList = ($dbChatModels !== null && trim($dbChatModels) !== '')
    ? array_values(array_filter(array_map('trim', explode("\n", $dbChatModels))))
    : [];
define('NVIDIA_CHAT_MODELS', $dbChatModelList ?: [
    'openai/gpt-oss-20b',        // reasoning model - primary (fast when NVIDIA's queue is clear)
    'minimaxai/minimax-m3',      // non-reasoning - spare 1 (answers instantly when up)
    'moonshotai/kimi-k3',        // reasoning model - spare 2
    'meta/muse-glimmer-30b',     // reasoning model - spare 3
]);
