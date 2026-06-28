// Addon manifest (plan §6). Catalog-only — Cinemeta owns detail pages and the
// user's existing stream addons (Torrentio etc.) provide playback.
//
// The "time machine" is the catalog's single `genre` dropdown, populated with
// the rolling year window from years.js. MVP is not configurable (no config
// page yet); flip `configurable` to true if/when one is added.
'use strict';

const { yearOptions, THIS_WEEK_OPTIONS } = require('./lib/years');

const BASE = (process.env.ADDON_BASE_URL || `http://127.0.0.1:${process.env.PORT || 7000}`)
  .replace(/\/+$/, '');

// One selectable dropdown per catalog: we spend it on the year (plan §2/§3).
const yearExtra = { name: 'genre', isRequired: false, options: yearOptions() };
const catalogExtra = [yearExtra, { name: 'skip', isRequired: false }];

// "This Week, Years Ago" spends its dropdown on relative distances, not years.
const thisWeekExtra = [
  { name: 'genre', isRequired: false, options: THIS_WEEK_OPTIONS },
  { name: 'skip', isRequired: false },
];

module.exports = {
  id: 'community.cinema.timemachine',
  version: '0.1.0',
  // Ownership proof from stremio-addons.net — verifies this manifest is served by the author.
  stremioAddonsConfig: {
    issuer: 'https://stremio-addons.net',
    signature:
      'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..0BA5vK1j8OBbhnvZTvB1nA.Pn8SZch5rLOxr_bUTUdzrM_f3jGvxSVbGGwgmk_l6voycuLqgbZ8p2D9IWliQXea59YCtu3N0c5CL4tO847WoiaGVZZVyHgWONIQ1KLMkCCeQMxxKVBLhwrXYz_9JPxH.6ctU_8mnkcnFLKlQbu9uAQ',
  },
  name: 'Cinema Time Machine',
  description:
    'Travel to any year and browse film and TV as it was then. Pick a year from the dropdown ' +
    'in Discover and see what audiences were watching, plus a "This Week, Years Ago" row of films ' +
    'released this week in years past. Notes: titles are popularity-ranked (box-office data is ' +
    'patchy for older years) and TV is listed at the show level, not per-episode. ' +
    'This addon uses TMDB and the TMDB APIs but is not endorsed or certified by TMDB.',
  logo: `${BASE}/logo.png`,
  background: `${BASE}/background.png`,
  contactEmail: 'martin.taylor@findmylegacy.co.uk',
  behaviorHints: { configurable: false, configurationRequired: false, adult: false, p2p: false },
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  resources: ['catalog'],
  catalogs: [
    { type: 'movie', id: 'ctm-movies', name: 'Time Machine — Films', extra: catalogExtra },
    { type: 'series', id: 'ctm-series', name: 'Time Machine — TV', extra: catalogExtra },
    { type: 'movie', id: 'ctm-thisweek', name: 'This Week, Years Ago', extra: thisWeekExtra },
  ],
};
