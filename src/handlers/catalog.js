// Catalog handler — the time machine itself.
//
// Three catalogs, dispatched by id:
//   ctm-movies / ctm-series — pick an absolute year (extra.genre) -> that year's row.
//   ctm-thisweek            — pick "N years ago" -> films released this week, N years back.
//
// With no selection, the year catalogs default to the most recent complete year
// and the this-week catalog to 25 years ago (plan §3).
//
// PHASE 4: read-through durable cache (year_results) wraps each row, and `skip`
// drives real TMDB pagination. Stremio dedupes catalog items by id, so the small
// overlap from dropping dead-ends at page boundaries is harmless.
'use strict';

const { discover, discoverByDateRange, tmdbMediaType } = require('../lib/tmdb');
const { resolveImdbIds } = require('../lib/resolve');
const { toMetaPreview } = require('../lib/toMeta');
const { getYearResults, putYearResults } = require('../lib/cache');
const {
  defaultYear,
  isYearInRange,
  parseYearsAgo,
  DEFAULT_YEARS_AGO,
  thisWeekBracket,
} = require('../lib/years');

const PAGE_SIZE = 20; // TMDB discover page size
const YEAR_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (< TMDB 6mo cap)
const THISWEEK_TTL_MS = 12 * 60 * 60 * 1000; // 12h (date-keyed; rolls daily)

function pageFromSkip(extra) {
  return Math.floor((Number(extra.skip) || 0) / PAGE_SIZE) + 1;
}

async function toMetas(tmdbType, items, stremioType) {
  const resolved = await resolveImdbIds(tmdbType, items);
  return resolved.map(({ item, ttId }) => toMetaPreview(item, ttId, stremioType));
}

// Read-through cache around a metas producer. Never caches empty results, so a
// transient upstream blip can't poison a key with an empty row.
async function cached(key, ttlMs, produce) {
  const hit = await getYearResults(key, ttlMs);
  if (hit && hit.length) return hit;
  const metas = await produce();
  if (metas.length) await putYearResults(key, metas);
  return metas;
}

async function yearCatalog(stremioType, extra) {
  const picked = extra.genre;
  const year = picked && isYearInRange(picked) ? Number(picked) : defaultYear();
  const page = pageFromSkip(extra);
  const mt = tmdbMediaType(stremioType);
  const key = `cat:v1:${stremioType}:${year}:p${page}`;
  const metas = await cached(key, YEAR_TTL_MS, async () => {
    let items = await discover(mt, { year, page });
    // Sparse early year? Drop the vote floor on page 1 so the row isn't empty.
    if (!items.length && page === 1) items = await discover(mt, { year, page, voteFloor: 0 });
    return toMetas(mt, items, stremioType);
  });
  return { metas, cacheMaxAge: 24 * 3600 };
}

async function thisWeekCatalog(extra) {
  const yearsAgo = parseYearsAgo(extra.genre) || DEFAULT_YEARS_AGO;
  const page = pageFromSkip(extra);
  const { gte, lte } = thisWeekBracket(yearsAgo);
  const key = `tw:v1:${gte}:${lte}:p${page}`;
  const metas = await cached(key, THISWEEK_TTL_MS, async () => {
    let items = await discoverByDateRange(gte, lte, { page });
    // Thin window in an old year? Drop the vote floor on page 1 to fill the row.
    if (!items.length && page === 1) items = await discoverByDateRange(gte, lte, { page, voteFloor: 0 });
    return toMetas('movie', items, 'movie');
  });
  return { metas, cacheMaxAge: 12 * 3600 };
}

async function catalogHandler(args) {
  const { id, type, extra = {} } = args;
  if (id === 'ctm-thisweek') return thisWeekCatalog(extra);
  return yearCatalog(type, extra);
}

module.exports = catalogHandler;
