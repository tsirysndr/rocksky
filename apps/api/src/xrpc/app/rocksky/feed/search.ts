import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ProfileViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import type { AlbumViewBasic } from "lexicon/types/app/rocksky/album/defs";
import type { ArtistViewBasic } from "lexicon/types/app/rocksky/artist/defs";
import type { SearchResultsView } from "lexicon/types/app/rocksky/feed/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/feed/search";
import type { PlaylistViewBasic } from "lexicon/types/app/rocksky/playlist/defs";
import type { SongViewBasic } from "lexicon/types/app/rocksky/song/defs";

export default function (server: Server, ctx: Context) {
  const search = (params) =>
    pipe({ params, ctx }, retrieve, Effect.flatMap(presentation));
  server.app.rocksky.feed.search({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(search(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({ params, ctx }: { params: QueryParams; ctx: Context }) => {
  return Effect.tryPromise(async () =>
    ctx.meilisearch
      .post<SearchResults>("multi-search", {
        federation: {},
        queries: [
          {
            indexUid: "albums",
            q: params.query,
          },
          {
            indexUid: "artists",
            q: params.query,
          },
          {
            indexUid: "tracks",
            q: params.query,
          },
          {
            indexUid: "playlists",
            q: params.query,
          },
          {
            indexUid: "users",
            q: params.query,
          },
        ],
      })
      .then((res) => res.data),
  );
};

const presentation = (
  results: SearchResults,
): Effect.Effect<SearchResultsView, never> => {
  return Effect.succeed(results);
};

type SearchResults = {
  hits: Array<
    | SongViewBasic
    | ArtistViewBasic
    | AlbumViewBasic
    | PlaylistViewBasic
    | ProfileViewBasic
  >;
};
