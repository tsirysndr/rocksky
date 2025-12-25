import type { Context } from "../context.ts";
import { Effect, pipe } from "effect";
import { deepCamelCaseKeys } from "../lib/deepCamelKeys.ts";

export default function (ctx: Context, did: string) {
  return Effect.runPromise(
    pipe(
      retrieve({
        ctx,
        params: {
          did,
          offset: 0,
          limit: 10,
        },
      }),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((error) =>
        Effect.fail(new Error(`Failed to retrieve scrobbles: ${error}`)),
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
    catch: (error) => new Error(`Failed to retrieve scrobles: ${error}`),
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

export interface ScrobbleViewBasic {
  /** The unique identifier of the scrobble. */
  id?: string;
  /** The handle of the user who created the scrobble. */
  user?: string;
  /** The display name of the user who created the scrobble. */
  userDisplayName?: string;
  /** The avatar URL of the user who created the scrobble. */
  userAvatar?: string;
  /** The title of the scrobble. */
  title?: string;
  /** The artist of the song. */
  artist?: string;
  /** The URI of the artist. */
  artistUri?: string;
  /** The album of the song. */
  album?: string;
  /** The URI of the album. */
  albumUri?: string;
  /** The album art URL of the song. */
  cover?: string;
  /** The timestamp when the scrobble was created. */
  date?: string;
  /** The URI of the scrobble. */
  uri?: string;
  /** The SHA256 hash of the scrobble data. */
  sha256?: string;
  [k: string]: unknown;
}
