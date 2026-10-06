import type {
  DiscogsArtistView,
  DiscogsCreditView,
  DiscogsIdentifierView,
  DiscogsLabelView,
  DiscogsMasterView,
  DiscogsTrackView,
  DiscogsView,
} from "lexicon/types/app/rocksky/album/defs";
import type { SelectDiscogsCredit } from "schema/discogs-credits";
import type { SelectDiscogsIdentifier } from "schema/discogs-identifiers";
import type { SelectDiscogsMaster } from "schema/discogs-masters";
import type { SelectDiscogsReleaseArtist } from "schema/discogs-release-artists";
import type { SelectDiscogsReleaseLabel } from "schema/discogs-release-labels";
import type { SelectDiscogsRelease } from "schema/discogs-releases";
import type { SelectDiscogsTrack } from "schema/discogs-tracks";

// Everything stored for a release, as getAlbum loads it.
export interface DiscogsRelations {
  credits?: SelectDiscogsCredit[];
  tracklist?: SelectDiscogsTrack[];
  labels?: SelectDiscogsReleaseLabel[];
  identifiers?: SelectDiscogsIdentifier[];
  artists?: SelectDiscogsReleaseArtist[];
  master?: SelectDiscogsMaster | null;
}

const orUndefined = <T>(rows: T[] | undefined, map: (rows: T[]) => unknown) =>
  rows && rows.length > 0 ? map(rows) : undefined;

/**
 * Map a stored Discogs release onto the lexicon view. The lexicon carries the
 * match confidence as a 0-100 integer; the service scores it 0-1.
 */
export const toDiscogsCreditViews = (
  credits: SelectDiscogsCredit[] = [],
): DiscogsCreditView[] =>
  credits.map((credit) => ({
    artistId: credit.artistId ?? undefined,
    name: credit.name,
    role: credit.role ?? undefined,
    tracks: credit.tracks ?? undefined,
  }));

export const toDiscogsTrackViews = (
  tracks: SelectDiscogsTrack[],
): DiscogsTrackView[] =>
  tracks.map((track) => ({
    position: track.position ?? undefined,
    type: track.type ?? undefined,
    title: track.title,
    duration: track.duration ?? undefined,
    durationMs: track.durationMs ?? undefined,
    discNumber: track.discNumber ?? undefined,
    trackNumber: track.trackNumber ?? undefined,
  }));

export const toDiscogsLabelViews = (
  labels: SelectDiscogsReleaseLabel[],
): DiscogsLabelView[] =>
  labels.map((label) => ({
    labelId: label.labelId ?? undefined,
    name: label.name,
    catalogNumber: label.catalogNumber ?? undefined,
    kind: label.kind,
    entityType: label.entityType ?? undefined,
  }));

export const toDiscogsIdentifierViews = (
  identifiers: SelectDiscogsIdentifier[],
): DiscogsIdentifierView[] =>
  identifiers.map((identifier) => ({
    type: identifier.type,
    value: identifier.value ?? undefined,
    description: identifier.description ?? undefined,
  }));

export const toDiscogsArtistViews = (
  artists: SelectDiscogsReleaseArtist[],
): DiscogsArtistView[] =>
  artists.map((artist) => ({
    artistId: artist.artistId ?? undefined,
    name: artist.name,
    anv: artist.anv ?? undefined,
    joinPhrase: artist.joinPhrase ?? undefined,
    role: artist.role ?? undefined,
  }));

export const toDiscogsMasterView = (
  master?: SelectDiscogsMaster | null,
): DiscogsMasterView | undefined =>
  master
    ? {
        masterId: master.discogsId,
        title: master.title,
        artist: master.artist ?? undefined,
        year: master.year ?? undefined,
        mainReleaseId: master.mainReleaseId ?? undefined,
        url: master.discogsUrl ?? undefined,
        genres: master.genres ?? undefined,
        styles: master.styles ?? undefined,
      }
    : undefined;

export const toDiscogsView = (
  release?: SelectDiscogsRelease | null,
  relations: DiscogsRelations = {},
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
    credits: orUndefined(relations.credits, toDiscogsCreditViews) as
      | DiscogsCreditView[]
      | undefined,
    tracklist: orUndefined(relations.tracklist, toDiscogsTrackViews) as
      | DiscogsTrackView[]
      | undefined,
    labels: orUndefined(relations.labels, toDiscogsLabelViews) as
      | DiscogsLabelView[]
      | undefined,
    identifiers: orUndefined(relations.identifiers, toDiscogsIdentifierViews) as
      | DiscogsIdentifierView[]
      | undefined,
    artists: orUndefined(relations.artists, toDiscogsArtistViews) as
      | DiscogsArtistView[]
      | undefined,
    master: toDiscogsMasterView(relations.master),
  };
};
