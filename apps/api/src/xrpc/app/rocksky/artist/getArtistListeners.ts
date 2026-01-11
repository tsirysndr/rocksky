import type { Context } from "context";
import { consola } from "consola";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ListenerViewBasic } from "lexicon/types/app/rocksky/artist/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/artist/getArtistListeners";

export default function (server: Server, ctx: Context) {
  const getArtistListeners = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ listeners: [] });
      }),
    );
  server.app.rocksky.artist.getArtistListeners({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getArtistListeners(params));
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
}): Effect.Effect<{ data: ArtistListener[] }, Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.analytics.post("library.getArtistListeners", {
        artist_id: params.uri,
        pagination: {
          skip: params.offset || 0,
          take: params.limit || 100,
        },
      }),
    catch: (error) =>
      new Error(`Failed to retrieve artist's listeners: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: ArtistListener[];
}): Effect.Effect<{ listeners: ListenerViewBasic[] }, never> => {
  return Effect.sync(() => ({
    listeners: data.map((item) => ({
      id: item.user_id,
      did: item.did,
      handle: item.handle,
      displayName: item.display_name,
      avatar: item.avatar,
      mostListenedSong: {
        title: item.most_played_track,
        uri: item.most_played_track_uri,
        playCount: item.track_play_count,
      },
      totalPlays: item.total_artist_plays,
      rank: item.listener_rank,
    })),
  }));
};

type ArtistListener = {
  artist: string;
  avatar: string;
  did: string;
  display_name: string;
  handle: string;
  listener_rank: number;
  most_played_track: string;
  most_played_track_uri: string;
  total_artist_plays: number;
  track_play_count: number;
  user_id: string;
};
