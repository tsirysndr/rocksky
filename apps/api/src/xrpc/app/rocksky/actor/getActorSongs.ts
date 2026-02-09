import type { Context } from "context";
import { consola } from "consola";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorSongs";
import type { SongViewBasic } from "lexicon/types/app/rocksky/song/defs";
import { deepCamelCaseKeys } from "lib";

export default function (server: Server, ctx: Context) {
  const getActorSongs = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ tracks: [] });
      }),
    );
  server.app.rocksky.actor.getActorSongs({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getActorSongs(params));
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
}): Effect.Effect<{ data: Track[] }, Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.analytics.post("library.getTopTracks", {
        user_did: params.did,
        pagination: {
          skip: params.offset || 0,
          take: params.limit || 10,
        },
        start_date: params.startDate,
        end_date: params.endDate,
      }),
    catch: (error) => new Error(`Failed to retrieve tracks: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Track[];
}): Effect.Effect<{ tracks: SongViewBasic[] }, never> => {
  return Effect.sync(() => ({
    tracks: deepCamelCaseKeys(data).map((x: SongViewBasic) => ({
      ...x,
      createdAt: `${x.createdAt}Z`,
    })),
  }));
};

type Track = {
  id: string;
  uri: string;
  unique_listeners: number;
  play_count: number;
  title: string;
  artist: string;
  artist_uri: string;
  album: string;
  album_uri: string;
  album_art: string;
  album_artist: string;
  copyright_message: string;
  disc_number: number;
  duration: number;
  sha256: string;
  track_number: number;
  created_at: string;
};
