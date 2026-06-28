// Map a (resolved) TMDB item to a Stremio meta-preview for catalog rows.
// Cinemeta owns the full detail page; we only need enough to render the card.
'use strict';

const POSTER = 'https://image.tmdb.org/t/p/w500';

function toMetaPreview(item, ttId, stremioType) {
  const name = item.title || item.name || '(untitled)';
  const date = item.release_date || item.first_air_date || '';
  return {
    id: ttId, // the IMDb tt id — what makes the item playable
    type: stremioType, // movie | series
    name,
    poster: item.poster_path ? POSTER + item.poster_path : undefined,
    posterShape: 'poster',
    releaseInfo: date ? date.slice(0, 4) : undefined,
    description: item.overview || undefined,
  };
}

module.exports = { toMetaPreview };
