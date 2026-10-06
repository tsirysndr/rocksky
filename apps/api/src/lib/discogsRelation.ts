import type {
  DiscogsArtistCredit,
  DiscogsLabelRef,
  DiscogsMaster,
  DiscogsRelease,
} from "./discogs";
import type { InsertDiscogsIdentifier } from "schema/discogs-identifiers";
import type { InsertDiscogsMaster } from "schema/discogs-masters";
import type { InsertDiscogsReleaseArtist } from "schema/discogs-release-artists";
import type { InsertDiscogsReleaseLabel } from "schema/discogs-release-labels";
import type { InsertDiscogsTrack } from "schema/discogs-tracks";

// Pure mappers from the service's Discogs objects to the relational rows. They
// take the release row id so the caller owns the write.

const trimmed = (value?: string | null) => value?.trim() || null;

// Mirrors the service's own parsing so a stored track carries the same numbers
// the enrichment reports: "7", "2-04" (disc 2) and "C2" (vinyl side C, the
// second disc of a 2xLP). Vinyl numbering stays side-relative, as printed.
export const parsePosition = (
  position: string,
): [disc: number, track: number] => {
  const pos = position.trim();
  if (!pos) {
    return [0, 0];
  }
  const split = pos.match(/^(\d+)[-.](\d+)/);
  if (split) {
    return [Number(split[1]), Number(split[2])];
  }
  const vinyl = pos.match(/^([A-Za-z])(\d+)/);
  if (vinyl) {
    const side = vinyl[1].toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
    return [Math.floor(side / 2) + 1, Number(vinyl[2])];
  }
  return /^\d+$/.test(pos) ? [0, Number(pos)] : [0, 0];
};

// Discogs writes "m:ss" or "h:mm:ss".
export const parseDurationMs = (duration: string): number => {
  const parts = duration.trim().split(":");
  if (parts.length < 1 || parts.length > 3 || duration.trim() === "") {
    return 0;
  }
  let seconds = 0;
  for (const part of parts) {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n < 0) {
      return 0;
    }
    seconds = seconds * 60 + n;
  }
  return seconds * 1000;
};

// Rebuilds the credit string from Discogs' join phrases.
export const joinArtistCredits = (artists: DiscogsArtistCredit[] = []) =>
  artists
    .filter((artist) => (artist.anv || artist.name)?.trim())
    .reduce((credit, artist, i, list) => {
      const name = (artist.anv || artist.name).trim();
      if (i === 0) {
        return name;
      }
      const join = list[i - 1].join?.trim();
      const separator = !join || join === "," ? ", " : ` ${join} `;
      return credit + separator + name;
    }, "");

export const toReleaseArtistRows = (
  releaseId: string,
  artists: DiscogsArtistCredit[] = [],
): InsertDiscogsReleaseArtist[] =>
  artists
    .filter((artist) => artist.name?.trim())
    .map((artist, position) => ({
      releaseId,
      artistId: artist.id || null,
      name: artist.name.trim(),
      anv: trimmed(artist.anv),
      joinPhrase: trimmed(artist.join),
      role: trimmed(artist.role),
      position,
    }));

// Labels and companies land in one table, told apart by `kind`.
export const toReleaseLabelRows = (
  releaseId: string,
  release: Pick<DiscogsRelease, "labels" | "companies">,
): InsertDiscogsReleaseLabel[] => {
  const rows = (entries: DiscogsLabelRef[] = [], kind: "label" | "company") =>
    entries
      .filter((entry) => entry.name?.trim())
      .map((entry, position) => ({
        releaseId,
        labelId: entry.id || null,
        name: entry.name.trim(),
        catalogNumber: trimmed(entry.catno),
        kind,
        entityType:
          trimmed(entry.entity_type_name) ?? trimmed(entry.entity_type),
        position,
      }));
  return [
    ...rows(release.labels, "label"),
    ...rows(release.companies, "company"),
  ];
};

export const toIdentifierRows = (
  releaseId: string,
  identifiers: DiscogsRelease["identifiers"] = [],
): InsertDiscogsIdentifier[] =>
  identifiers
    .filter((identifier) => identifier.type?.trim())
    .map((identifier, position) => ({
      releaseId,
      type: identifier.type.trim(),
      value: trimmed(identifier.value),
      description: trimmed(identifier.description),
      position,
    }));

export const toTrackRows = (
  releaseId: string,
  tracklist: DiscogsRelease["tracklist"] = [],
): InsertDiscogsTrack[] =>
  tracklist
    .filter((entry) => entry.title?.trim())
    .map((entry, idx) => {
      const [disc, track] = parsePosition(entry.position ?? "");
      const ms = parseDurationMs(entry.duration ?? "");
      return {
        releaseId,
        position: trimmed(entry.position),
        type: trimmed(entry.type_),
        title: entry.title.trim(),
        duration: trimmed(entry.duration),
        durationMs: ms > 0 ? ms : null,
        discNumber: disc > 0 ? disc : null,
        trackNumber: track > 0 ? track : null,
        idx,
      };
    });

export const toMasterRow = (
  master: DiscogsMaster,
): InsertDiscogsMaster | undefined => {
  if (!master.id || !master.title?.trim()) {
    return undefined;
  }
  return {
    discogsId: master.id,
    title: master.title.trim(),
    artist: joinArtistCredits(master.artists) || null,
    year: master.year || null,
    mainReleaseId: master.main_release || null,
    discogsUrl: trimmed(master.uri),
    genres: master.genres?.length ? master.genres : null,
    styles: master.styles?.length ? master.styles : null,
  };
};
