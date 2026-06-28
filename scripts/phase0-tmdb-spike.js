/*
 * Phase 0 — throwaway TMDB spike.
 *
 * Proves the only pipeline this addon lives or dies by:
 *   year  ->  TMDB Discover  ->  /external_ids  ->  playable `tt` IMDb id
 *
 * It does NOT touch the Stremio SDK, the manifest, or any handler. The point is
 * to learn the imdb-resolution hit rate against a few years BEFORE we build
 * anything on top of TMDB. If items don't carry `tt` ids, the whole addon is
 * worthless (plan §2, §9), so we measure that first.
 *
 * Run:
 *   node scripts/phase0-tmdb-spike.js
 *
 * Key is read from process.env, or from .env.local in the project root.
 * Accepts EITHER:
 *   TMDB_API_KEY     - v3 key (32 hex chars, sent as ?api_key=)
 *   TMDB_READ_TOKEN  - v4 read access token (a long JWT, sent as Bearer)
 */

const fs = require("fs");
const path = require("path");

// --- minimal .env.local loader (so we don't depend on node --env-file) -------
function loadEnvLocal() {
  const file = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();

const READ_TOKEN = process.env.TMDB_READ_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;
const KEY = READ_TOKEN || API_KEY;
const isBearer = Boolean(READ_TOKEN) || (KEY && KEY.startsWith("eyJ"));

if (!KEY) {
  console.error(
    "Missing TMDB key.\n" +
      "  Add TMDB_API_KEY=... (v3) or TMDB_READ_TOKEN=... (v4) to .env.local,\n" +
      "  or pass it inline:  TMDB_API_KEY=xxxx node scripts/phase0-tmdb-spike.js"
  );
  process.exit(1);
}

const BASE = "https://api.themoviedb.org/3";
const YEARS = [1978, 1995, new Date().getFullYear() - 1];
const TV_YEAR = 1995;
const YEARS_AGO_SHOWCASE = 40; // for the "This Week, Years Ago" bracket demo

async function tmdb(p, params = {}) {
  const url = new URL(BASE + p);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const headers = { accept: "application/json" };
  if (isBearer) headers.Authorization = `Bearer ${KEY}`;
  else url.searchParams.set("api_key", KEY);

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TMDB ${res.status} on ${p} :: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// tiny concurrency limiter — be polite, TMDB allows plenty but no need to spray
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return out;
}

async function externalImdbId(mediaType, id) {
  try {
    const data = await tmdb(`/${mediaType}/${id}/external_ids`);
    return data.imdb_id || null; // TMDB returns "" or null when absent
  } catch {
    return null;
  }
}

async function probeYear(mediaType, year) {
  const discoverPath = mediaType === "movie" ? "/discover/movie" : "/discover/tv";
  const yearParam =
    mediaType === "movie"
      ? { primary_release_year: year }
      : { first_air_date_year: year };

  const disc = await tmdb(discoverPath, {
    sort_by: "popularity.desc",
    page: 1,
    include_adult: false,
    ...yearParam,
  });

  const results = disc.results || [];
  const rows = await mapLimit(results, 5, async (item) => {
    const title = item.title || item.name || "(untitled)";
    const date = item.release_date || item.first_air_date || "";
    const tt = await externalImdbId(mediaType, item.id);
    return { id: item.id, title, year: date.slice(0, 4), tt, poster: item.poster_path };
  });

  const withTt = rows.filter((r) => r.tt);
  const withPoster = rows.filter((r) => r.poster);
  return {
    total: results.length,
    totalAvailable: disc.total_results,
    rows,
    withTt: withTt.length,
    withPoster: withPoster.length,
  };
}

function pct(n, d) {
  return d ? Math.round((n / d) * 100) : 0;
}

function report(label, res) {
  console.log(`\n=== ${label} ===`);
  console.log(
    `page 1: ${res.total} items (of ${res.totalAvailable} total for the year)`
  );
  console.log(
    `resolved tt id : ${res.withTt}/${res.total} (${pct(res.withTt, res.total)}%)   ` +
      `with poster : ${res.withPoster}/${res.total} (${pct(res.withPoster, res.total)}%)`
  );
  console.log("top 10:");
  for (const r of res.rows.slice(0, 10)) {
    console.log(
      `  ${(r.tt || "NO-TT").padEnd(11)} ${(r.year || "????").padEnd(5)} ${r.title}` +
        (r.poster ? "" : "   [no poster]")
    );
  }
  const missing = res.rows.filter((r) => !r.tt);
  if (missing.length) {
    console.log(`  MISSING tt (${missing.length}): ${missing.map((m) => m.title).join(", ")}`);
  }
}

(async () => {
  console.log(
    `TMDB Phase 0 spike — auth: ${isBearer ? "v4 Bearer token" : "v3 api_key"}`
  );
  await tmdb("/configuration"); // auth sanity check
  console.log("auth OK.");

  // ---- Movies across the test years -----------------------------------------
  let movTotal = 0;
  let movTt = 0;
  for (const y of YEARS) {
    const res = await probeYear("movie", y);
    report(`Movies ${y}`, res);
    movTotal += res.total;
    movTt += res.withTt;
  }
  console.log(
    `\nMOVIE resolution overall: ${movTt}/${movTotal} (${pct(movTt, movTotal)}%)`
  );

  // ---- TV path (one year, confirms /tv/{id}/external_ids works) --------------
  const tv = await probeYear("tv", TV_YEAR);
  report(`TV ${TV_YEAR}`, tv);
  console.log(`\nTV resolution: ${tv.withTt}/${tv.total} (${pct(tv.withTt, tv.total)}%)`);

  // ---- "This Week, Years Ago" date-bracket sanity check ----------------------
  const now = new Date();
  const ty = now.getFullYear() - YEARS_AGO_SHOWCASE;
  const end = new Date(now);
  end.setDate(end.getDate() + 6);
  const iso = (yr, d) =>
    `${yr}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const gte = iso(ty, now);
  const lte = iso(ty, end);
  const tw = await tmdb("/discover/movie", {
    sort_by: "popularity.desc",
    page: 1,
    "primary_release_date.gte": gte,
    "primary_release_date.lte": lte,
  });
  console.log(`\n=== This Week, ${YEARS_AGO_SHOWCASE} Years Ago (${gte} .. ${lte}) ===`);
  console.log(`${tw.total_results} films released in that window; top 8:`);
  for (const item of (tw.results || []).slice(0, 8)) {
    console.log(`  ${item.release_date}  ${item.title}`);
  }

  console.log("\nDone.");
})().catch((e) => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});
