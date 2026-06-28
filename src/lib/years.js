// Year list for the dropdown + default-year helpers.
//
// Floor is a ROLLING "within a lifetime" window (plan §3/§10): people relive
// moments from their own lifetime, so we offer the current year back to
// currentYear − 80, regenerated at manifest-build time. No fixed floor to
// maintain — in 2026 it's 1946..2026, in 2030 it'll be 1950..2030.
'use strict';

const SPAN = 80;

function currentYear() {
  return new Date().getFullYear();
}

// Descending list of selectable years (newest first), as strings for the
// manifest `genre` options.
function yearOptions(now = currentYear()) {
  const out = [];
  for (let y = now; y >= now - SPAN; y--) out.push(String(y));
  return out;
}

// What an un-selected catalog defaults to: the most recent COMPLETE year
// (plan §3). The current year is half-finished, so step back one.
function defaultYear(now = currentYear()) {
  return now - 1;
}

// Is a given year inside the offered window? (guards handler input later)
function isYearInRange(year, now = currentYear()) {
  const y = Number(year);
  return Number.isInteger(y) && y <= now && y >= now - SPAN;
}

// --- "This Week, Years Ago" -------------------------------------------------
// The third catalog's dropdown offers relative distances, not absolute years.
// Default (no pick) leans into the concept at 25 years ago (plan §3).
const THIS_WEEK_OPTIONS = ['10 years ago', '25 years ago', '40 years ago', '50 years ago'];
const DEFAULT_YEARS_AGO = 25;

// "40 years ago" -> 40; anything unparseable -> null.
function parseYearsAgo(label) {
  const m = /^(\d+)/.exec(String(label || '').trim());
  return m ? Number(m[1]) : null;
}

function pad(n) {
  return String(n).padStart(2, '0');
}
function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// A ±3-day window around today's month/day in the target year (today − N years).
// Date math handles month/year rollover. Returns ISO strings for TMDB's
// primary_release_date.gte/lte.
function thisWeekBracket(yearsAgo, now = new Date()) {
  const targetYear = now.getFullYear() - yearsAgo;
  const center = new Date(targetYear, now.getMonth(), now.getDate());
  const start = new Date(center);
  start.setDate(center.getDate() - 3);
  const end = new Date(center);
  end.setDate(center.getDate() + 3);
  return { year: targetYear, gte: isoDate(start), lte: isoDate(end) };
}

module.exports = {
  SPAN,
  currentYear,
  yearOptions,
  defaultYear,
  isYearInRange,
  THIS_WEEK_OPTIONS,
  DEFAULT_YEARS_AGO,
  parseYearsAgo,
  thisWeekBracket,
};
