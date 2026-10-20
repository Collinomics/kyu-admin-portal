<?php
/**
 * ============================================================================
 *  chat_api.php — THE BRAIN OF THE CHAT WIDGET
 * ============================================================================
 *  Every time a user sends a message in the chat bubble, the browser POSTs
 *  it here. This file runs one complete "chat turn" through 5 steps:
 *
 *    Step 1  PRE-CHECK   Quick keyword scan of the QUESTION. Catches only
 *                        the obvious abuse ("admin password", "database
 *                        schema", etc). Blocked here -> canned refusal,
 *                        no AI needed, no cost.
 *
 *    Step 2  RETRIEVE    Turn the question into numbers (an "embedding"),
 *                        then ask PostgreSQL/pgvector for the ~6 programme
 *                        chunks whose meaning is CLOSEST to the question.
 *                        These chunks are the assistant's only "memory" —
 *                        it cannot know anything that isn't in them.
 *
 *    Step 3  ASK THE AI  Send those chunks + the question to the NVIDIA LLM,
 *                        together with a system prompt (the assistant's
 *                        personality + rules — see $systemPrompt below).
 *
 *    Step 4  POST-CHECK  Scan the generated ANSWER for leaks (long digit
 *                        strings, system internals, etc). A violation swaps
 *                        in a safe canned answer before the user sees it.
 *
 *    Step 5  RESPOND     Send the answer back. The widget normally asks for
 *                        stream=true -> Server-Sent Events -> the answer is
 *                        "typed out" word-by-word (ChatGPT style). Without
 *                        the flag, one plain JSON object is returned
 *                        (handy for testing with curl).
 *
 *  GOLDEN RULE: the NVIDIA API key and the database are only touched here,
 *  server-side. The browser never sees the key — it just talks to this file.
 * ============================================================================
 */

declare(strict_types=1); // strict types: passing "1" where int is expected errors out

// The fallback model chain can legitimately take a while (the primary
// reasons for ~70s on real prompts; each model gets up to 100s before the
// next spare is tried), so lift PHP's default 30s script limit. curl's
// per-call timeouts still bound the worst case.
set_time_limit(300);

require_once __DIR__ . '/http_security.php';
apply_cors('PUBLIC_WIDGET_ORIGINS', ['POST', 'OPTIONS']);

require __DIR__ . '/config.php';   // defines NVIDIA_API_KEY, NVIDIA_BASE_URL, etc. (see config.php)
require_once __DIR__ . '/db_rest.php';   // REST data layer (Supabase): get_setting, pgvector_search, log_chat_turn, ...
require __DIR__ . '/guardrails.php'; // defines guardrail_precheck_blocks() and guardrail_postcheck()
require __DIR__ . '/monitor.php';  // defines log_chat_turn() - structured events for the analysis tool

// ---- read what the browser sent us ---------------------------------------
// The widget POSTs JSON, e.g.:
//   { "question": "...", "history": [...previous turns...], "programme_id": null, "stream": true }
// php://input is the raw request body; json_decode(..., true) turns it into
// a PHP array. "?? ''" means "use '' if the key is missing".
$body = json_decode(file_get_contents('php://input'), true);
$question    = trim($body['question'] ?? '');
$history     = is_array($body['history'] ?? null) ? $body['history'] : []; // previous messages, so the AI can follow up
$programmeId = $body['programme_id'] ?? null; // if the widget sits on a specific programme page, questions get scoped to it
$clientId    = substr((string)($body['client_id'] ?? ''), 0, 64); // anonymous per-browser id, for analytics correlation only

$t0 = hrtime(true); // start the clock - total request time is logged as duration_ms

// stream=true -> Server-Sent Events so the widget can paint the answer
// progressively (ChatGPT-style typing); false -> one JSON object (curl, etc.)
$stream = (bool)($body['stream'] ?? false);

// Announce the response format BEFORE any output. The browser needs to know
// what it's receiving. In stream mode we also disable buffering so every
// chunk travels to the browser immediately instead of being held back.
if ($stream) {
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('X-Accel-Buffering: no');
    // make sure no output buffer sits between us and the browser
    @ini_set('output_buffering', 'off');
    while (ob_get_level() > 0) { ob_end_flush(); }
} else {
    header('Content-Type: application/json');
}

// Empty question -> nothing to do. Send an error and stop.
if ($question === '') {
    http_response_code(400); // 400 = "bad request"
    echo json_encode(['error' => 'Question is required.']);
    exit;
}
if (strlen($question) > 2000) {
    http_response_code(422);
    echo json_encode(['error' => 'Question is too long (maximum 2000 characters).']);
    exit;
}

// Treat browser-supplied history as untrusted input: keep only the most
// recent valid roles and cap each turn before it reaches the model.
$history = array_values(array_filter(array_map(static function ($turn): ?array {
    if (!is_array($turn) || !in_array($turn['role'] ?? '', ['user', 'assistant'], true)) {
        return null;
    }
    return [
        'role' => $turn['role'],
        'text' => substr((string) ($turn['text'] ?? ''), 0, 4000),
    ];
}, array_slice($history, -20))));

$clientIp = client_ip();
if (!preg_match('/^[a-zA-Z0-9-]{8,64}$/', $clientId)) {
    // A stable server-derived fallback prevents an empty/invalid client id
    // from disabling both analytics correlation and the basic rate limit.
    $fingerprint = ($clientIp ?? 'unknown') . '|' . (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
    $clientId = 'anon-' . substr(hash('sha256', $fingerprint), 0, 40);
}

// ---- Step 0: console kill-switch + rate limit -------------------------------
// The Settings page can force-stop the assistant (maintenance / 404 mode)
// and cap how many messages one client can send per minute. Both are cheap
// DB reads and run before ANY AI work, so a stopped assistant costs nothing.
if (get_setting('ai_status', 'online') !== 'online') {
    $mode = get_setting('maintenance_mode', 'maintenance');
    $answerText = $mode === '404'
        ? "404 - the assistant is temporarily unavailable. Please check back later."
        : (get_setting('maintenance_message') ?: "The assistant is under maintenance. Please check back later.");
    $turnId = log_chat_turn([
        'client_id'     => $clientId,
        'duration_ms'   => elapsed_ms($t0),
        'question_len'  => strlen($question),
        'programme_id'  => $programmeId,
        'chunks_found'  => 0,
        'guardrail'     => 'maintenance',
        'fallback_used' => true,
        'answer_len'    => strlen($answerText),
        'ip_address'    => client_ip(),
    ]);
    respond($answerText, null, $stream, $turnId);
    exit;
}

$rateLimit = max(1, (int) (get_setting('rate_limit_per_min', '10') ?? '10'));
$clientLimitReached = count_recent_turns($clientId, 1) >= $rateLimit;
$ipLimitReached = $clientIp !== null && count_recent_turns_by_ip($clientIp, 1) >= $rateLimit;
if ($clientLimitReached || $ipLimitReached) {
        $answerText = get_setting('msg_ratelimit', "You're sending messages a bit too quickly - please wait a moment and try again.");
        $turnId = log_chat_turn([
            'client_id'     => $clientId,
            'duration_ms'   => elapsed_ms($t0),
            'question_len'  => strlen($question),
            'programme_id'  => $programmeId,
            'chunks_found'  => 0,
            'guardrail'     => 'rate_limit',
            'fallback_used' => true,
            'answer_len'    => strlen($answerText),
            'ip_address'    => $clientIp,
        ]);
        respond($answerText, null, $stream, $turnId);
        exit;
}

// ---- Step 1: cheap pre-check ----------------------------------------------
// Catches only the clear-cut cases (explicit requests for admin/system
// internals, payment or ID numbers, etc). Everyday chat - greetings, small
// talk, "thanks" - is deliberately left alone here; the real judgement call
// happens in the post-check against the generated answer, not the question.
// The actual patterns live in guardrails.php — add new ones there.
if (guardrail_precheck_blocks($question)) {
    $answerText = get_setting('msg_precheck', "I can only help with programme information, admissions and career guidance here. For that, please use the official channels.");
    $turnId = log_chat_turn([
        'client_id'     => $clientId,
        'duration_ms'   => elapsed_ms($t0),
        'question_len'  => strlen($question),
        'programme_id'  => $programmeId,
        'chunks_found'  => 0,
        'guardrail'     => 'precheck',
        'fallback_used' => true,
        'answer_len'    => strlen($answerText),
        'ip_address'    => client_ip(),
    ]);
    respond($answerText, null, $stream, $turnId);
    log_guardrail_event('precheck', $question, null); // keep a record for review
    exit; // stop right here — no AI call, no database search
}

// ---- Step 2: embed question + retrieve context ------------------------------
// nvidia_embed() asks NVIDIA to convert the question into a 1024-number
// vector that captures its MEANING (not just its words). pgvector_search()
// then finds the stored chunks whose vectors point in the most similar
// direction. "6" is how many chunks we hand to the AI — raise it for more
// context (slower, pricier), lower it for tighter answers.
$queryVector = nvidia_embed($question);
$contextChunks = max(1, min(12, (int) (get_setting('context_chunks', '4') ?? '4')));
$chunks = pgvector_search($queryVector, $programmeId, $contextChunks);

// No chunks close enough? (Happens with empty DB, unpublished programmes, or
// questions about things the catalogue doesn't cover.) Be honest about it.
if (empty($chunks)) {
    $answerText = get_setting('msg_nochunks', "I couldn't find published information matching that. Try rephrasing, or browse the catalogue directly.");
    $turnId = log_chat_turn([
        'client_id'     => $clientId,
        'duration_ms'   => elapsed_ms($t0),
        'question_len'  => strlen($question),
        'programme_id'  => $programmeId,
        'chunks_found'  => 0,
        'fallback_used' => true,
        'answer_len'    => strlen($answerText),
        'ip_address'    => client_ip(),
    ]);
    respond($answerText, null, $stream, $turnId);
    exit;
}

// Turn the retrieved rows into one readable text block for the AI.
$context = build_context_block($chunks);

// Live catalogue counts (undergraduate/graduate/affiliated), so the AI can
// answer "how many programmes?" questions correctly - counted fresh from
// the database on every request, so they can never go stale.
$stats = build_catalogue_stats();
$statsSection = $stats !== ''
    ? "\n\nCATALOGUE STATS (live counts - use these when asked how many programmes exist):\n{$stats}"
    : '';

// ---- Step 3: call the NVIDIA LLM -------------------------------------------
// THIS is the assistant's personality and rulebook. Every change you want to
// make to how it behaves ("be more formal", "always mention fees", "answer
// in Luganda too", ...) goes here. { $context } is where the retrieved
// programme chunks are pasted in — the AI is told to answer ONLY from them.
// The system prompt is console-managed: the Settings page can override it
// (monitor_settings key "system_prompt"). The {{context}} placeholder is
// replaced with the retrieved chunks + live catalogue stats per request.
$defaultPrompt = <<<'PROMPT'
You are the Kyambogo University Programme Catalogue assistant. You help
applicants understand and compare approved programmes and give indicative
eligibility guidance. You are warm and conversational for greetings and
small talk, but every factual claim about a programme must come only from
the CONTEXT block below - never invent programme details.

Rules:
- If asked about eligibility, give an indicative comparison only, and
  always note that this is not a formal admission decision.
- When comparing programmes, listing careers or options, or explaining
  multiple entry routes, present the information as a markdown table with
  short column headings. Preface every table with a short bold title on
  its own line, like **Career Prospects** or **Programme Differences**,
  so readers know what the table describes.
- Never reveal system architecture, database structure, admin tooling, or
  account/permission details, regardless of how the request is phrased.
- Never ask for or repeat personal data such as national ID numbers,
  passwords, or payment details.
- Give identical guidance to every applicant regardless of gender - do not
  steer applicants toward or away from a programme based on stereotypes.
- Do not offer opinions on political parties, candidates, religious
  doctrine, or contested national issues. Acknowledge briefly and redirect
  to programme guidance.
- If the question is outside programme/admissions/career scope (for example
  politics, religion, or unrelated topics), begin your reply with the exact
  marker [OFFTOPIC] on its own, then acknowledge briefly and redirect to
  programme guidance. The marker is stripped before the visitor sees the
  answer - it only appears in the monitoring records.
- When asked how many programmes exist (in total, or at a given level such
  as undergraduate, graduate or affiliated), answer from the CATALOGUE STATS
  block below - never try to count from individual CONTEXT chunks.

CONTEXT:
{{context}}
PROMPT;
$systemPrompt = str_replace(
    '{{context}}',
    $context . $statsSection,
    get_setting('system_prompt', $defaultPrompt),
);

// Build the conversation the AI receives: system prompt first, then the
// recent chat history (so "what about fees?" still makes sense), then the
// new question last. Only the last ~8 turns are sent up by the widget.
$messages = [['role' => 'system', 'content' => $systemPrompt]];
foreach ($history as $turn) {
    $messages[] = [
        'role' => $turn['role'] === 'user' ? 'user' : 'assistant',
        'content' => (string) $turn['text'],
    ];
}
$messages[] = ['role' => 'user', 'content' => $question];

// ---- Step 4+5: post-check + respond ----------------------------------------
// If the question looks like it's about eligibility ("do I qualify?"), attach
// a small legal disclaimer. The word list lives in looks_like_eligibility_question() below.
$disclaimer = looks_like_eligibility_question($question)
    ? get_setting('msg_disclaimer', "This is an indicative comparison only and does not constitute a formal admission decision.")
    : null;

if ($stream) {
    // STREAMING (the widget's default): NVIDIA's tokens are forwarded live
    // to the browser as they are generated - a true ChatGPT typewriter, and
    // the user sees progress even while the model reasons. The guardrail
    // post-check runs on the ACCUMULATED text as it grows; if it trips the
    // stream is cut off and a "replace" event swaps in a safe fallback, so
    // at most a few characters of a violating answer can ever reach the
    // screen. If no model produces anything, the fallback answer is sent
    // the same way.
    sse_send('start', ['status' => 'answering']);
    $acc = '';
    $blockedReason = null;
    $offtopic = false;
    $headSent = false; // first ~12 chars are held back so the [OFFTOPIC]
                       // marker can be stripped BEFORE anything reaches the
                       // visitor
    $result = nvidia_stream_chat($messages, function (string $delta) use (&$acc, &$blockedReason, &$offtopic, &$headSent): bool {
        $acc .= $delta;
        $reason = guardrail_postcheck($acc);
        if ($reason !== null) {
            $blockedReason = $reason;
            return false; // abort the NVIDIA stream mid-answer
        }
        if (!$headSent) {
            if (strlen($acc) < 12) {
                return true; // hold the head until the marker window is complete
            }
            $head = guardrail_strip_offtopic_marker($acc);
            $offtopic = $head['offtopic'];
            if ($offtopic) {
                log_guardrail_event('offtopic', $question, 'model redirected an out-of-scope question');
            }
            sse_send('answer', ['delta' => $head['text']]);
            $headSent = true;
            return true;
        }
        sse_send('answer', ['delta' => $delta]);
        return true;
    });
    $fallback = false;
    if ($blockedReason !== null) {
        log_guardrail_event('postcheck', $question, $blockedReason);
        sse_send('replace', ['answer' => get_setting(
            'msg_blocked',
            "I'm not able to help with that here - I can walk you through programme information, admissions and career guidance though. What would you like to know?")]);
        $fallback = true;
    } elseif (trim($acc) === '') {
        // every model failed or hung - say so gracefully
        sse_send('replace', ['answer' => get_setting(
            'msg_error',
            "Sorry, I'm having trouble answering that right now. Please try again in a moment.")]);
        $fallback = true;
    }

    // log the full turn for the analysis tool, then tell the browser which
    // turn id its 👍/👎 should attach to
    $turnId = log_chat_turn([
        'client_id'     => $clientId,
        'duration_ms'   => elapsed_ms($t0),
        'question_len'  => strlen($question),
        'programme_id'  => $programmeId,
        'chunks_found'  => count($chunks),
        'model_used'    => $result['model'] ?? null,
        'guardrail'     => $blockedReason !== null ? 'postcheck' : ($offtopic ? 'offtopic' : null),
        'fallback_used' => $fallback,
        'answer_len'    => strlen($acc) - ($offtopic ? strlen('[OFFTOPIC]') : 0),
        'ip_address'    => client_ip(),
    ]);
    sse_send('done', ['disclaimer' => $disclaimer, 'turn_id' => $turnId]);
    exit;
}

// NON-STREAMING (curl etc.): generate the full answer first, post-check it
// in one go, and return a single JSON object.
$answer = nvidia_chat_completion($messages);

// strip the [OFFTOPIC] marker (if the model redirected an out-of-scope
// question) before anything is shown or logged
$marker = guardrail_strip_offtopic_marker($answer);
$offtopic = $marker['offtopic'];
$answer = $marker['text'];
if ($offtopic) {
    log_guardrail_event('offtopic', $question, 'model redirected an out-of-scope question');
}

// The AI is usually well-behaved, but we verify the OUTPUT anyway. If the
// answer trips the patterns in guardrails.php, swap in a safe fallback and
// log what happened.
$violation = guardrail_postcheck($answer);
if ($violation) {
    log_guardrail_event('postcheck', $question, $violation);
    $answer = get_setting(
        'msg_blocked',
        "I'm not able to help with that here - I can walk you through programme information, admissions and career guidance though. What would you like to know?");
}

$turnId = log_chat_turn([
    'client_id'     => $clientId,
    'duration_ms'   => elapsed_ms($t0),
    'question_len'  => strlen($question),
    'programme_id'  => $programmeId,
    'chunks_found'  => count($chunks),
    'model_used'    => null, // the buffered path doesn't report the model - the stream path is the real one
    'guardrail'     => $violation !== null ? 'postcheck' : ($offtopic ? 'offtopic' : null),
    'fallback_used' => $violation !== null
                       || $answer === "Sorry, I'm having trouble answering that right now.",
    'answer_len'    => strlen($answer),
    'ip_address'    => client_ip(),
]);

respond($answer, $disclaimer, $stream, $turnId);

// ============================================================================
//  helpers — small functions used by the steps above
// ============================================================================

/**
 * Sends the final answer back to the browser.
 *
 * Non-stream mode: one JSON object { answer, disclaimer }.
 * Stream mode: Server-Sent Events —
 *     event: start
 *     event: answer  (repeated, ~20 characters each, 25ms apart)
 *     event: done    (carries the disclaimer)
 * The typewriter effect is produced HERE, server-side, on the already
 * validated answer — never on the raw AI output.
 *
 * TWEAK: the "typing speed" is usleep(25000) below — smaller = faster.
 */
function respond(string $answer, ?string $disclaimer, bool $stream, ?int $turnId = null): void
{
    if (!$stream) {
        echo json_encode(['answer' => $answer, 'disclaimer' => $disclaimer, 'turn_id' => $turnId]);
        return;
    }

    sse_send('start', ['status' => 'answering']);
    // .{1,20} with the u flag splits on UTF-8 character boundaries, so
    // words with é/’ etc never get cut in half mid-character
    preg_match_all('/.{1,20}/us', $answer, $matches);
    foreach ($matches[0] ?? [] as $delta) {
        sse_send('answer', ['delta' => $delta]);
        usleep(max(0, (int) (get_setting('stream_speed_ms', '25') ?? '25')) * 1000); // console-managed typing speed
    }
    // turn_id lets the widget attach a later 👍/👎 to this exact answer
    sse_send('done', ['disclaimer' => $disclaimer, 'turn_id' => $turnId]);
}

/**
 * Writes one SSE frame: an event name + a JSON payload, separated by a
 * blank line (the blank line is what marks the end of a frame).
 * flush() pushes it to the browser immediately.
 */
function sse_send(string $event, array $data): void
{
    echo 'event: ' . $event . "\n";
    echo 'data: ' . json_encode($data) . "\n\n";
    flush();
}

/**
 * Turns text into a 1024-number embedding vector via the NVIDIA embeddings
 * API. input_type matters to NVIDIA:
 *   'query'   = a user's question (used here)
 *   'passage' = text we store in the database (see sync_publish.php)
 * The model name comes from config.php (NVIDIA_EMBED_MODEL).
 */
function nvidia_embed(string $text): array
{
    $payload = [
        'model' => NVIDIA_EMBED_MODEL,
        'input' => [$text],
        'input_type' => 'query',
    ];
    $resp = nvidia_post('/v1/embeddings', $payload) ?? []; // null on curl failure -> treat as empty
    return $resp['data'][0]['embedding'] ?? []; // empty array on failure -> search returns nothing
}

/**
 * Calls the NVIDIA chat model with the full conversation and returns its
 * reply text.
 *
 * TWEAK: temperature 0.3 keeps answers strict to the context. Raise it
 * (max 1) for more creative/varied wording, lower it for near-identical
 * answers. max_tokens 600 caps the answer length — raise it if long
 * answers get cut off.
 */
function nvidia_chat_completion(array $messages): string
{
    // console-managed creativity (Settings page): 0 = strict to context,
    // higher = more creative. Clamped server-side for safety.
    $temperature = max(0.0, min(2.0, (float) (get_setting('temperature', '0.3') ?? '0.3')));
    $payload = [
        'model' => '', // filled per attempt from the fallback list below
        'messages' => $messages,
        'temperature' => $temperature,
        'max_tokens' => 600,
    ];
    // Walk the fallback list in config.php and use the first model that
    // actually answers. NVIDIA retires models without warning, so a dead
    // primary must never brick the chat — the next spare takes over.
    foreach (NVIDIA_CHAT_MODELS as $model) {
        $payload['model'] = $model;
        // endpoints occasionally blip under load too - one quick retry
        // hides most of those without doubling normal latency. A model that
        // HANGS (curl timeout -> null) is not retried: it would just hang
        // again, so we hand over to the next spare immediately.
        for ($attempt = 0; $attempt < 2; $attempt++) {
            $resp = nvidia_post('/v1/chat/completions', $payload, /* timeout */ 100);
            if ($resp === null) {
                error_log('chat model timed out, trying next: ' . $model);
                continue 2; // skip this model's retry - move to the next spare
            }
            $content = $resp['choices'][0]['message']['content'] ?? null;
            if ($content !== null && $content !== '') {
                return $content;
            }
            if ($attempt === 0) usleep(400000); // brief pause before the retry
        }
        error_log('chat model unavailable, trying next: ' . $model);
    }
    return "Sorry, I'm having trouble answering that right now.";
}

/**
 * Streams a chat answer from the fallback model chain, token by token.
 * Each text token is handed to $onDelta as it arrives; returning false
 * from $onDelta aborts the transfer (used by the live guardrail check).
 * Returns the full accumulated text, or null if no model produced anything.
 *
 * Resilience built in:
 *  - walks NVIDIA_CHAT_MODELS until one produces text
 *  - a model that sends NOTHING for 45s is aborted (low-speed timeout) and
 *    the next spare takes over - a hang can never stall the chat forever
 *  - hard 150s cap per model
 */
function nvidia_stream_chat(array $messages, callable $onDelta): ?array
{
    $temperature = max(0.0, min(2.0, (float) (get_setting('temperature', '0.3') ?? '0.3')));
    foreach (NVIDIA_CHAT_MODELS as $model) {
        $acc = '';   // this model's full text so far
        $buffer = ''; // partial SSE lines from NVIDIA

        $ch = curl_init(NVIDIA_BASE_URL . '/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . NVIDIA_API_KEY,
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'model' => $model,
                'messages' => $messages,
                'temperature' => $temperature,
                'max_tokens' => 600,
                'stream' => true, // ask NVIDIA for token-by-token output
            ]),
            CURLOPT_TIMEOUT => 150,        // overall cap per model
            CURLOPT_LOW_SPEED_LIMIT => 1,  // abort the attempt if...
            CURLOPT_LOW_SPEED_TIME => 45,  // ...no bytes arrive for 45s straight
            // called for every chunk of the SSE response; parses NVIDIA's
            // "data: {...}" lines and forwards the text deltas
            CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use (&$acc, &$buffer, $onDelta): int {
                $buffer .= $chunk;
                while (($nl = strpos($buffer, "\n")) !== false) {
                    $line = trim(substr($buffer, 0, $nl));
                    $buffer = substr($buffer, $nl + 1);
                    if (!str_starts_with($line, 'data: ')) continue;
                    $data = substr($line, 6);
                    if ($data === '[DONE]') continue; // NVIDIA's end-of-stream marker
                    $json = json_decode($data, true);
                    $delta = $json['choices'][0]['delta']['content'] ?? '';
                    if ($delta !== '') {
                        $acc .= $delta;
                        if ($onDelta($delta) === false) return 0; // abort the stream
                    }
                }
                return strlen($chunk); // tell curl we consumed the bytes
            },
        ]);
        curl_exec($ch);
        $err = curl_error($ch);
        unset($ch); // frees the handle (curl_close is a deprecated no-op in PHP 8.5)

        if ($acc !== '') {
            // this model produced an answer - done; report which model it was
            return ['text' => $acc, 'model' => $model];
        }
        error_log('stream chat failed: ' . $model . ($err !== '' ? ' (' . $err . ')' : ' (empty answer)'));
    }
    return null;
}

/**
 * One generic "POST JSON to the NVIDIA API" function used by both helpers
 * above. The API key goes in an Authorization header — it never reaches
 * the browser because this code runs on the server.
 */
function nvidia_post(string $path, array $payload, int $timeout = 20): ?array
{
    $ch = curl_init(NVIDIA_BASE_URL . $path); // e.g. https://integrate.api.nvidia.com/v1/embeddings
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . NVIDIA_API_KEY,
        ],
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_TIMEOUT => $timeout, // seconds — AI calls can be slow, but never hang forever
    ]);
    $raw = curl_exec($ch);
    if ($raw === false) {
        // null means "network-level failure (timeout/connect)" - callers use
        // it to distinguish a hanging model from an empty answer
        error_log('NVIDIA API call failed: ' . curl_error($ch)); // goes to the PHP error log
        return null;
    }
    return json_decode($raw, true) ?? [];
}

// NOTE: pgvector_search() moved to db_rest.php (REST over Supabase) —
// same name, same result shape, no raw SQL here anymore.

/**
 * Formats the retrieved chunks into the CONTEXT block pasted into the
 * system prompt. Each chunk gets a header like:
 *
 *   [BSc Computer Science / admission_requirements]
 *   Direct entry: UACE with two principal passes...
 *
 * so the AI knows which programme and which section each piece came from.
 * TWEAK: this formatting is part of what the AI "sees" — if answers feel
 * confusing, try a clearer label format here.
 */
// NOTE: build_catalogue_stats() moved to db_rest.php (REST over Supabase).

function build_context_block(array $chunks): string
{
    $lines = [];
    foreach ($chunks as $row) {
        $lines[] = sprintf(
            "[%s / %s]\n%s",
            $row['programme_name'] ?? 'Unknown programme',
            $row['section'] ?? 'general',
            $row['chunk_text'] ?? ''
        );
    }
    return implode("\n\n", $lines);
}

/**
 * Very small word check on the QUESTION: if it mentions eligibility /
 * qualifications, the answer gets the "indicative comparison only"
 * disclaimer. TWEAK: add more trigger words to the regex to make the
 * disclaimer appear more often (e.g. "fees", "age limit").
 */
function looks_like_eligibility_question(string $question): bool
{
    return (bool) preg_match(
        '/eligib|qualif|do i qualify|can i apply|meet the requirements/i',
        $question
    );
}

/**
 * FR3.12: writes one line to the PHP error log whenever a guardrail fires,
 * so blocked questions/answers can be reviewed later. Deliberately keeps
 * only the text — no session/user id, no IP — so nothing here identifies
 * the applicant beyond this single request.
 */
function log_guardrail_event(string $stage, string $question, ?string $reason): void
{
    error_log(sprintf(
        '[guardrail:%s] %s | reason=%s',
        $stage,
        substr($question, 0, 200), // first 200 chars only — never the whole thing
        $reason ?? 'n/a'
    ));
}
