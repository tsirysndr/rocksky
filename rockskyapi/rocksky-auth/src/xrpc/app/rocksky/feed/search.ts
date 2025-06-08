import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const search = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.feed.search({
    handler: async ({ params }) => {
      const result = search(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve search results
  return [];
};

const presentation = (results) => {
  // Logic to format the search results for presentation
  return {
    results: [],
  };
};
