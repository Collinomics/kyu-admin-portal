-- One physical Supabase PostgreSQL database, two private application areas.
-- This file is intentionally idempotent so development setup can be retried.

create schema if not exists pcs;
create schema if not exists ai;

comment on schema pcs is 'Private canonical Programme Catalogue System data';
comment on schema ai is 'Private AI vector index, settings and telemetry';

-- Supabase's Data API roles must not reach either private schema directly.
revoke all on schema pcs from public, anon, authenticated;
revoke all on schema ai from public, anon, authenticated;

alter default privileges in schema pcs revoke all on tables from public, anon, authenticated;
alter default privileges in schema pcs revoke all on sequences from public, anon, authenticated;
alter default privileges in schema pcs revoke execute on functions from public, anon, authenticated;

alter default privileges in schema ai revoke all on tables from public, anon, authenticated;
alter default privileges in schema ai revoke all on sequences from public, anon, authenticated;
alter default privileges in schema ai revoke execute on functions from public, anon, authenticated;

-- Supabase installs extensions into its dedicated extensions schema.
create extension if not exists vector with schema extensions;

