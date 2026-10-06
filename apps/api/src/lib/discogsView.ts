import type { DiscogsView } from "lexicon/types/app/rocksky/album/defs";
import type { SelectDiscogsRelease } from "schema/discogs-releases";

/**
 * Map a stored Discogs release onto the lexicon view. The lexicon carries the
 * match confidence as a 0-100 integer; the service scores it 0-1.
 */
export const toDiscogsView = (
  release?: SelectDiscogsRelease | null,
): DiscogsView | undefined => {
  if (!release) {
    return undefined;
  }
  return {
    releaseId: release.discogsId,
    masterId: release.masterId ?? undefined,
    title: release.title,
    artist: release.artist,
    albumArt: release.albumArt ?? undefined,
    year: release.year ?? undefined,
    originalYear: release.originalYear ?? undefined,
    releaseDate: release.releaseDate ?? undefined,
    country: release.country ?? undefined,
    label: release.label ?? undefined,
    catalogNumber: release.catalogNumber ?? undefined,
    barcode: release.barcode ?? undefined,
    formats: release.formats ?? undefined,
    genres: release.genres ?? undefined,
    styles: release.styles ?? undefined,
    url: release.discogsUrl ?? undefined,
    score:
      release.score === null || release.score === undefined
        ? undefined
        : Math.round(release.score * 100),
  };
};
