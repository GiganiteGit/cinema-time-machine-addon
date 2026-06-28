// TMDB id -> IMDb `tt` id resolution, cache-aware (Phase 4).
//
// Checks the durable tmdb_imdb_map first (one batched read), only calls TMDB
// /external_ids for the misses, then writes the new positives back. Items that
// still don't resolve are DROPPED — Stremio can't play them (plan §2).
//
// The cache TTL stays under TMDB's 6-month cap: stale rows are ignored by the
// cache read, so they re-resolve and refresh.
'use strict';

const { externalImdbId, mapLimit } = require('./tmdb');
const { getImdbIds, putImdbIds } = require('./cache');

const IMDB_MAP_TTL_MS = 150 * 24 * 60 * 60 * 1000; // ~5 months (< 6mo cap)

// mediaType is the TMDB type (movie|tv). Returns [{ item, ttId }] in input
// order, minus any that didn't resolve.
async function resolveImdbIds(mediaType, items, { concurrency = 5 } = {}) {
  const cached = await getImdbIds(mediaType, items.map((it) => it.id), IMDB_MAP_TTL_MS);

  const misses = items.filter((it) => !cached.has(it.id));
  const fetched = await mapLimit(misses, concurrency, async (item) => ({
    id: item.id,
    ttId: await externalImdbId(mediaType, item.id),
  }));

  // Persist newly resolved positives for next time.
  await putImdbIds(
    mediaType,
    fetched.filter((f) => f.ttId).map((f) => ({ tmdbId: f.id, imdbId: f.ttId })),
  );

  const fetchedMap = new Map(fetched.map((f) => [f.id, f.ttId]));
  const out = [];
  for (const item of items) {
    const ttId = cached.has(item.id) ? cached.get(item.id) : fetchedMap.get(item.id);
    if (ttId) out.push({ item, ttId });
  }
  return out;
}

module.exports = { resolveImdbIds };
