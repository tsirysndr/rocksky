import type { Context } from "context";
import { consola } from "consola";
import { count, eq, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { SongViewDetailed } from "lexicon/types/app/rocksky/song/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/song/getSong";
import tables from "schema";
import type { SelectTrack } from "schema/tracks";
import type { SelectArtist } from "schema/artists";

export default function (server: Server, ctx: Context) {
  const getSong = (params) =>
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
      const { tracks: track, artists: artist } = await ctx.db
        .select()
        .from(tables.userTracks)
        .leftJoin(
          tables.tracks,
          eq(tables.userTracks.trackId, tables.tracks.id),
        )
        .leftJoin(tables.artists, eq(tables.tracks.uri, tables.artists.uri))
        .where(
          or(
            eq(tables.userTracks.uri, params.uri),
            eq(tables.tracks.uri, params.uri),
          ),
        )
        .execute()
        .then(([row]) => row);
      return Promise.all([
        Promise.resolve(track),
        Promise.resolve(artist),
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
      ]);
    },
    catch: (error) => new Error(`Failed to retrieve artist: ${error}`),
  });
};

const presentation = ([track, artist, uniqueListeners, playCount]: [
  SelectTrack,
  SelectArtist,
  number,
  number,
]): Effect.Effect<SongViewDetailed, never> => {
  return Effect.sync(() => ({
    ...track,
    tags: artist.genres,
    playCount,
    uniqueListeners,
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
  }));
};
