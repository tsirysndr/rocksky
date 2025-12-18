import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ArtistViewBasic } from "lexicon/types/app/rocksky/artist/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/artist/getArtists";
import { deepCamelCaseKeys } from "lib";
import tables from "schema";
import { inArray } from "drizzle-orm";

export default function (server: Server, ctx: Context) {
  const getArtists = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(hydrate),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ artists: [] });
      }),
    );
  server.app.rocksky.artist.getArtists({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getArtists(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({
  params,
  ctx,
}: {
  params: QueryParams;
  ctx: Context;
}): Effect.Effect<{ data: Artist[]; ctx: Context }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const response = await ctx.analytics.post("library.getArtists", {
        pagination: {
          skip: params.offset || 0,
          take: params.limit || 100,
        },
      });
      return { data: response.data, ctx };
    },
    catch: (error) => new Error(`Failed to retrieve artists: ${error}`),
  });
};

const hydrate = ({
  data,
  ctx,
}: {
  data: Artist[];
  ctx: Context;
}): Effect.Effect<{ data: Artist[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const artists = await ctx.db
        .select()
        .from(tables.artists)
        .where(
          inArray(
            tables.artists.id,
            data.map((artist) => artist.id),
          ),
        )
        .execute();
      return {
        data: data.map((artist) => ({
          ...artist,
          picture: artists.find((a) => a.id === artist.id)?.picture,
        })),
      };
    },
    catch: (error) => new Error(`Failed to hydrate artists: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Artist[];
}): Effect.Effect<{ artists: ArtistViewBasic[] }, never> => {
  return Effect.sync(() => ({ artists: deepCamelCaseKeys(data) }));
};

type Artist = {
  id: string;
  name: string;
  picture: string;
  play_count: number;
  sha256: string;
  unique_listeners: number;
  uri: string;
};
