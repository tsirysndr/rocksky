import type { QueryParams } from "lexicon/types/app/rocksky/song/matchSong";

export const getCacheKey = (params: QueryParams): string => {
  // The album narrows the match, so it must narrow the cache key too — the
  // same title/artist (or even mbId/isrc, see the ISRC-collision note in the
  // tracks schema) can resolve to different editions per requested album.
  const album = params.album ? `:album:${params.album.toLowerCase()}` : "";
  if (params.mbId) return `matchSong:mbId:${params.mbId}${album}`;
  if (params.isrc) return `matchSong:isrc:${params.isrc}${album}`;
  return `matchSong:${params.title.toLowerCase()}:${params.artist.toLowerCase()}${album}`;
};

// Alternate-edition markers in an album title. Deliberately a preference
// signal, never a filter: an album legitimately named with one of these words
// ("Live Through This") only loses when a marker-free candidate for the same
// track exists, which is exactly the case the ranking is for.
const EDITION_MARKERS =
  /\b(remaster(?:ed)?|live|deluxe|single|demo|acoustic|instrumental|karaoke|anniversary|expanded|edition|remix(?:es)?|mono|stereo|re-?issue|b-?sides?)\b/i;

// Ranks how "canonical" a release looks: a plain studio album beats singles,
// compilations and remaster/live/deluxe editions. `albumType` is Spotify's
// album.album_type ("album" | "single" | "compilation") when available; DB
// rows only have the title to go on.
export const canonicalScore = (
  albumName?: string | null,
  albumType?: string | null,
): number => {
  let score = 0;
  if (albumType === "album") score += 2;
  else if (albumType) score -= 1;
  if (albumName && EDITION_MARKERS.test(albumName)) score -= 2;
  return score;
};

// Highest canonicalScore wins; ties keep the provider's own ranking (first
// occurrence). Returns undefined only for an empty list.
export const preferCanonical = <T,>(
  items: T[],
  albumOf: (item: T) => { name?: string | null; type?: string | null },
): T | undefined => {
  let best: T | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const a = albumOf(item);
    const score = canonicalScore(a.name, a.type);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
};

// Album filtering runs before anything else looks at the search results: keep
// only the hits whose album title equals the requested one (case-insensitive)
// so a remaster/live/single edition can't win just by ranking first. When no
// hit is from that album (editions are often named slightly differently across
// catalogs) — or no album was requested at all — the most canonical-looking
// hit wins instead of whatever the provider ranked first; the caller's own
// album still wins in the published record.
export const pickByAlbum = <
  T extends { album?: { name?: string; album_type?: string } },
>(
  items: T[],
  album?: string,
): T | undefined => {
  if (album) {
    const wanted = album.toLowerCase();
    const fromAlbum = items.filter(
      (item) => item.album?.name?.toLowerCase() === wanted,
    );
    if (fromAlbum.length) return fromAlbum[0];
  }
  return preferCanonical(items, (item) => ({
    name: item.album?.name,
    type: item.album?.album_type,
  }));
};

export type AlbumRow = {
  tracks: { album: string | null };
  albums: { title: string | null } | null;
};

// With an album in the request, only a row from that album (compared
// case-insensitively against both the track's own album field and the joined
// albums row) counts as a database hit. A mismatch yields no `match` on
// purpose — the caller then consults the album-filtered external providers —
// but the first row is surfaced as `rejected` so the caller can still degrade
// to it if every provider comes up empty. Without an album the first row wins,
// exactly as before the album parameter existed.
export const pickRowByAlbum = <T extends AlbumRow>(
  rows: T[],
  album?: string,
): { match?: T; rejected?: T } => {
  const mostCanonical = () =>
    preferCanonical(rows, (row) => ({
      name: row.tracks.album ?? row.albums?.title,
    }));
  if (!album) return { match: mostCanonical() };
  const wanted = album.toLowerCase();
  const match = rows.find(
    (row) =>
      row.tracks.album?.toLowerCase() === wanted ||
      row.albums?.title?.toLowerCase() === wanted,
  );
  return match ? { match } : { rejected: mostCanonical() };
};
