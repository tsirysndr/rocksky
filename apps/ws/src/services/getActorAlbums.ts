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
          limit: 12,
        },
      }),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((error) =>
        Effect.fail(new Error(`Failed to retrieve albums: ${error}`)),
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
}): Effect.Effect<{ data: Album[] }, Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.analytics.post("library.getTopAlbums", {
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
  data: Album[];
}): Effect.Effect<{ albums: AlbumViewBasic[] }, never> => {
  return Effect.sync(() => ({ albums: deepCamelCaseKeys(data) }));
};

type Album = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  artist_uri: string;
  year: number;
  album_art: string;
  release_date: string;
  sha256: string;
  play_count: number;
  unique_listeners: number;
};

export interface AlbumViewBasic {
  /** The unique identifier of the album. */
  id?: string;
  /** The URI of the album. */
  uri?: string;
  /** The title of the album. */
  title?: string;
  /** The artist of the album. */
  artist?: string;
  /** The URI of the album's artist. */
  artistUri?: string;
  /** The year the album was released. */
  year?: number;
  /** The URL of the album art image. */
  albumArt?: string;
  /** The release date of the album. */
  releaseDate?: string;
  /** The SHA256 hash of the album. */
  sha256?: string;
  /** The number of times the album has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the album. */
  uniqueListeners?: number;
  [k: string]: unknown;
}
