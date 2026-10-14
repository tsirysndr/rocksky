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
  const record =
    candidate.source === "catalog"
      ? await ctx.readDb
          .select()
          .from(tables.tracks)
          .where(eq(tables.tracks.id, candidate.id))
          .limit(1)
          .then((rows) => rows[0])
      : undefined;
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
    ...record,
    // The service may have selected a joined release; retain its checked identity.
  };
  track.title = candidate.title;
  track.artist = candidate.artists.join(", ");
  track.album = candidate.album ?? "";
  track.albumArtist = candidate.albumArtist ?? track.albumArtist;
  const [uniqueListeners, playCount] = record
    ? await Promise.all([
        ctx.readDb
          .select({ count: count() })
          .from(tables.userTracks)
          .where(eq(tables.userTracks.trackId, record.id))
          .then((rows) => rows[0]?.count ?? 0),
        ctx.readDb
          .select({ count: count() })
          .from(tables.scrobbles)
          .where(eq(tables.scrobbles.trackId, record.id))
          .then((rows) => rows[0]?.count ?? 0),
      ])
    : [0, 0];
  return {
    ...track,
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
    releaseDate: metadata.releaseDate?.toISOString().slice(0, 10) ?? null,
    year: metadata.year ?? null,
    artistPicture: metadata.artistPicture ?? null,
    genres: metadata.genres ?? null,
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
