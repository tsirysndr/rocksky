import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getTemporaryLink = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.dropbox.getTemporaryLink({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = getTemporaryLink(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  return {};
};

const presentation = () => {
  return {};
};
