// TMDB client — discover by year + external-id resolution.
//
// Auth: prefers the v4 read access token (Bearer), falls back to the v3 api_key.
// Both come from the environment (.env.local locally, host env in prod).
//
// Phase 0 findings baked in (plan §4):
//   - sort by popularity (revenue is unreliable for older years)
//   - include_adult:false does NOT filter softcore/"pink" films, so we also
//     apply a vote_count floor to suppress the obscure long tail.
'use strict';

const READ_TOKEN = process.env.TMDB_READ_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;
const KEY = READ_TOKEN || API_KEY;
const isBearer = Boolean(READ_TOKEN) || (KEY && KEY.startsWith('eyJ'));
const BASE = 'https://api.themoviedb.org/3';

// Suppress obscure/long-tail titles (also clears most unflagged softcore).
const DEFAULT_VOTE_FLOOR = 50;

if (!KEY) {
  console.warn('[tmdb] No TMDB_READ_TOKEN / TMDB_API_KEY in env — TMDB calls will fail.');
}

// Stremio types are movie|series; TMDB paths are movie|tv.
function tmdbMediaType(stremioType) {
  return stremioType === 'series' ? 'tv' : 'movie';
}

async function tmdb(p, params = {}) {
  const url = new URL(BASE + p);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const headers = { accept: 'application/json' };
  if (isBearer) headers.Authorization = `Bearer ${KEY}`;
  else url.searchParams.set('api_key', KEY);

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TMDB ${res.status} ${p} :: ${body.slice(0, 180)}`);
  }
  return res.json();
}

// Run async fn over items with a small concurrency cap (be tidy, not greedy).
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Discover a page of titles for a given year. `mediaType` is the TMDB type
// (movie|tv). Returns the raw TMDB result objects (id, title/name, dates,
// poster_path, …) — id resolution happens in resolve.js.
async function discover(mediaType, { year, page = 1, voteFloor = DEFAULT_VOTE_FLOOR } = {}) {
  const isMovie = mediaType === 'movie';
  const params = {
    sort_by: 'popularity.desc',
    include_adult: false,
    'vote_count.gte': voteFloor,
    page,
  };
  if (isMovie) params.primary_release_year = year;
  else params.first_air_date_year = year;

  const data = await tmdb(isMovie ? '/discover/movie' : '/discover/tv', params);
  return data.results || [];
}

// Resolve a single TMDB id to its IMDb `tt` id (or null if absent/errored).
async function externalImdbId(mediaType, id) {
  try {
    const data = await tmdb(`/${mediaType}/${id}/external_ids`);
    return data.imdb_id || null; // TMDB returns "" or null when missing
  } catch {
    return null;
  }
}

// Discover films released within a date window (for "This Week, Years Ago").
// Films only — TV "first air date" windows don't map to a weekly schedule (§4).
async function discoverByDateRange(gte, lte, { page = 1, voteFloor = DEFAULT_VOTE_FLOOR } = {}) {
  const data = await tmdb('/discover/movie', {
    sort_by: 'popularity.desc',
    include_adult: false,
    'vote_count.gte': voteFloor,
    'primary_release_date.gte': gte,
    'primary_release_date.lte': lte,
    page,
  });
  return data.results || [];
}

module.exports = {
  tmdb,
  mapLimit,
  discover,
  discoverByDateRange,
  externalImdbId,
  tmdbMediaType,
  DEFAULT_VOTE_FLOOR,
};
