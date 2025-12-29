import type { Context } from "../context.ts";
import { Effect, pipe } from "effect";

export default function (ctx: Context, did: string) {
  return pipe(
    retrieve({
      ctx,
      params: {
        did,
        offset: 0,
        limit: 20,
      },
    }),
    Effect.retry({ times: 3 }),
    Effect.timeout("120 seconds"),
    Effect.catchAll((error) =>
      Effect.fail(new Error(`Failed to retrieve songs: ${error}`)),
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
}): Effect.Effect<{ data: Scrobble[] }, Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.analytics.post("library.getTopTracks", {
        user_did: params.did,
        pagination: {
          skip: params.offset,
          take: params.limit,
        },
      }),
    catch: (error) => new Error(`Failed to retrieve tracks: ${error}`),
  });
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
