import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { ProfileViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import { AlbumViewBasic } from "lexicon/types/app/rocksky/album/defs";
import { ArtistViewBasic } from "lexicon/types/app/rocksky/artist/defs";
import { SearchResultsView } from "lexicon/types/app/rocksky/feed/defs";
import { QueryParams } from "lexicon/types/app/rocksky/feed/search";
import { PlaylistViewBasic } from "lexicon/types/app/rocksky/playlist/defs";
import { SongViewBasic } from "lexicon/types/app/rocksky/song/defs";

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
      .then((res) => res.data)
  );
};

const presentation = (
  results: SearchResults
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
