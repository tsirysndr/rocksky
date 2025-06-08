import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getFiles = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.dropbox.getFiles({
    handler: async ({ params }) => {
      const result = getFiles(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve files from Dropbox
  return [];
};

const presentation = (files) => {
  // Logic to format the files for presentation
  return {};
};
