import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { AlbumViewBasic } from "lexicon/types/app/rocksky/album/defs";
import { QueryParams } from "lexicon/types/app/rocksky/album/getAlbums";

export default function (server: Server, ctx: Context) {
  const getAlbums = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ albums: [] });
      })
    );
  server.app.rocksky.album.getAlbums({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getAlbums(params));
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
      ctx.analytics.post("library.getAlbums", {
        pagination: {
          skip: params.offset || 0,
          take: params.limit || 100,
        },
      }),
    catch: (error) => new Error(`Failed to retrieve albums: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Album[];
}): Effect.Effect<{ albums: AlbumViewBasic[] }, never> => {
  return Effect.sync(() => ({ albums: data }));
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
