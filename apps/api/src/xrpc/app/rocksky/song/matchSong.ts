import { catalogIdentity } from "./matchSongUris";
import { InvalidRequestError } from "@atproto/xrpc-server";
import type { Context } from "context";
import { count, eq } from "drizzle-orm";
import type { Server } from "lexicon";
import type {
  SongViewDetailed,
  SongMatchView,
} from "lexicon/types/app/rocksky/song/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/song/matchSong";
import {
  matchingRequest,
  resolveMatch,
  candidateMetadata,
  type MatchedCandidate,
} from "lib/matching";
import tables from "schema";
import type { SelectTrack } from "schema/tracks";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.song.matchSong({
    handler: async ({ params }) => ({
      encoding: "application/json",
      body: await retrieveMatch(ctx, params),
    }),
  });
}

export async function retrieveMatch(
  ctx: Context,
  params: QueryParams,
): Promise<SongViewDetailed> {
  // All identity decisions, including catalog selection, belong to the service.
  // No legacy ID-only/title-only Redis cache may bypass metadata validation.
  const result = await resolveMatch(ctx, matchingRequest(params));
  const candidate = result.track;
  if (!candidate)
    throw new InvalidRequestError("No unambiguous song match", "NotFound");
  const metadata = candidateMetadata(candidate);
  const selectedRecord =
    candidate.source === "catalog"
      ? await ctx.readDb
          .select()
          .from(tables.tracks)
          .where(eq(tables.tracks.id, candidate.id))
          .limit(1)
          .then((rows) => rows[0])
      : undefined;
  const identity = await catalogIdentity(ctx, candidate, selectedRecord);
  const catalogRecord = identity.record;
  // Only populated catalog fields override provider metadata. Null/empty values
  // are missing metadata, and placeholder durations must not erase real lengths.
  const catalogMetadata = Object.fromEntries(
    Object.entries(catalogRecord ?? {}).filter(
      ([key, value]) =>
        value != null &&
        value !== "" &&
        !(key === "duration" && Number(value) <= 1),
    ),
  ) as Partial<SelectTrack>;
  const track: SelectTrack = {
    id: "",
    title: candidate.title,
    artist: candidate.artists.join(", "),
    album: candidate.album ?? "",
    albumArtist: candidate.albumArtist ?? candidate.artists[0],
    albumArt: metadata.albumArt ?? null,
    duration: metadata.duration ?? 0,
    mbId: metadata.mbId ?? null,
    isrc: metadata.isrc ?? null,
    trackNumber: metadata.trackNumber ?? null,
    discNumber: metadata.discNumber ?? null,
    genre: metadata.genres?.join(", ") ?? null,
    label: metadata.label ?? null,
    spotifyLink: metadata.spotifyLink ?? null,
    youtubeLink: null,
    appleMusicLink: null,
    tidalLink: null,
    sha256: "",
    lyrics: null,
    composer: null,
    copyrightMessage: null,
    key: null,
    bpm: null,
    acoustidFingerprint: null,
    uri: null,
    albumUri: null,
    artistUri: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    xataVersion: 0,
    ...catalogMetadata,
    // The service may have selected a joined release; retain its checked identity.
  };
  track.title = candidate.title;
  track.artist = candidate.artists.join(", ");
  track.album = candidate.album ?? "";
  track.albumArtist = candidate.albumArtist ?? track.albumArtist;
  track.albumArt = identity.album?.albumArt || track.albumArt;
  const genres = track.genre
    ? track.genre.split(", ").filter(Boolean)
    : (metadata.genres ?? identity.artist?.genres ?? null);
  track.genre = track.genre || genres?.join(", ") || null;
  const [uniqueListeners, playCount] = catalogRecord
    ? await Promise.all([
        ctx.readDb
          .select({ count: count() })
          .from(tables.userTracks)
          .where(eq(tables.userTracks.trackId, catalogRecord.id))
          .then((rows) => rows[0]?.count ?? 0),
        ctx.readDb
          .select({ count: count() })
          .from(tables.scrobbles)
          .where(eq(tables.scrobbles.trackId, catalogRecord.id))
          .then((rows) => rows[0]?.count ?? 0),
      ])
    : [0, 0];
  return {
    ...track,
    id: catalogRecord?.id ?? track.id,
    sha256: catalogRecord?.sha256 ?? track.sha256,
    uri: identity.uri,
    albumUri: identity.albumUri,
    artistUri: identity.artistUri,
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
    releaseDate:
      identity.album?.releaseDate ||
      metadata.releaseDate?.toISOString().slice(0, 10) ||
      null,
    year: identity.album?.year ?? metadata.year ?? null,
    artistPicture: identity.artist?.picture || metadata.artistPicture || null,
    genres,
    mbArtists:
      candidate.musicbrainzArtists?.map((a) => ({
        mbid: a.mbid,
        name: a.name,
      })) ?? null,
    matches: result.candidates
      .filter(({ track }) => track.source !== "catalog")
      .map(({ track }) => candidateMatch(track)),
    playCount,
    uniqueListeners,
  };
}

// Candidates have passed the matching service's identity filters. Keep its order;
// its policy rank is not a confidence percentage or a provider popularity rank.
function candidateMatch(candidate: MatchedCandidate): SongMatchView {
  const ids = candidate.identifiers;
  const deezerId =
    candidate.source === "deezer"
      ? Number(ids.deezerTrackId ?? candidate.id)
      : undefined;
  const metadata = candidateMetadata(candidate);
  return {
    score:
      candidate.providerScore == null
        ? undefined
        : Math.round(candidate.providerScore),
    rank: candidate.providerRank ?? undefined,
    source: candidate.source,
    providerId: candidate.id,
    id:
      deezerId && Number.isSafeInteger(deezerId) && deezerId > 0
        ? deezerId
        : undefined,
    title: candidate.title,
    artist: candidate.artists.join(", "),
    album: candidate.album ?? undefined,
    albumArt: candidate.albumArt ?? undefined,
    isrc: ids.isrc ?? undefined,
    durationMs: candidate.durationMs ?? undefined,
    trackNumber: candidate.trackNumber ?? undefined,
    discNumber: candidate.discNumber ?? undefined,
    mbId: ids.musicbrainzRecordingId ?? undefined,
    mbReleaseId: ids.musicbrainzReleaseId ?? undefined,
    mbArtists: candidate.musicbrainzArtists ?? undefined,
    link:
      candidate.source === "deezer"
        ? metadata.deezerLink
        : candidate.source === "spotify"
          ? metadata.spotifyLink
          : candidate.source === "musicbrainz" && ids.musicbrainzRecordingId
            ? `https://musicbrainz.org/recording/${ids.musicbrainzRecordingId}`
            : undefined,
  };
}
