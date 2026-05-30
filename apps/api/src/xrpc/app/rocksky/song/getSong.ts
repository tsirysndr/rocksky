import type { Context } from "context";
import { consola } from "consola";
import { type SQL, asc, count, eq, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { SongViewDetailed } from "lexicon/types/app/rocksky/song/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/song/getSong";
import tables from "schema";
import type { SelectTrack } from "schema/tracks";
import type { SelectArtist } from "schema/artists";

export default function (server: Server, ctx: Context) {
  const getSong = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.song.getSong({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getSong(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({ params, ctx }: { params: QueryParams; ctx: Context }) => {
  return Effect.tryPromise({
    try: async () => {
      const uri = params.uri?.trim();
      const mbid = params.mbid?.trim();
      const isrc = params.isrc?.trim();
      const spotifyId = params.spotifyId?.trim();
      if (!uri && !mbid && !isrc && !spotifyId) {
        throw new Error("getSong requires one of: uri, mbid, isrc, spotifyId");
      }
      const clauses: SQL[] = [];
      if (uri) {
        clauses.push(eq(tables.userTracks.uri, uri));
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

      const { tracks: track, artists: artist } = await ctx.db
        .select()
        .from(tables.userTracks)
        .leftJoin(
          tables.tracks,
          eq(tables.userTracks.trackId, tables.tracks.id),
        )
        .leftJoin(
          tables.artists,
          eq(tables.tracks.artistUri, tables.artists.uri),
        )
        .where(where)
        .execute()
        .then(([row]) => row);

      const artists = await Promise.all(
        track.artist.split(",").map((name) =>
          ctx.db
            .select()
            .from(tables.artists)
            .where(eq(tables.artists.name, name.trim()))
            .execute()
            .then(([row]) => row),
        ),
      );

      return Promise.all([
        Promise.resolve(track),
        Promise.resolve(artist),
        Promise.resolve(artists.filter((x) => x !== undefined)),
        ctx.db
          .select({
            count: count(),
          })
          .from(tables.userTracks)
          .where(eq(tables.userTracks.trackId, track?.id))
          .execute()
          .then((rows) => rows[0]?.count || 0),
        ctx.db
          .select({ count: count() })
          .from(tables.scrobbles)
          .where(eq(tables.scrobbles.trackId, track?.id))
          .execute()
          .then((rows) => rows[0]?.count || 0),
        ctx.db
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
    catch: (error) => new Error(`Failed to retrieve artist: ${error}`),
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
