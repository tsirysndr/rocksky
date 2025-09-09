import type { Context } from "context";
import { count, eq, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ArtistViewDetailed } from "lexicon/types/app/rocksky/artist/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/artist/getArtist";
import tables from "schema";
import type { SelectArtist } from "schema/artists";

export default function (server: Server, ctx: Context) {
  const getArtist = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.artist.getArtist({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getArtist(params));
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
      const artist = await ctx.db
        .select()
        .from(tables.userArtists)
        .leftJoin(
          tables.artists,
          eq(tables.userArtists.artistId, tables.artists.id),
        )
        .where(
          or(
            eq(tables.userArtists.uri, params.uri),
            eq(tables.artists.uri, params.uri),
          ),
        )
        .execute()
        .then(([row]) => row?.artists);
      return Promise.all([
        Promise.resolve(artist),
        ctx.db
          .select({
            count: count(),
          })
          .from(tables.userArtists)
          .where(eq(tables.userArtists.artistId, artist?.id))
          .execute()
          .then((rows) => rows[0]?.count || 0),
        ctx.db
          .select({ count: count() })
          .from(tables.scrobbles)
          .where(eq(tables.scrobbles.artistId, artist?.id))
          .execute()
          .then((rows) => rows[0]?.count || 0),
      ]);
    },
    catch: (error) => new Error(`Failed to retrieve artist: ${error}`),
  });
};

const presentation = ([artist, uniqueListeners, playCount]: [
  SelectArtist,
  number,
  number,
]): Effect.Effect<ArtistViewDetailed, never> => {
  return Effect.sync(() => ({
    ...artist,
    playCount,
    uniqueListeners,
    createdAt: artist.createdAt.toISOString(),
    updatedAt: artist.updatedAt.toISOString(),
  }));
};
