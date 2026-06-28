// Durable cache (Phase 4) in the shared FindMyLegacy Supabase project. Two tables:
//   tmdb_imdb_map(tmdb_id, media_type, imdb_id, fetched_at)  — id map, ≤6mo TTL
//   year_results(cache_key, payload jsonb, fetched_at)        — whole rows
//
// Connects with the ANON/publishable key (never a service_role key on a public
// host); the tables' RLS grants anon CRUD on THESE tables only (see supabase/
// cache.sql). Degrades to a no-op when SUPABASE_URL/KEY are unset, and every
// call swallows errors — the addon falls back to live TMDB and never breaks.
'use strict';

const IMDB_MAP_TABLE = 'tmdb_imdb_map';
const YEAR_RESULTS_TABLE = 'year_results';

let client; // undefined = unresolved, false = unavailable, object = client
function supa() {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    client = false;
    return client;
  }
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// --- tmdb_imdb_map ----------------------------------------------------------
// Batch-get FRESH cached imdb ids. Returns Map<tmdb_id, imdb_id>; rows older
// than maxAgeMs are omitted so they re-resolve (keeps us inside TMDB's 6mo cap).
async function getImdbIds(mediaType, tmdbIds, maxAgeMs) {
  const db = supa();
  if (!db || !tmdbIds.length) return new Map();
  try {
    const { data, error } = await db
      .from(IMDB_MAP_TABLE)
      .select('tmdb_id, imdb_id, fetched_at')
      .eq('media_type', mediaType)
      .in('tmdb_id', tmdbIds);
    if (error || !data) return new Map();
    const cutoff = Date.now() - maxAgeMs;
    const out = new Map();
    for (const row of data) {
      if (new Date(row.fetched_at).getTime() >= cutoff) out.set(row.tmdb_id, row.imdb_id);
    }
    return out;
  } catch {
    return new Map();
  }
}

// Upsert newly resolved positive mappings. rows = [{ tmdbId, imdbId }].
async function putImdbIds(mediaType, rows) {
  const db = supa();
  if (!db || !rows.length) return;
  try {
    const now = new Date().toISOString();
    await db.from(IMDB_MAP_TABLE).upsert(
      rows.map((r) => ({
        tmdb_id: r.tmdbId,
        media_type: mediaType,
        imdb_id: r.imdbId,
        fetched_at: now,
      })),
      { onConflict: 'tmdb_id,media_type' },
    );
  } catch {
    /* best-effort */
  }
}

// --- year_results -----------------------------------------------------------
// Returns the cached metas payload if present and fresh, else undefined.
async function getYearResults(cacheKey, maxAgeMs) {
  const db = supa();
  if (!db) return undefined;
  try {
    const { data, error } = await db
      .from(YEAR_RESULTS_TABLE)
      .select('payload, fetched_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (error || !data) return undefined;
    if (Date.now() - new Date(data.fetched_at).getTime() > maxAgeMs) return undefined;
    return data.payload;
  } catch {
    return undefined;
  }
}

async function putYearResults(cacheKey, payload) {
  const db = supa();
  if (!db) return;
  try {
    await db.from(YEAR_RESULTS_TABLE).upsert(
      { cache_key: cacheKey, payload, fetched_at: new Date().toISOString() },
      { onConflict: 'cache_key' },
    );
  } catch {
    /* best-effort */
  }
}

const available = () => !!supa();

module.exports = { getImdbIds, putImdbIds, getYearResults, putYearResults, available };
