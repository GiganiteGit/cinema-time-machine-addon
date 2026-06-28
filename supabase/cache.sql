-- Phase 4 durable cache for the Cinema Time Machine addon.
--
-- Lives in FindMyLegacy's Supabase project but is fully isolated: the addon
-- connects with the ANON/publishable key (never the prod service_role key on the
-- public host), so the RLS policies below grant CRUD on THESE TABLES ONLY. Every
-- other table keeps its own owner-scoped RLS. The cached data is non-sensitive
-- public TMDB metadata, so world-writable on these two tables is an acceptable
-- trade. TTLs are enforced in app code and stay under TMDB's 6-month cache cap.

-- TMDB id -> IMDb id map (stable; refreshed on read past ~5 months).
create table if not exists public.tmdb_imdb_map (
  tmdb_id    integer     not null,
  media_type text        not null,            -- 'movie' | 'tv'
  imdb_id    text        not null,            -- 'tt...'
  fetched_at timestamptz not null default now(),
  primary key (tmdb_id, media_type)
);
create index if not exists tmdb_imdb_map_fetched_at_idx
  on public.tmdb_imdb_map (fetched_at);

-- Whole catalog rows, keyed by type+year+page (or this-week date window+page).
create table if not exists public.year_results (
  cache_key  text        primary key,
  payload    jsonb       not null,
  fetched_at timestamptz not null default now()
);
create index if not exists year_results_fetched_at_idx
  on public.year_results (fetched_at);

alter table public.tmdb_imdb_map enable row level security;
alter table public.year_results  enable row level security;

-- Anon (the addon) may read + upsert on these two tables only.
drop policy if exists tmdb_imdb_map_read on public.tmdb_imdb_map;
create policy tmdb_imdb_map_read on public.tmdb_imdb_map
  for select to anon, authenticated using (true);
drop policy if exists tmdb_imdb_map_insert on public.tmdb_imdb_map;
create policy tmdb_imdb_map_insert on public.tmdb_imdb_map
  for insert to anon, authenticated with check (true);
drop policy if exists tmdb_imdb_map_update on public.tmdb_imdb_map;
create policy tmdb_imdb_map_update on public.tmdb_imdb_map
  for update to anon, authenticated using (true) with check (true);

drop policy if exists year_results_read on public.year_results;
create policy year_results_read on public.year_results
  for select to anon, authenticated using (true);
drop policy if exists year_results_insert on public.year_results;
create policy year_results_insert on public.year_results
  for insert to anon, authenticated with check (true);
drop policy if exists year_results_update on public.year_results;
create policy year_results_update on public.year_results
  for update to anon, authenticated using (true) with check (true);

-- Explicit privileges (required for new tables; delete intentionally withheld).
grant select, insert, update on table public.tmdb_imdb_map to anon, authenticated;
grant select, insert, update on table public.year_results  to anon, authenticated;
grant all on table public.tmdb_imdb_map to service_role;
grant all on table public.year_results  to service_role;
