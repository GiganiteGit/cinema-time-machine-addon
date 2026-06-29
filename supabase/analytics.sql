-- Usage analytics for the Cinema Time Machine addon (one row per request of
-- interest). Lives in FindMyLegacy's Supabase project alongside the addon's
-- durable cache, but is fully isolated AND kept separate from the sensitivity
-- addon's `addon_events` table so the two addons' metrics never mix.
--
-- The addon connects with the ANON key, so the RLS below grants INSERT on THIS
-- TABLE ONLY and no read -- aggregation is done as service_role from the SQL
-- editor. No raw IPs are stored; ip_hash is a salted, truncated sha256.

create table if not exists public.ctm_events (
  id      bigint generated always as identity primary key,
  ts      timestamptz not null default now(),
  kind    text        not null,   -- manifest | catalog
  ip_hash text                    -- sha256(salt + ip), 32 hex chars; null if ip unknown
);

create index if not exists ctm_events_ts_idx      on public.ctm_events (ts);
create index if not exists ctm_events_kind_ts_idx on public.ctm_events (kind, ts);

alter table public.ctm_events enable row level security;

-- The addon (anon key) may only INSERT events here; it can never read them.
drop policy if exists ctm_events_insert on public.ctm_events;
create policy ctm_events_insert on public.ctm_events
  for insert to anon, authenticated with check (true);

-- Explicit privileges (required for new tables). Anon gets INSERT only.
grant insert on table public.ctm_events to anon, authenticated;
grant all    on table public.ctm_events to service_role;
