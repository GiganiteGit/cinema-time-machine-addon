# Cinema Time Machine — Stremio Addon Build Plan

> Handoff brief for Claude Code. Save this in the repo root; it can seed `CLAUDE.md`.
> The constraints in §2 and the core mechanic in §3 are protocol facts, not preferences —
> don't design around alternatives to them.

---

## 1. What we're building (and why)

A Stremio addon that lets the user **pick any year and browse film and TV as it was then**.
Choose 1978 and the rows fill with what audiences were watching that year. The "time travel"
is a *live, in-app action* via a year dropdown — no reinstall, no config round-trip.

**Why this idea:** of a strong batch of discovery concepts, this was the most *buildable-novel*
one — distinctive, nobody's doing it, and it sits entirely within what a catalog addon can do.
It competes in the crowded discovery lane but with a fresh enough twist to stand out. It's a
hook/novelty addon: charming entry point, lighter repeat-use loop than the sensitivity addon, so
keep the build proportionate to that.

---

## 2. Protocol constraints — READ BEFORE WRITING CODE

A Stremio addon is a stateless HTTP service returning JSON. This one is **catalog-only** — no
`stream`, no `meta`. We emit catalog rows of titles carrying `tt` IMDb ids; Cinemeta owns the
detail pages and the user's existing stream addons (Torrentio etc.) provide playback for free.

Three hard facts this addon lives or dies by:

- **One selectable dropdown per catalog.** Stremio renders a catalog's non-required `genre`
  extra as a single-select dropdown in Discover. We spend that one dropdown on **the year**.
  You therefore **cannot** offer "year AND genre" as two live dropdowns on the same catalog
  (same single-select limit as the trigger filter in the sensitivity addon). Genre slicing, if
  wanted, goes to the **config page** or to separate per-genre catalogs — do not try to fake a
  second dropdown.

- **Items must carry `tt` IMDb ids or they're dead ends.** TMDB Discover returns TMDB ids, not
  imdb_id. Resolve TMDB→IMDb for every item (`/movie/{id}/external_ids`, `/tv/{id}/external_ids`)
  before emitting. Emit anything other than a `tt` id and the item won't play. The mapping itself is
  stable, BUT the TMDB API terms forbid caching any TMDB-derived data for longer than 6 months, so
  this is a **long TTL (≤6 months), not a permanent cache** — refresh on read past ~5 months. See §5.

- **Home board ≠ Discover.** On the main home board, catalogs render with *default* content (the
  user hasn't touched the dropdown yet). The live year-travel happens in **Discover**, where the
  dropdown appears. Decide deliberately what an un-selected catalog shows (see §3).

---

## 3. Core mechanic: year picker = the `genre` dropdown

The whole "time machine" effect is this: populate the catalog's `genre` `options` with **years**
(generated programmatically, current year → `currentYear − 80`). User opens Discover, picks a year,
the handler reads `extra.genre` (= e.g. `"1978"`), queries TMDB for that year, returns the row.
That's it.

**Default (no year selected) behaviour — choose and document:**
- Plain year catalogs (`ctm-movies`, `ctm-series`): default to the most recent complete year.
- "This Week, Years Ago" catalog: lean into the concept — default to titles released this
  calendar week N years back, using TMDB `primary_release_date.gte/lte` bracketing today's
  month/day in the target year. This is the most evocative row; make it the showcase.

---

## 4. Data source: TMDB

- **Films:** `GET /discover/movie?primary_release_year=<YYYY>&sort_by=popularity.desc&page=<n>`
- **TV:** `GET /discover/tv?first_air_date_year=<YYYY>&sort_by=popularity.desc&page=<n>`
- **This-week-years-ago:** `/discover/movie?primary_release_date.gte=<YYYY-MM-DD>&primary_release_date.lte=<YYYY-MM-DD>`
  bracketing ±a few days around today's month/day in the target year.
- **IMDb id per item:** `/movie/{id}/external_ids` → `imdb_id` (and TV equivalent).

**Honest data limits — put these in the addon description, don't discover them in production:**
1. **"Box office" is unreliable pre-1980s.** `sort_by=revenue.desc` has thin/missing revenue data
   for older years. Use **popularity** as the default sort; offer revenue sort only where data
   supports it, or label it "where available."
2. **TV is title-level, not "what aired this week."** TMDB gives shows that premiered/aired in a
   year, not an episode-level weekly schedule. Don't pretend otherwise — that granularity isn't
   cleanly available and chasing it is scope creep.

**Scope discipline — held from the original concept:** **film and TV only.** No music charts, no
contemporary reviews, no "upcoming releases of that year" — none of those live in a video-metadata
source, and adding them balloons the build for a novelty addon. If Martin wants the wider
"experience the year" feel later, that's a v2 conversation, not MVP.

---

## 5. Tech stack, caching, deployment

- **Runtime:** Node + `stremio-addon-sdk` (`addonBuilder`, `defineCatalogHandler`).
- **Config in URL:** if a config page is added (e.g. preferred genre, region, adult on/off), encode
  it base64url in the path before `/manifest.json` and decode via Express middleware around the
  SDK's `getRouter()` — same pattern as the sensitivity addon. MVP can ship with no config.
- **Cache:** Supabase. Two distinct caches — **both bounded by the TMDB 6-month cap (see below)**:
  - `tmdb_imdb_map(tmdb_id, media_type, imdb_id, fetched_at)` — long TTL, **≤6 months** (the mapping
    is stable, so refresh on read once `fetched_at` is older than ~5 months; do NOT treat as permanent).
  - `year_results(cache_key, payload jsonb, fetched_at)` keyed by type+year+page+sort — long TTL
    (popularity for a *past* year barely moves; days/weeks is fine, well inside the cap).
- **TMDB key:** central-hosted vs bring-your-own is the same decision as DTDD, but with a key
  difference: **TMDB is a large, well-resourced API with generous limits.** The guest-courtesy
  caching pressure that shaped the sensitivity addon isn't here — cache for **speed**, not
  politeness. Central-hosted key is the simpler default; revisit only if usage surprises you.
- **TMDB terms (non-commercial license) — three hard rules:**
  1. **6-month cache cap.** No TMDB-derived data may be cached longer than 6 months. Both caches
     above carry `fetched_at` and refresh past that — this is why the id-map is NOT permanent.
  2. **Attribution is mandatory.** Display the TMDB logo (kept *less prominent* than our own marks)
     and the notice: *"This product uses TMDB and the TMDB APIs but is not endorsed, certified, or
     otherwise approved by TMDB."* Put it in the manifest `description` and the config page if added.
  3. **Stay non-commercial.** No user fees, no ads, no revenue-driving use, no reselling TMDB data —
     any of those would require a separate written agreement with TMDB. A free, unlisted-or-listed
     addon is fine. Serving TMDB poster URLs in catalog rows is permitted; rehosting their images
     for ad banners is not. Revisit this clause before adding any monetisation.
- **Deployment:** SDK + Express on a long-running host (Render/Railway/Fly) is the quickest path,
  same as before. Vercel/Next port using Martin's existing infra remains an option for later —
  defer to launch.

---

## 6. Manifest (starting point)

```json
{
  "id": "community.cinema.timemachine",
  "version": "0.1.0",
  "name": "Cinema Time Machine",
  "description": "Travel to any year and browse film and TV as it was then. Pick a year from the dropdown and see what audiences were watching. (Films & TV only; popularity-ranked — box-office data is patchy for older years.)",
  "logo": "https://your-host/logo.png",
  "background": "https://your-host/bg.jpg",
  "contactEmail": "you@findmylegacy.co.uk",
  "behaviorHints": { "configurable": false, "configurationRequired": false, "adult": false, "p2p": false },
  "types": ["movie", "series"],
  "idPrefixes": ["tt"],
  "resources": ["catalog"],
  "catalogs": [
    { "type": "movie", "id": "ctm-movies", "name": "Time Machine — Films",
      "extra": [ { "name": "genre", "isRequired": false, "options": ["__YEARS__"] }, { "name": "skip" } ] },
    { "type": "series", "id": "ctm-series", "name": "Time Machine — TV",
      "extra": [ { "name": "genre", "isRequired": false, "options": ["__YEARS__"] }, { "name": "skip" } ] },
    { "type": "movie", "id": "ctm-thisweek", "name": "This Week, Years Ago",
      "extra": [ { "name": "genre", "isRequired": false,
        "options": ["10 years ago","25 years ago","40 years ago","50 years ago"] }, { "name": "skip" } ] }
  ]
}
```

`__YEARS__` is a placeholder: generate the descending year list (current year → `currentYear − 80`,
a rolling "within a lifetime" window) at manifest-build time. `configurable` is `false` for MVP; flip to `true` only if/when you add the config page in a
later phase.

---

## 7. Suggested file structure

```
/src
  manifest.js          // manifest + programmatic year-options generator
  addon.js             // addonBuilder + catalog handler wiring
  /handlers
    catalog.js         // reads extra.genre (year), routes to the right query
  /lib
    tmdb.js            // TMDB client: discover movie/tv, external_ids, key, retries
    resolve.js         // tmdb id -> imdb_id, with cached lookup (≤6-month TTL)
    cache.js           // Supabase: tmdb_imdb_map (≤6-month TTL) + year_results (TTL)
    years.js           // year list + "this week, years ago" date bracketing
    toMeta.js          // map TMDB item -> Stremio meta-preview (tt id, poster, name, year)
server.js              // Express + getRouter()
.env.example           // TMDB_API_KEY, SUPABASE_URL, SUPABASE_KEY
```

---

## 8. Phased plan

**Phase 0 — TMDB spike (do this first, no Stremio code yet).**
Throwaway script: given a year, call TMDB Discover, resolve each item to a `tt` id via
`external_ids`, print a clean list of {title, year, tt-id, poster}. Validate against 2–3 years
(e.g. 1978, 1995, a recent year). Confirm the `external_ids` resolution rate and how many items
return a usable `imdb_id`. **Exit criterion:** a reliable year → list-of-`tt`-ids pipeline.

**Phase 1 — Catalog plumbing.** Manifest with generated year options installing locally; one row
rendering in Stremio from a hardcoded year. Confirm items open Cinemeta detail pages and existing
stream addons light up.

**Phase 2 — Year dropdown live.** Catalog handler reads `extra.genre` and returns the correct
year's row in Discover. This is the headline mechanic — get it feeling instant.

**Phase 3 — "This Week, Years Ago" + defaults.** Date-bracketed query and the home-board default
behaviour from §3.

**Phase 4 — Caching.** Id-map cache (≤6-month TTL, per TMDB terms §5) + TTL year-results cache.
Pagination via `skip`.

**Phase 5 — Polish + deploy.** Logo/background, **TMDB attribution (logo + "not endorsed by TMDB"
notice, §5)**, honest description (the two data limits from §4), graceful empty-state for sparse early
years, deploy. Optionally submit to stremio-addons.net.

---

## 9. First task for Claude Code

Start at **Phase 0**. Do **not** scaffold the manifest or handler until the TMDB Discover →
`external_ids` → `tt`-id pipeline is proven against 2–3 years, and you've reported the
imdb-resolution hit rate. The whole addon is worthless if items don't carry playable ids, so prove
that first.

---

## 10. Open decisions for Martin

1. **Central TMDB key vs bring-your-own?** (Central is the easy default here — TMDB limits are generous.)
2. **Year range floor** — DECIDED: rolling `currentYear − 80` (≈1946 in 2026). Rationale: people
   relive moments from their own lifetime, so beyond ~80 years isn't relevant (and TMDB data thins
   out anyway). Rolling, not fixed, so it stays a "within a lifetime" window with no maintenance.
3. **Config page in scope for v1, or MVP without?** (Recommend MVP without; add later if wanted.)
4. **Public listing on stremio-addons.net, or unlisted?**

---

## 11. MVP definition of done

From a fresh install: open Discover, pick a year from the dropdown on the Films and TV catalogs,
and see that year's titles render with posters; items open working Cinemeta detail pages and play
via existing stream addons; the "This Week, Years Ago" row shows period-appropriate titles; results
are cached so repeat year-picks are instant. Description is honest about the popularity-sort and
title-level-TV limits.
