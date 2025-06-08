import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const removeApikey = (params) => pipe(params, remove, presentation);
  server.app.rocksky.apikey.removeApikey({
    handler: async ({ params }) => {
      const result = removeApikey(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const remove = () => {
  // Logic to remove the API key
  return {};
};

const presentation = () => {
  // Logic to format the response for presentation
  return {};
};
