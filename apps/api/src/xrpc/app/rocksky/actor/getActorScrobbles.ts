import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorScrobbles";
import type { ScrobbleViewBasic } from "lexicon/types/app/rocksky/scrobble/defs";
import { deepCamelCaseKeys } from "lib";

export default function (server: Server, ctx: Context) {
  const getActorScrobbles = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ scrobbles: [] });
      }),
    );
  server.app.rocksky.actor.getActorScrobbles({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getActorScrobbles(params));
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
}): Effect.Effect<{ data: Scrobble[] }, Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.analytics.post("library.getScrobbles", {
        user_did: params.did,
        pagination: {
          skip: params.offset,
          take: params.limit,
        },
      }),
    catch: (error) => new Error(`Failed to retrieve artists: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Scrobble[];
}): Effect.Effect<{ scrobbles: ScrobbleViewBasic[] }, never> => {
  return Effect.sync(() => ({ scrobbles: deepCamelCaseKeys(data) }));
};

type Scrobble = {
  id: string;
  track_id: string;
  title: string;
  artist: string;
  album_artist: string;
  album_art: string;
  album: string;
  handle: string;
  did: string;
  avatar: string | null;
  uri: string;
  track_uri: string;
  artist_uri: string;
  album_uri: string;
  created_at: string;
};
