import type { Context } from "../context.ts";
import { Effect, pipe } from "effect";
import { deepCamelCaseKeys } from "../lib/deepCamelKeys.ts";

export default function (ctx: Context) {
  return Effect.runPromise(
    pipe(
      retrieve({ ctx, params: { size: 7 } }),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((error) =>
        Effect.fail(
          new Error(`Failed to retrieve now playing songs: ${error}`),
        ),
      ),
    ),
  );
}

const retrieve = ({
  ctx,
  params,
}: {
  ctx: Context;
  params: { size: number };
}) => {
  return Effect.tryPromise({
    try: () =>
      ctx.analytics.post("library.getDistinctScrobbles", {
        pagination: {
          skip: 0,
          take: params.size,
        },
      }),
    catch: (error) =>
      new Error(`Failed to retrieve now playing songs: ${error}`),
  });
};

const presentation = ({
  data,
}): Effect.Effect<{ nowPlayings: NowPlayingView[] }, never> => {
  return Effect.sync(() => ({
    nowPlayings: deepCamelCaseKeys(data),
  }));
};

export interface NowPlayingView {
  album?: string;
  albumArt?: string;
  albumArtist?: string;
  albumUri?: string;
  artist?: string;
  artistUri?: string;
  avatar?: string;
  createdAt?: string;
  did?: string;
  handle?: string;
  id?: string;
  title?: string;
  trackId?: string;
  trackUri?: string;
  uri?: string;
  [k: string]: unknown;
}
