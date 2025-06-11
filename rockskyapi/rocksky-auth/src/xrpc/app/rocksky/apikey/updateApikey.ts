import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const updateApikey = (input) => pipe(input, update, presentation);
  server.app.rocksky.apikey.updateApikey({
    auth: ctx.authVerifier,
    handler: async ({ input }) => {
      const result = updateApikey(input);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const update = () => {
  // Logic to update the API key
  return {};
};

const presentation = () => {
  // Logic to format the updated API key for presentation
  return {};
};
