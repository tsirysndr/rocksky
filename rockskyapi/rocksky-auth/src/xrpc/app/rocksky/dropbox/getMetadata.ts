import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getMetadata = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.dropbox.getMetadata({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = getMetadata(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve metadata from Dropbox
  return {};
};

const presentation = (metadata) => {
  // Logic to format the metadata for presentation
  return {
    metadata: {},
  };
};
