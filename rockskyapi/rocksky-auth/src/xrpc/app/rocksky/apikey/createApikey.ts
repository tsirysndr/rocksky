import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const createApikey = (input) => pipe(input, create, presentation);
  server.app.rocksky.apikey.createApikey({
    handler: async ({ input }) => {
      const result = createApikey(input);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const create = () => {
  // Logic to create an API key
  return {};
};

const presentation = () => {
  // Logic to format the API key for presentation
  return {};
};
