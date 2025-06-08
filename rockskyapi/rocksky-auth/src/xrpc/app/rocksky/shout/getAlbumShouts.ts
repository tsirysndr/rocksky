import { Context } from "context";
import { pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getAlbumShouts = (params) => pipe(params, retrieve, presentation);
  server.app.rocksky.shout.getAlbumShouts({
    handler: async ({ params }) => {
      const result = getAlbumShouts(params);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve album shouts
  return [];
};

const presentation = () => {
  // Logic to format the shouts for presentation
  return {
    shouts: [],
  };
};
