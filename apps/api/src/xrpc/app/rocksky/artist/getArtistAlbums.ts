import type { Context } from "context";
import { consola } from "consola";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { AlbumViewBasic } from "lexicon/types/app/rocksky/album/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/artist/getArtistAlbums";
import { deepCamelCaseKeys } from "lib";

export default function (server: Server, ctx: Context) {
  const getArtistAlbums = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ albums: [] });
      }),
    );
  server.app.rocksky.artist.getArtistAlbums({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getArtistAlbums(params));
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
}): Effect.Effect<{ data: Album[] }, Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.analytics.post("library.getArtistAlbums", {
        artist_id: params.uri,
      }),
    catch: (error) => new Error(`Failed to retrieve artist's albums: ${error}`),
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
