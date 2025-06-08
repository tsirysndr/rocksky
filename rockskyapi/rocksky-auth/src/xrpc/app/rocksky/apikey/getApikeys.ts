import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getApikeys = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.apikey.getApikeys({
    handler: async ({ params }) => {
      const result = getApikeys(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve API keys
  return [];
};

const presentation = (apikeys) => {
  // Logic to format the API keys for presentation
  return {
    apikeys: [],
  };
};
