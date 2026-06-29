-- Cinema Time Machine — usage analytics queries.
-- Run these in the Supabase SQL editor (service_role). The addon's anon key can
-- only INSERT into ctm_events, so reads/aggregation happen here.
-- NOTE: open this file and copy from it (do not copy from chat/markdown, which
-- converts straight quotes ' into smart quotes and breaks the SQL).

-- 1) Active users: DAU / WAU / MAU (a catalog browse = real usage).
select
  count(distinct ip_hash) filter (where ts > now() - interval '1 day')   as dau,
  count(distinct ip_hash) filter (where ts > now() - interval '7 days')  as wau,
  count(distinct ip_hash) filter (where ts > now() - interval '30 days') as mau
from ctm_events
where kind = 'catalog';

-- 2) Install/refresh vs active use: manifest fetches vs catalog browses (30d).
select
  count(*)                filter (where kind = 'manifest') as manifest_fetches,
  count(*)                filter (where kind = 'catalog')  as catalog_browses,
  count(distinct ip_hash) filter (where kind = 'manifest') as manifest_clients,
  count(distinct ip_hash) filter (where kind = 'catalog')  as catalog_clients
from ctm_events
where ts > now() - interval '30 days';

-- 3) Daily trend (last 30 days).
select date(ts) as day,
       count(distinct ip_hash) as users,
       count(*)                as events
from ctm_events
where kind = 'catalog'
group by 1
order by 1 desc
limit 30;

-- 4) Volume by event kind (last 7 days).
select kind,
       count(*)                as n,
       count(distinct ip_hash) as unique_clients
from ctm_events
where ts > now() - interval '7 days'
group by kind
order by n desc;

-- 5) Approx total unique users ever (lower bound on active installs).
select count(distinct ip_hash) as approx_unique_users
from ctm_events
where kind = 'catalog';
