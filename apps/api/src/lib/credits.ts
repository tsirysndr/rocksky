/**
 * Does a `tracks` row credit this artist?
 *
 * `artist_tracks` is not trustworthy on its own: the write paths resolve the
 * track and the artist from two separate lookups, and when the track lookup
 * falls back to MBID/ISRC it can land on a different recording entirely —
 * leaving rows like (Slipknot, "Baby" by Cannons) behind. The scrobbles stay
 * correct, so only the junction is wrong, and every read over it needs this
 * guard. `crates/navidrome` and `crates/jellyfin` already carry one.
 *
 * The comparison is containment in *either* direction, never equality,
 * because neither string is canonical:
 *
 *   artists.name             tracks.artist
 *   "Princess Superstar"  ⊂  "Mason, Princess Superstar"   collaboration
 *   "Nujabes / fat jon"   ⊃  "fat jon"                     split credit
 *   "Slipknot"            ⊘  "Cannons"                     stranger
 *
 * and it runs on a folded form, because the same artist is spelled several
 * ways across sources — "JAŸ-Z"/"JAY-Z", "Jóhann Jóhannsson"/"Johann
 * Johannsson", "8‐Bit"/"8-Bit" (U+2010 against a hyphen). Folding them
 * together costs nothing; treating them as different artists drops real
 * tracks off an artist's page.
 *
 * Deliberately done here and not in SQL: the database folds case for ASCII
 * only — `lower('SÄLEN')` comes back as `'sÄlen'`, and `ILIKE` follows the
 * same rules — so SÄLEN and Sälen would be two artists.
 */
export const creditsArtist = (
  artistName: string | null | undefined,
  track: { artist?: string | null; albumArtist?: string | null },
): boolean => {
  const name = fold(artistName);
  if (!name) return false;
  return [track.artist, track.albumArtist].some((credited) => {
    const other = fold(credited);
    return !!other && (other.includes(name) || name.includes(other));
  });
};

/** Lowercased, without diacritics, with typographic punctuation flattened. */
export const fold = (value: string | null | undefined): string =>
  (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
