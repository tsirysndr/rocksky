import type { Context } from "context";
import { consola } from "consola";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorArtists";
import type { ArtistViewBasic } from "lexicon/types/app/rocksky/artist/defs";
import { deepCamelCaseKeys } from "lib";
import { inArray } from "drizzle-orm";
import tables from "schema";
import { indexBy, prop } from "ramda";

export default function (server: Server, ctx: Context) {
  const getActorArtists = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ artists: [] });
      }),
    );
  server.app.rocksky.actor.getActorArtists({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getActorArtists(params));
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
}): Effect.Effect<{ data: Artist[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const response = await ctx.analytics.post<Artist[]>(
        "library.getTopArtists",
        {
          user_did: params.did,
          pagination: {
            skip: params.offset || 0,
            take: params.limit || 10,
          },
          start_date: params.startDate,
          end_date: params.endDate,
        },
      );
      const ids = response.data.map((x) => x.id);
      const artists = await ctx.db
        .select()
        .from(tables.artists)
        .where(inArray(tables.artists.id, ids))
        .execute();
      const indexedArtists = indexBy(prop("id"), artists);
      return {
        data: response.data.map((x) => ({
          ...x,
          tags: indexedArtists[x.id]?.genres,
        })),
      };
    },
    catch: (error) => new Error(`Failed to retrieve artists: ${error}`),
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
  tags?: string[];
};
