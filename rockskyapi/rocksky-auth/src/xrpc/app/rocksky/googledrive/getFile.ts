import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getFile = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.googledrive.getFile({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = getFile(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve the file from Google Drive
  return {};
};

const presentation = () => {
  // Logic to format the file for presentation
  return {};
};
