-- Private AI runtime schema translated from support/chatwidget/*.sql.
-- The objects remain in the same Supabase PostgreSQL database as PCS, but
-- neither the browser roles nor the PCS runtime role can access this schema.

set search_path = ai, extensions, pg_catalog;

create table if not exists ai.programme_chunks (
    id             text primary key,
    programme_id   text not null,
    programme_name text not null,
    level          text,
    source_type    text not null default 'programme',
    source_version integer not null default 1,
    section        text not null,
    chunk_text     text not null,
    embedding      extensions.vector(2048) not null,
    published      boolean not null default false,
    updated_at     timestamptz not null default now()
);

alter table ai.programme_chunks add column if not exists level text;
alter table ai.programme_chunks add column if not exists source_type text not null default 'programme';
alter table ai.programme_chunks add column if not exists source_version integer not null default 1;
create index if not exists ai_programme_chunks_programme_idx
    on ai.programme_chunks (programme_id);
create index if not exists ai_programme_chunks_published_idx
    on ai.programme_chunks (published);

create table if not exists ai.monitor_events (
    id            bigserial primary key,
    event_type    text not null default 'chat_turn',
    ts            timestamptz not null default now(),
    client_id     text,
    duration_ms   integer check (duration_ms is null or duration_ms >= 0),
    question_len  integer check (question_len is null or question_len >= 0),
    programme_id  text,
    chunks_found  integer check (chunks_found is null or chunks_found >= 0),
    model_used    text,
    guardrail     text,
    fallback_used boolean not null default false,
    answer_len    integer check (answer_len is null or answer_len >= 0),
    feedback      text check (feedback is null or feedback in ('like', 'dislike')),
    feedback_ts   timestamptz,
    ip_address    inet
);

create index if not exists ai_monitor_events_ts_idx on ai.monitor_events (ts);
create index if not exists ai_monitor_events_type_idx on ai.monitor_events (event_type);
create index if not exists ai_monitor_events_guardrail_idx on ai.monitor_events (guardrail);
create index if not exists ai_monitor_events_client_ts_idx on ai.monitor_events (client_id, ts);
create index if not exists ai_monitor_events_ip_ts_idx on ai.monitor_events (ip_address, ts);

create table if not exists ai.monitor_settings (
    key        text primary key,
    value      text,
    updated_at timestamptz not null default now()
);

create table if not exists ai.console_activity (
    id     bigserial primary key,
    ts     timestamptz not null default now(),
    actor  text not null,
    action text not null,
    detail text
);

create or replace function ai.search_chunks(
    p_query_embedding extensions.vector,
    p_programme_id text default null,
    p_top_k integer default 6
) returns table (
    programme_id text,
    programme_name text,
    section text,
    chunk_text text
) language sql stable
set search_path = ai, extensions, pg_catalog
as $$
    select pc.programme_id, pc.programme_name, pc.section, pc.chunk_text
    from ai.programme_chunks pc
    where pc.published = true
      and (p_programme_id is null or pc.programme_id = p_programme_id or pc.source_type like 'knowledge_%')
    order by pc.embedding <=> p_query_embedding
    limit greatest(1, least(p_top_k, 12));
$$;

create or replace function ai.recent_turns(p_client_id text, p_minutes integer default 1)
returns bigint language sql stable
set search_path = ai, pg_catalog
as $$
    select count(*) from ai.monitor_events
    where client_id = p_client_id
      and ts > now() - make_interval(mins => greatest(1, p_minutes));
$$;

create or replace function ai.recent_turns_by_ip(p_ip_address inet, p_minutes integer default 1)
returns bigint language sql stable
set search_path = ai, pg_catalog
as $$
    select count(*) from ai.monitor_events
    where ip_address = p_ip_address
      and ts > now() - make_interval(mins => greatest(1, p_minutes));
$$;

create or replace function ai.catalogue_stats()
returns table (level text, programmes bigint)
language sql stable
set search_path = ai, pg_catalog
as $$
    select coalesce(nullif(pc.level, ''), 'unknown'), count(distinct pc.programme_id)::bigint
    from ai.programme_chunks pc
    where pc.published = true
      and pc.source_type in ('programme', 'affiliated_institution')
    group by 1
    order by 1;
$$;

create or replace function ai.overview_trend(p_range text)
returns table (ts bigint, messages bigint, clients bigint, avg_ms bigint, fallback_pct numeric, tokens bigint)
language sql stable
set search_path = ai, pg_catalog
as $$
    with events as (
        select e.*,
            case when p_range = 'today' then date_trunc('hour', e.ts)
                 else date_trunc('day', e.ts) end as bucket
        from ai.monitor_events e
        where e.event_type = 'chat_turn'
          and e.ts >= case when p_range = 'today' then date_trunc('day', now())
              else now() - make_interval(days => case p_range when '30d' then 30 when '90d' then 90 else 7 end) end
    )
    select (extract(epoch from bucket) * 1000)::bigint,
        count(*)::bigint, count(distinct client_id)::bigint,
        coalesce(round(avg(duration_ms)), 0)::bigint,
        coalesce(round(100.0 * avg(case when fallback_used then 1 else 0 end), 2), 0),
        round(coalesce(sum(answer_len + coalesce(question_len, 0)), 0) / 4.0)::bigint
    from events group by bucket order by bucket;
$$;

create or replace function ai.overview_totals(p_range text)
returns table (messages bigint, sessions bigint, avg_ms bigint, fallback_pct numeric, tokens bigint, total_clients bigint)
language sql stable
set search_path = ai, pg_catalog
as $$
    select count(*)::bigint, count(distinct client_id)::bigint,
        coalesce(round(avg(duration_ms)), 0)::bigint,
        coalesce(round(100.0 * avg(case when fallback_used then 1 else 0 end), 2), 0),
        round(coalesce(sum(answer_len + coalesce(question_len, 0)), 0) / 4.0)::bigint,
        (select count(distinct client_id) from ai.monitor_events)::bigint
    from ai.monitor_events
    where event_type = 'chat_turn'
      and ts >= case when p_range = 'today' then date_trunc('day', now())
          else now() - make_interval(days => case p_range when '30d' then 30 when '90d' then 90 else 7 end) end;
$$;

create or replace function ai.overview_prev(p_range text)
returns table (messages bigint, avg_ms bigint, fallback_pct numeric)
language sql stable
set search_path = ai, pg_catalog
as $$
    with bounds as (
        select
            case when p_range = 'today' then date_trunc('day', now())
                 else now() - make_interval(days => case p_range when '30d' then 30 when '90d' then 90 else 7 end) end as current_start,
            case when p_range = 'today' then date_trunc('day', now()) - interval '1 day'
                 else now() - make_interval(days => 2 * case p_range when '30d' then 30 when '90d' then 90 else 7 end) end as previous_start
    )
    select count(*)::bigint, coalesce(round(avg(duration_ms)), 0)::bigint,
        coalesce(round(100.0 * avg(case when fallback_used then 1 else 0 end), 2), 0)
    from ai.monitor_events, bounds
    where event_type = 'chat_turn' and ts >= previous_start and ts < current_start;
$$;

create or replace function ai.top_programmes()
returns table (name text, queries bigint)
language sql stable
set search_path = ai, pg_catalog
as $$
    select coalesce(max(pc.programme_name), 'General enquiries'), count(*)::bigint
    from ai.monitor_events m
    left join ai.programme_chunks pc on pc.programme_id = m.programme_id
    where m.event_type = 'chat_turn' and m.ts >= now() - interval '30 days'
    group by m.programme_id order by 2 desc limit 10;
$$;

create or replace function ai.heatmap()
returns table (dow integer, h integer, c bigint)
language sql stable
set search_path = ai, pg_catalog
as $$
    select (extract(isodow from ts)::integer % 7), extract(hour from ts)::integer, count(*)::bigint
    from ai.monitor_events
    where event_type = 'chat_turn' and ts >= now() - interval '14 days'
    group by 1, 2;
$$;

create or replace function ai.feedback_counts(p_range text)
returns table (likes bigint, dislikes bigint)
language sql stable
set search_path = ai, pg_catalog
as $$
    select count(*) filter (where feedback = 'like')::bigint,
        count(*) filter (where feedback = 'dislike')::bigint
    from ai.monitor_events
    where event_type = 'chat_turn'
      and ts >= case when p_range = 'today' then date_trunc('day', now())
          else now() - make_interval(days => case p_range when '30d' then 30 when '90d' then 90 else 7 end) end;
$$;

create or replace function ai.guardrail_counts(p_range text)
returns table (precheck bigint, postcheck bigint, offtopic bigint)
language sql stable
set search_path = ai, pg_catalog
as $$
    select count(*) filter (where guardrail = 'precheck')::bigint,
        count(*) filter (where guardrail = 'postcheck')::bigint,
        count(*) filter (where guardrail = 'offtopic')::bigint
    from ai.monitor_events
    where event_type = 'chat_turn'
      and ts >= case when p_range = 'today' then date_trunc('day', now())
          else now() - make_interval(days => case p_range when '30d' then 30 when '90d' then 90 else 7 end) end;
$$;

create or replace function ai.events_page(
    p_range text default '90d', p_severity text default 'all', p_action text default 'all',
    p_q text default '', p_page integer default 1, p_page_size integer default 15
) returns jsonb language plpgsql stable
set search_path = ai, pg_catalog
as $$
declare
    v_total integer;
    v_page_count integer;
    v_page integer;
    v_result jsonb;
begin
    select count(*) into v_total from ai.monitor_events m
    where m.event_type = 'chat_turn'
      and m.ts >= case when p_range = 'today' then date_trunc('day', now())
          else now() - make_interval(days => case p_range when '7d' then 7 when '30d' then 30 else 90 end) end
      and (p_severity = 'all' or (p_severity = 'warning' and (m.fallback_used or m.guardrail is not null))
          or (p_severity = 'info' and not m.fallback_used and m.guardrail is null))
      and (p_action = 'all' or (p_action = 'chat.feedback' and m.feedback is not null))
      and (p_q = '' or coalesce(m.client_id, '') ilike '%' || p_q || '%'
          or coalesce(m.model_used, '') ilike '%' || p_q || '%'
          or exists (select 1 from ai.programme_chunks pc where pc.programme_id = m.programme_id
              and pc.programme_name ilike '%' || p_q || '%'));

    v_page_count := greatest(1, ceil(v_total::numeric / greatest(1, p_page_size))::integer);
    v_page := least(greatest(1, p_page), v_page_count);

    select jsonb_build_object('events', coalesce(jsonb_agg(e order by e.ts_epoch desc), '[]'::jsonb),
        'total', v_total, 'page', v_page, 'pageCount', v_page_count) into v_result
    from (
        select m.id, (extract(epoch from m.ts) * 1000)::bigint as ts_epoch, m.ts, m.client_id,
            m.duration_ms, m.question_len, m.chunks_found, m.model_used, m.fallback_used,
            m.guardrail, m.feedback, m.ip_address, max(pc.programme_name) as programme_name
        from ai.monitor_events m
        left join ai.programme_chunks pc on pc.programme_id = m.programme_id
        where m.event_type = 'chat_turn'
          and m.ts >= case when p_range = 'today' then date_trunc('day', now())
              else now() - make_interval(days => case p_range when '7d' then 7 when '30d' then 30 else 90 end) end
          and (p_severity = 'all' or (p_severity = 'warning' and (m.fallback_used or m.guardrail is not null))
              or (p_severity = 'info' and not m.fallback_used and m.guardrail is null))
          and (p_action = 'all' or (p_action = 'chat.feedback' and m.feedback is not null))
          and (p_q = '' or coalesce(m.client_id, '') ilike '%' || p_q || '%'
              or coalesce(m.model_used, '') ilike '%' || p_q || '%'
              or exists (select 1 from ai.programme_chunks x where x.programme_id = m.programme_id
                  and x.programme_name ilike '%' || p_q || '%'))
        group by m.id
        order by m.ts desc
        limit greatest(1, least(p_page_size, 100)) offset (v_page - 1) * greatest(1, least(p_page_size, 100))
    ) e;
    return v_result;
end;
$$;

create or replace function ai.live_stats()
returns jsonb language sql stable
set search_path = ai, pg_catalog
as $$
    select jsonb_build_object(
        'users_online', (select count(distinct client_id) from ai.monitor_events where ts >= now() - interval '5 minutes'),
        'messages_today', (select count(*) from ai.monitor_events where event_type = 'chat_turn' and ts >= date_trunc('day', now())),
        'tokens_today', (select round(coalesce(sum(answer_len + coalesce(question_len, 0)), 0) / 4.0)::bigint
            from ai.monitor_events where event_type = 'chat_turn' and ts >= date_trunc('day', now())),
        'recent', coalesce((select jsonb_agg(r order by r.ts desc) from (
            select m.id, (extract(epoch from m.ts) * 1000)::bigint as ts_epoch, m.ts, m.client_id,
                m.duration_ms, m.question_len, m.chunks_found, m.model_used, m.fallback_used,
                m.guardrail, m.feedback, m.ip_address, max(pc.programme_name) as programme_name
            from ai.monitor_events m left join ai.programme_chunks pc on pc.programme_id = m.programme_id
            group by m.id order by m.ts desc limit 15
        ) r), '[]'::jsonb));
$$;

insert into ai.monitor_settings (key, value) values
    ('ai_status', 'online'),
    ('maintenance_mode', 'maintenance'),
    ('rate_limit_per_hour', '20'),
    ('context_chunks', '4'),
    ('temperature', '0.3'),
    ('stream_speed_ms', '25')
on conflict (key) do nothing;

-- Do not rely only on default privileges: close every object created above,
-- then grant precisely the AI runtime capabilities it needs.
revoke all on all tables in schema ai from public, anon, authenticated, pcs_app;
revoke all on all sequences in schema ai from public, anon, authenticated, pcs_app;
revoke execute on all functions in schema ai from public, anon, authenticated, pcs_app;

grant usage on schema ai, extensions to ai_runtime;
grant select, insert, update, delete on all tables in schema ai to ai_runtime;
grant usage, select, update on all sequences in schema ai to ai_runtime;
grant execute on all functions in schema ai to ai_runtime;
