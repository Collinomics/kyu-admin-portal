-- Monitoring tables for the AI analysis tool.
-- Lives in the SAME database as programme_chunks so analytics can JOIN
-- (e.g. "which programmes get the most unanswered questions?"), but in
-- clearly separate tables - the widget's vector tables are never touched.
--
-- PRIVACY (FR3.12): no question text, no answer text, no IP, no names.
-- Only lengths, counts, timings and an anonymous per-browser client_id.

CREATE TABLE IF NOT EXISTS monitor_events (
    id            BIGSERIAL PRIMARY KEY,
    event_type    TEXT NOT NULL DEFAULT 'chat_turn',  -- 'chat_turn' today; room for more later
    ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_id     TEXT,          -- random per-browser id set by the widget - NO PII
    duration_ms   INTEGER,       -- how long the backend took to answer
    question_len  INTEGER,       -- question length in characters (not the text itself)
    programme_id  TEXT,          -- programme the question was scoped to, if any
    chunks_found  INTEGER,       -- how many knowledge chunks retrieval returned
    model_used    TEXT,          -- which NVIDIA chat model actually answered
    guardrail     TEXT,          -- 'precheck' | 'postcheck' | null
    fallback_used BOOLEAN NOT NULL DEFAULT FALSE, -- canned fallback instead of a real answer?
    answer_len    INTEGER,       -- answer length in characters
    ip_address    INET,          -- client IP for the audit trail (PII - keep access controlled)
    feedback      TEXT,          -- 'like' | 'dislike' | null (set by the widget's thumbs buttons)
    feedback_ts   TIMESTAMPTZ    -- when the visitor tapped like/dislike
);

-- for databases created before the ip_address column existed
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS ip_address INET;

CREATE INDEX IF NOT EXISTS idx_monitor_events_ts   ON monitor_events (ts);
CREATE INDEX IF NOT EXISTS idx_monitor_events_type ON monitor_events (event_type);

-- ---------------------------------------------------------------------------
-- Console configuration + admin activity (added 2026-08-28)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monitor_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS console_activity (
    id          BIGSERIAL PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    detail      TEXT
);
