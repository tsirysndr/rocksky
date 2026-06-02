import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { SearchResultsView } from "lexicon/types/app/rocksky/feed/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/feed/search";
import { type FederatedSearchResults, federatedSearch } from "typesense/search";

export default function (server: Server, ctx: Context) {
  const search = (params: QueryParams) =>
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

const retrieve = ({ params }: { params: QueryParams; ctx: Context }) =>
  Effect.tryPromise(() => federatedSearch(params.query, sizeOf(params)));

const presentation = (
  results: FederatedSearchResults,
): Effect.Effect<SearchResultsView, never> =>
  Effect.succeed(results as unknown as SearchResultsView);

function sizeOf(params: QueryParams): number {
  const raw = (params as unknown as { size?: number }).size;
  if (typeof raw === "number" && raw > 0) return Math.min(raw, 100);
  return 20;
}
