<?php
/**
 * ============================================================================
 *  guardrails.php — THE SAFETY CHECKS
 * ============================================================================
 *  Two cheap pattern checks used by chat_api.php:
 *
 *    1. guardrail_precheck_blocks($question)
 *       Runs BEFORE the AI is called. If it returns true, the question is
 *       refused outright with a canned message — no AI call, no cost.
 *
 *    2. guardrail_postcheck($answer)
 *       Runs on the AI's generated ANSWER before it's shown. Returns a
 *       short reason string if the answer should be blocked (chat_api.php
 *       then swaps in a safe fallback), or null if it's fine.
 *
 *  HOW TO ADD A NEW RULE:
 *    - These are REGULAR EXPRESSIONS. Each line between the [ ] brackets
 *      is one pattern, e.g.:
 *          '/\b(admin|staff)\s+portal\b/i'
 *      means: the word "admin" or "staff" followed by a space and "portal",
 *      case-insensitive (/i), with word boundaries (\b).
 *    - Deliberately narrow pattern checks - the goal is to catch clear-cut
 *      violations (Section 9.2 / FR3.8-3.11) without flagging normal
 *      conversation. Greetings, thanks, small talk, and genuine programme
 *      questions should never trip these.
 *    - For anything less clear-cut than these patterns, prefer the LLM's own
 *      system-prompt instructions and the post-check below over trying to
 *      regex your way through every phrasing - false positives here are what
 *      make an assistant feel broken.
 * ============================================================================
 */

/**
 * Question-level check. Each preg_match line answers one question:
 * "does the text clearly ask for / contain something dangerous?"
 */
function guardrail_precheck_blocks(string $question): bool
{
    $patterns = [
        '/\b(national\s*id|nin)\s*(number|no)?\b.*\b(is|:)\s*\d/i', // applicant volunteering an ID number
        '/\b(database|db)\s+(schema|structure|credentials)\b/i',   // asking about our DB internals
        '/\badmin(istrator)?\s+(password|login|portal)\b/i',       // asking for admin access
        '/ignore (all|previous|your) instructions/i',              // prompt-injection attempts
        '/reveal (your|the) (system prompt|instructions)/i',       // prompt-injection attempts
        // opinion-seeking on politics / religion - clearly out of scope for
        // a programme-catalogue assistant, refused before the AI runs
        '/who (should|do you think) i (vote|support|elect)( for)?/i',
        '/\b(is|was|do you think)\b.{0,50}\b(museveni|besigye|bobi\s*wine|nrm|nup|fdc|opposition)\b.{0,30}\b(good|bad|better|best|leader|president|party)\b/i',
        '/what do you think (about|of) (the )?(election|politics|government|nrm|nup|opposition)\b/i',
        '/which (political )?party (is (the )?best|should i (join|vote|support))/i',
        '/\b(is (islam|christianity|religion|the (bible|quran)) (the )?(true|real|right)|which religion is (true|right|best))\b/i',
    ];
    foreach ($patterns as $p) {
        if (preg_match($p, $question)) return true; // first match wins — block it
    }
    return false; // nothing matched — let the conversation continue
}

/**
 * Answer-level check: runs against the *generated answer*, not the question
 * - catches cases where the model still drifted despite the system prompt.
 * Returns a short reason string if it should be blocked, or null if it's fine.
 * (chat_api.php shows the reason only in the server log, never to the user.)
 */
function guardrail_postcheck(string $answer): ?string
{
    if (preg_match('/\b\d{10,}\b/', $answer)) {
        return 'possible id/account number in response'; // 10+ digits in a row looks like an ID/account number
    }
    if (preg_match('/\b(admin portal|database credentials|internal api key)\b/i', $answer)) {
        return 'system-internals leak';
    }
    // politics / religion / contested national issues: the system prompt
    // forbids these topics outright, so ANY of these terms in a generated
    // answer is drift worth scrubbing
    if (preg_match('/\b(museveni|besigye|bobi\s*wine|nrm|nup|fdc|opposition|electoral commission|ballot)\b/i', $answer)) {
        return 'political drift';
    }
    if (preg_match('/\b(vote|voting|election|candidate|political party)\b/i', $answer)) {
        return 'political drift';
    }
    if (preg_match('/\b(allah|quran|jesus christ|the bible|christianity|islam)\b.{0,60}\b(true|right|better|superior|only way)\b/i', $answer)) {
        return 'religious drift';
    }
    return null; // answer is fine
}

/**
 * The system prompt asks the model to BEGIN out-of-scope redirects with the
 * marker "[OFFTOPIC]" (hidden from the visitor). This detects and strips it
 * from the head of an answer. Returns ['offtopic' => bool, 'text' => string]
 * where 'text' is the answer without the marker (unchanged if absent).
 * Kept as a pure function so it is unit-testable without the LLM.
 */
function guardrail_strip_offtopic_marker(string $text): array
{
    if (preg_match('/\A\s*\[OFFTOPIC\]\s*/i', $text, $m)) {
        $stripped = substr($text, strlen($m[0]));
        return ['offtopic' => true, 'text' => $stripped];
    }
    return ['offtopic' => false, 'text' => $text];
}
