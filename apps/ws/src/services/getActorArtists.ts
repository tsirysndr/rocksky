import type { Context } from "../context.ts";
import { Effect, pipe } from "effect";
import { deepCamelCaseKeys } from "../lib/deepCamelKeys.ts";

export default function (ctx: Context, did: string) {
  return Effect.runPromise(
    pipe(
      retrieve({ ctx, params: { did, offset: 0, limit: 20 } }),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((error) =>
        Effect.fail(new Error(`Failed to retrieve artists: ${error}`)),
      ),
    ),
  );
}

const retrieve = ({
  params,
  ctx,
}: {
  params: {
    did: string;
    offset: number;
    limit: number;
  };
  ctx: Context;
}): Effect.Effect<{ data: Artist[] }, Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.analytics.post("library.getTopArtists", {
        user_did: params.did,
        pagination: {
          skip: params.offset || 0,
          take: params.limit || 10,
        },
      }),
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
};

export interface ArtistViewBasic {
  /** The unique identifier of the artist. */
  id?: string;
  /** The URI of the artist. */
  uri?: string;
  /** The name of the artist. */
  name?: string;
  /** The picture of the artist. */
  picture?: string;
  /** The SHA256 hash of the artist. */
  sha256?: string;
  /** The number of times the artist has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the artist. */
  uniqueListeners?: number;
  [k: string]: unknown;
}
