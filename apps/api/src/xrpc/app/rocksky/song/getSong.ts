import type { HandlerAuth } from "@atproto/xrpc-server";
import { InvalidRequestError } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { asc, count, eq, inArray, or, type SQL } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { SongViewDetailed } from "lexicon/types/app/rocksky/song/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/song/getSong";
import { transientDbRetry } from "lib/dbRetry";
import { withLikes } from "lib/trackLikes";
import tables from "schema";
import type { SelectArtist } from "schema/artists";
import type { SelectTrack } from "schema/tracks";

export default function (server: Server, ctx: Context) {
  const getSong = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      retrieve,
      Effect.flatMap(presentation),
      // Not-found is definitive; only transient failures are worth retrying.
      Effect.retry(transientDbRetry),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        if (err instanceof InvalidRequestError) {
          return Effect.fail(err);
        }
        consola.error(err);
        return Effect.fail(err);
      }),
    );
  server.app.rocksky.song.getSong({
    // Optional: authVerifier returns {} without a token, so the song stays
    // public — a DID just means `liked` can be filled in.
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(
        Effect.either(getSong(params, auth)),
      );
      if (result._tag === "Left") throw result.left;
      return {
        encoding: "application/json",
        body: result.right,
      };
    },
  });
}

const retrieve = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}) => {
  return Effect.tryPromise({
    try: async () => {
      const uri = params.uri?.trim();
      const mbid = params.mbid?.trim();
      const isrc = params.isrc?.trim();
      const spotifyId = params.spotifyId?.trim();
      if (!uri && !mbid && !isrc && !spotifyId) {
        throw new InvalidRequestError(
          "getSong requires one of: uri, mbid, isrc, spotifyId",
        );
      }
      const clauses: SQL[] = [];
      if (uri) {
        // Resolve the user URI separately so the song lookup never joins all
        // listeners or puts an OR across two tables.
        const [userTrack] = await ctx.readDb
          .select({ trackId: tables.userTracks.trackId })
          .from(tables.userTracks)
          .where(eq(tables.userTracks.uri, uri))
          .limit(1)
          .execute();
        if (userTrack) clauses.push(eq(tables.tracks.id, userTrack.trackId));
        clauses.push(eq(tables.tracks.uri, uri));
      }
      if (mbid) clauses.push(eq(tables.tracks.mbId, mbid));
      if (isrc) clauses.push(eq(tables.tracks.isrc, isrc));
      if (spotifyId) {
        clauses.push(
          eq(
            tables.tracks.spotifyLink,
            `https://open.spotify.com/track/${spotifyId}`,
          ),
        );
      }
      const where = clauses.length > 1 ? or(...clauses) : clauses[0];

      const row = await ctx.readDb
        .select({ tracks: tables.tracks, artists: tables.artists })
        .from(tables.tracks)
        .leftJoin(
          tables.artists,
          eq(tables.tracks.artistUri, tables.artists.uri),
        )
        .where(where)
        .limit(1)
        .execute()
        .then(([row]) => row);

      if (!row?.tracks) {
        throw new InvalidRequestError(
          `Song not found: ${uri ?? mbid ?? isrc ?? spotifyId}`,
          "NotFound",
        );
      }
      const { tracks: track, artists: artist } = row;

      const artistNames = track.artist.split(",").map((name) => name.trim());
      const artistRows = await ctx.readDb
        .select()
        .from(tables.artists)
        .where(inArray(tables.artists.name, [...new Set(artistNames)]))
        .execute();
      const artists = artistNames
        .map((name) => artistRows.find((artist) => artist.name === name))
        .filter((artist) => artist !== undefined);

      return Promise.all([
        // withLikes over the single track, so the counts come from the same
        // place the album and playlist views use.
        withLikes(ctx, [track], did).then((rows) => rows[0] ?? track),
        Promise.resolve(artist),
        Promise.resolve(artists.filter((x) => x !== undefined)),
        ctx.readDb
          .select({
            count: count(),
          })
          .from(tables.userTracks)
          .where(eq(tables.userTracks.trackId, track?.id))
          .execute()
          .then((rows) => rows[0]?.count || 0),
        ctx.readDb
          .select({ count: count() })
          .from(tables.scrobbles)
          .where(eq(tables.scrobbles.trackId, track?.id))
          .execute()
          .then((rows) => rows[0]?.count || 0),
        ctx.readDb
          .select({
            handle: tables.users.handle,
            avatar: tables.users.avatar,
            timestamp: tables.scrobbles.timestamp,
          })
          .from(tables.scrobbles)
          .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
          .where(eq(tables.scrobbles.trackId, track?.id))
          .orderBy(asc(tables.scrobbles.timestamp))
          .limit(1)
          .execute()
          .then(([row]) => row ?? null),
      ]);
    },
    catch: (error) =>
      error instanceof InvalidRequestError
        ? error
        : new Error(`Failed to retrieve song: ${error}`),
  });
};

const presentation = ([
  track,
  artist,
  artists,
  uniqueListeners,
  playCount,
  firstScrobble,
]: [
  SelectTrack,
  SelectArtist,
  SelectArtist[],
  number,
  number,
  { handle: string; avatar: string; timestamp: Date } | null,
]): Effect.Effect<SongViewDetailed, never> => {
  return Effect.sync(() => ({
    ...track,
    tags: artist?.genres || [],
    artists: artists.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    playCount,
    uniqueListeners,
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
    firstScrobble: firstScrobble
      ? {
          handle: firstScrobble.handle,
          avatar: firstScrobble.avatar,
          timestamp: firstScrobble.timestamp.toISOString(),
        }
      : undefined,
  }));
};
