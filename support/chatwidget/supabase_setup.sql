-- ============================================================================
-- supabase_setup.sql — monitoring tables + RPCs for the hosted stack
-- Run this in the Supabase SQL editor (idempotent — safe to re-run).
-- The PHP side talks to these over PostgREST with the service_role key,
-- so no row-level security policies are needed (the key bypasses RLS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- tables (same shapes the local stack used)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monitor_events (
    id            BIGSERIAL PRIMARY KEY,
    event_type    TEXT NOT NULL DEFAULT 'chat_turn',
    ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_id     TEXT,
    duration_ms   INTEGER,
    question_len  INTEGER,
    programme_id  TEXT,
    chunks_found  INTEGER,
    model_used    TEXT,
    guardrail     TEXT,
    fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
    answer_len    INTEGER,
    feedback      TEXT,
    feedback_ts   TIMESTAMPTZ,
    ip_address    INET
);

-- self-heal columns if the table was created earlier without some of them
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS id BIGSERIAL PRIMARY KEY;
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'chat_turn';
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS ts TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS question_len INTEGER;
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS programme_id TEXT;
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS chunks_found INTEGER;
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS model_used TEXT;
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS guardrail TEXT;
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS answer_len INTEGER;
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS feedback TEXT;
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS feedback_ts TIMESTAMPTZ;
ALTER TABLE monitor_events ADD COLUMN IF NOT EXISTS ip_address INET;

CREATE INDEX IF NOT EXISTS idx_monitor_events_ts   ON monitor_events (ts);
CREATE INDEX IF NOT EXISTS idx_monitor_events_type ON monitor_events (event_type);
CREATE INDEX IF NOT EXISTS idx_monitor_events_guardrail ON monitor_events (guardrail);

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

-- ---------------------------------------------------------------------------
-- chat-side RPCs (used by chat_api.php)
-- ---------------------------------------------------------------------------

-- vector similarity search over programme_chunks
CREATE OR REPLACE FUNCTION search_chunks(
    p_query_embedding vector,
    p_programme_id    text DEFAULT NULL,
    p_top_k           int  DEFAULT 6
) RETURNS TABLE (
    programme_id    text,
    programme_name  text,
    section         text,
    chunk_text      text
) LANGUAGE sql STABLE AS $$
    SELECT pc.programme_id, pc.programme_name, pc.section, pc.chunk_text
    FROM programme_chunks pc
    WHERE pc.published = TRUE
      AND (p_programme_id IS NULL OR pc.programme_id = p_programme_id)
    ORDER BY pc.embedding <=> p_query_embedding
    LIMIT p_top_k;
$$;

-- rate limiting: how many turns has this client sent in the last N minutes
CREATE OR REPLACE FUNCTION recent_turns(
    p_client_id text,
    p_minutes   int DEFAULT 1
) RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT COUNT(*) FROM monitor_events
    WHERE client_id = p_client_id
      AND ts > now() - make_interval(mins => p_minutes);
$$;

-- IP backstop for public rate limiting. The browser-controlled client id is
-- useful for analytics but cannot be the only abuse boundary.
CREATE OR REPLACE FUNCTION recent_turns_by_ip(
    p_ip_address inet,
    p_minutes    int DEFAULT 1
) RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT COUNT(*) FROM monitor_events
    WHERE ip_address = p_ip_address
      AND ts > now() - make_interval(mins => p_minutes);
$$;

-- NOTE: catalogue_stats already exists on this project (returns
-- level + programmes) — intentionally NOT recreated here.

-- ---------------------------------------------------------------------------
-- console analytics RPCs (used by monitor_api.php)
-- ---------------------------------------------------------------------------

-- per-bucket trend: hourly for "today", daily otherwise
CREATE OR REPLACE FUNCTION overview_trend(p_range text)
RETURNS TABLE (
    ts           bigint,
    messages     bigint,
    clients      bigint,
    avg_ms       bigint,
    fallback_pct numeric,
    tokens       bigint
) LANGUAGE sql STABLE AS $$
    WITH events AS (
        SELECT *,
               CASE WHEN p_range = 'today'
                    THEN date_trunc('hour', ts)
                    ELSE date_trunc('day', ts) END AS bucket
        FROM monitor_events
        WHERE event_type = 'chat_turn'
          AND ts >= CASE
                WHEN p_range = 'today' THEN date_trunc('day', now())
                ELSE now() - make_interval(days => CASE p_range
                        WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 7 END)
              END
    )
    SELECT (extract(epoch FROM bucket) * 1000)::bigint,
           count(*)::bigint,
           count(DISTINCT client_id)::bigint,
           coalesce(round(avg(duration_ms)), 0)::bigint,
           round(100.0 * avg(CASE WHEN fallback_used THEN 1 ELSE 0 END), 2),
           round(coalesce(sum(answer_len + coalesce(question_len, 0)), 0) / 4.0)::bigint
    FROM events
    GROUP BY bucket
    ORDER BY bucket;
$$;

-- window totals (current range)
CREATE OR REPLACE FUNCTION overview_totals(p_range text)
RETURNS TABLE (
    messages      bigint,
    sessions      bigint,
    avg_ms        bigint,
    fallback_pct  numeric,
    tokens        bigint,
    total_clients bigint
) LANGUAGE sql STABLE AS $$
    SELECT count(*)::bigint,
           count(DISTINCT client_id)::bigint,
           coalesce(round(avg(duration_ms)), 0)::bigint,
           round(100.0 * avg(CASE WHEN fallback_used THEN 1 ELSE 0 END), 2),
           round(coalesce(sum(answer_len + coalesce(question_len, 0)), 0) / 4.0)::bigint,
           (SELECT count(DISTINCT client_id) FROM monitor_events)::bigint
    FROM monitor_events
    WHERE event_type = 'chat_turn'
      AND ts >= CASE
            WHEN p_range = 'today' THEN date_trunc('day', now())
            ELSE now() - make_interval(days => CASE p_range
                    WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 7 END)
          END;
$$;

-- previous equal-length window (for deltas)
CREATE OR REPLACE FUNCTION overview_prev(p_range text)
RETURNS TABLE (messages bigint, avg_ms bigint, fallback_pct numeric)
LANGUAGE sql STABLE AS $$
    WITH bounds AS (
        SELECT CASE WHEN p_range = 'today'
                    THEN date_trunc('day', now())
                    ELSE now() - make_interval(days => CASE p_range
                            WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 7 END)
               END AS since_start,
               CASE WHEN p_range = 'today'
                    THEN date_trunc('day', now()) - interval '1 day'
                    ELSE now() - make_interval(days => 2 * CASE p_range
                            WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 7 END)
               END AS prev_start
    )
    SELECT count(*)::bigint,
           coalesce(round(avg(duration_ms)), 0)::bigint,
           round(100.0 * avg(CASE WHEN fallback_used THEN 1 ELSE 0 END), 2)
    FROM monitor_events, bounds
    WHERE event_type = 'chat_turn'
      AND ts >= bounds.prev_start AND ts < bounds.since_start;
$$;

-- top programme queries, last 30 days (one JOIN for names)
CREATE OR REPLACE FUNCTION top_programmes()
RETURNS TABLE (name text, queries bigint)
LANGUAGE sql STABLE AS $$
    SELECT coalesce(pc.programme_name, 'General enquiries'),
           count(*)::bigint
    FROM monitor_events m
    LEFT JOIN programme_chunks pc ON pc.programme_id = m.programme_id
    WHERE m.event_type = 'chat_turn'
      AND m.ts >= now() - interval '30 days'
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 10;
$$;

-- weekday x hour heatmap, last 14 days (dow 0=Sun..6=Sat, like JS)
CREATE OR REPLACE FUNCTION heatmap()
RETURNS TABLE (dow int, h int, c bigint)
LANGUAGE sql STABLE AS $$
    SELECT (extract(ISODOW FROM ts)::int % 7)::int,
           extract(HOUR FROM ts)::int,
           count(*)::bigint
    FROM monitor_events
    WHERE event_type = 'chat_turn' AND ts >= now() - interval '14 days'
    GROUP BY 1, 2;
$$;

-- 👍/👎 counts for a range
CREATE OR REPLACE FUNCTION feedback_counts(p_range text)
RETURNS TABLE (likes bigint, dislikes bigint)
LANGUAGE sql STABLE AS $$
    SELECT count(*) FILTER (WHERE feedback = 'like')::bigint,
           count(*) FILTER (WHERE feedback = 'dislike')::bigint
    FROM monitor_events
    WHERE event_type = 'chat_turn'
      AND ts >= CASE
            WHEN p_range = 'today' THEN date_trunc('day', now())
            ELSE now() - make_interval(days => CASE p_range
                    WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 7 END)
          END;
$$;

-- guardrail counts for a range
CREATE OR REPLACE FUNCTION guardrail_counts(p_range text)
RETURNS TABLE (precheck bigint, postcheck bigint, offtopic bigint)
LANGUAGE sql STABLE AS $$
    SELECT count(*) FILTER (WHERE guardrail = 'precheck')::bigint,
           count(*) FILTER (WHERE guardrail = 'postcheck')::bigint,
           count(*) FILTER (WHERE guardrail = 'offtopic')::bigint
    FROM monitor_events
    WHERE event_type = 'chat_turn'
      AND ts >= CASE
            WHEN p_range = 'today' THEN date_trunc('day', now())
            ELSE now() - make_interval(days => CASE p_range
                    WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 7 END)
          END;
$$;

-- paginated event rows for the audit log (columns raw — PHP composes detail)
CREATE OR REPLACE FUNCTION events_page(
    p_range      text DEFAULT '90d',
    p_severity   text DEFAULT 'all',
    p_action     text DEFAULT 'all',
    p_q          text DEFAULT '',
    p_page       int  DEFAULT 1,
    p_page_size  int  DEFAULT 15
) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
    total int;
    page_count int;
    page int;
    result jsonb;
BEGIN
    SELECT count(*) INTO total
    FROM monitor_events m
    WHERE m.event_type = 'chat_turn'
      AND m.ts >= CASE
            WHEN p_range = 'today' THEN date_trunc('day', now())
            ELSE now() - make_interval(days => CASE p_range
                    WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 90 END)
          END
      AND (p_severity = 'all'
           OR (p_severity = 'warning' AND (m.fallback_used OR m.guardrail IS NOT NULL))
           OR (p_severity = 'info' AND NOT m.fallback_used AND m.guardrail IS NULL))
      AND (p_action = 'all' OR (p_action = 'chat.feedback' AND m.feedback IS NOT NULL))
      AND (p_q = ''
           OR coalesce(m.client_id, '') ILIKE '%' || p_q || '%'
           OR coalesce(m.model_used, '') ILIKE '%' || p_q || '%'
           OR EXISTS (SELECT 1 FROM programme_chunks pc
                      WHERE pc.programme_id = m.programme_id
                        AND pc.programme_name ILIKE '%' || p_q || '%'));

    page_count := GREATEST(1, CEIL(total::numeric / GREATEST(1, p_page_size))::int);
    page := LEAST(GREATEST(1, p_page), page_count);

    SELECT jsonb_build_object(
        'events', coalesce(jsonb_agg(e ORDER BY e.ts_epoch DESC), '[]'::jsonb),
        'total', total,
        'page', page,
        'pageCount', page_count
    ) INTO result
    FROM (
        SELECT m.id,
               (extract(epoch FROM m.ts) * 1000)::bigint AS ts_epoch,
               m.ts, m.client_id, m.duration_ms, m.question_len,
               m.chunks_found, m.model_used, m.fallback_used,
               m.guardrail, m.feedback, m.ip_address,
               pc.programme_name
        FROM monitor_events m
        LEFT JOIN programme_chunks pc ON pc.programme_id = m.programme_id
        WHERE m.event_type = 'chat_turn'
          AND m.ts >= CASE
                WHEN p_range = 'today' THEN date_trunc('day', now())
                ELSE now() - make_interval(days => CASE p_range
                        WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 90 END)
              END
          AND (p_severity = 'all'
               OR (p_severity = 'warning' AND (m.fallback_used OR m.guardrail IS NOT NULL))
               OR (p_severity = 'info' AND NOT m.fallback_used AND m.guardrail IS NULL))
          AND (p_action = 'all' OR (p_action = 'chat.feedback' AND m.feedback IS NOT NULL))
          AND (p_q = ''
               OR coalesce(m.client_id, '') ILIKE '%' || p_q || '%'
               OR coalesce(m.model_used, '') ILIKE '%' || p_q || '%'
               OR EXISTS (SELECT 1 FROM programme_chunks pc
                          WHERE pc.programme_id = m.programme_id
                            AND pc.programme_name ILIKE '%' || p_q || '%'))
        ORDER BY m.ts DESC
        LIMIT GREATEST(1, p_page_size) OFFSET (page - 1) * GREATEST(1, p_page_size)
    ) e;

    RETURN result;
END;
$$;

-- the "now" numbers for the live tick
CREATE OR REPLACE FUNCTION live_stats()
RETURNS jsonb
LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'users_online', (SELECT count(DISTINCT client_id)
                         FROM monitor_events WHERE ts >= now() - interval '5 minutes'),
        'messages_today', (SELECT count(*)
                           FROM monitor_events
                           WHERE event_type = 'chat_turn' AND ts >= date_trunc('day', now())),
        'tokens_today', (SELECT round(coalesce(sum(answer_len + coalesce(question_len, 0)), 0) / 4.0)::bigint
                         FROM monitor_events
                         WHERE event_type = 'chat_turn' AND ts >= date_trunc('day', now())),
        'recent', coalesce((
            SELECT jsonb_agg(r ORDER BY r.ts DESC)
            FROM (
                SELECT m.id,
                       (extract(epoch FROM m.ts) * 1000)::bigint AS ts_epoch,
                       m.ts, m.client_id, m.duration_ms, m.question_len,
                       m.chunks_found, m.model_used, m.fallback_used,
                       m.guardrail, m.feedback, m.ip_address,
                       pc.programme_name
                FROM monitor_events m
                LEFT JOIN programme_chunks pc ON pc.programme_id = m.programme_id
                ORDER BY m.ts DESC
                LIMIT 15
            ) r
        ), '[]'::jsonb)
    );
$$;
